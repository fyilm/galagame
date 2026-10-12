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

  // 卡片布局缓存：draw() 每帧都跑，若每帧都重新换行（wrapText 内部逐字 measureText，
  // 21 个结局合计约 1800 次/帧）在真机上会明显卡顿。布局只跟「剧本 + 解锁集合 + 屏宽」
  // 有关，这三者不变时直接复用，避免每帧重算。
  _layout: null,
  _layoutKey: '',

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

    // 进入时作废布局缓存（解锁集合可能已变）
    this._layout = null;
    this._layoutKey = '';
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

    // 取背景在该 y 处的实际颜色（背景是 0->R.H 的三段线性渐变），
    // 供列表上下边缘的"溶合渐变"使用，保证过渡色与背景严丝合缝。
    var BG_STOPS = [[0, 0x15, 0x11, 0x1f], [0.4, 0x0a, 0x0a, 0x12], [1, 0x07, 0x07, 0x0b]];
    var bgAt = function (yy) {
      var u = Math.max(0, Math.min(1, yy / R.H));
      for (var i = 0; i < BG_STOPS.length - 1; i++) {
        var a = BG_STOPS[i], b = BG_STOPS[i + 1];
        if (u >= a[0] && u <= b[0]) {
          var t = (b[0] === a[0]) ? 0 : (u - a[0]) / (b[0] - a[0]);
          return 'rgb(' + Math.round(a[1] + (b[1] - a[1]) * t) + ',' +
                          Math.round(a[2] + (b[2] - a[2]) * t) + ',' +
                          Math.round(a[3] + (b[3] - a[3]) * t) + ')';
        }
      }
      return 'rgb(7,7,11)';
    };

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

    // ---- 布局缓存 ----
    // 缓存键 = 屏宽 + 解锁集合（排序后拼接）。这三者不变就不重排。
    var key = R.W + '|' + unlocked.slice().sort().join(',');
    var cards, totalH;
    if (this._layout && this._layoutKey === key) {
      cards = this._layout.cards;
      totalH = this._layout.totalH;
    } else {
      cards = [];
      totalH = 0;
      var descW = R.W - pad * 2 - fs(36);
      for (var i = 0; i < ALL.length; i++) {
        var e = ALL[i];
        var ok = !!unlockedSet[e.id];
        var descFS = fs(13);
        var lineH = descFS * 1.75;          // 单行行高
        var lines = R.wrapText(ctx, ok ? e.desc : '还没走到这里。换一种选择，也许就是另一条路。',
                               descW, descFS);
        // 空行只占半个行高（段落间距更紧凑），据此求描述区总高
        var descH = 0;
        for (var li = 0; li < lines.length; li++) {
          descH += (lines[li] === '' ? lineH * 0.5 : lineH);
        }
        var cardH = fs(46) + descH + fs(22);   // 头部（名称行）+ 描述 + 下内边距（留足字形下探余量）
        // 名称/标签也要在布局期算好：否则每帧都要 measureText 量标签宽度
        var nameText = ok ? e.title : '？？？';
        var tagText = ok ? e.tag : '未 解 锁';
        ctx.font = fs(10.5) + 'px sans-serif';
        var tagW = ctx.measureText(tagText).width + fs(18);
        // top 必须在构建时就累加出来：卡片高度不等，不能用 j*(自身h+gap) 求 y
        cards.push({ e: e, ok: ok, lines: lines, h: cardH, top: totalH,
                     descFS: descFS, lineH: lineH,
                     nameText: nameText, tagText: tagText, tagW: tagW });
        totalH += cardH + fs(12);
      }
      this._layout = { cards: cards, totalH: totalH };
      this._layoutKey = key;
    }
    this.maxScroll = Math.max(0, totalH - viewH);

    var s = this.scroll;
    // 裁剪到列表区：否则向上滚出列表顶的卡片，其文字会画进标题区（穿字）。
    // 之前只做「整卡剔除」，半露的卡片仍会越界绘制。
    // 裁剪上边取 listTop（分隔线下方），给上面的渐变留出空间：
    // 卡片在 listTop 处被裁掉后，紧接着一长段渐变把它溶回背景，
    // 这样分隔线上方绝不会看到卡片残影。
    var clipTop = listTop;
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, clipTop, R.W, listBottom - clipTop);
    ctx.clip();
    for (var j = 0; j < cards.length; j++) {
      var c = cards[j];
      var y = listTop + c.top - s;   // c.top 是相对列表起始的累计偏移（各卡高度不等）
      if (y + c.h < listTop || y > listBottom) continue;

      // 卡片底：未解锁卡用更实的底色，避免与滚动上来的相邻卡糊在一起
      R.roundRectFill(pad, y, R.W - pad * 2, c.h, 14,
        c.ok ? 'rgba(255,255,255,0.045)' : 'rgba(20,20,28,0.92)');
      R.roundRectStroke(pad, y, R.W - pad * 2, c.h, 14,
        c.ok ? 'rgba(230,200,122,0.16)' : 'rgba(255,255,255,0.07)', 1);

      ctx.save();
      if (!c.ok) ctx.globalAlpha = 0.42;

      // 名称 + 类型标签
      ctx.font = 'bold ' + fs(16) + 'px sans-serif';
      ctx.fillStyle = c.ok ? '#f2e9d2' : '#6b6b80';
      ctx.textBaseline = 'top';
      ctx.textAlign = 'left';
      var nameText = c.nameText;
      ctx.fillText(nameText, pad + fs(18), y + fs(16));

      var tagText = c.tagText;
      ctx.font = fs(10.5) + 'px sans-serif';
      var tagW = c.tagW;
      var tagX = R.W - pad - fs(18) - tagW;
      R.roundRectStroke(tagX, y + fs(15), tagW, fs(21), 14, 'rgba(230,200,122,0.28)', 1);
      ctx.fillStyle = '#c8a24a';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(tagText, tagX + tagW / 2, y + fs(25.5));
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';

      // 描述（空行只占半行高，与高度计算保持一致）
      ctx.font = c.descFS + 'px sans-serif';
      ctx.fillStyle = c.ok ? '#9d9ab0' : '#5c5c72';
      ctx.textAlign = 'left';
      var dy = y + fs(46);
      for (var m = 0; m < c.lines.length; m++) {
        ctx.fillText(c.lines[m], pad + fs(18), dy);
        dy += (c.lines[m] === '' ? c.lineH * 0.5 : c.lineH);
      }
      ctx.restore();
    }
    ctx.restore();   // 结束列表区裁剪

    // 分隔线以上（标题区）重铺一次背景，确保列表内容完全不可能残留到那里
    var hb = ctx.createLinearGradient(0, 0, 0, clipTop);
    hb.addColorStop(0, bgAt(0));
    hb.addColorStop(1, bgAt(clipTop));
    ctx.fillStyle = hb;
    ctx.fillRect(0, 0, R.W, clipTop);

    // 重画标题区（被上面的背景覆盖了）
    ctx.font = 'bold ' + fs(19) + 'px sans-serif';
    ctx.fillStyle = '#f0eefa';
    ctx.textBaseline = 'top';
    ctx.textAlign = 'left';
    ctx.fillText('结局图鉴', pad, topY);
    if (this.title) {
      ctx.font = fs(11) + 'px sans-serif';
      ctx.fillStyle = '#6f6f85';
      ctx.fillText(this.title, pad, topY + fs(24));
    }
    ctx.font = fs(13) + 'px sans-serif';
    ctx.fillStyle = '#c8a24a';
    ctx.textAlign = 'right';
    ctx.fillText(unlocked.length + ' / ' + ALL.length, R.W - pad, topY + fs(5));
    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(255,255,255,0.07)';
    ctx.fillRect(pad, headBottom, R.W - pad * 2, 1);

    // 上边缘做「长距离渐变溶合」：把半露的卡片柔化进背景。
    // 渐变从分隔线 headBottom 就开始（而不是 clipTop），
    // 这样分隔线 -> 卡片之间是一整段连续过渡，不会在两者之间留下硬边色带。
    var fadeH = fs(56);
    var tf = ctx.createLinearGradient(0, headBottom, 0, headBottom + fadeH);
    tf.addColorStop(0, bgAt(headBottom));
    tf.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = tf;
    ctx.fillRect(0, headBottom, R.W, fadeH);
    // 底部：从全透明 -> 背景色不透明
    var bf = ctx.createLinearGradient(0, listBottom - fadeH, 0, listBottom);
    bf.addColorStop(0, 'rgba(0,0,0,0)');
    bf.addColorStop(1, bgAt(listBottom));
    ctx.fillStyle = bf;
    ctx.fillRect(0, listBottom - fadeH, R.W, fadeH);

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