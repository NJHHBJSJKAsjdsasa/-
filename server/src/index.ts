import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import winston from 'winston';
import { SignalingServer } from './signaling/SignalingServer.js';
import { RegisterMessage, HeartbeatMessage, NodeListMessage } from './signaling/types.js';
import { DHTService } from './dht/DHTService.js';

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.printf(({ timestamp, level, message }) => {
      return `[${timestamp}] ${level.toUpperCase()}: ${message}`;
    })
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: 'logs/server.log' })
  ]
});

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 5050;
const HOST = process.env.HOST || 'localhost';
const serverAddress = `http://${HOST}:${PORT}`;

// 创建信令服务器
const signalingServer = new SignalingServer(io, logger, serverAddress);

// 创建 DHT 服务
const dhtService = new DHTService(logger, {
  dhtPort: 51235, // 固定 UDP 端口
  wsPath: '/dht',
  bootstrap: false
});

// 启动 DHT 服务
dhtService.start().then(() => {
  // 将 WebSocket 附加到 HTTP 服务器
  dhtService.attachToHttpServer(httpServer);
  logger.info('[DHT] Service integrated into signaling server');
}).catch(err => {
  logger.error('[DHT] Failed to start:', err);
});

app.get('/', (_req, res) => {
  res.json({ 
    message: 'P2P修仙游戏信令服务器运行中',
    features: ['signaling', 'dht-bootstrap'],
    dhtPath: '/dht'
  });
});

app.get('/health', (_req, res) => {
  const dhtStatus = dhtService.getStatus() as {
    ready: boolean;
    nodeId: string | null;
    nodes: number;
    wsClients: number;
  };
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    players: signalingServer.getPlayerCount(),
    rooms: signalingServer.getRoomCount(),
    nodeId: signalingServer.getNodeId(),
    dht: {
      ready: dhtStatus.ready,
      nodeId: dhtStatus.nodeId,
      nodes: dhtStatus.nodes,
      wsClients: dhtStatus.wsClients
    }
  });
});

// DHT 状态端点
app.get('/dht/status', (_req, res) => {
  res.json(dhtService.getStatus());
});

app.post('/register', async (req, res) => {
  try {
    const data: RegisterMessage = req.body;

    if (!data.address || typeof data.address !== 'string') {
      res.status(400).json({ success: false, error: '缺少address字段' });
      return;
    }

    const result = await signalingServer.handleRegister(data);

    if (result.success) {
      res.json({
        success: true,
        nodeId: result.nodeId,
        nodes: result.nodes,
        timestamp: Date.now()
      });
    } else {
      res.status(400).json({ success: false, error: '节点验证失败' });
    }
  } catch (error) {
    logger.error('处理注册请求失败', error);
    res.status(500).json({ success: false, error: '内部服务器错误' });
  }
});

app.post('/heartbeat', (req, res) => {
  try {
    const data: HeartbeatMessage = req.body;

    if (!data.nodeId || typeof data.nodeId !== 'string') {
      res.status(400).json({ success: false, error: '缺少nodeId字段' });
      return;
    }

    const success = signalingServer.handleHeartbeat(data);

    if (success) {
      res.json({ success: true, timestamp: Date.now() });
    } else {
      res.status(404).json({ success: false, error: '节点不存在' });
    }
  } catch (error) {
    logger.error('处理心跳请求失败', error);
    res.status(500).json({ success: false, error: '内部服务器错误' });
  }
});

app.get('/nodes', (_req, res) => {
  try {
    const nodeManager = signalingServer.getNodeManager();
    const nodes = nodeManager.getNodes('online');
    const message: NodeListMessage = {
      type: 'node-list',
      nodes,
      timestamp: Date.now()
    };
    res.json(message);
  } catch (error) {
    logger.error('获取节点列表失败', error);
    res.status(500).json({ error: '内部服务器错误' });
  }
});

app.post('/nodes/sync', (req, res) => {
  try {
    const data: NodeListMessage = req.body;

    if (!data.nodes || !Array.isArray(data.nodes)) {
      res.status(400).json({ success: false, error: '缺少nodes字段' });
      return;
    }

    signalingServer.handleNodeListSync(data);
    res.json({ success: true, timestamp: Date.now() });
  } catch (error) {
    logger.error('处理节点列表同步失败', error);
    res.status(500).json({ success: false, error: '内部服务器错误' });
  }
});

httpServer.listen(PORT, () => {
  logger.info(`========================================`);
  logger.info(`  P2P修仙游戏混合服务器`);
  logger.info(`========================================`);
  logger.info(`信令服务: ${serverAddress}`);
  logger.info(`DHT WebSocket: ws://${HOST}:${PORT}/dht`);
  logger.info(`健康检查: http://${HOST}:${PORT}/health`);
  logger.info(`========================================`);
});

// 优雅关闭
process.on('SIGINT', () => {
  logger.info('Shutting down gracefully...');
  dhtService.destroy();
  signalingServer.dispose();
  httpServer.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });
});

process.on('SIGTERM', () => {
  logger.info('Shutting down gracefully...');
  dhtService.destroy();
  signalingServer.dispose();
  httpServer.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });
});
