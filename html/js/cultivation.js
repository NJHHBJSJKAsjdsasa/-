/**
 * 修仙游戏 - 修炼系统类
 * 管理玩家修炼、功法选择、进度计算等
 */

// 功法定义
const CULTIVATION_METHODS = [
  {
    id: 'basic_qi',
    name: '基础吐纳法',
    description: '最基础的呼吸吐纳之法，适合初学者',
    minRealm: 0,
    expPerSecond: 1,
    mpCost: 0
  },
  {
    id: 'spirit_gathering',
    name: '聚灵诀',
    description: '聚集天地灵气，加速修炼',
    minRealm: 0,
    expPerSecond: 3,
    mpCost: 1
  },
  {
    id: 'five_elements',
    name: '五行心法',
    description: '调和五行之力，提升修炼效率',
    minRealm: 1,
    expPerSecond: 8,
    mpCost: 2
  },
  {
    id: 'golden_core',
    name: '金丹大道',
    description: '凝结金丹之法，修炼速度大幅提升',
    minRealm: 2,
    expPerSecond: 20,
    mpCost: 5
  },
  {
    id: 'nascent_soul',
    name: '元婴秘术',
    description: '培育元婴的秘传功法',
    minRealm: 3,
    expPerSecond: 50,
    mpCost: 10
  },
  {
    id: 'spirit_division',
    name: '化神分神术',
    description: '化神期修士专用功法',
    minRealm: 4,
    expPerSecond: 120,
    mpCost: 20
  },
  {
    id: 'void_refining',
    name: '炼虚合道',
    description: '炼虚期修士修炼大道',
    minRealm: 5,
    expPerSecond: 300,
    mpCost: 40
  },
  {
    id: 'body_integration',
    name: '合体归真',
    description: '合体期修士融合天地之法',
    minRealm: 6,
    expPerSecond: 800,
    mpCost: 80
  },
  {
    id: 'great_ascension',
    name: '大乘渡世',
    description: '大乘期修士渡世之法',
    minRealm: 7,
    expPerSecond: 2000,
    mpCost: 150
  },
  {
    id: 'tribulation',
    name: '渡劫飞升',
    description: '渡劫期修士冲击仙界之法',
    minRealm: 8,
    expPerSecond: 5000,
    mpCost: 300
  }
];

// 修炼状态
const CULTIVATION_STATE = {
  IDLE: 'idle',
  ACTIVE: 'active',
  INTERRUPTED: 'interrupted',
  COMPLETED: 'completed'
};

class CultivationSystem {
  constructor(player) {
    this.player = player;
    this.state = CULTIVATION_STATE.IDLE;
    this.currentMethod = null;
    this.startTime = null;
    this.totalExpGained = 0;
    this.totalMpConsumed = 0;
    this.interruptions = [];
    this.onProgressUpdate = null;
    this.onLevelUp = null;
    this.onComplete = null;
    this.intervalId = null;
  }

  getAvailableMethods() {
    return CULTIVATION_METHODS.filter(method => 
      method.minRealm <= this.player.realm
    );
  }

  getMethodById(methodId) {
    return CULTIVATION_METHODS.find(method => method.id === methodId);
  }

  canStartCultivation(methodId) {
    const method = this.getMethodById(methodId);
    if (!method) return { canStart: false, reason: '功法不存在' };
    if (method.minRealm > this.player.realm) {
      return { canStart: false, reason: `需要${REALMS[method.minRealm].name}境界` };
    }
    if (this.state === CULTIVATION_STATE.ACTIVE) {
      return { canStart: false, reason: '正在修炼中' };
    }
    if (this.player.mp < method.mpCost) {
      return { canStart: false, reason: '灵力不足' };
    }
    return { canStart: true, reason: '' };
  }

  startCultivation(methodId) {
    const check = this.canStartCultivation(methodId);
    if (!check.canStart) {
      return { success: false, message: check.reason };
    }

    this.currentMethod = this.getMethodById(methodId);
    this.state = CULTIVATION_STATE.ACTIVE;
    this.startTime = Date.now();
    this.totalExpGained = 0;
    this.totalMpConsumed = 0;

    this.startTicking();

    return { 
      success: true, 
      message: `开始修炼 ${this.currentMethod.name}`,
      method: this.currentMethod
    };
  }

  startTicking() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
    }

    this.intervalId = setInterval(() => {
      this.tick();
    }, 1000);
  }

  tick() {
    if (this.state !== CULTIVATION_STATE.ACTIVE || !this.currentMethod) {
      return;
    }

    if (this.player.mp < this.currentMethod.mpCost) {
      this.interruptCultivation('灵力耗尽');
      return;
    }

    this.player.consumeMp(this.currentMethod.mpCost);
    this.totalMpConsumed += this.currentMethod.mpCost;

    const expGain = this.calculateExpGain();
    this.totalExpGained += expGain;

    const leveledUp = this.player.gainExp(expGain);

    if (this.onProgressUpdate) {
      this.onProgressUpdate({
        expGained: expGain,
        totalExpGained: this.totalExpGained,
        currentExp: this.player.exp,
        maxExp: this.player.maxExp,
        mpConsumed: this.currentMethod.mpCost,
        totalMpConsumed: this.totalMpConsumed,
        currentMp: this.player.mp,
        maxMp: this.player.maxMp,
        duration: this.getDuration()
      });
    }

    if (leveledUp && this.onLevelUp) {
      this.onLevelUp({
        realm: this.player.getFullRealm(),
        level: this.player.level,
        attributes: { ...this.player.attributes }
      });
    }
  }

  calculateExpGain() {
    if (!this.currentMethod) return 0;
    
    let exp = this.currentMethod.expPerSecond;
    
    const realmBonus = 1 + (this.player.realm * 0.1);
    exp *= realmBonus;
    
    const spiritBonus = 1 + (this.player.attributes.spirit * 0.01);
    exp *= spiritBonus;
    
    const luckBonus = Math.random() < (this.player.attributes.luck * 0.01) ? 2 : 1;
    exp *= luckBonus;
    
    return Math.floor(exp);
  }

  stopCultivation() {
    if (this.state !== CULTIVATION_STATE.ACTIVE) {
      return { success: false, message: '不在修炼状态' };
    }

    this.state = CULTIVATION_STATE.COMPLETED;
    this.stopTicking();

    const result = {
      success: true,
      message: '修炼结束',
      duration: this.getDuration(),
      totalExpGained: this.totalExpGained,
      totalMpConsumed: this.totalMpConsumed,
      method: this.currentMethod
    };

    if (this.onComplete) {
      this.onComplete(result);
    }

    this.reset();
    return result;
  }

  interruptCultivation(reason) {
    if (this.state !== CULTIVATION_STATE.ACTIVE) return;

    this.state = CULTIVATION_STATE.INTERRUPTED;
    this.stopTicking();

    this.interruptions.push({
      time: Date.now(),
      reason: reason,
      duration: this.getDuration(),
      expGained: this.totalExpGained
    });

    const result = {
      success: false,
      message: `修炼中断: ${reason}`,
      duration: this.getDuration(),
      totalExpGained: this.totalExpGained,
      reason: reason
    };

    this.reset();
    return result;
  }

  stopTicking() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  reset() {
    this.currentMethod = null;
    this.startTime = null;
    this.totalExpGained = 0;
    this.totalMpConsumed = 0;
  }

  getDuration() {
    if (!this.startTime) return 0;
    return Date.now() - this.startTime;
  }

  getProgress() {
    if (this.state !== CULTIVATION_STATE.ACTIVE) {
      return {
        isActive: false,
        state: this.state,
        method: this.currentMethod,
        duration: 0,
        expPerSecond: 0
      };
    }

    return {
      isActive: true,
      state: this.state,
      method: this.currentMethod,
      duration: this.getDuration(),
      expPerSecond: this.calculateExpGain(),
      totalExpGained: this.totalExpGained,
      totalMpConsumed: this.totalMpConsumed,
      progressPercent: (this.player.exp / this.player.maxExp) * 100
    };
  }

  getStats() {
    return {
      totalInterruptions: this.interruptions.length,
      interruptions: [...this.interruptions],
      currentState: this.state,
      isActive: this.state === CULTIVATION_STATE.ACTIVE
    };
  }

  toJSON() {
    return {
      state: this.state,
      currentMethod: this.currentMethod,
      startTime: this.startTime,
      totalExpGained: this.totalExpGained,
      totalMpConsumed: this.totalMpConsumed,
      interruptions: this.interruptions
    };
  }

  static fromJSON(data, player) {
    const system = new CultivationSystem(player);
    system.state = data.state || CULTIVATION_STATE.IDLE;
    system.currentMethod = data.currentMethod;
    system.startTime = data.startTime;
    system.totalExpGained = data.totalExpGained || 0;
    system.totalMpConsumed = data.totalMpConsumed || 0;
    system.interruptions = data.interruptions || [];
    
    if (system.state === CULTIVATION_STATE.ACTIVE) {
      system.startTicking();
    }
    
    return system;
  }
}

// 兼容模块导出和全局变量
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { CultivationSystem, CULTIVATION_METHODS, CULTIVATION_STATE };
} else {
  window.CultivationSystem = CultivationSystem;
  window.CULTIVATION_METHODS = CULTIVATION_METHODS;
  window.CULTIVATION_STATE = CULTIVATION_STATE;
}
