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

    // 前后台切换：后台停循环，回前台重置时间基准并重启循环。
    // 真机上不加这段，切后台再回来可能出现画面停在那一帧不动（看起来像卡死）。
    if (wx.onShow) {
      wx.onShow(function () {
        Engine.onShow();
      });
    }
    if (wx.onHide) {
      wx.onHide(function () {
        Engine.onHide();
      });
    }

    this.lastTime = Date.now();
    this.running = true;
    this.loop();
  },

fromLibrary: false,// 从剧本库进入游戏时，返回键应回到剧本库

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
      SCREENS[name].enter(arg);
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

    var now = Date.now();
    var dt = Math.min(0.05, (now - this.lastTime) / 1000);
    this.lastTime = now;
    this.t += dt;

    var screen = SCREENS[this.cur];

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

    var self = this;
    if (typeof wx.requestAnimationFrame === 'function') {
      wx.requestAnimationFrame(function () { self.loop(); });
    } else {
      setTimeout(function () { self.loop(); }, 16);
    }
  },

  /** 从后台回前台：重置时间基准，避免 dt 异常把动画/打字机带飞或停摆 */
  onShow: function () {
    this.lastTime = Date.now();
    if (!this.running) {
      this.running = true;
      this.loop();
    }
  },

  onHide: function () {
    // 主动停掉主循环，回前台时由 onShow 重新拉起
    this.running = false;
  },

  render: function (screen) {
    R.begin();
    R.resetRegions();
    screen.draw(this.t);
  },

  /* ============ 触摸 ============ */

  onTouchStart: function (e) {
    var t = e.touches && e.touches[0];
    if (!t) return;
    var x = t.clientX;
    var y = t.clientY;
    var screen = SCREENS[this.cur];

    if (screen.onTouchStart) screen.onTouchStart(y);

    this._downX = x;
    this._downY = y;
    this._lastMoveY = y;
    this._dragged = false;
  },

  onTouchMove: function (e) {
    var t = e.touches && e.touches[0];
    if (!t) return;
    var screen = SCREENS[this.cur];

    if (screen.onTouchMove) screen.onTouchMove(t.clientY);

    if (this._downX !== undefined) {
      var dx = t.clientX - this._downX;
      var dy = t.clientY - this._downY;
      if (dx * dx + dy * dy > 100) this._dragged = true;
    }

    // 结局页长文本滚动
    if (this.cur === 'ending' && screen.onTap) {
      var id = R.hitTest(t.clientX, t.clientY);
      if (id === 'scroll') {
        Ending.touchY = (Ending.touchY || 0) + (this._lastMoveY !== undefined ? (this._lastMoveY - t.clientY) : 0);
        if (Ending.touchY < 0) Ending.touchY = 0;
      }
    }
    this._lastMoveY = t.clientY;
  },

  onTouchEnd: function (e) {
    var screen = SCREENS[this.cur];
    var x = this._downX;
    var y = this._downY;
    var dragged = this._dragged;

    if (screen.onTouchEnd) screen.onTouchEnd();

    this._downX = undefined;
    this._downY = undefined;
    this._lastMoveY = undefined;
    this._dragged = false;

    // 拖动过就不当作点击
    if (dragged || x === undefined) return;

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

    // 进入指定剧本：{ play: scriptId }
    if (typeof result === 'object' && result.play) {
      // 从首页/剧集库进游戏，链的末位是 game
      var base = (this.cur === 'library') ? ['title', 'library'] : ['title'];
      this.backStack = base.concat(['game']);
      this.backIndex = this.backStack.length - 1;
      this.switchTo('game', result.play);
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