/**
 * 网络管理模块 - WebSocket连接管理
 * 处理与信令服务器的连接、房间管理和P2P信令转发
 * 支持信令节点发现和故障转移
 */

class NetworkManager extends EventTarget {
  constructor(config = {}) {
    super();
    
    this.config = {
      signalingUrl: config.signalingUrl || 'ws://49.232.170.26:5050',
      signalNodes: config.signalNodes || [
        // 北美节点
        'ws://us-bootstrap.p2p修仙游戏.com:5050',
        // 欧洲节点
        'ws://eu-bootstrap.p2p修仙游戏.com:5050',
        // 亚洲节点
        'ws://asia-bootstrap.p2p修仙游戏.com:5050',
        // 备用节点
        'ws://49.232.170.26:5050'
      ],
      reconnectInterval: config.reconnectInterval || 3000,
      maxReconnectAttempts: config.maxReconnectAttempts || 5,
      heartbeatInterval: config.heartbeatInterval || 30000,
      nodeRefreshInterval: config.nodeRefreshInterval || 60000,
      // DHT 配置
      enableDHTFallback: config.enableDHTFallback !== false,
      dhtBootstrapNodes: config.dhtBootstrapNodes || [
        { url: 'ws://49.232.170.26:5050/dht', nodeId: null }
      ],
      ...config
    };
    
    this.socket = null;
    this.isConnected = false;
    this.isConnecting = false;
    this.reconnectAttempts = 0;
    this.reconnectTimer = null;
    this.heartbeatTimer = null;
    this.nodeRefreshTimer = null;
    this.nodeUpdateTimer = null;
    
    this.player = null;
    this.currentRoom = null;
    this.players = new Map();
    this.rooms = [];
    
    this.signalHandlers = new Map();
    
    // 信令节点管理
    this.signalNodes = []; // 存储所有可用信令节点
    this.currentNode = null; // 当前连接的信令节点
    this.nodeLatencies = new Map(); // 节点延迟缓存
    this.isFailoverInProgress = false; // 是否正在进行故障转移
    
    // DHT 相关
    this.dhtManager = null;
    this.dhtBridge = null;
    this.p2pManager = null;
    this.isDHTFallbackActive = false; // 是否正在使用 DHT 作为备选
  }
  
  /**
   * 设置 DHT 管理器
   * @param {DHTManager} dhtManager - DHT 管理器实例
   */
  async setupDHT(dhtManager) {
    if (!this.config.enableDHTFallback) {
      console.log('[Network] DHT fallback is disabled');
      return false;
    }
    
    if (!dhtManager) {
      // 如果没有提供 DHT 管理器，尝试创建一个
      if (typeof DHTManager !== 'undefined') {
        dhtManager = new DHTManager({
          bootstrapNodes: this.config.dhtBootstrapNodes
        });
        const success = await dhtManager.init();
        if (!success) {
          console.warn('[Network] Failed to initialize DHT manager');
          return false;
        }
      } else {
        console.warn('[Network] DHTManager not available');
        return false;
      }
    }
    
    this.dhtManager = dhtManager;
    
    // 监听 DHT 初始化
    if (!dhtManager.isInitialized) {
      dhtManager.addEventListener('initialized', () => {
        console.log('[Network] DHT initialized, ready for fallback');
        this.emit('dhtReady');
      });
    } else {
      console.log('[Network] DHT already initialized');
    }
    
    console.log('[Network] DHT fallback setup complete');
    return true;
  }
  
  /**
   * 设置 P2P 连接管理器（用于 DHT 信令）
   * @param {P2PConnectionManager} p2pManager - P2P 连接管理器实例
   */
  setP2PManager(p2pManager) {
    this.p2pManager = p2pManager;
  }
  
  /**
   * 激活 DHT 备选信令
   * 当所有 WebSocket 节点都不可用时调用
   */
  async activateDHTFallback() {
    if (!this.config.enableDHTFallback || !this.dhtManager) {
      console.warn('[Network] Cannot activate DHT fallback: not configured');
      return false;
    }
    
    if (!this.dhtManager.isInitialized) {
      console.warn('[Network] DHT not initialized, trying to initialize...');
      const success = await this.dhtManager.init();
      if (!success) {
        console.error('[Network] Failed to initialize DHT for fallback');
        return false;
      }
    }
    
    // 如果 P2P 管理器存在，设置 DHT 信令
    if (this.p2pManager && !this.p2pManager.dhtBridge) {
      await this.p2pManager.setupDHT(this.dhtManager);
      this.p2pManager.enableDHTSignaling();
    }
    
    this.isDHTFallbackActive = true;
    console.log('[Network] DHT fallback activated');
    this.emit('dhtFallbackActivated');
    
    return true;
  }
  
  /**
   * 停用 DHT 备选信令，恢复 WebSocket
   */
  deactivateDHTFallback() {
    this.isDHTFallbackActive = false;
    
    if (this.p2pManager) {
      this.p2pManager.disableDHTSignaling();
    }
    
    console.log('[Network] DHT fallback deactivated');
    this.emit('dhtFallbackDeactivated');
  }
  
  /**
   * 检查是否使用 DHT 备选
   */
  isUsingDHTFallback() {
    return this.isDHTFallbackActive;
  }

  /**
   * 获取信令节点列表
   * 从服务器获取完整的信令网络拓扑
   */
  async fetchSignalNodes() {
    if (!this.isConnected || !this.socket) {
      return Promise.reject(new Error('Not connected to server'));
    }
    
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Fetch signal nodes timeout'));
      }, 10000);
      
      const onNodesReceived = (data) => {
        clearTimeout(timeout);
        this.socket.off('signal:nodes', onNodesReceived);
        
        if (data.nodes && Array.isArray(data.nodes)) {
          this.signalNodes = data.nodes;
          this.emit('signalNodesUpdated', { nodes: this.signalNodes });
          resolve(data);
        } else {
          reject(new Error('Invalid signal nodes data'));
        }
      };
      
      this.socket.emit('signal:nodes', onNodesReceived);
    });
  }

  /**
   * 测试节点延迟
   * @param {string} nodeUrl - 节点地址
   * @returns {Promise<number>} 延迟(ms)
   */
  async testNodeLatency(nodeUrl) {
    // 检查缓存的延迟值（5分钟内有效）
    const cached = this.nodeLatencies.get(nodeUrl);
    if (cached && (Date.now() - cached.timestamp) < 5 * 60 * 1000) {
      return cached.latency;
    }
    
    return new Promise((resolve) => {
      const startTime = Date.now();
      const testSocket = io(nodeUrl, {
        transports: ['websocket'],
        reconnection: false,
        timeout: 3000 // 减少超时时间，提高测试速度
      });
      
      const timeout = setTimeout(() => {
        testSocket.close();
        this.nodeLatencies.set(nodeUrl, { latency: -1, timestamp: Date.now() });
        resolve(-1);
      }, 3000);
      
      testSocket.on('connect', () => {
        clearTimeout(timeout);
        const latency = Date.now() - startTime;
        testSocket.close();
        this.nodeLatencies.set(nodeUrl, { latency, timestamp: Date.now() });
        resolve(latency);
      });
      
      testSocket.on('connect_error', () => {
        clearTimeout(timeout);
        testSocket.close();
        this.nodeLatencies.set(nodeUrl, { latency: -1, timestamp: Date.now() });
        resolve(-1);
      });
    });
  }

  /**
   * 选择最佳节点
   * 测试所有节点的延迟，选择延迟最低的节点
   */
  async selectBestNode() {
    if (this.signalNodes.length === 0) {
      return this.config.signalingUrl;
    }
    
    const nodesToTest = [
      { url: this.config.signalingUrl, isDefault: true },
      ...this.signalNodes.map(node => ({ 
        url: node.url || node, 
        isDefault: false 
      }))
    ];
    
    const latencyResults = [];
    
    // 并行测试所有节点的延迟
    const testPromises = nodesToTest.map(async (node) => {
      try {
        const latency = await this.testNodeLatency(node.url);
        if (latency > 0) {
          const result = { url: node.url, latency, isDefault: node.isDefault };
          latencyResults.push(result);
          this.nodeLatencies.set(node.url, latency);
          return result;
        }
      } catch (error) {
        console.warn(`[Network] Failed to test node ${node.url}:`, error);
      }
      return null;
    });
    
    await Promise.all(testPromises);
    
    if (latencyResults.length === 0) {
      return this.config.signalingUrl;
    }
    
    // 按延迟排序，选择延迟最低的节点
    latencyResults.sort((a, b) => a.latency - b.latency);
    
    this.emit('nodeLatencyTested', { results: latencyResults });
    
    return latencyResults[0].url;
  }

  /**
   * 连接到最佳节点
   */
  async connectToBestNode() {
    if (this.isConnecting) {
      return Promise.resolve();
    }
    
    this.isConnecting = true;
    this.emit('connecting');
    
    try {
      // 如果有多个节点配置，测试并选择最佳节点
      if (this.config.signalNodes.length > 0 || this.signalNodes.length > 0) {
        const bestNode = await this.selectBestNode();
        this.config.signalingUrl = bestNode;
        this.currentNode = bestNode;
      }
      
      await this.connect();
    } catch (error) {
      this.isConnecting = false;
      throw error;
    }
  }

  /**
   * 故障转移
   * 当主节点失败时，切换到备用节点
   */
  async failover() {
    if (this.isFailoverInProgress) {
      return;
    }
    
    this.isFailoverInProgress = true;
    this.emit('failoverStarted');
    
    // 断开当前连接
    this.disconnect(false);
    
    // 从可用节点中排除当前失败的节点
    const availableNodes = [
      this.config.signalingUrl,
      ...this.signalNodes.map(n => n.url || n)
    ].filter(url => url !== this.currentNode);
    
    if (availableNodes.length === 0) {
      this.isFailoverInProgress = false;
      
      // 如果没有可用节点，尝试激活 DHT 备选
      if (this.config.enableDHTFallback) {
        console.log('[Network] No WebSocket nodes available, trying DHT fallback...');
        const dhtSuccess = await this.activateDHTFallback();
        if (dhtSuccess) {
          this.emit('failoverToDHT');
          return;
        }
      }
      
      this.emit('failoverFailed', { error: 'No available nodes' });
      return;
    }
    
    // 测试所有可用节点的延迟，选择最佳节点
    const nodeLatencies = [];
    const testPromises = availableNodes.map(async (nodeUrl) => {
      try {
        const latency = await this.testNodeLatency(nodeUrl);
        if (latency > 0) {
          nodeLatencies.push({ url: nodeUrl, latency });
        }
      } catch (error) {
        console.warn(`[Network] Failed to test node ${nodeUrl}:`, error);
      }
    });
    
    await Promise.all(testPromises);
    
    // 按延迟排序，优先尝试延迟低的节点
    nodeLatencies.sort((a, b) => a.latency - b.latency);
    
    const nodesToTry = nodeLatencies.length > 0 
      ? nodeLatencies.map(n => n.url) 
      : availableNodes;
    
    // 尝试连接其他节点
    for (const nodeUrl of nodesToTry) {
      try {
        this.config.signalingUrl = nodeUrl;
        this.emit('failoverAttempt', { nodeUrl });
        await this.connect();
        this.currentNode = nodeUrl;
        this.isFailoverInProgress = false;
        
        // 如果之前使用了 DHT 备选，现在停用
        if (this.isDHTFallbackActive) {
          this.deactivateDHTFallback();
        }
        
        this.emit('failoverSuccess', { nodeUrl });
        return;
      } catch (error) {
        console.warn(`[Network] Failover to ${nodeUrl} failed:`, error);
        continue;
      }
    }
    
    this.isFailoverInProgress = false;
    
    // 所有节点都失败了，尝试 DHT 备选
    if (this.config.enableDHTFallback) {
      console.log('[Network] All WebSocket nodes failed, trying DHT fallback...');
      const dhtSuccess = await this.activateDHTFallback();
      if (dhtSuccess) {
        this.emit('failoverToDHT');
        return;
      }
    }
    
    this.emit('failoverFailed', { error: 'All nodes failed' });
  }

  /**
   * 启动节点列表刷新定时器
   */
  startNodeRefresh() {
    this.stopNodeRefresh();
    
    this.nodeRefreshTimer = setInterval(async () => {
      if (this.isConnected) {
        try {
          await this.fetchSignalNodes();
        } catch (error) {
          console.warn('[Network] Failed to refresh signal nodes:', error);
        }
      }
    }, this.config.nodeRefreshInterval);
  }

  /**
   * 停止节点列表刷新定时器
   */
  stopNodeRefresh() {
    if (this.nodeRefreshTimer) {
      clearInterval(this.nodeRefreshTimer);
      this.nodeRefreshTimer = null;
    }
  }

  /**
   * 连接到信令服务器
   */
  connect() {
    if (this.isConnected || this.isConnecting) {
      return Promise.resolve();
    }
    
    this.isConnecting = true;
    this.emit('connecting');
    
    return new Promise((resolve, reject) => {
      try {
        this.socket = io(this.config.signalingUrl, {
          transports: ['websocket'],
          reconnection: false
        });
        
        this.setupSocketHandlers();
        
        this.socket.on('connect', async () => {
          this.isConnected = true;
        this.isConnecting = false;
        this.reconnectAttempts = 0;
        this.currentNode = this.config.signalingUrl;
        this.startHeartbeat();
        this.startNodeRefresh();
        this.startNodeUpdate();
        this.emit('connected', { socketId: this.socket.id, nodeUrl: this.currentNode });
          
          // 连接成功后获取信令节点列表
          try {
            await this.fetchSignalNodes();
          } catch (error) {
            console.warn('[Network] Failed to fetch signal nodes after connect:', error);
          }
          
          resolve();
        });
        
        this.socket.on('connect_error', (error) => {
          this.isConnecting = false;
          this.emit('connect_error', error);
          this.scheduleReconnect();
          reject(error);
        });
        
      } catch (error) {
        this.isConnecting = false;
        this.emit('error', error);
        reject(error);
      }
    });
  }

  /**
   * 设置Socket事件处理器
   */
  setupSocketHandlers() {
    if (!this.socket) return;
    
    // 断开连接
    this.socket.on('disconnect', (reason) => {
      this.isConnected = false;
      this.stopHeartbeat();
      this.stopNodeRefresh();
      this.emit('disconnected', { reason });
      
      if (reason !== 'io client disconnect') {
        // 如果不是手动断开，尝试故障转移
        if (this.signalNodes.length > 0 && !this.isFailoverInProgress) {
          this.failover();
        } else {
          this.scheduleReconnect();
        }
      }
    });
    
    // 错误处理
    this.socket.on('error', (error) => {
      this.emit('error', error);
    });
    
    // 玩家加入响应
    this.socket.on('player:joined', (data) => {
      this.player = data.player;
      this.emit('playerJoined', data);
    });
    
    // 房间创建响应
    this.socket.on('room:created', (data) => {
      this.currentRoom = data.room;
      this.emit('roomCreated', data);
    });
    
    // 房间加入响应
    this.socket.on('room:joined', (data) => {
      this.currentRoom = data.room;
      this.updatePlayersFromRoom(data.room);
      this.emit('roomJoined', data);
    });
    
    // 离开房间响应
    this.socket.on('room:left', () => {
      this.currentRoom = null;
      this.players.clear();
      this.emit('roomLeft');
    });
    
    // 房间列表响应
    this.socket.on('room:list', (data) => {
      this.rooms = data.rooms;
      this.emit('roomList', data);
    });
    
    // 其他玩家加入房间
    this.socket.on('player:joined-room', (data) => {
      this.players.set(data.player.id, data.player);
      this.emit('playerJoinedRoom', data);
    });
    
    // 其他玩家离开房间
    this.socket.on('player:left-room', (data) => {
      this.players.delete(data.playerId);
      this.emit('playerLeftRoom', data);
    });
    
    // P2P信令 - Offer
    this.socket.on('signal:offer', (data) => {
      this.emit('signalOffer', data);
      this.handleSignal('offer', data);
    });
    
    // P2P信令 - Answer
    this.socket.on('signal:answer', (data) => {
      this.emit('signalAnswer', data);
      this.handleSignal('answer', data);
    });
    
    // P2P信令 - ICE候选
    this.socket.on('signal:ice-candidate', (data) => {
      this.emit('signalIceCandidate', data);
      this.handleSignal('ice-candidate', data);
    });
    
    // 信令节点列表更新
    this.socket.on('signal:nodes', (data) => {
      if (data.nodes && Array.isArray(data.nodes)) {
        this.signalNodes = data.nodes;
        this.emit('signalNodesUpdated', { nodes: this.signalNodes });
      }
    });
    
    // 服务器错误
    this.socket.on('error', (data) => {
      this.emit('serverError', data);
    });
  }

  /**
   * 从房间信息更新玩家列表
   */
  updatePlayersFromRoom(room) {
    this.players.clear();
    if (room.players) {
      room.players.forEach(player => {
        if (player.id !== this.player?.id) {
          this.players.set(player.id, player);
        }
      });
    }
  }

  /**
   * 注册信令处理器
   */
  onSignal(type, handler) {
    if (!this.signalHandlers.has(type)) {
      this.signalHandlers.set(type, []);
    }
    this.signalHandlers.get(type).push(handler);
  }

  /**
   * 移除信令处理器
   */
  offSignal(type, handler) {
    const handlers = this.signalHandlers.get(type);
    if (handlers) {
      const index = handlers.indexOf(handler);
      if (index !== -1) {
        handlers.splice(index, 1);
      }
    }
  }

  /**
   * 处理信令消息
   */
  handleSignal(type, data) {
    const handlers = this.signalHandlers.get(type);
    if (handlers) {
      handlers.forEach(handler => {
        try {
          handler(data);
        } catch (error) {
          console.error(`[Network] Signal handler error for ${type}:`, error);
        }
      });
    }
  }

  /**
   * 加入游戏（玩家登录）
   */
  joinGame(playerName) {
    if (!this.isConnected) {
      return Promise.reject(new Error('Not connected to server'));
    }
    
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Join game timeout'));
      }, 10000);
      
      const onJoined = (data) => {
        clearTimeout(timeout);
        this.off('playerJoined', onJoined);
        resolve(data);
      };
      
      this.on('playerJoined', onJoined);
      this.socket.emit('player:join', { name: playerName });
    });
  }

  /**
   * 创建房间
   */
  createRoom(roomName, maxPlayers = 4) {
    if (!this.isConnected) {
      return Promise.reject(new Error('Not connected to server'));
    }
    
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Create room timeout'));
      }, 10000);
      
      const onCreated = (data) => {
        clearTimeout(timeout);
        this.off('roomCreated', onCreated);
        resolve(data);
      };
      
      this.on('roomCreated', onCreated);
      this.socket.emit('room:create', { name: roomName, maxPlayers });
    });
  }

  /**
   * 加入房间
   */
  joinRoom(roomId) {
    if (!this.isConnected) {
      return Promise.reject(new Error('Not connected to server'));
    }
    
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Join room timeout'));
      }, 10000);
      
      const onJoined = (data) => {
        clearTimeout(timeout);
        this.off('roomJoined', onJoined);
        resolve(data);
      };
      
      const onError = (data) => {
        clearTimeout(timeout);
        this.off('serverError', onError);
        reject(new Error(data.message));
      };
      
      this.on('roomJoined', onJoined);
      this.on('serverError', onError);
      this.socket.emit('room:join', { roomId });
    });
  }

  /**
   * 离开房间
   */
  leaveRoom() {
    if (!this.isConnected || !this.currentRoom) {
      return Promise.resolve();
    }
    
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        resolve();
      }, 5000);
      
      const onLeft = () => {
        clearTimeout(timeout);
        this.off('roomLeft', onLeft);
        resolve();
      };
      
      this.on('roomLeft', onLeft);
      this.socket.emit('room:leave');
    });
  }

  /**
   * 获取房间列表
   */
  listRooms() {
    if (!this.isConnected) {
      return Promise.reject(new Error('Not connected to server'));
    }
    
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('List rooms timeout'));
      }, 10000);
      
      const onList = (data) => {
        clearTimeout(timeout);
        this.off('roomList', onList);
        resolve(data);
      };
      
      this.on('roomList', onList);
      this.socket.emit('room:list');
    });
  }

  /**
   * 发送P2P Offer
   */
  sendOffer(targetId, offer) {
    if (!this.isConnected) {
      console.error('[Network] Cannot send offer: not connected');
      return false;
    }
    
    this.socket.emit('signal:offer', { targetId, offer });
    return true;
  }

  /**
   * 发送P2P Answer
   */
  sendAnswer(targetId, answer) {
    if (!this.isConnected) {
      console.error('[Network] Cannot send answer: not connected');
      return false;
    }
    
    this.socket.emit('signal:answer', { targetId, answer });
    return true;
  }

  /**
   * 发送ICE候选
   */
  sendIceCandidate(targetId, candidate) {
    if (!this.isConnected) {
      console.error('[Network] Cannot send ICE candidate: not connected');
      return false;
    }
    
    this.socket.emit('signal:ice-candidate', { targetId, candidate });
    return true;
  }

  /**
   * 安排重连
   */
  scheduleReconnect() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }
    
    if (this.reconnectAttempts >= this.config.maxReconnectAttempts) {
      this.emit('reconnect_failed');
      return;
    }
    
    this.reconnectAttempts++;
    this.emit('reconnecting', { attempt: this.reconnectAttempts });
    
    this.reconnectTimer = setTimeout(() => {
      // 尝试故障转移或重连
      if (this.signalNodes.length > 0 && !this.isFailoverInProgress) {
        this.failover();
      } else {
        this.connect().catch(() => {
          // 重连失败，继续尝试
        });
      }
    }, this.config.reconnectInterval);
  }

  /**
   * 启动心跳检测
   */
  startHeartbeat() {
    this.stopHeartbeat();
    
    this.heartbeatTimer = setInterval(() => {
      if (this.socket && this.isConnected) {
        this.socket.emit('ping');
      }
    }, this.config.heartbeatInterval);
  }

  /**
   * 停止心跳检测
   */
  stopHeartbeat() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  /**
   * 断开连接
   * @param {boolean} clearNodes - 是否清除节点列表
   */
  disconnect(clearNodes = true) {
    this.stopHeartbeat();
    this.stopNodeRefresh();
    this.stopNodeUpdate();
    
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
    
    this.isConnected = false;
    this.isConnecting = false;
    this.player = null;
    this.currentRoom = null;
    this.players.clear();
    this.rooms = [];
    
    if (clearNodes) {
      this.signalNodes = [];
      this.currentNode = null;
    }
    
    this.emit('disconnected', { reason: 'manual' });
  }

  /**
   * 获取在线玩家列表（不包括自己）
   */
  getOnlinePlayers() {
    return Array.from(this.players.values());
  }

  /**
   * 获取当前房间信息
   */
  getCurrentRoom() {
    return this.currentRoom;
  }

  /**
   * 获取当前玩家信息
   */
  getPlayer() {
    return this.player;
  }

  /**
   * 获取信令节点列表
   */
  getSignalNodes() {
    return this.signalNodes;
  }

  /**
   * 获取当前连接的节点
   */
  getCurrentNode() {
    return this.currentNode;
  }

  /**
   * 添加信令节点
   */
  addSignalNodes(nodes) {
    if (Array.isArray(nodes)) {
      nodes.forEach(node => {
        const nodeUrl = node.url || node;
        if (!this.signalNodes.some(n => (n.url || n) === nodeUrl)) {
          this.signalNodes.push(node);
        }
      });
    }
  }

  /**
   * 移除信令节点
   */
  removeSignalNode(nodeUrl) {
    this.signalNodes = this.signalNodes.filter(node => (node.url || node) !== nodeUrl);
  }

  /**
   * 清理无效节点
   */
  async cleanInvalidNodes() {
    const validNodes = [];
    
    for (const node of this.signalNodes) {
      const nodeUrl = node.url || node;
      try {
        const latency = await this.testNodeLatency(nodeUrl);
        if (latency > 0) {
          validNodes.push(node);
        } else {
          console.warn(`[Network] Removing invalid node: ${nodeUrl}`);
        }
      } catch (error) {
        console.warn(`[Network] Removing invalid node: ${nodeUrl}`, error);
      }
    }
    
    this.signalNodes = validNodes;
    console.log(`[Network] Cleaned invalid nodes, remaining: ${validNodes.length}`);
  }

  /**
   * 定期更新节点列表
   */
  startNodeUpdate() {
    this.stopNodeUpdate();
    
    this.nodeUpdateTimer = setInterval(async () => {
      try {
        await this.cleanInvalidNodes();
        if (this.isConnected) {
          await this.fetchSignalNodes();
        }
      } catch (error) {
        console.warn('[Network] Node update failed:', error);
      }
    }, this.config.nodeRefreshInterval * 2);
  }

  /**
   * 停止定期更新节点列表
   */
  stopNodeUpdate() {
    if (this.nodeUpdateTimer) {
      clearInterval(this.nodeUpdateTimer);
      this.nodeUpdateTimer = null;
    }
  }

  /**
   * 获取连接状态
   */
  getConnectionState() {
    return {
      isConnected: this.isConnected,
      isConnecting: this.isConnecting,
      reconnectAttempts: this.reconnectAttempts,
      player: this.player,
      currentRoom: this.currentRoom,
      playerCount: this.players.size,
      currentNode: this.currentNode,
      signalNodes: this.signalNodes,
      isFailoverInProgress: this.isFailoverInProgress,
      // DHT 相关状态
      dhtFallback: {
        enabled: this.config.enableDHTFallback,
        active: this.isDHTFallbackActive,
        dhtInitialized: this.dhtManager?.isInitialized || false,
        dhtNodeId: this.dhtManager?.getNodeId() || null
      }
    };
  }
  
  /**
   * 获取 DHT 管理器
   */
  getDHTManager() {
    return this.dhtManager;
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
  module.exports = { NetworkManager };
}
