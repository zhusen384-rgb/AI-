/**
 * 自动打招呼沟通智能体 - 常量配置
 */

import { Platform, PlatformStyle, HumanSimulationConfig, AutoReplyConfig, MatchWeights } from './types';

// ============================================================================
// 平台配置
// ============================================================================

/**
 * 平台风格配置
 */
export const PLATFORM_STYLES: Record<Platform, PlatformStyle> = {
  boss: {
    name: 'Boss直聘',
    tone: 'casual',
    maxLength: 150,
    emojiUsage: 'minimal',
    greetingStyle: '直接称呼',
    closingStyle: '简短收尾',
  },
  zhilian: {
    name: '智联招聘',
    tone: 'formal',
    maxLength: 200,
    emojiUsage: 'none',
    greetingStyle: '尊称',
    closingStyle: '礼貌结束',
  },
  liepin: {
    name: '猎聘',
    tone: 'professional',
    maxLength: 180,
    emojiUsage: 'minimal',
    greetingStyle: '专业称呼',
    closingStyle: '专业收尾',
  },
  '51job': {
    name: '前程无忧',
    tone: 'formal',
    maxLength: 200,
    emojiUsage: 'none',
    greetingStyle: '尊称',
    closingStyle: '礼貌结束',
  },
};

/**
 * 平台 URL 配置
 */
export const PLATFORM_URLS: Record<Platform, {
  baseUrl: string;
  candidateList: string;
  chatList: string;
}> = {
  boss: {
    baseUrl: 'https://www.zhipin.com',
    candidateList: 'https://www.zhipin.com/geek/job/recommend.html',
    chatList: 'https://www.zhipin.com/geek/chat/index.html',
  },
  zhilian: {
    baseUrl: 'https://www.zhaopin.com',
    candidateList: 'https://www.zhaopin.com/resume/recommend',
    chatList: 'https://www.zhaopin.com/chat',
  },
  liepin: {
    baseUrl: 'https://www.liepin.com',
    candidateList: 'https://www.liepin.com/resume/recommend',
    chatList: 'https://www.liepin.com/im',
  },
  '51job': {
    baseUrl: 'https://www.51job.com',
    candidateList: 'https://www.51job.com/resume/recommend',
    chatList: 'https://www.51job.com/chat',
  },
};

// ============================================================================
// 默认配置
// ============================================================================

/**
 * 默认真人模拟配置
 */
export const DEFAULT_HUMAN_SIMULATION_CONFIG: HumanSimulationConfig = {
  batchPauseCount: 10,
  batchPauseSeconds: 60,
  maxGreetings: 100,
  minDelaySeconds: 8,
  maxDelaySeconds: 25,
  workingHoursStart: '09:00',
  workingHoursEnd: '18:00',
  nightMinDelaySeconds: 30,
  nightMaxDelaySeconds: 60,
  nightStartTime: '22:00',
  nightEndTime: '08:00',
};

/**
 * 默认自动回复配置
 */
export const DEFAULT_AUTO_REPLY_CONFIG: AutoReplyConfig = {
  maxReplyLength: 120,
  maxRoundsNoResponse: 3,
  enableIntentDetection: true,
  requestContactAfterRounds: 3,
  replyDelayMin: 30,
  replyDelayMax: 90,
};

/**
 * 默认匹配权重
 */
export const DEFAULT_MATCH_WEIGHTS: MatchWeights = {
  skills: 0.4,       // 技能权重40%
  experience: 0.25,  // 经验权重25%
  education: 0.15,   // 学历权重15%
  keywords: 0.2,     // 关键词权重20%
};

// ============================================================================
// 时段活跃度配置
// ============================================================================

/**
 * 时段活跃度模式
 */
export const HOURLY_ACTIVITY_PATTERNS = [
  // 早晨：上班准备，活跃度低
  { hour: 8, activity: 20, greetingRange: { min: 1, max: 3 } },
  
  // 上午：高峰期
  { hour: 9, activity: 70, greetingRange: { min: 5, max: 10 } },
  { hour: 10, activity: 90, greetingRange: { min: 10, max: 15 } },  // 最高峰
  { hour: 11, activity: 85, greetingRange: { min: 8, max: 12 } },
  
  // 中午：休息时间
  { hour: 12, activity: 30, greetingRange: { min: 2, max: 5 } },
  { hour: 13, activity: 40, greetingRange: { min: 3, max: 6 } },
  
  // 下午：高峰期
  { hour: 14, activity: 85, greetingRange: { min: 8, max: 12 } },
  { hour: 15, activity: 80, greetingRange: { min: 7, max: 11 } },
  { hour: 16, activity: 75, greetingRange: { min: 6, max: 10 } },
  
  // 傍晚：逐渐降低
  { hour: 17, activity: 50, greetingRange: { min: 4, max: 7 } },
  { hour: 18, activity: 30, greetingRange: { min: 2, max: 4 } },
  
  // 晚间：低活跃
  { hour: 19, activity: 25, greetingRange: { min: 1, max: 3 } },
  { hour: 20, activity: 20, greetingRange: { min: 1, max: 2 } },
  { hour: 21, activity: 15, greetingRange: { min: 0, max: 2 } },
  
  // 夜间：休息
  { hour: 22, activity: 5, greetingRange: { min: 0, max: 1 } },
  { hour: 23, activity: 3, greetingRange: { min: 0, max: 1 } },
  
  // 凌晨：不活跃
  { hour: 0, activity: 0, greetingRange: { min: 0, max: 0 } },
  { hour: 1, activity: 0, greetingRange: { min: 0, max: 0 } },
  { hour: 2, activity: 0, greetingRange: { min: 0, max: 0 } },
  { hour: 3, activity: 0, greetingRange: { min: 0, max: 0 } },
  { hour: 4, activity: 0, greetingRange: { min: 0, max: 0 } },
  { hour: 5, activity: 0, greetingRange: { min: 0, max: 0 } },
  { hour: 6, activity: 5, greetingRange: { min: 0, max: 1 } },
  { hour: 7, activity: 15, greetingRange: { min: 1, max: 2 } },
];

// ============================================================================
// 模板变量
// ============================================================================

/**
 * 打招呼模板变量
 */
export const TEMPLATE_VARIABLES = [
  { name: '候选人姓名', description: '候选人姓名，如"张三"', required: false },
  { name: '岗位名称', description: '岗位名称，如"Java开发工程师"', required: true },
  { name: '匹配优势', description: '匹配的优势点，如"3年Java开发经验"', required: false },
  { name: '公司名称', description: '公司名称', required: false },
  { name: '工作地点', description: '工作地点，如"北京朝阳区"', required: false },
  { name: '薪资范围', description: '薪资范围，如"20K-35K"', required: false },
  { name: '岗位亮点', description: '岗位亮点，如"六险一金、弹性工作"', required: false },
];

// ============================================================================
// 问答库分类
// ============================================================================

/**
 * 问答库分类
 */
export const QA_CATEGORIES = [
  { value: '薪资福利', label: '薪资福利', description: '薪资、年终奖、五险一金等' },
  { value: '工作内容', label: '工作内容', description: '岗位职责、技术栈、团队规模等' },
  { value: '公司信息', label: '公司信息', description: '公司业务、规模、发展情况等' },
  { value: '工作时间', label: '工作时间', description: '工作时间、加班情况、调休等' },
  { value: '面试流程', label: '面试流程', description: '面试轮次、流程时间等' },
  { value: '入职相关', label: '入职相关', description: '试用期、入职时间等' },
  { value: '其他', label: '其他', description: '其他问题' },
];

// ============================================================================
// 意向等级说明
// ============================================================================

/**
 * 意向等级说明
 */
export const INTENT_LEVEL_DESCRIPTIONS = {
  A: {
    label: 'A级意向',
    description: '主动询问面试、愿意发简历、留联系方式',
    action: '转入待人工面试池',
  },
  B: {
    label: 'B级意向',
    description: '提问多、犹豫、需进一步了解',
    action: '继续自动沟通',
  },
  C: {
    label: 'C级意向',
    description: '敷衍回复、明确考虑中',
    action: '降低沟通频率',
  },
  D: {
    label: 'D级意向',
    description: '明确不考虑、不回复、恶意消息',
    action: '停止沟通，标记',
  },
};

// ============================================================================
// 知名公司列表
// ============================================================================

/**
 * 知名公司列表（用于匹配亮点）
 */
export const NOTABLE_COMPANIES = [
  // 互联网大厂
  '阿里巴巴', '腾讯', '百度', '字节跳动', '美团', '京东', '小米', '华为',
  '网易', '滴滴', '快手', '拼多多', '哔哩哔哩', '小红书', '新浪', '搜狐',
  
  // 金融科技
  '蚂蚁集团', '微众银行', '陆金所', '京东数科',
  
  // 外企
  'Google', 'Microsoft', 'Apple', 'Amazon', 'Meta', 'Netflix',
  '谷歌', '微软', '苹果', '亚马逊',
];

/**
 * 知名公司列表（别名，用于匹配引擎）
 */
export const WELL_KNOWN_COMPANIES = NOTABLE_COMPANIES;

/**
 * 薪资范围配置
 */
export const SALARY_RANGES: Record<string, { min: number; max: number }> = {
  '10k以下': { min: 0, max: 10 },
  '10-15k': { min: 10, max: 15 },
  '15-20k': { min: 15, max: 20 },
  '20-30k': { min: 20, max: 30 },
  '30-50k': { min: 30, max: 50 },
  '50k以上': { min: 50, max: 999 },
};

// ============================================================================
// 技能同义词映射
// ============================================================================

/**
 * 技能同义词映射
 */
export const SKILL_SYNONYMS: Record<string, string[]> = {
  'javascript': ['js', 'ecmascript'],
  'typescript': ['ts'],
  'react': ['reactjs', 'react.js'],
  'vue': ['vuejs', 'vue.js'],
  'node': ['nodejs', 'node.js'],
  'python': ['py'],
  'java': ['jdk'],
  'golang': ['go', 'go语言'],
  'kubernetes': ['k8s'],
  'machine learning': ['ml', '机器学习'],
  'deep learning': ['dl', '深度学习'],
  'artificial intelligence': ['ai', '人工智能'],
};

// ============================================================================
// 敏感词列表
// ============================================================================

/**
 * 基础敏感词列表（平台违规）
 */
export const SENSITIVE_WORDS_PLATFORM = [
  '微信转账', '支付宝转账', '红包', '返现',
  '加微信聊', '私下交易', '绕过平台',
];

/**
 * 敏感词列表（个人隐私）
 */
export const SENSITIVE_WORDS_PRIVACY = [
  '身份证号', '银行卡号', '密码',
];

// ============================================================================
// 风控阈值
// ============================================================================

/**
 * 风控阈值配置
 */
export const RISK_THRESHOLDS = {
  sendSuccessRateWarning: 85,        // 发送成功率低于 85% 警告
  sendSuccessRateCritical: 70,       // 发送成功率低于 70% 危险
  replyRateWarning: 15,              // 回复率低于 15% 警告
  replyRateCritical: 8,              // 回复率低于 8% 危险
  readNoReplyWarning: 40,            // 已读不回超过 40% 警告
  readNoReplyCritical: 60,           // 已读不回超过 60% 危险
  consecutiveFailuresWarning: 3,     // 连续失败 3 次警告
  consecutiveFailuresCritical: 5,    // 连续失败 5 次危险
};

// ============================================================================
// 钩子模板
// ============================================================================

/**
 * 钩子模板
 */
export const HOOK_TEMPLATES = {
  // 稀缺性钩子：强调独特经历
  scarcity: [
    '你这段{经历}挺少见的',
    '很少看到{经历}的候选人',
    '你的{经历}让我印象深刻',
    '{经历}这个方向很稀缺',
  ],
  
  // 相关性钩子：建立关联
  relevance: [
    '我们团队刚好在做{相关项目}',
    '这个岗位很契合你的{经历}',
    '看到你的{技能}经验，觉得很匹配',
    '你的背景和我们正在做的事情很相关',
  ],
  
  // 好奇心钩子：引发好奇
  curiosity: [
    '有个机会想和你聊聊',
    '看到你的履历，有个想法',
    '有个挺有意思的方向想了解你的看法',
    '在找{方向}方向的人才，正好看到你',
  ],
  
  // 利益钩子：直接价值
  benefit: [
    '薪资范围{薪资}，应该符合你的预期',
    '这个岗位的{亮点}很适合你',
    '团队{亮点}，对职业发展很有帮助',
    '{公司}正在快速发展，机会很多',
  ],
};

// ============================================================================
// 对话阶段配置
// ============================================================================

/**
 * 对话阶段配置
 */
export const STAGE_CONFIG = {
  ice_breaking: {
    name: '破冰',
    description: '引起注意，获得首次回复',
    maxRounds: 1,
    successIndicators: ['回复', '问问题', '表达兴趣'],
    failureIndicators: ['不回复', '敷衍'],
    nextStage: 'interest_building',
  },
  
  interest_building: {
    name: '建立兴趣',
    description: '让候选人对岗位产生兴趣',
    maxRounds: 3,
    successIndicators: ['询问详情', '表达兴趣', '问薪资福利'],
    failureIndicators: ['敷衍', '明确拒绝', '长时间不回复'],
    nextStage: 'screening',
  },
  
  screening: {
    name: '筛选',
    description: '确认候选人意向和匹配度',
    maxRounds: 3,
    successIndicators: ['确认意向', '提供信息', '愿意面试'],
    failureIndicators: ['不符合要求', '犹豫', '另有offer'],
    nextStage: 'conversion',
  },
  
  conversion: {
    name: '转化',
    description: '获取联系方式/简历，安排面试',
    maxRounds: 2,
    successIndicators: ['提供联系方式', '发送简历', '确认面试'],
    failureIndicators: ['拒绝提供', '需要考虑'],
    nextStage: null,
  },
};
