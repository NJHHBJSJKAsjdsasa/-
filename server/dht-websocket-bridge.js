/**
 * DHT WebSocket Bridge Server
 * 
 * 将浏览器的 WebSocket 连接桥接到 DHT UDP 网络
 * 允许浏览器客户端通过 WebSocket 参与 DHT 网络
 */

import { WebSocketServer } from 'ws';
import DHT from 'bittorrent-dht';
import crypto from 'crypto';
import http from 'http';

// 配置参数
const CONFIG = {
  // WebSocket 监听端口
  WS_PORT: process.env.DHT_WS_PORT || 7070,
  // DHT UDP 端口（内部使用）
  DHT_PORT: process.env.DHT_PORT || 7071,
  // 是否作为纯引导节点
  BOOTSTRAP: process.env.DHT_BOOTSTRAP === 'true' || false,
  // 外部 DHT 引导节点
  BOOTSTRAP_NODES: [
    'router.bittorrent.com:6881',
    'dht.transmissionbt.com:6881',
    'router.utorrent.com:6881'
  ],
  // 日志级别
  LOG_LEVEL: process.env.DHT_LOG_LEVEL || 'info'
};

// 日志工具
const logger = {
  debug: (...args) => CONFIG.LOG_LEVEL === 'debug' && console.log(`[${new Date().toISOString()}] [DEBUG]`, ...args),
  info: (...args) => ['debug', 'info'].includes(CONFIG.LOG_LEVEL) && console.log(`[${new Date().toISOString()}] [INFO]`, ...args),
  warn: (...args) => ['debug', 'info', 'warn'].includes(CONFIG.LOG_LEVEL) && console.warn(`[${new Date().toISOString()}] [WARN]`, ...args),
  error: (...args) => console.error(`[${new Date().toISOString()}] [ERROR]`, ...args)
};

// 存储客户端连接
const clients = new Map(); // nodeId -> { ws, nodeId, publicKey, lastSeen }

// DHT 实例
let dht = null;

/**
 * 创建 DHT 节点
 */
async function createDHTNode() {
  logger.info('========================================');
  logger.info('  DHT WebSocket Bridge Server');
  logger.info('========================================');
  logger.info(`WebSocket Port: ${CONFIG.WS_PORT}`);
  logger.info(`DHT UDP Port: ${CONFIG.DHT_PORT}`);
  logger.info(`Bootstrap Mode: ${CONFIG.BOOTSTRAP}`);
  logger.info('----------------------------------------');

  // 创建 DHT 实例
  dht = new DHT({
    bootstrap: CONFIG.BOOTSTRAP ? [] : CONFIG.BOOTSTRAP_NODES
  });

  // DHT 事件监听
  dht.on('ready', () => {
    logger.info('DHT node is ready');
    logger.info(`DHT Node ID: ${dht.nodeId.toString('hex')}`);
    logger.info(`DHT Listening on UDP port: ${CONFIG.DHT_PORT}`);
  });

  dht.on('node', (node) => {
    logger.debug('New DHT node:', `${node.host}:${node.port}`);
  });

  dht.on('announce', (peer, infoHash) => {
    logger.info(`Peer announced: ${peer.host}:${peer.port}`);
  });

  dht.on('error', (err) => {
    logger.error('DHT error:', err.message);
  });

  // 启动 DHT
  await new Promise((resolve, reject) => {
    dht.listen(CONFIG.DHT_PORT, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });

  logger.info('DHT node started successfully');
  return dht;
}

/**
 * 创建 WebSocket 服务器
 */
function createWebSocketServer() {
  const server = http.createServer((req, res) => {
    // 处理 CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    if (req.method === 'OPTIONS') {
      res.writeHead(200);
      res.end();
      return;
    }

    // 健康检查端点
    if (req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        status: 'ok',
        dhtReady: dht && dht.ready,
        clients: clients.size,
        timestamp: Date.now()
      }));
      return;
    }

    res.writeHead(404);
    res.end('Not Found');
  });

  const wss = new WebSocketServer({ 
    server,
    path: '/dht'
  });

  wss.on('connection', (ws, req) => {
    const clientIp = req.socket.remoteAddress;
    logger.info(`New WebSocket connection from ${clientIp}`);

    const client = {
      ws,
      nodeId: null,
      publicKey: null,
      lastSeen: Date.now(),
      ip: clientIp
    };

    ws.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString());
        handleClientMessage(client, message);
      } catch (error) {
        logger.error('Failed to parse message:', error.message);
        sendError(ws, 'Invalid message format');
      }
    });

    ws.on('close', () => {
      logger.info(`Client disconnected: ${client.nodeId?.substring(0, 16) || 'unknown'}`);
      if (client.nodeId) {
        clients.delete(client.nodeId);
      }
    });

    ws.on('error', (error) => {
      logger.error('WebSocket error:', error.message);
    });

    // 发送欢迎消息
    sendMessage(ws, {
      type: 'welcome',
      senderId: dht.nodeId.toString('hex'),
      timestamp: Date.now()
    });
  });

  wss.on('error', (error) => {
    logger.error('WebSocket server error:', error.message);
  });

  server.listen(CONFIG.WS_PORT, () => {
    logger.info(`WebSocket server listening on port ${CONFIG.WS_PORT}`);
    logger.info(`WebSocket path: /dht`);
    logger.info(`Health check: http://localhost:${CONFIG.WS_PORT}/health`);
  });

  return { server, wss };
}

/**
 * 处理客户端消息
 */
function handleClientMessage(client, message) {
  client.lastSeen = Date.now();

  switch (message.type) {
    case 'ping':
      handlePing(client, message);
      break;
    case 'find_node':
      handleFindNode(client, message);
      break;
    case 'get_peers':
      handleGetPeers(client, message);
      break;
    case 'announce_peer':
      handleAnnouncePeer(client, message);
      break;
    case 'announce_player':
      handleAnnouncePlayer(client, message);
      break;
    case 'get_player':
      handleGetPlayer(client, message);
      break;
    case 'offer':
    case 'answer':
    case 'ice_candidate':
      handleSignalingMessage(client, message);
      break;
    default:
      // 广播给其他客户端
      broadcastToClients(message, client.nodeId);
  }
}

/**
 * 处理 ping
 */
function handlePing(client, message) {
  // 注册客户端
  if (message.senderId && !client.nodeId) {
    client.nodeId = message.senderId;
    client.publicKey = message.publicKey;
    clients.set(message.senderId, client);
    logger.info(`Client registered: ${message.senderId.substring(0, 16)}...`);
  }

  sendMessage(client.ws, {
    type: 'pong',
    requestId: message.requestId,
    senderId: dht.nodeId.toString('hex'),
    timestamp: Date.now()
  });
}

/**
 * 处理 find_node
 */
function handleFindNode(client, message) {
  const targetId = Buffer.from(message.targetId, 'hex');
  
  // 从 DHT 路由表查找最近的节点
  const closest = dht.nodes.closest(targetId, 8);
  
  sendMessage(client.ws, {
    type: 'found_node',
    requestId: message.requestId,
    senderId: dht.nodeId.toString('hex'),
    nodes: closest.map(node => ({
      id: node.id.toString('hex'),
      host: node.host,
      port: node.port
    }))
  });
}

/**
 * 处理 get_peers
 */
function handleGetPeers(client, message) {
  const infohash = message.infohash;
  
  // 从 DHT 获取 peers
  dht.lookup(infohash, (err, peers) => {
    if (err) {
      sendError(client.ws, 'Lookup failed');
      return;
    }

    sendMessage(client.ws, {
      type: 'got_peers',
      requestId: message.requestId,
      senderId: dht.nodeId.toString('hex'),
      infohash,
      peers: peers.map(p => ({ host: p.host, port: p.port })),
      values: peers.length > 0
    });
  });
}

/**
 * 处理 announce_peer
 */
function handleAnnouncePeer(client, message) {
  const { infohash, port } = message;
  
  // 在 DHT 中宣布
  dht.announce(infohash, port, (err) => {
    if (err) {
      sendError(client.ws, 'Announce failed');
      return;
    }

    sendMessage(client.ws, {
      type: 'announced',
      requestId: message.requestId,
      senderId: dht.nodeId.toString('hex')
    });
  });
}

// 玩家信息存储（内存中）
const playerStore = new Map();

/**
 * 处理 announce_player
 */
function handleAnnouncePlayer(client, message) {
  const { playerInfo } = message;
  
  if (playerInfo && playerInfo.id) {
    playerStore.set(playerInfo.id, {
      ...playerInfo,
      announcedAt: Date.now()
    });
    
    logger.info(`Player announced: ${playerInfo.name || playerInfo.id.substring(0, 16)}...`);
    
    // 广播给其他客户端
    broadcastToClients({
      type: 'player_info',
      playerInfo
    }, client.nodeId);
  }

  sendMessage(client.ws, {
    type: 'player_announced',
    requestId: message.requestId,
    senderId: dht.nodeId.toString('hex')
  });
}

/**
 * 处理 get_player
 */
function handleGetPlayer(client, message) {
  const playerInfo = playerStore.get(message.playerId);
  
  sendMessage(client.ws, {
    type: 'player_info',
    requestId: message.requestId,
    senderId: dht.nodeId.toString('hex'),
    playerInfo
  });
}

/**
 * 处理 WebRTC 信令消息
 */
function handleSignalingMessage(client, message) {
  const { targetPlayerId } = message;
  
  if (!targetPlayerId) {
    sendError(client.ws, 'Missing targetPlayerId');
    return;
  }

  // 查找目标客户端
  const targetClient = clients.get(targetPlayerId);
  
  if (targetClient && targetClient.ws.readyState === 1) {
    // 转发给目标客户端
    sendMessage(targetClient.ws, {
      ...message,
      fromId: client.nodeId,
      fromPublicKey: client.publicKey
    });
    
    logger.debug(`Signaling message forwarded: ${message.type}`);
  } else {
    // 目标不在线，存储或转发给 DHT
    logger.debug(`Target not found, broadcasting: ${targetPlayerId.substring(0, 16)}...`);
    broadcastToClients(message, client.nodeId);
  }
}

/**
 * 广播消息给所有客户端
 */
function broadcastToClients(message, excludeNodeId = null) {
  let sent = 0;
  
  for (const [nodeId, client] of clients) {
    if (nodeId !== excludeNodeId && client.ws.readyState === 1) {
      sendMessage(client.ws, message);
      sent++;
    }
  }
  
  return sent;
}

/**
 * 发送消息给客户端
 */
function sendMessage(ws, message) {
  if (ws.readyState === 1) {
    ws.send(JSON.stringify(message));
    return true;
  }
  return false;
}

/**
 * 发送错误消息
 */
function sendError(ws, error) {
  sendMessage(ws, {
    type: 'error',
    error,
    timestamp: Date.now()
  });
}

/**
 * 清理不活跃的客户端
 */
function startCleanupTimer() {
  setInterval(() => {
    const now = Date.now();
    const timeout = 5 * 60 * 1000; // 5 分钟
    
    for (const [nodeId, client] of clients) {
      if (now - client.lastSeen > timeout) {
        logger.info(`Removing inactive client: ${nodeId.substring(0, 16)}...`);
        client.ws.close();
        clients.delete(nodeId);
      }
    }
    
    // 清理过期的玩家信息
    for (const [playerId, playerInfo] of playerStore) {
      if (now - playerInfo.announcedAt > 60 * 60 * 1000) { // 1 小时
        playerStore.delete(playerId);
      }
    }
  }, 60 * 1000); // 每分钟检查一次
}

/**
 * 主函数
 */
async function main() {
  try {
    // 创建 DHT 节点
    await createDHTNode();
    
    // 创建 WebSocket 服务器
    createWebSocketServer();
    
    // 启动清理定时器
    startCleanupTimer();
    
    logger.info('========================================');
    logger.info('  DHT WebSocket Bridge is running!');
    logger.info('========================================');
  } catch (err) {
    logger.error('Fatal error:', err);
    process.exit(1);
  }
}

// 优雅关闭
process.on('SIGINT', () => {
  logger.info('\nReceived SIGINT, shutting down gracefully...');
  if (dht) {
    dht.destroy(() => {
      logger.info('DHT node destroyed');
      process.exit(0);
    });
  } else {
    process.exit(0);
  }
});

process.on('SIGTERM', () => {
  logger.info('\nReceived SIGTERM, shutting down gracefully...');
  if (dht) {
    dht.destroy(() => {
      logger.info('DHT node destroyed');
      process.exit(0);
    });
  } else {
    process.exit(0);
  }
});

// 运行
main();
