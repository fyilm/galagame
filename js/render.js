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
    var total = 0, i;
    var widths = [];
    for (i = 0; i < chars.length; i++) {
      var w = ctx.measureText(chars[i]).width;
      widths.push(w);
      total += w;
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
    for (i = 0; i < chars.length; i++) {
      ctx.fillText(chars[i], x, y);
      x += widths[i];
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
   * @returns {Array<string>} 行数组
   */
  wrapText: function (ctx, text, maxWidth, px) {
    ctx.font = px + 'px sans-serif';
    var lines = [];
    var para = String(text).split('\n');

    for (var p = 0; p < para.length; p++) {
      var chars = para[p].split('');
      var line = '';
      for (var i = 0; i < chars.length; i++) {
        var test = line + chars[i];
        if (ctx.measureText(test).width > maxWidth && line.length > 0) {
          lines.push(line);
          line = chars[i];
        } else {
          line = test;
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