/**
 * 自动打招呼沟通智能体 - 类型定义
 * 
 * 包含所有模块的核心类型定义
 */

// ============================================================================
// 平台相关类型
// ============================================================================

/**
 * 支持的招聘平台
 */
export type Platform = 'boss' | 'zhilian' | 'liepin' | '51job';

/**
 * 平台风格配置
 */
export interface PlatformStyle {
  name: string;
  tone: 'casual' | 'formal' | 'professional';  // 语气风格
  maxLength: number;              // 单条消息最大长度
  emojiUsage: 'none' | 'minimal' | 'moderate'; // 表情使用程度
  greetingStyle: string;           // 称呼风格
  closingStyle: string;            // 结束语风格
}

// ============================================================================
// 岗位配置相关类型
// ============================================================================

/**
 * 岗位要求
 */
export interface JobRequirements {
  skills: string[];               // 技能要求，如 ["Java", "Spring Boot", "MySQL"]
  experience: {                   // 经验要求
    min: number;                  // 最少年限
    max?: number;                 // 最多年限（可选）
  };
  education: string[];            // 学历要求，如 ["本科", "硕士"]
  age?: {                         // 年龄要求（可选）
    min?: number;
    max?: number;
  };
  keywords: string[];             // 其他关键词
}

/**
 * 真人模拟配置
 */
export interface HumanSimulationConfig {
  batchPauseCount: number;        // 每打招呼N人后暂停
  batchPauseSeconds: number;      // 暂停秒数
  maxGreetings: number;           // 单个任务最大打招呼数量
  minDelaySeconds: number;        // 最小延迟
  maxDelaySeconds: number;        // 最大延迟
  workingHoursStart: string;      // 工作开始时间
  workingHoursEnd: string;        // 工作结束时间
  nightMinDelaySeconds: number;   // 夜间最小延迟
  nightMaxDelaySeconds: number;   // 夜间最大延迟
  nightStartTime: string;         // 夜间开始时间，如 "22:00"
  nightEndTime: string;           // 夜间结束时间，如 "08:00"
}

/**
 * 自动回复配置
 */
export interface AutoReplyConfig {
  maxReplyLength: number;         // 单次回复最大字数
  maxRoundsNoResponse: number;    // 连续无效沟通轮数
  enableIntentDetection: boolean; // 是否开启意向检测
  requestContactAfterRounds: number; // 多少轮后请求联系方式
  replyDelayMin: number;          // 最小回复延迟（秒）
  replyDelayMax: number;          // 最大回复延迟（秒）
}

/**
 * 岗位统计数据
 */
export interface JobStats {
  totalGreeted: number;           // 已打招呼总数
  totalReplied: number;           // 已回复总数
  totalHighIntent: number;        // 高意向总数
  totalResumeReceived: number;    // 收到简历总数
  totalContactReceived: number;   // 收到联系方式总数
  lastStatUpdate: string;         // 最后更新时间
}

/**
 * 岗位配置（完整）
 */
export interface JobPosition {
  id: string;
  // 基本信息
  name: string;                   // 岗位名称
  department?: string;            // 所属部门
  location: string;               // 工作地点
  salaryMin: number;              // 最低薪资（K）
  salaryMax: number;              // 最高薪资（K）
  
  // 岗位要求
  requirements: JobRequirements;
  
  // 岗位亮点
  highlights: string[];
  
  // 公司信息
  companyIntro?: string;          // 公司简介
  companySize?: string;           // 公司规模
  companyIndustry?: string;       // 所属行业
  
  // 平台配置
  targetPlatforms: Platform[];
  
  // 匹配配置
  matchThreshold: number;         // 匹配度阈值（0-100）
  
  // 二次打招呼配置
  secondGreetingEnabled: boolean;
  secondGreetingDelayHours: number; // 首次打招呼后多少小时触发
  
  // 真人模拟配置
  humanSimulation: HumanSimulationConfig;
  
  // 自动回复配置
  autoReplyConfig: AutoReplyConfig;
  
  // 状态
  status: 'active' | 'paused' | 'archived';
  pausedReason?: string;
  
  // 统计数据
  stats: JobStats;
  
  // 审计字段
  createdById?: string;
  createdByName?: string;
  createdAt: Date;
  updatedAt: Date;
}

// ============================================================================
// 话术模板相关类型
// ============================================================================

/**
 * 打招呼模板类型
 */
export type GreetingType = 'first' | 'second';

/**
 * 模板变量
 */
export interface TemplateVariable {
  name: string;
  description: string;
  required: boolean;
}

/**
 * 打招呼模板
 */
export interface GreetingTemplate {
  id: string;
  jobId: string;
  type: GreetingType;             // 'first' | 'second'
  platform: Platform | 'all';     // 适用平台
  template: string;               // 模板内容
  variables: TemplateVariable[];  // 变量说明
  isActive: boolean;
  useCount: number;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * 问答库分类
 */
export type QACategory = '薪资福利' | '工作内容' | '公司信息' | '工作时间' | '面试流程' | '入职相关' | '其他';

/**
 * 关键词匹配方式
 */
export type MatchType = 'exact' | 'contains' | 'fuzzy';

/**
 * 触发关键词配置
 */
export interface TriggerKeywords {
  keywords: string[];
  matchType: MatchType;
}

/**
 * 平台专属回答
 */
export interface PlatformAnswer {
  platform: Platform;
  answer: string;
}

/**
 * 问答库条目
 */
export interface QALibraryItem {
  id: string;
  jobId?: string;                 // null 表示全局通用
  category: QACategory;
  triggerKeywords: TriggerKeywords;
  questionExamples: string[];     // 问题示例
  answer: string;                 // 回答内容
  platformAnswers?: PlatformAnswer[]; // 平台适配回答
  priority: number;               // 优先级（数字越小优先级越高）
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// ============================================================================
// 候选人沟通相关类型
// ============================================================================

/**
 * 沟通状态
 */
export type CommunicationStatus = 
  | '待打招呼'
  | '已打招呼'
  | '沟通中'
  | '高意向'
  | '已获取简历'
  | '已获取联系方式'
  | '已拒绝'
  | '无效沟通'
  | '已转入人工';

/**
 * 意向等级
 */
export type IntentLevel = 'A' | 'B' | 'C' | 'D';

/**
 * 候选人信息
 */
export interface CandidateInfo {
  age?: number;
  gender?: string;
  education?: string;
  currentCompany?: string;
  currentPosition?: string;
  experience?: number;            // 工作年限
  skills?: string[];
  expectedSalary?: string;
  currentCity?: string;
  jobStatus?: string;             // 求职状态
  resumeKeywords?: string[];      // 简历关键词
}

/**
 * 匹配原因
 */
export interface MatchReasons {
  matched: string[];              // 匹配项
  unmatched: string[];            // 未匹配项
  highlights: string[];           // 亮点
}

/**
 * 沟通统计
 */
export interface CommunicationStats {
  hrMessageCount: number;         // HR发送消息数
  candidateMessageCount: number;  // 候选人发送消息数
  effectiveRounds: number;        // 有效对话轮数
  lastEffectiveRoundTime: string | null; // 最后有效对话时间
}

/**
 * 获取到的信息
 */
export interface ReceivedInfo {
  resumeFileUrl?: string;         // 简历文件URL
  resumeParsedData?: any;         // 解析后的简历数据
  wechat?: string;                // 微信号
  phone?: string;                 // 电话
  email?: string;                 // 邮箱
  receivedAt?: string;            // 接收时间
}

/**
 * 候选人沟通记录
 */
export interface CandidateCommunication {
  id: string;
  jobId: string;
  
  // 候选人基础信息
  name?: string;
  platform: Platform;
  platformUserId: string;         // 平台用户ID
  platformNickname?: string;      // 平台昵称
  platformAvatarUrl?: string;     // 平台头像URL
  
  // 候选人简历信息
  candidateInfo?: CandidateInfo;
  
  // 匹配信息
  matchScore?: number;
  matchReasons?: MatchReasons;
  
  // 沟通状态
  status: CommunicationStatus;
  intentLevel?: IntentLevel;
  
  // 时间记录
  firstGreetingTime?: Date;
  firstGreetingMessageId?: string;
  lastMessageTime?: Date;
  lastHrMessageTime?: Date;
  lastCandidateMessageTime?: Date;
  secondGreetingSent: boolean;
  secondGreetingTime?: Date;
  
  // 沟通统计
  communicationStats: CommunicationStats;
  
  // 获取到的信息
  receivedInfo?: ReceivedInfo;
  
  // 标签
  tags: string[];
  
  // 人工介入标记
  manualIntervene: boolean;
  manualInterveneReason?: string;
  manualInterveneTime?: Date;
  
  // 黑名单标记
  isBlacklisted: boolean;
  blacklistReason?: string;
  
  createdAt: Date;
  updatedAt: Date;
}

// ============================================================================
// 消息相关类型
// ============================================================================

/**
 * 消息发送者
 */
export type MessageSender = 'hr' | 'candidate' | 'system';

/**
 * 消息类型
 */
export type MessageType = 
  | 'text' 
  | 'greeting' 
  | 'greeting_second' 
  | 'request_contact' 
  | 'file' 
  | 'image';

/**
 * 消息发送方式
 */
export type SendMethod = 'auto' | 'manual';

/**
 * 消息状态
 */
export type MessageStatus = 'pending' | 'sent' | 'delivered' | 'failed';

/**
 * 附件
 */
export interface Attachment {
  type: string;
  url: string;
  name: string;
  size?: number;
}

/**
 * AI 分析结果
 */
export interface AIAnalysis {
  intent?: string;                // 意图
  sentiment?: 'positive' | 'neutral' | 'negative'; // 情感
  keywords?: string[];            // 关键词
  matchedQA?: string;             // 匹配的问答ID
  shouldIntervene?: boolean;      // 是否需要人工介入
  intentLevel?: IntentLevel;      // 意向等级
}

/**
 * 消息记录
 */
export interface Message {
  id: string;
  communicationId: string;
  
  // 消息基本信息
  sender: MessageSender;
  content: string;
  
  // 消息类型
  messageType: MessageType;
  
  // 发送方式
  sendMethod?: SendMethod;
  isAuto: boolean;
  
  // 关联的模板
  templateId?: string;
  
  // 发送状态
  status: MessageStatus;
  sendTime?: Date;
  platformMessageId?: string;
  
  // 附件信息
  attachments?: Attachment[];
  
  // AI 分析结果
  aiAnalysis?: AIAnalysis;
  
  createdAt: Date;
}

// ============================================================================
// 匹配引擎相关类型
// ============================================================================

/**
 * 候选人档案
 */
export interface CandidateProfile {
  name?: string;
  title?: string;                  // 职位名称
  skills?: string[];
  workYears?: number;              // 工作年限
  experience?: number;
  education?: string;
  age?: number;
  currentCompany?: string;
  currentPosition?: string;
  workHistory?: Array<{            // 工作经历
    companyName: string;
    position?: string;
    duration?: string;
  }>;
  resumeKeywords?: string[];
  expectedSalary?: {               // 期望薪资
    min: number;
    max: number;
  } | string;
  location?: string;               // 当前城市
  currentCity?: string;
  willingToRelocate?: boolean;     // 是否愿意搬迁
  intentLevel?: 'high' | 'medium' | 'low' | 'unknown'; // 求职意向等级
}

/**
 * 匹配因素分数
 */
export interface MatchFactors {
  skills: number;                  // 技能匹配分
  experience: number;              // 经验匹配分
  location: number;                // 地域匹配分
  salary: number;                  // 薪资匹配分
  intent: number;                  // 意向匹配分
}

/**
 * 匹配结果详情
 */
export interface MatchResultDetails {
  skillScore: number;             // 技能匹配分
  experienceScore: number;        // 经验匹配分
  educationScore: number;         // 学历匹配分
  keywordScore: number;           // 关键词匹配分
}

/**
 * 匹配结果
 */
export interface MatchResult {
  matched: boolean;                // 是否匹配
  score: number;                   // 总分 (0-100)
  factors: MatchFactors;           // 各维度分数
  reasons: string[];               // 匹配原因
  templateVariables: Record<string, string>; // 模板变量
}

/**
 * 匹配权重配置
 */
export interface MatchWeights {
  skills: number;         // 技能权重
  experience: number;     // 经验权重
  education: number;      // 学历权重
  keywords: number;       // 关键词权重
}

// ============================================================================
// 对话策略相关类型
// ============================================================================

/**
 * 对话阶段
 */
export type ConversationStage = 
  | 'ice_breaking'        // 破冰
  | 'interest_building'   // 建立兴趣
  | 'screening'           // 筛选
  | 'conversion';         // 转化

/**
 * 对话状态
 */
export interface ConversationState {
  stage: ConversationStage;
  roundCount: number;              // 对话轮数
  candidateResponseCount: number;  // 候选人回复次数
  lastCandidateMessage?: string;   // 候选人最后一条消息
  interestLevel: 'high' | 'medium' | 'low' | 'unknown';  // 兴趣程度
  painPoints: string[];            // 痛点/需求
  matchedHighlights: string[];     // 匹配的亮点
  stageHistory: {
    stage: ConversationStage;
    enteredAt: Date;
    exitedAt?: Date;
  }[];
}

/**
 * 策略动作
 */
export type StrategyAction = 
  | 'reply' 
  | 'wait' 
  | 'request_contact' 
  | 'schedule_interview' 
  | 'escalate';

/**
 * 策略结果
 */
export interface StrategyResult {
  stage: ConversationStage;
  nextAction: StrategyAction;
  message?: string;
  reasoning: string;
  suggestedDelay?: number;  // 建议延迟时间（毫秒）
}

// ============================================================================
// 风控相关类型
// ============================================================================

/**
 * 风险指标
 */
export interface RiskMetrics {
  sendSuccessRate: number;           // 发送成功率 (0-100)
  sendFailureCount: number;          // 连续发送失败次数
  replyRate: number;                 // 回复率 (0-100)
  replyRateTrend: 'up' | 'stable' | 'down';
  readNoReplyRate: number;           // 已读不回比例 (0-100)
  avgResponseTime: number;           // 平均响应时间（分钟）
  abnormalBehaviorScore: number;     // 异常行为分数 (0-100)
  platformWarningCount: number;      // 平台警告次数
  userReportCount: number;           // 被举报次数
}

/**
 * 风险等级
 */
export type RiskLevel = 'normal' | 'warning' | 'critical' | 'emergency';

/**
 * 风险动作
 */
export type RiskActionType = 'continue' | 'slowdown' | 'pause' | 'stop' | 'escalate';

/**
 * 风险动作结果
 */
export interface RiskAction {
  level: RiskLevel;
  action: RiskActionType;
  reason: string;
  suggestions: string[];
  slowdownFactor?: number;           // 降速倍数
}

/**
 * 账号健康状态
 */
export type HealthStatus = 'healthy' | 'subhealthy' | 'unhealthy' | 'dangerous';

/**
 * 健康分数因子
 */
export interface HealthScoreFactors {
  frequencyScore: number;       // 发送频率得分 (0-100)
  replyScore: number;           // 回复率得分 (0-100)
  platformScore: number;        // 平台交互得分 (0-100)
  behaviorScore: number;        // 行为模式得分 (0-100)
}

// ============================================================================
// 钩子相关类型
// ============================================================================

/**
 * 钩子类型
 */
export type HookType = 'scarcity' | 'relevance' | 'curiosity' | 'benefit';

/**
 * 打招呼结果
 */
export interface GreetingResult {
  content: string;
  hookType: HookType;
  hookUsed: string;
  personalization: string[];
  expectedReplyRate: number;  // 预期回复率提升
}

// ============================================================================
// 操作日志相关类型
// ============================================================================

/**
 * 操作类型
 */
export type OperationType = 
  | 'greeting_first'
  | 'greeting_second'
  | 'reply_auto'
  | 'reply_manual'
  | 'match_calculated'
  | 'intent_updated'
  | 'contact_requested'
  | 'contact_received'
  | 'resume_received'
  | 'status_changed'
  | 'manual_intervene'
  | 'batch_pause'
  | 'batch_resume'
  | 'error';

/**
 * 操作日志
 */
export interface OperationLog {
  id: string;
  jobId?: string;
  communicationId?: string;
  messageId?: string;
  type: OperationType;
  action?: string;
  details?: any;
  success: boolean;
  errorMessage?: string;
  platform?: Platform;
  operatorId?: string;
  operatorType?: 'system' | 'human';
  createdAt: Date;
}

// ============================================================================
// 统计相关类型
// ============================================================================

/**
 * 每日统计
 */
export interface DailyStatistics {
  id: string;
  date: string;                     // '2024-01-20'
  jobId?: string;
  platform?: Platform;
  
  greetingSent: number;             // 发送打招呼数
  greetingSecondSent: number;       // 发送二次打招呼数
  
  replied: number;                  // 收到回复数
  replyRate: number;                // 回复率（百分比）
  
  intentA: number;                  // A级意向数
  intentB: number;                  // B级意向数
  intentC: number;                  // C级意向数
  intentD: number;                  // D级意向数
  
  resumeReceived: number;           // 收到简历数
  contactReceived: number;          // 收到联系方式数
  manualIntervene: number;          // 人工介入数
  
  errors: number;                   // 错误数
  
  createdAt: Date;
}

// ============================================================================
// API 请求/响应类型
// ============================================================================

/**
 * 创建岗位请求
 */
export interface CreateJobRequest {
  name: string;
  department?: string;
  location: string;
  salaryMin: number;
  salaryMax: number;
  requirements: JobRequirements;
  highlights?: string[];
  companyIntro?: string;
  targetPlatforms: Platform[];
  matchThreshold?: number;
  secondGreetingEnabled?: boolean;
  secondGreetingDelayHours?: number;
  humanSimulation?: Partial<HumanSimulationConfig>;
  autoReplyConfig?: Partial<AutoReplyConfig>;
}

/**
 * 更新岗位请求
 */
export interface UpdateJobRequest {
  name?: string;
  department?: string;
  location?: string;
  salaryMin?: number;
  salaryMax?: number;
  requirements?: JobRequirements;
  highlights?: string[];
  companyIntro?: string;
  targetPlatforms?: Platform[];
  matchThreshold?: number;
  secondGreetingEnabled?: boolean;
  secondGreetingDelayHours?: number;
  humanSimulation?: Partial<HumanSimulationConfig>;
  autoReplyConfig?: Partial<AutoReplyConfig>;
  status?: 'active' | 'paused' | 'archived';
  pausedReason?: string;
}

/**
 * 创建打招呼模板请求
 */
export interface CreateGreetingTemplateRequest {
  jobId: string;
  type: GreetingType;
  platform: Platform | 'all';
  template: string;
}

/**
 * 创建问答条目请求
 */
export interface CreateQARequest {
  jobId?: string;
  category: QACategory;
  triggerKeywords: TriggerKeywords;
  questionExamples: string[];
  answer: string;
  platformAnswers?: PlatformAnswer[];
  priority?: number;
}

/**
 * 计算匹配度请求
 */
export interface CalculateMatchRequest {
  jobId: string;
  candidates: CandidateProfile[];
}

/**
 * 计算匹配度响应
 */
export interface CalculateMatchResponse {
  success: boolean;
  data: {
    results: {
      platformUserId: string;
      matchScore: number;
      matched: string[];
      unmatched: string[];
      highlights: string[];
      passed: boolean;
    }[];
  };
}
