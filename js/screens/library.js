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

  enter: function () {
    this.scroll = 0;
    this.dragging = false;
    this.moved = false;
    this.hover = -1;

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
    return R.fontSize(126);
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

    var s = this.scroll;
    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      var y = listTop + i * (cardH + gap) - s;
      if (y + cardH < listTop - fs(20) || y > listBottom + fs(20)) continue;

      var unlocked = Save.count(it.id);
      var complete = unlocked >= it.endingCount;

      var cardX = pad;
      var cardW = R.W - pad * 2;
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
      var thumb = cardH - fs(28);
      var tx = cardX + fs(14);
      var ty = y + fs(14);
      Portrait.drawThumb(R, it.id, it.cover, tx, ty, thumb, thumb, 12);

      // ---- 文本信息 ----
      var infoX = tx + thumb + fs(13);
      var infoW = cardX + cardW - infoX - fs(14);
      var cy = ty + fs(2);

      // 类型标签
      ctx.font = fs(10) + 'px sans-serif';
      var tagW = ctx.measureText(it.tag).width + fs(16);
      R.roundRectStroke(infoX, cy, tagW, fs(19), 10, 'rgba(230,200,122,0.30)', 1);
      ctx.fillStyle = '#c8a24a';
      ctx.textBaseline = 'middle';
      ctx.fillText(it.tag, infoX + tagW / 2, cy + fs(9.5));
      ctx.textBaseline = 'top';
      cy += fs(25);

      // 标题（过长截断）
      ctx.font = 'bold ' + fs(15.5) + 'px sans-serif';
      ctx.fillStyle = '#f2e9d2';
      var title = this.ellipsis(ctx, it.title, infoW);
      ctx.fillText(title, infoX, cy);
      cy += fs(23);

      // 简介（两行截断）
      ctx.font = fs(11.5) + 'px sans-serif';
      ctx.fillStyle = '#9d9ab0';
      var lines = R.wrapText(ctx, it.intro, infoW, fs(11.5));
      var maxLines = Math.min(2, lines.length);
      for (var m = 0; m < maxLines; m++) {
        ctx.fillText(lines[m], infoX, cy + m * fs(16));
      }

      // ---- 底部进度条 ----
      var barY = y + cardH - fs(20);
      var barX = infoX;
      var barW = infoW;
      R.roundRectFill(barX, barY, barW, fs(3), 2, 'rgba(255,255,255,0.10)');
      if (it.endingCount > 0) {
        var ratio = unlocked / it.endingCount;
        if (ratio > 0) {
          R.roundRectFill(barX, barY, Math.max(fs(8), barW * ratio), fs(3), 2,
            complete ? '#c8a24a' : 'rgba(230,200,122,0.62)');
        }
      }
      var progTxt = complete ? '已全部解锁' : ('结局 ' + unlocked + ' / ' + it.endingCount);
      ctx.font = fs(10.5) + 'px sans-serif';
      ctx.fillStyle = complete ? '#c8a24a' : '#7d7d92';
      ctx.fillText(progTxt, barX, barY - fs(14));

      ctx.restore();

      R.hit('work:' + it.id, cardX, y, cardW, cardH);
    }

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