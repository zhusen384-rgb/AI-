/**
 * 自动打招呼沟通智能体 - 数据库 Schema
 * 
 * 使用 Drizzle ORM 定义数据库表结构
 */

import { pgTable, serial, text, timestamp, integer, boolean, jsonb, uuid, uniqueIndex, unique } from 'drizzle-orm/pg-core';

// ============================================================================
// 岗位配置表
// ============================================================================

/**
 * 岗位配置表
 */
export const agJobPositions = pgTable('ag_job_positions', {
  id: uuid('id').primaryKey().defaultRandom(),
  
  // 基本信息
  name: text('name').notNull(),                    // 岗位名称
  department: text('department'),                  // 所属部门
  location: text('location').notNull(),            // 工作地点
  salaryMin: integer('salary_min'),                // 最低薪资（K）
  salaryMax: integer('salary_max'),                // 最高薪资（K）
  
  // 岗位要求（JSONB 存储）
  requirements: jsonb('requirements').notNull().$type<{
    skills: string[];           // 技能要求
    experience: {               // 经验要求
      min: number;
      max?: number;
    };
    education: string[];        // 学历要求
    age?: {                     // 年龄要求（可选）
      min?: number;
      max?: number;
    };
    keywords: string[];         // 其他关键词
  }>(),
  
  // 岗位亮点
  highlights: jsonb('highlights').$type<string[]>().default([]),
  
  // 公司信息
  companyIntro: text('company_intro'),             // 公司简介
  companySize: text('company_size'),               // 公司规模
  companyIndustry: text('company_industry'),       // 所属行业
  
  // 平台配置
  targetPlatforms: jsonb('target_platforms').$type<('boss' | 'zhilian' | 'liepin')[]>().notNull(),
  
  // 匹配配置
  matchThreshold: integer('match_threshold').default(60),  // 匹配度阈值（0-100）
  
  // 二次打招呼配置
  secondGreetingEnabled: boolean('second_greeting_enabled').default(false),
  secondGreetingDelayHours: integer('second_greeting_delay_hours').default(24),
  
  // 真人模拟配置
  humanSimulation: jsonb('human_simulation').$type<{
    batchPauseCount: number;
    batchPauseSeconds: number;
    minDelaySeconds: number;
    maxDelaySeconds: number;
    nightMinDelaySeconds: number;
    nightMaxDelaySeconds: number;
    nightStartTime: string;
    nightEndTime: string;
  }>().default({
    batchPauseCount: 10,
    batchPauseSeconds: 60,
    minDelaySeconds: 8,
    maxDelaySeconds: 25,
    nightMinDelaySeconds: 30,
    nightMaxDelaySeconds: 60,
    nightStartTime: '22:00',
    nightEndTime: '08:00',
  }),
  
  // 自动回复配置
  autoReplyConfig: jsonb('auto_reply_config').$type<{
    maxReplyLength: number;
    maxRoundsNoResponse: number;
    enableIntentDetection: boolean;
    requestContactAfterRounds: number;
  }>().default({
    maxReplyLength: 120,
    maxRoundsNoResponse: 3,
    enableIntentDetection: true,
    requestContactAfterRounds: 3,
  }),
  
  // 状态
  status: text('status').default('active'),        // active | paused | archived
  pausedReason: text('paused_reason'),             // 暂停原因
  
  // 关联面试官系统岗位
  positionId: integer('position_id'),               // 关联面试官系统岗位ID（positions表）
  
  // 统计数据（冗余字段，便于查询）
  stats: jsonb('stats').$type<{
    totalGreeted: number;
    totalReplied: number;
    totalHighIntent: number;
    totalResumeReceived: number;
    totalContactReceived: number;
    lastStatUpdate: string;
  }>().default({
    totalGreeted: 0,
    totalReplied: 0,
    totalHighIntent: 0,
    totalResumeReceived: 0,
    totalContactReceived: 0,
    lastStatUpdate: new Date().toISOString(),
  }),
  
  // 审计字段
  createdById: text('created_by_id'),              // 创建人ID
  createdByName: text('created_by_name'),          // 创建人姓名
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// ============================================================================
// 打招呼模板表
// ============================================================================

/**
 * 打招呼模板表
 */
export const agGreetingTemplates = pgTable('ag_greeting_templates', {
  id: uuid('id').primaryKey().defaultRandom(),
  jobId: uuid('job_id').notNull().references(() => agJobPositions.id),
  
  // 模板类型
  type: text('type').notNull(),                    // 'first' | 'second'
  
  // 平台适配
  platform: text('platform').notNull(),            // 'boss' | 'zhilian' | 'liepin' | 'all'
  
  // 模板内容
  template: text('template').notNull(),
  
  // 变量说明
  variables: jsonb('variables').$type<{
    name: string;
    description: string;
    required: boolean;
  }[]>(),
  
  // 状态
  isActive: boolean('is_active').default(true),
  
  // 使用统计
  useCount: integer('use_count').default(0),
  
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// ============================================================================
// 问答库表
// ============================================================================

/**
 * 问答库表
 */
export const agQaLibrary = pgTable('ag_qa_library', {
  id: uuid('id').primaryKey().defaultRandom(),
  jobId: uuid('job_id').references(() => agJobPositions.id),  // null 表示全局通用
  
  // 分类
  category: text('category').notNull(),            // '薪资福利' | '工作内容' | ...
  
  // 触发关键词
  triggerKeywords: jsonb('trigger_keywords').notNull().$type<{
    keywords: string[];
    matchType: 'exact' | 'contains' | 'fuzzy';
  }>(),
  
  // 问题示例
  questionExamples: jsonb('question_examples').$type<string[]>(),
  
  // 回答内容
  answer: text('answer').notNull(),
  
  // 平台适配
  platformAnswers: jsonb('platform_answers').$type<{
    platform: string;
    answer: string;
  }[]>(),
  
  // 优先级
  priority: integer('priority').default(100),
  
  isActive: boolean('is_active').default(true),
  
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// ============================================================================
// 候选人沟通记录表
// ============================================================================

/**
 * 候选人沟通记录表
 */
export const agCandidateCommunications = pgTable('ag_candidate_communications', {
  id: uuid('id').primaryKey().defaultRandom(),
  jobId: uuid('job_id').notNull().references(() => agJobPositions.id),
  
  // 候选人基础信息
  name: text('name'),                              // 姓名（可能未知）
  platform: text('platform').notNull(),            // 'boss' | 'zhilian' | 'liepin'
  platformUserId: text('platform_user_id'),        // 平台用户ID
  platformNickname: text('platform_nickname'),     // 平台昵称
  platformAvatarUrl: text('platform_avatar_url'),  // 平台头像URL
  
  // 候选人简历信息
  candidateInfo: jsonb('candidate_info').$type<{
    age?: number;
    gender?: string;
    education?: string;
    currentCompany?: string;
    currentPosition?: string;
    experience?: number;
    skills?: string[];
    expectedSalary?: string;
    currentCity?: string;
    jobStatus?: string;
    resumeKeywords?: string[];
  }>(),
  
  // 匹配信息
  matchScore: integer('match_score'),              // 匹配度分数（0-100）
  matchReasons: jsonb('match_reasons').$type<{
    matched: string[];
    unmatched: string[];
    highlights: string[];
  }>(),
  
  // 沟通状态
  status: text('status').default('待打招呼'),     // 状态
  intentLevel: text('intent_level'),               // 'A' | 'B' | 'C' | 'D' | null
  
  // 时间记录
  firstGreetingTime: timestamp('first_greeting_time'),
  firstGreetingMessageId: uuid('first_greeting_message_id'),
  lastMessageTime: timestamp('last_message_time'),
  lastHrMessageTime: timestamp('last_hr_message_time'),
  lastCandidateMessageTime: timestamp('last_candidate_message_time'),
  secondGreetingSent: boolean('second_greeting_sent').default(false),
  secondGreetingTime: timestamp('second_greeting_time'),
  
  // 沟通统计
  communicationStats: jsonb('communication_stats').$type<{
    hrMessageCount: number;
    candidateMessageCount: number;
    effectiveRounds: number;
    lastEffectiveRoundTime: string | null;
  }>().default({
    hrMessageCount: 0,
    candidateMessageCount: 0,
    effectiveRounds: 0,
    lastEffectiveRoundTime: null,
  }),
  
  // 获取到的信息
  receivedInfo: jsonb('received_info').$type<{
    resumeFileUrl?: string;
    resumeParsedData?: any;
    wechat?: string;
    phone?: string;
    email?: string;
    receivedAt?: string;
  }>(),
  
  // 标签
  tags: jsonb('tags').$type<string[]>().default([]),
  
  // 人工介入标记
  manualIntervene: boolean('manual_intervene').default(false),
  manualInterveneReason: text('manual_intervene_reason'),
  manualInterveneTime: timestamp('manual_intervene_time'),
  
  // 黑名单标记
  isBlacklisted: boolean('is_blacklisted').default(false),
  blacklistReason: text('blacklist_reason'),
  
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => ({
  // 唯一约束：同一平台、同一候选人、同一岗位只记录一次
  uniquePlatformUser: unique().on(table.platform, table.platformUserId, table.jobId),
}));

// ============================================================================
// 消息记录表
// ============================================================================

/**
 * 消息记录表
 */
export const agMessages = pgTable('ag_messages', {
  id: uuid('id').primaryKey().defaultRandom(),
  communicationId: uuid('communication_id').notNull().references(() => agCandidateCommunications.id),
  
  // 消息基本信息
  sender: text('sender').notNull(),                // 'hr' | 'candidate' | 'system'
  content: text('content').notNull(),
  
  // 消息类型
  messageType: text('message_type').default('text'), // 'text' | 'greeting' | ...
  
  // 发送方式
  sendMethod: text('send_method'),                 // 'auto' | 'manual'
  isAuto: boolean('is_auto').default(false),
  
  // 关联的模板
  templateId: uuid('template_id'),
  
  // 发送状态
  status: text('status').default('pending'),       // 'pending' | 'sent' | 'delivered' | 'failed'
  sendTime: timestamp('send_time'),
  platformMessageId: text('platform_message_id'),
  
  // 附件信息
  attachments: jsonb('attachments').$type<{
    type: string;
    url: string;
    name: string;
    size?: number;
  }[]>(),
  
  // AI 分析结果
  aiAnalysis: jsonb('ai_analysis').$type<{
    intent?: string;
    sentiment?: string;
    keywords?: string[];
    matchedQA?: string;
    shouldIntervene?: boolean;
    intentLevel?: 'A' | 'B' | 'C' | 'D';
  }>(),
  
  createdAt: timestamp('created_at').defaultNow(),
});

// ============================================================================
// 操作日志表
// ============================================================================

/**
 * 操作日志表
 */
export const agOperationLogs = pgTable('ag_operation_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  
  // 关联信息
  jobId: uuid('job_id').references(() => agJobPositions.id),
  communicationId: uuid('communication_id').references(() => agCandidateCommunications.id),
  messageId: uuid('message_id').references(() => agMessages.id),
  
  // 操作类型
  type: text('type').notNull(),                    // 'greeting_first' | 'reply_auto' | ...
  action: text('action'),                          // 具体动作
  
  // 操作详情
  details: jsonb('details'),
  
  // 结果
  success: boolean('success').default(true),
  errorMessage: text('error_message'),
  
  // 上下文
  platform: text('platform'),
  operatorId: text('operator_id'),
  operatorType: text('operator_type'),             // 'system' | 'human'
  
  createdAt: timestamp('created_at').defaultNow(),
});

// ============================================================================
// 敏感词库表
// ============================================================================

/**
 * 敏感词库表
 */
export const agSensitiveWords = pgTable('ag_sensitive_words', {
  id: uuid('id').primaryKey().defaultRandom(),
  
  word: text('word').notNull(),
  category: text('category'),                      // '平台违规' | '个人隐私' | ...
  severity: text('severity').default('medium'),    // 'low' | 'medium' | 'high' | 'critical'
  
  // 替换词
  replacement: text('replacement'),
  
  // 适用平台
  platforms: jsonb('platforms').$type<string[]>(),
  
  isActive: boolean('is_active').default(true),
  createdAt: timestamp('created_at').defaultNow(),
});

// ============================================================================
// 每日统计表
// ============================================================================

/**
 * 每日统计表
 */
export const agDailyStatistics = pgTable('ag_daily_statistics', {
  id: uuid('id').primaryKey().defaultRandom(),
  
  // 统计维度
  date: text('date').notNull(),                    // '2024-01-20'
  jobId: uuid('job_id').references(() => agJobPositions.id),
  platform: text('platform'),
  
  // 打招呼统计
  greetingSent: integer('greeting_sent').default(0),
  greetingSecondSent: integer('greeting_second_sent').default(0),
  
  // 回复统计
  replied: integer('replied').default(0),
  replyRate: integer('reply_rate').default(0),
  
  // 意向统计
  intentA: integer('intent_a').default(0),
  intentB: integer('intent_b').default(0),
  intentC: integer('intent_c').default(0),
  intentD: integer('intent_d').default(0),
  
  // 转化统计
  resumeReceived: integer('resume_received').default(0),
  contactReceived: integer('contact_received').default(0),
  manualIntervene: integer('manual_intervene').default(0),
  
  // 错误统计
  errors: integer('errors').default(0),
  
  createdAt: timestamp('created_at').defaultNow(),
}, (table) => ({
  uniqueDateJobPlatform: unique().on(table.date, table.jobId, table.platform),
}));

// ============================================================================
// 账号健康日志表
// ============================================================================

/**
 * 账号健康日志表
 */
export const agAccountHealthLogs = pgTable('ag_account_health_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  
  accountId: text('account_id').notNull(),
  platform: text('platform').notNull(),
  
  // 分数
  score: integer('score').notNull(),
  factors: jsonb('factors').$type<{
    frequencyScore: number;
    replyScore: number;
    platformScore: number;
    behaviorScore: number;
  }>(),
  
  // 状态
  status: text('status'),                          // healthy | subhealthy | unhealthy | dangerous
  
  // 触发的事件
  triggerEvent: text('trigger_event'),
  
  createdAt: timestamp('created_at').defaultNow(),
});

// ============================================================================
// 对话阶段记录表
// ============================================================================

/**
 * 对话阶段记录表
 */
export const agConversationStages = pgTable('ag_conversation_stages', {
  id: uuid('id').primaryKey().defaultRandom(),
  communicationId: uuid('communication_id').notNull().references(() => agCandidateCommunications.id),
  
  // 阶段信息
  stage: text('stage').notNull(),                  // ice_breaking | interest_building | screening | conversion
  
  // 进入/退出时间
  enteredAt: timestamp('entered_at').notNull(),
  exitedAt: timestamp('exited_at'),
  
  // 阶段统计
  roundsInStage: integer('rounds_in_stage').default(0),
  
  // 转换原因
  transitionReason: text('transition_reason'),
  
  createdAt: timestamp('created_at').defaultNow(),
});

// ============================================================================
// 钩子使用日志表
// ============================================================================

/**
 * 钩子使用日志表
 */
export const agHookUsageLogs = pgTable('ag_hook_usage_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  communicationId: uuid('communication_id').references(() => agCandidateCommunications.id),
  
  // 钩子信息
  hookType: text('hook_type'),                     // scarcity | relevance | curiosity | benefit
  hookContent: text('hook_content'),
  
  // 个性化元素
  personalization: jsonb('personalization').$type<string[]>(),
  
  // 效果
  gotReply: boolean('got_reply'),
  replyTimeSeconds: integer('reply_time_seconds'),
  
  // 预期
  expectedReplyRate: integer('expected_reply_rate'),
  
  createdAt: timestamp('created_at').defaultNow(),
});

// ============================================================================
// 类型导出
// ============================================================================

export type AgJobPosition = typeof agJobPositions.$inferSelect;
export type AgGreetingTemplate = typeof agGreetingTemplates.$inferSelect;
export type AgQaLibraryItem = typeof agQaLibrary.$inferSelect;
export type AgCandidateCommunication = typeof agCandidateCommunications.$inferSelect;
export type AgMessage = typeof agMessages.$inferSelect;
export type AgOperationLog = typeof agOperationLogs.$inferSelect;
export type AgSensitiveWord = typeof agSensitiveWords.$inferSelect;
export type AgDailyStatistics = typeof agDailyStatistics.$inferSelect;
export type AgAccountHealthLog = typeof agAccountHealthLogs.$inferSelect;
export type AgConversationStage = typeof agConversationStages.$inferSelect;
export type AgHookUsageLog = typeof agHookUsageLogs.$inferSelect;
