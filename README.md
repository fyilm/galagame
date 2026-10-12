# 一念之间 · 互动短剧合集（微信小游戏）

多剧本互动短剧平台。每部剧本是独立可扩展的"作品包"，全部界面用 Canvas 2D 绘制。

## 导入方式

微信开发者工具 → 导入项目 → 目录选择本文件夹 → AppID 沿用原有。

## 换机 / 迁移

项目是**纯原生实现**，可整目录拷贝到任意机器直接运行：

- **零依赖**：无 `package.json`、无 `node_modules`，只用小游戏原生 API
- **全部相对路径**：素材路径写作 `images/...`，不含任何盘符或绝对路径
- **体积很小**：整包 733KB（代码 92KB + 素材 552KB）

**换机步骤**

1. 把整个目录拷过去（`project.private.config.json` 是本地配置，删掉也没关系，会自动重建）
2. 开发者工具导入该目录
3. AppID 选「使用测试号」或填自己的 AppID

**关于 AppID**：`project.config.json` 里已写入原 AppID（`wxdcec8cccb1ee43d8`）。
换机器时如果用同一个 AppID 且登录了有权限的微信号，可直接用；
否则选测试号即可运行，只是不能上传发布。**注意测试号无法上传、无法真机预览正式版**。

**关于存档**：`wx.setStorageSync` 的数据存在**用户设备上**，不随项目走。
换机后玩家进度会重置（除非换的是同一台手机）。若需跨设备同步，
要另接云开发或自建服务器 —— 目前是纯本地存档。

**跨平台**：macOS / Linux 同样可用，代码无任何平台相关调用。

## 页面结构

```
启动页  →  剧集库（载入页）  →  剧情页  →  结局页
              ↑                ↓         ↓
              └── 图鉴 ←────────┴─────────┘
```

- **启动页**：平台入口，展示作品总数与结局总数；有「继续」直达最近游玩的剧本
- **剧集库**：核心载入页，纵向卡片列表（封面/ 标题 / 类型 / 简介 / 结局收集进度），支持上下滚动
- **剧情页**：立绘 + 打字机台词 + 选项
- **结局页**：结局揭示，含「再玩一次 / 查看图鉴 / 返回剧集库」
- **结局图鉴**：按剧本分区展示

## 目录结构

```
├── game.js                    入口，拉起引擎
├── game.json                  竖屏配置
├── images/<剧本id>/           各剧本的立绘资源
└── js/
    ├── engine.js              场景管理 / 主循环 / 触摸分发 / 来源链
    ├── render.js              Canvas 适配 / 中文排版 / 圆角 / 渐变文字 / 命中检测
    ├── works.js               ★ 剧本注册表（新增剧本改这里）
    ├── script_duanju.js       剧本①：退婚后，我闪婚了首富
    ├── script_demo2.js        剧本②：逆风翻盘（示例，正式发布前可删）
    ├── portrait.js            立绘：交叉淡入 + Ken Burns + 缩略图
    ├── save.js                分区存档（按剧本 id 独立统计）
    └── screens/
        ├── title.js           启动页
        ├── library.js         ★ 剧集库（载入页）
        ├── game.js            剧情页
        ├── ending.js          结局页
        └── collect.js         结局图鉴
```

## 新增一部剧本

**两步：**

**1. 建 `js/script_<id>.js`**

```js
var CHARS = {
  heroine: { name: '苏晚', img: 'images/<剧本id>/heroine.jpg' }
};

var STORY = {
  start: {
    act: '第一幕 · 开端',
    cast: ['heroine'],              // 与 text 一一对应
    text: ['第一句台词。', '第二句台词。'],
    choices: [{ t: '选项文案', to: 'next', eff: { yi: 1 } }]
  },
  next: { /* ... */ },
  end_win: {
    act: '结局',
    cast: ['heroine'],
    text: ['结局前的最后一句。'],
    ending: {
      id: 'win', title: '结局名', tag: '爽 剧 本', bg: 'heroine',
      desc: '结局描述，支持 \n 换行'
    }
  }
};

var ALL_ENDINGS = /* 收集所有含 ending 的节点 */;

module.exports = {
  meta: {
    id: '<剧本id>',                  // 存档分区键，唯一
    title: '剧本标题',
    subtitle: '副标题',
    tag: '类型标签',                 // 卡片上的小标签
    cover: 'heroine',                // 封面角色
    coverChar: 'heroine',
    intro: '卡片简介文案',
    start: 'start',                  // 起始节点
    chars: CHARS
  },
  STORY: STORY,
  ALL_ENDINGS: ALL_ENDINGS
};
```

**2. 在 `js/works.js` 注册一行**

```js
PACKAGES: [
  require('./script_duanju.js'),
  require('./script_demo2.js'),
  require('./script_新剧本.js')      // 加这行
],
```

**完成。**剧集库会自动出现新卡片，存档自动独立分区，标题/结局/图鉴自动跟随当前剧本。

### 选项属性与条件

```js
{ t: '选项文案', to: '下一节点', eff: { 霸道: 1 }, cond: { 秘密: 2 } }
// cond 表示该属性达到阈值才显示；不同剧本可用不同属性名
```

## 平台限制

- **无 DOM**：`<img>/<video>/CSS` 全部不可用，排版均为 Canvas 手绘，中文按字换行
- **无法播放视频**：`wx.createVideo` 是小程序 API，小游戏无对应能力。
  动态立绘改用静态立绘 + 交叉淡入 + 缓慢推近
- **字体有限**：标题金渐变由 `background-clip:text` 改为逐字竖向渐变近似

## 已验证

- 17 场景跳转、cast/text 长度、角色引用全部有效；5 个结局均可达
- 多剧本 E2E：剧本切换、存档分区隔离、图鉴绑定当前剧本、返回链路、首页「继续」全部通过
- 遮罩曲线斜率跳变 0.00037（无明暗带）；四张立绘面部亮度极差 0.4（切换不跳变）