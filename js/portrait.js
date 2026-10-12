/**
 * 立绘层
 * 小游戏无 DOM 与 <video>，动态立绘无法播放，
 * 这里用静态立绘 + 交叉淡入 + Ken Burns 缓动模拟原网页的动态观感。
 *
 * 多剧本支持：角色表随剧本切换，图片按剧本 id 命名空间缓存，
 * 避免不同剧本出现同名角色 key 时互相覆盖。
 */

var CACHE = {};

/** 当前生效的角色表（由 useScript 注入） */
var CHARS = {};

/** 按剧本 id + 角色 key 缓存图片 */
function cacheKey(scriptId, key) {
  return (scriptId || 'default') + '/' + key;
}

function loadImage(scriptId, key) {
  var ck = cacheKey(scriptId, key);
  if (CACHE[ck]) return CACHE[ck];
  var c = CHARS[key];
  if (!c) return null;

  var img = wx.createImage();
  img.src = c.img;
  CACHE[ck] = { img: img, ready: false };
  img.onload = function () { CACHE[ck].ready = true; };
  img.onerror = function () { CACHE[ck].ready = false; };
  return CACHE[ck];
}

/** 预加载全部立绘，避免游戏中卡顿 */
function preload(scriptId, chars) {
  for (var k in chars) {
    if (Object.prototype.hasOwnProperty.call(chars, k)) loadImage(scriptId, k);
  }
}

var Portrait = {
  preload: preload,

  /** 当前剧本 id，图片缓存命名空间 */
  scriptId: null,

  /** 切换剧本：注入角色表并预加载 */
  useScript: function (scriptId, chars) {
    this.scriptId = scriptId;
    CHARS = chars || {};
    // 剧本切换时重置当前立绘状态
    this.current = null;
    this.prev = null;
    this.transitioning = false;
    this.kbTime = 0;
    preload(scriptId, CHARS);
  },

  /**
   * 绘制某个剧本中某角色的方形缩略图（剧本库封面用）
   * @param scriptId 剧本 id
   * @param key 角色 key
   */
  drawThumb: function (R, scriptId, key, x, y, w, h, radius) {
    var ctx = R.ctx;
    // 优先用当前剧本的角色表，否则临时查注册表
    var chars = CHARS;
    if (scriptId !== this.scriptId) {
      var Works = require('./works.js');
      var pkg = Works.byId(scriptId);
      chars = (pkg && pkg.meta.chars) || {};
    }

    var rec = loadImage(scriptId, key);
    if (!rec || !rec.ready || !chars[key]) {
      R.roundRectFill(x, y, w, h, radius || 10, 'rgba(255,255,255,0.04)');
      return false;
    }

    var img = rec.img;
    var s = Math.max(w / img.width, h / img.height);
    var dw = img.width * s, dh = img.height * s;
    // 缩略图关注面部，垂直对齐偏上
    ctx.save();
    R.roundRect(x, y, w, h, radius || 10);
    ctx.clip();
    ctx.drawImage(img, x + w / 2 - dw / 2, y + h * 0.1 - dh * 0.1, dw, dh);
    ctx.restore();
    return true;
  },

  current: null,
  prev: null,
  fade: 1,          // 当前立绘不透明度
  transition: 0,    // 过渡进度 0~1
  transitioning: false,
  kbTime: 0,        // Ken Burns 计时

  /**
   * 切换立绘
   * @param key 角色 key，传 null 或相同则不处理
   */
  set: function (key) {
    if (!key || key === this.current) return;
    var c = CHARS[key];
    if (!c) return;

    // 若正在过渡，把当前画面固化为 prev
    if (this.current && this.transitioning) {
      this.prev = this.current;
      this.fade = 1;
      this.transitioning = false;
    } else {
      this.prev = this.current;
    }

    loadImage(this.scriptId, key);
    this.current = key;
    this.transition = 0;
    this.transitioning = true;
    this.kbTime = 0;
  },

  update: function (dt) {
    if (this.transitioning) {
      this.transition += dt / 0.55;
      if (this.transition >= 1) {
        this.transition = 1;
        this.transitioning = false;
        this.prev = null;
      }
    }
    this.kbTime += dt;
  },

  name: function () {
    return this.current && CHARS[this.current] ? CHARS[this.current].name : '';
  },

  /**
   * 绘制立绘到指定区域（cover 铺满）
   */
  draw: function (R, x, y, w, h) {
    var ctx = R.ctx;

    // Ken Burns：18s 缓慢从 1.0 放大到 1.07
    var t = (this.kbTime % 18) / 18;
    var scale = 1 + 0.07 * t;

    var self = this;

    function paintOne(key, alpha) {
      if (!key) return;
      var rec = CACHE[cacheKey(self.scriptId, key)];
      if (!rec || !rec.ready) return;

      var img = rec.img;
      // cover 计算：区域本身已是全屏高度
      var scaleFit = Math.max(w / img.width, h / img.height) * scale;
      var dw = img.width * scaleFit;
      var dh = img.height * scaleFit;
      // 垂直对齐偏上（18%），保留头顶空间，底部由渐变压暗
      var dx = x + w / 2 - dw / 2;
      var dy = y + h * 0.18 - dh * 0.18;

      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.drawImage(img, dx, dy, dw, dh);
      ctx.restore();
    }

    // 旧立绘先淡出，新立绘淡入
    if (this.transitioning && this.prev) {
      paintOne(this.prev, Math.max(0, 1 - this.transition * 1.4));
    }
    paintOne(this.current, this.transitioning ? this.transition : 1);
  },

  /**
   * 统一明暗遮罩
   *
   * 旧实现是三段独立遮罩叠加（顶部渐变 + 底部渐变 + 恒定压暗层），
   * 每段边界处斜率突变，会在画面上形成可见的"明暗带"。
   * 这里改为**单条贯穿全屏的渐变**，色标处做平滑过渡，斜率处处连续。
   *
   * 曲线走向：顶部压暗(托HUD) → 中段最亮(人物面部) → 底部渐暗(融入文字区)
   */
  drawShade: function (R, x, y, w, h) {
    var ctx = R.ctx;

    var g = ctx.createLinearGradient(0, y, 0, y + h);
    //    stop   offset   alpha
    g.addColorStop(0.00, 'rgba(5,5,8,0.62)');    // 顶部压暗，承载 HUD
    g.addColorStop(0.10, 'rgba(5,5,8,0.34)');
    g.addColorStop(0.24, 'rgba(5,5,8,0.10)');
    g.addColorStop(0.42, 'rgba(6,6,10,0.06)');   // 中段最亮，留给人物面部
    g.addColorStop(0.56, 'rgba(6,6,10,0.30)');
    g.addColorStop(0.70, 'rgba(6,6,10,0.66)');
    g.addColorStop(0.82, 'rgba(6,6,10,0.90)');   // 文字区更暗，保证可读性
    g.addColorStop(0.92, 'rgba(6,6,10,0.97)');
    g.addColorStop(1.00, '#06060a');             // 底部完全融入文字区

    ctx.fillStyle = g;
    ctx.fillRect(x, y, w, h);
  },

  /** 标题/结局页用的整屏背景（居中偏上 cover） */
  drawBackground: function (R, key) {
    var rec = CACHE[cacheKey(this.scriptId, key)];
    if (!rec || !rec.ready) return false;

    var ctx = R.ctx;
    var img = rec.img;
    var t = (this.kbTime % 20) / 20;
    var scale = 1 + 0.07 * t;
    var scaleFit = Math.max(R.W / img.width, R.H / img.height) * scale;
    var dw = img.width * scaleFit;
    var dh = img.height * scaleFit;
    ctx.drawImage(img, R.W / 2 - dw / 2, R.H * 0.12 - dh * 0.12, dw, dh);
    return true;
  }
};

module.exports = Portrait;