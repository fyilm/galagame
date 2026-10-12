/**
 * 启动页（平台入口）
 *
 * 不绑定任何单个剧本，用抽象的金色光晕背景，
 * 展示作品集名称与总进度，引导进入剧本库。
 */

var R = require('../render.js');
var Works = require('../works.js');
var Save = require('../save.js');
var Portrait = require('../portrait.js');

function drawBackdrop(R, t) {
  var ctx = R.ctx;

  var bg = ctx.createLinearGradient(0, 0, 0, R.H);
  bg.addColorStop(0, '#171320');
  bg.addColorStop(0.45, '#0c0b13');
  bg.addColorStop(1, '#050508');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, R.W, R.H);

  // 两团缓慢呼吸的金色光晕，避免大片死黑
  function blob(cx, cy, r, color, phase) {
    var pulse = 1 + 0.12 * Math.sin(t * 0.5 + phase);
    var g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r * pulse);
    g.addColorStop(0, color);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, R.W, R.H);
  }

  blob(R.W * 0.5, R.H * 0.26, R.W * 0.72, 'rgba(190,150,70,0.20)', 0);
  blob(R.W * 0.18, R.H * 0.62, R.W * 0.55, 'rgba(120,95,170,0.13)', 1.8);
  blob(R.W * 0.86, R.H * 0.48, R.W * 0.45, 'rgba(180,120,90,0.09)', 3.2);
}

function countEndings() {
  var n = 0;
  var list = Works.PACKAGES || [];
  for (var i = 0; i < list.length; i++) {
    var ae = list[i].ALL_ENDINGS;
    n += ae ? ae.length : 0;
  }
  return n;
}

/**
 * 把断点场景换算成人能读懂的进度标签。
 *
 * 剧本每个场景都带 act 字段（如「第三幕 · 收网」），直接用它最准 ——
 * 比按场景 id 猜要可靠，也比显示一个内部 id 友好。
 */
function sceneLabel(pkg, sceneId) {
  var sc = pkg && pkg.STORY && pkg.STORY[sceneId];
  if (sc && sc.act) return sc.act;
  return '上次进度';
}

var Title = {
  enter: function () {
    // 兜底重算一次，避免引擎未调用 enter 时页面空白
    this.totalEndings = countEndings();
  },

  update: function (dt) {
    Portrait.updateStub(dt);
  },

  draw: function (t) {
    var ctx = R.ctx;
    var fs = R.fontSize;
    var cx = R.W / 2;

    // 提前取好数值，fadeIn 回调里的 this 不是 Title，不能用 this.xxx
    var pkgCount = (Works.PACKAGES || []).length;
    var totalEndings = (typeof this.totalEndings === 'number') ? this.totalEndings : countEndings();

    drawBackdrop(R, t);

    var topY = R.SAFE_TOP + fs(64);

    function fadeIn(delay, drawFn) {
      var a = Math.min(1, Math.max(0, (t - delay) / 0.8));
      if (a <= 0) return;
      ctx.save();
      ctx.globalAlpha = a;
      ctx.translate(0, (1 - a) * 12);
      drawFn();
      ctx.restore();
    }

    fadeIn(0.1, function () {
      ctx.font = fs(11.5) + 'px sans-serif';
      ctx.fillStyle = '#c9a94f';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText('互 动 短 剧 合 集', cx, topY);
      ctx.textAlign = 'left';
    });

    fadeIn(0.25, function () {
      R.goldText('一 念 之 间', cx, topY + fs(40), fs(38), { shadow: true });
    });

    fadeIn(0.4, function () {
      ctx.font = fs(13) + 'px sans-serif';
      ctx.fillStyle = '#b6b2c6';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText('每一个选择，都通向不同的结局', cx, topY + fs(96));
      ctx.textAlign = 'left';
    });

    // 分隔线
    var divY = topY + fs(136);
    fadeIn(0.5, function () {
      var g = ctx.createLinearGradient(cx - 30, 0, cx + 30, 0);
      g.addColorStop(0, 'rgba(230,200,122,0)');
      g.addColorStop(0.5, 'rgba(230,200,122,0.65)');
      g.addColorStop(1, 'rgba(230,200,122,0)');
      ctx.fillStyle = g;
      ctx.fillRect(cx - 30, divY, 60, 1);
    });

    // 剧集数量
    fadeIn(0.6, function () {
      ctx.font = fs(12) + 'px sans-serif';
      ctx.fillStyle = '#8b8ba4';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      var line = pkgCount + ' 部作品 · ' + totalEndings + ' 个结局';
      ctx.fillText(line, cx, divY + fs(20));
      ctx.textAlign = 'left';
    });

    // 主按钮：进入剧集库
    var btnW = Math.min(R.W - fs(60), fs(290));
    var btnH = fs(52);
    var btn1Y = divY + fs(58);

    R.hit('library', cx - btnW / 2, btn1Y, btnW, btnH);

    fadeIn(0.7, function () {
      var g1 = ctx.createLinearGradient(cx - btnW / 2, 0, cx + btnW / 2, 0);
      g1.addColorStop(0, '#e6c87a');
      g1.addColorStop(1, '#b8912f');
      R.roundRectFill(cx - btnW / 2, btn1Y, btnW, btnH, 14, g1);
      ctx.font = 'bold ' + fs(16) + 'px sans-serif';
      ctx.fillStyle = '#1a1408';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('剧 集 库', cx, btn1Y + btnH / 2);
      ctx.textAlign = 'left';
    });

    // 继续游玩：最近玩过的剧本
    var last = Save.lastPlayed();
    if (last) {
      var pkg = Works.byId(last);
      if (pkg) {
        // 关键：这里必须问一句「有没有真断点」。
        // 以前不管有没有断点都显示「继续」，点下去却从序幕重开 ——
        // 文案和行为对不上，玩家会以为存档丢了。
        var prog = Save.getProgress(pkg.meta.id, pkg.STORY || {});
        var ctaY = btn1Y + btnH + fs(13);
        var ctaH = fs(44);
        var unlocked = Save.count(last);

        if (prog) {
          var label = sceneLabel(pkg, prog.s);
          R.hit('continue:' + last, cx - btnW / 2, ctaY, btnW, ctaH);
          fadeIn(0.85, function () {
            R.roundRectFill(cx - btnW / 2, ctaY, btnW, ctaH, 12, 'rgba(255,255,255,0.06)');
            R.roundRectStroke(cx - btnW / 2, ctaY, btnW, ctaH, 12, 'rgba(230,200,122,0.26)', 1);
            ctx.font = fs(12.5) + 'px sans-serif';
            ctx.fillStyle = '#c8a24a';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('继续 · ' + pkg.meta.title, cx, ctaY + fs(16));
            ctx.fillStyle = '#6f6f85';
            ctx.font = fs(10.5) + 'px sans-serif';
            ctx.fillText(label + ' · 结局 ' + unlocked + ' / ' + pkg.ALL_ENDINGS.length,
                         cx, ctaY + fs(31));
            ctx.textAlign = 'left';
            ctx.textBaseline = 'top';
          });
        } else {
          // 没有断点（玩完了 / 从没玩过）：不要再写「继续」误导，
          // 改成明确的「重新开始」，行为也和文案一致。
          R.hit('restart:' + last, cx - btnW / 2, ctaY, btnW, ctaH);
          fadeIn(0.85, function () {
            R.roundRectFill(cx - btnW / 2, ctaY, btnW, ctaH, 12, 'rgba(255,255,255,0.04)');
            R.roundRectStroke(cx - btnW / 2, ctaY, btnW, ctaH, 12, 'rgba(255,255,255,0.12)', 1);
            ctx.font = fs(12.5) + 'px sans-serif';
            ctx.fillStyle = '#9a97ad';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('重新开始 · ' + pkg.meta.title, cx, ctaY + fs(16));
            ctx.fillStyle = '#6f6f85';
            ctx.font = fs(10.5) + 'px sans-serif';
            ctx.fillText('结局 ' + unlocked + ' / ' + pkg.ALL_ENDINGS.length,
                         cx, ctaY + fs(31));
            ctx.textAlign = 'left';
            ctx.textBaseline = 'top';
          });
        }
      }
    }

    // 页脚
    ctx.font = fs(11) + 'px sans-serif';
    ctx.fillStyle = '#5c5c70';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText('本剧纯属虚构 · 玩得开心', cx, R.H - R.SAFE_BOTTOM - fs(20));
    ctx.textAlign = 'left';
  },

  onTap: function (id) {
    if (id === 'library') return 'library';
    if (id && id.indexOf('continue:') === 0) {
      // 续玩：带上 resume 标记，由 Game.enter 决定从断点还是序幕开始
      return { play: id.slice(9), resume: true };
    }
    if (id && id.indexOf('restart:') === 0) {
      return { play: id.slice(8) };
    }
    return null;
  }
};

// 标题页不使用立绘，只推进光晕动画
Portrait.updateStub = function () {};

module.exports = Title;