/**
 * 修仙游戏 - 战斗系统类
 * 管理战斗流程、技能执行、战斗日志等
 */

// 战斗状态
const COMBAT_STATE = {
  IDLE: 'idle',
  PREPARING: 'preparing',
  IN_PROGRESS: 'in_progress',
  ENDED: 'ended'
};

// 战斗结果
const COMBAT_RESULT = {
  VICTORY: 'victory',
  DEFEAT: 'defeat',
  ESCAPE: 'escape',
  DRAW: 'draw'
};

// 技能定义
const SKILLS = [
  {
    id: 'basic_attack',
    name: '普通攻击',
    description: '最基础的攻击方式',
    damage: 10,
    mpCost: 0,
    cooldown: 0,
    type: 'physical'
  },
  {
    id: 'spirit_strike',
    name: '灵气冲击',
    description: '释放灵气进行攻击',
    damage: 25,
    mpCost: 10,
    cooldown: 1,
    type: 'magic'
  },
  {
    id: 'sword_slash',
    name: '剑气斩',
    description: '以剑气斩击敌人',
    damage: 40,
    mpCost: 20,
    cooldown: 2,
    type: 'physical'
  },
  {
    id: 'fire_ball',
    name: '火球术',
    description: '凝聚火球攻击敌人',
    damage: 60,
    mpCost: 35,
    cooldown: 3,
    type: 'fire'
  },
  {
    id: 'thunder_strike',
    name: '雷击术',
    description: '召唤天雷攻击',
    damage: 100,
    mpCost: 60,
    cooldown: 4,
    type: 'thunder'
  },
  {
    id: 'heal',
    name: '治愈术',
    description: '恢复自身生命值',
    heal: 50,
    mpCost: 30,
    cooldown: 3,
    type: 'heal'
  },
  {
    id: 'defense',
    name: '防御姿态',
    description: '提升防御力一回合',
    defense: 20,
    mpCost: 15,
    cooldown: 2,
    type: 'buff'
  }
];

class CombatSystem {
  constructor(player) {
    this.player = player;
    this.state = COMBAT_STATE.IDLE;
    this.opponent = null;
    this.turn = 0;
    this.logs = [];
    this.skillCooldowns = {};
    this.buffs = { player: [], opponent: [] };
    this.onTurnStart = null;
    this.onTurnEnd = null;
    this.onCombatEnd = null;
    this.onLogUpdate = null;
    this.winner = null;
    this.rewards = null;
  }

  getSkillById(skillId) {
    return SKILLS.find(skill => skill.id === skillId);
  }

  getAvailableSkills() {
    return SKILLS.filter(skill => {
      const cooldown = this.skillCooldowns[skill.id] || 0;
      return cooldown <= 0 && this.player.mp >= skill.mpCost;
    });
  }

  canUseSkill(skillId) {
    const skill = this.getSkillById(skillId);
    if (!skill) return { canUse: false, reason: '技能不存在' };
    
    const cooldown = this.skillCooldowns[skillId] || 0;
    if (cooldown > 0) return { canUse: false, reason: `冷却中(${cooldown}回合)` };
    
    if (this.player.mp < skill.mpCost) return { canUse: false, reason: '灵力不足' };
    
    return { canUse: true, reason: '' };
  }

  initiateCombat(opponent) {
    if (this.state === COMBAT_STATE.IN_PROGRESS) {
      return { success: false, message: '正在战斗中' };
    }

    this.opponent = opponent;
    this.state = COMBAT_STATE.IN_PROGRESS;
    this.turn = 1;
    this.logs = [];
    this.skillCooldowns = {};
    this.buffs = { player: [], opponent: [] };
    this.winner = null;
    this.rewards = null;

    this.addLog(`战斗开始！${this.player.name} VS ${opponent.name}`);
    this.addLog(`${this.player.name} 境界: ${this.player.getFullRealm()}`);
    this.addLog(`${opponent.name} 境界: ${opponent.getFullRealm ? opponent.getFullRealm() : '未知'}`);

    if (this.onTurnStart) {
      this.onTurnStart({ turn: this.turn, isPlayerTurn: true });
    }

    return { 
      success: true, 
      message: '战斗开始',
      opponent: this.getOpponentInfo()
    };
  }

  getOpponentInfo() {
    if (!this.opponent) return null;
    return {
      name: this.opponent.name,
      realm: this.opponent.getFullRealm ? this.opponent.getFullRealm() : '未知',
      hp: this.opponent.hp,
      maxHp: this.opponent.maxHp,
      power: this.opponent.getPower ? this.opponent.getPower() : 0
    };
  }

  executeSkill(skillId, target = 'opponent') {
    if (this.state !== COMBAT_STATE.IN_PROGRESS) {
      return { success: false, message: '不在战斗中' };
    }

    const check = this.canUseSkill(skillId);
    if (!check.canUse) {
      return { success: false, message: check.reason };
    }

    const skill = this.getSkillById(skillId);
    this.player.consumeMp(skill.mpCost);
    
    if (skill.cooldown > 0) {
      this.skillCooldowns[skillId] = skill.cooldown;
    }

    let result = {};

    if (skill.type === 'heal') {
      const healAmount = skill.heal;
      this.player.heal(healAmount);
      this.addLog(`${this.player.name} 使用 ${skill.name}，恢复 ${healAmount} 点生命`);
      result = { type: 'heal', amount: healAmount };
    } else if (skill.type === 'buff') {
      this.buffs.player.push({ type: 'defense', value: skill.defense, turns: 3 });
      this.addLog(`${this.player.name} 使用 ${skill.name}，防御力提升`);
      result = { type: 'buff', defense: skill.defense };
    } else {
      const damage = this.calculateDamage(skill, target);
      
      if (target === 'opponent' && this.opponent) {
        const isAlive = this.opponent.takeDamage ? this.opponent.takeDamage(damage) : true;
        this.addLog(`${this.player.name} 使用 ${skill.name}，造成 ${damage} 点伤害`);
        
        if (!isAlive || (this.opponent.hp !== undefined && this.opponent.hp <= 0)) {
          return this.endCombat(COMBAT_RESULT.VICTORY);
        }
      }
      result = { type: 'attack', damage: damage };
    }

    this.processOpponentTurn();
    this.nextTurn();

    return { 
      success: true, 
      result: result,
      player: {
        hp: this.player.hp,
        mp: this.player.mp
      },
      opponent: this.getOpponentInfo()
    };
  }

  calculateDamage(skill, target) {
    let baseDamage = skill.damage || 10;
    
    const strengthBonus = this.player.attributes.strength * 2;
    const realmBonus = this.player.realm * 10 + this.player.level * 2;
    
    let damage = baseDamage + strengthBonus + realmBonus;
    
    if (skill.type === 'magic') {
      damage += this.player.attributes.intelligence * 3;
    }
    
    const variation = 0.9 + Math.random() * 0.2;
    damage *= variation;
    
    if (Math.random() < (this.player.attributes.luck * 0.005)) {
      damage *= 2;
      this.addLog('暴击！');
    }
    
    return Math.floor(damage);
  }

  processOpponentTurn() {
    if (!this.opponent || this.state !== COMBAT_STATE.IN_PROGRESS) return;

    const opponentDamage = this.calculateOpponentDamage();
    
    const playerDefense = this.buffs.player
      .filter(buff => buff.type === 'defense')
      .reduce((sum, buff) => sum + buff.value, 0);
    
    const finalDamage = Math.max(1, opponentDamage - playerDefense);
    
    this.player.takeDamage(finalDamage);
    this.addLog(`${this.opponent.name} 攻击，造成 ${finalDamage} 点伤害`);

    if (!this.player.isAlive()) {
      this.endCombat(COMBAT_RESULT.DEFEAT);
    }
  }

  calculateOpponentDamage() {
    if (!this.opponent) return 10;
    
    let baseDamage = 10;
    if (this.opponent.getPower) {
      baseDamage = Math.floor(this.opponent.getPower() * 0.1);
    }
    
    const variation = 0.8 + Math.random() * 0.4;
    return Math.floor(baseDamage * variation);
  }

  nextTurn() {
    this.turn++;
    
    Object.keys(this.skillCooldowns).forEach(skillId => {
      if (this.skillCooldowns[skillId] > 0) {
        this.skillCooldowns[skillId]--;
      }
    });

    this.buffs.player = this.buffs.player
      .map(buff => ({ ...buff, turns: buff.turns - 1 }))
      .filter(buff => buff.turns > 0);

    if (this.onTurnEnd) {
      this.onTurnEnd({ turn: this.turn - 1 });
    }

    if (this.onTurnStart) {
      this.onTurnStart({ turn: this.turn, isPlayerTurn: true });
    }
  }

  tryEscape() {
    if (this.state !== COMBAT_STATE.IN_PROGRESS) {
      return { success: false, message: '不在战斗中' };
    }

    const escapeChance = 0.3 + (this.player.attributes.agility * 0.01);
    const escaped = Math.random() < escapeChance;

    if (escaped) {
      this.addLog(`${this.player.name} 成功逃脱！`);
      return this.endCombat(COMBAT_RESULT.ESCAPE);
    } else {
      this.addLog(`${this.player.name} 逃脱失败！`);
      this.processOpponentTurn();
      this.nextTurn();
      return { success: false, message: '逃脱失败' };
    }
  }

  endCombat(result) {
    this.state = COMBAT_STATE.ENDED;
    this.winner = result;

    let message = '';
    let expReward = 0;
    let loot = [];

    switch (result) {
      case COMBAT_RESULT.VICTORY:
        message = '战斗胜利！';
        expReward = this.calculateExpReward();
        loot = this.generateLoot();
        this.player.gainExp(expReward);
        break;
      case COMBAT_RESULT.DEFEAT:
        message = '战斗失败...';
        this.player.hp = 1;
        break;
      case COMBAT_RESULT.ESCAPE:
        message = '成功逃脱';
        expReward = Math.floor(this.calculateExpReward() * 0.1);
        this.player.gainExp(expReward);
        break;
      case COMBAT_RESULT.DRAW:
        message = '战斗平局';
        break;
    }

    this.rewards = { exp: expReward, loot: loot };
    this.addLog(message);

    if (expReward > 0) {
      this.addLog(`获得 ${expReward} 点经验`);
    }

    const combatResult = {
      success: true,
      result: result,
      message: message,
      rewards: this.rewards,
      turns: this.turn,
      logs: [...this.logs]
    };

    if (this.onCombatEnd) {
      this.onCombatEnd(combatResult);
    }

    return combatResult;
  }

  calculateExpReward() {
    if (!this.opponent) return 10;
    
    let baseExp = 50;
    if (this.opponent.getPower) {
      baseExp = Math.floor(this.opponent.getPower() * 0.5);
    }
    
    const levelDiff = (this.opponent.realm || 0) - this.player.realm;
    const multiplier = 1 + (levelDiff * 0.2);
    
    return Math.max(10, Math.floor(baseExp * multiplier));
  }

  generateLoot() {
    const loot = [];
    if (Math.random() < 0.3) {
      loot.push({ type: 'spirit_stone', amount: Math.floor(Math.random() * 10) + 1 });
    }
    return loot;
  }

  addLog(message) {
    const logEntry = {
      turn: this.turn,
      time: Date.now(),
      message: message
    };
    this.logs.push(logEntry);
    
    if (this.onLogUpdate) {
      this.onLogUpdate(logEntry);
    }
  }

  getCombatStatus() {
    return {
      state: this.state,
      turn: this.turn,
      isInCombat: this.state === COMBAT_STATE.IN_PROGRESS,
      player: {
        name: this.player.name,
        hp: this.player.hp,
        maxHp: this.player.maxHp,
        mp: this.player.mp,
        maxMp: this.player.maxMp,
        buffs: this.buffs.player
      },
      opponent: this.getOpponentInfo(),
      availableSkills: this.getAvailableSkills(),
      skillCooldowns: { ...this.skillCooldowns },
      logs: this.logs.slice(-10)
    };
  }

  toJSON() {
    return {
      state: this.state,
      opponent: this.opponent ? this.opponent.toJSON() : null,
      turn: this.turn,
      logs: this.logs,
      skillCooldowns: this.skillCooldowns,
      buffs: this.buffs,
      winner: this.winner,
      rewards: this.rewards
    };
  }

  static fromJSON(data, player) {
    const combat = new CombatSystem(player);
    combat.state = data.state || COMBAT_STATE.IDLE;
    combat.turn = data.turn || 0;
    combat.logs = data.logs || [];
    combat.skillCooldowns = data.skillCooldowns || {};
    combat.buffs = data.buffs || { player: [], opponent: [] };
    combat.winner = data.winner;
    combat.rewards = data.rewards;
    return combat;
  }
}

// 兼容模块导出和全局变量
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { CombatSystem, COMBAT_STATE, COMBAT_RESULT, SKILLS };
} else {
  window.CombatSystem = CombatSystem;
  window.COMBAT_STATE = COMBAT_STATE;
  window.COMBAT_RESULT = COMBAT_RESULT;
  window.SKILLS = SKILLS;
}
