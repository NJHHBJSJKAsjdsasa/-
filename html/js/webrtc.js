/**
 * WebRTC P2P连接模块
 * 处理点对点连接、数据通道和消息传输
 */

class P2PConnection extends EventTarget {
  constructor(config = {}) {
    super();
    
    this.config = {
      peerId: config.peerId || null,
      targetPeerId: config.targetPeerId || null,
      isInitiator: config.isInitiator || false,
      iceServers: config.iceServers || [
        // Google STUN servers
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' },
        { urls: 'stun:stun3.l.google.com:19302' },
        { urls: 'stun:stun4.l.google.com:19302' },
        // 备用STUN服务器
        { urls: 'stun:stun.cloudflare.com:3478' },
        { urls: 'stun:stun.ekiga.net:3478' },
        // TURN服务器（需要根据实际情况配置）
        // {
        //   urls: 'turn:turn.p2p修仙游戏.com:443',
        //   username: 'p2p修仙游戏',
        //   credential: 'secure-password'
        // },
        // {
        //   urls: 'turn:turn-backup.p2p修仙游戏.com:443',
        //   username: 'p2p修仙游戏',
        //   credential: 'secure-password'
        // }
      ],
      ...config
    };
    
    this.pc = null;
    this.dataChannel = null;
    this.connectionState = 'new';
    this.iceConnectionState = 'new';
    this.signalingState = 'stable';
    
    this.pendingCandidates = [];
    this.messageQueue = [];
    
    this.stats = {
      bytesSent: 0,
      bytesReceived: 0,
      messagesSent: 0,
      messagesReceived: 0,
      connectedAt: null,
      latency: 0
    };
  }

  /**
   * 创建RTCPeerConnection
   */
  createPeerConnection() {
    if (this.pc) {
      this.close();
    }
    
    try {
      this.pc = new RTCPeerConnection({
        iceServers: this.config.iceServers,
        iceTransportPolicy: 'all',
        bundlePolicy: 'balanced',
        rtcpMuxPolicy: 'require'
      });
      
      this.setupPeerConnectionHandlers();
      
      if (this.config.isInitiator) {
        this.createDataChannel();
      } else {
        this.pc.ondatachannel = (event) => {
          this.handleDataChannel(event.channel);
        };
      }
      
      this.connectionState = 'connecting';
      this.emit('connectionStateChange', { state: this.connectionState });
      
      return true;
    } catch (error) {
      console.error('[P2P] Failed to create peer connection:', error);
      this.emit('error', { type: 'create_failed', error });
      return false;
    }
  }

  /**
   * 设置PeerConnection事件处理器
   */
  setupPeerConnectionHandlers() {
    if (!this.pc) return;
    
    // 连接状态变化
    this.pc.onconnectionstatechange = () => {
      this.connectionState = this.pc.connectionState;
      this.emit('connectionStateChange', { state: this.connectionState });
      
      if (this.connectionState === 'connected') {
        this.stats.connectedAt = Date.now();
        this.emit('connected');
      } else if (this.connectionState === 'disconnected' || 
                 this.connectionState === 'failed' || 
                 this.connectionState === 'closed') {
        this.emit('disconnected', { state: this.connectionState });
      }
    };
    
    // ICE连接状态变化
    this.pc.oniceconnectionstatechange = () => {
      this.iceConnectionState = this.pc.iceConnectionState;
      this.emit('iceConnectionStateChange', { state: this.iceConnectionState });
    };
    
    // 信令状态变化
    this.pc.onsignalingstatechange = () => {
      this.signalingState = this.pc.signalingState;
      this.emit('signalingStateChange', { state: this.signalingState });
    };
    
    // ICE候选收集
    this.pc.onicecandidate = (event) => {
      if (event.candidate) {
        this.emit('iceCandidate', { 
          candidate: event.candidate,
          targetPeerId: this.config.targetPeerId 
        });
      } else {
        this.emit('iceGatheringComplete');
      }
    };
    
    // ICE收集状态变化
    this.pc.onicegatheringstatechange = () => {
      this.emit('iceGatheringStateChange', { state: this.pc.iceGatheringState });
    };
    
    // 轨道添加
    this.pc.ontrack = (event) => {
      this.emit('track', { streams: event.streams, track: event.track });
    };
    
    // 协商需要
    this.pc.onnegotiationneeded = async () => {
      if (this.config.isInitiator) {
        try {
          await this.createOffer();
        } catch (error) {
          console.error('[P2P] Negotiation failed:', error);
        }
      }
    };
  }

  /**
   * 创建数据通道
   */
  createDataChannel() {
    if (!this.pc) return null;
    
    try {
      this.dataChannel = this.pc.createDataChannel('gameData', {
        ordered: true,
        maxRetransmits: 3
      });
      
      this.setupDataChannelHandlers();
      return this.dataChannel;
    } catch (error) {
      console.error('[P2P] Failed to create data channel:', error);
      this.emit('error', { type: 'datachannel_create_failed', error });
      return null;
    }
  }

  /**
   * 处理接收到的数据通道
   */
  handleDataChannel(channel) {
    this.dataChannel = channel;
    this.setupDataChannelHandlers();
  }

  /**
   * 设置数据通道事件处理器
   */
  setupDataChannelHandlers() {
    if (!this.dataChannel) return;
    
    this.dataChannel.onopen = () => {
      this.emit('dataChannelOpen');
      this.flushMessageQueue();
    };
    
    this.dataChannel.onclose = () => {
      this.emit('dataChannelClose');
    };
    
    this.dataChannel.onerror = (error) => {
      console.error('[P2P] Data channel error:', error);
      this.emit('dataChannelError', { error });
    };
    
    this.dataChannel.onmessage = (event) => {
      this.handleMessage(event.data);
    };
  }

  /**
   * 创建Offer
   */
  async createOffer() {
    if (!this.pc) {
      throw new Error('Peer connection not created');
    }
    
    try {
      const offer = await this.pc.createOffer({
        offerToReceiveAudio: false,
        offerToReceiveVideo: false
      });
      
      await this.pc.setLocalDescription(offer);
      
      this.emit('offer', { 
        offer,
        targetPeerId: this.config.targetPeerId 
      });
      
      return offer;
    } catch (error) {
      console.error('[P2P] Failed to create offer:', error);
      this.emit('error', { type: 'offer_failed', error });
      throw error;
    }
  }

  /**
   * 处理远程Offer并创建Answer
   */
  async handleOffer(offer) {
    if (!this.pc) {
      this.createPeerConnection();
    }
    
    try {
      await this.pc.setRemoteDescription(new RTCSessionDescription(offer));
      
      // 处理等待的ICE候选
      await this.processPendingCandidates();
      
      const answer = await this.pc.createAnswer();
      await this.pc.setLocalDescription(answer);
      
      this.emit('answer', { 
        answer,
        targetPeerId: this.config.targetPeerId 
      });
      
      return answer;
    } catch (error) {
      console.error('[P2P] Failed to handle offer:', error);
      this.emit('error', { type: 'handle_offer_failed', error });
      throw error;
    }
  }

  /**
   * 处理远程Answer
   */
  async handleAnswer(answer) {
    if (!this.pc) {
      throw new Error('Peer connection not created');
    }
    
    try {
      await this.pc.setRemoteDescription(new RTCSessionDescription(answer));
      
      // 处理等待的ICE候选
      await this.processPendingCandidates();
      
      this.emit('answerHandled');
    } catch (error) {
      console.error('[P2P] Failed to handle answer:', error);
      this.emit('error', { type: 'handle_answer_failed', error });
      throw error;
    }
  }

  /**
   * 添加ICE候选
   */
  async addIceCandidate(candidate) {
    if (!this.pc) {
      this.pendingCandidates.push(candidate);
      return;
    }
    
    if (!this.pc.remoteDescription) {
      this.pendingCandidates.push(candidate);
      return;
    }
    
    try {
      await this.pc.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (error) {
      console.error('[P2P] Failed to add ICE candidate:', error);
      // 某些候选可能过期，继续处理
    }
  }

  /**
   * 处理等待的ICE候选
   */
  async processPendingCandidates() {
    if (!this.pc || !this.pc.remoteDescription) return;
    
    while (this.pendingCandidates.length > 0) {
      const candidate = this.pendingCandidates.shift();
      try {
        await this.pc.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (error) {
        console.error('[P2P] Failed to process pending candidate:', error);
      }
    }
  }

  /**
   * 处理接收到的消息
   */
  handleMessage(data) {
    try {
      let message;
      
      if (typeof data === 'string') {
        message = JSON.parse(data);
      } else if (data instanceof ArrayBuffer || data instanceof Uint8Array) {
        const decoder = new TextDecoder();
        message = JSON.parse(decoder.decode(data));
      } else {
        message = data;
      }
      
      this.stats.messagesReceived++;
      this.stats.bytesReceived += JSON.stringify(message).length;
      
      // 处理心跳消息
      if (message.type === 'heartbeat') {
        this.sendRawMessage({
          type: 'heartbeat-response',
          data: {
            timestamp: message.data.timestamp,
            receivedAt: Date.now()
          },
          from: this.config.peerId,
          timestamp: Date.now()
        });
        return;
      }
      
      // 处理心跳响应
      if (message.type === 'heartbeat-response') {
        const latency = Date.now() - message.data.timestamp;
        this.stats.latency = latency;
        this.emit('latencyUpdate', { latency });
        return;
      }
      
      this.emit('message', { 
        type: message.type,
        data: message.data,
        from: message.from,
        timestamp: message.timestamp
      });
    } catch (error) {
      console.error('[P2P] Failed to handle message:', error);
      this.emit('messageError', { error, data });
    }
  }

  /**
   * 发送消息
   */
  sendMessage(type, data) {
    const message = {
      type,
      data,
      from: this.config.peerId,
      timestamp: Date.now()
    };
    
    return this.sendRawMessage(message);
  }

  /**
   * 发送原始消息
   */
  sendRawMessage(message) {
    if (!this.isDataChannelOpen()) {
      this.messageQueue.push(message);
      return false;
    }
    
    try {
      const messageStr = JSON.stringify(message);
      this.dataChannel.send(messageStr);
      
      this.stats.messagesSent++;
      this.stats.bytesSent += messageStr.length;
      
      return true;
    } catch (error) {
      console.error('[P2P] Failed to send message:', error);
      this.messageQueue.push(message);
      this.emit('sendError', { error, message });
      return false;
    }
  }

  /**
   * 刷新消息队列
   */
  flushMessageQueue() {
    while (this.messageQueue.length > 0 && this.isDataChannelOpen()) {
      const message = this.messageQueue.shift();
      this.sendRawMessage(message);
    }
  }

  /**
   * 发送心跳
   */
  sendHeartbeat() {
    return this.sendMessage('heartbeat', { timestamp: Date.now() });
  }

  /**
   * 检查数据通道是否打开
   */
  isDataChannelOpen() {
    return this.dataChannel && this.dataChannel.readyState === 'open';
  }

  /**
   * 检查连接是否建立
   */
  isConnected() {
    return this.connectionState === 'connected' && this.isDataChannelOpen();
  }

  /**
   * 获取连接统计
   */
  getStats() {
    return {
      ...this.stats,
      connectionState: this.connectionState,
      iceConnectionState: this.iceConnectionState,
      signalingState: this.signalingState,
      dataChannelState: this.dataChannel?.readyState || 'closed',
      isConnected: this.isConnected(),
      messageQueueLength: this.messageQueue.length,
      pendingCandidatesCount: this.pendingCandidates.length
    };
  }

  /**
   * 关闭连接
   */
  close() {
    if (this.dataChannel) {
      this.dataChannel.close();
      this.dataChannel = null;
    }
    
    if (this.pc) {
      this.pc.close();
      this.pc = null;
    }
    
    this.connectionState = 'closed';
    this.messageQueue = [];
    this.pendingCandidates = [];
    
    this.emit('closed');
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

/**
 * P2P连接管理器 - 管理多个P2P连接
 */
class P2PConnectionManager extends EventTarget {
  constructor(networkManager, config = {}) {
    super();
    
    this.networkManager = networkManager;
    this.config = {
      // 是否启用 DHT 信令作为备选
      enableDHTSignaling: config.enableDHTSignaling !== false,
      // 当 WebSocket 不可用时切换到 DHT
      fallbackToDHT: config.fallbackToDHT !== false,
      // 优先使用 DHT（而非 WebSocket）
      preferDHT: config.preferDHT || false,
      ...config
    };
    this.connections = new Map();
    this.messageHandlers = new Map();
    
    // DHT 相关
    this.dhtBridge = null;
    this.dhtManager = null;
    this.useDHTSignaling = false;
    
    this.setupNetworkHandlers();
  }
  
  /**
   * 设置 DHT 管理器和桥梁
   * @param {DHTManager} dhtManager - DHT 管理器实例
   * @param {DHTWebRTCBridge} dhtBridge - DHT WebRTC 桥梁实例（可选，会自动创建）
   */
  async setupDHT(dhtManager, dhtBridge = null) {
    if (!this.config.enableDHTSignaling) {
      console.log('[P2PManager] DHT signaling is disabled');
      return false;
    }
    
    if (!dhtManager) {
      console.warn('[P2PManager] DHT manager not provided');
      return false;
    }
    
    this.dhtManager = dhtManager;
    
    // 如果提供了桥梁实例则使用，否则自动创建
    if (dhtBridge) {
      this.dhtBridge = dhtBridge;
    } else if (typeof DHTWebRTCBridge !== 'undefined') {
      this.dhtBridge = new DHTWebRTCBridge(dhtManager, this, {
        enabled: true,
        preferDHT: this.config.preferDHT,
        verbose: false
      });
    } else {
      console.warn('[P2PManager] DHTWebRTCBridge not available');
      return false;
    }
    
    // 设置 DHT 桥梁的事件监听
    this.setupDHTBridgeListeners();
    
    // 初始化桥梁
    const success = await this.dhtBridge.init();
    
    if (success) {
      console.log('[P2PManager] DHT signaling setup complete');
      
      // 如果 WebSocket 当前不可用，立即切换到 DHT
      if (this.config.fallbackToDHT && this.networkManager && !this.networkManager.isConnected) {
        this.enableDHTSignaling();
      }
    }
    
    return success;
  }
  
  /**
   * 设置 DHT 桥梁事件监听
   */
  setupDHTBridgeListeners() {
    if (!this.dhtBridge) return;
    
    // 当 DHT 可用时，如果 WebSocket 不可用则切换到 DHT
    this.dhtBridge.on('dhtAvailable', () => {
      console.log('[P2PManager] DHT is now available');
      if (this.config.fallbackToDHT && this.networkManager && !this.networkManager.isConnected) {
        this.enableDHTSignaling();
      }
    });
    
    // 当 DHT 不可用时，如果正在使用 DHT 则发出警告
    this.dhtBridge.on('dhtUnavailable', () => {
      console.warn('[P2PManager] DHT is now unavailable');
      if (this.useDHTSignaling) {
        this.emit('signalingUnavailable', { type: 'dht' });
      }
    });
  }
  
  /**
   * 启用 DHT 信令
   */
  enableDHTSignaling() {
    if (!this.dhtBridge || !this.dhtBridge.canUseDHT()) {
      console.warn('[P2PManager] Cannot enable DHT signaling: DHT not available');
      return false;
    }
    
    this.useDHTSignaling = true;
    console.log('[P2PManager] DHT signaling enabled');
    this.emit('dhtSignalingEnabled');
    return true;
  }
  
  /**
   * 禁用 DHT 信令，切换回 WebSocket
   */
  disableDHTSignaling() {
    this.useDHTSignaling = false;
    console.log('[P2PManager] DHT signaling disabled, using WebSocket');
    this.emit('dhtSignalingDisabled');
  }
  
  /**
   * 检查是否使用 DHT 信令
   */
  isUsingDHTSignaling() {
    return this.useDHTSignaling;
  }
  
  /**
   * 获取当前信令方式
   */
  getSignalingMethod() {
    return this.useDHTSignaling ? 'dht' : 'websocket';
  }

  /**
   * 设置网络处理器
   */
  setupNetworkHandlers() {
    // 处理收到的Offer
    this.networkManager.onSignal('offer', (data) => {
      this.handleIncomingOffer(data);
    });
    
    // 处理收到的Answer
    this.networkManager.onSignal('answer', (data) => {
      this.handleIncomingAnswer(data);
    });
    
    // 处理收到的ICE候选
    this.networkManager.onSignal('ice-candidate', (data) => {
      this.handleIncomingIceCandidate(data);
    });
  }

  /**
   * 创建到目标玩家的连接
   */
  async connectToPlayer(targetPeerId) {
    if (this.connections.has(targetPeerId)) {
      const existing = this.connections.get(targetPeerId);
      if (existing.isConnected()) {
        return existing;
      }
      existing.close();
    }
    
    const connection = new P2PConnection({
      peerId: this.networkManager.getPlayer()?.id,
      targetPeerId,
      isInitiator: true,
      ...this.config
    });
    
    this.setupConnectionHandlers(connection, targetPeerId);
    this.connections.set(targetPeerId, connection);
    
    // 异步创建连接，不阻塞调用
    setTimeout(() => {
      try {
        connection.createPeerConnection();
      } catch (error) {
        console.error('[P2PManager] Failed to create peer connection:', error);
        this.connections.delete(targetPeerId);
        this.emit('connectionError', { peerId: targetPeerId, error });
      }
    }, 0);
    
    return connection;
  }

  /**
   * 设置连接事件处理器
   */
  setupConnectionHandlers(connection, targetPeerId) {
    // 转发ICE候选到信令服务器或 DHT
    connection.on('iceCandidate', (data) => {
      this.sendIceCandidate(targetPeerId, data.candidate);
    });
    
    // 转发Offer到信令服务器或 DHT
    connection.on('offer', (data) => {
      this.sendOffer(targetPeerId, data.offer);
    });
    
    // 转发Answer到信令服务器或 DHT
    connection.on('answer', (data) => {
      this.sendAnswer(targetPeerId, data.answer);
    });
    
    // 连接建立
    connection.on('connected', () => {
      this.emit('peerConnected', { peerId: targetPeerId, connection });
    });
    
    // 连接断开
    connection.on('disconnected', () => {
      this.emit('peerDisconnected', { peerId: targetPeerId });
    });
    
    // 收到消息
    connection.on('message', (data) => {
      this.handleMessage(targetPeerId, data);
    });
    
    // 连接关闭
    connection.on('closed', () => {
      this.connections.delete(targetPeerId);
      this.emit('peerClosed', { peerId: targetPeerId });
    });
  }

  /**
   * 处理收到的Offer（作为应答方）
   */
  async handleIncomingOffer(data) {
    const { fromId, fromName, offer } = data;
    
    if (this.connections.has(fromId)) {
      const existing = this.connections.get(fromId);
      existing.close();
    }
    
    const connection = new P2PConnection({
      peerId: this.networkManager.getPlayer()?.id,
      targetPeerId: fromId,
      isInitiator: false,
      ...this.config
    });
    
    this.setupConnectionHandlers(connection, fromId);
    this.connections.set(fromId, connection);
    
    await connection.handleOffer(offer);
    
    this.emit('incomingConnection', { peerId: fromId, peerName: fromName });
  }

  /**
   * 处理收到的Answer
   */
  async handleIncomingAnswer(data) {
    const { fromId, answer } = data;
    const connection = this.connections.get(fromId);
    
    if (connection) {
      await connection.handleAnswer(answer);
    }
  }

  /**
   * 处理收到的ICE候选
   */
  async handleIncomingIceCandidate(data) {
    const { fromId, candidate } = data;
    const connection = this.connections.get(fromId);
    
    if (connection) {
      await connection.addIceCandidate(candidate);
    }
  }

  /**
   * 处理收到的消息
   */
  handleMessage(peerId, messageData) {
    const { type, data } = messageData;
    
    this.emit('message', { peerId, type, data });
    
    const handlers = this.messageHandlers.get(type);
    if (handlers) {
      handlers.forEach(handler => {
        try {
          handler(data, peerId);
        } catch (error) {
          console.error(`[P2PManager] Message handler error for ${type}:`, error);
        }
      });
    }
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
   * 发送消息给指定玩家
   */
  sendMessage(peerId, type, data) {
    const connection = this.connections.get(peerId);
    if (connection) {
      return connection.sendMessage(type, data);
    }
    return false;
  }

  /**
   * 广播消息给所有连接的玩家
   */
  broadcastMessage(type, data, excludePeerId = null) {
    let sentCount = 0;
    
    this.connections.forEach((connection, peerId) => {
      if (peerId !== excludePeerId && connection.isConnected()) {
        if (connection.sendMessage(type, data)) {
          sentCount++;
        }
      }
    });
    
    return sentCount;
  }

  /**
   * 获取连接
   */
  getConnection(peerId) {
    return this.connections.get(peerId);
  }

  /**
   * 获取所有连接
   */
  getAllConnections() {
    return Array.from(this.connections.entries()).map(([peerId, connection]) => ({
      peerId,
      connection,
      isConnected: connection.isConnected(),
      stats: connection.getStats()
    }));
  }

  /**
   * 获取已连接的 peers
   */
  getConnectedPeers() {
    return Array.from(this.connections.entries())
      .filter(([_, connection]) => connection.isConnected())
      .map(([peerId, connection]) => ({
        peerId,
        stats: connection.getStats()
      }));
  }

  /**
   * 发送 Offer（通过 WebSocket 或 DHT）
   * @param {string} targetPeerId - 目标对等点ID
   * @param {RTCSessionDescriptionInit} offer - WebRTC offer
   * @returns {boolean} 是否发送成功
   */
  sendOffer(targetPeerId, offer) {
    // 如果使用 DHT 信令且 DHT 可用
    if (this.useDHTSignaling && this.dhtBridge) {
      this.dhtBridge.sendOffer(targetPeerId, offer);
      return true;
    }
    
    // 否则使用 WebSocket
    if (this.networkManager) {
      return this.networkManager.sendOffer(targetPeerId, offer);
    }
    
    return false;
  }

  /**
   * 发送 Answer（通过 WebSocket 或 DHT）
   * @param {string} targetPeerId - 目标对等点ID
   * @param {RTCSessionDescriptionInit} answer - WebRTC answer
   * @returns {boolean} 是否发送成功
   */
  sendAnswer(targetPeerId, answer) {
    // 如果使用 DHT 信令且 DHT 可用
    if (this.useDHTSignaling && this.dhtBridge) {
      this.dhtBridge.sendAnswer(targetPeerId, answer);
      return true;
    }
    
    // 否则使用 WebSocket
    if (this.networkManager) {
      return this.networkManager.sendAnswer(targetPeerId, answer);
    }
    
    return false;
  }

  /**
   * 发送 ICE Candidate（通过 WebSocket 或 DHT）
   * @param {string} targetPeerId - 目标对等点ID
   * @param {RTCIceCandidateInit} candidate - ICE candidate
   * @returns {boolean} 是否发送成功
   */
  sendIceCandidate(targetPeerId, candidate) {
    // 如果使用 DHT 信令且 DHT 可用
    if (this.useDHTSignaling && this.dhtBridge) {
      this.dhtBridge.sendIceCandidate(targetPeerId, candidate);
      return true;
    }
    
    // 否则使用 WebSocket
    if (this.networkManager) {
      return this.networkManager.sendIceCandidate(targetPeerId, candidate);
    }
    
    return false;
  }

  /**
   * 断开与指定玩家的连接
   */
  disconnectPeer(peerId) {
    const connection = this.connections.get(peerId);
    if (connection) {
      connection.close();
      this.connections.delete(peerId);
    }
  }

  /**
   * 断开所有连接
   */
  disconnectAll() {
    this.connections.forEach(connection => {
      connection.close();
    });
    this.connections.clear();
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
  module.exports = { P2PConnection, P2PConnectionManager };
}
