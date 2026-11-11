export default {
  common: {
    home: '首页', writing: '文章', projects: '项目', about: '关于', search: '搜索文章',
    searchPlaceholder: '搜索标题、内容或标签…', searchHint: '输入关键词，发现一些想法',
    close: '关闭', theme: '切换主题', language: '切换语言', menu: '展开导航',
    all: '全部', read: '阅读全文', back: '返回文章列表', minute: '分钟阅读',
    articles: '篇文章', projectsUnit: '个项目', noResults: '暂时没有找到相关文章',
    noResultsHint: '换一个关键词，或者查看全部文章。', clear: '清除筛选',
    previous: '上一页', next: '下一页', page: '页', loading: '加载中…',
    error: '页面暂时无法加载', errorHint: '请稍后重试。', retry: '重新加载',
    notFound: '这里还没有留下足迹', notFoundHint: '这个页面不存在，或文章尚未发布。',
    goHome: '回到首页', skip: '跳转到主要内容', rss: 'RSS 订阅',
    email: '发邮件', source: '源代码', visit: '查看项目', code: '代码',
    copied: '已复制', copy: '复制代码', tableOfContents: '文章目录',
    updated: '更新于', published: '发布于', tags: '标签', noPosts: '第一篇文章，正在路上',
    noPostsHint: '新的想法将在这里慢慢积累。', noProjects: '新的项目正在酝酿中',
    footerNote: '记录思考，保持好奇。', built: '认真书写，持续构建。',
    online: '已上线', building: '开发中', archived: '已归档',
    draft: '草稿', featured: '精选', external: '在新窗口打开',
    // 全站真实双语切换，正文翻译不可用时明确告知读者保留了原文。
    switchToEnglish: '切换为英文', switchToChinese: '切换为中文', switchingLanguage: '正在切换语言…'
  },
  home: {
    journal: '一个开发者的数字花园', titleFirst: '在代码之外，', titleSecond: '留下思考的痕迹。',
    introduction: '关于技术、设计和独立开发。在这里记录构建的过程，也分享沿途的发现。',
    explore: '开始阅读', viewProjects: '看看我的项目', recent: '最近的思考',
    recentDescription: '把遇到的问题，变成可以分享的经验。', allWriting: '全部文章',
    pinned: '值得一读', aboutMe: '关于作者', moreAbout: '更多关于我',
    topics: '探索话题', building: '正在构建', allProjects: '全部项目',
    noteTitle: '慢一点，也没关系。', note: '比起追逐每一个新技术，我更想把手头的东西做好。',
    orbitLabel: '思考与构建，在此交汇', status: '持续学习 · 持续构建',
    latest: '最新文章', welcome: '欢迎来到我的一小块互联网。',
    profileGreeting: '你好，世界。', quietMotto: '少一些喧嚣，多一些思考。'
  },
  writing: {
    title: '文字，是思考的另一种形状。', description: '开发实践、技术笔记，以及一些不止于代码的思考。',
    archive: '文章归档', results: '搜索结果', found: '找到', reset: '查看全部文章',
    // 明示筛选状态，避免标签筛选后不清楚当前正在浏览的内容范围。
    categoryFilter: '按分类浏览', activeFilters: '当前筛选', removeFilter: '移除此筛选'
  },
  projects: {
    title: '从一个想法，到一个作品。', description: '一些认真做过的东西，一些正在发生的探索。',
    label: '项目实验室', stack: '使用技术', more: '项目详情',
    note: '这里记录作品的进展，也记录从零开始的过程。'
  },
  about: {
    title: '你好，很高兴在这里遇见你。', label: '关于这里',
    philosophy: '写下来，才能想清楚。', philosophyText: '这个博客用来保存实践中的经验、值得反复琢磨的问题，以及那些暂时没有答案的想法。希望其中的一点记录，也能对你有用。',
    now: '最近在做', connect: '保持联系', connectText: '欢迎交流技术、设计，或者一个有意思的想法。',
    example: '本站初始文章和项目为原创示例内容，可在管理后台替换为你的真实作品。',
    noContact: '作者暂未公开联系方式。', site: '关于这个站点', siteText: '一个专注于阅读和分享的个人博客，保持简单，持续生长。'
  },
  // 首页名片总览：先呈现身份、作品状态，再进入文章与能力。
  overview: {
    pageLabel: '个人名片与作品总览', released: '已上架', exploring: '开发中',
    noReleased: '新的作品正在准备中', noExploring: '下一次探索正在酝酿',
    directions: '技术方向', now: '最近在做', followWork: '看看最近的作品',
    moreAbout: '更多关于我', work: '近期项目', writing: '最新文章',
    capabilities: '能力与工具', noCapabilities: '能力与实践经验还在整理中。',
    purpose: '为什么写这个博客', connect: '联系我', github: 'GitHub',
    noPurpose: '博客初衷还在整理中。',
    // 能力直接展示具体技术，避免与技术方向、工具列表重复出现。
    skillOverview: '能力与技术',
    // 首页完整能力总览，按产品、设计、开发、交付串起用户提供的四个方向。
    capability: {
      title: 'AI 驱动的全栈产品构建能力',
      summary: 'AI × 产品 × 设计 × 开发 × 工程交付',
      product: {
        title: 'AI 产品能力',
        description: '需求分析、产品规划、功能定义、方案验证'
      },
      design: {
        title: 'AI 设计能力',
        description: '交互设计、UI/UX、原型构建、体验优化'
      },
      development: {
        title: 'AI 全栈开发能力',
        description: '前后端一体化开发、接口设计、数据管理、AI 辅助编程'
      },
      delivery: {
        title: 'AI 工程交付能力',
        description: '自动化测试、环境搭建、容器部署、上线迭代'
      },
      technologies: '常用技术'
    }
  }
};
