/**
 * 优化模块的 Drizzle ORM Schema
 */

import { pgTable, serial, integer, text, boolean, timestamp, jsonb } from 'drizzle-orm/pg-core';

/**
 * 简历评估记录表
 * 用于存储 AI 评估结果与实际面试决策的对比数据
 */
export const resumeEvaluationRecords = pgTable('resume_evaluation_records', {
  id: serial('id').primaryKey(),
  
  // 关联字段
  candidateId: integer('candidate_id').notNull(),
  resumeId: integer('resume_id').notNull(),
  positionId: integer('position_id').notNull(),
  
  // AI 评估结果
  aiMatchScore: integer('ai_match_score').notNull(),
  aiEvaluation: jsonb('ai_evaluation'), // JSON 对象，包含完整的评估结果
  
  // 面试官实际评价
  interviewScores: jsonb('interview_scores'), // JSON 对象，包含面试官各维度评分
  finalDecision: text('final_decision').notNull(), // hired, rejected, pending
  decisionReason: text('decision_reason'),
  decisionMadeBy: integer('decision_made_by'),
  
  // 差异分析
  predictionError: integer('prediction_error'), // |aiMatchScore - actualScore|
  isMisclassified: boolean('is_misclassified').default(false),
  misclassificationType: text('misclassification_type'), // false_positive, false_negative
  
  // 时间戳
  evaluatedAt: timestamp('evaluated_at').notNull(),
  decisionMadeAt: timestamp('decision_made_at'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

/**
 * 模型优化历史表
 * 用于记录每次模型优化的详细信息
 */
export const modelOptimizationHistory = pgTable('model_optimization_history', {
  id: serial('id').primaryKey(),
  
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
  deployedAt: timestamp('deployed_at'),
  
  // 元数据
  optimizationMethod: text('optimization_method').notNull(), // few_shot, weight_adjustment, hybrid
  notes: text('notes'),
  
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

// 导出类型
export type ResumeEvaluationRecord = typeof resumeEvaluationRecords.$inferSelect;
export type NewResumeEvaluationRecord = typeof resumeEvaluationRecords.$inferInsert;

export type ModelOptimizationHistory = typeof modelOptimizationHistory.$inferSelect;
export type NewModelOptimizationHistory = typeof modelOptimizationHistory.$inferInsert;
