/**
 * 剧本库（载入页）
 *
 * 竖向卡片列表：封面 + 标题 + 类型 + 简介 + 收集进度
 * 支持上下滚动、点击进入
 */

var R = require('../render.js');
var Works = require('../works.js');
var Save = require('../save.js');
var Portrait = require('../portrait.js');

var List = {
  scroll: 0,
  maxScroll: 0,
  dragging: false,
  startY: 0,
  startScroll: 0,
  moved: false,
  hover: -1,

  // 卡片文案布局缓存：draw() 每帧都跑，标题截断/简介换行都会调 measureText。
  // 这些结果只跟「屏宽 + 解锁数」有关，不变时复用，避免每帧重算。
  _layout: null,
  _layoutKey: '',

  enter: function () {
    this.scroll = 0;
    this.dragging = false;
    this.moved = false;
    this.hover = -1;
    this._layout = null;
    this._layoutKey = '';

    // 预加载所有剧本的封面，避免列表滑动时出现白块
    var pkgs = Works.PACKAGES;
    for (var i = 0; i < pkgs.length; i++) {
      Portrait.useScript(pkgs[i].meta.id, pkgs[i].meta.chars);
    }
  },

  /* ---------- 滚动 ---------- */
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
    if (this.scroll < 0) this.scroll *= 0.45;
    if (this.scroll > this.maxScroll) this.scroll = this.maxScroll + (this.scroll - this.maxScroll) * 0.45;
  },

  onTouchEnd: function () {
    this.dragging = false;
    if (this.scroll < 0) this.scroll = 0;
    if (this.scroll > this.maxScroll) this.scroll = this.maxScroll;
  },

  update: function (dt) {
    if (!this.dragging) {
      if (this.scroll < 0) {
        this.scroll += (0 - this.scroll) * Math.min(1, dt * 12);
        if (Math.abs(this.scroll) < 0.5) this.scroll = 0;
      } else if (this.scroll > this.maxScroll) {
        this.scroll += (this.maxScroll - this.scroll) * Math.min(1, dt * 12);
        if (Math.abs(this.scroll - this.maxScroll) < 0.5) this.scroll = this.maxScroll;
      }
    }
    Portrait.update(dt);
  },

  /** 卡片尺寸 */
  cardH: function () {
    // 134 是能容纳「标签 + 标题 + 两行简介 + 进度条」且互不压字的最小高度
    return R.fontSize(134);
  },

  draw: function (t) {
    var ctx = R.ctx;
    var fs = R.fontSize;

    // ---- 背景：统一的深色底+ 顶部柔光，不与任何单张立绘绑定 ----
    var bg = ctx.createLinearGradient(0, 0, 0, R.H);
    bg.addColorStop(0, '#14121c');
    bg.addColorStop(0.42, '#0b0b12');
    bg.addColorStop(1, '#06060a');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, R.W, R.H);

    // 顶部一抹暖光，避免大片死黑
    var glow = ctx.createRadialGradient(R.W / 2, R.SAFE_TOP + fs(30), 0, R.W / 2, R.SAFE_TOP + fs(30), R.W * 0.9);
    glow.addColorStop(0, 'rgba(190,155,80,0.13)');
    glow.addColorStop(1, 'rgba(190,155,80,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, R.W, R.H * 0.6);

    var pad = fs(20);
    var topY = R.SAFE_TOP + fs(18);

    // ---- 标题区 ----
    ctx.textBaseline = 'top';
    ctx.textAlign = 'left';
    ctx.font = fs(13) + 'px sans-serif';
    ctx.fillStyle = '#c9a94f';
    ctx.fillText('剧 集 库', pad, topY);

    R.goldText('选择一段故事', R.W / 2, topY + fs(26), fs(23), { shadow: true });

    ctx.font = fs(11.5) + 'px sans-serif';
    ctx.fillStyle = '#6f6f85';
    ctx.textAlign = 'center';
    ctx.fillText(Works.PACKAGES.length + ' 部作品 · ' +
      Works.PACKAGES.reduce(function (s, p) { return s + p.ALL_ENDINGS.length; }, 0) + ' 个结局',
      R.W / 2, topY + fs(60));
    ctx.textAlign = 'left';

    // ---- 卡片列表 ----
    var listTop = topY + fs(84);
    var cardH = this.cardH();
    var gap = fs(13);

    var items = Works.list();
    var totalH = items.length * cardH + (items.length - 1) * gap;
    var listBottom = R.H - R.SAFE_BOTTOM - fs(30);
    var viewH = listBottom - listTop;
    this.maxScroll = Math.max(0, totalH - viewH);

    // ---- 文案布局（可缓存）----
    // 依赖：屏宽 + 每个剧本的解锁数。两者不变就不重算换行/截断。
    var cardX0 = pad;
    var cardW0 = R.W - cardX0 * 2;
    var thumb0 = cardH - fs(28);
    var infoX0 = cardX0 + fs(14) + thumb0 + fs(13);
    var infoW0 = cardX0 + cardW0 - infoX0 - fs(14);
    if (infoW0 < fs(60)) infoW0 = fs(60);
    var cy0 = (fs(14) + fs(2));
    var lkKey = R.W + '|' + items.map(function (x) { return x.id + ':' + Save.count(x.id); }).join(',');
    var texts;
    if (this._layout && this._layoutKey === lkKey) {
      texts = this._layout;
    } else {
      texts = [];
      for (var ti = 0; ti < items.length; ti++) {
        var itx = items[ti];
        var ux = Save.count(itx.id);
        var complete = ux >= itx.endingCount;
        var cx = cy0;
        ctx.font = fs(10) + 'px sans-serif';
        var tagText = this.ellipsis(ctx, itx.tag, infoW0 - fs(16));
        var tagW = Math.min(infoW0, ctx.measureText(tagText).width + fs(16));
        cx += fs(24);
        ctx.font = 'bold ' + fs(15.5) + 'px sans-serif';
        var title = this.ellipsis(ctx, itx.title, infoW0);
        cx += fs(23);
        // 简介可用高度
        var barYr = cardH - fs(20);
        var progYr = barYr - fs(14);
        var introLineH = fs(15);
        var introMaxH = progYr - fs(6) - cx;
        var maxLines = introMaxH >= introLineH * 2 ? 2 : (introMaxH >= introLineH ? 1 : 0);
        var introLines = [];
        if (maxLines > 0) {
          ctx.font = fs(11.5) + 'px sans-serif';
          var ls = R.wrapText(ctx, itx.intro, infoW0, fs(11.5));
          if (ls.length > maxLines) {
            ls = ls.slice(0, maxLines);
            ls[maxLines - 1] = this.ellipsis(ctx, ls[maxLines - 1], infoW0);
          }
          introLines = ls;
        }
        var progTxt = complete ? '已全部解锁' : ('结局 ' + ux + ' / ' + itx.endingCount);
        ctx.font = fs(10.5) + 'px sans-serif';
        var progW = ctx.measureText(progTxt).width;   // 布局期量一次，draw 时直接用
        texts.push({ tagText: tagText, tagW: tagW, title: title,
                     cxIntro: cx, introLines: introLines, introLineH: introLineH,
                     progTxt: progTxt, progW: progW });
      }
      this._layout = texts;
      this._layoutKey = lkKey;
    }

    var s = this.scroll;
    // 裁剪到列表区：向上滚出列表顶的卡片文字会画进标题区（穿字）。
    // 之前只做「整卡剔除」，半露的卡片仍会越界绘制。
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, listTop, R.W, listBottom - listTop);
    ctx.clip();
    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      var y = listTop + i * (cardH + gap) - s;
      if (y + cardH < listTop - fs(20) || y > listBottom + fs(20)) continue;

      var unlocked = Save.count(it.id);
      var complete = unlocked >= it.endingCount;

      var cardX = cardX0;
      var cardW = cardW0;
      var appear = Math.min(1, Math.max(0, (t - 0.06 * i) / 0.42));
      if (appear <= 0) continue;

      ctx.save();
      ctx.globalAlpha = appear;
      ctx.translate(0, (1 - appear) * 14);

      // 卡片底：轻微渐变，避免纯色块
      var cg = ctx.createLinearGradient(0, y, 0, y + cardH);
      cg.addColorStop(0, 'rgba(255,255,255,0.055)');
      cg.addColorStop(1, 'rgba(255,255,255,0.018)');
      R.roundRectFill(cardX, y, cardW, cardH, 16, cg);
      R.roundRectStroke(cardX, y, cardW, cardH, 16, 'rgba(230,200,122,0.16)', 1);

      // ---- 封面：方形缩略图（按各自剧本的立绘表加载）----
      var thumb = thumb0;
      var tx = cardX + fs(14);
      var ty = y + fs(14);
      Portrait.drawThumb(R, it.id, it.cover, tx, ty, thumb, thumb, 12);

      // ---- 文本信息 ----
      var infoX = infoX0;
      var infoW = infoW0;
      var cy = ty + fs(2);
      var T = texts[i];

      // 所有卡片内文字一律左对齐（不要依赖外部遗留的 textAlign 状态）
      ctx.textAlign = 'left';

      // 类型标签（chip 内文字必须显式居中，不能依赖继承的 textAlign）
      ctx.font = fs(10) + 'px sans-serif';
      var tagText = T.tagText;
      var tagW = T.tagW;
      R.roundRectStroke(infoX, cy, tagW, fs(19), 10, 'rgba(230,200,122,0.30)', 1);
      ctx.fillStyle = '#c8a24a';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(tagText, infoX + tagW / 2, cy + fs(9.5));
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      cy += fs(24);

      // 标题（过长截断）
      ctx.font = 'bold ' + fs(15.5) + 'px sans-serif';
      ctx.fillStyle = '#f2e9d2';
      ctx.textAlign = 'left';
      var title = T.title;
      ctx.fillText(title, infoX, cy);
      cy += fs(23);

      // 进度条与进度文字的位置先算出来，作为简介区的下界
      var barY = y + cardH - fs(20);
      var barX = infoX;
      var barW = infoW;
      var progTxt = T.progTxt;
      var progY = barY - fs(14);

      // 简介（至多两行；若被截断，把「最后一行本身」加省略号，
      // 绝不能拼接前两行再截断——那会把第二行渲染成第一行的复制品）
      // 排版结果已在布局缓存里算好（T.introLines），每帧只做绘制、不再 wrapText
      if (T.introLines.length > 0) {
        ctx.font = fs(11.5) + 'px sans-serif';
        ctx.fillStyle = '#9d9ab0';
        ctx.textAlign = 'left';
        for (var m = 0; m < T.introLines.length; m++) {
          ctx.fillText(T.introLines[m], infoX, cy + m * T.introLineH);
        }
      }

      // ---- 底部进度条 ----
      // 进度文字右对齐贴住进度条右端，避免长文案（如「已全部解锁」）越界
      ctx.font = fs(10.5) + 'px sans-serif';
      ctx.fillStyle = complete ? '#c8a24a' : '#7d7d92';
      ctx.textAlign = 'left';
      var progW = Math.min(barW, T.progW);
      ctx.fillText(progTxt, barX + barW - progW, progY);
      ctx.textAlign = 'left';

      R.roundRectFill(barX, barY, barW, fs(3), 2, 'rgba(255,255,255,0.10)');
      if (it.endingCount > 0) {
        var ratio = unlocked / it.endingCount;
        if (ratio > 0) {
          R.roundRectFill(barX, barY, Math.max(fs(8), barW * ratio), fs(3), 2,
            complete ? '#c8a24a' : 'rgba(230,200,122,0.62)');
        }
      }

      ctx.restore();

      R.hit('work:' + it.id, cardX, y, cardW, cardH);
    }
    ctx.restore();   // 结束列表区裁剪

    // 列表上下边缘做长距离渐变溶合：把半露的卡片柔化进背景，避免硬裁割裂。
    // 渐变色取自背景同位置的色值，保证与背景严丝合缝。
    var BG_STOPS = [[0, 0x14, 0x12, 0x1c], [0.42, 0x0b, 0x0b, 0x12], [1, 0x06, 0x06, 0x0a]];
    var bgAt = function (yy) {
      var u = Math.max(0, Math.min(1, yy / R.H));
      for (var bi = 0; bi < BG_STOPS.length - 1; bi++) {
        var a = BG_STOPS[bi], b = BG_STOPS[bi + 1];
        if (u >= a[0] && u <= b[0]) {
          var bt = (b[0] === a[0]) ? 0 : (u - a[0]) / (b[0] - a[0]);
          return 'rgb(' + Math.round(a[1] + (b[1] - a[1]) * bt) + ',' +
                          Math.round(a[2] + (b[2] - a[2]) * bt) + ',' +
                          Math.round(a[3] + (b[3] - a[3]) * bt) + ')';
        }
      }
      return 'rgb(6,6,10)';
    };
    var fadeH = fs(52);
    // 渐变起点必须落在副标题下缘之下（副标题底 = topY+fs(60)+fs(11.5)），
    // 否则会把标题区的字压暗，出现"上半截亮、下半截暗"的割裂感。
    var fadeTop = topY + fs(60) + fs(11.5) + fs(4);
    var tf = ctx.createLinearGradient(0, fadeTop, 0, fadeTop + fadeH);
    tf.addColorStop(0, bgAt(fadeTop));
    tf.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = tf;
    ctx.fillRect(0, fadeTop, R.W, fadeH);
    var bf = ctx.createLinearGradient(0, listBottom - fadeH, 0, listBottom);
    bf.addColorStop(0, 'rgba(0,0,0,0)');
    bf.addColorStop(1, bgAt(listBottom));
    ctx.fillStyle = bf;
    ctx.fillRect(0, listBottom - fadeH, R.W, fadeH);

    // ---- 滚动条 ----
    if (this.maxScroll > 0) {
      var trackH = viewH;
      var thumbH = Math.max(fs(30), trackH * (viewH / totalH));
      var thumbY = listTop + (trackH - thumbH) * Math.max(0, Math.min(1, this.scroll / this.maxScroll));
      R.roundRectFill(R.W - fs(5), thumbY, fs(3), thumbH, 2, 'rgba(230,200,122,0.25)');
    }

    // ---- 底部：返回 ----
    var by = R.H - R.SAFE_BOTTOM - fs(26);
    ctx.font = fs(12.5) + 'px sans-serif';
    ctx.fillStyle = '#c8a24a';
    ctx.textBaseline = 'middle';
    ctx.fillText('‹ 返回', pad + fs(4), by + fs(13));
    ctx.textBaseline = 'top';
    R.hit('back', 0, by, R.W, fs(30));
  },

  /** 文字超宽截断加省略号 */
  ellipsis: function (ctx, text, maxW) {
    var t = String(text);
    if (ctx.measureText(t).width <= maxW) return t;
    while (t.length > 2 && ctx.measureText(t + '…').width > maxW) {
      t = t.slice(0, t.length - 1);
    }
    return t + '…';
  },

  onTap: function (id) {
    if (!id) return null;
    if (id === 'back') return '__back__';
    if (id.indexOf('work:') === 0) {
      return { play: id.slice(5) };
    }
    return null;
  }
};

module.exports = List;