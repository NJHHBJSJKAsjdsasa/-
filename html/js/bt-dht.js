/**
 * BitTorrent DHT 实现
 * 基于 Kademlia 协议的去中心化节点发现网络
 * 简化版本，适用于浏览器环境
 */

// ========================================
// NodeID - 160位节点ID
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
   * 将16进制字符串转换为字节数组
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
      this.nodes.push(existing);
      return { added: false, evicted: null };
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
// RoutingTable - 路由表
// ========================================

class RoutingTable {
  constructor(localNodeId, k = 8) {
    this.localNodeId = new NodeID(localNodeId);
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
    const target = new NodeID(targetId);
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
// DHT消息定义
// ========================================

const DHT_MESSAGE_TYPES = {
  PING: 'ping',
  PONG: 'pong',
  FIND_NODE: 'find_node',
  FOUND_NODE: 'found_node',
  ANNOUNCE_PLAYER: 'announce_player',
  GET_PLAYER: 'get_player',
  PLAYER_INFO: 'player_info',
  OFFER: 'offer',
  ANSWER: 'answer',
  ICE_CANDIDATE: 'ice_candidate'
};

// ========================================
// BTDHTManager - DHT管理器
// ========================================

class BTDHTManager extends EventTarget {
  constructor(config = {}) {
    super();
    
    this.config = {
      bootstrapNodes: config.bootstrapNodes || [
        { host: '49.232.170.26', port: 5050 }
      ],
      k: config.k || 8,
      alpha: config.alpha || 3, // 并行查询数
      refreshInterval: config.refreshInterval || 15 * 60 * 1000, // 15分钟刷新
      ...config
    };
    
    // 生成本地节点ID
    this.nodeId = new NodeID();
    
    // 路由表
    this.routingTable = new RoutingTable(this.nodeId, this.config.k);
    
    // 连接管理
    this.connections = new Map(); // nodeId -> connection
    this.pendingRequests = new Map(); // requestId -> { resolve, reject, timeout }
    
    // 玩家信息存储
    this.playerStore = new Map(); // playerId -> playerInfo
    
    // 状态
    this.isInitialized = false;
    this.refreshTimer = null;
    
    console.log('[BTDHT] Created with nodeId:', this.nodeId.toHex().substring(0, 16) + '...');
  }
  
  /**
   * 初始化DHT
   */
  async init() {
    console.log('[BTDHT] Initializing...');
    
    try {
      // 连接到bootstrap节点
      await this.connectToBootstrap();
      
      // 启动定期刷新
      this.startRefresh();
      
      this.isInitialized = true;
      console.log('[BTDHT] Initialized successfully');
      this.dispatchEvent(new CustomEvent('initialized', { 
        detail: { nodeId: this.nodeId.toHex() } 
      }));
      
      return true;
    } catch (error) {
      console.error('[BTDHT] Initialization failed:', error);
      this.dispatchEvent(new CustomEvent('error', { 
        detail: { error: error.message } 
      }));
      return false;
    }
  }
  
  /**
   * 连接到bootstrap节点
   */
  async connectToBootstrap() {
    console.log('[BTDHT] Connecting to bootstrap nodes...');
    
    for (const bootstrap of this.config.bootstrapNodes) {
      try {
        // 创建bootstrap节点信息
        const bootstrapNode = {
          id: new NodeID(), // 临时ID，实际应该从bootstrap获取
          address: bootstrap,
          lastSeen: Date.now()
        };
        
        // 添加到路由表
        this.routingTable.addNode(bootstrapNode);
        
        console.log('[BTDHT] Added bootstrap node:', bootstrap);
      } catch (error) {
        console.warn('[BTDHT] Failed to connect to bootstrap:', bootstrap, error.message);
      }
    }
    
    // 执行初始的find_node查询来填充路由表
    await this.refreshRoutingTable();
  }
  
  /**
   * 刷新路由表
   */
  async refreshRoutingTable() {
    console.log('[BTDHT] Refreshing routing table...');
    
    // 对自己执行find_node来发现更多节点
    const closest = this.routingTable.findClosest(this.nodeId, this.config.alpha);
    
    for (const node of closest) {
      try {
        await this.findNode(this.nodeId, node);
      } catch (error) {
        console.warn('[BTDHT] Find node failed:', error.message);
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
   * 处理收到的find_node请求
   */
  handleFindNode(message, fromNode) {
    const targetId = new NodeID(message.targetId);
    
    // 查找最近的K个节点
    const closest = this.routingTable.findClosest(targetId, this.config.k);
    
    // 发送响应
    const response = {
      type: DHT_MESSAGE_TYPES.FOUND_NODE,
      requestId: message.requestId,
      senderId: this.nodeId.toHex(),
      nodes: closest.map(n => ({
        id: n.id.toHex(),
        address: n.address
      }))
    };
    
    this.sendMessage(response, fromNode);
  }
  
  /**
   * 处理收到的found_node响应
   */
  handleFoundNode(message) {
    // 将发现的节点添加到路由表
    for (const nodeInfo of message.nodes) {
      const node = {
        id: new NodeID(nodeInfo.id),
        address: nodeInfo.address,
        lastSeen: Date.now()
      };
      
      this.routingTable.addNode(node);
    }
    
    // 解析对应的请求
    const request = this.pendingRequests.get(message.requestId);
    if (request) {
      clearTimeout(request.timeout);
      this.pendingRequests.delete(message.requestId);
      request.resolve(message.nodes);
    }
  }
  
  /**
   * 发布玩家信息到DHT
   */
  async announcePlayer(playerInfo) {
    console.log('[BTDHT] Announcing player:', playerInfo.name);
    
    const playerId = new NodeID(playerInfo.id);
    
    // 存储到本地
    this.playerStore.set(playerInfo.id, {
      ...playerInfo,
      announcedAt: Date.now()
    });
    
    // 找到距离玩家ID最近的K个节点
    const closest = this.routingTable.findClosest(playerId, this.config.k);
    
    // 向这些节点发送announce
    for (const node of closest) {
      const message = {
        type: DHT_MESSAGE_TYPES.ANNOUNCE_PLAYER,
        requestId: this.generateRequestId(),
        senderId: this.nodeId.toHex(),
        playerInfo
      };
      
      try {
        await this.sendMessage(message, node);
      } catch (error) {
        console.warn('[BTDHT] Failed to announce to node:', error.message);
      }
    }
  }
  
  /**
   * 查询玩家信息
   */
  async getPlayer(playerId) {
    console.log('[BTDHT] Getting player:', playerId);
    
    // 先检查本地存储
    const local = this.playerStore.get(playerId);
    if (local) {
      return local;
    }
    
    // 找到距离玩家ID最近的K个节点
    const targetId = new NodeID(playerId);
    const closest = this.routingTable.findClosest(targetId, this.config.k);
    
    // 并行查询
    const queries = closest.map(node => {
      const message = {
        type: DHT_MESSAGE_TYPES.GET_PLAYER,
        requestId: this.generateRequestId(),
        senderId: this.nodeId.toHex(),
        playerId
      };
      
      return this.sendRequest(message, node).catch(() => null);
    });
    
    const results = await Promise.all(queries);
    
    // 返回第一个成功的结果
    for (const result of results) {
      if (result && result.playerInfo) {
        return result.playerInfo;
      }
    }
    
    return null;
  }
  
  /**
   * 发送请求并等待响应
   */
  sendRequest(message, toNode) {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(message.requestId);
        reject(new Error('Request timeout'));
      }, 10000);
      
      this.pendingRequests.set(message.requestId, { resolve, reject, timeout });
      this.sendMessage(message, toNode).catch(reject);
    });
  }
  
  /**
   * 发送消息到指定节点
   */
  async sendMessage(message, toNode) {
    // 这里应该通过WebSocket或WebRTC发送
    // 简化实现，实际应该使用已有的P2P连接
    console.log('[BTDHT] Sending message:', message.type, 'to:', toNode.id?.toHex()?.substring(0, 16) || 'unknown');
    
    // 触发事件让外部处理实际发送
    this.dispatchEvent(new CustomEvent('sendMessage', {
      detail: { message, toNode }
    }));
  }
  
  /**
   * 处理收到的消息
   */
  handleMessage(message, fromNode) {
    console.log('[BTDHT] Received message:', message.type, 'from:', fromNode.id?.toHex()?.substring(0, 16));
    
    // 更新路由表
    this.routingTable.addNode(fromNode);
    
    switch (message.type) {
      case DHT_MESSAGE_TYPES.PING:
        this.handlePing(message, fromNode);
        break;
      case DHT_MESSAGE_TYPES.FIND_NODE:
        this.handleFindNode(message, fromNode);
        break;
      case DHT_MESSAGE_TYPES.FOUND_NODE:
        this.handleFoundNode(message);
        break;
      case DHT_MESSAGE_TYPES.GET_PLAYER:
        this.handleGetPlayer(message, fromNode);
        break;
      case DHT_MESSAGE_TYPES.ANNOUNCE_PLAYER:
        this.handleAnnouncePlayer(message);
        break;
      default:
        console.warn('[BTDHT] Unknown message type:', message.type);
    }
  }
  
  /**
   * 处理ping请求
   */
  handlePing(message, fromNode) {
    const response = {
      type: DHT_MESSAGE_TYPES.PONG,
      requestId: message.requestId,
      senderId: this.nodeId.toHex()
    };
    
    this.sendMessage(response, fromNode);
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
   * 处理announce_player
   */
  handleAnnouncePlayer(message) {
    const { playerInfo } = message;
    
    // 存储玩家信息
    this.playerStore.set(playerInfo.id, {
      ...playerInfo,
      receivedAt: Date.now()
    });
    
    console.log('[BTDHT] Stored player info:', playerInfo.name);
  }
  
  /**
   * 生成请求ID
   */
  generateRequestId() {
    return Math.random().toString(36).substring(2, 15);
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
   * 停止定期刷新
   */
  stopRefresh() {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = null;
    }
  }
  
  /**
   * 获取统计信息
   */
  getStats() {
    return {
      nodeId: this.nodeId.toHex(),
      routingTable: this.routingTable.getStats(),
      playerStore: this.playerStore.size,
      isInitialized: this.isInitialized
    };
  }
}

// 兼容模块导出和全局变量
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { 
    BTDHTManager, 
    NodeID, 
    KBucket, 
    RoutingTable, 
    DHT_MESSAGE_TYPES 
  };
} else {
  window.BTDHTManager = BTDHTManager;
  window.NodeID = NodeID;
  window.KBucket = KBucket;
  window.RoutingTable = RoutingTable;
  window.DHT_MESSAGE_TYPES = DHT_MESSAGE_TYPES;
}
