/**
 * DHT WebRTC Bridge - DHT 和 WebRTC 之间的桥梁
 * 负责将 DHT 网络中的信令消息转发给 P2PConnectionManager
 * 并将 P2PConnectionManager 的信令消息通过 DHT 发送
 */

class DHTWebRTCBridge extends EventTarget {
  constructor(dhtManager, p2pManager, config = {}) {
    super();
    
    this.dhtManager = dhtManager;
    this.p2pManager = p2pManager;
    this.config = {
      // 是否启用 DHT 信令
      enabled: config.enabled !== false,
      // 是否优先使用 DHT（而非 WebSocket）
      preferDHT: config.preferDHT || false,
      // 消息转发超时
      forwardTimeout: config.forwardTimeout || 30000,
      // 是否记录详细日志
      verbose: config.verbose || false,
      ...config
    };
    
    // 状态
    this.isInitialized = false;
    this.isDHTAvailable = false;
    
    // 消息缓存（用于去重）
    this.messageCache = new Map();
    this.messageCacheMaxSize = 1000;
    this.messageCacheTimeout = 60000; // 1分钟
    
    // 待处理的消息队列（当 DHT 不可用时缓存）
    this.pendingQueue = [];
    this.maxPendingQueueSize = 100;
    
    // 统计信息
    this.stats = {
      offersSent: 0,
      offersReceived: 0,
      answersSent: 0,
      answersReceived: 0,
      iceCandidatesSent: 0,
      iceCandidatesReceived: 0,
      messagesForwarded: 0,
      messagesDropped: 0
    };
    
    this.log('[DHTWebRTCBridge] Created');
  }
  
  /**
   * 初始化桥梁
   */
  async init() {
    if (this.isInitialized) {
      return true;
    }
    
    if (!this.config.enabled) {
      this.log('[DHTWebRTCBridge] DHT signaling is disabled');
      return false;
    }
    
    try {
      // 设置 DHT 事件监听
      this.setupDHTListeners();
      
      // 设置 P2PManager 事件监听
      this.setupP2PListeners();
      
      this.isInitialized = true;
      this.log('[DHTWebRTCBridge] Initialized successfully');
      
      this.emit('initialized');
      return true;
    } catch (error) {
      console.error('[DHTWebRTCBridge] Initialization failed:', error);
      return false;
    }
  }
  
  /**
   * 设置 DHT 事件监听器
   */
  setupDHTListeners() {
    if (!this.dhtManager) return;
    
    // 监听 DHT 的 offer 事件
    this.dhtManager.addEventListener('offer', (event) => {
      this.handleDHTOffer(event.detail);
    });
    
    // 监听 DHT 的 answer 事件
    this.dhtManager.addEventListener('answer', (event) => {
      this.handleDHTAnswer(event.detail);
    });
    
    // 监听 DHT 的 iceCandidate 事件
    this.dhtManager.addEventListener('iceCandidate', (event) => {
      this.handleDHTIceCandidate(event.detail);
    });
    
    // 监听 DHT 初始化完成
    this.dhtManager.addEventListener('initialized', () => {
      this.isDHTAvailable = true;
      this.flushPendingQueue();
      this.emit('dhtAvailable');
    });
    
    // 监听 DHT 错误
    this.dhtManager.addEventListener('error', (event) => {
      this.isDHTAvailable = false;
      this.emit('dhtUnavailable', event.detail);
    });
  }
  
  /**
   * 设置 P2PManager 事件监听器
   */
  setupP2PListeners() {
    if (!this.p2pManager) return;
    
    // 监听 P2P 连接事件，以便拦截信令消息
    // 注意：这里我们通过重写 p2pManager 的方法来拦截
    this.interceptP2PSignaling();
  }
  
  /**
   * 拦截 P2PManager 的信令方法
   */
  interceptP2PSignaling() {
    // 保存原始方法的引用
    this._originalSendOffer = this.p2pManager.sendOffer?.bind(this.p2pManager);
    this._originalSendAnswer = this.p2pManager.sendAnswer?.bind(this.p2pManager);
    this._originalSendIceCandidate = this.p2pManager.sendIceCandidate?.bind(this.p2pManager);
  }
  
  /**
   * 处理来自 DHT 的 Offer
   */
  handleDHTOffer(detail) {
    const { fromId, offer, timestamp } = detail;
    
    // 检查消息是否重复
    if (this.isDuplicateMessage('offer', fromId, offer)) {
      return;
    }
    
    this.log('[DHTWebRTCBridge] Received offer from DHT:', fromId.substring(0, 16) + '...');
    this.stats.offersReceived++;
    
    // 转换为 P2PManager 期望的格式
    const signalData = {
      fromId: fromId,
      fromName: 'DHT Peer', // DHT 中没有玩家名称，使用默认值
      offer: offer
    };
    
    // 转发给 P2PManager
    if (this.p2pManager) {
      this.p2pManager.handleIncomingOffer(signalData);
      this.stats.messagesForwarded++;
    }
    
    this.emit('offerReceived', { fromId, offer });
  }
  
  /**
   * 处理来自 DHT 的 Answer
   */
  handleDHTAnswer(detail) {
    const { fromId, answer, timestamp } = detail;
    
    if (this.isDuplicateMessage('answer', fromId, answer)) {
      return;
    }
    
    this.log('[DHTWebRTCBridge] Received answer from DHT:', fromId.substring(0, 16) + '...');
    this.stats.answersReceived++;
    
    const signalData = {
      fromId: fromId,
      answer: answer
    };
    
    if (this.p2pManager) {
      this.p2pManager.handleIncomingAnswer(signalData);
      this.stats.messagesForwarded++;
    }
    
    this.emit('answerReceived', { fromId, answer });
  }
  
  /**
   * 处理来自 DHT 的 ICE Candidate
   */
  handleDHTIceCandidate(detail) {
    const { fromId, candidate, timestamp } = detail;
    
    if (this.isDuplicateMessage('ice-candidate', fromId, candidate)) {
      return;
    }
    
    this.log('[DHTWebRTCBridge] Received ICE candidate from DHT:', fromId.substring(0, 16) + '...');
    this.stats.iceCandidatesReceived++;
    
    const signalData = {
      fromId: fromId,
      candidate: candidate
    };
    
    if (this.p2pManager) {
      this.p2pManager.handleIncomingIceCandidate(signalData);
      this.stats.messagesForwarded++;
    }
    
    this.emit('iceCandidateReceived', { fromId, candidate });
  }
  
  /**
   * 通过 DHT 发送 Offer
   */
  async sendOffer(targetPlayerId, offer) {
    if (!this.canUseDHT()) {
      this.queueMessage('offer', targetPlayerId, offer);
      return false;
    }
    
    try {
      const success = await this.dhtManager.sendOffer(targetPlayerId, offer);
      if (success) {
        this.stats.offersSent++;
        this.emit('offerSent', { targetPlayerId, offer });
      }
      return success;
    } catch (error) {
      console.error('[DHTWebRTCBridge] Failed to send offer via DHT:', error);
      this.queueMessage('offer', targetPlayerId, offer);
      return false;
    }
  }
  
  /**
   * 通过 DHT 发送 Answer
   */
  async sendAnswer(targetPlayerId, answer) {
    if (!this.canUseDHT()) {
      this.queueMessage('answer', targetPlayerId, answer);
      return false;
    }
    
    try {
      const success = await this.dhtManager.sendAnswer(targetPlayerId, answer);
      if (success) {
        this.stats.answersSent++;
        this.emit('answerSent', { targetPlayerId, answer });
      }
      return success;
    } catch (error) {
      console.error('[DHTWebRTCBridge] Failed to send answer via DHT:', error);
      this.queueMessage('answer', targetPlayerId, answer);
      return false;
    }
  }
  
  /**
   * 通过 DHT 发送 ICE Candidate
   */
  async sendIceCandidate(targetPlayerId, candidate) {
    if (!this.canUseDHT()) {
      this.queueMessage('ice-candidate', targetPlayerId, candidate);
      return false;
    }
    
    try {
      const success = await this.dhtManager.sendIceCandidate(targetPlayerId, candidate);
      if (success) {
        this.stats.iceCandidatesSent++;
        this.emit('iceCandidateSent', { targetPlayerId, candidate });
      }
      return success;
    } catch (error) {
      console.error('[DHTWebRTCBridge] Failed to send ICE candidate via DHT:', error);
      this.queueMessage('ice-candidate', targetPlayerId, candidate);
      return false;
    }
  }
  
  /**
   * 检查是否可以使用 DHT
   */
  canUseDHT() {
    return this.config.enabled && 
           this.isInitialized && 
           this.dhtManager && 
           this.dhtManager.isInitialized;
  }
  
  /**
   * 检查消息是否重复
   */
  isDuplicateMessage(type, fromId, data) {
    const messageId = this.generateMessageId(type, fromId, data);
    const now = Date.now();
    
    // 清理过期的缓存
    this.cleanMessageCache();
    
    if (this.messageCache.has(messageId)) {
      return true;
    }
    
    // 添加到缓存
    this.messageCache.set(messageId, now);
    
    // 限制缓存大小
    if (this.messageCache.size > this.messageCacheMaxSize) {
      const firstKey = this.messageCache.keys().next().value;
      this.messageCache.delete(firstKey);
    }
    
    return false;
  }
  
  /**
   * 生成消息唯一ID
   */
  generateMessageId(type, fromId, data) {
    // 使用发送者ID和数据内容生成唯一ID
    const dataStr = typeof data === 'string' ? data : JSON.stringify(data);
    return `${type}:${fromId}:${this.hashString(dataStr)}`;
  }
  
  /**
   * 简单的字符串哈希
   */
  hashString(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(16);
  }
  
  /**
   * 清理过期的消息缓存
   */
  cleanMessageCache() {
    const now = Date.now();
    for (const [id, timestamp] of this.messageCache.entries()) {
      if (now - timestamp > this.messageCacheTimeout) {
        this.messageCache.delete(id);
      }
    }
  }
  
  /**
   * 将消息加入待处理队列
   */
  queueMessage(type, targetId, data) {
    if (this.pendingQueue.length >= this.maxPendingQueueSize) {
      this.pendingQueue.shift(); // 移除最旧的消息
      this.stats.messagesDropped++;
    }
    
    this.pendingQueue.push({
      type,
      targetId,
      data,
      timestamp: Date.now()
    });
    
    this.log('[DHTWebRTCBridge] Message queued (DHT unavailable):', type);
  }
  
  /**
   * 刷新待处理队列
   */
  async flushPendingQueue() {
    if (this.pendingQueue.length === 0) return;
    
    this.log('[DHTWebRTCBridge] Flushing pending queue:', this.pendingQueue.length, 'messages');
    
    const now = Date.now();
    const toSend = [];
    const toDrop = [];
    
    // 分类消息：超时的丢弃，未超时的发送
    for (const item of this.pendingQueue) {
      if (now - item.timestamp > this.config.forwardTimeout) {
        toDrop.push(item);
      } else {
        toSend.push(item);
      }
    }
    
    this.pendingQueue = [];
    this.stats.messagesDropped += toDrop.length;
    
    // 发送未超时的消息
    for (const item of toSend) {
      try {
        switch (item.type) {
          case 'offer':
            await this.sendOffer(item.targetId, item.data);
            break;
          case 'answer':
            await this.sendAnswer(item.targetId, item.data);
            break;
          case 'ice-candidate':
            await this.sendIceCandidate(item.targetId, item.data);
            break;
        }
      } catch (error) {
        console.error('[DHTWebRTCBridge] Failed to flush message:', error);
      }
    }
  }
  
  /**
   * 启用 DHT 信令
   */
  enable() {
    this.config.enabled = true;
    this.flushPendingQueue();
    this.emit('enabled');
  }
  
  /**
   * 禁用 DHT 信令
   */
  disable() {
    this.config.enabled = false;
    this.emit('disabled');
  }
  
  /**
   * 设置是否优先使用 DHT
   */
  setPreferDHT(prefer) {
    this.config.preferDHT = prefer;
  }
  
  /**
   * 获取统计信息
   */
  getStats() {
    return {
      ...this.stats,
      isInitialized: this.isInitialized,
      isDHTAvailable: this.canUseDHT(),
      pendingQueueSize: this.pendingQueue.length,
      messageCacheSize: this.messageCache.size,
      enabled: this.config.enabled,
      preferDHT: this.config.preferDHT
    };
  }
  
  /**
   * 重置统计信息
   */
  resetStats() {
    this.stats = {
      offersSent: 0,
      offersReceived: 0,
      answersSent: 0,
      answersReceived: 0,
      iceCandidatesSent: 0,
      iceCandidatesReceived: 0,
      messagesForwarded: 0,
      messagesDropped: 0
    };
  }
  
  /**
   * 销毁桥梁
   */
  destroy() {
    this.isInitialized = false;
    this.isDHTAvailable = false;
    
    // 清空队列
    this.pendingQueue = [];
    this.messageCache.clear();
    
    // 移除事件监听
    if (this.dhtManager) {
      // 注意：实际移除监听器需要保存引用，这里简化处理
    }
    
    this.emit('destroyed');
    this.log('[DHTWebRTCBridge] Destroyed');
  }
  
  /**
   * 日志输出
   */
  log(...args) {
    if (this.config.verbose) {
      console.log(...args);
    }
  }
  
  /**
   * 发送自定义事件
   */
  emit(eventName, data = null) {
    this.dispatchEvent(new CustomEvent(eventName, { detail: data }));
  }
  
  /**
   * 监听事件
   */
  on(eventName, callback) {
    this.addEventListener(eventName, (e) => callback(e.detail));
  }
  
  /**
   * 移除事件监听
   */
  off(eventName, callback) {
    this.removeEventListener(eventName, (e) => callback(e.detail));
  }
}

// 导出模块
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { DHTWebRTCBridge };
} else {
  window.DHTWebRTCBridge = DHTWebRTCBridge;
}
