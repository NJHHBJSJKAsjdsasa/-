/**
 * 修仙游戏 - 存储系统类
 * 使用 localStorage 保存/加载玩家数据，支持自动保存
 */

// 存储键名
const STORAGE_KEYS = {
  PLAYER_DATA: 'xiuxian_player_data',
  GAME_SETTINGS: 'xiuxian_game_settings',
  GAME_LOGS: 'xiuxian_game_logs',
  BACKUP_PREFIX: 'xiuxian_backup_'
};

// 存储事件
const STORAGE_EVENTS = {
  SAVE_SUCCESS: 'save_success',
  SAVE_ERROR: 'save_error',
  LOAD_SUCCESS: 'load_success',
  LOAD_ERROR: 'load_error',
  AUTO_SAVE: 'auto_save',
  BACKUP_CREATED: 'backup_created'
};

class Storage {
  constructor(options = {}) {
    this.autoSaveInterval = options.autoSaveInterval || 30000; // 默认30秒
    this.maxBackups = options.maxBackups || 5;
    this.enableCompression = options.enableCompression || false;
    this.autoSaveTimer = null;
    this.lastSaveTime = null;
    this.onSave = options.onSave || null;
    this.onLoad = options.onLoad || null;
    this.onError = options.onError || null;
    this.isAutoSaving = false;
  }

  isAvailable() {
    try {
      const test = '__storage_test__';
      localStorage.setItem(test, test);
      localStorage.removeItem(test);
      return true;
    } catch (e) {
      return false;
    }
  }

  getStorageSize() {
    let totalSize = 0;
    for (let key in localStorage) {
      if (localStorage.hasOwnProperty(key)) {
        totalSize += localStorage[key].length * 2; // UTF-16 编码，每个字符2字节
      }
    }
    return {
      bytes: totalSize,
      kb: (totalSize / 1024).toFixed(2),
      mb: (totalSize / (1024 * 1024)).toFixed(2)
    };
  }

  save(key, data) {
    if (!this.isAvailable()) {
      const error = new Error('localStorage 不可用');
      if (this.onError) this.onError({ event: STORAGE_EVENTS.SAVE_ERROR, error });
      return { success: false, error: error.message };
    }

    try {
      const serialized = JSON.stringify(data);
      localStorage.setItem(key, serialized);
      this.lastSaveTime = Date.now();

      const result = {
        success: true,
        key: key,
        timestamp: this.lastSaveTime,
        size: serialized.length
      };

      if (this.onSave) {
        this.onSave({ event: STORAGE_EVENTS.SAVE_SUCCESS, ...result });
      }

      return result;
    } catch (e) {
      const error = e.name === 'QuotaExceededError' 
        ? new Error('存储空间不足')
        : e;
      
      if (this.onError) {
        this.onError({ event: STORAGE_EVENTS.SAVE_ERROR, error, key });
      }

      return { success: false, error: error.message };
    }
  }

  load(key, defaultValue = null) {
    if (!this.isAvailable()) {
      const error = new Error('localStorage 不可用');
      if (this.onError) this.onError({ event: STORAGE_EVENTS.LOAD_ERROR, error });
      return { success: false, error: error.message, data: defaultValue };
    }

    try {
      const serialized = localStorage.getItem(key);
      
      if (serialized === null) {
        return {
          success: true,
          key: key,
          data: defaultValue,
          exists: false
        };
      }

      const data = JSON.parse(serialized);

      const result = {
        success: true,
        key: key,
        data: data,
        exists: true,
        timestamp: this.lastSaveTime
      };

      if (this.onLoad) {
        this.onLoad({ event: STORAGE_EVENTS.LOAD_SUCCESS, ...result });
      }

      return result;
    } catch (e) {
      const error = new Error(`解析数据失败: ${e.message}`);
      
      if (this.onError) {
        this.onError({ event: STORAGE_EVENTS.LOAD_ERROR, error, key });
      }

      return { success: false, error: error.message, data: defaultValue };
    }
  }

  remove(key) {
    if (!this.isAvailable()) {
      return { success: false, error: 'localStorage 不可用' };
    }

    try {
      localStorage.removeItem(key);
      return { success: true, key: key };
    } catch (e) {
      return { success: false, error: e.message, key: key };
    }
  }

  clear() {
    if (!this.isAvailable()) {
      return { success: false, error: 'localStorage 不可用' };
    }

    try {
      localStorage.clear();
      return { success: true, message: '所有数据已清除' };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  savePlayer(player) {
    const playerData = player.toJSON ? player.toJSON() : player;
    const result = this.save(STORAGE_KEYS.PLAYER_DATA, playerData);
    
    if (result.success) {
      this.createBackup(playerData);
    }
    
    return result;
  }

  loadPlayer(PlayerClass = null) {
    const result = this.load(STORAGE_KEYS.PLAYER_DATA);
    
    if (result.success && result.exists && PlayerClass) {
      try {
        result.player = PlayerClass.fromJSON(result.data);
      } catch (e) {
        result.success = false;
        result.error = `创建玩家对象失败: ${e.message}`;
      }
    }
    
    return result;
  }

  saveSettings(settings) {
    return this.save(STORAGE_KEYS.GAME_SETTINGS, settings);
  }

  loadSettings(defaultSettings = {}) {
    const result = this.load(STORAGE_KEYS.GAME_SETTINGS, defaultSettings);
    return result.success ? result.data : defaultSettings;
  }

  saveGameState(gameState) {
    const data = {
      timestamp: Date.now(),
      ...gameState
    };
    return this.save(STORAGE_KEYS.PLAYER_DATA, data);
  }

  loadGameState() {
    return this.load(STORAGE_KEYS.PLAYER_DATA);
  }

  createBackup(data) {
    if (!this.isAvailable()) return { success: false, error: 'localStorage 不可用' };

    try {
      const timestamp = Date.now();
      const backupKey = `${STORAGE_KEYS.BACKUP_PREFIX}${timestamp}`;
      
      const backupData = {
        timestamp: timestamp,
        data: data || this.load(STORAGE_KEYS.PLAYER_DATA).data
      };

      localStorage.setItem(backupKey, JSON.stringify(backupData));

      this.cleanupOldBackups();

      const result = {
        success: true,
        key: backupKey,
        timestamp: timestamp
      };

      if (this.onSave) {
        this.onSave({ event: STORAGE_EVENTS.BACKUP_CREATED, ...result });
      }

      return result;
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  cleanupOldBackups() {
    const backups = this.getBackups();
    
    if (backups.length > this.maxBackups) {
      const toDelete = backups.slice(0, backups.length - this.maxBackups);
      toDelete.forEach(backup => {
        localStorage.removeItem(backup.key);
      });
    }
  }

  getBackups() {
    if (!this.isAvailable()) return [];

    const backups = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(STORAGE_KEYS.BACKUP_PREFIX)) {
        try {
          const data = JSON.parse(localStorage.getItem(key));
          backups.push({
            key: key,
            timestamp: data.timestamp,
            date: new Date(data.timestamp).toLocaleString()
          });
        } catch (e) {
          // 忽略损坏的备份
        }
      }
    }
    
    return backups.sort((a, b) => b.timestamp - a.timestamp);
  }

  restoreBackup(backupKey) {
    if (!this.isAvailable()) {
      return { success: false, error: 'localStorage 不可用' };
    }

    try {
      const backupData = localStorage.getItem(backupKey);
      if (!backupData) {
        return { success: false, error: '备份不存在' };
      }

      const parsed = JSON.parse(backupData);
      localStorage.setItem(STORAGE_KEYS.PLAYER_DATA, JSON.stringify(parsed.data));

      return {
        success: true,
        message: '备份已恢复',
        timestamp: parsed.timestamp
      };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  deleteBackup(backupKey) {
    if (!this.isAvailable()) {
      return { success: false, error: 'localStorage 不可用' };
    }

    try {
      localStorage.removeItem(backupKey);
      return { success: true, message: '备份已删除' };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  startAutoSave(saveCallback) {
    if (this.autoSaveTimer) {
      this.stopAutoSave();
    }

    this.isAutoSaving = true;
    
    this.autoSaveTimer = setInterval(() => {
      if (saveCallback) {
        const data = saveCallback();
        if (data) {
          const result = this.savePlayer(data);
          if (this.onSave) {
            this.onSave({ event: STORAGE_EVENTS.AUTO_SAVE, ...result });
          }
        }
      }
    }, this.autoSaveInterval);

    return {
      success: true,
      message: `自动保存已启动，间隔 ${this.autoSaveInterval / 1000} 秒`
    };
  }

  stopAutoSave() {
    if (this.autoSaveTimer) {
      clearInterval(this.autoSaveTimer);
      this.autoSaveTimer = null;
    }
    this.isAutoSaving = false;
    return { success: true, message: '自动保存已停止' };
  }

  isAutoSaveActive() {
    return this.isAutoSaving && this.autoSaveTimer !== null;
  }

  exportData() {
    const data = {
      player: this.load(STORAGE_KEYS.PLAYER_DATA).data,
      settings: this.load(STORAGE_KEYS.GAME_SETTINGS).data,
      exportTime: Date.now(),
      version: '1.0'
    };

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = `xiuxian_save_${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    return { success: true, message: '数据已导出' };
  }

  async importData(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      
      reader.onload = (e) => {
        try {
          const data = JSON.parse(e.target.result);
          
          if (data.player) {
            this.save(STORAGE_KEYS.PLAYER_DATA, data.player);
          }
          if (data.settings) {
            this.save(STORAGE_KEYS.GAME_SETTINGS, data.settings);
          }
          
          resolve({ success: true, message: '数据已导入', data: data });
        } catch (err) {
          reject({ success: false, error: '文件解析失败: ' + err.message });
        }
      };
      
      reader.onerror = () => {
        reject({ success: false, error: '文件读取失败' });
      };
      
      reader.readAsText(file);
    });
  }

  getStorageInfo() {
    const info = {
      available: this.isAvailable(),
      size: this.getStorageSize(),
      lastSave: this.lastSaveTime,
      autoSaveActive: this.isAutoSaveActive(),
      backups: this.getBackups().length,
      keys: []
    };

    if (this.isAvailable()) {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key) {
          info.keys.push({
            key: key,
            size: localStorage[key].length
          });
        }
      }
    }

    return info;
  }

  toJSON() {
    return {
      autoSaveInterval: this.autoSaveInterval,
      maxBackups: this.maxBackups,
      lastSaveTime: this.lastSaveTime,
      isAutoSaving: this.isAutoSaving
    };
  }

  static fromJSON(data) {
    return new Storage({
      autoSaveInterval: data.autoSaveInterval,
      maxBackups: data.maxBackups
    });
  }
}

// 兼容模块导出和全局变量
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { Storage, STORAGE_KEYS, STORAGE_EVENTS };
} else {
  window.Storage = Storage;
  window.STORAGE_KEYS = STORAGE_KEYS;
  window.STORAGE_EVENTS = STORAGE_EVENTS;
}
