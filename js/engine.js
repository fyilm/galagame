/**
 * 主引擎：场景管理 + 主循环 + 触摸分发
 */

var R = require('./render.js');

var Title = require('./screens/title.js');
var Library = require('./screens/library.js');
var Game = require('./screens/game.js');
var Ending = require('./screens/ending.js');
var Collect = require('./screens/collect.js');

var SCREENS = {
  title: Title,
  library: Library,
  game: Game,
  ending: Ending,
  collect: Collect
};

/**
 * 统一各屏幕 enter() 的入参形态。
 *
 * 历史上 enter 只收剧本 id 字符串（switchTo('game', 'duanju')），
 * 现在还要能带选项（{scriptId, resume}）。统一在这里归一，
 * 各屏就不用各自兼容两种形态了。
 */
function normalizeEnter(name, arg) {
  var screen = SCREENS[name];
  if (!screen || !screen.enter) return;

  // game 屏：把两种形态都归一成 (scriptId, opts)
  if (name === 'game') {
    if (arg && typeof arg === 'object') {
      screen.enter(arg.scriptId, { resume: !!arg.resume });
    } else {
      screen.enter(arg, { resume: false });
    }
    return;
  }

  screen.enter(arg);
}

var Engine = {
  cur: 'title',
  prevScreen: 'title',   // 最近一次切换的来源页
  backStack: ['title'],  // 来源链，从首页开始，末位为当前页
  backIndex: 0,         // 当前所在层级
  t: 0,
  lastTime: 0,
  running: false,

  init: function () {
    R.init();

    wx.onTouchStart(function (e) {
      Engine.onTouchStart(e);
    });
    wx.onTouchMove(function (e) {
      Engine.onTouchMove(e);
    });
    wx.onTouchEnd(function (e) {
      Engine.onTouchEnd(e);
    });

    if (wx.onWindowResize) {
      wx.onWindowResize(function () {
        R.resize();
      });
    }

    // 回前台时重置时间基准（防止 dt 变成几十秒把动画带飞）。
    // 注意：这里只重置时间，绝不停循环——停循环一旦 onShow 没配对触发，
    // 整个游戏就会永久冻结在最后一帧，点击完全没有反应。
    if (wx.onShow) {
      wx.onShow(function () {
        Engine.lastTime = Date.now();
        // 双保险：万一循环因任何原因停了，这里无条件重新拉起
        if (!Engine.running) {
          Engine.running = true;
          Engine.loop();
        }
      });
    }

    // 切后台 / 可能被系统回收前，主动把剧情进度落盘一次。
    // 小游戏被回收后内存态全丢，只能靠这次落盘兜住。
    if (wx.onHide) {
      wx.onHide(function () {
        Engine.flushProgress();
      });
    }

    this.lastTime = Date.now();
    this.running = true;
    this.loop();
  },

fromLibrary: false,// 从剧本库进入游戏时，返回键应回到剧本库

  /**
   * 调起某个屏幕的 enter()。
   *
   * enter 的入参历史上有两种形态，这里统一掉，避免各屏都要自己兼容：
   *   switchTo('game', 'duanju')                      → 直接给剧本 id
   *   switchTo('game', {scriptId:'duanju',resume:1})  → 带选项
   * 其余屏幕的 enter 不收参数，照旧传 undefined 即可。
   */
  /**
   * 把剧情进度立刻落盘。由 wx.onHide 触发 —— 小游戏切后台后随时可能
   * 被系统回收，内存态全丢，这是唯一的兜底时机。
   *
   * 只在剧情页需要落盘：结局页已经清过断点，其余页面没有进行中的剧情。
   */
  flushProgress: function () {
    if (this.cur !== 'game') return;
    var g = SCREENS.game;
    if (g && g.saveNow) {
      try { g.saveNow(); } catch (e) {}
    }
  },

  switchTo: function (name, arg, keepState) {
    if (!SCREENS[name]) return;

    // 防连点：距上次切屏过近时忽略重复请求，避免同一瞬间被切两次
    // （例如结局页按钮在淡入期间仍可命中，连点会跳转两次）
    var now = Date.now();
    if (this._lastSwitch && now - this._lastSwitch < 260 && name === this._lastTarget) {
      return;
    }
    this._lastSwitch = now;
    this._lastTarget = name;

    this.prevScreen = this.cur;
    this.cur = name;
    this.t = 0;
    // keepState：从图鉴返回剧情页时，保留已播放的进度
    if (!keepState) {
      normalizeEnter(name, arg);
    } else if (name === 'game') {
      // 保留现场回到剧情页：若上次在「选完选项、转场进行中」离开，
      // 会残留 gotoScene + flashT/locked。此时 gotoScene 只有在
      // flashT>=0 时才会被处理，一旦复位 flashT 就永远没人处理它 →
      // 页面卡死。所以这里直接把未完成的转场补完。
      Game.resumePending();
    }
  },

  /** 使用 requestAnimationFrame 驱动主循环，保证高刷设备流畅 */
  loop: function () {
    if (!this.running) return;

    // 关键：整个循环体包在 try/catch 里。
    // 只要 update/draw 里抛一次异常，requestAnimationFrame 就不会再被排程，
    // 主循环永久停止 → 画面停在最后一帧、点击完全没反应（就是"卡住"）。
    // 这里保证无论发生什么，下一帧都一定会被排上。
    try {
      this.tickOnce();
    } catch (err) {
      // 输出错误便于排查，但不让循环中断
      if (typeof console !== 'undefined' && console.error) {
        console.error('[engine] 主循环异常:', err && (err.stack || err.message || err));
      }
    }

    var self = this;
    if (typeof wx.requestAnimationFrame === 'function') {
      wx.requestAnimationFrame(function () { self.loop(); });
    } else {
      setTimeout(function () { self.loop(); }, 16);
    }
  },

  /** 单帧逻辑（与排程分离，便于异常隔离） */
  tickOnce: function () {
    var now = Date.now();
    // 上限 0.05s：从后台回来时 now-lastTime 可能是几十秒，
    // 不夹住会让打字机/动画一帧跳完。
    var dt = Math.min(0.05, (now - this.lastTime) / 1000);
    if (!(dt > 0)) dt = 0.016;   // 时钟异常兜底，保证动画不卡住
    this.lastTime = now;
    this.t += dt;

    var screen = SCREENS[this.cur];
    if (!screen) return;

    // 屏幕内部可能返回新的场景名（如剧情结束 → 结局页）
    // 这是内部流转，返回栈沿用来源（如从剧集库进来，仍回剧集库）
    var next = screen.update(dt);
    if (next && SCREENS[next]) {
      // 剧情 → 结局：追加到来源链，返回时能回到剧情/剧集库。
      // 注意：game.update() 返回 'ending' 时 cur 还是 'game'，
      // 所以不能拿 next 和 cur 比较来判断是否重复，否则会漏掉这次切屏。
      // 这里只在「链末位不是 next」时才追加，避免重复堆积。
      if (this.backStack[this.backStack.length - 1] !== next) {
        this.backStack = this.backStack.slice(0, this.backIndex + 1).concat([next]);
      }
      this.backIndex = this.backStack.length - 1;
      // 结局页需要传入结局对象
      if (next === 'ending') {
        this.switchTo('ending', Game.ending);
      } else {
        this.switchTo(next);
      }
      screen = SCREENS[this.cur];
    }

    this.render(screen);
  },

  render: function (screen) {
    R.begin();
    R.resetRegions();
    screen.draw(this.t);
  },

  /* ============ 触摸 ============ */

  /**
   * 兼容取触摸坐标 — 返回归一化后的 {x, y}。
   *
   * 微信小游戏不同基础库/机型上，触点可能只有 clientX/Y，也可能只有 x/y，
   * 拿错字段会得到 undefined，导致 onTouchEnd 里提前 return，
   * 表现为「画面正常但点击完全没反应」。
   *
   * 另外部分真机把坐标报成「物理像素」(= 逻辑像素 × dpr)。
   * 关键点：必须**整体判断**，不能对 x、y 分别设阈值！
   * 反例（曾经踩过）：图鉴按钮在右上角，y 仅 70 逻辑像素，
   * ×dpr(3) 后是 210，仍小于 H*1.5=1266，于是 y 不换算、x 换算，
   * 坐标被劈成两半 → 点哪都命中不了。
   * 所以这里只看「任一轴明显超出逻辑范围」就整体换算。
   */
  normPoint: function (vx, vy) {
    var W = R.W || 0;
    var H = R.H || 0;
    var dpr = R.dpr || 1;
    if (dpr > 1 && ((W && vx > W * 1.2) || (H && vy > H * 1.2))) {
      return { x: vx / dpr, y: vy / dpr };
    }
    return { x: vx, y: vy };
  },

  /** 从触点对象里抽出 {x, y}（逻辑坐标），兼容 clientX/Y、x/y、pageX/Y */
  touchPoint: function (t) {
    if (!t) return null;
    var vx, vy, has = false;
    if (typeof t.clientX === 'number' && typeof t.clientY === 'number') {
      vx = t.clientX; vy = t.clientY; has = true;
    } else if (typeof t.x === 'number' && typeof t.y === 'number') {
      vx = t.x; vy = t.y; has = true;
    } else if (typeof t.pageX === 'number' && typeof t.pageY === 'number') {
      vx = t.pageX; vy = t.pageY; has = true;
    }
    if (!has) return null;
    return this.normPoint(vx, vy);
  },

  onTouchStart: function (e) {
    var t = e.touches && e.touches[0];
    if (!t) return;
    var p = this.touchPoint(t);
    if (!p) return;
    var screen = SCREENS[this.cur];

    if (screen.onTouchStart) screen.onTouchStart(p.y);

    this._downX = p.x;
    this._downY = p.y;
    this._lastMoveY = p.y;
    this._dragged = false;
  },

  onTouchMove: function (e) {
    var t = e.touches && e.touches[0];
    if (!t) return;
    var screen = SCREENS[this.cur];
    var p = this.touchPoint(t);
    if (!p) return;

    if (screen.onTouchMove) screen.onTouchMove(p.y);

    if (this._downX !== undefined) {
      var dx = p.x - this._downX;
      var dy = p.y - this._downY;
      if (dx * dx + dy * dy > 100) this._dragged = true;
    }

    // 结局页长文本滚动
    if (this.cur === 'ending' && screen.onTap) {
      var id = R.hitTest(p.x, p.y);
      if (id === 'scroll') {
        Ending.touchY = (Ending.touchY || 0) + (this._lastMoveY !== undefined ? (this._lastMoveY - p.y) : 0);
        if (Ending.touchY < 0) Ending.touchY = 0;
      }
    }
    this._lastMoveY = p.y;
  },

  onTouchEnd: function (e) {
    var screen = SCREENS[this.cur];
    var x = this._downX;
    var y = this._downY;
    var dragged = this._dragged;

    // 兜底：如果 start 没记到坐标，就用 end 自带的 changedTouches
    if (typeof x !== 'number' || typeof y !== 'number') {
      var et = e && e.changedTouches && e.changedTouches[0];
      var p = this.touchPoint(et);
      if (p) { x = p.x; y = p.y; }
    }

    if (screen.onTouchEnd) screen.onTouchEnd();

    this._downX = undefined;
    this._downY = undefined;
    this._lastMoveY = undefined;
    this._dragged = false;

    // 拖动过就不当作点击
    if (dragged || typeof x !== 'number' || typeof y !== 'number') return;

    var id = R.hitTest(x, y);
    if (!id) {
      // 空白处点击：交给场景自行处理（如推进台词）
      if (screen.onTap) screen.onTap(null);
      return;
    }

    var result = screen.onTap(id);
    this.applyResult(result);
  },

  /**
   * 返回上一级
   *
   * backStack 是"来源链"，backIndex 指向当前层级。返回时只回退一层，
   * 不出栈——这样在图鉴/结局页之间来回切换不会把来源用光。
   *
   * 例：首页 → 剧集库 → 剧情 → 结局
   *    链= ['title','library','ending']，在结局返回→'library'，
   *    再在剧集库返回→'title'。
   */
  back: function () {
    // 从图鉴返回：还原进入图鉴前的链，避免链被 collect 撑长
    if (this.cur === 'collect' && this._collectReturn) {
      this.backStack = this._collectReturn.stack.slice();
      this.backIndex = this._collectReturn.index;
      this._collectReturn = null;
    } else if (this.backIndex > 0) {
      this.backIndex--;
    }

    var target = this.backStack[this.backIndex] || 'title';
    if (!SCREENS[target]) target = 'title';
    // 剧情页与结局页保留现场，其余页面重新初始化
    var keep = (target === 'game' || target === 'ending');
    this.switchTo(target, null, keep);
  },

  /** 跳到来源链的某一层（chain 从 title 开始，末位为当前页） */
  gotoLevel: function (name, chain) {
    this.backStack = chain;
    this.backIndex = chain.length - 1;
    this.switchTo(name);
  },

  applyResult: function (result) {
    if (!result) return;

    // 进入指定剧本：{ play: scriptId, resume?:bool }
    if (typeof result === 'object' && result.play) {
      // 从首页/剧集库进游戏，链的末位是 game
      var base = (this.cur === 'library') ? ['title', 'library'] : ['title'];
      this.backStack = base.concat(['game']);
      this.backIndex = this.backStack.length - 1;
      // resume 只在首页「继续」时带上；剧集库点进来是重新开始
      this.switchTo('game', { scriptId: result.play, resume: !!result.resume });
      return;
    }

    if (result === '__back__') {
      this.back();
      return;
    }

    // 结局页的「返回剧集库」：跳过中间的剧情页，直接回剧集库
    if (result === 'toLibrary') {
      // 链中找到 library 层并回退过去
      var li = -1;
      for (var i = this.backStack.length - 1; i >= 0; i--) {
        if (this.backStack[i] === 'library') { li = i; break; }
      }
      if (li < 0) {
        this.backStack = ['title', 'library'];
        this.backIndex = 1;
      } else {
        this.backIndex = li;
      }
      this.switchTo('library');
      return;
    }

    if (result === 'library') {
      this.gotoLevel('library', ['title', 'library']);
      return;
    }

    // 进入图鉴：作为「覆盖层」压在当前层之上。
    // 注意：链里最多只保留一层 collect，且返回时把它弹掉。
    // 否则反复进出图鉴会让 backStack 无限膨胀
    // （["title","game","collect","collect",...]），返回逻辑错乱。
    if (result === 'collect') {
      this._collectReturn = {
        stack: this.backStack.slice(0, this.backIndex + 1),
        index: this.backIndex
      };
      this.backStack = this._collectReturn.stack.concat(['collect']);
      this.backIndex = this._collectReturn.stack.length;
      this.switchTo('collect');
      return;
    }

    if (result === 'game') {
      // switchTo 内部会调用 Game.enter() 完成状态重置
      this.switchTo('game');
      return;
    }

    if (SCREENS[result]) {
      this.switchTo(result);
    }
  }
};

module.exports = Engine;