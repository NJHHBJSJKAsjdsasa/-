// DOM 元素引用初始化
function initElements() {
  return {
    // 容器
    gameContainer: document.getElementById('game-container'),
    loginScreen: document.getElementById('login-screen'),
    mainGame: document.getElementById('main-game'),

    // 登录界面
    playerNameInput: document.getElementById('player-name-input'),
    createPlayerBtn: document.getElementById('create-player-btn'),
    cidInput: document.getElementById('cid-input'),
    restorePlayerBtn: document.getElementById('restore-player-btn'),
    tabNewCharacter: document.getElementById('tab-new-character'),
    tabRestoreCharacter: document.getElementById('tab-restore-character'),
    newCharacterPanel: document.getElementById('new-character-panel'),
    restoreCharacterPanel: document.getElementById('restore-character-panel'),

    // 头部信息
    headerPlayerName: document.getElementById('header-player-name'),
    headerRealm: document.getElementById('header-realm'),
    headerLevel: document.getElementById('header-level'),
    connectBtn: document.getElementById('connect-btn'),
    openPlayerPanelBtn: document.getElementById('open-player-panel-btn'),

    // 网络状态
    networkStatus: document.getElementById('network-status'),
    signalNodeInfo: document.getElementById('signal-node-info'),
    signalNodeUrl: document.getElementById('signal-node-url'),
    signalNodeStatus: document.getElementById('signal-node-status'),

    // DHT状态
    dhtStatus: document.getElementById('dht-status'),
    dhtPublicKey: document.getElementById('dht-public-key'),
    dhtNodeCount: document.getElementById('dht-node-count'),

    // 修炼区域
    cultivatingPanel: document.getElementById('cultivating-panel'),
    methodListPanel: document.getElementById('method-list-panel'),
    methodButtons: document.getElementById('method-buttons'),
    currentMethodName: document.getElementById('current-method-name'),
    expFill: document.getElementById('exp-fill'),
    currentExp: document.getElementById('current-exp'),
    maxExp: document.getElementById('max-exp'),
    expPercentage: document.getElementById('exp-percentage'),
    expPerSecond: document.getElementById('exp-per-second'),
    stopCultivationBtn: document.getElementById('stop-cultivation-btn'),

    // 消息区域
    messagesList: document.getElementById('messages-list'),

    // 玩家列表
    onlineCount: document.getElementById('online-count'),
    playerList: document.getElementById('player-list'),

    // 角色面板
    playerPanelOverlay: document.getElementById('player-panel-overlay'),
    closePlayerPanelBtn: document.getElementById('close-player-panel-btn'),
    backupCharacterBtn: document.getElementById('backup-character-btn'),
    panelPlayerName: document.getElementById('panel-player-name'),
    panelRealmBadge: document.getElementById('panel-realm-badge'),
    panelLevel: document.getElementById('panel-level'),
    panelExpFill: document.getElementById('panel-exp-fill'),
    panelExp: document.getElementById('panel-exp'),
    panelMaxExp: document.getElementById('panel-max-exp'),
    hpFill: document.getElementById('hp-fill'),
    hp: document.getElementById('hp'),
    maxHp: document.getElementById('max-hp'),
    mpFill: document.getElementById('mp-fill'),
    mp: document.getElementById('mp'),
    maxMp: document.getElementById('max-mp'),
    currentMethodSection: document.getElementById('current-method-section'),
    panelMethodName: document.getElementById('panel-method-name'),
    panelMethodQuality: document.getElementById('panel-method-quality'),
    panelMethodDesc: document.getElementById('panel-method-desc'),

    // 战斗面板
    combatOverlay: document.getElementById('combat-overlay'),
    combatRound: document.getElementById('combat-round'),
    combatStatus: document.getElementById('combat-status'),
    enemyName: document.getElementById('enemy-name'),
    enemyHpFill: document.getElementById('enemy-hp-fill'),
    enemyHp: document.getElementById('enemy-hp'),
    enemyMaxHp: document.getElementById('enemy-max-hp'),
    selfName: document.getElementById('self-name'),
    selfHpFill: document.getElementById('self-hp-fill'),
    selfHp: document.getElementById('self-hp'),
    selfMaxHp: document.getElementById('self-max-hp'),
    combatLogsContainer: document.getElementById('combat-logs-container'),
    skillsGrid: document.getElementById('skills-grid'),
    combatActions: document.getElementById('combat-actions'),
    combatResult: document.getElementById('combat-result'),
    resultText: document.getElementById('result-text'),
    escapeBtn: document.getElementById('escape-btn'),
    surrenderBtn: document.getElementById('surrender-btn'),

    // 交易面板
    tradeOverlay: document.getElementById('trade-overlay'),
    tradeStatus: document.getElementById('trade-status'),
    cancelTradeBtn: document.getElementById('cancel-trade-btn'),
    confirmTradeBtn: document.getElementById('confirm-trade-btn'),

    // CID弹窗
    cidModal: document.getElementById('cid-modal'),
    closeCidModalBtn: document.getElementById('close-cid-modal-btn'),
    cidDisplayInput: document.getElementById('cid-display-input'),
    copyCidBtn: document.getElementById('copy-cid-btn'),

    // 加载遮罩
    loadingOverlay: document.getElementById('loading-overlay'),
    loadingText: document.getElementById('loading-text')
  };
}
