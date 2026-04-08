/**
 * DHT Manager - 浏览器端 DHT 客户端管理器
 * 使用 WebSocket 作为传输层（浏览器无法直接使用 UDP）
 * 实现 Kademlia DHT 协议：ping, find_node, get_peers, announce_peer
 * 支持角色等级同步和 P2P 节点发现
 */

// ========================================
// NodeID - 160位节点ID (Kademlia标准)
// ========================================

class NodeID {
  constructor(id) {
    if (typeof id === 'string') {
      // 从16进制字符串创建
      this.bytes = this.hexToBytes(id);
    } else if (id instanceof Uint8Array) {
      this.bytes = id;
    } else if (id === null || id === undefined) {
      // 生成随机ID
      this.bytes = this.generateRandomID();
    } else {
      throw new Error('Invalid NodeID constructor argument');
    }
    
    if (this.bytes.length !== 20) {
      throw new Error('NodeID must be 160 bits (20 bytes)');
    }
  }
  
  /**
   * 生成随机节点ID
   */
  generateRandomID() {
    const bytes = new Uint8Array(20);
    crypto.getRandomValues(bytes);
    return bytes;
  }
  
  /**
   * 从16进制字符串转换为字节数组
   */
  hexToBytes(hex) {
    const bytes = new Uint8Array(20);
    for (let i = 0; i < 20; i++) {
      bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
    }
    return bytes;
  }
  
  /**
   * 将字节数组转换为16进制字符串
   */
  toHex() {
    return Array.from(this.bytes)
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  }
  
  /**
   * 计算与另一个NodeID的XOR距离
   */
  distance(other) {
    if (!(other instanceof NodeID)) {
      other = new NodeID(other);
    }
    
    const distance = new Uint8Array(20);
    for (let i = 0; i < 20; i++) {
      distance[i] = this.bytes[i] ^ other.bytes[i];
    }
    return new NodeID(distance);
  }
  
  /**
   * 计算距离的前导零位数（用于确定bucket索引）
   */
  leadingZeros() {
    let zeros = 0;
    for (let i = 0; i < 20; i++) {
      if (this.bytes[i] === 0) {
        zeros += 8;
      } else {
        for (let j = 7; j >= 0; j--) {
          if ((this.bytes[i] >> j) & 1) {
            return zeros;
          }
          zeros++;
        }
      }
    }
    return zeros;
  }
  
  /**
   * 比较两个NodeID是否相等
   */
  equals(other) {
    if (!(other instanceof NodeID)) {
      other = new NodeID(other);
    }
    
    for (let i = 0; i < 20; i++) {
      if (this.bytes[i] !== other.bytes[i]) {
        return false;
      }
    }
    return true;
  }
  
  /**
   * 比较距离（用于排序）
   */
  compare(other) {
    if (!(other instanceof NodeID)) {
      other = new NodeID(other);
    }
    
    for (let i = 0; i < 20; i++) {
      if (this.bytes[i] < other.bytes[i]) return -1;
      if (this.bytes[i] > other.bytes[i]) return 1;
    }
    return 0;
  }
  
  /**
   * 从公钥生成节点ID（确定性）
   */
  static fromPublicKey(publicKeyBase64) {
    if (!publicKeyBase64 || typeof publicKeyBase64 !== 'string') {
      throw new Error('Invalid publicKeyBase64: ' + typeof publicKeyBase64);
    }
    // 使用公钥的前20字节作为节点ID
    try {
      const binary = atob(publicKeyBase64);
      const bytes = new Uint8Array(20);
      for (let i = 0; i < 20 && i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }
      return new NodeID(bytes);
    } catch (error) {
      throw new Error('Failed to create NodeID from publicKey: ' + error.message);
    }
  }
  
  toString() {
    return this.toHex();
  }
}

// ========================================
// KBucket - Kademlia路由桶
// ========================================

class KBucket {
  constructor(k = 8) {
    this.k = k;
    this.nodes = [];
    this.lastUpdated = Date.now();
  }
  
  /**
   * 添加节点到bucket
   */
  add(node) {
    const existingIndex = this.nodes.findIndex(n => n.id.equals(node.id));
    
    if (existingIndex !== -1) {
      // 节点已存在，移到末尾（最近使用）
      const existing = this.nodes.splice(existingIndex, 1)[0];
      existing.lastSeen = Date.now();
      existing.address = node.address || existing.address;
      this.nodes.push(existing);
      return { added: false, evicted: null, updated: true };
    }
    
    if (this.nodes.length < this.k) {
      // bucket未满，直接添加
      node.lastSeen = Date.now();
      this.nodes.push(node);
      this.lastUpdated = Date.now();
      return { added: true, evicted: null };
    }
    
    // bucket已满，检查最老的节点是否失效
    const oldest = this.nodes[0];
    const age = Date.now() - oldest.lastSeen;
    
    if (age > 15 * 60 * 1000) { // 15分钟未响应
      // 替换最老的节点
      this.nodes.shift();
      node.lastSeen = Date.now();
      this.nodes.push(node);
      this.lastUpdated = Date.now();
      return { added: true, evicted: oldest };
    }
    
    return { added: false, evicted: null, full: true };
  }
  
  /**
   * 从bucket移除节点
   */
  remove(nodeId) {
    const index = this.nodes.findIndex(n => n.id.equals(nodeId));
    if (index !== -1) {
      this.nodes.splice(index, 1);
      this.lastUpdated = Date.now();
      return true;
    }
    return false;
  }
  
  /**
   * 获取bucket中的所有节点
   */
  getNodes() {
    return [...this.nodes];
  }
  
  /**
   * 检查bucket是否已满
   */
  isFull() {
    return this.nodes.length >= this.k;
  }
  
  /**
   * 检查bucket是否为空
   */
  isEmpty() {
    return this.nodes.length === 0;
  }
  
  /**
   * 获取节点数量
   */
  size() {
    return this.nodes.length;
  }
}

// ========================================
// RoutingTable - Kademlia路由表
// ========================================

class RoutingTable {
  constructor(localNodeId, k = 8) {
    this.localNodeId = localNodeId instanceof NodeID ? localNodeId : new NodeID(localNodeId);
    this.k = k;
    this.buckets = new Array(160).fill(null).map(() => new KBucket(k));
  }
  
  /**
   * 计算节点应该放入哪个bucket
   */
  getBucketIndex(nodeId) {
    const distance = this.localNodeId.distance(nodeId);
    const zeros = distance.leadingZeros();
    return Math.min(zeros, 159);
  }
  
  /**
   * 添加节点到路由表
   */
  addNode(node) {
    if (node.id.equals(this.localNodeId)) {
      return { added: false, reason: 'self' };
    }
    
    const bucketIndex = this.getBucketIndex(node.id);
    const bucket = this.buckets[bucketIndex];
    
    return bucket.add(node);
  }
  
  /**
   * 从路由表移除节点
   */
  removeNode(nodeId) {
    const bucketIndex = this.getBucketIndex(nodeId);
    const bucket = this.buckets[bucketIndex];
    return bucket.remove(nodeId);
  }
  
  /**
   * 查找距离目标最近的K个节点
   */
  findClosest(targetId, count = this.k) {
    const target = targetId instanceof NodeID ? targetId : new NodeID(targetId);
    const allNodes = [];
    
    // 收集所有节点
    for (const bucket of this.buckets) {
      allNodes.push(...bucket.getNodes());
    }
    
    // 按距离排序
    allNodes.sort((a, b) => {
      const distA = target.distance(a.id);
      const distB = target.distance(b.id);
      return distA.compare(distB);
    });
    
    return allNodes.slice(0, count);
  }
  
  /**
   * 获取路由表统计信息
   */
  getStats() {
    let totalNodes = 0;
    let nonEmptyBuckets = 0;
    
    for (const bucket of this.buckets) {
      const size = bucket.size();
      if (size > 0) {
        totalNodes += size;
        nonEmptyBuckets++;
      }
    }
    
    return {
      totalNodes,
      nonEmptyBuckets,
      totalBuckets: 160
    };
  }
  
  /**
   * 获取所有节点
   */
  getAllNodes() {
    const allNodes = [];
    for (const bucket of this.buckets) {
      allNodes.push(...bucket.getNodes());
    }
    return allNodes;
  }
}

// ========================================
// DHT 消息类型定义 (BEP-5 标准)
// ========================================

const DHT_MESSAGE_TYPES = {
  // 基础消息
  PING: 'ping',
  PONG: 'pong',
  
  // 节点发现
  FIND_NODE: 'find_node',
  FOUND_NODE: 'found_node',
  
  // Peer发现 (用于BitTorrent)
  GET_PEERS: 'get_peers',
  GOT_PEERS: 'got_peers',
  ANNOUNCE_PEER: 'announce_peer',
  ANNOUNCED: 'announced',
  
  // 玩家信息 (游戏扩展)
  GET_PLAYER: 'get_player',
  PLAYER_INFO: 'player_info',
  ANNOUNCE_PLAYER: 'announce_player',
  
  // WebRTC信令 (游戏扩展)
  OFFER: 'offer',
  ANSWER: 'answer',
  ICE_CANDIDATE: 'ice_candidate',
  
  // 错误
  ERROR: 'error'
};

// ========================================
// DHTManager - 浏览器端 DHT 管理器
// ========================================

class DHTManager extends EventTarget {
  constructor(config = {}) {
    super();
    
    this.config = {
      // Bootstrap节点配置
      bootstrapNodes: config.bootstrapNodes || [
        // 北美节点
        { url: 'ws://us-bootstrap.p2p修仙游戏.com:5050/dht', nodeId: null },
        // 欧洲节点
        { url: 'ws://eu-bootstrap.p2p修仙游戏.com:5050/dht', nodeId: null },
        // 亚洲节点
        { url: 'ws://asia-bootstrap.p2p修仙游戏.com:5050/dht', nodeId: null },
        // 备用节点
        { url: 'ws://49.232.170.26:5050/dht', nodeId: null }
      ],
      
      // Kademlia参数
      k: config.k || 8,                    // 每个bucket的节点数
      alpha: config.alpha || 3,            // 并行查询数
      
      // 定时器配置
      refreshInterval: config.refreshInterval || 15 * 60 * 1000,  // 15分钟刷新
      pingInterval: config.pingInterval || 5 * 60 * 1000,         // 5分钟ping
      republishInterval: config.republishInterval || 60 * 60 * 1000, // 1小时重新发布
      
      // 超时配置
      requestTimeout: config.requestTimeout || 10000,  // 请求超时
      pingTimeout: config.pingTimeout || 5000,         // ping超时
      
      // 存储配置
      maxPeersPerInfohash: config.maxPeersPerInfohash || 100,
      maxPlayerStore: config.maxPlayerStore || 1000,
      
      ...config
    };
    
    // 节点ID和密钥
    this.nodeId = null;
    this.keyPair = null;
    this.publicKey = null;
    this.publicKeyBase64 = null;
    
    // 路由表
    this.routingTable = null;
    
    // WebSocket连接管理
    this.connections = new Map();        // nodeId -> WebSocket
    this.bootstrapSockets = new Map();   // url -> WebSocket
    
    // 请求管理
    this.pendingRequests = new Map();    // requestId -> { resolve, reject, timeout }
    this.requestCounter = 0;
    
    // 数据存储
    this.peerStore = new Map();          // infohash -> Set of peers
    this.playerStore = new Map();        // playerId -> playerInfo
    this.ownAnnouncements = new Map();   // infohash -> { peers, announcedAt }
    
    // 等级数据缓存 (用于角色等级同步)
    this.levelCache = new Map();         // publicKey -> levelData
    
    // 状态
    this.isInitialized = false;
    this.isConnecting = false;
    
    // 定时器
    this.refreshTimer = null;
    this.pingTimer = null;
    this.republishTimer = null;
    
    // 消息处理器 (用于外部注册)
    this.messageHandlers = new Map();
    
    console.log('[DHTManager] Created');
  }
  
  // ========================================
  // 初始化和连接
  // ========================================
  
  /**
   * 初始化DHT管理器
   */
  async init() {
    try {
      console.log('[DHTManager] Initializing...');
      
      // 加载或生成密钥对
      await this.loadOrGenerateKeyPair();
      
      // 生成节点ID (从公钥派生)
      if (!this.publicKeyBase64) {
        throw new Error('publicKeyBase64 is not set');
      }
      this.nodeId = NodeID.fromPublicKey(this.publicKeyBase64);
      console.log('[DHTManager] Node ID:', this.nodeId.toHex().substring(0, 16) + '...');
      
      // 初始化路由表
      this.routingTable = new RoutingTable(this.nodeId, this.config.k);
      
      // 连接到bootstrap节点
      await this.connectToBootstrapNodes();
      
      // 注册 WebRTC 信令处理器
      this.registerWebRTCHandlers();
      
      // 启动定时任务
      this.startRefresh();
      this.startPing();
      this.startRepublish();
      
      this.isInitialized = true;
      console.log('[DHTManager] Initialized successfully');
      
      this.dispatchEvent(new CustomEvent('initialized', { 
        detail: { nodeId: this.nodeId.toHex(), publicKey: this.publicKeyBase64 } 
      }));
      
      return true;
    } catch (error) {
      console.error('[DHTManager] Initialization failed:', error);
      this.dispatchEvent(new CustomEvent('error', { detail: { error: error.message } }));
      return false;
    }
  }
  
  /**
   * 加载或生成ECDSA密钥对
   */
  async loadOrGenerateKeyPair() {
    // 尝试从localStorage加载
    const storedPrivateKey = localStorage.getItem('dht_private_key');
    const storedPublicKey = localStorage.getItem('dht_public_key');
    
    if (storedPrivateKey && storedPublicKey) {
      try {
        // 导入私钥
        const privateKeyBuffer = this.base64ToArrayBuffer(storedPrivateKey);
        this.keyPair = {
          privateKey: await crypto.subtle.importKey(
            'pkcs8',
            privateKeyBuffer,
            { name: 'ECDSA', namedCurve: 'P-256' },
            false,
            ['sign']
          )
        };
        
        // 导入公钥
        const publicKeyBuffer = this.base64ToArrayBuffer(storedPublicKey);
        this.publicKey = await crypto.subtle.importKey(
          'spki',
          publicKeyBuffer,
          { name: 'ECDSA', namedCurve: 'P-256' },
          true,
          ['verify']
        );
        this.keyPair.publicKey = this.publicKey;
        this.publicKeyBase64 = storedPublicKey;
        
        console.log('[DHTManager] Loaded existing key pair');
        return;
      } catch (error) {
        console.warn('[DHTManager] Failed to load stored keys, generating new ones:', error);
      }
    }
    
    // 生成新密钥对
    await this.generateKeyPair();
  }
  
  /**
   * 生成新的ECDSA密钥对
   */
  async generateKeyPair() {
    console.log('[DHTManager] Generating new key pair...');
    
    this.keyPair = await crypto.subtle.generateKey(
      { name: 'ECDSA', namedCurve: 'P-256' },
      true,
      ['sign', 'verify']
    );
    
    this.publicKey = this.keyPair.publicKey;
    
    // 导出并存储公钥
    const publicKeyBuffer = await crypto.subtle.exportKey('spki', this.publicKey);
    this.publicKeyBase64 = this.arrayBufferToBase64(publicKeyBuffer);
    
    // 导出并存储私钥
    const privateKeyBuffer = await crypto.subtle.exportKey('pkcs8', this.keyPair.privateKey);
    const privateKeyBase64 = this.arrayBufferToBase64(privateKeyBuffer);
    
    // 保存到localStorage
    localStorage.setItem('dht_private_key', privateKeyBase64);
    localStorage.setItem('dht_public_key', this.publicKeyBase64);
    
    console.log('[DHTManager] New key pair generated and stored');
  }
  
  /**
   * 连接到bootstrap节点
   */
  async connectToBootstrapNodes() {
    console.log('[DHTManager] Connecting to bootstrap nodes...');
    
    // 并行连接所有引导节点
    const connectPromises = this.config.bootstrapNodes.map(async (bootstrap) => {
      try {
        await this.connectToBootstrap(bootstrap);
        return { url: bootstrap.url, success: true };
      } catch (error) {
        console.warn('[DHTManager] Failed to connect to bootstrap:', bootstrap.url, error.message);
        return { url: bootstrap.url, success: false };
      }
    });
    
    const results = await Promise.all(connectPromises);
    const connected = results.some(r => r.success);
    
    if (!connected) {
      throw new Error('Failed to connect to any bootstrap node');
    }
    
    console.log('[DHTManager] Connected to', results.filter(r => r.success).length, 'bootstrap nodes');
    
    // 执行初始的find_node查询来填充路由表
    await this.refreshRoutingTable();
  }
  
  /**
   * 连接到单个bootstrap节点
   */
  connectToBootstrap(bootstrap) {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Connection timeout'));
      }, 10000);
      
      try {
        const ws = new WebSocket(bootstrap.url);
        
        ws.onopen = () => {
          clearTimeout(timeout);
          console.log('[DHTManager] Connected to bootstrap:', bootstrap.url);
          
          // 发送初始ping
          this.sendBootstrapMessage(ws, {
            type: DHT_MESSAGE_TYPES.PING,
            requestId: this.generateRequestId(),
            senderId: this.nodeId.toHex(),
            publicKey: this.publicKeyBase64
          });
          
          this.bootstrapSockets.set(bootstrap.url, ws);
          resolve();
        };
        
        ws.onmessage = (event) => {
          try {
            const message = JSON.parse(event.data);
            this.handleBootstrapMessage(message, bootstrap.url);
          } catch (error) {
            console.error('[DHTManager] Failed to parse bootstrap message:', error);
          }
        };
        
        ws.onerror = (error) => {
          clearTimeout(timeout);
          reject(error);
        };
        
        ws.onclose = () => {
          this.bootstrapSockets.delete(bootstrap.url);
        };
        
      } catch (error) {
        clearTimeout(timeout);
        reject(error);
      }
    });
  }
  
  /**
   * 发送消息到bootstrap节点
   */
  sendBootstrapMessage(ws, message) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
      return true;
    }
    return false;
  }
  
  /**
   * 处理来自bootstrap节点的消息
   */
  handleBootstrapMessage(message, bootstrapUrl) {
    console.log('[DHTManager] Received from bootstrap:', message.type, 'senderId:', message.senderId ? message.senderId.substring(0, 16) + '...' : 'undefined');
    
    // 验证 senderId 格式
    if (message.senderId && typeof message.senderId !== 'string') {
      console.warn('[DHTManager] Invalid senderId type:', typeof message.senderId);
      return;
    }
    
    // 更新路由表
    if (message.senderId) {
      try {
        const node = {
          id: new NodeID(message.senderId),
          address: { type: 'bootstrap', url: bootstrapUrl },
          lastSeen: Date.now()
        };
        this.routingTable.addNode(node);
      } catch (error) {
        console.error('[DHTManager] Failed to add node:', error.message);
      }
    }
    
    // 处理响应
    switch (message.type) {
      case DHT_MESSAGE_TYPES.PONG:
        this.handlePong(message);
        break;
      case DHT_MESSAGE_TYPES.FOUND_NODE:
        this.handleFoundNode(message);
        break;
      case DHT_MESSAGE_TYPES.GOT_PEERS:
        this.handleGotPeers(message);
        break;
      case DHT_MESSAGE_TYPES.ANNOUNCED:
        this.handleAnnounced(message);
        break;
      case DHT_MESSAGE_TYPES.PLAYER_INFO:
        this.handlePlayerInfo(message);
        break;
      case DHT_MESSAGE_TYPES.ERROR:
        console.error('[DHTManager] Error from bootstrap:', message.error);
        break;
      default:
        // 转发给通用消息处理器
        if (message.senderId) {
          this.handleMessage(message, { id: new NodeID(message.senderId), address: { url: bootstrapUrl } });
        } else {
          console.warn('[DHTManager] Message without senderId:', message.type);
        }
    }
    
    // 解析对应的请求
    if (message.requestId && this.pendingRequests.has(message.requestId)) {
      const request = this.pendingRequests.get(message.requestId);
      clearTimeout(request.timeout);
      this.pendingRequests.delete(message.requestId);
      request.resolve(message);
    }
  }
  
  // ========================================
  // DHT 协议消息处理
  // ========================================
  
  /**
   * 发送ping请求
   */
  async ping(targetNode) {
    const requestId = this.generateRequestId();
    
    const message = {
      type: DHT_MESSAGE_TYPES.PING,
      requestId,
      senderId: this.nodeId.toHex(),
      publicKey: this.publicKeyBase64,
      timestamp: Date.now()
    };
    
    return this.sendRequest(message, targetNode);
  }
  
  /**
   * 处理ping请求
   */
  handlePing(message, fromNode) {
    // 发送pong响应
    const response = {
      type: DHT_MESSAGE_TYPES.PONG,
      requestId: message.requestId,
      senderId: this.nodeId.toHex(),
      publicKey: this.publicKeyBase64,
      timestamp: Date.now()
    };
    
    this.sendMessage(response, fromNode);
  }
  
  /**
   * 处理pong响应
   */
  handlePong(message) {
    // 更新节点状态
    if (message.senderId) {
      const nodeId = new NodeID(message.senderId);
      const nodes = this.routingTable.getAllNodes();
      const node = nodes.find(n => n.id.equals(nodeId));
      if (node) {
        node.lastSeen = Date.now();
        node.rtt = Date.now() - message.timestamp;
      }
    }
  }
  
  /**
   * 发送find_node查询
   */
  async findNode(targetId, toNode) {
    const requestId = this.generateRequestId();
    
    const message = {
      type: DHT_MESSAGE_TYPES.FIND_NODE,
      requestId,
      senderId: this.nodeId.toHex(),
      targetId: targetId.toHex ? targetId.toHex() : targetId
    };
    
    return this.sendRequest(message, toNode);
  }
  
  /**
   * 处理find_node请求
   */
  handleFindNode(message, fromNode) {
    if (!message.targetId) {
      console.warn('[DHTManager] FIND_NODE request without targetId');
      return;
    }
    const targetId = new NodeID(message.targetId);
    
    // 如果目标是自己，返回自己
    if (targetId.equals(this.nodeId)) {
      const response = {
        type: DHT_MESSAGE_TYPES.FOUND_NODE,
        requestId: message.requestId,
        senderId: this.nodeId.toHex(),
        nodes: [{
          id: this.nodeId.toHex(),
          publicKey: this.publicKeyBase64,
          address: { type: 'self' }
        }]
      };
      this.sendMessage(response, fromNode);
      return;
    }
    
    // 查找最近的K个节点
    const closest = this.routingTable.findClosest(targetId, this.config.k);
    
    const response = {
      type: DHT_MESSAGE_TYPES.FOUND_NODE,
      requestId: message.requestId,
      senderId: this.nodeId.toHex(),
      nodes: closest.map(n => ({
        id: n.id.toHex(),
        publicKey: n.publicKey,
        address: n.address
      }))
    };
    
    this.sendMessage(response, fromNode);
  }
  
  /**
   * 处理found_node响应
   */
  handleFoundNode(message) {
    // 将发现的节点添加到路由表
    if (message.nodes) {
      for (const nodeInfo of message.nodes) {
        const node = {
          id: new NodeID(nodeInfo.id),
          publicKey: nodeInfo.publicKey,
          address: nodeInfo.address,
          lastSeen: Date.now()
        };
        
        this.routingTable.addNode(node);
      }
    }
  }
  
  /**
   * 发送get_peers查询
   */
  async getPeers(infohash, toNode) {
    const requestId = this.generateRequestId();
    
    const message = {
      type: DHT_MESSAGE_TYPES.GET_PEERS,
      requestId,
      senderId: this.nodeId.toHex(),
      infohash: infohash.toHex ? infohash.toHex() : infohash
    };
    
    return this.sendRequest(message, toNode);
  }
  
  /**
   * 处理get_peers请求
   */
  handleGetPeers(message, fromNode) {
    const infohash = message.infohash;
    if (!infohash) {
      console.warn('[DHTManager] GET_PEERS request without infohash');
      return;
    }
    const peers = this.peerStore.get(infohash) || [];
    
    // 如果知道peers，返回peers
    if (peers.length > 0) {
      const response = {
        type: DHT_MESSAGE_TYPES.GOT_PEERS,
        requestId: message.requestId,
        senderId: this.nodeId.toHex(),
        infohash,
        peers: Array.from(peers).slice(0, this.config.maxPeersPerInfohash),
        values: true  // 表示返回的是peers而不是nodes
      };
      this.sendMessage(response, fromNode);
    } else {
      // 否则返回最近的节点
      const targetId = new NodeID(infohash);
      const closest = this.routingTable.findClosest(targetId, this.config.k);
      
      const response = {
        type: DHT_MESSAGE_TYPES.GOT_PEERS,
        requestId: message.requestId,
        senderId: this.nodeId.toHex(),
        infohash,
        nodes: closest.map(n => ({
          id: n.id.toHex(),
          publicKey: n.publicKey,
          address: n.address
        })),
        values: false
      };
      this.sendMessage(response, fromNode);
    }
  }
  
  /**
   * 处理got_peers响应
   */
  handleGotPeers(message) {
    if (message.values && message.peers) {
      // 存储peers
      if (!this.peerStore.has(message.infohash)) {
        this.peerStore.set(message.infohash, new Set());
      }
      const peers = this.peerStore.get(message.infohash);
      message.peers.forEach(peer => peers.add(peer));
    } else if (message.nodes) {
      // 将节点添加到路由表
      for (const nodeInfo of message.nodes) {
        const node = {
          id: new NodeID(nodeInfo.id),
          publicKey: nodeInfo.publicKey,
          address: nodeInfo.address,
          lastSeen: Date.now()
        };
        this.routingTable.addNode(node);
      }
    }
  }
  
  /**
   * 发送announce_peer请求
   */
  async announcePeer(infohash, port, toNode) {
    const requestId = this.generateRequestId();
    
    const message = {
      type: DHT_MESSAGE_TYPES.ANNOUNCE_PEER,
      requestId,
      senderId: this.nodeId.toHex(),
      infohash: infohash.toHex ? infohash.toHex() : infohash,
      port,
      publicKey: this.publicKeyBase64
    };
    
    return this.sendRequest(message, toNode);
  }
  
  /**
   * 处理announce_peer请求
   */
  handleAnnouncePeer(message, fromNode) {
    const infohash = message.infohash;
    const peer = {
      nodeId: message.senderId,
      publicKey: message.publicKey,
      port: message.port,
      announcedAt: Date.now()
    };
    
    // 存储peer
    if (!this.peerStore.has(infohash)) {
      this.peerStore.set(infohash, new Set());
    }
    this.peerStore.get(infohash).add(peer);
    
    // 发送确认
    const response = {
      type: DHT_MESSAGE_TYPES.ANNOUNCED,
      requestId: message.requestId,
      senderId: this.nodeId.toHex()
    };
    this.sendMessage(response, fromNode);
  }
  
  /**
   * 处理announced响应
   */
  handleAnnounced(message) {
    console.log('[DHTManager] Peer announced successfully');
  }
  
  /**
   * 通用消息处理器
   */
  handleMessage(message, fromNode) {
    // 触发事件
    this.dispatchEvent(new CustomEvent('message', { 
      detail: { message, fromNode } 
    }));
    
    // 调用注册的消息处理器
    const handlers = this.messageHandlers.get(message.type);
    if (handlers) {
      handlers.forEach(handler => {
        try {
          handler(message, fromNode);
        } catch (error) {
          console.error(`[DHTManager] Message handler error for ${message.type}:`, error);
        }
      });
    }
  }
  
  // ========================================
  // 消息发送和请求管理
  // ========================================
  
  /**
   * 发送请求并等待响应
   */
  sendRequest(message, toNode) {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(message.requestId);
        reject(new Error('Request timeout'));
      }, this.config.requestTimeout);
      
      this.pendingRequests.set(message.requestId, { resolve, reject, timeout });
      this.sendMessage(message, toNode).catch(reject);
    });
  }
  
  /**
   * 发送消息到指定节点
   */
  async sendMessage(message, toNode) {
    // 优先使用bootstrap连接
    if (toNode.address?.type === 'bootstrap' || toNode.address?.url) {
      const ws = this.bootstrapSockets.get(toNode.address.url);
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(message));
        return;
      }
    }
    
    // 通过事件让外部处理 (例如通过P2P连接发送)
    this.dispatchEvent(new CustomEvent('sendMessage', {
      detail: { message, toNode }
    }));
  }
  
  /**
   * 广播消息到所有bootstrap连接
   */
  broadcastToBootstraps(message) {
    let sent = 0;
    for (const [url, ws] of this.bootstrapSockets) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(message));
        sent++;
      }
    }
    return sent;
  }
  
  /**
   * 生成请求ID
   */
  generateRequestId() {
    return `${this.nodeId.toHex().substring(0, 8)}-${++this.requestCounter}-${Date.now()}`;
  }
  
  /**
   * 生成随机ID
   */
  generateRandomId() {
    const bytes = new Uint8Array(20);
    crypto.getRandomValues(bytes);
    return new NodeID(bytes);
  }
  
  // ========================================
  // 玩家信息同步 (游戏扩展)
  // ========================================
  
  /**
   * 发布玩家信息到DHT
   */
  async announcePlayer(playerInfo) {
    console.log('[DHTManager] Announcing player:', playerInfo.name || playerInfo.id);
    
    const playerId = playerInfo.id || this.publicKeyBase64;
    
    // 签名玩家信息
    const signedInfo = await this.signPlayerInfo(playerInfo);
    
    // 存储到本地
    this.playerStore.set(playerId, {
      ...signedInfo,
      announcedAt: Date.now()
    });
    
    // 找到距离玩家ID最近的K个节点
    const targetId = NodeID.fromPublicKey(playerId);
    const closest = this.routingTable.findClosest(targetId, this.config.k);
    
    // 向这些节点发送announce
    const announcePromises = closest.map(async (node) => {
      try {
        const message = {
          type: DHT_MESSAGE_TYPES.ANNOUNCE_PLAYER,
          requestId: this.generateRequestId(),
          senderId: this.nodeId.toHex(),
          playerInfo: signedInfo
        };
        
        await this.sendRequest(message, node);
      } catch (error) {
        console.warn('[DHTManager] Failed to announce to node:', error.message);
      }
    });
    
    await Promise.allSettled(announcePromises);
    
    this.dispatchEvent(new CustomEvent('playerAnnounced', { 
      detail: { playerId, playerInfo: signedInfo } 
    }));
  }
  
  /**
   * 签名玩家信息
   */
  async signPlayerInfo(playerInfo) {
    const dataToSign = {
      id: playerInfo.id || this.publicKeyBase64,
      name: playerInfo.name,
      level: playerInfo.level,
      realm: playerInfo.realm,
      exp: playerInfo.exp,
      timestamp: Date.now()
    };
    
    const signature = await this.signData(dataToSign);
    
    return {
      ...dataToSign,
      publicKey: this.publicKeyBase64,
      signature
    };
  }
  
  /**
   * 查询玩家信息
   */
  async getPlayer(playerId) {
    console.log('[DHTManager] Getting player:', playerId);
    
    // 先检查本地存储
    const local = this.playerStore.get(playerId);
    if (local && (Date.now() - local.announcedAt) < 10 * 60 * 1000) {
      return local;
    }
    
    // 找到距离玩家ID最近的K个节点
    const targetId = NodeID.fromPublicKey(playerId);
    const closest = this.routingTable.findClosest(targetId, this.config.k);
    
    // 并行查询
    const queries = closest.map(async (node) => {
      try {
        const message = {
          type: DHT_MESSAGE_TYPES.GET_PLAYER,
          requestId: this.generateRequestId(),
          senderId: this.nodeId.toHex(),
          playerId
        };
        
        return await this.sendRequest(message, node);
      } catch (error) {
        return null;
      }
    });
    
    const results = await Promise.all(queries);
    
    // 返回第一个成功的结果
    for (const result of results) {
      if (result && result.playerInfo) {
        // 验证签名
        const isValid = await this.verifyPlayerInfo(result.playerInfo);
        if (isValid) {
          this.playerStore.set(playerId, result.playerInfo);
          return result.playerInfo;
        }
      }
    }
    
    return null;
  }
  
  /**
   * 处理get_player请求
   */
  handleGetPlayer(message, fromNode) {
    const playerInfo = this.playerStore.get(message.playerId);
    
    const response = {
      type: DHT_MESSAGE_TYPES.PLAYER_INFO,
      requestId: message.requestId,
      senderId: this.nodeId.toHex(),
      playerInfo
    };
    
    this.sendMessage(response, fromNode);
  }
  
  /**
   * 处理player_info响应
   */
  handlePlayerInfo(message) {
    if (message.playerInfo) {
      const playerId = message.playerInfo.id || message.playerInfo.publicKey;
      this.playerStore.set(playerId, {
        ...message.playerInfo,
        receivedAt: Date.now()
      });
    }
  }
  
  /**
   * 处理announce_player
   */
  async handleAnnouncePlayer(message, fromNode) {
    const { playerInfo } = message;
    
    // 验证签名
    const isValid = await this.verifyPlayerInfo(playerInfo);
    if (!isValid) {
      console.warn('[DHTManager] Invalid player info signature');
      return;
    }
    
    // 存储玩家信息
    const playerId = playerInfo.id || playerInfo.publicKey;
    this.playerStore.set(playerId, {
      ...playerInfo,
      receivedAt: Date.now()
    });
    
    console.log('[DHTManager] Stored player info:', playerInfo.name);
    
    this.dispatchEvent(new CustomEvent('playerReceived', { 
      detail: { playerId, playerInfo } 
    }));
  }
  
  /**
   * 验证玩家信息签名
   */
  async verifyPlayerInfo(playerInfo) {
    try {
      const { signature, publicKey, ...data } = playerInfo;
      
      if (!signature || !publicKey) {
        return false;
      }
      
      // 导入公钥
      const publicKeyBuffer = this.base64ToArrayBuffer(publicKey);
      const importedPublicKey = await crypto.subtle.importKey(
        'spki',
        publicKeyBuffer,
        { name: 'ECDSA', namedCurve: 'P-256' },
        false,
        ['verify']
      );
      
      // 构建验证数据
      const dataToVerify = JSON.stringify(data);
      const encoder = new TextEncoder();
      const dataBuffer = encoder.encode(dataToVerify);
      const signatureBuffer = this.base64ToArrayBuffer(signature);
      
      // 验证签名
      return await crypto.subtle.verify(
        { name: 'ECDSA', hash: 'SHA-256' },
        importedPublicKey,
        signatureBuffer,
        dataBuffer
      );
    } catch (error) {
      console.error('[DHTManager] Player info verification error:', error);
      return false;
    }
  }
  
  // ========================================
  // 角色等级同步 (原有功能)
  // ========================================
  
  /**
   * 发布等级到网络
   */
  async publishLevel(playerData) {
    if (!this.isInitialized) {
      console.warn('[DHTManager] Not initialized');
      return false;
    }
    
    try {
      const levelData = await this.createLevelData(playerData);
      
      // 广播给所有bootstrap连接
      const message = {
        type: DHT_MESSAGE_TYPES.ANNOUNCE_PLAYER,
        requestId: this.generateRequestId(),
        senderId: this.nodeId.toHex(),
        playerInfo: levelData
      };
      
      this.broadcastToBootstraps(message);
      
      // 缓存自己的数据
      this.cacheLevelData(this.publicKeyBase64, levelData);
      
      console.log('[DHTManager] Level published');
      this.dispatchEvent(new CustomEvent('levelPublished', { detail: levelData }));
      
      return true;
    } catch (error) {
      console.error('[DHTManager] Failed to publish level:', error);
      return false;
    }
  }
  
  /**
   * 创建等级数据对象
   */
  async createLevelData(playerData) {
    const data = {
      id: this.publicKeyBase64,
      publicKey: this.publicKeyBase64,
      name: playerData.name || 'Unknown',
      level: playerData.level || 1,
      realm: playerData.realm || '练气',
      exp: playerData.exp || 0,
      timestamp: Date.now()
    };
    
    // 签名数据
    data.signature = await this.signData(data);
    
    return data;
  }
  
  /**
   * 签名数据
   */
  async signData(data) {
    const dataToSign = JSON.stringify({
      id: data.id,
      name: data.name,
      level: data.level,
      realm: data.realm,
      exp: data.exp,
      timestamp: data.timestamp
    });
    
    const encoder = new TextEncoder();
    const dataBuffer = encoder.encode(dataToSign);
    
    const signatureBuffer = await crypto.subtle.sign(
      { name: 'ECDSA', hash: 'SHA-256' },
      this.keyPair.privateKey,
      dataBuffer
    );
    
    return this.arrayBufferToBase64(signatureBuffer);
  }
  
  /**
   * 查询某玩家等级
   */
  async queryLevel(publicKey) {
    if (!this.isInitialized) {
      console.warn('[DHTManager] Not initialized');
      return null;
    }
    
    // 检查缓存
    const cached = this.levelCache.get(publicKey);
    if (cached && (Date.now() - cached.cachedAt) < 10 * 60 * 1000) {
      return cached;
    }
    
    // 如果是查询自己
    if (publicKey === this.publicKeyBase64) {
      const levelData = await this.createLevelData(this.getPlayerDataFromGame?.() || {});
      this.cacheLevelData(publicKey, levelData);
      return levelData;
    }
    
    // 通过DHT查询
    const playerInfo = await this.getPlayer(publicKey);
    if (playerInfo) {
      this.cacheLevelData(publicKey, playerInfo);
      return playerInfo;
    }
    
    return null;
  }
  
  /**
   * 缓存等级数据
   */
  cacheLevelData(publicKey, data) {
    this.levelCache.set(publicKey, {
      ...data,
      cachedAt: Date.now()
    });
  }
  
  /**
   * 获取缓存的等级数据
   */
  getCachedLevel(publicKey) {
    return this.levelCache.get(publicKey) || null;
  }
  
  /**
   * 获取所有缓存数据
   */
  getAllCachedLevels() {
    const result = {};
    for (const [key, value] of this.levelCache) {
      result[key] = value;
    }
    return result;
  }
  
  // ========================================
  // 定时任务
  // ========================================
  
  /**
   * 刷新路由表
   */
  async refreshRoutingTable() {
    console.log('[DHTManager] Refreshing routing table...');
    
    // 对自己执行find_node来发现更多节点
    const closest = this.routingTable.findClosest(this.nodeId, this.config.alpha);
    
    if (closest.length === 0) {
      console.log('[DHTManager] No nodes in routing table, using bootstrap nodes');
      // 如果路由表为空，使用引导节点
      for (const bootstrap of this.config.bootstrapNodes) {
        try {
          const node = {
            id: new NodeID(bootstrap.nodeId || this.generateRandomId()),
            address: { type: 'bootstrap', url: bootstrap.url },
            lastSeen: Date.now()
          };
          this.routingTable.addNode(node);
        } catch (error) {
          console.warn('[DHTManager] Failed to add bootstrap node:', error.message);
        }
      }
      return;
    }
    
    // 并行查询所有最近的节点
    const queryPromises = closest.map(async (node) => {
      try {
        await this.findNode(this.nodeId, node);
        return { node: node.id.toHex(), success: true };
      } catch (error) {
        console.warn('[DHTManager] Find node failed for', node.id.toHex().substring(0, 16), ':', error.message);
        // 移除失败的节点
        this.routingTable.removeNode(node.id);
        return { node: node.id.toHex(), success: false };
      }
    });
    
    const results = await Promise.all(queryPromises);
    const successCount = results.filter(r => r.success).length;
    
    console.log('[DHTManager] Routing table refresh completed:', successCount, 'successful queries');
    
    // 显示路由表统计
    const stats = this.routingTable.getStats();
    console.log('[DHTManager] Routing table stats:', stats);
  }
  
  /**
   * Ping所有节点
   */
  async pingAllNodes() {
    const allNodes = this.routingTable.getAllNodes();
    
    if (allNodes.length === 0) {
      return;
    }
    
    // 并行ping所有节点，提高性能
    const pingPromises = allNodes.map(async (node) => {
      try {
        await this.ping(node);
        return { node, success: true };
      } catch (error) {
        // 标记节点为失效
        console.warn('[DHTManager] Node ping failed, removing:', node.id.toHex().substring(0, 16));
        this.routingTable.removeNode(node.id);
        return { node, success: false };
      }
    });
    
    const results = await Promise.all(pingPromises);
    const successCount = results.filter(r => r.success).length;
    
    if (allNodes.length > 0) {
      console.log(`[DHTManager] Pinged ${allNodes.length} nodes, ${successCount} successful`);
    }
  }
  
  /**
   * 重新发布所有announcements
   */
  async republishAnnouncements() {
    for (const [infohash, announcement] of this.ownAnnouncements) {
      if (!infohash || Date.now() - announcement.announcedAt > this.config.republishInterval) {
        // 重新发布
        try {
          const targetId = new NodeID(infohash);
          const closest = this.routingTable.findClosest(targetId, this.config.k);
          
            for (const node of closest) {
            try {
              await this.announcePeer(infohash, announcement.port, node);
            } catch (error) {
              console.warn('[DHTManager] Republish failed:', error.message);
            }
          }
          
          announcement.announcedAt = Date.now();
        } catch (error) {
          console.warn('[DHTManager] Republish error:', error.message);
        }
      }
    }
  }
  
  /**
   * 启动定期刷新
   */
  startRefresh() {
    this.refreshTimer = setInterval(() => {
      this.refreshRoutingTable();
    }, this.config.refreshInterval);
  }
  
  /**
   * 启动定期ping
   */
  startPing() {
    this.pingTimer = setInterval(() => {
      this.pingAllNodes();
    }, this.config.pingInterval);
  }
  
  /**
   * 启动定期重新发布
   */
  startRepublish() {
    this.republishTimer = setInterval(() => {
      this.republishAnnouncements();
    }, this.config.republishInterval);
  }
  
  /**
   * 停止所有定时器
   */
  stopTimers() {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = null;
    }
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
    if (this.republishTimer) {
      clearInterval(this.republishTimer);
      this.republishTimer = null;
    }
  }
  
  // ========================================
  // 工具方法
  // ========================================
  
  arrayBufferToBase64(buffer) {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }
  
  base64ToArrayBuffer(base64) {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer;
  }
  
  // ========================================
  // WebRTC 信令传输 (游戏扩展)
  // ========================================
  
  /**
   * 通过 DHT 发送 WebRTC Offer
   * @param {string} targetPlayerId - 目标玩家ID (公钥)
   * @param {RTCSessionDescriptionInit} offer - WebRTC offer
   * @returns {Promise<boolean>} 是否发送成功
   */
  async sendOffer(targetPlayerId, offer) {
    console.log('[DHTManager] Sending offer to:', targetPlayerId.substring(0, 16) + '...');
    
    if (!this.isInitialized) {
      console.warn('[DHTManager] Not initialized');
      return false;
    }
    
    try {
      // 找到距离目标玩家最近的K个节点
      const targetId = NodeID.fromPublicKey(targetPlayerId);
      const closest = this.routingTable.findClosest(targetId, this.config.k);
      
      if (closest.length === 0) {
        console.warn('[DHTManager] No nodes available to send offer');
        return false;
      }
      
      const message = {
        type: DHT_MESSAGE_TYPES.OFFER,
        requestId: this.generateRequestId(),
        senderId: this.nodeId.toHex(),
        senderPublicKey: this.publicKeyBase64,
        targetPlayerId,
        offer: {
          type: offer.type,
          sdp: offer.sdp
        },
        timestamp: Date.now()
      };
      
      // 向最近的节点发送offer（存储并转发）
      const sendPromises = closest.map(async (node) => {
        try {
          await this.sendRequest(message, node);
          return true;
        } catch (error) {
          return false;
        }
      });
      
      const results = await Promise.allSettled(sendPromises);
      const successCount = results.filter(r => r.status === 'fulfilled' && r.value).length;
      
      console.log(`[DHTManager] Offer sent to ${successCount}/${closest.length} nodes`);
      
      // 同时广播到所有bootstrap节点
      this.broadcastToBootstraps(message);
      
      return successCount > 0;
    } catch (error) {
      console.error('[DHTManager] Failed to send offer:', error);
      return false;
    }
  }
  
  /**
   * 通过 DHT 发送 WebRTC Answer
   * @param {string} targetPlayerId - 目标玩家ID (公钥)
   * @param {RTCSessionDescriptionInit} answer - WebRTC answer
   * @returns {Promise<boolean>} 是否发送成功
   */
  async sendAnswer(targetPlayerId, answer) {
    console.log('[DHTManager] Sending answer to:', targetPlayerId.substring(0, 16) + '...');
    
    if (!this.isInitialized) {
      console.warn('[DHTManager] Not initialized');
      return false;
    }
    
    try {
      // 找到距离目标玩家最近的K个节点
      const targetId = NodeID.fromPublicKey(targetPlayerId);
      const closest = this.routingTable.findClosest(targetId, this.config.k);
      
      const message = {
        type: DHT_MESSAGE_TYPES.ANSWER,
        requestId: this.generateRequestId(),
        senderId: this.nodeId.toHex(),
        senderPublicKey: this.publicKeyBase64,
        targetPlayerId,
        answer: {
          type: answer.type,
          sdp: answer.sdp
        },
        timestamp: Date.now()
      };
      
      // 向最近的节点发送answer
      const sendPromises = closest.map(async (node) => {
        try {
          await this.sendRequest(message, node);
          return true;
        } catch (error) {
          return false;
        }
      });
      
      const results = await Promise.allSettled(sendPromises);
      const successCount = results.filter(r => r.status === 'fulfilled' && r.value).length;
      
      console.log(`[DHTManager] Answer sent to ${successCount}/${closest.length} nodes`);
      
      // 同时广播到所有bootstrap节点
      this.broadcastToBootstraps(message);
      
      return successCount > 0;
    } catch (error) {
      console.error('[DHTManager] Failed to send answer:', error);
      return false;
    }
  }
  
  /**
   * 通过 DHT 发送 ICE Candidate
   * @param {string} targetPlayerId - 目标玩家ID (公钥)
   * @param {RTCIceCandidateInit} candidate - ICE candidate
   * @returns {Promise<boolean>} 是否发送成功
   */
  async sendIceCandidate(targetPlayerId, candidate) {
    if (!this.isInitialized) {
      console.warn('[DHTManager] Not initialized');
      return false;
    }
    
    try {
      // 找到距离目标玩家最近的K个节点
      const targetId = NodeID.fromPublicKey(targetPlayerId);
      const closest = this.routingTable.findClosest(targetId, this.config.k);
      
      const message = {
        type: DHT_MESSAGE_TYPES.ICE_CANDIDATE,
        requestId: this.generateRequestId(),
        senderId: this.nodeId.toHex(),
        senderPublicKey: this.publicKeyBase64,
        targetPlayerId,
        candidate: {
          candidate: candidate.candidate,
          sdpMid: candidate.sdpMid,
          sdpMLineIndex: candidate.sdpMLineIndex,
          usernameFragment: candidate.usernameFragment
        },
        timestamp: Date.now()
      };
      
      // 向最近的节点发送ICE候选
      const sendPromises = closest.map(async (node) => {
        try {
          await this.sendRequest(message, node);
          return true;
        } catch (error) {
          return false;
        }
      });
      
      const results = await Promise.allSettled(sendPromises);
      const successCount = results.filter(r => r.status === 'fulfilled' && r.value).length;
      
      // 同时广播到所有bootstrap节点
      this.broadcastToBootstraps(message);
      
      return successCount > 0;
    } catch (error) {
      console.error('[DHTManager] Failed to send ICE candidate:', error);
      return false;
    }
  }
  
  /**
   * 处理收到的 Offer
   * @param {Object} message - DHT消息
   * @param {Object} fromNode - 发送节点
   */
  handleOffer(message, fromNode) {
    console.log('[DHTManager] Received offer from:', message.senderPublicKey?.substring(0, 16) + '...');
    
    // 验证消息是否针对当前玩家
    if (message.targetPlayerId !== this.publicKeyBase64) {
      // 消息不是给当前玩家的，转发给更接近目标的节点
      this.forwardSignalingMessage(message);
      return;
    }
    
    // 触发事件，让外部处理器处理
    this.dispatchEvent(new CustomEvent('offer', {
      detail: {
        fromId: message.senderPublicKey,
        fromNodeId: message.senderId,
        offer: message.offer,
        timestamp: message.timestamp
      }
    }));
  }
  
  /**
   * 处理收到的 Answer
   * @param {Object} message - DHT消息
   * @param {Object} fromNode - 发送节点
   */
  handleAnswer(message, fromNode) {
    console.log('[DHTManager] Received answer from:', message.senderPublicKey?.substring(0, 16) + '...');
    
    // 验证消息是否针对当前玩家
    if (message.targetPlayerId !== this.publicKeyBase64) {
      this.forwardSignalingMessage(message);
      return;
    }
    
    this.dispatchEvent(new CustomEvent('answer', {
      detail: {
        fromId: message.senderPublicKey,
        fromNodeId: message.senderId,
        answer: message.answer,
        timestamp: message.timestamp
      }
    }));
  }
  
  /**
   * 处理收到的 ICE Candidate
   * @param {Object} message - DHT消息
   * @param {Object} fromNode - 发送节点
   */
  handleIceCandidate(message, fromNode) {
    // 验证消息是否针对当前玩家
    if (message.targetPlayerId !== this.publicKeyBase64) {
      this.forwardSignalingMessage(message);
      return;
    }
    
    this.dispatchEvent(new CustomEvent('iceCandidate', {
      detail: {
        fromId: message.senderPublicKey,
        fromNodeId: message.senderId,
        candidate: message.candidate,
        timestamp: message.timestamp
      }
    }));
  }
  
  /**
   * 转发信令消息给更接近目标的节点
   * @param {Object} message - 要转发的消息
   */
  async forwardSignalingMessage(message) {
    if (!message.targetPlayerId) {
      console.warn('[DHTManager] Cannot forward message without targetPlayerId');
      return;
    }
    const targetId = NodeID.fromPublicKey(message.targetPlayerId);
    const closest = this.routingTable.findClosest(targetId, this.config.alpha);
    
    // 排除发送者
    const senderId = message.senderId ? new NodeID(message.senderId) : null;
    const filtered = senderId 
      ? closest.filter(node => !node.id.equals(senderId))
      : closest;
    
    for (const node of filtered) {
      try {
        await this.sendMessage(message, node);
      } catch (error) {
        // 继续尝试其他节点
      }
    }
  }
  
  /**
   * 注册 WebRTC 信令处理器
   */
  registerWebRTCHandlers() {
    this.onMessage(DHT_MESSAGE_TYPES.OFFER, (message, fromNode) => {
      this.handleOffer(message, fromNode);
    });
    
    this.onMessage(DHT_MESSAGE_TYPES.ANSWER, (message, fromNode) => {
      this.handleAnswer(message, fromNode);
    });
    
    this.onMessage(DHT_MESSAGE_TYPES.ICE_CANDIDATE, (message, fromNode) => {
      this.handleIceCandidate(message, fromNode);
    });
  }
  
  // ========================================
  // 公共API
  // ========================================
  
  /**
   * 获取节点ID
   */
  getNodeId() {
    return this.nodeId?.toHex();
  }
  
  /**
   * 获取公钥
   */
  getPublicKey() {
    return this.publicKeyBase64;
  }
  
  /**
   * 获取统计信息
   */
  getStats() {
    return {
      nodeId: this.nodeId?.toHex(),
      publicKey: this.publicKeyBase64,
      routingTable: this.routingTable?.getStats(),
      playerStore: this.playerStore.size,
      peerStore: this.peerStore.size,
      levelCache: this.levelCache.size,
      bootstrapConnections: this.bootstrapSockets.size,
      isInitialized: this.isInitialized
    };
  }
  
  /**
   * 注册消息处理器
   */
  onMessage(type, handler) {
    if (!this.messageHandlers.has(type)) {
      this.messageHandlers.set(type, []);
    }
    this.messageHandlers.get(type).push(handler);
  }
  
  /**
   * 移除消息处理器
   */
  offMessage(type, handler) {
    const handlers = this.messageHandlers.get(type);
    if (handlers) {
      const index = handlers.indexOf(handler);
      if (index !== -1) {
        handlers.splice(index, 1);
      }
    }
  }
  
  /**
   * 销毁管理器
   */
  destroy() {
    this.stopTimers();
    
    // 关闭所有WebSocket连接
    for (const [url, ws] of this.bootstrapSockets) {
      ws.close();
    }
    this.bootstrapSockets.clear();
    
    // 清理数据
    this.connections.clear();
    this.pendingRequests.clear();
    this.peerStore.clear();
    this.playerStore.clear();
    this.levelCache.clear();
    this.messageHandlers.clear();
    
    this.isInitialized = false;
    
    console.log('[DHTManager] Destroyed');
  }
}

// ========================================
// 与 BTDHTManager 的兼容性层
// ========================================

/**
 * BTDHTManager 兼容类
 * 提供与原有 BTDHTManager 相同的API，内部使用新的 DHTManager
 */
class BTDHTManager extends EventTarget {
  constructor(config = {}) {
    super();
    
    // 创建内部的 DHTManager 实例
    this.dhtManager = new DHTManager(config);
    
    // 转发事件
    this.dhtManager.addEventListener('initialized', (e) => {
      this.dispatchEvent(new CustomEvent('initialized', { detail: e.detail }));
    });
    
    this.dhtManager.addEventListener('error', (e) => {
      this.dispatchEvent(new CustomEvent('error', { detail: e.detail }));
    });
    
    this.dhtManager.addEventListener('playerAnnounced', (e) => {
      this.dispatchEvent(new CustomEvent('playerAnnounced', { detail: e.detail }));
    });
    
    this.dhtManager.addEventListener('playerReceived', (e) => {
      this.dispatchEvent(new CustomEvent('playerReceived', { detail: e.detail }));
    });
    
    this.dhtManager.addEventListener('sendMessage', (e) => {
      this.dispatchEvent(new CustomEvent('sendMessage', { detail: e.detail }));
    });
  }
  
  /**
   * 初始化
   */
  async init() {
    return this.dhtManager.init();
  }
  
  /**
   * 发布玩家信息
   */
  async announcePlayer(playerInfo) {
    return this.dhtManager.announcePlayer(playerInfo);
  }
  
  /**
   * 获取玩家信息
   */
  async getPlayer(playerId) {
    return this.dhtManager.getPlayer(playerId);
  }
  
  /**
   * 发布等级 (兼容旧API)
   */
  async publishLevel(playerData) {
    return this.dhtManager.publishLevel(playerData);
  }
  
  /**
   * 查询等级 (兼容旧API)
   */
  async queryLevel(publicKey) {
    return this.dhtManager.queryLevel(publicKey);
  }
  
  /**
   * 处理收到的消息
   */
  handleMessage(message, fromNode) {
    return this.dhtManager.handleMessage(message, fromNode);
  }
  
  /**
   * 获取统计信息
   */
  getStats() {
    return this.dhtManager.getStats();
  }
  
  /**
   * 获取节点ID
   */
  getNodeId() {
    return this.dhtManager.getNodeId();
  }
  
  /**
   * 获取公钥
   */
  getPublicKey() {
    return this.dhtManager.getPublicKey();
  }
  
  /**
   * 销毁
   */
  destroy() {
    return this.dhtManager.destroy();
  }
  
  // 暴露内部 DHTManager 以便访问高级功能
  getDHTManager() {
    return this.dhtManager;
  }
}

// ========================================
// 模块导出
// ========================================

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { 
    DHTManager, 
    BTDHTManager,
    NodeID, 
    KBucket, 
    RoutingTable, 
    DHT_MESSAGE_TYPES 
  };
} else {
  window.DHTManager = DHTManager;
  window.BTDHTManager = BTDHTManager;
  window.NodeID = NodeID;
  window.KBucket = KBucket;
  window.RoutingTable = RoutingTable;
  window.DHT_MESSAGE_TYPES = DHT_MESSAGE_TYPES;
}
