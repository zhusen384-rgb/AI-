/**
 * 模型优化模块
 * 基于分析结果，生成优化后的 Prompt 和配置
 */

import { calculateModelMetrics, generateFewShotExamples, analyzeMisclassificationPatterns } from './analyze';
import { OPTIMIZATION_CONFIG } from './config';
import { getDb } from 'coze-coding-dev-sdk';
import { modelOptimizationHistory } from '../../storage/database/shared/schema';
import { eq } from 'drizzle-orm';
import * as schema from '../../storage/database/shared/schema';

/**
 * 生成优化后的 Prompt
 */
export async function generateOptimizedPrompt(
  currentPrompt: string,
  analysis: any,
  evaluationStage: 'resume_screening' | 'final_evaluation' = 'resume_screening'
) {
  console.log(`🎯 开始生成优化后的 Prompt (${evaluationStage})...`);

  const examples = analysis.examples || [];

  // 根据评估阶段选择不同的系统 Prompt
  let systemPrompt: string;
  if (evaluationStage === 'resume_screening') {
    systemPrompt = OPTIMIZATION_CONFIG.RESUME_SCREENING_PROMPT;
  } else {
    systemPrompt = OPTIMIZATION_CONFIG.FINAL_EVALUATION_PROMPT;
  }

  // 添加 Few-shot 示例
  const fewShotSection = examples.length > 0 ? `

以下是历史误判案例的学习示例，请从中吸取经验：

${examples.map((ex: any, i: number) => `
示例 ${i + 1} (${ex.type === 'false_positive' ? '高分被拒' : '低分被录'}):
- AI 评分: ${ex.aiScore}分
- 实际决策: ${ex.actualDecision}
- 经验教训: ${ex.lesson}
`).join('\n')}
` : '';

  const optimizedPrompt = `${systemPrompt}${fewShotSection}

${currentPrompt}`;

  console.log('✅ 优化 Prompt 生成完成');
  return optimizedPrompt;
}

/**
 * 生成优化后的权重配置
 */
export async function generateOptimizedWeights(
  currentWeights: any,
  patterns: any,
  evaluationStage: 'resume_screening' | 'final_evaluation' = 'resume_screening'
) {
  console.log(`🎯 开始生成优化后的权重配置 (${evaluationStage})...`);

  const newWeights = { ...currentWeights };

  // 根据误判模式和评估阶段调整权重
  patterns.patterns.forEach((pattern: any) => {
    if (evaluationStage === 'resume_screening') {
      // 简历初筛阶段：不包含面试表现
      if (pattern.type === 'false_positive') {
        // 假阳性：简历分高但实际被拒
        // 可能原因：过度评估了简历内容，忽略了实际能力
        newWeights.technicalSkills *= 0.9;      // 降低技术技能权重
        newWeights.projectExperience *= 0.9;    // 降低项目经验权重
        newWeights.companyBackground *= 0.8;    // 降低公司背景权重
        newWeights.overall *= 1.2;              // 提高综合评估权重
      } else if (pattern.type === 'false_negative') {
        // 假阴性：简历分低但实际被录
        // 可能原因：过度强调硬性条件，忽略了实际能力
        newWeights.education *= 0.8;            // 降低学历权重
        newWeights.certificates *= 0.8;         // 降低证书权重
        newWeights.overall *= 1.3;              // 提高综合评估权重
      }
    } else if (evaluationStage === 'final_evaluation') {
      // 综合评估阶段：包含面试表现
      if (pattern.type === 'false_positive') {
        // 假阳性：综合评分高但实际被拒
        // 可能原因：过度评估了简历，忽略了面试表现或软技能
        newWeights.resumeScore *= 0.7;          // 降低简历分数权重
        newWeights.technicalSkills *= 0.9;     // 降低技术能力权重
        newWeights.communication *= 1.2;       // 提高沟通能力权重
        newWeights.cultureFit *= 1.3;           // 提高文化匹配度权重
      } else if (pattern.type === 'false_negative') {
        // 假阴性：综合评分低但实际被录
        // 可能原因：过度强调某些维度，忽略了潜力和态度
        newWeights.attitude *= 1.3;             // 提高工作态度权重
        newWeights.potential *= 1.4;            // 提高潜力权重
      }
    }
  });

  // 归一化权重
  const totalWeight = Object.values(newWeights).reduce((sum: number, val: any) => sum + val, 0);
  Object.keys(newWeights).forEach(key => {
    (newWeights as any)[key] = parseFloat(((newWeights as any)[key] / totalWeight * 100).toFixed(2));
  });

  console.log('✅ 优化权重生成完成');
  console.log('   评估阶段:', evaluationStage);
  console.log('   新权重:', JSON.stringify(newWeights, null, 2));

  return newWeights;
}

/**
 * 评估新模型性能（模拟）
 */
export async function evaluateNewModel(
  newPrompt: string,
  newWeights: any,
  testData: any[]
): Promise<{ accuracy: number; improvement: number }> {
  console.log('🧪 开始评估新模型性能...');
  
  // 在实际场景中，这里应该使用新模型重新评估历史数据
  // 这里使用模拟的方式计算预期改进
  const patternAnalysis = await analyzeMisclassificationPatterns();
  
  // 预期改进：基于误判率的减少
  const currentErrorRate = patternAnalysis.misclassificationRate || 0;
  const expectedImprovement = Math.min(currentErrorRate * 0.3, 15); // 最多改进15%
  
  const newAccuracy = 100 - (currentErrorRate - expectedImprovement);
  const improvement = expectedImprovement;
  
  console.log('🧪 新模型性能评估完成:');
  console.log('   预期准确率:', `${newAccuracy.toFixed(2)}%`);
  console.log('   预期改进:', `${improvement.toFixed(2)}%`);
  
  return {
    accuracy: newAccuracy,
    improvement
  };
}

/**
 * 执行模型优化
 */
export async function performOptimization(
  currentPrompt: string,
  currentWeights: any,
  testData: any[],
  evaluationStage: 'resume_screening' | 'final_evaluation' = 'resume_screening'
) {
  console.log(`🚀 开始执行模型优化 (${evaluationStage})...`);

  // 1. 分析误判模式
  const patterns = await analyzeMisclassificationPatterns();
  console.log('📊 误判模式分析完成');

  // 2. 生成 Few-shot 示例
  const fewShotResult = await generateFewShotExamples();
  console.log('📚 Few-shot 示例生成完成');

  // 3. 计算当前性能指标
  const currentMetrics = await calculateModelMetrics();
  console.log('📊 当前性能指标:', currentMetrics);

  // 4. 生成优化后的 Prompt
  const newPrompt = await generateOptimizedPrompt(currentPrompt, {
    examples: fewShotResult.examples,
    patterns,
    evaluationStage,
  });
  console.log('🎯 新 Prompt 生成完成');

  // 5. 生成优化后的权重
  const newWeights = await generateOptimizedWeights(currentWeights, patterns, evaluationStage);
  console.log('⚖️  新权重配置生成完成');

  // 6. 评估新模型性能
  const newMetrics = await evaluateNewModel(newPrompt, newWeights, testData);
  console.log('🧪 新模型评估完成');

  // 7. 判断优化是否有效
  const isValid =
    newMetrics.improvement >= OPTIMIZATION_CONFIG.THRESHOLDS.MIN_IMPROVEMENT &&
    testData.length >= OPTIMIZATION_CONFIG.SAMPLING.MIN_SAMPLE_SIZE;

  if (!isValid) {
    console.log('⚠️  优化效果不显著，放弃本次优化');
    return {
      success: false,
      reason: `预期改进 ${newMetrics.improvement.toFixed(2)}% 低于阈值 ${OPTIMIZATION_CONFIG.THRESHOLDS.MIN_IMPROVEMENT}%`
    };
  }
  
  // 8. 保存优化历史
  const db = await getDb(schema);
  const result = await db.insert(modelOptimizationHistory).values({
    oldPrompt: currentPrompt,
    oldWeights: currentWeights,
    oldAccuracy: currentMetrics,
    newPrompt: newPrompt,
    newWeights: newWeights,
    newAccuracy: newMetrics,
    accuracyImprovement: {
      current: currentMetrics.accuracy,
      new: newMetrics.accuracy,
      improvement: newMetrics.improvement
    },
    sampleSize: testData.length,
    timeRange: {
      start: testData[testData.length - 1]?.evaluatedAt,
      end: testData[0]?.evaluatedAt
    },
    status: 'pending',
    optimizationMethod: 'hybrid',
    notes: `基于 ${fewShotResult.count} 个误判案例的 Few-shot 学习 + 权重调整`
  }).returning();
  
  console.log('💾 优化历史已保存，ID:', result[0].id);
  console.log('✅ 模型优化完成！');
  
  return {
    success: true,
    optimizationId: result[0].id,
    newPrompt,
    newWeights,
    newMetrics,
    improvement: newMetrics.improvement
  };
}

/**
 * 部署优化后的模型
 */
export async function deployOptimization(optimizationId: number) {
  console.log(`🚀 开始部署优化模型 ID: ${optimizationId}...`);
  
  const db = await getDb(schema);
  
  const records = await db
    .select()
    .from(modelOptimizationHistory)
    .where(eq(modelOptimizationHistory.id, optimizationId))
    .limit(1);
  
  if (records.length === 0) {
    throw new Error('优化记录不存在');
  }
  
  const record = records[0];
  
  // 更新状态为已部署
  await db
    .update(modelOptimizationHistory)
    .set({
      status: 'deployed',
      deployedAt: new Date().toISOString()
    })
    .where(eq(modelOptimizationHistory.id, optimizationId));
  
  console.log('✅ 优化模型部署成功！');
  
  return {
    success: true,
    newPrompt: record.newPrompt,
    newWeights: record.newWeights,
    deployedAt: new Date()
  };
}

/**
 * 回滚到之前的版本
 */
export async function rollbackOptimization(optimizationId: number) {
  console.log(`🔄 开始回滚优化 ID: ${optimizationId}...`);
  
  const db = await getDb(schema);
  
  // 获取优化记录
  const records = await db
    .select()
    .from(modelOptimizationHistory)
    .where(eq(modelOptimizationHistory.id, optimizationId))
    .limit(1);
  
  if (records.length === 0) {
    throw new Error('优化记录不存在');
  }
  
  const record = records[0];
  
  // 更新状态为已回滚
  await db
    .update(modelOptimizationHistory)
    .set({
      status: 'rolled_back'
    })
    .where(eq(modelOptimizationHistory.id, optimizationId));
  
  console.log('✅ 优化已回滚！');
  
  return {
    success: true,
    oldPrompt: record.oldPrompt,
    oldWeights: record.oldWeights,
    rolledBackAt: new Date()
  };
}
