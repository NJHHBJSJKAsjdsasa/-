/**
 * 修仙游戏 - 玩家类
 * 管理玩家属性、境界、经验等核心数据
 */

// 境界定义
const REALMS = [
  { name: '练气', maxLevel: 10, expMultiplier: 1 },
  { name: '筑基', maxLevel: 10, expMultiplier: 2 },
  { name: '金丹', maxLevel: 10, expMultiplier: 4 },
  { name: '元婴', maxLevel: 10, expMultiplier: 8 },
  { name: '化神', maxLevel: 10, expMultiplier: 16 },
  { name: '炼虚', maxLevel: 10, expMultiplier: 32 },
  { name: '合体', maxLevel: 10, expMultiplier: 64 },
  { name: '大乘', maxLevel: 10, expMultiplier: 128 },
  { name: '渡劫', maxLevel: 10, expMultiplier: 256 },
  { name: '真仙', maxLevel: 10, expMultiplier: 512 }
];

// 默认属性
const DEFAULT_ATTRIBUTES = {
  strength: 10,      // 力量
  agility: 10,       // 敏捷
  intelligence: 10,  // 智力
  constitution: 10,  // 体质
  spirit: 10,        // 精神
  luck: 5            // 运气
};

class Player {
  constructor(id, name) {
    this.id = id || this.generateId();
    this.name = name || '无名修士';
    this.realm = 0;           // 境界索引
    this.level = 1;           // 当前境界等级
    this.exp = 0;             // 当前经验
    this.maxExp = this.calculateMaxExp();
    this.attributes = { ...DEFAULT_ATTRIBUTES };
    this.hp = this.calculateMaxHp();
    this.maxHp = this.calculateMaxHp();
    this.mp = this.calculateMaxMp();
    this.maxMp = this.calculateMaxMp();
    this.createdAt = Date.now();
    this.lastLogin = Date.now();
  }

  generateId() {
    return 'player_' + Math.random().toString(36).substr(2, 9) + '_' + Date.now();
  }

  calculateMaxExp() {
    const realmData = REALMS[this.realm];
    return Math.floor(100 * Math.pow(1.5, this.level - 1) * realmData.expMultiplier);
  }

  calculateMaxHp() {
    const baseHp = 100;
    const constitutionBonus = this.attributes.constitution * 10;
    const realmBonus = this.realm * 50;
    const levelBonus = (this.level - 1) * 20;
    return Math.floor(baseHp + constitutionBonus + realmBonus + levelBonus);
  }

  calculateMaxMp() {
    const baseMp = 50;
    const intelligenceBonus = this.attributes.intelligence * 5;
    const realmBonus = this.realm * 25;
    const levelBonus = (this.level - 1) * 10;
    return Math.floor(baseMp + intelligenceBonus + realmBonus + levelBonus);
  }

  getRealmName() {
    return REALMS[this.realm]?.name || '未知';
  }

  getFullRealm() {
    return `${this.getRealmName()} ${this.level}层`;
  }

  gainExp(amount) {
    if (amount <= 0) return false;
    
    this.exp += amount;
    let leveledUp = false;
    
    while (this.exp >= this.maxExp) {
      this.exp -= this.maxExp;
      this.levelUp();
      leveledUp = true;
    }
    
    return leveledUp;
  }

  levelUp() {
    const realmData = REALMS[this.realm];
    
    if (this.level < realmData.maxLevel) {
      this.level++;
    } else if (this.realm < REALMS.length - 1) {
      this.realm++;
      this.level = 1;
    } else {
      this.level = realmData.maxLevel;
      this.exp = this.maxExp;
      return false;
    }
    
    this.maxExp = this.calculateMaxExp();
    this.maxHp = this.calculateMaxHp();
    this.maxMp = this.calculateMaxMp();
    this.hp = this.maxHp;
    this.mp = this.maxMp;
    
    this.attributes.strength += 2;
    this.attributes.agility += 2;
    this.attributes.intelligence += 2;
    this.attributes.constitution += 2;
    this.attributes.spirit += 2;
    
    return true;
  }

  heal(amount) {
    this.hp = Math.min(this.hp + amount, this.maxHp);
  }

  consumeMp(amount) {
    if (this.mp >= amount) {
      this.mp -= amount;
      return true;
    }
    return false;
  }

  restoreMp(amount) {
    this.mp = Math.min(this.mp + amount, this.maxMp);
  }

  takeDamage(damage) {
    this.hp = Math.max(this.hp - damage, 0);
    return this.hp > 0;
  }

  isAlive() {
    return this.hp > 0;
  }

  getPower() {
    const attrSum = Object.values(this.attributes).reduce((a, b) => a + b, 0);
    const realmPower = this.realm * 100 + this.level * 10;
    return attrSum + realmPower;
  }

  toJSON() {
    return {
      id: this.id,
      name: this.name,
      realm: this.realm,
      level: this.level,
      exp: this.exp,
      maxExp: this.maxExp,
      attributes: { ...this.attributes },
      hp: this.hp,
      maxHp: this.maxHp,
      mp: this.mp,
      maxMp: this.maxMp,
      createdAt: this.createdAt,
      lastLogin: Date.now()
    };
  }

  /**
   * 生成DHT格式的等级数据
   * @returns {Object} DHT发布格式
   */
  toDHTFormat() {
    return {
      level: this.level,
      realm: this.getRealmName(),
      exp: this.exp
    };
  }

  /**
   * 静态方法：生成ECDSA密钥对
   * @returns {Promise<CryptoKeyPair>}
   */
  static async generateKeyPair() {
    return await crypto.subtle.generateKey(
      { name: 'ECDSA', namedCurve: 'P-256' },
      true,
      ['sign', 'verify']
    );
  }

  /**
   * 静态方法：导出密钥为Base64
   * @param {CryptoKey} key - 密钥
   * @param {string} format - 导出格式 'spki' 或 'pkcs8'
   * @returns {Promise<string>} Base64编码的密钥
   */
  static async exportKeyToBase64(key, format) {
    const buffer = await crypto.subtle.exportKey(format, key);
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  /**
   * 静态方法：从Base64导入密钥
   * @param {string} base64 - Base64编码的密钥
   * @param {string} format - 导入格式 'spki' 或 'pkcs8'
   * @param {string[]} usages - 密钥用途
   * @returns {Promise<CryptoKey>}
   */
  static async importKeyFromBase64(base64, format, usages) {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return await crypto.subtle.importKey(
      format,
      bytes.buffer,
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      usages
    );
  }

  /**
   * 使用私钥签名数据
   * @param {CryptoKey} privateKey - 私钥
   * @param {Object} data - 要签名的数据
   * @returns {Promise<string>} Base64签名
   */
  static async signData(privateKey, data) {
    const dataToSign = JSON.stringify(data);
    const encoder = new TextEncoder();
    const dataBuffer = encoder.encode(dataToSign);
    
    const signatureBuffer = await crypto.subtle.sign(
      { name: 'ECDSA', hash: 'SHA-256' },
      privateKey,
      dataBuffer
    );
    
    const bytes = new Uint8Array(signatureBuffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  /**
   * 验证签名
   * @param {string} publicKeyBase64 - Base64公钥
   * @param {Object} data - 原始数据
   * @param {string} signatureBase64 - Base64签名
   * @returns {Promise<boolean>}
   */
  static async verifySignature(publicKeyBase64, data, signatureBase64) {
    try {
      const publicKey = await Player.importKeyFromBase64(
        publicKeyBase64,
        'spki',
        ['verify']
      );
      
      const dataToVerify = JSON.stringify(data);
      const encoder = new TextEncoder();
      const dataBuffer = encoder.encode(dataToVerify);
      
      const binary = atob(signatureBase64);
      const signatureBytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        signatureBytes[i] = binary.charCodeAt(i);
      }
      
      return await crypto.subtle.verify(
        { name: 'ECDSA', hash: 'SHA-256' },
        publicKey,
        signatureBytes.buffer,
        dataBuffer
      );
    } catch (error) {
      console.error('[Player] Signature verification failed:', error);
      return false;
    }
  }

  static fromJSON(data) {
    const player = new Player(data.id, data.name);
    player.realm = data.realm || 0;
    player.level = data.level || 1;
    player.exp = data.exp || 0;
    player.maxExp = data.maxExp || player.calculateMaxExp();
    player.attributes = data.attributes || { ...DEFAULT_ATTRIBUTES };
    player.hp = data.hp || player.calculateMaxHp();
    player.maxHp = data.maxHp || player.calculateMaxHp();
    player.mp = data.mp || player.calculateMaxMp();
    player.maxMp = data.maxMp || player.calculateMaxMp();
    player.createdAt = data.createdAt || Date.now();
    player.lastLogin = Date.now();
    return player;
  }

  update() {
    this.maxHp = this.calculateMaxHp();
    this.maxMp = this.calculateMaxMp();
    this.hp = Math.min(this.hp, this.maxHp);
    this.mp = Math.min(this.mp, this.maxMp);
  }
}

// 兼容模块导出和全局变量
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { Player, REALMS };
} else {
  window.Player = Player;
  window.REALMS = REALMS;
}
