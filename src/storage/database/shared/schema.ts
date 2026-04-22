import { pgTable, index, unique, serial, text, timestamp, jsonb, integer, varchar, boolean } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"
import { createSchemaFactory } from "drizzle-zod"
import { z } from "zod"
import type { PositionVetoRule } from "@/lib/position-veto-rules"



export const fullAiInterviewConfigs = pgTable("full_ai_interview_configs", {
	id: serial().primaryKey().notNull(),
	linkId: text("link_id").notNull(),
	candidateName: text("candidate_name").notNull(),
	mode: text().notNull(),
	position: text().notNull(),
	resume: text().notNull(),
	interviewTime: timestamp("interview_time", { mode: 'string' }),
	interviewerVoice: text("interviewer_voice").notNull().default('steady_professional'),
	tenantId: text("tenant_id"),
	userId: text("user_id"),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_full_ai_interview_configs_created_at").using("btree", table.createdAt.asc().nullsLast().op("timestamp_ops")),
	index("idx_full_ai_interview_configs_link_id").using("btree", table.linkId.asc().nullsLast().op("text_ops")),
	index("idx_full_ai_interview_configs_tenant").using("btree", table.tenantId.asc().nullsLast().op("text_ops")),
	index("idx_full_ai_interview_configs_user").using("btree", table.userId.asc().nullsLast().op("text_ops")),
	unique("full_ai_interview_configs_link_id_key").on(table.linkId),
]);

export const interviewSessions = pgTable("interview_sessions", {
	id: serial().primaryKey().notNull(),
	interviewId: text("interview_id").notNull(),
	linkId: text("link_id").notNull(),
	candidateName: text("candidate_name").notNull(),
	mode: text().notNull(),
	position: text().notNull(),
	positionId: text("position_id").notNull(),
	resume: text().notNull(),
	messages: jsonb().notNull(),
	interviewStage: integer("interview_stage").default(1).notNull(),
	followUpCount: integer("follow_up_count").default(0).notNull(),
	currentQuestionCount: integer("current_question_count").default(0).notNull(),
	scoreRuleSnapshot: jsonb("score_rule_snapshot"),
	dimensionCoverage: jsonb("dimension_coverage"),
	requiredQuestionState: jsonb("required_question_state"),
	currentQuestionMeta: jsonb("current_question_meta"),
	askedQuestionKeys: jsonb("asked_question_keys"),
	startTime: timestamp("start_time", { mode: 'string' }).notNull(),
	tenantId: text("tenant_id"),
	userId: text("user_id"),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
	qaHistory: jsonb("qa_history"),
	candidateStatus: jsonb("candidate_status"),
}, (table) => [
	index("idx_interview_sessions_interview_id").using("btree", table.interviewId.asc().nullsLast().op("text_ops")),
	index("idx_interview_sessions_link_id").using("btree", table.linkId.asc().nullsLast().op("text_ops")),
	unique("interview_sessions_interview_id_key").on(table.interviewId),
	index("idx_interview_sessions_tenant").using("btree", table.tenantId.asc().nullsLast().op("text_ops")),
	index("idx_interview_sessions_user").using("btree", table.userId.asc().nullsLast().op("text_ops")),
]);

export const fullAiInterviewResults = pgTable("full_ai_interview_results", {
	id: serial().primaryKey().notNull(),
	linkId: text("link_id").notNull(),
	interviewId: text("interview_id").notNull(),
	candidateName: text("candidate_name").notNull(),
	position: text().notNull(),
	evaluation: jsonb().notNull(),
	recordingKey: text("recording_key"),
	recordingUrl: text("recording_url"),
	completedAt: timestamp("completed_at", { mode: 'string' }).notNull(),
	tenantId: text("tenant_id"),
	userId: text("user_id"),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	qaHistory: jsonb("qa_history"),
	candidateStatus: jsonb("candidate_status").default({"events":[],"summary":"状态监控未启用","statistics":{"faceLostCount":0,"totalDuration":0,"normalDuration":0,"abnormalDuration":0,"cheatingDuration":0,"faceDetectionRate":0,"multipleFaceCount":0,"suspiciousActions":0},"overallStatus":"normal"}),
}, (table) => [
	index("idx_full_ai_interview_results_completed_at").using("btree", table.completedAt.asc().nullsLast().op("timestamp_ops")),
	index("idx_full_ai_interview_results_interview_id").using("btree", table.interviewId.asc().nullsLast().op("text_ops")),
	index("idx_full_ai_interview_results_link_id").using("btree", table.linkId.asc().nullsLast().op("text_ops")),
	index("idx_full_ai_interview_results_tenant").using("btree", table.tenantId.asc().nullsLast().op("text_ops")),
	index("idx_full_ai_interview_results_user").using("btree", table.userId.asc().nullsLast().op("text_ops")),
]);

// ==================== 多租户用户管理 ====================

// 租户表（公司/组织）
export const tenants = pgTable("tenants", {
	id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
	name: varchar("name", { length: 128 }).notNull(),
	code: varchar("code", { length: 32 }).notNull().unique(), // 租户代码，用于唯一标识
	phone: varchar("phone", { length: 20 }),
	email: varchar("email", { length: 255 }),
	status: varchar("status", { length: 20 }).default("active").notNull(), // active, suspended
	metadata: jsonb("metadata"),
	createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true }),
}, (table) => [
	index("idx_tenants_code").on(table.code),
	index("idx_tenants_status").on(table.status),
]);

// 用户表
export const users = pgTable("users", {
	id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
	tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => tenants.id, { onDelete: 'cascade' }),
	username: varchar("username", { length: 64 }).notNull().unique(),
	email: varchar("email", { length: 255 }).notNull(),
	phone: varchar("phone", { length: 20 }),
	name: varchar("name", { length: 128 }).notNull(),
	password: varchar("password", { length: 255 }).notNull(),
	role: varchar("role", { length: 20 }).default("user").notNull(), // admin, user, interviewer, tenant_admin, super_admin
	status: varchar("status", { length: 20 }).default("active").notNull(), // active, inactive, locked
	lockedUntil: timestamp("locked_until", { withTimezone: true }),
	avatarUrl: varchar("avatar_url", { length: 512 }),
	loginCount: integer("login_count").default(0).notNull(),
	lastLoginIp: varchar("last_login_ip", { length: 50 }),
	createdBy: varchar("created_by", { length: 36 }), // 创建者ID
	updatedBy: varchar("updated_by", { length: 36 }), // 更新者ID
	createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true }),
	lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
	metadata: jsonb("metadata"),
}, (table) => [
	index("idx_users_tenant_id").on(table.tenantId),
	index("idx_users_username").on(table.username),
	index("idx_users_email").on(table.email),
	index("idx_users_role").on(table.role),
	index("idx_users_status").on(table.status),
]);

// Zod schemas for validation with date coercion
const { createInsertSchema: createCoercedInsertSchema } = createSchemaFactory({
	coerce: { date: true },
});

export const insertTenantSchema = createCoercedInsertSchema(tenants).pick({
	name: true,
	code: true,
	phone: true,
	email: true,
});

export const insertUserSchema = createCoercedInsertSchema(users).pick({
	tenantId: true,
	username: true,
	email: true,
	phone: true,
	name: true,
	password: true,
	role: true,
});

export const updateUserSchema = createCoercedInsertSchema(users)
	.pick({
		username: true,
		email: true,
		phone: true,
		name: true,
		role: true,
		password: true,
		status: true,
		lockedUntil: true,
		avatarUrl: true,
	})
	.partial();

// ==================== 模型优化模块 ====================

// 简历评估记录表
export const resumeEvaluationRecords = pgTable('resume_evaluation_records', {
  id: serial('id').primaryKey().notNull(),

  // 关联字段
  candidateId: integer('candidate_id').notNull(),
  resumeId: integer('resume_id').notNull(),
  positionId: integer('position_id').notNull(),

  // AI 评估结果
  aiMatchScore: integer('ai_match_score').notNull(),
  aiEvaluation: jsonb('ai_evaluation'), // JSON 对象，包含完整的评估结果

  // 评估阶段
  evaluationStage: text('evaluation_stage').notNull().default('resume_screening'), // resume_screening, final_evaluation

  // 面试官实际评价
  interviewScores: jsonb('interview_scores'), // JSON 对象，包含面试官各维度评分
  finalDecision: text('final_decision'), // hired, rejected, pending（面试后决策时填写）
  decisionReason: text('decision_reason'),
  decisionMadeBy: integer('decision_made_by'),

  // 差异分析
  predictionError: integer('prediction_error'), // |aiMatchScore - actualScore|
  isMisclassified: boolean('is_misclassified').default(false).notNull(),
  misclassificationType: text('misclassification_type'), // false_positive, false_negative

  // 时间戳
  evaluatedAt: timestamp('evaluated_at', { mode: 'string' }).notNull(),
  decisionMadeAt: timestamp('decision_made_at', { mode: 'string' }),
  createdAt: timestamp('created_at', { mode: 'string' }).notNull().defaultNow(),
}, (table) => [
  index('idx_resume_evaluation_records_candidate_id').on(table.candidateId),
  index('idx_resume_evaluation_records_resume_id').on(table.resumeId),
  index('idx_resume_evaluation_records_position_id').on(table.positionId),
  index('idx_resume_evaluation_records_final_decision').on(table.finalDecision),
  index('idx_resume_evaluation_records_is_misclassified').on(table.isMisclassified),
  index('idx_resume_evaluation_records_evaluated_at').on(table.evaluatedAt),
  index('idx_resume_evaluation_records_evaluation_stage').on(table.evaluationStage),
]);

// 模型优化历史表
export const modelOptimizationHistory = pgTable('model_optimization_history', {
  id: serial('id').primaryKey().notNull(),
  
  // 优化前状态
  oldPrompt: text('old_prompt').notNull(),
  oldWeights: jsonb('old_weights').notNull(),
  oldAccuracy: jsonb('old_accuracy').notNull(),
  
  // 优化后状态
  newPrompt: text('new_prompt').notNull(),
  newWeights: jsonb('new_weights').notNull(),
  newAccuracy: jsonb('new_accuracy').notNull(),
  
  // 优化指标
  accuracyImprovement: jsonb('accuracy_improvement'), // {current, new, improvement}
  sampleSize: integer('sample_size').notNull(),
  timeRange: jsonb('time_range').notNull(), // {start, end}
  
  // 状态
  status: text('status').notNull().default('pending'), // pending, deployed, rolled_back
  deployedAt: timestamp('deployed_at', { mode: 'string' }),
  
  // 元数据
  optimizationMethod: text('optimization_method').notNull(), // few_shot, weight_adjustment, hybrid
  notes: text('notes'),
  
  createdAt: timestamp('created_at', { mode: 'string' }).notNull().defaultNow(),
}, (table) => [
  index('idx_model_optimization_history_status').on(table.status),
  index('idx_model_optimization_history_created_at').on(table.createdAt),
]);

// TypeScript types
export type Tenant = typeof tenants.$inferSelect;
export type InsertTenant = z.infer<typeof insertTenantSchema>;
export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;
export type UpdateUser = z.infer<typeof updateUserSchema>;

// 优化模块类型
export type ResumeEvaluationRecord = typeof resumeEvaluationRecords.$inferSelect;
export type NewResumeEvaluationRecord = typeof resumeEvaluationRecords.$inferInsert;
export type ModelOptimizationHistory = typeof modelOptimizationHistory.$inferSelect;
export type NewModelOptimizationHistory = typeof modelOptimizationHistory.$inferInsert;

// ==================== 岗位管理 ====================

// 岗位表
export const positions = pgTable("positions", {
  id: serial("id").primaryKey().notNull(),
  title: varchar("title", { length: 200 }).notNull(),
  department: varchar("department", { length: 100 }).notNull(),
  jobDescription: text("job_description").notNull(), // JD
  education: varchar("education", { length: 50 }).notNull(), // 学历要求
  experience: varchar("experience", { length: 100 }), // 经验要求
  status: varchar("status", { length: 20 }).default("active").notNull(), // active, closed
  
  // 核心能力要求 [{type: 'hard_skill', name: 'Java', required: true}]
  coreRequirements: jsonb("core_requirements"),
  // 软技能要求 ['团队协作', '沟通能力']
  softSkills: jsonb("soft_skills"),
  // 面试官偏好 {focusAreas: ['技术深度', '项目经验'], questionStyle: '深入', additionalNotes: '...'}
  interviewerPreferences: jsonb("interviewer_preferences"),
  // 一票否决规则 [{ id, ruleName, description, keywords, enabled }]
  vetoRules: jsonb("veto_rules").$type<PositionVetoRule[]>().default([]),
  
  // 所属用户和租户
  userId: varchar("user_id", { length: 36 }).notNull().references(() => users.id, { onDelete: 'cascade' }),
  tenantId: varchar("tenant_id", { length: 36 }).references(() => tenants.id, { onDelete: 'cascade' }),
  
  // 是否全局可见（同步给所有用户）
  isGlobal: boolean("is_global").default(false).notNull(),
  
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("idx_positions_user_id").on(table.userId),
  index("idx_positions_tenant_id").on(table.tenantId),
  index("idx_positions_department").on(table.department),
  index("idx_positions_status").on(table.status),
  index("idx_positions_is_global").on(table.isGlobal),
]);

export type Position = typeof positions.$inferSelect;
export type InsertPosition = typeof positions.$inferInsert;

// ==================== AI 岗位评分规则 ====================

export const aiPositionScoreRules = pgTable("ai_position_score_rules", {
  id: serial("id").primaryKey().notNull(),
  positionKey: varchar("position_key", { length: 100 }).notNull().unique(),
  positionName: varchar("position_name", { length: 200 }).notNull(),
  ruleName: varchar("rule_name", { length: 200 }).notNull(),
  ruleVersion: varchar("rule_version", { length: 50 }).notNull().default("v1"),
  status: varchar("status", { length: 20 }).notNull().default("active"), // draft, active, archived
  dimensions: jsonb("dimensions").notNull(),
  thresholds: jsonb("thresholds").notNull(),
  requiredQuestions: jsonb("required_questions").notNull(),
  interviewStrategy: jsonb("interview_strategy").notNull(),
  promptTemplate: text("prompt_template"),
  questionBank: jsonb("question_bank"),
  questionBankCount: integer("question_bank_count").default(0),
  createdBy: varchar("created_by", { length: 36 }).references(() => users.id, { onDelete: "set null" }),
  updatedBy: varchar("updated_by", { length: 36 }).references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("idx_ai_position_score_rules_position_key").on(table.positionKey),
  index("idx_ai_position_score_rules_status").on(table.status),
  index("idx_ai_position_score_rules_updated_at").on(table.updatedAt),
]);

export type AiPositionScoreRule = typeof aiPositionScoreRules.$inferSelect;
export type InsertAiPositionScoreRule = typeof aiPositionScoreRules.$inferInsert;

// ==================== 认证与安全 ====================

// 登录日志表
export const loginLogs = pgTable("login_logs", {
  id: serial("id").primaryKey().notNull(),
  userId: varchar("user_id", { length: 36 }).notNull().references(() => users.id, { onDelete: 'cascade' }),
  ip: varchar("ip", { length: 50 }),
  userAgent: text("user_agent"),
  loginTime: timestamp("login_time", { withTimezone: true }).defaultNow().notNull(),
  status: varchar("status", { length: 20 }).notNull(), // success, failed
  failureReason: varchar("failure_reason", { length: 255 }),
  location: jsonb("location"), // { country, city, lat, lon }
  device: jsonb("device"), // { type, os, browser }
}, (table) => [
  index("idx_login_logs_user_id").on(table.userId),
  index("idx_login_logs_status").on(table.status),
  index("idx_login_logs_login_time").on(table.loginTime),
  index("idx_login_logs_ip").on(table.ip),
]);

// 邀请码表
export const invitationCodes = pgTable("invitation_codes", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  code: varchar("code", { length: 32 }).notNull().unique(),
  createdBy: varchar("created_by", { length: 36 }).notNull().references(() => users.id, { onDelete: 'cascade' }),
  tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  maxUses: integer("max_uses").default(1).notNull(), // 最大使用次数
  usedCount: integer("used_count").default(0).notNull(), // 已使用次数
  status: varchar("status", { length: 20 }).default("active").notNull(), // active, inactive, expired
  expiresAt: timestamp("expires_at", { withTimezone: true }), // 过期时间
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  usedBy: jsonb("used_by"), // 记录使用该邀请码的用户ID列表 [{userId, usedAt}]
}, (table) => [
  index("idx_invitation_codes_code").on(table.code),
  index("idx_invitation_codes_tenant_id").on(table.tenantId),
  index("idx_invitation_codes_created_by").on(table.createdBy),
  index("idx_invitation_codes_status").on(table.status),
]);

// 邀请码类型
export type LoginLog = typeof loginLogs.$inferSelect;
export type InsertLoginLog = typeof loginLogs.$inferInsert;
export type InvitationCode = typeof invitationCodes.$inferSelect;
export type InsertInvitationCode = typeof invitationCodes.$inferInsert;

// ==================== 智能客服机器人 ====================

// 聊天会话表
export const chatSessions = pgTable("chat_sessions", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id", { length: 36 }).notNull().references(() => users.id, { onDelete: 'cascade' }),
  tenantId: varchar("tenant_id", { length: 36 }).references(() => tenants.id, { onDelete: 'cascade' }),
  title: varchar("title", { length: 200 }), // 会话标题（可选）
  currentPage: varchar("current_page", { length: 255 }), // 用户当前所在页面
  userAgent: text("user_agent"),
  metadata: jsonb("metadata"), // 额外元数据
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("idx_chat_sessions_user_id").on(table.userId),
  index("idx_chat_sessions_tenant_id").on(table.tenantId),
  index("idx_chat_sessions_created_at").on(table.createdAt),
]);

// 聊天消息表
export const chatMessages = pgTable("chat_messages", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  sessionId: varchar("session_id", { length: 36 }).notNull().references(() => chatSessions.id, { onDelete: 'cascade' }),
  role: varchar("role", { length: 20 }).notNull(), // user, assistant
  content: text("content").notNull(),
  messageType: varchar("message_type", { length: 20 }).default("text").notNull(), // text, image, video
  attachmentUrl: varchar("attachment_url", { length: 512 }), // 附件URL（如截图）
  metadata: jsonb("metadata"), // 额外元数据
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("idx_chat_messages_session_id").on(table.sessionId),
  index("idx_chat_messages_created_at").on(table.createdAt),
]);

// 提问统计表
export const chatQuestionStats = pgTable("chat_question_stats", {
  id: serial("id").primaryKey().notNull(),
  userId: varchar("user_id", { length: 36 }).notNull().references(() => users.id, { onDelete: 'cascade' }),
  tenantId: varchar("tenant_id", { length: 36 }).references(() => tenants.id, { onDelete: 'cascade' }),
  question: text("question").notNull(), // 用户问题
  questionCategory: varchar("question_category", { length: 50 }), // 问题分类（岗位管理、候选人管理、面试安排等）
  currentPage: varchar("current_page", { length: 255 }), // 提问时所在页面
  answerQuality: integer("answer_quality"), // 答案质量评分（1-5，用户可选）
  wasHelpful: boolean("was_helpful"), // 用户是否觉得有帮助
  responseTime: integer("response_time"), // 响应时间（毫秒）
  isDifficult: boolean("is_difficult").default(false).notNull(), // 是否为疑难问题
  answerLength: integer("answer_length"), // 答案长度（用于质量分析）
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("idx_chat_question_stats_user_id").on(table.userId),
  index("idx_chat_question_stats_tenant_id").on(table.tenantId),
  index("idx_chat_question_stats_category").on(table.questionCategory),
  index("idx_chat_question_stats_created_at").on(table.createdAt),
  index("idx_chat_question_stats_is_difficult").on(table.isDifficult),
]);

// ==================== 用户活动日志 ====================

// 用户活动日志表
export const userActivityLogs = pgTable("user_activity_logs", {
  id: serial("id").primaryKey().notNull(),
  userId: varchar("user_id", { length: 36 }).notNull().references(() => users.id, { onDelete: 'cascade' }),
  tenantId: varchar("tenant_id", { length: 36 }).references(() => tenants.id, { onDelete: 'cascade' }),
  action: varchar("action", { length: 50 }).notNull(), // create, update, delete, view, login, logout
  resource: varchar("resource", { length: 50 }).notNull(), // candidate, position, interview, resume, report
  resourceId: varchar("resource_id", { length: 100 }), // 资源ID
  resourceName: varchar("resource_name", { length: 255 }), // 资源名称（如候选人姓名、岗位名称）
  detail: jsonb("detail"), // 详细信息
  ip: varchar("ip", { length: 50 }),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("idx_user_activity_logs_user_id").on(table.userId),
  index("idx_user_activity_logs_tenant_id").on(table.tenantId),
  index("idx_user_activity_logs_action").on(table.action),
  index("idx_user_activity_logs_resource").on(table.resource),
  index("idx_user_activity_logs_created_at").on(table.createdAt),
]);

export type UserActivityLog = typeof userActivityLogs.$inferSelect;
export type InsertUserActivityLog = typeof userActivityLogs.$inferInsert;

// 转人工记录表
export const chatTransferLogs = pgTable("chat_transfer_logs", {
  id: serial("id").primaryKey().notNull(),
  sessionId: varchar("session_id", { length: 36 }).notNull().references(() => chatSessions.id, { onDelete: 'cascade' }),
  userId: varchar("user_id", { length: 36 }).notNull().references(() => users.id, { onDelete: 'cascade' }),
  tenantId: varchar("tenant_id", { length: 36 }).references(() => tenants.id, { onDelete: 'cascade' }),
  reason: text("reason"), // 转人工原因
  status: varchar("status", { length: 20 }).default("pending").notNull(), // pending, handled, closed
  handledBy: varchar("handled_by", { length: 36 }), // 处理人ID
  handledAt: timestamp("handled_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("idx_chat_transfer_logs_session_id").on(table.sessionId),
  index("idx_chat_transfer_logs_user_id").on(table.userId),
  index("idx_chat_transfer_logs_status").on(table.status),
  index("idx_chat_transfer_logs_created_at").on(table.createdAt),
]);

// 类型导出
export type ChatSession = typeof chatSessions.$inferSelect;
export type InsertChatSession = typeof chatSessions.$inferInsert;
export type ChatMessage = typeof chatMessages.$inferSelect;
export type InsertChatMessage = typeof chatMessages.$inferInsert;
export type ChatQuestionStats = typeof chatQuestionStats.$inferSelect;
export type InsertChatQuestionStats = typeof chatQuestionStats.$inferInsert;
export type ChatTransferLog = typeof chatTransferLogs.$inferSelect;
export type InsertChatTransferLog = typeof chatTransferLogs.$inferInsert;
