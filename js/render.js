/**
 * 渲染基础层
 * 负责：canvas 初始化 / DPR 适配 / 中文换行排版 / 圆角矩形 / 渐变文字 / 触摸命中
 */

var R = {
  canvas: null,
  ctx: null,
  dpr: 1,
  W: 0,     // 逻辑宽度（CSS 像素）
  H: 0,     // 逻辑高度
  SAFE_TOP: 0,
  SAFE_BOTTOM: 0,

  init: function () {
    this.canvas = wx.createCanvas();
    this.ctx = this.canvas.getContext('2d');
    this.resize();
  },

  resize: function () {
    var info = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
    this.dpr = info.pixelRatio || 2;
    this.W = info.windowWidth;
    this.H = info.windowHeight;

    var safe = info.safeArea;
    if (safe) {
      this.SAFE_TOP = safe.top || 0;
      this.SAFE_BOTTOM = Math.max(0, (info.screenHeight - safe.bottom) || 0);
    } else {
      this.SAFE_TOP = 0;
      this.SAFE_BOTTOM = 0;
    }

    this.canvas.width = Math.round(this.W * this.dpr);
    this.canvas.height = Math.round(this.H * this.dpr);
  },

  /** 每帧开头调用，重置变换到逻辑坐标系 */
  begin: function () {
    var ctx = this.ctx;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.W, this.H);
  },

  /* ============ 绘图工具 ============ */

  fill: function (color) {
    this.ctx.fillStyle = color;
    this.ctx.fillRect(0, 0, this.W, this.H);
  },

  /**
   * 圆角矩形路径
   * 小游戏 Canvas 在部分低端机不支持 roundRect，故手动实现
   */
  roundRect: function (x, y, w, h, r) {
    var ctx = this.ctx;
    var rr = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.lineTo(x + w - rr, y);
    ctx.arcTo(x + w, y, x + w, y + rr, rr);
    ctx.lineTo(x + w, y + h - rr);
    ctx.arcTo(x + w, y + h, x + w - rr, y + h, rr);
    ctx.lineTo(x + rr, y + h);
    ctx.arcTo(x, y + h, x, y + h - rr, rr);
    ctx.lineTo(x, y + rr);
    ctx.arcTo(x, y, x + rr, y, rr);
    ctx.closePath();
  },

  roundRectFill: function (x, y, w, h, r, style) {
    this.roundRect(x, y, w, h, r);
    this.ctx.fillStyle = style;
    this.ctx.fill();
  },

  roundRectStroke: function (x, y, w, h, r, style, lw) {
    this.roundRect(x, y, w, h, r);
    this.ctx.strokeStyle = style;
    this.ctx.lineWidth = lw || 1;
    this.ctx.stroke();
  },

  /**
   * 金色渐变文字
   * 小游戏不支持 background-clip:text，故用竖直渐变近似
   */
  goldText: function (text, cx, y, fontSize, opts) {
    opts = opts || {};
    var ctx = this.ctx;
    var weight = opts.weight || 'bold';
    var chars = String(text).split('');
    ctx.font = weight + ' ' + fontSize + 'px sans-serif';
    ctx.textBaseline = 'top';

    // 逐字测量，计算总宽用于居中
    // 性能：goldText 在 draw() 里每帧都会被调用（标题是静态的），
    // 逐字 measureText 是纯浪费。按「文字+字重+字号」缓存测量结果。
    var mkey = weight + '|' + fontSize + '|' + text;
    var widths = this._goldW && this._goldW[mkey];
    var total;
    if (widths) {
      total = this._goldT[mkey];
    } else {
      total = 0;
      widths = [];
      for (var i = 0; i < chars.length; i++) {
        var w = ctx.measureText(chars[i]).width;
        widths.push(w);
        total += w;
      }
      if (!this._goldW) { this._goldW = {}; this._goldT = {}; }
      // 缓存条目上限，避免动态文字把表撑大
      if (Object.keys(this._goldW).length > 200) { this._goldW = {}; this._goldT = {}; }
      this._goldW[mkey] = widths;
      this._goldT[mkey] = total;
    }
    var x = opts.left !== undefined ? opts.left : cx - total / 2;

    var g = ctx.createLinearGradient(0, y, 0, y + fontSize);
    g.addColorStop(0, '#fffaf0');
    g.addColorStop(0.55, '#e6c87a');
    g.addColorStop(1, '#a8802a');
    ctx.fillStyle = g;
    if (opts.shadow) {
      ctx.shadowColor = 'rgba(0,0,0,0.85)';
      ctx.shadowBlur = 18;
      ctx.shadowOffsetY = 4;
    }
    for (var k = 0; k < chars.length; k++) {
      ctx.fillText(chars[k], x, y);
      x += widths[k];
    }
    if (opts.shadow) {
      ctx.shadowColor = 'transparent';
      ctx.shadowBlur = 0;
      ctx.shadowOffsetY = 0;
    }
    return total;
  },

  /**
   * 中文按字换行排版
   *
   * 性能：原实现每加一个字都 measureText(整行)，是 O(n²)，长段落（几百字）在真机上很慢。
   * 改为「只测量新增的那个字」并累加宽度，降为 O(n)。
   * 注意：之所以能这么改，是因为中文字体下整行宽度≈各字宽度之和（无 kerning 例外）；
   * 对中英混排也成立到可接受精度（英文用逐字宽近似，误差远小于一行）。
   * @returns {Array<string>} 行数组
   */
  wrapText: function (ctx, text, maxWidth, px) {
    ctx.font = px + 'px sans-serif';
    var lines = [];
    var para = String(text).split('\n');

    for (var p = 0; p < para.length; p++) {
      var chars = para[p].split('');
      var line = '';
      var lineW = 0;
      for (var i = 0; i < chars.length; i++) {
        var cw = ctx.measureText(chars[i]).width;
        if (lineW + cw > maxWidth && line.length > 0) {
          lines.push(line);
          line = chars[i];
          lineW = cw;
        } else {
          line += chars[i];
          lineW += cw;
        }
      }
      lines.push(line);
    }
    return lines;
  },

  /**
   * 带缩放的字号（以 375 宽为基准设计稿）
   * 注意：不能依赖 this，因为调用方会用 var fs = R.fontSize 解绑引用
   */
  fontSize: function (designPx) {
    return Math.round(designPx * (R.W / 375) * 10) / 10;
  },

  /* ============ 触摸 ============ */

  /**
   * 交互区域注册表，每帧重建，触摸时回查
   */
  regions: [],

  resetRegions: function () {
    this.regions.length = 0;
  },

  hit: function (id, x, y, w, h) {
    this.regions.push({ id: id, x: x, y: y, w: w, h: h });
  },

  hitTest: function (px, py) {
    // 倒序遍历，后绘制的在上层
    for (var i = this.regions.length - 1; i >= 0; i--) {
      var r = this.regions[i];
      if (px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h) {
        return r.id;
      }
    }
    return null;
  }
};

module.exports = R;