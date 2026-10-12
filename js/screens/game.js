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
  sceneId: null,      // 当前场景的 id（断点落盘要用）
  resumed: false,     // 本次进入是否来自断点续玩（供 UI 提示）
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
   * @param opts     { resume:true } 时尝试从段内断点接着玩；默认从头
   *
   * 断点是「停在哪句就接着哪句」：恢复的不只是场景 id，还有 ba/xin/mi
   * 三个数值 —— 少了数值，后半程的选项可见性与结局分流全会跑偏。
   */
  enter: function (scriptId, opts) {
    var id = scriptId || (this.pkg && this.pkg.meta.id) || Works.PACKAGES[0].meta.id;
    this.pkg = Works.byId(id);
    if (!this.pkg) return;

    Portrait.useScript(this.pkg.meta.id, this.pkg.meta.chars);
    Save.setScript(this.pkg.meta.id);
    Save.markPlayed(this.pkg.meta.id);

    // 复位所有「上一次游玩残留的瞬时状态」。
    //
    // 必须做这一步：玩到结局时 afterLine() 会把 flashT 置 0、switchTo 置
    // 'ending'，而 update() 里那条清 flashT 的分支要等转场跑完才执行 ——
    // 玩家在结局页点「再玩一次」时它俩还挂着。此时若不复位，
    // afterLine() 一进门就因 `flashT >= 0` 直接 return，新一局的第一幕
    // 永远出不来选项，表现为「重开后卡在第一幕，点不动」。
    this.flashT = -1;
    this.switchTo = null;
    this.gotoScene = null;
    this.locked = false;
    this.ending = null;
    this.choices = [];
    this.clock = 0;
    this.resumed = false;

    var story = this.pkg.STORY || {};
    var startId = this.pkg.meta.start || 'start';
    var wantResume = !!(opts && opts.resume);

    // 只在明确要求续玩时读断点。断点指向的场景若已不存在，
    // Save.getProgress 会返回 null，自动降级为从头开始。
    var p = wantResume ? Save.getProgress(this.pkg.meta.id, story) : null;
    var beginId = (p && p.s && story[p.s]) ? p.s : startId;

    this.state = p ? { ba: p.ba, xin: p.xin, mi: p.mi } : { ba: 0, xin: 0, mi: 0 };
    this.resumed = !!p;                 // 供 UI 显示「已回到上次进度」提示
    this.show(beginId);
  },

  /* ============ 剧情推进 ============ */

  show: function (id) {
    var sc = this.pkg && this.pkg.STORY[id];
    if (!sc) return;
    this.sceneId = id;
    this.scene = sc;
    this.lines = sc.text.slice();
    this.lineIdx = 0;
    this.typed = 0;
    this.typing = false;
    this.choices = [];
    this.ending = null;
    this.choicesBorn = 0;
    this.locked = false;   // 解锁，允许新场景接受输入

    this.persist();
  },

  /**
   * 落盘当前断点。
   *
   * 时机选在 show() —— 也就是「刚踏入一个新场景」的那一刻。
   * 这样断点的语义很清楚：下次续玩会从这一幕的第一句重新播，
   * 而不是停在某句台词播到一半的中间态（那种状态没有恢复价值，
   * 而且 lineIdx/typed 与打字机时序耦合，存了也难保证一致）。
   *
   * 结局/收束点不落盘：走到那里已经要出结局了，续玩没有意义。
   */
  persist: function () {
    if (!this.pkg || !this.sceneId) return;
    var sc = this.pkg.STORY[this.sceneId];
    if (!sc) return;
    if (sc.ending || sc.endings) return;   // 结局节点不写断点
    Save.saveProgress(this.pkg.meta.id, {
      s: this.sceneId,
      ba: this.state.ba || 0,
      xin: this.state.xin || 0,
      mi: this.state.mi || 0
    });
  },

  /** 开始播放新的一句；若已到最后一句，则收尾（出选项 / 进结局） */
  nextLine: function () {
    if (this.typing) {
      // 打字中点一下 = 立即显示完整这句。
      // 注意：这里必须调用 afterLine()！
      // 曾经只把 typing 置 false 就 return，导致「最后一句正在打字时点击」会
      // 卡死在 lineIdx=末尾、typing=false、choices=[] 的状态：
      //   选项永远不出现，之后每次点击都被 `lineIdx >= lines.length` 直接 return，
      //   表现为「画面停在最后一句，点击完全没反应」。
      this.finishTyping();
      this.afterLine();   // ← 关键：补完收尾，决定该出选项还是进结局
      return;
    }
    if (this.lineIdx >= this.lines.length) {
      // 台词已播完但收尾还没做（例如从后台回来、或上一步被中断）：
      // 再兜底一次，避免永久卡住。
      this.afterLine();
      return;
    }

    var idx = this.lineIdx++;
    if (this.scene.cast && this.scene.cast[idx]) {
      Portrait.set(this.scene.cast[idx]);
    }
    this.typed = 0;
    this.typing = true;
  },

  finishTyping: function () {
    if (!this.scene) return;
    if (this.lineIdx <= 0) return;   // 还没开始播任何台词，不能取 lines[-1]
    this.typed = this.lines[this.lineIdx - 1].length;
    this.typing = false;
  },

  /** 所有台词结束 → 出选项或进结局（幂等，可安全重复调用） */
  afterLine: function () {
    if (!this.scene) return;
    if (this.lineIdx < this.lines.length) return;   // 还有台词没播完
    if (this.choices.length) return;                // 选项已出，不要重复渲染
    if (this.flashT >= 0 || this.switchTo === 'ending') return;  // 转场已在进行

    // 结局判定：优先用「按数值分流」的 endings 规则表，
    // 这样多条路可以在同一个收束点，按 ba/xin/mi 落到不同结局，
    // 不必为每个结局单独建一个场景。
    var picked = this.pickEnding();
    if (picked) {
      this.ending = picked;
      this.flashT = 0;
      this.switchTo = 'ending';
      this.gotoScene = null;
      this.clearPersist();   // 已到结局，断点使命结束
      return;
    }

    if (this.scene.ending) {
      this.ending = this.scene.ending;
      this.flashT = 0;
      this.switchTo = 'ending';
      this.gotoScene = null;
      this.clearPersist();
    } else if (this.scene.choices) {
      this.renderChoices(this.clock);
    }
  },

  /**
   * 清除断点。达成结局时调用 —— 否则玩家下次点「继续」会被送回
   * 早已走过的收束点，直接又弹一次结局。
   */
  clearPersist: function () {
    if (!this.pkg) return;
    Save.clearProgress(this.pkg.meta.id);
  },

  /**
   * 按数值从 scene.endings 规则表里挑一个结局。
   *
   * 规则格式（数组，从上往下取第一条命中的）：
   *   endings: [
   *     { cond: { ba: 4, xin: 3 }, ending: {...} },   // 全部满足才命中
   *     { ending: {...} }                             // 兜底：无条件
   *   ]
   *
   * 没写 endings 时返回 null，走原来的 scene.ending 单结局逻辑。
   */
  pickEnding: function () {
    var rules = this.scene && this.scene.endings;
    if (!rules || !rules.length) return null;
    for (var i = 0; i < rules.length; i++) {
      if (this.condMet(rules[i].cond) && rules[i].ending) return rules[i].ending;
    }
    return null;
  },

  applyEff: function (eff) {
    if (!eff) return;
    for (var k in eff) {
      if (Object.prototype.hasOwnProperty.call(eff, k)) {
        this.state[k] = (this.state[k] || 0) + eff[k];
      }
    }
  },

  /**
   * 数值排序：把 ba/xin/mi 从大到小排，返回 {rank:{ba:0..2}, top, mid, low, spread}
   * 用于「相对画像」判定 —— 三幕下来数值会累到 30 上下，
   * 固定阈值（ba>=4）几乎恒真，只有相对高低才有区分度。
   */
  statProfile: function () {
    var ba = this.state.ba || 0, xin = this.state.xin || 0, mi = this.state.mi || 0;
    var arr = [{ k: 'ba', v: ba }, { k: 'xin', v: xin }, { k: 'mi', v: mi }];
    arr.sort(function (a, b) { return b.v - a.v; });
    var rank = {};
    for (var i = 0; i < 3; i++) rank[arr[i].k] = i;
    var top = arr[0].v, low = arr[2].v;
    return {
      ba: ba, xin: xin, mi: mi,
      rank: rank,                 // 0=最高 2=最低
      top: arr[0].k, mid: arr[1].k, low: arr[2].k,
      topV: top, midV: arr[1].v, lowV: low,
      spread: top - low           // 最大落差：越大说明取向越鲜明
    };
  },

  /**
   * 相对画像判定：cond.rel 形如
   *   { top: 'ba' }             该数值必须是三项里最高的
   *   { anyTop: ['ba','mi'] }   该数值在最高或次高（不能垫底）
   *   { low: 'xin' }            该数值必须是最低的
   *   { gap: 3 }                最高项比最低项至少高 3（取向够鲜明）
   *   { over: 'xin' }           相对比较：top 项要至少不低于 over 项
   * 多个键是「与」关系，可混用。
   */
  relMet: function (rel) {
    if (!rel) return true;
    var p = this.statProfile();
    if (rel.top && p.top !== rel.top) return false;
    if (rel.low && p.low !== rel.low) return false;
    if (rel.anyTop) {
      var ok = false;
      for (var i = 0; i < rel.anyTop.length; i++) {
        if (p.rank[rel.anyTop[i]] === 0) { ok = true; break; }
      }
      if (!ok) return false;
    }
    // notLow: 指定项不能垫底
    if (rel.notLow) {
      if (p.rank[rel.notLow] === 2) return false;
    }
    if (typeof rel.gap === 'number' && p.spread < rel.gap) return false;
    return true;
  },

  /**
   * 选项可见性判定。
   *
   * cond 支持四种写法，可混用：
   *   {mi: 2}                → mi >= 2            （至少）
   *   {ba: {max: 1}}         → ba <= 1            （至多，用于"温柔路线专属"）
   *   {ba: {min: 2, max: 4}} → 2 <= ba <= 4       （区间）
   *   {rel: {top:'ba'}}      → 霸气是三值里最高的  （相对画像）
   *
   * 需要上限的原因是：只写 "mi>=2" 时，数值很高的玩家会同时看到
   * "霸道路线"和"温情路线"两个互斥选项，分支就失去意义了。
   */
  condMet: function (cond) {
    if (!cond) return true;
    if (cond.rel) return this.relMet(cond.rel);
    for (var k in cond) {
      if (!Object.prototype.hasOwnProperty.call(cond, k)) continue;
      if (k === 'rel') continue;
      var v = this.state[k] || 0;
      var need = cond[k];
      if (typeof need === 'number') {
        if (v < need) return false;
      } else if (need && typeof need === 'object') {
        if (typeof need.min === 'number' && v < need.min) return false;
        if (typeof need.max === 'number' && v > need.max) return false;
      }
    }
    return true;
  },

  /** 兼容旧名：cond 为对象形式，如 {mi:2} 表示 mi>=2 */
  choiceVisible: function (c) {
    return this.condMet(c && c.cond);
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
   * 从别的页面（图鉴/剧集库）返回剧情页时，修复被中断的状态。
   *
   * 可能被中断的时机有三类，都必须处理，否则会卡死：
   *  1) 选完选项、0.42s 转场期间离开 → gotoScene 挂着但 flashT 已复位，
   *     update() 只在 flashT>=0 时处理 gotoScene，于是永远无人处理。
   *  2) 最后一句台词正在打字时离开 → typing=true，回来后若打字机没继续推进，
   *     选项/结局永远不会触发。
   *  3) 最后一句台词已播完、afterLine 还没执行就离开 → 选项永远不出现。
   *
   * 处理原则：复位转场锁 → 补完待跳转 → 重新评估"该出什么"。
   */
  resumePending: function () {
    // 结局转场正在进行（flashT>=0 且目标是 ending）：不要打断它，
    // 让它自然跑完并由 update() 返回 'ending'。若这里把 flashT 清零，
    // 转场永远走不完，玩家会永久卡在剧情页最后一帧。
    if (this.flashT >= 0 && this.switchTo === 'ending' && this.ending) {
      return;
    }

    // 保存可能被中断的「切到结局页」请求。注意不能直接清掉 switchTo，
    // 否则若中断发生在结局转场的 0.42s 内，update() 再也不会返回 'ending'。
    var pendingSwitch = this.switchTo;

    // 解除转场黑场，避免残留的 flashT 卡住输入
    this.flashT = -1;
    this.locked = false;
    this.switchTo = null;

    // 补完被中断的场景跳转
    if (this.gotoScene) {
      var to = this.gotoScene;
      this.gotoScene = null;
      this.show(to);            // show() 内部会 locked = false
      return;
    }

    // 结局页切屏被中断：重新发起，让 update() 能正常驱动转场
    if (pendingSwitch === 'ending' && this.ending) {
      this.flashT = 0;
      this.switchTo = 'ending';
      return;
    }

    if (!this.lines || !this.lines.length) return;

    // 台词正打到一半：立即补完，避免依赖打字机继续跑（可能因 dt 异常停住）
    if (this.typing) {
      this.typed = this.lines[this.lineIdx - 1].length;
      this.typing = false;
    }

    // 台词已全部播完，重新评估该出选项还是进结局（afterLine 内部幂等）
    this.afterLine();
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

    // 自愈兜底：台词播完了、既没选项也没在转场 —— 说明收尾被漏掉了
    // （打字机与点击同一帧竞争、或从中断状态恢复时都可能发生）。
    // 不做这个兜底的话，玩家会永久卡在最后一句、点哪都没反应。
    if (!this.typing && !this.choices.length && !this.ending &&
        this.lines.length && this.lineIdx >= this.lines.length && this.flashT < 0) {
      this.afterLine();
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

    // 续玩提示：进入后的头几秒淡出，让玩家知道「接着上次」生效了。
    // 没有这个提示时，玩家从第三幕被丢回来会以为程序出错了。
    if (this.resumed) {
      var hp = this.clock;
      if (hp < 3.2) {
        var ha = hp < 2.2 ? 1 : Math.max(0, (3.2 - hp) / 1.0);
        ctx.globalAlpha = ha;
        ctx.font = fs(11) + 'px sans-serif';
        ctx.fillStyle = '#e0c778';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.fillText('· 已回到上次进度', fs(20), R.SAFE_TOP + fs(15) + fs(17));
        ctx.globalAlpha = 1;
      }
    }

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

  /**
   * 选项按钮的尺寸（随选项数量自适应，保证小屏也不挤爆台词区）。
   *
   * 4 个选项在 667 高的小屏上，按固定 52 会只剩 36px 台词区（约半行），
   * 所以超过 3 个时逐级压缩按钮高度与间距，并给台词区留至少 2 行。
   */
  choiceMetrics: function () {
    var fs = R.fontSize;
    var n = this.choices.length || 1;
    var btnH, gap;
    if (n <= 3) { btnH = fs(52); gap = fs(10); }
    else if (n === 4) { btnH = fs(46); gap = fs(8); }
    else { btnH = fs(42); gap = fs(7); }

    // 兜底：确保台词区至少能放下 2 行
    var lineFS = fs(19);
    var minStage = lineFS * 1.95 * 2;
    var stageTop = R.H * 0.50 + fs(34);
    var maxChoicesH = R.H - R.SAFE_BOTTOM - fs(20) - stageTop - minStage;
    while (btnH > fs(34) && (n * btnH + (n - 1) * gap + fs(6)) > maxChoicesH) {
      btnH -= fs(2);
      gap = Math.max(fs(4), gap - fs(1));
    }
    return { btnH: btnH, gap: gap };
  },

  choicesHeight: function () {
    var fs = R.fontSize;
    var m = this.choiceMetrics();
    return this.choices.length * m.btnH + Math.max(0, this.choices.length - 1) * m.gap + fs(6);
  },

  drawChoices: function (t) {
    var ctx = R.ctx;
    var fs = R.fontSize;
    var padX = fs(20);
    var btnW = R.W - padX * 2;
    var m = this.choiceMetrics();
    var btnH = m.btnH;
    var gap = m.gap;
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

      // 选项多时字号同步收一点，长文案才放得下
      var n = self.choices.length;
      var labelFS = n <= 3 ? fs(15.5) : (n === 4 ? fs(14.5) : fs(13.5));

      ctx.font = 'bold ' + labelFS + 'px sans-serif';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#c8a24a';
      ctx.fillText(String.fromCharCode(65 + i) + '.', padX + fs(17), y + btnH / 2);
      ctx.font = labelFS + 'px sans-serif';
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
  },

  /**
   * 供引擎在 onHide（切后台 / 可能被回收）时调用，主动落盘一次。
   *
   * 平时靠 show() 落盘已经够用，但有一个缝隙：玩家在某个场景里
   * 连点推进台词时被切走，此时场景没变、数值没变，断点也仍然有效，
   * 所以这里主要是「把内存里最新的数值兜住」。
   */
  saveNow: function () {
    this.persist();
  }
};

module.exports = Game;