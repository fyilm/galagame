/**
 * 存档层：小游戏使用 wx.getStorageSync / setStorageSync
 *
 * 两类持久化数据，用不同前缀分区，互不干扰：
 *   1) 结局收集进度  duanju_endings_v1:<scriptId>   → 已解锁的结局 id 数组
 *   2) 段内断点       duanju_progress_v1:<scriptId>  → { s:场景id, ba, xin, mi, v:剧本版本 }
 *
 * 断点用于「停在哪句就接着哪句」。带版本号是为了剧本改动后能识别出
 * 失效存档并安全降级（回退到序幕），而不是读出一个不存在的场景 id。
 */

var PREFIX = 'duanju_endings_v1';
var LEGACY_KEY = PREFIX;      // 旧版单剧本存档，读取时自动迁移
var PROG_PREFIX = 'duanju_progress_v1';
var PROG_VER = 2;             // 断点结构版本；改过结构就 +1，旧断点自动作废

var Save = {
  _cache: {},
  _progCache: {},
  current: null,            // 当前剧本 id

  key: function (scriptId) {
    return PREFIX + ':' + (scriptId || this.current || 'default');
  },

  progKey: function (scriptId) {
    return PROG_PREFIX + ':' + (scriptId || this.current || 'default');
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

  /**
   * 写入段内断点。
   *
   * @param p  { s:场景id, ba, xin, mi }
   * 只在 s 合法时写；写失败不抛（存储不可用不能阻塞游戏）。
   */
  saveProgress: function (scriptId, p) {
    if (!p || !p.s) return;
    var rec = {
      s: String(p.s),
      ba: p.ba || 0,
      xin: p.xin || 0,
      mi: p.mi || 0,
      v: PROG_VER
    };
    var key = this.progKey(scriptId);
    this._progCache[key] = rec;
    try {
      wx.setStorageSync(key, rec);
    } catch (e) {}
  },

  /**
   * 读取段内断点。
   *
   * @param validIds 可选的合法场景 id 集合（Object 或 Array）。
   *        传入后，若断点指向的场景已不存在，视为失效并返回 null ——
   *        剧本改动后旧存档不会把玩家带到一个不存在的场景。
   * @return {s,ba,xin,mi} 或 null
   */
  getProgress: function (scriptId, validIds) {
    var key = this.progKey(scriptId);
    var rec = this._progCache[key];
    if (!rec) {
      try {
        rec = wx.getStorageSync(key);
      } catch (e) {
        rec = null;
      }
    }
    if (!rec || Object.prototype.toString.call(rec) !== '[object Object]') return null;
    if (rec.v !== PROG_VER) return null;      // 结构版本不符 → 作废
    if (!rec.s) return null;

    if (validIds) {
      var ok = Object.prototype.toString.call(validIds) === '[object Array]'
        ? validIds.indexOf(rec.s) >= 0
        : !!validIds[rec.s];
      if (!ok) return null;                   // 场景已不存在 → 作废
    }

    this._progCache[key] = rec;
    return { s: rec.s, ba: rec.ba || 0, xin: rec.xin || 0, mi: rec.mi || 0 };
  },

  /** 是否有一个可用的断点（供首屏决定「继续」按钮的文案与行为） */
  hasProgress: function (scriptId, validIds) {
    return !!this.getProgress(scriptId, validIds);
  },

  /**
   * 清除断点。达成结局、或玩家选择重头开始时调用。
   * 注意：只清「断点」，不清「结局收集进度」。
   */
  clearProgress: function (scriptId) {
    var key = this.progKey(scriptId);
    delete this._progCache[key];
    try { wx.removeStorageSync(key); } catch (e) {}
  },

  /** 清空某剧本进度（调试用） */
  reset: function (scriptId) {
    var key = this.key(scriptId);
    this._cache[key] = [];
    try { wx.removeStorageSync(key); } catch (e) {}
    this.clearProgress(scriptId);
  }
};

module.exports = Save;