/**
 * 结局页
 */

var R = require('../render.js');
var Portrait = require('../portrait.js');
var Save = require('../save.js');
var Works = require('../works.js');
var Game = require('./game.js');

var Ending = {
  ending: null,
  enterTime: 0,

  enter: function (e) {
    this.touchY = 0;
    this.enterTime = 0;

    // 结局数据来自当前剧本
    var pkg = Game.pkg || Works.PACKAGES[0];
    this.pkg = pkg;
    var ALL = pkg.ALL_ENDINGS;

    if (e) {
      this.ending = e;
      Save.unlock(e.id, pkg.meta.id);
    }
    if (!this.ending || !ALL.length) this.ending = ALL[0];
    Portrait.set(this.ending.bg || pkg.meta.coverChar || 'suwan');
  },

  update: function (dt) {
    Portrait.update(dt);
  },

  draw: function (t) {
    var ctx = R.ctx;
    var fs = R.fontSize;
    var e = this.ending;
    var cx = R.W / 2;

    // 背景
    var ok = Portrait.drawBackground(R, e.bg || (this.pkg && this.pkg.meta.coverChar) || 'suwan');
    if (!ok) R.fill('#07070b');
    ctx.save();
    ctx.globalAlpha = 0.82;
    ctx.fillStyle = '#050508';
    ctx.fillRect(0, 0, R.W, R.H);
    ctx.restore();

    var topY = R.SAFE_TOP + fs(40);
    var pad = fs(30);
    var maxW = R.W - pad * 2;

    function fadeIn(delay, dur, drawFn) {
      var a = Math.min(1, Math.max(0, (t - delay) / (dur || 0.6)));
      if (a <= 0) return;
      ctx.save();
      ctx.globalAlpha = a;
      ctx.translate(0, (1 - a) * 12);
      drawFn();
      ctx.restore();
      return a;
    }

    // 结局标签
    fadeIn(0.05, 0.6, function () {
      ctx.font = 'bold ' + fs(11.5) + 'px sans-serif';
      var tw = ctx.measureText(e.tag).width + fs(32);
      var g = ctx.createLinearGradient(cx - tw / 2, 0, cx + tw / 2, 0);
      g.addColorStop(0, '#e6c87a');
      g.addColorStop(1, '#b8912f');
      R.roundRectFill(cx - tw / 2, topY, tw, fs(26), 20, g);
      ctx.fillStyle = '#0d0a04';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(e.tag, cx, topY + fs(13));
      ctx.textAlign = 'left';
    });

    // 结局标题
    var titleY = topY + fs(52);
    fadeIn(0.15, 0.6, function () {
      R.goldText(e.title, cx, titleY, fs(34), { shadow: true });
    });

    // 分隔线
    var lineY = titleY + fs(46);
    fadeIn(0.2, 0.6, function () {
      var g = ctx.createLinearGradient(cx - 22, 0, cx + 22, 0);
      g.addColorStop(0, 'rgba(230,200,122,0)');
      g.addColorStop(0.5, 'rgba(230,200,122,0.65)');
      g.addColorStop(1, 'rgba(230,200,122,0)');
      ctx.fillStyle = g;
      ctx.fillRect(cx - 22, lineY, 44, 1);
    });

    // 结局描述（可能很长，需滚动）
    var descTop = lineY + fs(22);
    ctx.font = fs(15.5) + 'px sans-serif';
    var descLines = R.wrapText(ctx, e.desc, maxW, fs(15.5));
    var lh = fs(15.5) * 2.05;

    // 底部按钮区高度，用于限制描述可视区域
    var btnW = Math.min(R.W - pad * 2, fs(290));
    var btnH = fs(50);
    var gap = fs(11);
    var btnCount = 3;
    var actionsTop = R.H - R.SAFE_BOTTOM - fs(26) - (btnH * btnCount + gap * (btnCount - 1));

    // 点击区始终注册
    R.hit('again', cx - btnW / 2, actionsTop, btnW, btnH);
    R.hit('collect', cx - btnW / 2, actionsTop + (btnH + gap), btnW, btnH);
    R.hit('library', cx - btnW / 2, actionsTop + (btnH + gap) * 2, btnW, btnH);

    var viewH = actionsTop - descTop - fs(20);
    var maxScroll = Math.max(0, descLines.length * lh - viewH);
    var scroll = 0;
    var offsetY = 0;

    var a4 = fadeIn(0.25, 0.6, function () {
      ctx.font = fs(15.5) + 'px sans-serif';
      ctx.fillStyle = '#cbc8d8';
      ctx.textBaseline = 'top';

      // 描述超出可视高度时可上下滑动查看
      if (maxScroll > 0) {
        offsetY = clampScroll(ctx, descTop, viewH, lh, descLines.length);
        R.hit('scroll', 0, descTop, R.W, viewH);
      } else {
        offsetY = 0;
      }

      var startIdx = Math.max(0, Math.floor(offsetY / lh));
      var endIdx = Math.min(descLines.length, Math.ceil((offsetY + viewH) / lh) + 1);
      for (var i = startIdx; i < endIdx; i++) {
        var y = descTop + i * lh - offsetY;
        ctx.fillText(descLines[i], pad, y);
      }
      return true;
    });

    // 收集进度（按当前剧本分区统计）
    var pkgId = this.pkg ? this.pkg.meta.id : null;
    var total = this.pkg ? this.pkg.ALL_ENDINGS.length : 0;
    var unlocked = Save.getUnlocked(pkgId).length;
    var statY = actionsTop - fs(28);
    var statText = unlocked >= total
      ? '你已看完全部结局'
      : '已解锁结局　' + unlocked + ' / ' + total;
    fadeIn(0.3, 0.6, function () {
      ctx.font = fs(12) + 'px sans-serif';
      ctx.fillStyle = '#8b8ba4';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.fillText(statText, cx, statY);
      ctx.textAlign = 'left';
    });

    // 按钮
    var a5 = Math.min(1, Math.max(0, (t - 0.35) / 0.6));
    if (a5 > 0) {
      ctx.save();
      ctx.globalAlpha = a5;
      ctx.translate(0, (1 - a5) * 12);

      var b1y = actionsTop;
      var g1 = ctx.createLinearGradient(cx - btnW / 2, 0, cx + btnW / 2, 0);
      g1.addColorStop(0, '#e6c87a');
      g1.addColorStop(1, '#b8912f');
      R.roundRectFill(cx - btnW / 2, b1y, btnW, btnH, 14, g1);
      ctx.font = 'bold ' + fs(16) + 'px sans-serif';
      ctx.fillStyle = '#1a1408';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('再 玩 一 次', cx, b1y + btnH / 2);

      var b2y = b1y + btnH + gap;
      R.roundRectFill(cx - btnW / 2, b2y, btnW, btnH, 14, 'rgba(255,255,255,0.07)');
      R.roundRectStroke(cx - btnW / 2, b2y, btnW, btnH, 14, 'rgba(230,200,122,0.30)', 1);
      ctx.font = fs(14.5) + 'px sans-serif';
      ctx.fillStyle = '#ddd6c2';
      ctx.fillText('查 看 结 局 图 鉴', cx, b2y + btnH / 2);

      var b3y = b2y + btnH + gap;
      R.roundRectFill(cx - btnW / 2, b3y, btnW, btnH, 14, 'rgba(255,255,255,0.045)');
      R.roundRectStroke(cx - btnW / 2, b3y, btnW, btnH, 14, 'rgba(230,200,122,0.20)', 1);
      ctx.font = fs(14) + 'px sans-serif';
      ctx.fillStyle = '#a89e8a';
      ctx.fillText('返 回 剧 集 库', cx, b3y + btnH / 2);
      ctx.textAlign = 'left';
      ctx.restore();
    }
  },

  onTap: function (id) {
    if (id === 'again') return 'game';
    if (id === 'collect') return 'collect';
    if (id === 'library') return 'toLibrary';   // 直接回剧集库（跳过剧情页）
    return null;
  }
};

/* 简单的触摸滚动辅助：由 engine 写入 touchY */
Ending.touchY = 0;

function clampScroll(ctx, top, viewH, lh, lineCount) {
  var max = Math.max(0, lineCount * lh - viewH);
  var v = Ending.touchY;
  return Math.max(0, Math.min(max, v));
}

module.exports = Ending;