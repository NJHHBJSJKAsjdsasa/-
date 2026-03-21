import { WebSocketServer, WebSocket } from 'ws';
import { Server as HttpServer } from 'http';
import winston from 'winston';
import crypto from 'crypto';

// 动态导入 DHT（ESM 模块）
let DHT: any;

// DHT 消息类型
export enum DHT_MESSAGE_TYPES {
  PING = 'ping',
  PONG = 'pong',
  FIND_NODE = 'find_node',
  FOUND_NODE = 'found_node',
  GET_PEERS = 'get_peers',
  GOT_PEERS = 'got_peers',
  ANNOUNCE_PEER = 'announce_peer',
  ANNOUNCED = 'announced',
  ANNOUNCE_PLAYER = 'announce_player',
  PLAYER_ANNOUNCED = 'player_announced',
  GET_PLAYER = 'get_player',
  PLAYER_INFO = 'player_info',
  GET_ROUTING_TABLE = 'get_routing_table',
  ROUTING_TABLE = 'routing_table',
  ERROR = 'error',
  WELCOME = 'welcome'
}

// DHT 消息接口
export interface DHTMessage {
  type: DHT_MESSAGE_TYPES | string;
  requestId?: string;
  senderId?: string;
  [key: string]: any;
}

// Peer 信息
interface PeerInfo {
  nodeId: string;
  host: string;
  port: number;
  announcedAt: number;
}

// DHT 服务配置
export interface DHTServiceConfig {
  dhtPort?: number;
  wsPath?: string;
  bootstrap?: boolean;
  bootstrapNodes?: string[];
}

/**
 * DHT 服务类
 * 整合 BitTorrent DHT 和 WebSocket 服务
 */
export class DHTService {
  private dht: any;
  private wss?: WebSocketServer;
  private logger: winston.Logger;
  private config: DHTServiceConfig;
  private clients: Map<string, { ws: WebSocket; ip: string; connectedAt: number }> = new Map();
  
  // Peer 存储: infohash -> Set<PeerInfo>
  private peerStore: Map<string, Set<PeerInfo>> = new Map();
  
  // 自己宣布的 peers
  private ownAnnouncements: Map<string, { port: number; announcedAt: number }> = new Map();
  
  private stats = {
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

  constructor(logger: winston.Logger, config: DHTServiceConfig = {}) {
    this.logger = logger;
    this.config = {
      dhtPort: config.dhtPort || 0,
      wsPath: config.wsPath || '/dht',
      bootstrap: config.bootstrap || false,
      bootstrapNodes: config.bootstrapNodes || [
        'router.bittorrent.com:6881',
        'dht.transmissionbt.com:6881',
        'router.utorrent.com:6881'
      ]
    };
  }

  /**
   * 初始化 DHT 模块
   */
  private async initDHT(): Promise<void> {
    if (!DHT) {
      // 动态导入 ESM 模块
      const dhtModule = await import('bittorrent-dht');
      DHT = dhtModule.default;
    }

    // 创建 DHT 实例
    this.dht = new DHT({
      bootstrap: this.config.bootstrap ? [] : this.config.bootstrapNodes
    });

    this.setupDHTEventHandlers();
    this.startPeriodicTasks();
  }

  /**
   * 设置 DHT 事件处理器
   */
  private setupDHTEventHandlers(): void {
    this.dht.on('ready', () => {
      this.logger.info(`[DHT] Node ready, ID: ${this.dht.nodeId.toString('hex').substring(0, 16)}...`);
    });

    this.dht.on('node', (node: any) => {
      this.stats.nodes++;
      this.logger.debug(`[DHT] New node: ${node.host}:${node.port}`);
    });

    this.dht.on('announce', (peer: any, infoHash: Buffer) => {
      this.stats.peers++;
      const infohashHex = infoHash.toString('hex');
      
      // 存储 peer 信息
      if (!this.peerStore.has(infohashHex)) {
        this.peerStore.set(infohashHex, new Set());
      }
      
      this.peerStore.get(infohashHex)!.add({
        nodeId: peer.id ? peer.id.toString('hex') : '',
        host: peer.host,
        port: peer.port,
        announcedAt: Date.now()
      });
      
      this.logger.info(`[DHT] Peer announced: ${peer.host}:${peer.port} for infoHash: ${infohashHex.substring(0, 16)}...`);
    });

    this.dht.on('get_peers', (_infoHash: Buffer, peer: any) => {
      this.stats.queries.get_peers++;
      this.logger.debug(`[DHT] Get peers request from ${peer.address}:${peer.port}`);
    });

    this.dht.on('query', (query: any, peer: any) => {
      const queryType = query.q;
      if (queryType && this.stats.queries[queryType as keyof typeof this.stats.queries] !== undefined) {
        (this.stats.queries as Record<string, number>)[queryType]++;
      }
      this.logger.debug(`[DHT] Query ${queryType} from ${peer.address}:${peer.port}`);
    });

    this.dht.on('error', (err: Error) => {
      this.logger.error('[DHT] Error:', err.message);
    });
  }

  /**
   * 启动定期任务
   */
  private startPeriodicTasks(): void {
    // 每 15 分钟重新发布自己的 announcements
    setInterval(() => {
      this.republishAnnouncements();
    }, 15 * 60 * 1000);

    // 每小时清理过期的 peers
    setInterval(() => {
      this.cleanupExpiredPeers();
    }, 60 * 60 * 1000);
  }

  /**
   * 重新发布 announcements
   */
  private async republishAnnouncements(): Promise<void> {
    for (const [infohash, announcement] of this.ownAnnouncements) {
      if (Date.now() - announcement.announcedAt > 14 * 60 * 1000) { // 14 分钟
        try {
          await this.announcePeerToDHT(infohash, announcement.port);
          announcement.announcedAt = Date.now();
          this.logger.debug(`[DHT] Republished: ${infohash.substring(0, 16)}...`);
        } catch (error) {
          this.logger.error('[DHT] Republish failed:', error);
        }
      }
    }
  }

  /**
   * 清理过期的 peers
   */
  private cleanupExpiredPeers(): void {
    const now = Date.now();
    const maxAge = 2 * 60 * 60 * 1000; // 2 小时

    for (const [infohash, peers] of this.peerStore) {
      for (const peer of peers) {
        if (now - peer.announcedAt > maxAge) {
          peers.delete(peer);
        }
      }
      
      if (peers.size === 0) {
        this.peerStore.delete(infohash);
      }
    }
  }

  /**
   * 向 DHT 宣布 peer
   */
  private async announcePeerToDHT(infohash: string, port: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const infoHashBuffer = Buffer.from(infohash, 'hex');
      this.dht.announce(infoHashBuffer, port, (err: Error | null) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }

  /**
   * 启动 DHT 服务
   */
  public async start(): Promise<void> {
    // 先初始化 DHT 模块
    await this.initDHT();

    return new Promise((resolve, reject) => {
      this.dht.listen(this.config.dhtPort!, (err: Error | null) => {
        if (err) {
          this.logger.error('[DHT] Failed to start:', err.message);
          reject(err);
        } else {
          const port = this.dht.address().port;
          this.logger.info(`[DHT] Listening on UDP port: ${port}`);
          resolve();
        }
      });
    });
  }

  /**
   * 附加 WebSocket 服务器到现有的 HTTP 服务器
   */
  public attachToHttpServer(httpServer: HttpServer): void {
    // 使用 noServer 模式，手动处理 upgrade 请求
    this.wss = new WebSocketServer({
      noServer: true
    });

    // 监听 HTTP 服务器的 upgrade 事件
    httpServer.on('upgrade', (request, socket, head) => {
      const pathname = request.url?.split('?')[0];
      
      if (pathname === this.config.wsPath) {
        this.wss!.handleUpgrade(request, socket, head, (ws) => {
          this.wss!.emit('connection', ws, request);
        });
      }
      // 如果不是 /dht 路径，让其他处理器处理（如 Socket.io）
    });

    this.wss.on('connection', (ws, req) => {
      const clientIp = req.socket.remoteAddress || 'unknown';
      const clientId = this.generateClientId();
      
      this.logger.info(`[DHT-WS] New connection from ${clientIp}, ID: ${clientId}`);
      
      this.clients.set(clientId, { ws, ip: clientIp, connectedAt: Date.now() });
      this.stats.wsClients = this.clients.size;

      // 发送欢迎消息
      this.sendMessage(ws, {
        type: DHT_MESSAGE_TYPES.WELCOME,
        senderId: this.dht.nodeId.toString('hex'),
        timestamp: Date.now()
      });

      ws.on('message', (data) => {
        try {
          const message: DHTMessage = JSON.parse(data.toString());
          this.handleMessage(ws, message);
        } catch (error) {
          this.logger.error('[DHT-WS] Failed to parse message:', error);
          this.sendError(ws, 'Invalid message format');
        }
      });

      ws.on('close', () => {
        this.logger.info(`[DHT-WS] Client disconnected: ${clientId}`);
        this.clients.delete(clientId);
        this.stats.wsClients = this.clients.size;
      });

      ws.on('error', (error) => {
        this.logger.error('[DHT-WS] Error:', error);
      });
    });

    this.wss.on('error', (error) => {
      this.logger.error('[DHT-WS] Server error:', error);
    });

    this.logger.info(`[DHT-WS] WebSocket attached to path: ${this.config.wsPath}`);
  }

  /**
   * 处理 WebSocket 消息
   */
  private handleMessage(ws: WebSocket, message: DHTMessage): void {
    this.logger.debug(`[DHT-WS] Received: ${message.type}`);

    switch (message.type) {
      case DHT_MESSAGE_TYPES.PING:
        this.handlePing(ws, message);
        break;
      case DHT_MESSAGE_TYPES.FIND_NODE:
        this.handleFindNode(ws, message);
        break;
      case DHT_MESSAGE_TYPES.GET_PEERS:
        this.handleGetPeers(ws, message);
        break;
      case DHT_MESSAGE_TYPES.ANNOUNCE_PEER:
        this.handleAnnouncePeer(ws, message);
        break;
      case DHT_MESSAGE_TYPES.ANNOUNCE_PLAYER:
        this.handleAnnouncePlayer(ws, message);
        break;
      case DHT_MESSAGE_TYPES.GET_PLAYER:
        this.handleGetPlayer(ws, message);
        break;
      case DHT_MESSAGE_TYPES.GET_ROUTING_TABLE:
        this.handleGetRoutingTable(ws, message);
        break;
      default:
        this.logger.warn(`[DHT-WS] Unknown message type: ${message.type}`);
        this.sendError(ws, `Unknown message type: ${message.type}`);
    }
  }

  /**
   * 处理 ping
   */
  private handlePing(ws: WebSocket, message: DHTMessage): void {
    this.sendMessage(ws, {
      type: DHT_MESSAGE_TYPES.PONG,
      requestId: message.requestId,
      senderId: this.dht.nodeId.toString('hex'),
      timestamp: Date.now()
    });
  }

  /**
   * 处理 find_node
   */
  private handleFindNode(ws: WebSocket, message: DHTMessage): void {
    if (!message.targetId) {
      this.sendError(ws, 'Missing targetId');
      return;
    }

    try {
      const targetId = Buffer.from(message.targetId, 'hex');
      const closest = this.dht.nodes.closest(targetId, 8);

      this.sendMessage(ws, {
        type: DHT_MESSAGE_TYPES.FOUND_NODE,
        requestId: message.requestId,
        senderId: this.dht.nodeId.toString('hex'),
        nodes: closest.map((node: any) => ({
          id: node.id.toString('hex'),
          host: node.host,
          port: node.port
        }))
      });
    } catch (error) {
      this.logger.error('[DHT-WS] Find node error:', error);
      this.sendError(ws, 'Failed to find nodes');
    }
  }

  /**
   * 处理 get_peers
   */
  private handleGetPeers(ws: WebSocket, message: DHTMessage): void {
    if (!message.infohash) {
      this.sendError(ws, 'Missing infohash');
      return;
    }

    try {
      const infohash = message.infohash.toLowerCase();
      const peers = this.peerStore.get(infohash);
      
      // 如果本地有 peers，直接返回
      if (peers && peers.size > 0) {
        this.sendMessage(ws, {
          type: DHT_MESSAGE_TYPES.GOT_PEERS,
          requestId: message.requestId,
          senderId: this.dht.nodeId.toString('hex'),
          infohash: infohash,
          peers: Array.from(peers).slice(0, 50).map(p => ({
            host: p.host,
            port: p.port
          })),
          values: true
        });
        return;
      }

      // 否则通过 DHT 查询
      const infoHashBuffer = Buffer.from(infohash, 'hex');
      
      this.dht.lookup(infoHashBuffer, (err: Error | null, peersFromDHT: any[]) => {
        if (err) {
          this.logger.error('[DHT-WS] Lookup error:', err);
          this.sendError(ws, 'Failed to get peers');
          return;
        }

        this.sendMessage(ws, {
          type: DHT_MESSAGE_TYPES.GOT_PEERS,
          requestId: message.requestId,
          senderId: this.dht.nodeId.toString('hex'),
          infohash: infohash,
          peers: peersFromDHT.map((p: any) => ({
            host: p.host,
            port: p.port
          })),
          values: peersFromDHT.length > 0
        });
      });
    } catch (error) {
      this.logger.error('[DHT-WS] Get peers error:', error);
      this.sendError(ws, 'Failed to get peers');
    }
  }

  /**
   * 处理 announce_peer
   */
  private async handleAnnouncePeer(ws: WebSocket, message: DHTMessage): Promise<void> {
    if (!message.infohash || !message.port) {
      this.sendError(ws, 'Missing infohash or port');
      return;
    }

    try {
      const infohash = message.infohash.toLowerCase();
      const port = message.port;
      const publicKey = message.publicKey;

      // 存储到本地
      if (!this.peerStore.has(infohash)) {
        this.peerStore.set(infohash, new Set());
      }
      
      this.peerStore.get(infohash)!.add({
        nodeId: publicKey || '',
        host: 'unknown', // WebSocket 客户端没有直接 IP
        port: port,
        announcedAt: Date.now()
      });

      // 记录为自己的 announcement
      this.ownAnnouncements.set(infohash, {
        port: port,
        announcedAt: Date.now()
      });

      // 向 DHT 宣布
      await this.announcePeerToDHT(infohash, port);

      this.sendMessage(ws, {
        type: DHT_MESSAGE_TYPES.ANNOUNCED,
        requestId: message.requestId,
        senderId: this.dht.nodeId.toString('hex')
      });
      
      this.logger.info(`[DHT-WS] Peer announced: ${infohash.substring(0, 16)}... on port ${port}`);
    } catch (error) {
      this.logger.error('[DHT-WS] Announce error:', error);
      this.sendError(ws, 'Failed to announce peer');
    }
  }

  /**
   * 处理 get_routing_table
   */
  private handleGetRoutingTable(ws: WebSocket, message: DHTMessage): void {
    try {
      const nodes = this.dht.nodes ? this.dht.nodes.toArray() : [];

      this.sendMessage(ws, {
        type: DHT_MESSAGE_TYPES.ROUTING_TABLE,
        requestId: message.requestId,
        senderId: this.dht.nodeId.toString('hex'),
        nodes: nodes.map((node: any) => ({
          id: node.id.toString('hex'),
          host: node.host,
          port: node.port
        })),
        count: nodes.length
      });
    } catch (error) {
      this.logger.error('[DHT-WS] Get routing table error:', error);
      this.sendError(ws, 'Failed to get routing table');
    }
  }

  // 玩家信息存储
  private playerStore: Map<string, any> = new Map();

  /**
   * 处理 announce_player
   */
  private handleAnnouncePlayer(ws: WebSocket, message: DHTMessage): void {
    if (!message.playerInfo || !message.playerInfo.id) {
      this.sendError(ws, 'Missing playerInfo or playerInfo.id');
      return;
    }

    try {
      const playerInfo = message.playerInfo;
      
      // 存储玩家信息
      this.playerStore.set(playerInfo.id, {
        ...playerInfo,
        announcedAt: Date.now()
      });

      this.sendMessage(ws, {
        type: DHT_MESSAGE_TYPES.PLAYER_ANNOUNCED,
        requestId: message.requestId,
        senderId: this.dht.nodeId.toString('hex'),
        timestamp: Date.now()
      });
      
      this.logger.info(`[DHT-WS] Player announced: ${playerInfo.id.substring(0, 16)}...`);
    } catch (error) {
      this.logger.error('[DHT-WS] Announce player error:', error);
      this.sendError(ws, 'Failed to announce player');
    }
  }

  /**
   * 处理 get_player
   */
  private handleGetPlayer(ws: WebSocket, message: DHTMessage): void {
    if (!message.playerId) {
      this.sendError(ws, 'Missing playerId');
      return;
    }

    try {
      const playerInfo = this.playerStore.get(message.playerId);

      this.sendMessage(ws, {
        type: DHT_MESSAGE_TYPES.PLAYER_INFO,
        requestId: message.requestId,
        senderId: this.dht.nodeId.toString('hex'),
        playerInfo: playerInfo || null
      });
    } catch (error) {
      this.logger.error('[DHT-WS] Get player error:', error);
      this.sendError(ws, 'Failed to get player');
    }
  }

  /**
   * 发送消息
   */
  private sendMessage(ws: WebSocket, message: DHTMessage): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    }
  }

  /**
   * 发送错误
   */
  private sendError(ws: WebSocket, error: string): void {
    this.sendMessage(ws, {
      type: DHT_MESSAGE_TYPES.ERROR,
      error,
      timestamp: Date.now()
    });
  }

  /**
   * 生成客户端 ID
   */
  private generateClientId(): string {
    return crypto.randomBytes(8).toString('hex');
  }

  /**
   * 获取 DHT 状态
   */
  public getStatus(): object {
    return {
      ready: this.dht ? this.dht.ready : false,
      nodeId: this.dht && this.dht.nodeId ? this.dht.nodeId.toString('hex') : null,
      address: this.dht ? this.dht.address() : null,
      nodes: this.dht && this.dht.nodes ? this.dht.nodes.toArray().length : 0,
      wsClients: this.clients.size,
      peerStoreSize: this.peerStore.size,
      stats: this.stats
    };
  }

  /**
   * 销毁服务
   */
  public destroy(): void {
    if (this.wss) {
      this.wss.close();
    }
    if (this.dht) {
      this.dht.destroy();
    }
  }
}
