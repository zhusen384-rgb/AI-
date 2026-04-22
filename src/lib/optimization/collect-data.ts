/**
 * 数据收集模块
 * 用于收集简历评估记录，为模型优化提供数据
 */

import { getDb } from 'coze-coding-dev-sdk';
import { OPTIMIZATION_CONFIG } from './config';
import { resumeEvaluationRecords } from '../../storage/database/shared/schema';
import { eq, desc, and, sql } from 'drizzle-orm';
import * as schema from '../../storage/database/shared/schema';

/**
 * 记录简历评估结果
 * 在简历解析完成后调用
 */
export async function recordResumeEvaluation(params: {
  candidateId: number;
  resumeId: number;
  positionId: number;
  aiMatchScore: number;
  aiEvaluation: any;
  evaluationStage?: 'resume_screening' | 'final_evaluation';
}) {
  const db = await getDb(schema);

  try {
    const result = await db.insert(resumeEvaluationRecords).values({
      candidateId: params.candidateId,
      resumeId: params.resumeId,
      positionId: params.positionId,
      aiMatchScore: params.aiMatchScore,
      aiEvaluation: params.aiEvaluation,
      evaluationStage: params.evaluationStage || 'resume_screening',
      evaluatedAt: new Date().toISOString(),
    }).returning({ id: resumeEvaluationRecords.id });

    console.log('✅ 记录简历评估结果成功，ID:', result[0].id);
    console.log('   评估阶段:', params.evaluationStage || 'resume_screening');
    return result[0].id;
  } catch (error) {
    console.error('❌ 记录简历评估结果失败:', error);
    throw error;
  }
}

/**
 * 更新面试官评价
 * 在面试决策后调用
 */
export async function updateInterviewDecision(params: {
  evaluationRecordId: number;
  finalDecision: 'hired' | 'rejected' | 'pending';
  decisionReason?: string;
  decisionMadeBy?: number;
  interviewScores?: any;
}) {
  const db = await getDb(schema);
  
  try {
    // 获取现有记录
    const records = await db
      .select()
      .from(resumeEvaluationRecords)
      .where(eq(resumeEvaluationRecords.id, params.evaluationRecordId))
      .limit(1);
    
    if (records.length === 0) {
      throw new Error('评估记录不存在');
    }
    
    const record = records[0];
    const aiScore = record.aiMatchScore;
    
    // 计算实际分数（hired=100, rejected=0, pending=50）
    const actualScore = params.finalDecision === 'hired' ? 100 : 
                       params.finalDecision === 'rejected' ? 0 : 50;
    
    // 计算预测误差
    const predictionError = Math.abs(aiScore - actualScore);
    
    // 判断是否误判
    const isMisclassified = predictionError > OPTIMIZATION_CONFIG.THRESHOLDS.MARGIN_OF_ERROR;
    
    // 判断误判类型
    let misclassificationType: 'false_positive' | 'false_negative' | null = null;
    if (isMisclassified) {
      if (aiScore > OPTIMIZATION_CONFIG.THRESHOLDS.HIGH_SCORE && params.finalDecision === 'rejected') {
        misclassificationType = 'false_positive'; // 高分被拒
      } else if (aiScore < OPTIMIZATION_CONFIG.THRESHOLDS.LOW_SCORE && params.finalDecision === 'hired') {
        misclassificationType = 'false_negative'; // 低分被录
      }
    }
    
    // 更新记录
    const result = await db
      .update(resumeEvaluationRecords)
      .set({
        interviewScores: params.interviewScores,
        finalDecision: params.finalDecision,
        decisionReason: params.decisionReason,
        decisionMadeBy: params.decisionMadeBy,
        decisionMadeAt: new Date().toISOString(),
        predictionError,
        isMisclassified,
        misclassificationType,
      })
      .where(eq(resumeEvaluationRecords.id, params.evaluationRecordId))
      .returning();
    
    const updatedRecord = result[0];
    console.log('✅ 更新面试决策成功');
    console.log('   AI 评分:', aiScore);
    console.log('   实际决策:', params.finalDecision);
    console.log('   预测误差:', predictionError);
    console.log('   是否误判:', isMisclassified);
    if (misclassificationType) {
      console.log('   误判类型:', misclassificationType);
    }
    
    return updatedRecord;
  } catch (error) {
    console.error('❌ 更新面试决策失败:', error);
    throw error;
  }
}

/**
 * 获取最近的评估记录
 */
export async function getRecentEvaluationRecords(limit: number = 50) {
  const db = await getDb(schema);
  
  try {
    const records = await db
      .select()
      .from(resumeEvaluationRecords)
      .where(sql`${resumeEvaluationRecords.finalDecision} IS NOT NULL`)
      .orderBy(desc(resumeEvaluationRecords.evaluatedAt))
      .limit(limit);
    
    return records;
  } catch (error) {
    console.error('❌ 获取评估记录失败:', error);
    throw error;
  }
}

/**
 * 获取误判案例
 */
export async function getMisclassifiedRecords() {
  const db = await getDb(schema);
  
  const timeRangeThreshold = new Date();
  timeRangeThreshold.setDate(timeRangeThreshold.getDate() - OPTIMIZATION_CONFIG.SAMPLING.TIME_RANGE_DAYS);
  
  try {
    const records = await db
      .select()
      .from(resumeEvaluationRecords)
      .where(
        and(
          eq(resumeEvaluationRecords.isMisclassified, true),
          sql`${resumeEvaluationRecords.evaluatedAt} > ${timeRangeThreshold}`
        )
      )
      .orderBy(desc(resumeEvaluationRecords.evaluatedAt));
    
    return records;
  } catch (error) {
    console.error('❌ 获取误判案例失败:', error);
    throw error;
  }
}

/**
 * 获取优化所需的数据样本
 */
export async function getOptimizationData() {
  const db = await getDb(schema);
  
  const timeRangeThreshold = new Date();
  timeRangeThreshold.setDate(timeRangeThreshold.getDate() - OPTIMIZATION_CONFIG.SAMPLING.TIME_RANGE_DAYS);
  
  try {
    const records = await db
      .select()
      .from(resumeEvaluationRecords)
      .where(
        and(
          sql`${resumeEvaluationRecords.finalDecision} IS NOT NULL`,
          sql`${resumeEvaluationRecords.evaluatedAt} > ${timeRangeThreshold}`
        )
      )
      .orderBy(desc(resumeEvaluationRecords.evaluatedAt))
      .limit(OPTIMIZATION_CONFIG.SAMPLING.MAX_SAMPLE_SIZE);
    
    return records;
  } catch (error) {
    console.error('❌ 获取优化数据失败:', error);
    throw error;
  }
}
