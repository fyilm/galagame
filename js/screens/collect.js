/**
 * 结局图鉴页
 */

var R = require('../render.js');
var Save = require('../save.js');
var Works = require('../works.js');
var Game = require('./game.js');

var Collect = {
  scroll: 0,
  maxScroll: 0,
  dragging: false,
  startY: 0,
  startScroll: 0,
  moved: false,

  enter: function () {
    this.scroll = 0;
    this.dragging = false;
    this.moved = false;

    // 图鉴跟随当前剧本
    var pkg = Game.pkg || Works.PACKAGES[0];
    this.pkg = pkg;
    this.ALL = pkg.ALL_ENDINGS;
    this.scriptId = pkg.meta.id;
    this.title = pkg.meta.title;
  },

  onTouchStart: function (y) {
    this.dragging = true;
    this.startY = y;
    this.startScroll = this.scroll;
    this.moved = false;
  },

  onTouchMove: function (y) {
    if (!this.dragging) return;
    var dy = this.startY - y;
    if (Math.abs(dy) > 6) this.moved = true;
    this.scroll = this.startScroll + dy;
    if (this.scroll < 0) this.scroll *= 0.4;
    if (this.scroll > this.maxScroll) this.scroll = this.maxScroll + (this.scroll - this.maxScroll) * 0.4;
  },

  onTouchEnd: function () {
    this.dragging = false;
    if (this.scroll < 0) this.scroll = 0;
    if (this.scroll > this.maxScroll) this.scroll = this.maxScroll;
  },

  update: function (dt) {
    if (!this.dragging) {
      // 惯性回弹
      if (this.scroll < 0) {
        this.scroll += (0 - this.scroll) * Math.min(1, dt * 12);
        if (Math.abs(this.scroll) < 0.5) this.scroll = 0;
      } else if (this.scroll > this.maxScroll) {
        this.scroll += (this.maxScroll - this.scroll) * Math.min(1, dt * 12);
        if (Math.abs(this.scroll - this.maxScroll) < 0.5) this.scroll = this.maxScroll;
      }
    }
  },

  draw: function (t) {
    var ctx = R.ctx;
    var fs = R.fontSize;

    // 背景
    var g = ctx.createLinearGradient(0, 0, 0, R.H);
    g.addColorStop(0, '#15111f');
    g.addColorStop(0.4, '#0a0a12');
    g.addColorStop(1, '#07070b');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, R.W, R.H);

    var pad = fs(22);
    var topY = R.SAFE_TOP + fs(26);

    // 头部
    ctx.font = 'bold ' + fs(19) + 'px sans-serif';
    ctx.fillStyle = '#f0eefa';
    ctx.textBaseline = 'top';
    ctx.textAlign = 'left';
    ctx.fillText('结局图鉴', pad, topY);

    // 所属剧本名（多剧本下让用户知道在看哪一部）
    if (this.title) {
      ctx.font = fs(11) + 'px sans-serif';
      ctx.fillStyle = '#6f6f85';
      ctx.fillText(this.title, pad, topY + fs(24));
    }

    var ALL = this.ALL;
    var unlocked = Save.getUnlocked(this.scriptId);
    ctx.font = fs(13) + 'px sans-serif';
    ctx.fillStyle = '#c8a24a';
    ctx.textAlign = 'right';
    ctx.fillText(unlocked.length + ' / ' + ALL.length, R.W - pad, topY + fs(5));
    ctx.textAlign = 'left';

    var headBottom = topY + fs(42);
    ctx.fillStyle = 'rgba(255,255,255,0.07)';
    ctx.fillRect(pad, headBottom, R.W - pad * 2, 1);

    // 列表区
    var listTop = headBottom + fs(18);
    var backH = fs(40);
    var listBottom = R.H - R.SAFE_BOTTOM - backH - fs(10);
    var viewH = listBottom - listTop;

    var unlockedSet = {};
    for (var k = 0; k < unlocked.length; k++) unlockedSet[unlocked[k]] = true;

    var cards = [];
    var totalH = 0;
    for (var i = 0; i < ALL.length; i++) {
      var e = ALL[i];
      var ok = !!unlockedSet[e.id];
      var descFS = fs(13);
      var lines = R.wrapText(ctx, ok ? e.desc : '还没走到这里。换一种选择，也许就是另一条路。', R.W - pad * 2 - fs(36), descFS);
      var cardH = fs(42) + lines.length * descFS * 1.85 + fs(18);
      cards.push({ e: e, ok: ok, lines: lines, h: cardH, descFS: descFS });
      totalH += cardH + fs(12);
    }
    this.maxScroll = Math.max(0, totalH - viewH);

    var s = this.scroll;
    for (var j = 0; j < cards.length; j++) {
      var c = cards[j];
      var y = listTop + j * (c.h + fs(12)) - s;
      if (y + c.h < listTop || y > listBottom) continue;

      // 卡片
      R.roundRectFill(pad, y, R.W - pad * 2, c.h, 14, 'rgba(255,255,255,0.028)');
      R.roundRectStroke(pad, y, R.W - pad * 2, c.h, 14, 'rgba(255,255,255,0.07)', 1);

      ctx.save();
      if (!c.ok) ctx.globalAlpha = 0.42;

      // 名称 + 类型标签
      ctx.font = 'bold ' + fs(16) + 'px sans-serif';
      ctx.fillStyle = c.ok ? '#f2e9d2' : '#6b6b80';
      ctx.textBaseline = 'top';
      var nameText = c.ok ? c.e.title : '？？？';
      ctx.fillText(nameText, pad + fs(18), y + fs(16));

      var tagText = c.ok ? c.e.tag : '未 解 锁';
      ctx.font = fs(10.5) + 'px sans-serif';
      var tagW = ctx.measureText(tagText).width + fs(18);
      var tagX = R.W - pad - fs(18) - tagW;
      R.roundRectStroke(tagX, y + fs(15), tagW, fs(21), 14, 'rgba(230,200,122,0.28)', 1);
      ctx.fillStyle = '#c8a24a';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(tagText, tagX + tagW / 2, y + fs(25.5));
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';

      // 描述
      ctx.font = c.descFS + 'px sans-serif';
      ctx.fillStyle = '#9d9ab0';
      for (var m = 0; m < c.lines.length; m++) {
        ctx.fillText(c.lines[m], pad + fs(18), y + fs(46) + m * c.descFS * 1.85);
      }
      ctx.restore();
    }

    // 滚动条
    if (this.maxScroll > 0) {
      var trackH = viewH;
      var thumbH = Math.max(fs(30), trackH * (viewH / totalH));
      var thumbY = listTop + (trackH - thumbH) * (this.scroll / this.maxScroll);
      R.roundRectFill(R.W - fs(6), thumbY, fs(3), thumbH, 2, 'rgba(230,200,122,0.28)');
    }

    // 返回
    var by = R.H - R.SAFE_BOTTOM - backH;
    ctx.font = fs(13.5) + 'px sans-serif';
    ctx.fillStyle = '#c8a24a';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText('← 返 回', pad + fs(6), by + backH / 2);
    R.hit('back', 0, by, R.W, backH);
  },

  onTap: function (id) {
    if (id === 'back') return '__back__';
    return null;
  }
};

module.exports = Collect;