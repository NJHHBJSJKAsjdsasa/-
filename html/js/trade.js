/**
 * 修仙游戏 - 交易系统类
 * 管理玩家之间的物品交易
 */

// 交易状态
const TRADE_STATE = {
  IDLE: 'idle',
  REQUESTING: 'requesting',
  PENDING: 'pending',
  ACTIVE: 'active',
  CONFIRMING: 'confirming',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
  REJECTED: 'rejected'
};

// 交易物品类型
const ITEM_TYPES = {
  SPIRIT_STONE: 'spirit_stone',
  MEDICINE: 'medicine',
  MATERIAL: 'material',
  EQUIPMENT: 'equipment',
  SKILL_BOOK: 'skill_book',
  TREASURE: 'treasure'
};

// 物品定义示例
const TRADE_ITEMS = [
  {
    id: 'low_spirit_stone',
    name: '下品灵石',
    type: ITEM_TYPES.SPIRIT_STONE,
    description: '蕴含少量灵气的灵石',
    value: 10,
    stackable: true
  },
  {
    id: 'mid_spirit_stone',
    name: '中品灵石',
    type: ITEM_TYPES.SPIRIT_STONE,
    description: '蕴含中等灵气的灵石',
    value: 100,
    stackable: true
  },
  {
    id: 'high_spirit_stone',
    name: '上品灵石',
    type: ITEM_TYPES.SPIRIT_STONE,
    description: '蕴含大量灵气的灵石',
    value: 1000,
    stackable: true
  },
  {
    id: 'healing_pill',
    name: '回血丹',
    type: ITEM_TYPES.MEDICINE,
    description: '恢复50点生命值',
    value: 50,
    stackable: true,
    effect: { type: 'heal', amount: 50 }
  },
  {
    id: 'mana_pill',
    name: '回灵丹',
    type: ITEM_TYPES.MEDICINE,
    description: '恢复30点灵力',
    value: 40,
    stackable: true,
    effect: { type: 'restore_mp', amount: 30 }
  },
  {
    id: 'exp_pill',
    name: '经验丹',
    type: ITEM_TYPES.MEDICINE,
    description: '获得100点经验',
    value: 200,
    stackable: true,
    effect: { type: 'exp', amount: 100 }
  },
  {
    id: 'iron_sword',
    name: '铁剑',
    type: ITEM_TYPES.EQUIPMENT,
    description: '普通的铁剑，攻击力+5',
    value: 150,
    stackable: false,
    stats: { attack: 5 }
  },
  {
    id: 'spirit_robe',
    name: '法袍',
    type: ITEM_TYPES.EQUIPMENT,
    description: '修士常穿的法袍，防御+3',
    value: 200,
    stackable: false,
    stats: { defense: 3 }
  }
];

class TradeSystem {
  constructor(player) {
    this.player = player;
    this.state = TRADE_STATE.IDLE;
    this.tradePartner = null;
    this.myItems = [];      // 我提供的物品
    this.partnerItems = []; // 对方提供的物品
    this.myConfirmed = false;
    this.partnerConfirmed = false;
    this.onTradeRequest = null;
    this.onTradeAccept = null;
    this.onTradeCancel = null;
    this.onTradeComplete = null;
    this.onItemUpdate = null;
    this.tradeStartTime = null;
    this.tradeTimeout = null;
    this.TRADE_TIMEOUT_MS = 120000; // 2分钟超时
  }

  getItemById(itemId) {
    return TRADE_ITEMS.find(item => item.id === itemId);
  }

  requestTrade(partner) {
    if (this.state !== TRADE_STATE.IDLE) {
      return { success: false, message: '当前正在交易中' };
    }

    if (!partner) {
      return { success: false, message: '无效的交易对象' };
    }

    this.state = TRADE_STATE.REQUESTING;
    this.tradePartner = partner;
    this.tradeStartTime = Date.now();

    this.startTimeout();

    if (this.onTradeRequest) {
      this.onTradeRequest({
        from: this.player.name,
        to: partner.name,
        time: this.tradeStartTime
      });
    }

    return {
      success: true,
      message: `已向 ${partner.name} 发送交易请求`,
      partner: partner.name
    };
  }

  receiveTradeRequest(partner) {
    if (this.state !== TRADE_STATE.IDLE) {
      return { success: false, message: '当前正在交易中，无法接受请求' };
    }

    this.state = TRADE_STATE.PENDING;
    this.tradePartner = partner;
    this.tradeStartTime = Date.now();

    this.startTimeout();

    return {
      success: true,
      message: `收到来自 ${partner.name} 的交易请求`,
      partner: partner.name
    };
  }

  acceptTrade() {
    if (this.state !== TRADE_STATE.PENDING && this.state !== TRADE_STATE.REQUESTING) {
      return { success: false, message: '没有待处理的交易请求' };
    }

    this.state = TRADE_STATE.ACTIVE;
    this.myItems = [];
    this.partnerItems = [];
    this.myConfirmed = false;
    this.partnerConfirmed = false;

    this.clearTimeout();
    this.startTimeout();

    if (this.onTradeAccept) {
      this.onTradeAccept({
        partner: this.tradePartner.name,
        time: Date.now()
      });
    }

    return {
      success: true,
      message: '交易开始',
      partner: this.tradePartner.name
    };
  }

  rejectTrade() {
    if (this.state !== TRADE_STATE.PENDING) {
      return { success: false, message: '没有待处理的交易请求' };
    }

    const partnerName = this.tradePartner ? this.tradePartner.name : '对方';
    
    this.state = TRADE_STATE.REJECTED;
    this.clearTimeout();
    this.reset();

    return {
      success: true,
      message: `已拒绝 ${partnerName} 的交易请求`
    };
  }

  addItem(itemId, quantity = 1) {
    if (this.state !== TRADE_STATE.ACTIVE) {
      return { success: false, message: '不在交易状态' };
    }

    if (this.myConfirmed) {
      return { success: false, message: '已确认交易，无法修改' };
    }

    const item = this.getItemById(itemId);
    if (!item) {
      return { success: false, message: '物品不存在' };
    }

    const existingItem = this.myItems.find(i => i.id === itemId);
    
    if (existingItem) {
      if (item.stackable) {
        existingItem.quantity += quantity;
      } else {
        return { success: false, message: '该物品无法堆叠' };
      }
    } else {
      this.myItems.push({
        id: item.id,
        name: item.name,
        type: item.type,
        quantity: quantity,
        value: item.value,
        stackable: item.stackable
      });
    }

    this.unconfirm();

    if (this.onItemUpdate) {
      this.onItemUpdate({
        side: 'mine',
        items: [...this.myItems]
      });
    }

    return {
      success: true,
      message: `添加 ${item.name} x${quantity}`,
      item: item
    };
  }

  removeItem(itemId, quantity = 1) {
    if (this.state !== TRADE_STATE.ACTIVE) {
      return { success: false, message: '不在交易状态' };
    }

    if (this.myConfirmed) {
      return { success: false, message: '已确认交易，无法修改' };
    }

    const itemIndex = this.myItems.findIndex(i => i.id === itemId);
    if (itemIndex === -1) {
      return { success: false, message: '物品不在交易栏中' };
    }

    const item = this.myItems[itemIndex];
    
    if (item.quantity <= quantity) {
      this.myItems.splice(itemIndex, 1);
    } else {
      item.quantity -= quantity;
    }

    this.unconfirm();

    if (this.onItemUpdate) {
      this.onItemUpdate({
        side: 'mine',
        items: [...this.myItems]
      });
    }

    return {
      success: true,
      message: '移除物品成功'
    };
  }

  updatePartnerItems(items) {
    this.partnerItems = items || [];
    this.partnerConfirmed = false;

    if (this.onItemUpdate) {
      this.onItemUpdate({
        side: 'partner',
        items: [...this.partnerItems]
      });
    }
  }

  confirmTrade() {
    if (this.state !== TRADE_STATE.ACTIVE) {
      return { success: false, message: '不在交易状态' };
    }

    this.myConfirmed = true;

    if (this.partnerConfirmed) {
      return this.completeTrade();
    }

    return {
      success: true,
      message: '已确认交易，等待对方确认',
      confirmed: true
    };
  }

  unconfirm() {
    this.myConfirmed = false;
    this.partnerConfirmed = false;
  }

  receivePartnerConfirmation(confirmed) {
    this.partnerConfirmed = confirmed;

    if (confirmed && this.myConfirmed) {
      return this.completeTrade();
    }

    return {
      success: true,
      message: '对方已确认交易',
      partnerConfirmed: confirmed
    };
  }

  completeTrade() {
    this.state = TRADE_STATE.COMPLETED;
    this.clearTimeout();

    const myTotalValue = this.calculateTotalValue(this.myItems);
    const partnerTotalValue = this.calculateTotalValue(this.partnerItems);

    const result = {
      success: true,
      message: '交易完成',
      myItems: [...this.myItems],
      receivedItems: [...this.partnerItems],
      myValue: myTotalValue,
      receivedValue: partnerTotalValue
    };

    if (this.onTradeComplete) {
      this.onTradeComplete(result);
    }

    this.reset();
    return result;
  }

  calculateTotalValue(items) {
    return items.reduce((total, item) => total + (item.value * item.quantity), 0);
  }

  cancelTrade(reason = '') {
    if (this.state === TRADE_STATE.IDLE) {
      return { success: false, message: '当前没有交易' };
    }

    this.state = TRADE_STATE.CANCELLED;
    this.clearTimeout();

    const result = {
      success: true,
      message: reason || '交易已取消',
      cancelledBy: this.player.name,
      time: Date.now()
    };

    if (this.onTradeCancel) {
      this.onTradeCancel(result);
    }

    this.reset();
    return result;
  }

  startTimeout() {
    this.clearTimeout();
    this.tradeTimeout = setTimeout(() => {
      this.cancelTrade('交易超时');
    }, this.TRADE_TIMEOUT_MS);
  }

  clearTimeout() {
    if (this.tradeTimeout) {
      clearTimeout(this.tradeTimeout);
      this.tradeTimeout = null;
    }
  }

  reset() {
    this.tradePartner = null;
    this.myItems = [];
    this.partnerItems = [];
    this.myConfirmed = false;
    this.partnerConfirmed = false;
    this.tradeStartTime = null;
    this.state = TRADE_STATE.IDLE;
  }

  getTradeStatus() {
    return {
      state: this.state,
      isInTrade: this.state !== TRADE_STATE.IDLE,
      partner: this.tradePartner ? this.tradePartner.name : null,
      myItems: [...this.myItems],
      partnerItems: [...this.partnerItems],
      myConfirmed: this.myConfirmed,
      partnerConfirmed: this.partnerConfirmed,
      myTotalValue: this.calculateTotalValue(this.myItems),
      partnerTotalValue: this.calculateTotalValue(this.partnerItems),
      elapsedTime: this.tradeStartTime ? Date.now() - this.tradeStartTime : 0
    };
  }

  toJSON() {
    return {
      state: this.state,
      tradePartner: this.tradePartner ? this.tradePartner.id : null,
      myItems: this.myItems,
      partnerItems: this.partnerItems,
      myConfirmed: this.myConfirmed,
      partnerConfirmed: this.partnerConfirmed,
      tradeStartTime: this.tradeStartTime
    };
  }

  static fromJSON(data, player) {
    const trade = new TradeSystem(player);
    trade.state = data.state || TRADE_STATE.IDLE;
    trade.myItems = data.myItems || [];
    trade.partnerItems = data.partnerItems || [];
    trade.myConfirmed = data.myConfirmed || false;
    trade.partnerConfirmed = data.partnerConfirmed || false;
    trade.tradeStartTime = data.tradeStartTime;
    
    if (trade.state === TRADE_STATE.ACTIVE || trade.state === TRADE_STATE.PENDING) {
      trade.startTimeout();
    }
    
    return trade;
  }
}

// 兼容模块导出和全局变量
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { TradeSystem, TRADE_STATE, ITEM_TYPES, TRADE_ITEMS };
} else {
  window.TradeSystem = TradeSystem;
  window.TRADE_STATE = TRADE_STATE;
  window.ITEM_TYPES = ITEM_TYPES;
  window.TRADE_ITEMS = TRADE_ITEMS;
}
