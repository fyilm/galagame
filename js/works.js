/**
 * 剧本注册表
 *
 * 每个剧本是独立模块，导出 { meta, STORY, ALL_ENDINGS }。
 * 新增剧本只需：
 *   1. 建 js/script_<id>.js，按现有格式导出
 *   2. 在下方 PACKAGES 里加一行 require
 *
 * 存档按剧本 id 分区，各剧本的收集进度互不干扰。
 */

var Works = {
  /** 已注册的剧本包，按顺序展示在剧集库 */
  PACKAGES: [
    // 新增剧本：写好 js/script_<id>.js 后，在这里加一行
    require('./script_duanju.js')
  ],

  /** 已解锁的剧本 id 集合（留作后续做付费 / 进度门槛） */
  available: function () {
    var out = {};
    for (var i = 0; i < this.PACKAGES.length; i++) {
      out[this.PACKAGES[i].meta.id] = true;
    }
    return out;
  },

  byId: function (id) {
    for (var i = 0; i < this.PACKAGES.length; i++) {
      if (this.PACKAGES[i].meta.id === id) return this.PACKAGES[i];
    }
    return null;
  },

  /** 剧集库列表用的摘要信息 */
  list: function () {
    return this.PACKAGES.map(function (pkg) {
      return {
        id: pkg.meta.id,
        title: pkg.meta.title,
        subtitle: pkg.meta.subtitle,
        tag: pkg.meta.tag,
        intro: pkg.meta.intro,
        cover: pkg.meta.cover,
        coverChar: pkg.meta.coverChar,
        endingCount: pkg.ALL_ENDINGS.length
      };
    });
  }
};

module.exports = Works;