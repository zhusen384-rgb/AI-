import { pgTable, serial, text, timestamp, integer, jsonb, boolean } from 'drizzle-orm/pg-core';
import type { PositionVetoRule } from '@/lib/position-veto-rules';

// 面试官表
export const interviewers = pgTable('interviewers', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  role: text('role').notNull(), // HR, 技术负责人, 招聘经理
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

// 岗位表
export const positions = pgTable('positions', {
  id: serial('id').primaryKey(),
  title: text('title').notNull(),
  department: text('department').notNull(),
  jobDescription: text('job_description').notNull(), // JD
  coreRequirements: jsonb('core_requirements').notNull(), // 核心能力要求 [{type: 'hard_skill', name: 'Java', required: true}]
  softSkills: jsonb('soft_skills').notNull(), // 软技能要求 ['团队协作', '沟通能力']
  education: text('education').notNull(), // 学历要求
  experience: text('experience').notNull(), // 经验要求
  interviewerPreferences: jsonb('interviewer_preferences'), // 面试官偏好 {focusAreas: ['技术深度', '项目经验'], questionStyle: '深入', additionalNotes: '...'}
  vetoRules: jsonb('veto_rules').$type<PositionVetoRule[]>().default([]), // 一票否决规则
  status: text('status').notNull().default('active'), // active, closed
  createdBy: integer('created_by').notNull(), // 创建者ID
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

// 候选人表
export const candidates = pgTable('candidates', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  gender: text('gender'),
  school: text('school'),
  major: text('major'),
  education: text('education'),
  phone: text('phone'),
  email: text('email'),
  position: text('position'),
  status: text('status').notNull().default('pending'), // pending, interviewing, passed, rejected
  source: text('source'), // 招聘渠道
  resumeUploaded: boolean('resume_uploaded').notNull().default(false),
  resumeFileName: text('resume_file_name'),
  resumeFileKey: text('resume_file_key'),
  resumeDownloadUrl: text('resume_download_url'),
  resumeParsedData: jsonb('resume_parsed_data'),
  resumeUploadedAt: text('resume_uploaded_at'),
  interviewStage: text('interview_stage').notNull().default('pending'),
  initialInterviewPassed: text('initial_interview_passed'),
  secondInterviewPassed: text('second_interview_passed'),
  finalInterviewPassed: text('final_interview_passed'),
  isHired: boolean('is_hired').notNull().default(false),
  initialInterviewTime: text('initial_interview_time'),
  secondInterviewTime: text('second_interview_time'),
  finalInterviewTime: text('final_interview_time'),
  initialInterviewEvaluation: text('initial_interview_evaluation'),
  secondInterviewEvaluation: text('second_interview_evaluation'),
  finalInterviewEvaluation: text('final_interview_evaluation'),
  // 创建者信息（全域共享 + 创建者专属编辑权限）
  createdById: text('created_by_id'), // 创建者用户ID
  createdByName: text('created_by_name'), // 创建者姓名
  createdByUsername: text('created_by_username'), // 创建者用户名
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

// 简历表
export const resumes = pgTable('resumes', {
  id: serial('id').primaryKey(),
  candidateId: integer('candidate_id').notNull(),
  fileName: text('file_name').notNull(),
  fileUrl: text('file_url').notNull(), // 对象存储URL
  parsedData: jsonb('parsed_data'), // 解析后的简历数据
  conflictMarkers: jsonb('conflict_markers'), // 冲突信息标记
  // 简历全文搜索支持
  resumeText: text('resume_text'), // 简历纯文本内容（用于全文搜索）
  keywords: text('keywords'), // 提取的关键词（逗号分隔）
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

// 面试记录表
export const interviews = pgTable('interviews', {
  id: serial('id').primaryKey(),
  candidateId: integer('candidate_id').notNull(),
  positionId: integer('position_id').notNull(),
  interviewerId: integer('interviewer_id').notNull(),
  resumeId: integer('resume_id').notNull(),
  status: text('status').notNull().default('scheduled'), // scheduled, in_progress, completed, cancelled
  scheduledTime: timestamp('scheduled_time'),
  startTime: timestamp('start_time'),
  endTime: timestamp('end_time'),
  notes: text('notes'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

// 面试问题表
export const interviewQuestions = pgTable('interview_questions', {
  id: serial('id').primaryKey(),
  interviewId: integer('interview_id').notNull(),
  type: text('type').notNull(), // basic, skill, gap, scenario, other
  category: text('category').notNull(), // hard_skill, soft_skill, experience
  question: text('question').notNull(),
  followUpQuestions: jsonb('follow_up_questions'), // 追问列表
  targetSkill: text('target_skill'), // 考察目标
  difficulty: text('difficulty').notNull(), // easy, medium, hard
  order: integer('order').notNull(),
  isUsed: boolean('is_used').notNull().default(false),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

// 面试回答表
export const interviewAnswers = pgTable('interview_answers', {
  id: serial('id').primaryKey(),
  interviewId: integer('interview_id').notNull(),
  questionId: integer('question_id').notNull(),
  answer: text('answer'),
  followUpAnswers: jsonb('follow_up_answers'), // 追问的答案
  recordingUrl: text('recording_url'), // 录音文件URL
  timestamp: timestamp('timestamp').notNull().defaultNow(),
});

// 面试评估表
export const interviewEvaluations = pgTable('interview_evaluations', {
  id: serial('id').primaryKey(),
  interviewId: integer('interview_id').notNull().primaryKey(),
  // 核心维度评分 (0-10分)
  hardSkillScore: integer('hard_skill_score').notNull().default(0),
  experienceScore: integer('experience_score').notNull().default(0),
  communicationScore: integer('communication_score').notNull().default(0),
  problemSolvingScore: integer('problem_solving_score').notNull().default(0),
  professionalismScore: integer('professionalism_score').notNull().default(0),
  teamCollaborationScore: integer('team_collaboration_score').notNull().default(0),
  learningAbilityScore: integer('learning_ability_score').notNull().default(0),
  stressResistanceScore: integer('stress_resistance_score').notNull().default(0),
  
  // 候选人优势
  strengths: jsonb('strengths').notNull(), // [{dimension: '硬技能', score: 8, description: '...'}]
  // 候选人劣势
  weaknesses: jsonb('weaknesses').notNull(), // [{dimension: '经验', score: 6, description: '...'}]
  // 候选人意向度
  intention: text('intention').notNull(), // high, medium, low
  // 岗位适配度
  fitScore: integer('fit_score').notNull(), // 总分 0-100
  fitVerdict: text('fit_verdict').notNull(), // 是/否
  fitReason: text('fit_reason').notNull(),
  // 复试建议
  retestRecommendation: text('retest_recommendation'),
  retestFocus: jsonb('retest_focus'), // 需要重点考察的能力
  concerns: jsonb('concerns'), // 需要关注的问题点
  highlights: jsonb('highlights'), // 亮点标记
  doubtPoints: jsonb('doubt_points'), // 需要验证的疑点
  
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export type Interviewer = typeof interviewers.$inferSelect;
export type Position = typeof positions.$inferSelect;
export type Candidate = typeof candidates.$inferSelect;
export type Resume = typeof resumes.$inferSelect;
export type Interview = typeof interviews.$inferSelect;
export type InterviewQuestion = typeof interviewQuestions.$inferSelect;
export type InterviewAnswer = typeof interviewAnswers.$inferSelect;
export type InterviewEvaluation = typeof interviewEvaluations.$inferSelect;

// 全AI面试配置表
export const fullAiInterviewConfigs = pgTable('full_ai_interview_configs', {
  id: serial('id').primaryKey(),
  linkId: text('link_id').notNull().unique(), // 分享链接的唯一标识
  candidateName: text('candidate_name').notNull(),
  mode: text('mode').notNull(), // 面试模式：ai_mock, ai_practice, full_ai
  position: text('position').notNull(), // 岗位
  resume: text('resume').notNull(), // 简历文本内容
  interviewTime: timestamp('interview_time'), // 面试时间
  interviewerVoice: text('interviewer_voice').notNull().default('steady_professional'), // AI面试官全局音色
  tenantId: text('tenant_id'),
  userId: text('user_id'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

// 全AI面试结果表
export const fullAiInterviewResults = pgTable('full_ai_interview_results', {
  id: serial('id').primaryKey(),
  linkId: text('link_id').notNull(), // 关联的配置 linkId
  interviewId: text('interview_id').notNull(), // 实际面试会话ID
  candidateName: text('candidate_name').notNull(),
  position: text('position').notNull(),
  evaluation: jsonb('evaluation').notNull(), // 评估结果 {isEliminated, overallScore5, overallScore100, categoryScores, summary, strengths, improvements, recommendation}
  recordingKey: text('recording_key'), // 录屏文件在对象存储中的 key
  recordingUrl: text('recording_url'), // 录屏文件签名 URL
  qaHistory: jsonb('qa_history'), // 面试问答记录 [{id, role, content, type, timestamp}]
  // 候选人状态监控
  candidateStatus: jsonb('candidate_status').notNull(), // 候选人状态信息
  tenantId: text('tenant_id'),
  userId: text('user_id'),
  // {
  //   overallStatus: 'normal' | 'warning' | 'cheating', // 整体状态
  //   summary: '面试过程中候选人表现正常，无明显异常', // 状态摘要
  //   events: [ // 状态事件列表
  //     {
  //       timestamp: '2026-02-11T12:00:00Z',
  //       type: 'cheating' | 'abnormal' | 'normal',
  //       severity: 'high' | 'medium' | 'low',
  //       description: '检测到多人出现在画面中',
  //       evidence: {faceCount: 2, duration: 5},
  //       roundNumber: 1
  //     }
  //   ],
  //   statistics: { // 统计信息
  //     totalDuration: 600, // 总面试时长（秒）
  //     normalDuration: 580, // 正常时长：检测到1张人脸，候选人表现正常
  //     abnormalDuration: 15, // 异常时长：未检测到人脸、长时间看别处、机械背诵感强、闭眼时间＞2秒、只露半张脸、长期低头/侧脸、多人交谈、画面被物品大面积遮挡等
  //     cheatingDuration: 5, // 作弊时长：检测到多张人脸、切换屏幕、分屏/浮窗等可疑行为
  //     faceDetectionRate: 0.95, // 人脸检测率 = (正常时长 / 总时长) × 100%
  //     faceLostCount: 3, // 人脸丢失次数
  //     multipleFaceCount: 2, // 多人出现次数
  //     suspiciousActions: 1 // 可疑行为次数
  //   }
  // }
  completedAt: timestamp('completed_at').notNull(), // 面试完成时间
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export type FullAiInterviewConfig = typeof fullAiInterviewConfigs.$inferSelect;
export type FullAiInterviewResult = typeof fullAiInterviewResults.$inferSelect;

// 面试会话表（用于存储全AI面试的临时会话数据）
export const interviewSessions = pgTable('interview_sessions', {
  id: serial('id').primaryKey(),
  interviewId: text('interview_id').notNull().unique(), // 会话ID
  linkId: text('link_id').notNull(), // 关联的配置 linkId
  candidateName: text('candidate_name').notNull(),
  mode: text('mode').notNull(), // 面试模式：junior, senior, advanced
  position: text('position').notNull(), // 岗位
  positionId: text('position_id').notNull(), // 岗位ID
  resume: text('resume').notNull(), // 简历文本内容
  resumeParsedData: jsonb('resume_parsed_data'), // 结构化的简历解析数据
  candidateStatus: jsonb('candidate_status'), // 候选人状态监控信息
  messages: jsonb('messages').notNull(), // 会话消息历史
  interviewStage: integer('interview_stage').notNull().default(1), // 面试阶段：1-自我介绍，2-核心问题，3-结束阶段
  followUpCount: integer('follow_up_count').notNull().default(0), // 当前问题的追问次数
  currentQuestionCount: integer('current_question_count').notNull().default(0), // 核心问题数量
  scoreRuleSnapshot: jsonb('score_rule_snapshot'),
  dimensionCoverage: jsonb('dimension_coverage'),
  requiredQuestionState: jsonb('required_question_state'),
  currentQuestionMeta: jsonb('current_question_meta'),
  askedQuestionKeys: jsonb('asked_question_keys').$type<string[]>(),
  // 技术基础能力题目相关字段（智能体管培生岗位）
  technicalQuestionIds: jsonb('technical_question_ids').$type<number[]>(), // 已抽取的技术题目ID列表
  technicalQuestionsAsked: integer('technical_questions_asked').default(0), // 已问的技术题目数量
  isCurrentQuestionTechnical: boolean('is_current_question_technical').default(false), // 当前问题是否是技术题
  // 规则题库相关字段（适用于所有岗位）
  ruleQuestionBank: jsonb('rule_question_bank'), // 从规则题库中抽取的题目列表
  ruleQuestionBankAsked: integer('rule_question_bank_asked').default(0), // 已问的规则题库题目数量
  isCurrentQuestionFromBank: boolean('is_current_question_from_bank').default(false), // 当前问题是否来自规则题库
  startTime: timestamp('start_time').notNull(),
  tenantId: text('tenant_id'),
  userId: text('user_id'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export type InterviewSession = typeof interviewSessions.$inferSelect;

// 全AI面试统计表
export const fullAiInterviewStatistics = pgTable('full_ai_interview_statistics', {
  id: serial('id').primaryKey(),
  linkId: text('link_id').notNull(), // 面试链接ID（唯一的分享链接标识）
  interviewId: text('interview_id').notNull(), // 实际面试会话ID
  candidateName: text('candidate_name').notNull(), // 候选人姓名
  position: text('position').notNull(), // 岗位
  mode: text('mode').notNull(), // 面试模式：junior, senior, advanced
  interviewTime: timestamp('interview_time').notNull(), // 面试开始时间
  meetingLink: text('meeting_link').notNull(), // 会议链接
  meetingId: text('meeting_id').notNull(), // 会议ID
  status: text('status').notNull().default('in_progress'), // 状态：in_progress, completed, cancelled
  tenantId: text('tenant_id'),
  userId: text('user_id'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export type FullAiInterviewStatistics = typeof fullAiInterviewStatistics.$inferSelect;

// 模型配置表（用于存储不同场景的 AI 模型配置）
export const modelConfigs = pgTable('model_configs', {
  id: serial('id').primaryKey(),
  // 场景标识：interview_dialog（面试对话）、evaluation（评估打分）、resume_parse（简历解析）
  scene: text('scene').notNull().unique(),
  // 场景名称（中文描述）
  sceneName: text('scene_name').notNull(),
  // 当前使用的模型 ID
  modelId: text('model_id').notNull(),
  // 模型名称（中文描述）
  modelName: text('model_name').notNull(),
  // 场景描述
  description: text('description'),
  // 是否启用
  enabled: boolean('enabled').notNull().default(true),
  // 创建时间
  createdAt: timestamp('created_at').notNull().defaultNow(),
  // 更新时间
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export type ModelConfig = typeof modelConfigs.$inferSelect;

// 简历批量解析任务表
export const resumeParseTasks = pgTable('resume_parse_tasks', {
  id: serial('id').primaryKey(),
  // 用户ID（同一用户只保留一个有效任务）
  userId: text('user_id').notNull(),
  // 租户ID
  tenantId: text('tenant_id'),
  // 任务状态：pending（等待处理）、processing（处理中）、completed（已完成）、failed（失败）
  status: text('status').notNull().default('pending'),
  // 总文件数
  totalCount: integer('total_count').notNull().default(0),
  // 已处理数量
  processedCount: integer('processed_count').notNull().default(0),
  // 成功数量
  successCount: integer('success_count').notNull().default(0),
  // 失败数量
  failedCount: integer('failed_count').notNull().default(0),
  // 解析结果列表（JSON数组）
  results: jsonb('results').notNull().$type<ResumeParseResult[]>(),
  // 错误信息
  errorMessage: text('error_message'),
  // 创建时间
  createdAt: timestamp('created_at').notNull().defaultNow(),
  // 更新时间
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

// 解析结果类型
export interface ResumeParseResult {
  id: string; // 唯一标识
  fileName: string; // 文件名
  fileKey?: string; // 对象存储key
  downloadUrl?: string; // 下载URL
  status: 'pending' | 'processing' | 'success' | 'failed' | 'duplicate'; // 状态
  // 提取的联系信息
  extractedInfo?: {
    name: string;
    phone: string;
    email: string;
  };
  // 解析后的简历数据
  parsedData?: any;
  // 提取出的原始简历文本
  extractedContent?: string;
  // 错误信息
  errorMessage?: string;
  // 重复检测信息
  duplicateInfo?: {
    existingCandidateId: number;
    existingCandidateName: string;
    existingCandidatePhone: string;
  };
  // 处理时间
  processedAt?: string;
}

export type ResumeParseTask = typeof resumeParseTasks.$inferSelect;
