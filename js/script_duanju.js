/**
 * 剧本：退婚后，我闪婚了首富
 *
 * 每个剧本是一个自包含的"作品包"，导出统一格式供 works.js 注册。
 * cast 与 text 逐句对应，用于驱动画面切换。
 */

var CHARS = {
  suwan:  { name: '苏晚',img: 'images/duanju/suwan.jpg' },
  luchen: { name: '陆 沉',    img: 'images/duanju/luchen.jpg' },
  guyan:  { name: '顾延琛', img: 'images/duanju/guyan.jpg' },
  wanwan: { name: '苏晚晚', img: 'images/duanju/wanwan.jpg' }
};

var STORY = {
  /* ---------------- 第一幕 ---------------- */
  start: {
    act: '第一幕 · 订婚宴',
    cast: ['guyan', 'guyan', 'guyan', 'suwan'],
    text: [
      '订婚宴，水晶灯亮得刺眼。',
      '你的未婚夫顾延琛，牵着另一个女人的手，站上了台。',
      '「对不起。」他说，「我要娶的是晚晚。」',
      '满场哗然。所有人的目光，都落在你身上。'
    ],
    choices: [
      { t: '端起酒杯，泼他一脸', to: 'pour', eff: { ba: 1 } },
      { t: '笑着摘下戒指，祝他们幸福', to: 'graceful', eff: { xin: 1 } },
      { t: '掏出手机，拨通一个号码', to: 'call', eff: { mi: 1 } }
    ]
  },

  pour: {
    act: '第一幕 · 订婚宴',
    cast: ['guyan', 'wanwan', 'suwan', 'luchen'],
    text: [
      '你端起面前的香槟，毫不犹豫，泼了他一脸。',
      '苏晚晚尖叫：「你疯了！」',
      '你放下空杯：「不疯，怎么配得上你们这出好戏。」',
      '转身的瞬间——一个穿黑西装的男人，堵在门口。'
    ],
    choices: [
      { t: '绕过他，直接走', to: 'male' },
      { t: '抬头，直视他的眼睛', to: 'male', eff: { ba: 1 } }
    ]
  },

  graceful: {
    act: '第一幕 · 订婚宴',
    cast: ['suwan', 'suwan', 'suwan', 'luchen'],
    text: [
      '你笑了笑，把戒指摘下来，轻轻放在餐盘上。',
      '「祝你们幸福。」',
      '你转身离场。身后，是死一样的寂静。',
      '走出酒店大门，一辆黑色迈巴赫，恰好停在台阶下。'
    ],
    choices: [
      { t: '拉开车门坐进去', to: 'male' },
      { t: '当作没看见，继续往前走', to: 'male', eff: { xin: 1 } }
    ]
  },

  call: {
    act: '第一幕 · 订婚宴',
    cast: ['suwan', 'suwan', 'suwan', 'luchen'],
    text: [
      '你当着所有人的面，掏出手机，拨出一个号码。',
      '「陆先生。你的条件，我答应。」',
      '电话那头沉默了两秒，只回了三个字：「三分钟。」',
      '三分钟后，一辆迈巴赫停在酒店门口。全场哗然。'
    ],
    choices: [
      { t: '拉开车门，坐下', to: 'male', eff: { mi: 1 } }
    ]
  },

  male: {
    act: '第一幕 · 车里',
    cast: ['luchen', 'luchen', 'luchen', 'luchen'],
    text: [
      '车窗降下。',
      '一张过分好看的脸，正看着你。',
      '「上车。」他说。',
      '你认得他——三年前那场大雨里，你递过伞的那个人。'
    ],
    choices: [
      { t: '上车，什么也不问', to: 'car' },
      { t: '「你想从我这里得到什么？」', to: 'ask' },
      { t: '「先帮我演完这场戏。」', to: 'play' }
    ]
  },

  car: {
    act: '第一幕 · 车里',
    cast: ['luchen', 'luchen', 'luchen', 'luchen', 'luchen'],
    text: [
      '你上了车。车厢里很安静，只有空调的风声。',
      '「为什么帮我。」你问。',
      '「三年前，我问你要不要伞。」他说，「你说不用。」',
      '「然后你又说了一句——『那你站着。』」',
      '「我站了一整夜。」他偏过头看你，「从那一晚起，就没有别人了。」'
    ],
    choices: [
      { t: '「可我今天刚被退婚。」', to: 'act2a' },
      { t: '「陆沉，我不打算再谈恋爱。」', to: 'act2b' }
    ]
  },

  ask: {
    act: '第一幕 · 车里',
    cast: ['luchen', 'luchen', 'luchen', 'luchen'],
    text: [
      '「你想从我这里得到什么？」你盯着他。',
      '「一个答案。」他说，「三年前那把伞，为什么给我。」',
      '「因为你看起来，比我还冷。」你说。',
      '他笑了。那一笑，把整场订婚宴都比了下去。'
    ],
    choices: [
      { t: '上车', to: 'car' }
    ]
  },

  play: {
    act: '第一幕 · 宴会厅',
    cast: ['luchen', 'luchen', 'luchen', 'luchen'],
    text: [
      '「先帮我演完这场戏。」你说，「多少钱，随你开。」',
      '「我要的，你可能给不起。」',
      '他推开车门，径直走回宴会厅。',
      '十分钟后，顾氏集团的股价，跌停了。'
    ],
    choices: [
      { t: '跟上去', to: 'act2a' }
    ]
  },

  /* ---------------- 第二幕 ---------------- */
  act2a: {
    act: '第二幕 · 热搜',
    cast: ['suwan', 'suwan', 'suwan', 'guyan', 'suwan'],
    text: [
      '第二天，热搜炸了。',
      '第一条：「顾氏总裁订婚宴被当众退婚」',
      '第二条：「神秘黑衣男身份成谜」',
      '手机响了。是顾延琛。',
      '「苏晚，你到底傍上了谁？」'
    ],
    choices: [
      { t: '「不关你的事。」挂断', to: 'act2b' },
      { t: '「想知道？明天股东大会上见。」', to: 'act2c', eff: { ba: 1 } },
      { t: '把他的资料，群发给了所有媒体', to: 'act2c', eff: { xin: 1 } }
    ]
  },

  act2b: {
    act: '第二幕 · 深夜',
    cast: ['suwan', 'suwan', 'suwan', 'luchen', 'suwan'],
    text: [
      '你挂了电话。',
      '三分钟后，经纪人打了进来：「晚姐，十个剧组在排队找你，全是女一号。」',
      '你看着窗外，忽然觉得这三年，活得像个笑话。',
      '陆沉的声音从背后传来：「笑什么。」',
      '「笑我自己，终于醒了。」'
    ],
    choices: [
      { t: '「陆沉，我想开一家公司。」', to: 'act3', eff: { mi: 1 } },
      { t: '「你要的那个答案——我现在给你。」', to: 'act3', eff: { xin: 1 } },
      { t: '「算了，我想去一个没人认识我的地方。」', to: 'end_vanish' }
    ]
  },

  act2c: {
    act: '第二幕 · 股东大会',
    cast: ['suwan', 'suwan', 'guyan', 'suwan'],
    text: [
      '第二天，股东大会。',
      '你推门进去的时候，顾延琛正在台上讲话。',
      '「苏晚？」他愣住，「你怎么进来的。」',
      '你没说话，只是走到最前排，坐下了。'
    ],
    choices: [
      { t: '「顾延琛，你的位子，从今天起是我的。」', to: 'act3', eff: { ba: 1 } },
      { t: '「我来看看，你是怎么输的。」', to: 'act3', eff: { mi: 1 } }
    ]
  },

  /* ---------------- 第三幕 ---------------- */
  act3: {
    act: '第三幕 · 收网',
    cast: ['suwan', 'suwan', 'suwan', 'guyan', 'suwan'],
    text: [
      '轮到你发言。',
      '你站起来，环视全场。',
      '「三年前，顾氏差点破产，是我拿嫁妆填的窟窿。」',
      '「三个月前，你们把我踢出董事会。今天，我回来收账。」',
      '台下鸦雀无声。顾延琛的脸色，一寸一寸地白了下去。'
    ],
    choices: [
      { t: '「顺便介绍一下，这位是我的丈夫，陆沉。」', to: 'end_queen' },
      { t: '「我不需要任何人。包括陆沉。」', to: 'end_boss' },
      { t: '「陆沉，把三年前那份协议，念给大家听。」', to: 'end_true', cond: { mi: 2 } },
      { t: '「……导演，这条能过吗？」', to: 'end_sandbox' }
    ]
  },

  /* ---------------- 结局 ---------------- */
  end_queen: {
    act: '结局',
    cast: ['luchen'],
    text: ['你朝台下伸出手。'],
    ending: {
      id: 'queen', title: '首富太太', tag: '爽 结 局', bg: 'luchen',
      desc: '陆沉走上来，在所有人面前牵住你的手。「恭喜。」他说，「你现在是这家公司的大股东，也是我的太太。」\n\n镜头疯闪。你忽然明白，最好的复仇不是让他后悔，而是活得比谁都好。'
    }
  },

  end_boss: {
    act: '结局',
    cast: ['suwan'],
    text: ['当众，你松开了那只手。'],
    ending: {
      id: 'boss', title: '女王独美', tag: '大女主结局', bg: 'suwan',
      desc: '「陆沉，谢谢你。但这一次，我想自己走。」\n\n他一动不动地看了你很久，才说：「好。那我在终点等你。」\n\n三年后，你登上财经杂志封面。封面上只有一句话——她不需要骑士。'
    }
  },

  end_true: {
    act: '结局',
    cast: ['luchen'],
    text: ['陆沉站起来，念出了那份协议。'],
    ending: {
      id: 'true', title: '三年前那把伞', tag: '真 结 局', bg: 'luchen',
      desc: '三年前，他用全部身家，买下了顾氏三成的股份，只为了把它交到你手上。\n\n落款日期，是你递伞给他的第二天。\n\n「你早就……」你说不出话。「我说过。」他握紧你的手，「从那一晚起，就没有别人了。」'
    }
  },

  end_sandbox: {
    act: '结局',
    cast: ['guyan'],
    text: ['全场安静了三秒。'],
    ending: {
      id: 'sandbox', title: '其实这是短剧', tag: '隐 藏 结 局', bg: 'guyan',
      desc: '「卡——！」导演从监视器后面站起来，「过了过了！晚姐，这条绝了！」\n\n片场灯光亮起。顾延琛一边卸妆一边抱怨：「下次能不能别真泼，凉透了。」\n\n你回头，看见演陆沉的那位正冲你笑。——等等，他不是群演吗？'
    }
  },

  end_vanish: {
    act: '结局',
    cast: ['suwan'],
    text: ['你订了最早的一班机票。'],
    ending: {
      id: 'vanish', title: '人间蒸发', tag: '温 柔 结 局', bg: 'suwan',
      desc: '你飞去了一个没人认识你的南方小城。\n\n三个月后，海边多了一家小书店。\n\n某个下雨的下午，一个熟悉的身影推门进来，抖了抖伞上的水：「老板，借把伞？」\n\n你笑了。原来有些人，是躲不掉的。'
    }
  }
};

/* 收集全部结局，按剧本内顺序 */
var ALL_ENDINGS = (function () {
  var out = [];
  for (var k in STORY) {
    if (Object.prototype.hasOwnProperty.call(STORY, k) && STORY[k].ending) {
      out.push(STORY[k].ending);
    }
  }
  return out;
})();

/**
 * 作品包定义
 * meta.id     唯一标识（存档分区键）
 * meta.cover  封面图（用作品内的角色立绘即可）
 * meta.start  起始节点
 */
module.exports = {
  meta: {
    id: 'duanju',
    title: '退婚后，我闪婚了首富',
    subtitle: '一个结局由你决定的短剧',
    tag: '豪门 · 复仇',
    cover: 'suwan',
    coverChar: 'suwan',
    intro: '订婚宴上被当众退婚，一句「那就闪婚」之后的反击与心动。',
    start: 'start',
    chars: CHARS
  },
  STORY: STORY,
  ALL_ENDINGS: ALL_ENDINGS
};