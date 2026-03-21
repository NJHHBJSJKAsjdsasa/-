/**
 * DHT Bootstrap Node Server
 * 
 * 基于 bittorrent-dht 库的 DHT 引导节点服务器
 * 同时支持 UDP 和 WebSocket 协议
 */

import DHT from 'bittorrent-dht';
import crypto from 'crypto';
import { WebSocketServer } from 'ws';
import http from 'http';

// 配置参数
const CONFIG = {
  // UDP 监听端口
  PORT: process.env.DHT_PORT || 7070,
  // WebSocket 监听端口
  WS_PORT: process.env.DHT_WS_PORT || 7070,
  // 是否作为引导节点（不连接其他引导节点）
  BOOTSTRAP: process.env.DHT_BOOTSTRAP === 'true' || false,
  // 外部引导节点列表（当 BOOTSTRAP 为 false 时使用）
  BOOTSTRAP_NODES: [
    'router.bittorrent.com:6881',
    'dht.transmissionbt.com:6881',
    'router.utorrent.com:6881'
  ],
  // 日志级别: debug, info, warn, error
  LOG_LEVEL: process.env.DHT_LOG_LEVEL || 'info'
};

// 日志工具
const logger = {
  debug: (...args) => CONFIG.LOG_LEVEL === 'debug' && console.log(`[${new Date().toISOString()}] [DEBUG]`, ...args),
  info: (...args) => ['debug', 'info'].includes(CONFIG.LOG_LEVEL) && console.log(`[${new Date().toISOString()}] [INFO]`, ...args),
  warn: (...args) => ['debug', 'info', 'warn'].includes(CONFIG.LOG_LEVEL) && console.warn(`[${new Date().toISOString()}] [WARN]`, ...args),
  error: (...args) => console.error(`[${new Date().toISOString()}] [ERROR]`, ...args)
};

// 生成节点 ID
function generateNodeId() {
  return crypto.randomBytes(20);
}

// 格式化节点信息
function formatNode(node) {
  return `${node.host}:${node.port} (${node.id ? node.id.toString('hex').substring(0, 16) + '...' : 'unknown'})`;
}

// 存储 WebSocket 客户端
const wsClients = new Map();

// 创建 DHT 引导节点
async function createBootstrapNode() {
  logger.info('========================================');
  logger.info('  DHT Bootstrap Node Server');
  logger.info('========================================');
  logger.info(`UDP Port: ${CONFIG.PORT}`);
  logger.info(`WebSocket Port: ${CONFIG.WS_PORT}`);
  logger.info(`Bootstrap Mode: ${CONFIG.BOOTSTRAP}`);
  logger.info(`Log Level: ${CONFIG.LOG_LEVEL}`);
  logger.info('----------------------------------------');

  // 创建 DHT 实例
  const dht = new DHT({
    // 如果是纯引导节点，不连接其他引导节点
    bootstrap: CONFIG.BOOTSTRAP ? [] : CONFIG.BOOTSTRAP_NODES
  });

  // 存储路由表统计信息
  const stats = {
    nodes: 0,
    peers: 0,
    wsClients: 0,
    queries: {
      ping: 0,
      find_node: 0,
      get_peers: 0,
      announce_peer: 0
    }
  };

  // 事件监听

  // 当 DHT 准备就绪时
  dht.on('ready', () => {
    logger.info('DHT node is ready');
    logger.info(`Node ID: ${dht.nodeId.toString('hex')}`);
    logger.info(`Listening on UDP port: ${CONFIG.PORT}`);
    
    // 打印路由表信息
    const nodes = dht.nodes.toArray();
    logger.info(`Routing table nodes: ${nodes.length}`);
    
    if (nodes.length > 0 && CONFIG.LOG_LEVEL === 'debug') {
      logger.debug('Known nodes:');
      nodes.slice(0, 5).forEach((node, i) => {
        logger.debug(`  ${i + 1}. ${formatNode(node)}`);
      });
      if (nodes.length > 5) {
        logger.debug(`  ... and ${nodes.length - 5} more`);
      }
    }
  });

  // 当节点被添加到路由表时
  dht.on('node', (node) => {
    stats.nodes++;
    logger.debug('New node added to routing table:', formatNode(node));
  });

  // 当收到 announce_peer 时
  dht.on('announce', (peer, infoHash) => {
    stats.peers++;
    logger.info(`Peer announced: ${peer.host}:${peer.port} for infoHash: ${infoHash.toString('hex').substring(0, 16)}...`);
  });

  // 当收到 get_peers 查询时
  dht.on('get_peers', (infoHash, peer) => {
    stats.queries.get_peers++;
    logger.debug(`Get peers request for infoHash: ${infoHash.toString('hex').substring(0, 16)}... from ${peer.host}:${peer.port}`);
  });

  // 监听 DHT 查询（底层协议消息）
  dht.on('query', (query, peer) => {
    const queryType = query.q;
    if (queryType && stats.queries[queryType] !== undefined) {
      stats.queries[queryType]++;
    }
    logger.debug(`Received ${queryType} query from ${peer.address}:${peer.port}`);
  });

  // 错误处理
  dht.on('error', (err) => {
    logger.error('DHT error:', err.message);
  });

  // 警告处理
  dht.on('warning', (err) => {
    logger.warn('DHT warning:', err.message);
  });

  // 启动 DHT 节点
  try {
    await new Promise((resolve, reject) => {
      dht.listen(CONFIG.PORT, (err) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
    
    logger.info('DHT bootstrap node started successfully');
  } catch (err) {
    logger.error('Failed to start DHT node:', err.message);
    process.exit(1);
  }

  // 启动 WebSocket 服务器
  try {
    await createWebSocketServer(dht, stats);
    logger.info('WebSocket server started successfully');
  } catch (err) {
    logger.error('Failed to start WebSocket server:', err.message);
    // WebSocket 失败不影响 DHT 服务
  }

  // 定期打印统计信息
  setInterval(() => {
    const nodes = dht.nodes ? dht.nodes.toArray().length : 0;
    logger.info(`[Stats] Nodes: ${nodes}, Peers: ${stats.peers}, WS Clients: ${stats.wsClients}, Queries: ping=${stats.queries.ping}, find_node=${stats.queries.find_node}, get_peers=${stats.queries.get_peers}, announce_peer=${stats.queries.announce_peer}`);
  }, 60000); // 每分钟打印一次

  // 优雅关闭处理
  process.on('SIGINT', () => {
    logger.info('\nReceived SIGINT, shutting down gracefully...');
    dht.destroy(() => {
      logger.info('DHT node destroyed');
      process.exit(0);
    });
  });

  process.on('SIGTERM', () => {
    logger.info('\nReceived SIGTERM, shutting down gracefully...');
    dht.destroy(() => {
      logger.info('DHT node destroyed');
      process.exit(0);
    });
  });

  return dht;
}

/**
 * 创建 WebSocket 服务器
 */
async function createWebSocketServer(dht, stats) {
  // 创建 HTTP 服务器（用于健康检查）
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
        dhtReady: dht.ready,
        nodeId: dht.nodeId ? dht.nodeId.toString('hex') : null,
        udpPort: CONFIG.PORT,
        wsPort: CONFIG.WS_PORT,
        wsClients: wsClients.size,
        timestamp: Date.now()
      }));
      return;
    }

    res.writeHead(404);
    res.end('Not Found');
  });

  // 创建 WebSocket 服务器
  const wss = new WebSocketServer({ 
    server,
    path: '/dht'
  });

  wss.on('connection', (ws, req) => {
    const clientIp = req.socket.remoteAddress;
    const clientId = generateClientId();
    logger.info(`New WebSocket connection from ${clientIp}, clientId: ${clientId}`);
    
    wsClients.set(clientId, { ws, ip: clientIp, connectedAt: Date.now() });
    stats.wsClients = wsClients.size;

    // 发送欢迎消息
    sendMessage(ws, {
      type: 'welcome',
      senderId: dht.nodeId ? dht.nodeId.toString('hex') : null,
      timestamp: Date.now()
    });

    ws.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString());
        handleWebSocketMessage(ws, message, dht, stats);
      } catch (error) {
        logger.error('Failed to parse WebSocket message:', error.message);
        sendError(ws, 'Invalid message format');
      }
    });

    ws.on('close', () => {
      logger.info(`WebSocket client disconnected: ${clientId}`);
      wsClients.delete(clientId);
      stats.wsClients = wsClients.size;
    });

    ws.on('error', (error) => {
      logger.error('WebSocket error:', error.message);
    });
  });

  wss.on('error', (error) => {
    logger.error('WebSocket server error:', error.message);
  });

  // 启动服务器
  await new Promise((resolve, reject) => {
    server.listen(CONFIG.WS_PORT, (err) => {
      if (err) {
        reject(err);
      } else {
        logger.info(`WebSocket server listening on port ${CONFIG.WS_PORT}`);
        logger.info(`WebSocket path: /dht`);
        logger.info(`Health check: http://localhost:${CONFIG.WS_PORT}/health`);
        resolve();
      }
    });
  });

  return { server, wss };
}

/**
 * 处理 WebSocket 消息
 */
function handleWebSocketMessage(ws, message, dht, stats) {
  logger.debug('Received WebSocket message:', message.type);

  switch (message.type) {
    case 'ping':
      handlePing(ws, message, dht);
      break;
    case 'find_node':
      handleFindNode(ws, message, dht);
      break;
    case 'get_peers':
      handleGetPeers(ws, message, dht);
      break;
    case 'announce_peer':
      handleAnnouncePeer(ws, message, dht);
      break;
    case 'get_routing_table':
      handleGetRoutingTable(ws, message, dht);
      break;
    default:
      logger.warn('Unknown message type:', message.type);
      sendError(ws, `Unknown message type: ${message.type}`);
  }
}

/**
 * 处理 ping 请求
 */
function handlePing(ws, message, dht) {
  sendMessage(ws, {
    type: 'pong',
    requestId: message.requestId,
    senderId: dht.nodeId ? dht.nodeId.toString('hex') : null,
    timestamp: Date.now()
  });
}

/**
 * 处理 find_node 请求
 */
function handleFindNode(ws, message, dht) {
  if (!message.targetId) {
    sendError(ws, 'Missing targetId');
    return;
  }

  try {
    const targetId = Buffer.from(message.targetId, 'hex');
    const closest = dht.nodes.closest(targetId, 8);
    
    sendMessage(ws, {
      type: 'found_node',
      requestId: message.requestId,
      senderId: dht.nodeId ? dht.nodeId.toString('hex') : null,
      nodes: closest.map(node => ({
        id: node.id.toString('hex'),
        host: node.host,
        port: node.port
      }))
    });
  } catch (error) {
    logger.error('Failed to handle find_node:', error.message);
    sendError(ws, 'Failed to find nodes');
  }
}

/**
 * 处理 get_peers 请求
 */
function handleGetPeers(ws, message, dht) {
  if (!message.infohash) {
    sendError(ws, 'Missing infohash');
    return;
  }

  try {
    const infohash = Buffer.from(message.infohash, 'hex');
    // 从 DHT 获取 peers（这里简化处理，实际应该查询 DHT 存储）
    
    sendMessage(ws, {
      type: 'got_peers',
      requestId: message.requestId,
      senderId: dht.nodeId ? dht.nodeId.toString('hex') : null,
      infohash: message.infohash,
      peers: [],
      values: false
    });
  } catch (error) {
    logger.error('Failed to handle get_peers:', error.message);
    sendError(ws, 'Failed to get peers');
  }
}

/**
 * 处理 announce_peer 请求
 */
function handleAnnouncePeer(ws, message, dht) {
  if (!message.infohash || !message.port) {
    sendError(ws, 'Missing infohash or port');
    return;
  }

  try {
    const infohash = Buffer.from(message.infohash, 'hex');
    // 这里简化处理，实际应该将信息存储到 DHT
    
    sendMessage(ws, {
      type: 'announced',
      requestId: message.requestId,
      senderId: dht.nodeId ? dht.nodeId.toString('hex') : null
    });
  } catch (error) {
    logger.error('Failed to handle announce_peer:', error.message);
    sendError(ws, 'Failed to announce peer');
  }
}

/**
 * 处理获取路由表请求
 */
function handleGetRoutingTable(ws, message, dht) {
  try {
    const nodes = dht.nodes ? dht.nodes.toArray() : [];
    
    sendMessage(ws, {
      type: 'routing_table',
      requestId: message.requestId,
      senderId: dht.nodeId ? dht.nodeId.toString('hex') : null,
      nodes: nodes.map(node => ({
        id: node.id.toString('hex'),
        host: node.host,
        port: node.port
      })),
      count: nodes.length
    });
  } catch (error) {
    logger.error('Failed to handle get_routing_table:', error.message);
    sendError(ws, 'Failed to get routing table');
  }
}

/**
 * 发送消息给客户端
 */
function sendMessage(ws, message) {
  if (ws.readyState === 1) { // WebSocket.OPEN
    ws.send(JSON.stringify(message));
  }
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
 * 生成客户端 ID
 */
function generateClientId() {
  return crypto.randomBytes(8).toString('hex');
}

// 主函数
async function main() {
  try {
    await createBootstrapNode();
    logger.info('========================================');
    logger.info('  DHT Bootstrap Node is running!');
    logger.info('========================================');
  } catch (err) {
    logger.error('Fatal error:', err);
    process.exit(1);
  }
}

// 运行
main();

export { createBootstrapNode, CONFIG };
