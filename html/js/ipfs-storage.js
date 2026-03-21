/**
 * IPFS 角色数据存储管理器
 * 用于将角色数据备份到IPFS网络，实现去中心化存储
 * 使用第三方IPFS上传服务（Pinata/Web3.Storage等）
 */

class IPFSStorage {
  constructor() {
    // 使用多个公共IPFS网关以提高可用性（用于下载）
    this.gateways = [
      'https://ipfs.io/ipfs/',
      'https://cloudflare-ipfs.com/ipfs/',
      'https://gateway.pinata.cloud/ipfs/',
      'https://gateway.ipfs.io/ipfs/',
      'https://dweb.link/ipfs/'
    ];
    this.currentGatewayIndex = 0;
    this.timeout = 30000; // 30秒超时
    
    // 使用免费的IPFS上传服务
    // 注意：这些服务有速率限制，适合演示使用
    this.uploadServices = [
      { name: 'crust', url: 'https://crustipfs.xyz/api/v0/add' },
      { name: '4everland', url: 'https://ipfs.4everland.xyz/api/v0/add' }
    ];
  }

  /**
   * 获取当前使用的IPFS网关
   */
  getCurrentGateway() {
    return this.gateways[this.currentGatewayIndex];
  }

  /**
   * 切换到下一个网关
   */
  switchGateway() {
    this.currentGatewayIndex = (this.currentGatewayIndex + 1) % this.gateways.length;
    console.log(`[IPFS] 切换到网关: ${this.getCurrentGateway()}`);
    return this.getCurrentGateway();
  }

  /**
   * 将角色数据上传到IPFS
   * 使用多个上传服务尝试
   * @param {Object} playerData - 角色数据对象
   * @returns {Promise<string>} - 返回CID
   */
  async uploadCharacter(playerData) {
    try {
      // 验证数据
      if (!playerData || typeof playerData !== 'object') {
        throw new Error('无效的角色数据');
      }

      // 序列化数据
      const jsonData = JSON.stringify(playerData, null, 2);
      const blob = new Blob([jsonData], { type: 'application/json' });

      // 尝试多个上传服务
      let lastError = null;
      
      for (const service of this.uploadServices) {
        try {
          console.log(`[IPFS] 尝试使用 ${service.name} 上传...`);
          const result = await this.uploadToService(service.url, blob);
          
          if (result && result.Hash) {
            console.log(`[IPFS] 上传成功，CID: ${result.Hash}`);
            return result.Hash;
          }
        } catch (error) {
          console.warn(`[IPFS] ${service.name} 上传失败:`, error.message);
          lastError = error;
          continue;
        }
      }

      // 如果所有服务都失败，尝试使用 data URI 方案（备用）
      console.log('[IPFS] 所有上传服务失败，使用本地备用方案...');
      return this.createLocalBackup(playerData);
      
    } catch (error) {
      console.error('[IPFS] 上传失败:', error);
      throw new Error(`备份失败: ${error.message}`);
    }
  }

  /**
   * 上传数据到指定的IPFS服务
   */
  async uploadToService(url, blob) {
    const formData = new FormData();
    formData.append('file', blob, 'character.json');
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(url, {
        method: 'POST',
        body: formData,
        signal: controller.signal,
        headers: {
          'Accept': 'application/json'
        }
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const result = await response.json();
      return result;
    } catch (error) {
      clearTimeout(timeoutId);
      if (error.name === 'AbortError') {
        throw new Error('上传超时');
      }
      throw error;
    }
  }

  /**
   * 本地备用方案：将数据编码为base64 data URI
   * 虽然不是真正的IPFS，但可以让玩家保存和恢复数据
   */
  createLocalBackup(playerData) {
    try {
      const jsonData = JSON.stringify(playerData);
      const base64Data = btoa(unescape(encodeURIComponent(jsonData)));
      
      // 创建一个模拟的CID格式（实际上是base64编码的数据）
      // 格式: local://{base64}
      const pseudoCID = `local://${base64Data}`;
      
      console.log('[IPFS] 使用本地备用方案创建备份');
      return pseudoCID;
    } catch (error) {
      throw new Error('本地备份失败: ' + error.message);
    }
  }

  /**
   * 通过CID从IPFS下载角色数据
   * @param {string} cid - IPFS内容标识符
   * @returns {Promise<Object>} - 返回角色数据对象
   */
  async downloadCharacter(cid) {
    if (!cid || typeof cid !== 'string') {
      throw new Error('无效的CID');
    }

    // 清理CID（移除可能的 ipfs:// 前缀）
    const cleanCid = cid.replace(/^ipfs:/, '').trim();

    // 检查是否是本地备份格式
    if (cleanCid.startsWith('local://')) {
      return this.restoreFromLocalBackup(cleanCid);
    }

    // 尝试从多个网关获取数据
    let lastError = null;
    const maxAttempts = this.gateways.length;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const gateway = this.gateways[(this.currentGatewayIndex + attempt) % this.gateways.length];
      
      try {
        const data = await this.fetchFromGateway(gateway, cleanCid);
        
        // 验证数据完整性
        if (this.validateCharacterData(data)) {
          // 更新当前网关索引为成功的网关
          this.currentGatewayIndex = (this.currentGatewayIndex + attempt) % this.gateways.length;
          return data;
        } else {
          throw new Error('角色数据格式无效');
        }
      } catch (error) {
        lastError = error;
        console.warn(`[IPFS] 从 ${gateway} 获取失败:`, error.message);
        continue;
      }
    }

    throw new Error(`无法从IPFS获取数据: ${lastError?.message || '未知错误'}`);
  }

  /**
   * 从本地备份恢复
   */
  restoreFromLocalBackup(pseudoCID) {
    try {
      const base64Data = pseudoCID.replace('local://', '');
      const jsonData = decodeURIComponent(escape(atob(base64Data)));
      const data = JSON.parse(jsonData);
      
      if (!this.validateCharacterData(data)) {
        throw new Error('本地备份数据格式无效');
      }
      
      return data;
    } catch (error) {
      throw new Error('恢复本地备份失败: ' + error.message);
    }
  }

  /**
   * 从指定网关获取数据
   */
  async fetchFromGateway(gateway, cid) {
    const url = `${gateway}${cid}`;
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(url, {
        method: 'GET',
        signal: controller.signal,
        headers: {
          'Accept': 'application/json,text/plain,*/*'
        }
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const text = await response.text();
      
      // 尝试解析JSON
      try {
        return JSON.parse(text);
      } catch (e) {
        throw new Error('返回数据不是有效的JSON格式');
      }
    } catch (error) {
      clearTimeout(timeoutId);
      throw error;
    }
  }

  /**
   * 验证角色数据完整性
   * @param {Object} data - 角色数据
   * @returns {boolean} - 数据是否有效
   */
  validateCharacterData(data) {
    if (!data || typeof data !== 'object') {
      return false;
    }

    // 检查必需字段
    const requiredFields = ['id', 'name', 'level', 'realm'];
    for (const field of requiredFields) {
      if (data[field] === undefined || data[field] === null) {
        console.warn(`[IPFS] 数据验证失败: 缺少字段 ${field}`);
        return false;
      }
    }

    // 检查数值字段
    if (typeof data.level !== 'number' || data.level < 1) {
      return false;
    }

    return true;
  }

  /**
   * 生成角色数据的备份摘要
   * @param {Object} playerData - 角色数据
   * @returns {string} - 摘要信息
   */
  generateBackupSummary(playerData) {
    if (!playerData) return '未知角色';
    
    const realm = playerData.fullRealmName || playerData.realm || '未知境界';
    const name = playerData.name || '无名修士';
    const level = playerData.level || 1;
    
    return `${name} - ${realm} (Lv.${level})`;
  }

  /**
   * 复制CID到剪贴板
   * @param {string} cid - IPFS CID
   * @returns {Promise<boolean>} - 是否复制成功
   */
  async copyCIDToClipboard(cid) {
    try {
      await navigator.clipboard.writeText(cid);
      return true;
    } catch (error) {
      console.error('[IPFS] 复制到剪贴板失败:', error);
      return false;
    }
  }

  /**
   * 验证CID格式
   * @param {string} cid - 待验证的CID
   * @returns {boolean} - 是否为有效的CID格式
   */
  isValidCID(cid) {
    if (!cid || typeof cid !== 'string') {
      return false;
    }

    // 移除可能的协议前缀
    const cleanCid = cid.replace(/^ipfs:/, '').trim();

    // 检查是否是本地备份格式
    if (cleanCid.startsWith('local://')) {
      return true;
    }

    // 检查长度（CIDv0是46字符，以Qm开头；CIDv1更长）
    if (cleanCid.length < 46) {
      return false;
    }

    // CIDv0 以 Qm 开头，包含 Base58 字符
    if (cleanCid.startsWith('Qm')) {
      return /^Qm[1-9A-HJ-NP-Za-km-z]+$/.test(cleanCid);
    }

    // CIDv1 以 bafy 或 bafk 等开头（Base32）
    if (cleanCid.startsWith('ba')) {
      return /^b[a-z0-9]+$/.test(cleanCid);
    }

    return true;
  }
}

// 导出单例实例
const ipfsStorage = new IPFSStorage();

// 兼容模块导出和全局变量
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { IPFSStorage, ipfsStorage };
} else {
  window.IPFSStorage = IPFSStorage;
  window.ipfsStorage = ipfsStorage;
}
