/**
 * 剧情页：立绘区 + 打字机台词 + 选项
 */

var R = require('../render.js');
var Portrait = require('../portrait.js');
var Works = require('../works.js');
var Save = require('../save.js');

var CHAR_SPEED = 42;      // 每字毫秒
var SCENE_FADE = 0.42;    // 场景切换黑场时长（秒）

var Game = {
  state: { ba: 0, xin: 0, mi: 0 },
  pkg: null,          // 当前剧本包
  scene: null,
  lines: [],
  lineIdx: 0,
  typed: 0,          // 当前句已显示字数
  typing: false,
  choices: [],       // 已渲染的选项 [{t, to, eff, y, h}]
  visualH: 0,
  ending: null,
  clock: 0,          // 场景内累计时间（秒）
  choicesBorn: 0,    // 选项生成时刻（场景内秒数）
  flashT: -1,        // 转场黑场计时，-1 表示未在转场
  locked: false,     // 已选定选项、正在转场：屏蔽输入，防止连点卡死
  switchTo: null,     // 转场完成后要切换到的场景名
  gotoScene: null,    // 转场完成后要载入的剧情节点

  /**
   * 进入剧情
   * @param scriptId 剧本 id；不传则沿用当前剧本（供"再玩一次"复用）
   */
  enter: function (scriptId) {
    var id = scriptId || (this.pkg && this.pkg.meta.id) || Works.PACKAGES[0].meta.id;
    this.pkg = Works.byId(id);
    if (!this.pkg) return;

    Portrait.useScript(this.pkg.meta.id, this.pkg.meta.chars);
    Save.setScript(this.pkg.meta.id);
    Save.markPlayed(this.pkg.meta.id);

    this.state = { ba: 0, xin: 0, mi: 0 };
    this.show(this.pkg.meta.start || 'start');
  },

  /* ============ 剧情推进 ============ */

  show: function (id) {
    var sc = this.pkg && this.pkg.STORY[id];
    if (!sc) return;
    this.scene = sc;
    this.lines = sc.text.slice();
    this.lineIdx = 0;
    this.typed = 0;
    this.typing = false;
    this.choices = [];
    this.ending = null;
    this.choicesBorn = 0;
    this.locked = false;   // 解锁，允许新场景接受输入
  },

  /** 开始播放新的一句 */
  nextLine: function () {
    if (this.typing) {
      this.finishTyping();
      return;
    }
    if (this.lineIdx >= this.lines.length) return;

    var idx = this.lineIdx++;
    if (this.scene.cast && this.scene.cast[idx]) {
      Portrait.set(this.scene.cast[idx]);
    }
    this.typed = 0;
    this.typing = true;
  },

  finishTyping: function () {
    if (!this.scene) return;
    this.typed = this.lines[this.lineIdx - 1].length;
    this.typing = false;
  },

  /** 所有台词结束 → 出选项或进结局 */
  afterLine: function () {
    if (this.lineIdx >= this.lines.length) {
      if (this.scene.ending) {
        this.ending = this.scene.ending;
        this.flashT = 0;
        this.switchTo = 'ending';
        this.gotoScene = null;
      } else if (this.scene.choices) {
        this.renderChoices(this.clock);
      }
    }
  },

  applyEff: function (eff) {
    if (!eff) return;
    for (var k in eff) {
      if (Object.prototype.hasOwnProperty.call(eff, k)) {
        this.state[k] = (this.state[k] || 0) + eff[k];
      }
    }
  },

  /** cond 为对象形式，如 {mi:2} 表示 mi>=2 */
  choiceVisible: function (c) {
    if (!c.cond) return true;
    for (var k in c.cond) {
      if (Object.prototype.hasOwnProperty.call(c.cond, k)) {
        if ((this.state[k] || 0) < c.cond[k]) return false;
      }
    }
    return true;
  },

  renderChoices: function (now) {
    var list = this.scene.choices || [];
    this.choicesBorn = typeof now === 'number' ? now : 0;
    this.choices = [];
    for (var i = 0; i < list.length; i++) {
      if (this.choiceVisible(list[i])) {
        this.choices.push({
          t: list[i].t,
          to: list[i].to,
          eff: list[i].eff,
          idx: this.choices.length
        });
      }
    }
  },

  /* ============ 更新 ============ */

  /**
   * 补完被中断的转场。
   * 场景：选完选项后 0.42s 转场期间退出（返回剧集库/图鉴），再回到剧情页。
   * 此时 gotoScene 还挂着但 flashT 已被复位，update() 不会再处理它，
   * 会导致页面卡死。这里立即完成跳转，恢复可玩状态。
   */
  resumePending: function () {
    this.flashT = -1;
    this.locked = false;

    if (this.gotoScene) {
      var to = this.gotoScene;
      this.gotoScene = null;
      this.show(to);            // show() 内部会 locked = false
      return;
    }
    // 若台词已播完却没有选项/结局（异常数据兜底），重新评估一次
    if (this.lineIdx >= this.lines.length && !this.typing && !this.choices.length) {
      this.afterLine();
    }
  },

  update: function (dt) {
    Portrait.update(dt);
    this.clock += dt;

    // 打字机
    if (this.typing && this.scene) {
      this.typed += (dt * 1000) / CHAR_SPEED;
      var len = this.lines[this.lineIdx - 1].length;
      if (this.typed >= len) {
        this.typed = len;
        this.typing = false;
        this.afterLine();
      }
    }

    // 转场黑场
    if (this.flashT >= 0) {
      this.flashT += dt;
      if (this.flashT >= SCENE_FADE) {
        this.flashT = -1;

        // 先在当前页完成节点跳转
        if (this.gotoScene) {
          var to = this.gotoScene;
          this.gotoScene = null;
          this.show(to);          // show() 内部会 locked = false
        }

        var target = this.switchTo;
        this.switchTo = null;
        this.locked = false;   // 转场结束，解除输入封锁
        if (target) return target;
      }
    }
    return null;
  },

  /* ============ 绘制 ============ */

  draw: function (t) {
    var ctx = R.ctx;
    var fs = R.fontSize;

    R.fill('#06060a');

    // ---- 立绘：铺满整屏，避免与文字区之间出现硬边 ----
    var vh = R.H;
    this.visualH = vh;
    Portrait.draw(R, 0, 0, R.W, vh);
    Portrait.drawShade(R, 0, 0, R.W, vh);

    // HUD
    ctx.font = fs(11.5) + 'px sans-serif';
    ctx.textBaseline = 'top';
    ctx.fillStyle = '#cfc9dd';
    ctx.textAlign = 'left';
    ctx.fillText(this.scene ? (this.scene.act || '') : '', fs(20), R.SAFE_TOP + fs(15));

    // 图鉴按钮
    var hbW = fs(52), hbH = fs(24);
    var hbX = R.W - fs(20) - hbW;
    var hbY = R.SAFE_TOP + fs(10);
    R.roundRectFill(hbX, hbY, hbW, hbH, 20, 'rgba(0,0,0,0.32)');
    R.roundRectStroke(hbX, hbY, hbW, hbH, 20, 'rgba(230,200,122,0.35)', 1);
    ctx.font = fs(11) + 'px sans-serif';
    ctx.fillStyle = '#e0c778';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('图 鉴', hbX + hbW / 2, hbY + hbH / 2);
    ctx.textAlign = 'left';
    R.hit('collect', hbX, hbY, hbW, hbH);

    // ---- 文本区 ----
    var showChoices = this.choices.length > 0;
    var stageBottom = showChoices ? R.H - this.choicesHeight() - R.SAFE_BOTTOM - fs(20) : R.H - R.SAFE_BOTTOM - fs(46);

    // 角色名：贴在台词区左上角，作为说话人标识
    var nm = Portrait.name();
    var nmY = R.H * 0.50;
    if (nm) {
      var nmA = Portrait.transitioning ? Math.min(1, Portrait.transition * 1.6) : 1;
      ctx.save();
      ctx.globalAlpha = nmA;
      ctx.font = 'bold ' + fs(15) + 'px sans-serif';
      ctx.textBaseline = 'top';
      var lineX = fs(26);
      ctx.fillStyle = '#b8912f';
      ctx.fillRect(lineX, nmY + fs(7), fs(16), 1);
      ctx.fillStyle = '#f0e3bd';
      ctx.fillText(nm, lineX + fs(26), nmY);
      ctx.restore();
    }

    if (this.scene && this.lineIdx > 0) {
      var full = this.lines[this.lineIdx - 1];
      var shown = full.slice(0, Math.floor(this.typed));
      var lineFS = fs(19);
      var lh = lineFS * 1.95;
      var maxW = R.W - fs(52);
      var lines = R.wrapText(ctx, shown, maxW, lineFS);

      // 台词区：角色名下方 ~ 台词底边（或选项区上方）
      var stageTop = nm ? nmY + fs(34) : R.H * 0.46;
      var blockH = lines.length * lh;
      var startY = stageTop + Math.max(0, (stageBottom - stageTop - blockH) / 2);

      ctx.font = lineFS + 'px sans-serif';
      ctx.fillStyle = '#f2f0f8';
      ctx.textBaseline = 'top';
      for (var i = 0; i < lines.length; i++) {
        ctx.fillText(lines[i], fs(26), startY + i * lh);
      }

      // 光标
      if (this.typing) {
        var blink = Math.floor(t / 0.45) % 2 === 0;
        if (blink) {
          var lastY = startY + (lines.length - 1) * lh;
          var lastW = ctx.measureText(lines[lines.length - 1] || '').width;
          ctx.fillStyle = '#e6c87a';
          ctx.fillRect(fs(26) + lastW + 2, lastY + fs(4), 2, lineFS * 0.9);
        }
      }
    }

    // ---- 选项 ----
    if (showChoices) this.drawChoices(this.clock);

    // ---- 点击继续提示 ----
    if (!showChoices && this.lineIdx < this.lines.length && !this.typing) {
      var pulse = 0.35 + 0.5 * (0.5 + 0.5 * Math.sin(t * 2.2));
      ctx.save();
      ctx.globalAlpha = pulse;
      ctx.font = fs(12) + 'px sans-serif';
      ctx.fillStyle = '#5a5a70';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.fillText('点 击 继 续', R.W / 2, R.H - R.SAFE_BOTTOM - fs(20));
      ctx.textAlign = 'left';
      ctx.restore();
    }

    // ---- 转场黑场 ----
    if (this.flashT >= 0) {
      var p = this.flashT / SCENE_FADE;
      var a = p < 0.5 ? p * 2 : (1 - p) * 2;
      ctx.fillStyle = 'rgba(5,5,8,' + Math.max(0, Math.min(1, a)).toFixed(3) + ')';
      ctx.fillRect(0, 0, R.W, R.H);
    }
  },

  choicesHeight: function () {
    var fs = R.fontSize;
    var h = 0;
    for (var i = 0; i < this.choices.length; i++) {
      h += fs(52) + fs(10);
    }
    return h + fs(6);
  },

  drawChoices: function (t) {
    var ctx = R.ctx;
    var fs = R.fontSize;
    var padX = fs(20);
    var btnW = R.W - padX * 2;
    var btnH = fs(52);
    var gap = fs(10);
    var self = this;

    var totalH = this.choices.length * btnH + (this.choices.length - 1) * gap;
    var startY = R.H - R.SAFE_BOTTOM - fs(18) - totalH;

    this.choices.forEach(function (c, i) {
      var y = startY + i * (btnH + gap);

      // 逐个淡入上移：choicesBorn 记录选项生成时刻（秒）
      var appear = Math.min(1, Math.max(0, (t - self.choicesBorn - c.idx * 0.065) / 0.45));
      if (appear <= 0) {
        c.y = y; c.h = btnH;
        return;
      }

      ctx.save();
      ctx.globalAlpha = appear;
      ctx.translate(0, (1 - appear) * 10);

      var g = ctx.createLinearGradient(0, y, 0, y + btnH);
      g.addColorStop(0, 'rgba(230,200,122,0.13)');
      g.addColorStop(1, 'rgba(230,200,122,0.05)');
      R.roundRectFill(padX, y, btnW, btnH, 14, g);
      R.roundRectStroke(padX, y, btnW, btnH, 14, 'rgba(230,200,122,0.32)', 1);

      ctx.font = fs(15.5) + 'px sans-serif';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#c8a24a';
      ctx.font = 'bold ' + fs(15.5) + 'px sans-serif';
      ctx.fillText(String.fromCharCode(65 + i) + '.', padX + fs(17), y + btnH / 2);
      ctx.font = fs(15.5) + 'px sans-serif';
      ctx.fillStyle = '#f4ecd8';

      // 选项文案也可能过长，做一次裁剪
      var label = c.t;
      var availW = btnW - fs(52);
      while (ctx.measureText(label).width > availW && label.length > 2) {
        label = label.slice(0, label.length - 1);
      }
      if (label !== c.t) label = label.slice(0, label.length - 1) + '…';
      ctx.fillText(label, padX + fs(40), y + btnH / 2);

      ctx.restore();
    });

    // 注册点击区
    for (var i = 0; i < this.choices.length; i++) {
      var yy = startY + i * (btnH + gap);
      R.hit('choice:' + i, padX, yy, btnW, btnH);
    }
  },

  /* ============ 交互 ============ */

  onTap: function (id) {
    // 转场进行中 / 已选定选项：屏蔽一切输入，避免连点把 flashT 反复清零
    if (this.flashT >= 0 || this.locked) return null;

    if (id === 'collect') return 'collect';

    if (id && id.indexOf('choice:') === 0) {
      var i = parseInt(id.slice(7), 10);
      var c = this.choices[i];
      if (c) {
        this.applyEff(c.eff);
        // 关键：立刻清空选项并上锁，否则选项在 0.42s 转场期间仍可点击，
        // 玩家连点会不断把 flashT 重置为 0，转场永远走不完 → 卡死
        this.choices = [];
        this.locked = true;
        this.flashT = 0;
        this.switchTo = null;
        this.gotoScene = c.to;
        return null;
      }
      return null;
    }

    // 其余区域：推进台词
    this.nextLine();
    return null;
  }
};

module.exports = Game;