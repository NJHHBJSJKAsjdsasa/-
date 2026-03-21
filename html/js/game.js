/**
 * P2P修仙游戏 - 纯HTML版本
 * 游戏主逻辑入口
 */

// ========================================
// 游戏数据与配置
// ========================================

// 境界配置从 player.js 获取全局变量 REALMS
// 注意：player.js 中定义的 REALMS 结构不同，这里需要兼容处理

// 功法配置（使用 var 避免重复声明错误）
var GAME_CULTIVATION_METHODS = {
  '练气': [
    { id: 'basic_qi', name: '基础吐纳', expPerSecond: 1, quality: '普通', description: '最基础的修炼法门，适合初学者' },
    { id: 'five_elements', name: '五行诀', expPerSecond: 2, quality: '优秀', description: '调和五行之气的修炼法门' },
    { id: 'spirit_gathering', name: '聚灵功', expPerSecond: 3, quality: '稀有', description: '聚集天地灵气的进阶功法' }
  ],
  '筑基': [
    { id: 'foundation_building', name: '筑基心法', expPerSecond: 5, quality: '普通', description: '稳固根基的基础心法' },
    { id: 'primordial_qi', name: '元气诀', expPerSecond: 8, quality: '优秀', description: '凝练元气的进阶心法' }
  ],
  '金丹': [
    { id: 'golden_core', name: '金丹大道', expPerSecond: 15, quality: '普通', description: '凝结金丹的核心功法' },
    { id: 'nine_turns', name: '九转金丹', expPerSecond: 25, quality: '稀有', description: '九转凝丹的秘传功法' }
  ]
};

// 默认技能
var GAME_DEFAULT_SKILLS = [
  { id: 'basic_attack', name: '普通攻击', damage: 10, manaCost: 0, type: 'physical', description: '基础的物理攻击' },
  { id: 'qi_strike', name: '气劲', damage: 25, manaCost: 10, type: 'magical', description: '释放灵力进行攻击' },
  { id: 'spirit_sword', name: '灵剑诀', damage: 40, manaCost: 20, type: 'magical', description: '以灵力凝聚剑气' },
  { id: 'heaven_palm', name: '天罡掌', damage: 60, manaCost: 35, type: 'true', description: '蕴含天地之力的掌法' }
];

// 品质颜色映射
var GAME_QUALITY_COLORS = {
  '普通': '#9e9e9e',
  '优秀': '#4caf50',
  '稀有': '#2196f3',
  '史诗': '#9c27b0',
  '传说': '#ff9800',
  '神话': '#ff5722'
};

// 装备槽位名称
var GAME_SLOT_NAMES = {
  weapon: '武器',
  armor: '护甲',
  helmet: '头盔',
  boots: '靴子',
  accessory1: '饰品1',
  accessory2: '饰品2'
};

// 属性名称
var GAME_ATTR_NAMES = {
  strength: '力量',
  agility: '敏捷',
  intelligence: '智力',
  vitality: '体质',
  spirit: '灵力'
};

// ========================================
// 游戏状态
// ========================================

const gameState = {
  player: null,
  isInitialized: false,
  isConnected: false,
  isConnecting: false,
  cultivation: {
    isActive: false,
    method: null,
    intervalId: null
  },
  combat: {
    isActive: false,
    session: null
  },
  trade: {
    isActive: false,
    session: null
  },
  onlinePlayers: [],
  systemMessages: [],
  latency: 0,
  signalNodes: [],
  currentNode: null,
  isFailoverInProgress: false
};

// ========================================
// 网络管理器实例
// ========================================

let networkManager = null;
let p2pManager = null;
let dhtManager = null;

// ========================================
// 玩家类（使用 var 避免与 player.js 中的 Player 类冲突）
// ========================================

var GamePlayer = class {
  constructor(name) {
    this.id = 'player_' + Date.now();
    this.name = name;
    this.level = 1;
    this.realm = 0; // 练气
    this.realmStage = 1;
    this.exp = 0;
    this.maxExp = 100;
    this.hp = 100;
    this.maxHp = 100;
    this.mp = 50;
    this.maxMp = 50;
    this.attributes = {
      strength: 10,
      agility: 10,
      intelligence: 10,
      vitality: 10,
      spirit: 10
    };
    this.equipments = {};
    this.cultivationMethod = null;
    this.fullRealmName = this.getFullRealmName();
  }

  getFullRealmName() {
    const realm = REALMS[this.realm];
    return realm ? `${realm.name}${this.realmStage}重` : '未知';
  }

  gainExp(amount) {
    this.exp += amount;
    if (this.exp >= this.maxExp) {
      this.levelUp();
    }
    return this.exp;
  }

  async levelUp() {
    this.level++;
    this.exp = 0;
    this.maxExp = Math.floor(this.maxExp * 1.5);
    this.maxHp += 10;
    this.hp = this.maxHp;
    this.maxMp += 5;
    this.mp = this.maxMp;

    // 属性成长
    this.attributes.strength += 1;
    this.attributes.agility += 1;
    this.attributes.intelligence += 1;
    this.attributes.vitality += 1;
    this.attributes.spirit += 1;

    addSystemMessage(`恭喜！你升到了 ${this.level} 级！`, 'success');

    // 发布玩家信息到DHT（包括等级更新）
    await announcePlayerToDHT();
  }

  toJSON() {
    return {
      id: this.id,
      name: this.name,
      level: this.level,
      realm: this.realm,
      realmStage: this.realmStage,
      fullRealmName: this.getFullRealmName(),
      exp: this.exp,
      maxExp: this.maxExp,
      hp: this.hp,
      maxHp: this.maxHp,
      mp: this.mp,
      maxMp: this.maxMp,
      attributes: this.attributes,
      equipments: this.equipments,
      cultivationMethod: this.cultivationMethod,
      createdAt: Date.now()
    };
  }

  static fromJSON(data) {
    const player = new GamePlayer(data.name);
    player.id = data.id || player.id;
    player.level = data.level || 1;
    player.realm = typeof data.realm === 'number' ? data.realm : 0;
    player.realmStage = data.realmStage || 1;
    player.exp = data.exp || 0;
    player.maxExp = data.maxExp || 100;
    player.hp = data.hp || 100;
    player.maxHp = data.maxHp || 100;
    player.mp = data.mp || 50;
    player.maxMp = data.maxMp || 50;
    player.attributes = data.attributes || {
      strength: 10,
      agility: 10,
      intelligence: 10,
      vitality: 10,
      spirit: 10
    };
    player.equipments = data.equipments || {};
    player.cultivationMethod = data.cultivationMethod || null;
    player.fullRealmName = player.getFullRealmName();
    return player;
  }
};

// DOM 元素引用 - 由 game-elements.js 中的 initElements() 函数初始化
let elements = null;

// ========================================
// 工具函数
// ========================================

function getMethodsByRealm(realmIndex) {
  const realmName = REALMS[realmIndex]?.name || '练气';
  return GAME_CULTIVATION_METHODS[realmName] || GAME_CULTIVATION_METHODS['练气'];
}

function formatTime(date = new Date()) {
  return date.toLocaleTimeString('zh-CN', { hour12: false });
}

// ========================================
// UI 更新函数
// ========================================

function updateHeader() {
  if (!gameState.player) return;
  
  elements.headerPlayerName.textContent = gameState.player.name;
  elements.headerRealm.textContent = gameState.player.getFullRealmName();
  elements.headerLevel.textContent = `Lv.${gameState.player.level}`;
}

function updateCultivationUI() {
  if (!gameState.player) return;

  const player = gameState.player;
  const percentage = Math.floor((player.exp / player.maxExp) * 100);

  if (gameState.cultivation.isActive) {
    elements.cultivatingPanel.classList.remove('hidden');
    elements.methodListPanel.classList.add('hidden');
    
    elements.currentMethodName.textContent = gameState.cultivation.method?.name || '-';
    elements.expFill.style.width = `${percentage}%`;
    elements.currentExp.textContent = player.exp;
    elements.maxExp.textContent = player.maxExp;
    elements.expPercentage.textContent = percentage;
    elements.expPerSecond.textContent = gameState.cultivation.method?.expPerSecond || 0;
  } else {
    elements.cultivatingPanel.classList.add('hidden');
    elements.methodListPanel.classList.remove('hidden');
    
    // 生成功法按钮
    const methods = getMethodsByRealm(player.realm);
    elements.methodButtons.innerHTML = methods.map(method => `
      <button class="method-btn" data-method-id="${method.id}">
        <span class="method-name">${method.name}</span>
        <span class="method-rate">+${method.expPerSecond}/秒</span>
      </button>
    `).join('');

    // 绑定功法按钮事件
    elements.methodButtons.querySelectorAll('.method-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const methodId = btn.dataset.methodId;
        const method = methods.find(m => m.id === methodId);
        if (method) startCultivation(method);
      });
    });
  }
}

function updatePlayerPanel() {
  if (!gameState.player) return;

  const player = gameState.player;
  const percentage = Math.floor((player.exp / player.maxExp) * 100);
  const hpPercentage = Math.floor((player.hp / player.maxHp) * 100);
  const mpPercentage = Math.floor((player.mp / player.maxMp) * 100);

  elements.panelPlayerName.textContent = player.name;
  elements.panelRealmBadge.textContent = player.getFullRealmName();
  elements.panelLevel.textContent = player.level;
  elements.panelExpFill.style.width = `${percentage}%`;
  elements.panelExp.textContent = player.exp;
  elements.panelMaxExp.textContent = player.maxExp;

  elements.hpFill.style.width = `${hpPercentage}%`;
  elements.hp.textContent = player.hp;
  elements.maxHp.textContent = player.maxHp;

  elements.mpFill.style.width = `${mpPercentage}%`;
  elements.mp.textContent = player.mp;
  elements.maxMp.textContent = player.maxMp;

  // 更新属性
  document.getElementById('attr-strength').textContent = player.attributes.strength;
  document.getElementById('attr-agility').textContent = player.attributes.agility;
  document.getElementById('attr-intelligence').textContent = player.attributes.intelligence;
  document.getElementById('attr-vitality').textContent = player.attributes.vitality;
  document.getElementById('attr-spirit').textContent = player.attributes.spirit;

  // 更新装备
  document.querySelectorAll('.equipment-slot').forEach(slot => {
    const slotName = slot.dataset.slot;
    const equip = player.equipments[slotName];
    
    if (equip) {
      slot.classList.remove('empty');
      slot.classList.add('filled');
      const qualityColor = GAME_QUALITY_COLORS[equip.quality] || '#9e9e9e';
      slot.innerHTML = `
        <div class="slot-name">${GAME_SLOT_NAMES[slotName]}</div>
        <div class="equip-name" style="color: ${qualityColor}">${equip.name}</div>
        <div class="equip-bonus">
          ${Object.entries(equip.attributesBonus || {}).map(([attr, val]) =>
            `+${val} ${GAME_ATTR_NAMES[attr] || attr}`
          ).join(' ')}
        </div>
      `;
    } else {
      slot.classList.add('empty');
      slot.classList.remove('filled');
      slot.innerHTML = `
        <div class="slot-name">${GAME_SLOT_NAMES[slotName]}</div>
        <div class="empty-text">空</div>
      `;
    }
  });

  // 更新功法
  if (player.cultivationMethod) {
    elements.currentMethodSection.classList.remove('hidden');
    elements.panelMethodName.textContent = player.cultivationMethod.name;
    elements.panelMethodQuality.textContent = player.cultivationMethod.quality;
    elements.panelMethodQuality.style.color = GAME_QUALITY_COLORS[player.cultivationMethod.quality] || '#9e9e9e';
    elements.panelMethodDesc.textContent = player.cultivationMethod.description;
  } else {
    elements.currentMethodSection.classList.add('hidden');
  }
}

function addSystemMessage(content, type = 'info') {
  const message = {
    id: Date.now(),
    content,
    type,
    timestamp: Date.now()
  };
  
  gameState.systemMessages.push(message);
  
  // 保持最多50条消息
  if (gameState.systemMessages.length > 50) {
    gameState.systemMessages.shift();
  }

  renderMessages();
}

function renderMessages() {
  // 检查 messagesList 元素是否存在（在登录界面时可能不存在）
  if (!elements.messagesList) {
    return;
  }
  
  if (gameState.systemMessages.length === 0) {
    elements.messagesList.innerHTML = '<p class="empty">暂无消息</p>';
    return;
  }

  elements.messagesList.innerHTML = gameState.systemMessages.map(msg => `
    <div class="message ${msg.type}">
      <span class="time">${formatTime(new Date(msg.timestamp))}</span>
      <span class="content">${msg.content}</span>
    </div>
  `).join('');

  // 滚动到底部
  elements.messagesList.scrollTop = elements.messagesList.scrollHeight;
}

function updateNetworkStatus(status, latency = 0) {
  const indicator = elements.networkStatus.querySelector('.status-indicator');
  const statusText = elements.networkStatus.querySelector('.status-text');
  const latencyText = elements.networkStatus.querySelector('.latency');

  indicator.className = 'status-indicator ' + status;

  switch (status) {
    case 'online':
      statusText.textContent = '已连接';
      latencyText.textContent = `${latency}ms`;
      elements.connectBtn.textContent = '断开';
      elements.connectBtn.disabled = false;
      break;
    case 'connecting':
      statusText.textContent = '连接中...';
      latencyText.textContent = '-';
      elements.connectBtn.textContent = '连接中...';
      elements.connectBtn.disabled = true;
      break;
    case 'failover':
      statusText.textContent = '切换节点...';
      latencyText.textContent = '-';
      elements.connectBtn.textContent = '切换中...';
      elements.connectBtn.disabled = true;
      break;
    default:
      statusText.textContent = '未连接';
      latencyText.textContent = '-';
      elements.connectBtn.textContent = '连接网络';
      elements.connectBtn.disabled = false;
  }

  // 更新延迟显示
  if (latency > 0) {
    gameState.latency = latency;
  }
}

/**
 * 更新信令节点信息UI
 */
function updateSignalNodeInfo() {
  if (!elements.signalNodeInfo) return;

  if (gameState.currentNode) {
    elements.signalNodeInfo.classList.remove('hidden');
    if (elements.signalNodeUrl) {
      elements.signalNodeUrl.textContent = gameState.currentNode;
    }
    if (elements.signalNodeStatus) {
      if (gameState.isFailoverInProgress) {
        elements.signalNodeStatus.textContent = '切换中';
        elements.signalNodeStatus.className = 'node-status switching';
      } else if (gameState.isConnected) {
        elements.signalNodeStatus.textContent = '正常';
        elements.signalNodeStatus.className = 'node-status online';
      } else {
        elements.signalNodeStatus.textContent = '断开';
        elements.signalNodeStatus.className = 'node-status offline';
      }
    }
  } else {
    elements.signalNodeInfo.classList.add('hidden');
  }
}

/**
 * 处理信令节点列表更新
 */
function handleSignalNodesUpdate(data) {
  if (data.nodes && Array.isArray(data.nodes)) {
    gameState.signalNodes = data.nodes;
    console.log('[Game] Signal nodes updated:', data.nodes);
    addSystemMessage(`发现 ${data.nodes.length} 个信令节点`, 'info');
  }
}

// ========================================
// P2P游戏消息处理
// ========================================

function handleCombatRequest(peerId, data) {
  const player = gameState.onlinePlayers.find(p => p.id === peerId);
  const playerName = player ? player.name : '未知玩家';
  addSystemMessage(`收到来自 ${playerName} 的切磋请求`, 'info');
  // TODO: 实现接受/拒绝切磋的UI
}

function handleCombatAction(peerId, data) {
  // TODO: 实现远程玩家的战斗动作处理
  console.log('[Game] Combat action from peer:', peerId, data);
}

function handleTradeRequest(peerId, data) {
  const player = gameState.onlinePlayers.find(p => p.id === peerId);
  const playerName = player ? player.name : '未知玩家';
  addSystemMessage(`收到来自 ${playerName} 的交易请求`, 'info');
  // TODO: 实现接受/拒绝交易的UI
}

function updateLatencyFromP2P() {
  if (!p2pManager) return;

  const connections = p2pManager.getConnectedPeers();
  if (connections.length > 0) {
    // 计算平均延迟
    const avgLatency = connections.reduce((sum, conn) => sum + (conn.stats.latency || 0), 0) / connections.length;
    if (avgLatency > 0) {
      updateNetworkStatus('online', Math.round(avgLatency));
    }
  }
}

function updateOnlinePlayers() {
  elements.onlineCount.textContent = gameState.onlinePlayers.length;

  if (gameState.onlinePlayers.length === 0) {
    elements.playerList.innerHTML = `<p class="empty">${gameState.isConnected ? '暂无其他玩家在线' : '未连接到服务器'}</p>`;
    return;
  }

  elements.playerList.innerHTML = gameState.onlinePlayers.map(player => {
    // 确定同步状态和显示内容
    let syncStatus = player.syncStatus || 'unsynced';
    let statusText = '';
    let statusClass = '';
    let levelDisplay = '';

    if (!player.dhtPublicKey) {
      syncStatus = 'no-dht';
      statusText = '未启用DHT';
      statusClass = 'status-no-dht';
      levelDisplay = 'Lv.?';
    } else if (syncStatus === 'syncing') {
      statusText = '同步中...';
      statusClass = 'status-syncing';
      levelDisplay = `Lv.${player.level || '?'}`;
    } else if (syncStatus === 'synced' || (player.realm && player.realm !== '未知')) {
      syncStatus = 'synced';
      statusText = '已同步';
      statusClass = 'status-synced';
      levelDisplay = `${player.realm} Lv.${player.level}`;
    } else {
      syncStatus = 'unsynced';
      statusText = '未同步';
      statusClass = 'status-unsynced';
      levelDisplay = `Lv.${player.level || '?'}`;
    }

    return `
    <div class="player-item" data-player-id="${player.id}">
      <div class="player-info-row">
        <span class="name">${player.name}</span>
        <span class="realm ${statusClass}" title="${statusText}">${levelDisplay}</span>
      </div>
      <div class="player-actions-row">
        <button class="combat-btn" data-player-id="${player.id}">切磋</button>
        <button class="trade-btn" data-player-id="${player.id}">交易</button>
        <button class="query-level-btn" data-player-id="${player.id}" title="查询等级" ${!player.dhtPublicKey ? 'disabled' : ''}>🔍</button>
      </div>
    </div>
  `}).join('');

  // 绑定按钮事件
  elements.playerList.querySelectorAll('.combat-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const playerId = btn.dataset.playerId;
      const player = gameState.onlinePlayers.find(p => p.id === playerId);
      if (player) initiateCombat(player);
    });
  });

  elements.playerList.querySelectorAll('.trade-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const playerId = btn.dataset.playerId;
      const player = gameState.onlinePlayers.find(p => p.id === playerId);
      if (player) initiateTrade(player);
    });
  });

  // 绑定查询等级按钮事件
  elements.playerList.querySelectorAll('.query-level-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const playerId = btn.dataset.playerId;
      const player = gameState.onlinePlayers.find(p => p.id === playerId);
      if (player && player.dhtPublicKey) {
        // 设置同步中状态
        player.syncStatus = 'syncing';
        updateOnlinePlayers();

        addSystemMessage(`正在查询 ${player.name} 的等级信息...`, 'info');
        const levelData = await queryPlayerLevel(player.dhtPublicKey);
        if (levelData) {
          player.level = levelData.level;
          player.realm = levelData.realm;
          player.exp = levelData.exp;
          player.lastSyncTime = levelData.timestamp;
          player.syncStatus = 'synced';
          updateOnlinePlayers();
          addSystemMessage(`${player.name}: ${levelData.realm} Lv.${levelData.level}`, 'success');
        } else {
          player.syncStatus = 'unsynced';
          updateOnlinePlayers();
          addSystemMessage(`无法获取 ${player.name} 的等级信息`, 'warning');
        }
      } else {
        addSystemMessage(`${player.name} 未启用DHT同步`, 'warning');
      }
    });
  });
}

// ========================================
// 游戏逻辑
// ========================================

async function initializePlayer(name) {
  gameState.player = new GamePlayer(name);
  gameState.isInitialized = true;

  // 切换到主游戏界面
  elements.gameContainer.classList.remove('login');
  elements.loginScreen.classList.add('hidden');
  elements.mainGame.classList.remove('hidden');

  // 更新UI
  updateHeader();
  updateCultivationUI();
  addSystemMessage(`欢迎踏入仙途，${name}！`, 'success');

  // 设置 DHT 玩家数据提供者
  setupDHTPlayerDataProvider();

  // 如果 DHT 已初始化，发布玩家信息
  if (dhtManager && dhtManager.isInitialized) {
    try {
      // 发布玩家信息到 DHT（包含等级、境界、经验、名字）
      await announcePlayerToDHT();
      
      addSystemMessage('玩家信息已通过 DHT 发布', 'success');
    } catch (error) {
      console.warn('[Game] Failed to announce player to DHT:', error);
      // DHT 发布失败不影响游戏继续
    }
  }

  // 如果已连接到网络，自动加入游戏
  if (gameState.isConnected && networkManager) {
    await joinNetworkGame();
  }
}

// ========================================
// IPFS 备份与恢复功能
// ========================================

/**
 * 显示加载遮罩
 * @param {string} text - 加载提示文字
 */
function showLoading(text = '正在处理...') {
  elements.loadingText.textContent = text;
  elements.loadingOverlay.classList.remove('hidden');
}

/**
 * 隐藏加载遮罩
 */
function hideLoading() {
  elements.loadingOverlay.classList.add('hidden');
}

/**
 * 备份角色到IPFS
 */
async function backupCharacter() {
  if (!gameState.player) {
    addSystemMessage('没有可备份的角色', 'error');
    return;
  }

  showLoading('正在将命数刻入天道...');

  try {
    // 序列化角色数据
    const playerData = gameState.player.toJSON();

    // 上传到IPFS
    const cid = await ipfsStorage.uploadCharacter(playerData);

    hideLoading();

    // 显示CID弹窗
    showCIDModal(cid);

    addSystemMessage('命数已刻入天道，请妥善保管你的命数印记', 'success');
  } catch (error) {
    hideLoading();
    console.error('[Game] 备份失败:', error);
    addSystemMessage('备份失败: ' + error.message, 'error');
  }
}

/**
 * 显示CID弹窗
 * @param {string} cid - IPFS CID
 */
function showCIDModal(cid) {
  elements.cidDisplayInput.value = cid;
  elements.cidModal.classList.remove('hidden');
}

/**
 * 关闭CID弹窗
 */
function closeCIDModal() {
  elements.cidModal.classList.add('hidden');
}

/**
 * 复制CID到剪贴板
 */
async function copyCIDToClipboard() {
  const cid = elements.cidDisplayInput.value;
  if (!cid) return;

  const success = await ipfsStorage.copyCIDToClipboard(cid);
  if (success) {
    addSystemMessage('命数印记已复制到剪贴板', 'success');
    // 临时改变按钮文字
    const originalText = elements.copyCidBtn.textContent;
    elements.copyCidBtn.textContent = '已复制';
    setTimeout(() => {
      elements.copyCidBtn.textContent = originalText;
    }, 2000);
  } else {
    addSystemMessage('复制失败，请手动复制', 'warning');
  }
}

/**
 * 从IPFS恢复角色
 * @param {string} cid - IPFS CID
 */
async function restoreCharacter(cid) {
  if (!cid || !cid.trim()) {
    addSystemMessage('请输入命数印记', 'error');
    return;
  }

  // 验证CID格式
  if (!ipfsStorage.isValidCID(cid)) {
    addSystemMessage('命数印记格式无效', 'error');
    return;
  }

  showLoading('正在从天道读取命数...');

  try {
    // 从IPFS下载角色数据
    const playerData = await ipfsStorage.downloadCharacter(cid);

    // 恢复角色
    gameState.player = GamePlayer.fromJSON(playerData);
    gameState.isInitialized = true;

    hideLoading();

    // 切换到主游戏界面
    elements.gameContainer.classList.remove('login');
    elements.loginScreen.classList.add('hidden');
    elements.mainGame.classList.remove('hidden');

    // 更新UI
    updateHeader();
    updateCultivationUI();
    addSystemMessage(`欢迎回来，${gameState.player.name}！命数已恢复`, 'success');

    // 如果已连接到网络，自动加入游戏
    if (gameState.isConnected && networkManager) {
      joinNetworkGame();
    }
  } catch (error) {
    hideLoading();
    console.error('[Game] 恢复失败:', error);
    addSystemMessage('命数印记无效或已消散', 'error');
  }
}

/**
 * 显示创建新角色面板
 */
function showNewCharacterPanel() {
  elements.tabNewCharacter.classList.add('active');
  elements.tabRestoreCharacter.classList.remove('active');
  elements.newCharacterPanel.classList.remove('hidden');
  elements.restoreCharacterPanel.classList.add('hidden');
}

/**
 * 显示恢复角色面板
 */
function showRestorePanel() {
  elements.tabNewCharacter.classList.remove('active');
  elements.tabRestoreCharacter.classList.add('active');
  elements.newCharacterPanel.classList.add('hidden');
  elements.restoreCharacterPanel.classList.remove('hidden');
}

function startCultivation(method) {
  if (!gameState.player || gameState.cultivation.isActive) return;

  gameState.cultivation.isActive = true;
  gameState.cultivation.method = method;
  gameState.player.cultivationMethod = method;

  // 每秒增加经验
  gameState.cultivation.intervalId = setInterval(() => {
    if (gameState.player && gameState.cultivation.method) {
      gameState.player.gainExp(gameState.cultivation.method.expPerSecond);
      updateCultivationUI();
      updateHeader();
    }
  }, 1000);

  updateCultivationUI();
  addSystemMessage(`开始修炼 ${method.name}`, 'info');
}

function stopCultivation() {
  if (!gameState.cultivation.isActive) return;

  gameState.cultivation.isActive = false;
  
  if (gameState.cultivation.intervalId) {
    clearInterval(gameState.cultivation.intervalId);
    gameState.cultivation.intervalId = null;
  }

  updateCultivationUI();
  addSystemMessage('停止修炼', 'info');
}

function initNetwork() {
  if (networkManager) return;

  // 配置多个信令节点地址
  networkManager = new NetworkManager({
    signalingUrl: 'ws://49.232.170.26:5050',
    signalNodes: [
      'ws://49.232.170.26:5050',
      'ws://49.232.170.26:5051',
      'ws://49.232.170.26:5052'
    ],
    reconnectInterval: 3000,
    maxReconnectAttempts: 5,
    heartbeatInterval: 30000,
    nodeRefreshInterval: 60000
  });

  p2pManager = new P2PConnectionManager(networkManager, {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun2.l.google.com:19302' }
    ]
  });

  // 注意：DHT 管理器现在在游戏初始化时独立创建
  // 如果 DHT 还未初始化，在这里初始化
  if (!dhtManager) {
    initDHTManager();
  }

  setupNetworkEventHandlers();
  setupP2PMessageHandlers();
}

/**
 * 设置DHT事件处理器
 */
function setupDHTEventHandlers() {
  if (!dhtManager) return;
  
  dhtManager.addEventListener('initialized', (event) => {
    console.log('[Game] DHT initialized, public key:', event.detail.publicKey.substring(0, 20) + '...');
    updateDHTStatus('ready', event.detail.publicKey);
    addSystemMessage('DHT网络已就绪', 'success');
    
    // 显示路由表统计
    const stats = dhtManager.getStats();
    if (stats.routingTable) {
      updateDHTNodeCount(stats.routingTable.totalNodes);
      console.log('[Game] DHT routing table stats:', stats.routingTable);
    }
  });

  dhtManager.addEventListener('error', (event) => {
    console.error('[Game] DHT error:', event.detail.error);
    updateDHTStatus('error');
    addSystemMessage('DHT错误: ' + event.detail.error, 'error');
    
    // DHT 错误不影响游戏继续运行
    addSystemMessage('游戏将继续使用 WebSocket 信令', 'info');
  });

  dhtManager.addEventListener('levelPublished', (event) => {
    console.log('[Game] Level published to DHT');
  });

  dhtManager.addEventListener('levelReceived', (event) => {
    const data = event.detail.data;
    console.log('[Game] Level received from DHT:', data.publicKey.substring(0, 20) + '...');
    // 更新在线玩家列表中的等级信息
    updatePlayerLevelFromDHT(data);
  });

  dhtManager.addEventListener('levelQueried', (event) => {
    const data = event.detail.data;
    console.log('[Game] Level queried from DHT:', data.publicKey.substring(0, 20) + '...');
    updatePlayerLevelFromDHT(data);
  });
  
  // 监听玩家信息接收事件
  dhtManager.addEventListener('playerReceived', (event) => {
    const { playerId, playerInfo } = event.detail;
    console.log('[Game] Player info received from DHT:', playerInfo.name, playerId.substring(0, 20) + '...');
    
    // 可以在这里添加发现新玩家的逻辑
    addSystemMessage(`通过 DHT 发现玩家: ${playerInfo.name}`, 'info');
  });
  
  // 监听消息发送事件（用于通过 P2P 发送 DHT 消息）
  dhtManager.addEventListener('sendMessage', (event) => {
    const { message, toNode } = event.detail;
    // 如果 P2P 连接可用，可以通过 P2P 发送 DHT 消息
    if (p2pManager && toNode.publicKey) {
      // 查找对应的 P2P 连接
      const peerId = findPeerIdByPublicKey(toNode.publicKey);
      if (peerId) {
        p2pManager.sendMessage(peerId, 'dhtMessage', message);
      }
    }
  });
}

/**
 * 通过公钥查找对等节点 ID
 */
function findPeerIdByPublicKey(publicKey) {
  // 在在线玩家列表中查找匹配的公钥
  const player = gameState.onlinePlayers.find(p => p.dhtPublicKey === publicKey);
  return player ? player.id : null;
}

/**
 * 更新DHT状态显示
 */
function updateDHTStatus(status, publicKey = null) {
  if (!elements.dhtStatus) return;

  const indicator = elements.dhtStatus.querySelector('.dht-indicator');
  const statusText = elements.dhtStatus.querySelector('.dht-status-text');

  if (indicator) {
    indicator.className = 'dht-indicator ' + status;
  }

  if (statusText) {
    switch (status) {
      case 'ready':
      case 'online':
        statusText.textContent = 'DHT已就绪';
        break;
      case 'connecting':
        statusText.textContent = 'DHT连接中...';
        break;
      case 'error':
        statusText.textContent = 'DHT错误';
        break;
      default:
        statusText.textContent = 'DHT未连接';
    }
  }

  // 更新公钥显示
  if (publicKey && elements.dhtPublicKey) {
    elements.dhtPublicKey.textContent = publicKey.substring(0, 16) + '...';
    elements.dhtPublicKey.title = publicKey;
  }
}

/**
 * 更新 DHT 节点数显示
 */
function updateDHTNodeCount(count) {
  if (elements.dhtNodeCount) {
    elements.dhtNodeCount.textContent = `${count || 0} 节点`;
  }
}

/**
 * 从DHT数据更新玩家等级信息
 */
function updatePlayerLevelFromDHT(data) {
  const playerIndex = gameState.onlinePlayers.findIndex(p => p.dhtPublicKey === data.publicKey);
  if (playerIndex !== -1) {
    gameState.onlinePlayers[playerIndex].level = data.level;
    gameState.onlinePlayers[playerIndex].realm = data.realm;
    gameState.onlinePlayers[playerIndex].exp = data.exp;
    gameState.onlinePlayers[playerIndex].lastSyncTime = data.timestamp;
    updateOnlinePlayers();
  }
}

/**
 * 发布当前玩家信息到DHT（使用 announcePlayer）
 */
async function announcePlayerToDHT() {
  if (!dhtManager || !dhtManager.isInitialized || !gameState.player) return;

  try {
    const playerInfo = {
      id: dhtManager.publicKeyBase64,
      name: gameState.player.name,
      level: gameState.player.level,
      realm: gameState.player.getFullRealmName(),
      exp: gameState.player.exp
    };

    await dhtManager.announcePlayer(playerInfo);
    console.log('[Game] Player announced to DHT:', playerInfo.name, 'Lv.' + playerInfo.level);
  } catch (error) {
    console.error('[Game] Failed to announce player to DHT:', error);
  }
}

/**
 * 发布当前玩家等级到DHT（兼容旧方法，现在使用 announcePlayer）
 */
async function publishPlayerLevelToDHT() {
  // 统一使用 announcePlayerToDHT
  await announcePlayerToDHT();
}

/**
 * 查询玩家等级
 */
async function queryPlayerLevel(publicKey) {
  console.log('[Game] Querying player level, DHT initialized:', dhtManager?.isInitialized);
  if (!dhtManager || !dhtManager.isInitialized) {
    console.warn('[Game] DHT not initialized');
    return null;
  }
  console.log('[Game] Querying level for publicKey:', publicKey.substring(0, 20) + '...');
  const result = await dhtManager.queryLevel(publicKey);
  console.log('[Game] Query result:', result);
  return result;
}

function setupNetworkEventHandlers() {
  networkManager.on('connecting', () => {
    gameState.isConnecting = true;
    updateNetworkStatus('connecting');
    addSystemMessage('正在连接服务器...', 'info');
  });

  networkManager.on('connected', async (data) => {
    gameState.isConnected = true;
    gameState.isConnecting = false;
    gameState.currentNode = data.nodeUrl || networkManager.getCurrentNode();
    updateNetworkStatus('online', 0);
    updateSignalNodeInfo();
    addSystemMessage('已连接到信令服务器', 'success');

    // DHT 已经在游戏初始化时独立启动
    // 这里只需要确保 DHT 和 WebSocket 信令可以协同工作
    if (dhtManager && dhtManager.isInitialized) {
      // 如果 DHT 已经就绪，通过 DHT 广播玩家信息
      if (gameState.player) {
        try {
          await announcePlayerToDHT();
          console.log('[Game] Player announced via DHT after WebSocket connected');
        } catch (error) {
          console.warn('[Game] Failed to announce player via DHT:', error);
        }
      }
    } else if (!dhtManager) {
      // 如果 DHT 还未初始化，尝试初始化
      console.log('[Game] DHT not initialized yet, initializing...');
      await initDHTManager();
    }

    // 如果已有玩家，自动加入游戏
    if (gameState.player) {
      joinNetworkGame();
    }
  });

  networkManager.on('disconnected', (data) => {
    gameState.isConnected = false;
    gameState.isConnecting = false;
    gameState.onlinePlayers = [];
    updateNetworkStatus('offline');
    updateSignalNodeInfo();
    updateOnlinePlayers();
    addSystemMessage('与服务器断开连接', 'warning');

    // 断开所有P2P连接
    if (p2pManager) {
      p2pManager.disconnectAll();
    }

    // 如果不是手动断开且没有正在进行故障转移，尝试重连其他节点
    if (data.reason !== 'io client disconnect' && !gameState.isFailoverInProgress) {
      addSystemMessage('尝试连接其他信令节点...', 'info');
    }
  });

  networkManager.on('connect_error', (error) => {
    gameState.isConnecting = false;
    addSystemMessage('连接失败: ' + (error.message || '未知错误'), 'error');
  });

  networkManager.on('reconnecting', (data) => {
    addSystemMessage(`正在重连... (${data.attempt}/${networkManager.config.maxReconnectAttempts})`, 'warning');
  });

  networkManager.on('reconnect_failed', () => {
    gameState.isConnecting = false;
    addSystemMessage('重连失败，请检查网络或服务器状态', 'error');
    updateNetworkStatus('offline');
  });

  // 故障转移事件处理
  networkManager.on('failoverStarted', () => {
    gameState.isFailoverInProgress = true;
    updateNetworkStatus('failover');
    updateSignalNodeInfo();
    addSystemMessage('检测到主节点故障，开始切换到备用节点...', 'warning');
  });

  networkManager.on('failoverAttempt', (data) => {
    addSystemMessage(`尝试连接节点: ${data.nodeUrl}`, 'info');
  });

  networkManager.on('failoverSuccess', (data) => {
    gameState.isFailoverInProgress = false;
    gameState.currentNode = data.nodeUrl;
    updateNetworkStatus('online', 0);
    updateSignalNodeInfo();
    addSystemMessage(`成功切换到节点: ${data.nodeUrl}`, 'success');

    // 如果已有玩家，自动重新加入游戏
    if (gameState.player) {
      joinNetworkGame();
    }
  });

  networkManager.on('failoverFailed', (data) => {
    gameState.isFailoverInProgress = false;
    updateSignalNodeInfo();
    addSystemMessage('故障转移失败: ' + (data.error || '所有节点均不可用'), 'error');
    updateNetworkStatus('offline');
  });

  // 节点延迟测试结果
  networkManager.on('nodeLatencyTested', (data) => {
    if (data.results && data.results.length > 0) {
      const bestNode = data.results[0];
      console.log('[Game] Node latency test results:', data.results);
    }
  });

  // 信令节点列表更新
  networkManager.on('signalNodesUpdated', (data) => {
    handleSignalNodesUpdate(data);
  });

  networkManager.on('playerJoined', (data) => {
    addSystemMessage(`已登录为: ${data.player.name}`, 'success');
  });

  networkManager.on('roomJoined', (data) => {
    addSystemMessage(`已加入房间: ${data.room.name}`, 'success');
    updateOnlinePlayersFromNetwork();
  });

  networkManager.on('playerJoinedRoom', (data) => {
    addSystemMessage(`玩家 ${data.player.name} 加入了房间`, 'info');
    updateOnlinePlayersFromNetwork();
  });

  networkManager.on('playerLeftRoom', (data) => {
    const player = gameState.onlinePlayers.find(p => p.id === data.playerId);
    if (player) {
      addSystemMessage(`玩家 ${player.name} 离开了房间`, 'info');
    }
    updateOnlinePlayersFromNetwork();

    // 断开与该玩家的P2P连接
    if (p2pManager) {
      p2pManager.disconnectPeer(data.playerId);
    }
  });

  networkManager.on('serverError', (data) => {
    addSystemMessage('服务器错误: ' + data.message, 'error');
  });
}

function setupP2PMessageHandlers() {
  // 处理P2P连接建立
  p2pManager.on('peerConnected', (data) => {
    const player = gameState.onlinePlayers.find(p => p.id === data.peerId);
    const playerName = player ? player.name : '未知玩家';
    addSystemMessage(`与 ${playerName} 建立P2P连接`, 'success');

    // 发送玩家信息同步
    syncPlayerInfoToPeer(data.peerId);
  });

  p2pManager.on('peerDisconnected', (data) => {
    const player = gameState.onlinePlayers.find(p => p.id === data.peerId);
    const playerName = player ? player.name : '未知玩家';
    addSystemMessage(`与 ${playerName} 的P2P连接已断开`, 'warning');
  });

  p2pManager.on('incomingConnection', (data) => {
    addSystemMessage(`收到来自 ${data.peerName} 的连接请求`, 'info');
  });

  // 处理游戏消息
  p2pManager.onMessage('playerSync', (data, peerId) => {
    updateRemotePlayerInfo(peerId, data);
  });

  p2pManager.onMessage('combatRequest', (data, peerId) => {
    handleCombatRequest(peerId, data);
  });

  p2pManager.onMessage('combatAction', (data, peerId) => {
    handleCombatAction(peerId, data);
  });

  p2pManager.onMessage('tradeRequest', (data, peerId) => {
    handleTradeRequest(peerId, data);
  });

  p2pManager.onMessage('chat', (data, peerId) => {
    const player = gameState.onlinePlayers.find(p => p.id === peerId);
    const playerName = player ? player.name : '未知玩家';
    addSystemMessage(`[${playerName}] ${data.message}`, 'info');
  });
}

async function joinNetworkGame() {
  if (!networkManager || !networkManager.isConnected || !gameState.player) return;

  try {
    await networkManager.joinGame(gameState.player.name);

    // 加入默认房间或创建房间
    const rooms = await networkManager.listRooms();
    if (rooms.rooms && rooms.rooms.length > 0) {
      // 加入第一个可用房间
      await networkManager.joinRoom(rooms.rooms[0].id);
    } else {
      // 创建新房间
      await networkManager.createRoom(`${gameState.player.name}的房间`, 4);
    }

    // 建立与房间内其他玩家的P2P连接
    establishP2PConnections();
  } catch (error) {
    addSystemMessage('加入游戏失败: ' + error.message, 'error');
  }
}

async function establishP2PConnections() {
  if (!p2pManager || !networkManager) return;

  const players = networkManager.getOnlinePlayers();
  for (const player of players) {
    try {
      await p2pManager.connectToPlayer(player.id);
      // 连接建立后立即同步玩家信息（包含dhtPublicKey）
      syncPlayerInfoToPeer(player.id);
    } catch (error) {
      console.error(`[Game] Failed to connect to player ${player.name}:`, error);
    }
  }
}

async function updateOnlinePlayersFromNetwork() {
  if (!networkManager) return;

  const networkPlayers = networkManager.getOnlinePlayers();
  gameState.onlinePlayers = networkPlayers.map(p => ({
    id: p.id,
    name: p.name || p.nickname,
    realm: '未知',
    level: 1,
    socketId: p.socketId,
    dhtPublicKey: p.dhtPublicKey || null,
    syncStatus: p.dhtPublicKey ? 'unsynced' : 'no-dht'
  }));

  updateOnlinePlayers();

  // 自动查询有 dhtPublicKey 的玩家等级
  await autoQueryPlayerLevels();

  // 尝试与所有在线玩家建立P2P连接以同步dhtPublicKey
  if (p2pManager && gameState.isConnected) {
    for (const player of gameState.onlinePlayers) {
      if (!player.dhtPublicKey) {
        try {
          const connection = p2pManager.getConnection(player.id);
          if (connection && connection.isConnected()) {
            // 如果已连接，同步玩家信息
            syncPlayerInfoToPeer(player.id);
          } else {
            // 如果未连接，尝试建立连接
            await p2pManager.connectToPlayer(player.id);
          }
        } catch (error) {
          console.warn(`[Game] Failed to sync with player ${player.name}:`, error);
        }
      }
    }
  }
}

/**
 * 自动查询玩家等级
 * 当玩家列表刷新时自动查询有 dhtPublicKey 的玩家等级
 */
async function autoQueryPlayerLevels() {
  if (!dhtManager || !dhtManager.isInitialized) {
    console.log('[Game] DHT not initialized, skipping auto query');
    return;
  }

  const playersToQuery = gameState.onlinePlayers.filter(p => p.dhtPublicKey && p.syncStatus !== 'synced');

  if (playersToQuery.length === 0) {
    return;
  }

  console.log(`[Game] Auto querying ${playersToQuery.length} player(s) level from DHT`);

  // 并行查询所有玩家的等级
  const queryPromises = playersToQuery.map(async (player) => {
    try {
      // 设置同步中状态
      player.syncStatus = 'syncing';

      const levelData = await dhtManager.queryLevel(player.dhtPublicKey);

      if (levelData) {
        player.level = levelData.level;
        player.realm = levelData.realm;
        player.exp = levelData.exp;
        player.lastSyncTime = levelData.timestamp;
        player.syncStatus = 'synced';
        console.log(`[Game] Auto query success for ${player.name}: ${player.realm} Lv.${player.level}`);
      } else {
        player.syncStatus = 'unsynced';
        console.log(`[Game] Auto query failed for ${player.name}: no data`);
      }
    } catch (error) {
      console.warn(`[Game] Auto query error for ${player.name}:`, error);
      player.syncStatus = 'unsynced';
    }
  });

  await Promise.allSettled(queryPromises);

  // 更新UI显示
  updateOnlinePlayers();
}

function syncPlayerInfoToPeer(peerId) {
  if (!p2pManager || !gameState.player) return;

  const dhtPublicKey = dhtManager ? dhtManager.publicKeyBase64 : null;
  console.log(`[Game] Syncing player info to peer ${peerId}, dhtPublicKey: ${dhtPublicKey ? dhtPublicKey.substring(0, 20) + '...' : 'null'}`);

  p2pManager.sendMessage(peerId, 'playerSync', {
    name: gameState.player.name,
    level: gameState.player.level,
    realm: gameState.player.getFullRealmName(),
    realmIndex: gameState.player.realm,
    realmStage: gameState.player.realmStage,
    hp: gameState.player.hp,
    maxHp: gameState.player.maxHp,
    mp: gameState.player.mp,
    maxMp: gameState.player.maxMp,
    attributes: gameState.player.attributes,
    dhtPublicKey: dhtPublicKey
  });
}

function updateRemotePlayerInfo(peerId, data) {
  console.log('[Game] Received player sync from:', peerId, 'data:', data);
  const playerIndex = gameState.onlinePlayers.findIndex(p => p.id === peerId);
  if (playerIndex !== -1) {
    const oldDhtKey = gameState.onlinePlayers[playerIndex].dhtPublicKey;
    const oldSyncStatus = gameState.onlinePlayers[playerIndex].syncStatus;

    gameState.onlinePlayers[playerIndex] = {
      ...gameState.onlinePlayers[playerIndex],
      ...data
    };

    const newDhtKey = gameState.onlinePlayers[playerIndex].dhtPublicKey;
    console.log(`[Game] Updated player info for ${data.name}, dhtPublicKey: ${newDhtKey ? newDhtKey.substring(0, 20) + '...' : 'missing'}`);

    // 如果新收到了dhtPublicKey，立即查询等级
    if (!oldDhtKey && newDhtKey && dhtManager && dhtManager.isInitialized) {
      console.log('[Game] New dhtPublicKey received, querying level...');

      // 设置同步中状态
      gameState.onlinePlayers[playerIndex].syncStatus = 'syncing';
      updateOnlinePlayers();

      queryPlayerLevel(newDhtKey).then(levelData => {
        if (levelData) {
          gameState.onlinePlayers[playerIndex].level = levelData.level;
          gameState.onlinePlayers[playerIndex].realm = levelData.realm;
          gameState.onlinePlayers[playerIndex].exp = levelData.exp;
          gameState.onlinePlayers[playerIndex].lastSyncTime = levelData.timestamp;
          gameState.onlinePlayers[playerIndex].syncStatus = 'synced';
          updateOnlinePlayers();
          addSystemMessage(`${data.name}: ${levelData.realm} Lv.${levelData.level}`, 'success');
        } else {
          gameState.onlinePlayers[playerIndex].syncStatus = 'unsynced';
          updateOnlinePlayers();
        }
      });
    } else if (oldDhtKey && newDhtKey && oldSyncStatus !== 'synced') {
      // 如果已经有dhtPublicKey但未同步，也尝试查询
      autoQueryPlayerLevels();
    }

    updateOnlinePlayers();
  } else {
    console.log('[Game] Player not found in onlinePlayers list:', peerId);
  }
}

async function connect() {
  if (gameState.isConnected || gameState.isConnecting) return;

  if (!networkManager) {
    initNetwork();
  }

  try {
    await networkManager.connect();
  } catch (error) {
    console.error('[Game] Connection failed:', error);
  }
}

function disconnect() {
  if (p2pManager) {
    p2pManager.disconnectAll();
  }

  if (networkManager) {
    networkManager.disconnect();
  }

  gameState.isConnected = false;
  gameState.onlinePlayers = [];
  updateNetworkStatus('offline');
  updateOnlinePlayers();
  addSystemMessage('已断开 WebSocket 连接', 'warning');
  
  // 注意：DHT 保持独立运行，不随 WebSocket 断开而停止
  // 这样可以在 WebSocket 不可用时仍然通过 DHT 发现其他玩家
  if (dhtManager && dhtManager.isInitialized) {
    addSystemMessage('DHT 网络仍然可用', 'info');
  }
}

// ========================================
// 战斗系统
// ========================================

function initiateCombat(targetPlayer) {
  if (gameState.combat.isActive) return;

  // 如果是真实玩家（有socketId），通过P2P发送战斗请求
  if (targetPlayer.socketId && p2pManager) {
    const connection = p2pManager.getConnection(targetPlayer.id);
    if (connection && connection.isConnected()) {
      p2pManager.sendMessage(targetPlayer.id, 'combatRequest', {
        playerId: gameState.player.id,
        playerName: gameState.player.name,
        timestamp: Date.now()
      });
      addSystemMessage(`已向 ${targetPlayer.name} 发送切磋请求`, 'info');
      return;
    }
  }

  // 本地战斗（机器人或离线玩家）
  gameState.combat.isActive = true;
  gameState.combat.session = {
    round: 1,
    status: 'active',
    enemy: targetPlayer,
    logs: [],
    isRemote: false
  };

  elements.combatOverlay.classList.remove('hidden');
  elements.enemyName.textContent = targetPlayer.name;
  elements.selfName.textContent = gameState.player.name;
  elements.enemyMaxHp.textContent = targetPlayer.level * 20;
  elements.enemyHp.textContent = targetPlayer.level * 20;
  elements.selfMaxHp.textContent = gameState.player.maxHp;
  elements.selfHp.textContent = gameState.player.hp;

  // 生成技能按钮
  elements.skillsGrid.innerHTML = GAME_DEFAULT_SKILLS.map(skill => `
    <button class="skill-btn ${skill.type}" data-skill-id="${skill.id}">
      <div class="skill-name">${skill.name}</div>
      <div class="skill-info">
        <span class="damage">${skill.damage}伤害</span>
        ${skill.manaCost > 0 ? `<span class="mana-cost">${skill.manaCost}灵力</span>` : ''}
      </div>
    </button>
  `).join('');

  // 绑定技能按钮
  elements.skillsGrid.querySelectorAll('.skill-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const skillId = btn.dataset.skillId;
      useSkill(skillId);
    });
  });

  addCombatLog(`战斗开始！你对 ${targetPlayer.name} 发起了挑战！`);
}

function useSkill(skillId) {
  if (!gameState.combat.isActive) return;

  const skill = GAME_DEFAULT_SKILLS.find(s => s.id === skillId);
  if (!skill) return;

  // 扣除灵力
  if (gameState.player.mp < skill.manaCost) {
    addCombatLog('灵力不足！', 'warning');
    return;
  }

  gameState.player.mp -= skill.manaCost;

  // 计算伤害
  const damage = skill.damage + Math.floor(Math.random() * 10);
  addCombatLog(`你使用 ${skill.name} 造成 ${damage} 点伤害！`, 'attack');

  // 更新敌人血量
  const enemyMaxHp = gameState.combat.session.enemy.level * 20;
  let enemyHp = parseInt(elements.enemyHp.textContent) - damage;
  if (enemyHp < 0) enemyHp = 0;
  
  elements.enemyHp.textContent = enemyHp;
  elements.enemyHpFill.style.width = `${(enemyHp / enemyMaxHp) * 100}%`;

  // 敌人反击
  if (enemyHp > 0) {
    setTimeout(() => {
      const enemyDamage = Math.floor(Math.random() * 15) + 5;
      gameState.player.hp -= enemyDamage;
      if (gameState.player.hp < 0) gameState.player.hp = 0;
      
      elements.selfHp.textContent = gameState.player.hp;
      elements.selfHpFill.style.width = `${(gameState.player.hp / gameState.player.maxHp) * 100}%`;
      
      addCombatLog(`${gameState.combat.session.enemy.name} 反击造成 ${enemyDamage} 点伤害！`, 'defense');

      if (gameState.player.hp <= 0) {
        endCombat('lose');
      }
    }, 500);
  } else {
    endCombat('win');
  }

  // 增加回合
  gameState.combat.session.round++;
  elements.combatRound.textContent = gameState.combat.session.round;
}

function addCombatLog(message, type = 'normal') {
  const log = {
    time: formatTime(),
    message,
    type
  };
  
  gameState.combat.session.logs.push(log);
  
  const logEntry = document.createElement('div');
  logEntry.className = 'log-entry';
  logEntry.innerHTML = `
    <span class="log-time">${log.time}</span>
    <span class="log-message">${message}</span>
  `;
  
  elements.combatLogsContainer.appendChild(logEntry);
  elements.combatLogsContainer.scrollTop = elements.combatLogsContainer.scrollHeight;
}

function endCombat(result) {
  gameState.combat.session.status = 'ended';
  elements.combatStatus.textContent = '已结束';
  elements.combatStatus.classList.remove('active');
  elements.combatStatus.classList.add('ended');
  elements.combatActions.classList.add('hidden');
  elements.combatResult.classList.remove('hidden');

  const resultTexts = {
    win: '胜利！',
    lose: '失败！',
    escape: '逃跑成功',
    surrender: '已投降'
  };

  elements.resultText.textContent = resultTexts[result] || result;
  elements.resultText.className = 'result-text ' + result;

  if (result === 'win') {
    const expGain = 50;
    gameState.player.gainExp(expGain);
    addSystemMessage(`战斗胜利！获得 ${expGain} 经验`, 'success');
  }

  // 恢复血量
  setTimeout(() => {
    gameState.player.hp = gameState.player.maxHp;
    gameState.player.mp = gameState.player.maxMp;
    closeCombat();
  }, 2000);
}

function closeCombat() {
  gameState.combat.isActive = false;
  gameState.combat.session = null;
  elements.combatOverlay.classList.add('hidden');
  elements.combatActions.classList.remove('hidden');
  elements.combatResult.classList.add('hidden');
  elements.combatStatus.textContent = '战斗中';
  elements.combatStatus.classList.add('active');
  elements.combatStatus.classList.remove('ended');
  elements.combatLogsContainer.innerHTML = '';
}

// ========================================
// 交易系统
// ========================================

function initiateTrade(targetPlayer) {
  if (gameState.trade.isActive) return;

  // 如果是真实玩家（有socketId），通过P2P发送交易请求
  if (targetPlayer.socketId && p2pManager) {
    const connection = p2pManager.getConnection(targetPlayer.id);
    if (connection && connection.isConnected()) {
      p2pManager.sendMessage(targetPlayer.id, 'tradeRequest', {
        playerId: gameState.player.id,
        playerName: gameState.player.name,
        timestamp: Date.now()
      });
      addSystemMessage(`已向 ${targetPlayer.name} 发送交易请求`, 'info');
      return;
    }
  }

  // 本地交易（模拟）
  gameState.trade.isActive = true;
  gameState.trade.session = {
    targetPlayer,
    status: 'pending',
    isRemote: false
  };

  elements.tradeOverlay.classList.remove('hidden');
  elements.tradeStatus.textContent = `等待 ${targetPlayer.name} 确认...`;

  addSystemMessage(`向 ${targetPlayer.name} 发起交易请求`, 'info');

  // 模拟对方确认
  setTimeout(() => {
    if (gameState.trade.isActive) {
      gameState.trade.session.status = 'confirmed';
      elements.tradeStatus.textContent = '对方已确认，请完成交易';
      addSystemMessage(`${targetPlayer.name} 接受了交易请求`, 'success');
    }
  }, 2000);
}

function cancelTrade() {
  gameState.trade.isActive = false;
  gameState.trade.session = null;
  elements.tradeOverlay.classList.add('hidden');
  addSystemMessage('取消了交易', 'warning');
}

function confirmTrade() {
  if (!gameState.trade.isActive) return;
  
  addSystemMessage('交易完成！', 'success');
  gameState.trade.isActive = false;
  gameState.trade.session = null;
  elements.tradeOverlay.classList.add('hidden');
}

// ========================================
// 事件监听绑定
// ========================================

function bindEvents() {
  console.log('[Game] Binding events...');
  
  // 登录界面 - 创建新角色
  if (!elements.playerNameInput) {
    console.error('[Game] playerNameInput not found!');
    return;
  }
  if (!elements.createPlayerBtn) {
    console.error('[Game] createPlayerBtn not found!');
    return;
  }
  
  console.log('[Game] Adding input listener to playerNameInput');
  
  // 初始化时检查输入框是否有值，如果有则启用按钮
  const initialValue = elements.playerNameInput.value.trim();
  if (initialValue) {
    elements.createPlayerBtn.disabled = false;
    console.log('[Game] Initial value found, button enabled');
  }
  
  // 使用多种事件监听确保按钮状态更新
  const updateButtonState = () => {
    const hasValue = !!elements.playerNameInput.value.trim();
    console.log('[Game] Updating button state, hasValue:', hasValue);
    elements.createPlayerBtn.disabled = !hasValue;
  };
  
  elements.playerNameInput.addEventListener('input', updateButtonState);
  elements.playerNameInput.addEventListener('keyup', updateButtonState);
  elements.playerNameInput.addEventListener('change', updateButtonState);

  elements.playerNameInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter' && e.target.value.trim()) {
      console.log('[Game] Enter key pressed, initializing player');
      initializePlayer(e.target.value.trim());
    }
  });

  elements.createPlayerBtn.addEventListener('click', (e) => {
    console.log('[Game] Create player button clicked');
    e.preventDefault();
    e.stopPropagation();
    const name = elements.playerNameInput.value.trim();
    console.log('[Game] Player name:', name);
    if (name) {
      initializePlayer(name);
    } else {
      console.warn('[Game] Player name is empty');
    }
  });

  // 登录界面 - 恢复角色
  elements.cidInput.addEventListener('input', (e) => {
    elements.restorePlayerBtn.disabled = !e.target.value.trim();
  });

  elements.cidInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter' && e.target.value.trim()) {
      restoreCharacter(e.target.value.trim());
    }
  });

  elements.restorePlayerBtn.addEventListener('click', () => {
    const cid = elements.cidInput.value.trim();
    if (cid) restoreCharacter(cid);
  });

  // 登录选项卡切换
  elements.tabNewCharacter.addEventListener('click', showNewCharacterPanel);
  elements.tabRestoreCharacter.addEventListener('click', showRestorePanel);

  // 头部按钮
  elements.openPlayerPanelBtn.addEventListener('click', () => {
    updatePlayerPanel();
    elements.playerPanelOverlay.classList.remove('hidden');
  });

  elements.connectBtn.addEventListener('click', () => {
    if (gameState.isConnected) {
      disconnect();
    } else {
      connect();
    }
  });

  // 修炼
  elements.stopCultivationBtn.addEventListener('click', stopCultivation);

  // 角色面板
  elements.closePlayerPanelBtn.addEventListener('click', () => {
    elements.playerPanelOverlay.classList.add('hidden');
  });

  elements.playerPanelOverlay.addEventListener('click', (e) => {
    if (e.target === elements.playerPanelOverlay) {
      elements.playerPanelOverlay.classList.add('hidden');
    }
  });

  // 备份角色按钮
  elements.backupCharacterBtn.addEventListener('click', backupCharacter);

  // CID弹窗
  elements.closeCidModalBtn.addEventListener('click', closeCIDModal);
  elements.copyCidBtn.addEventListener('click', copyCIDToClipboard);

  elements.cidModal.addEventListener('click', (e) => {
    if (e.target === elements.cidModal) {
      closeCIDModal();
    }
  });

  // 战斗面板
  elements.escapeBtn.addEventListener('click', () => {
    if (Math.random() > 0.5) {
      endCombat('escape');
    } else {
      addCombatLog('逃跑失败！', 'error');
    }
  });

  elements.surrenderBtn.addEventListener('click', () => {
    endCombat('surrender');
  });

  // 交易面板
  elements.cancelTradeBtn.addEventListener('click', cancelTrade);
  elements.confirmTradeBtn.addEventListener('click', confirmTrade);
}

// ========================================
// DHT 相关功能
// ========================================

/**
 * 初始化 DHT 管理器（在游戏初始化时调用）
 */
async function initDHTManager() {
  if (dhtManager) {
    console.log('[Game] DHT Manager already exists');
    return;
  }

  console.log('[Game] Initializing DHT Manager...');
  
  try {
    // 创建 DHT 管理器实例
    dhtManager = new DHTManager({
      bootstrapNodes: [
        { url: 'ws://49.232.170.26:5050/dht', nodeId: null }
      ],
      k: 8,
      alpha: 3,
      refreshInterval: 15 * 60 * 1000,
      pingInterval: 5 * 60 * 1000,
      republishInterval: 60 * 60 * 1000
    });

    // 设置 DHT 事件处理器
    setupDHTEventHandlers();
    
    // 更新 DHT 状态为连接中
    updateDHTStatus('connecting');
    
    // 初始化 DHT
    const success = await dhtManager.init();
    
    if (success) {
      console.log('[Game] DHT Manager initialized successfully');
      
      // 如果玩家已存在，设置数据提供者并发布等级
      if (gameState.player) {
        setupDHTPlayerDataProvider();
        await publishPlayerLevelToDHT();
      }
      
      // 启动定期发布等级
      startDHTLevelPublishing();
      
      // 启动 DHT 节点发现
      startDHTNodeDiscovery();
    } else {
      console.warn('[Game] DHT initialization failed, continuing without DHT');
      updateDHTStatus('error');
    }
  } catch (error) {
    console.error('[Game] Failed to initialize DHT Manager:', error);
    updateDHTStatus('error');
    // DHT 失败不影响游戏继续运行
  }
}

/**
 * 设置 DHT 玩家数据提供者
 */
function setupDHTPlayerDataProvider() {
  if (!dhtManager || !gameState.player) return;
  
  // 设置数据提供者，用于响应其他节点的查询
  dhtManager.getPlayerDataFromGame = () => {
    if (gameState.player) {
      return {
        level: gameState.player.level,
        realm: gameState.player.getFullRealmName(),
        exp: gameState.player.exp,
        name: gameState.player.name
      };
    }
    return null;
  };
}

/**
 * 定期发布玩家信息到 DHT
 */
let dhtLevelPublishInterval = null;
function startDHTLevelPublishing() {
  // 清除现有定时器
  if (dhtLevelPublishInterval) {
    clearInterval(dhtLevelPublishInterval);
  }
  
  // 立即发布一次
  announcePlayerToDHT();
  
  // 每 60 秒发布一次玩家信息
  dhtLevelPublishInterval = setInterval(() => {
    if (gameState.player && dhtManager && dhtManager.isInitialized) {
      announcePlayerToDHT();
    }
  }, 60000);
  
  console.log('[Game] DHT player announcement publishing started (every 60s)');
}

/**
 * 停止定期发布等级
 */
function stopDHTLevelPublishing() {
  if (dhtLevelPublishInterval) {
    clearInterval(dhtLevelPublishInterval);
    dhtLevelPublishInterval = null;
    console.log('[Game] DHT level publishing stopped');
  }
}

/**
 * 启动 DHT 节点发现
 */
let dhtNodeDiscoveryInterval = null;
function startDHTNodeDiscovery() {
  // 清除现有定时器
  if (dhtNodeDiscoveryInterval) {
    clearInterval(dhtNodeDiscoveryInterval);
  }
  
  // 立即执行一次发现
  discoverDHTNodes();
  
  // 每 30 秒发现一次新节点
  dhtNodeDiscoveryInterval = setInterval(() => {
    if (dhtManager && dhtManager.isInitialized) {
      discoverDHTNodes();
    }
  }, 30000);
  
  console.log('[Game] DHT node discovery started');
}

/**
 * 停止 DHT 节点发现
 */
function stopDHTNodeDiscovery() {
  if (dhtNodeDiscoveryInterval) {
    clearInterval(dhtNodeDiscoveryInterval);
    dhtNodeDiscoveryInterval = null;
    console.log('[Game] DHT node discovery stopped');
  }
}

/**
 * 发现 DHT 节点并更新在线玩家
 */
async function discoverDHTNodes() {
  if (!dhtManager || !dhtManager.isInitialized) return;
  
  try {
    // 获取路由表中的所有节点
    const stats = dhtManager.getStats();
    if (stats.routingTable) {
      console.log('[Game] DHT routing table:', stats.routingTable);
      
      // 更新 DHT 状态显示中的节点数
      updateDHTNodeCount(stats.routingTable.totalNodes);
    }
    
    // 刷新路由表以发现更多节点
    await dhtManager.refreshRoutingTable();
  } catch (error) {
    console.warn('[Game] DHT node discovery error:', error);
  }
}

/**
 * 更新 DHT 节点数显示
 */
function updateDHTNodeCount(count) {
  const dhtNodeCountEl = document.getElementById('dht-node-count');
  if (dhtNodeCountEl) {
    dhtNodeCountEl.textContent = count || 0;
  }
}

/**
 * 销毁 DHT 管理器
 */
function destroyDHTManager() {
  stopDHTLevelPublishing();
  stopDHTNodeDiscovery();
  
  if (dhtManager) {
    dhtManager.destroy();
    dhtManager = null;
    console.log('[Game] DHT Manager destroyed');
  }
  
  updateDHTStatus('offline');
}

// ========================================
// 游戏初始化
// ========================================

function init() {
  console.log('[Game] Initializing...');
  
  // 初始化DOM元素引用（必须在DOM加载后调用）
  elements = initElements();
  
  // 检查关键元素是否存在
  console.log('[Game] Elements check:', {
    playerNameInput: !!elements?.playerNameInput,
    createPlayerBtn: !!elements?.createPlayerBtn,
    cidInput: !!elements?.cidInput,
    restorePlayerBtn: !!elements?.restorePlayerBtn
  });

  // 绑定事件
  bindEvents();
  
  console.log('[Game] Events bound successfully');

  // 添加欢迎消息（仅在主游戏界面显示后）
  // 登录界面的消息通过其他方式显示
  if (elements.messagesList) {
    addSystemMessage('欢迎来到P2P修仙游戏！', 'info');
    addSystemMessage('请输入道号开始游戏', 'info');
  }

  // 初始化 DHT 管理器（独立于网络连接）
  initDHTManager();

  // 定期更新延迟显示
  setInterval(() => {
    if (gameState.isConnected) {
      updateLatencyFromP2P();
    }
  }, 5000);

  console.log('[Game] Initialized successfully');
}

// 启动游戏
document.addEventListener('DOMContentLoaded', init);
