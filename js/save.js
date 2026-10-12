/**
 * 存档层：小游戏使用 wx.getStorageSync / setStorageSync
 *
 * 按剧本 id 分区存储，key 形如 duanju_endings_v1:<scriptId>，
 * 这样多个剧本的结局收集进度互不干扰。
 */

var PREFIX = 'duanju_endings_v1';
var LEGACY_KEY = PREFIX;   // 旧版单剧本存档，读取时自动迁移

var Save = {
  _cache: {},
  current: null,            // 当前剧本 id

  key: function (scriptId) {
    return PREFIX + ':' + (scriptId || this.current || 'default');
  },

  /** 切换当前剧本（进入剧本时调用） */
  setScript: function (id) {
    this.current = id;
  },

  getUnlocked: function (scriptId) {
    var key = this.key(scriptId);
    if (this._cache[key]) return this._cache[key];

    var v = null;
    try {
      v = wx.getStorageSync(key);
    } catch (e) {
      v = null;
    }

    // 迁移旧版无后缀的单剧本存档
    if ((!v || Object.prototype.toString.call(v) !== '[object Array]')) {
      try {
        var legacy = wx.getStorageSync(LEGACY_KEY);
        if (legacy && Object.prototype.toString.call(legacy) === '[object Array]' && legacy.length) {
          v = legacy;
          wx.setStorageSync(key, v);
        }
      } catch (e2) {}
    }

    if (!v || Object.prototype.toString.call(v) !== '[object Array]') {
      v = [];
    }
    this._cache[key] = v;
    return v;
  },

  unlock: function (id, scriptId) {
    var u = this.getUnlocked(scriptId);
    if (u.indexOf(id) === -1) {
      u.push(id);
      try {
        wx.setStorageSync(this.key(scriptId), u);
      } catch (e) {
        // 存储失败不阻塞游戏流程
      }
    }
  },

  count: function (scriptId) {
    return this.getUnlocked(scriptId).length;
  },

  /**
   * 记录最近游玩的剧本，供首页"继续"入口使用
   */
  markPlayed: function (scriptId) {
    if (!scriptId) return;
    this.current = scriptId;
    try {
      wx.setStorageSync(PREFIX + ':last', scriptId);
    } catch (e) {}
  },

  lastPlayed: function () {
    try {
      return wx.getStorageSync(PREFIX + ':last') || null;
    } catch (e) {
      return null;
    }
  },

  /** 清空某剧本进度（调试用） */
  reset: function (scriptId) {
    var key = this.key(scriptId);
    this._cache[key] = [];
    try { wx.removeStorageSync(key); } catch (e) {}
  }
};

module.exports = Save;