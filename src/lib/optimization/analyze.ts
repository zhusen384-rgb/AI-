/**
 * 模式分析模块
 * 分析评估记录，识别误判模式，生成优化建议
 */

import { getMisclassifiedRecords, getRecentEvaluationRecords, getOptimizationData } from './collect-data';
import { OPTIMIZATION_CONFIG } from './config';

/**
 * 分析误判模式
 */
export async function analyzeMisclassificationPatterns() {
  const misclassifiedRecords = await getMisclassifiedRecords();
  
  if (misclassifiedRecords.length === 0) {
    console.log('✅ 没有发现误判案例');
    return {
      hasPattern: false,
      patterns: [],
      recommendation: '模型表现良好，无需优化'
    };
  }
  
  console.log(`📊 发现 ${misclassifiedRecords.length} 个误判案例，开始分析...`);
  
  // 统计误判类型
  const falsePositives = misclassifiedRecords.filter(r => r.misclassificationType === 'false_positive');
  const falseNegatives = misclassifiedRecords.filter(r => r.misclassificationType === 'false_negative');
  
  // 分析误判分数区间
  const fpScores = falsePositives.map(r => r.aiMatchScore);
  const fnScores = falseNegatives.map(r => r.aiMatchScore);
  
  const patterns = [];
  
  // 模式1: 假阳性分析（高分被拒）
  if (falsePositives.length > 0) {
    const avgFpScore = fpScores.reduce((a, b) => a + b, 0) / fpScores.length;
    const minFpScore = Math.min(...fpScores);
    const maxFpScore = Math.max(...fpScores);
    
    patterns.push({
      type: 'false_positive',
      count: falsePositives.length,
      avgScore: Math.round(avgFpScore),
      scoreRange: `${minFpScore}-${maxFpScore}`,
      description: `${falsePositives.length}个案例中，AI给出的匹配度分数过高（${Math.round(avgFpScore)}分），但实际被淘汰`,
      suggestion: avgFpScore > 80 
        ? '需要降低高分阈值或优化对高匹配度的判断逻辑'
        : '需要调整评分权重，减少某些维度的过度评分'
    });
  }
  
  // 模式2: 假阴性分析（低分被录）
  if (falseNegatives.length > 0) {
    const avgFnScore = fnScores.reduce((a, b) => a + b, 0) / fnScores.length;
    const minFnScore = Math.min(...fnScores);
    const maxFnScore = Math.max(...fnScores);
    
    patterns.push({
      type: 'false_negative',
      count: falseNegatives.length,
      avgScore: Math.round(avgFnScore),
      scoreRange: `${minFnScore}-${maxFnScore}`,
      description: `${falseNegatives.length}个案例中，AI给出的匹配度分数过低（${Math.round(avgFnScore)}分），但实际被录用`,
      suggestion: avgFnScore < 50
        ? '需要提升低分评估的准确性，避免低估候选人的实际能力'
        : '需要增加某些维度的评分权重，如面试表现、软技能等'
    });
  }
  
  // 计算总体误判率
  const totalRecords = await getRecentEvaluationRecords(1000);
  const misclassificationRate = (misclassifiedRecords.length / totalRecords.length) * 100;
  
  const hasPattern = misclassificationRate > OPTIMIZATION_CONFIG.THRESHOLDS.ACCEPTABLE_ERROR_RATE;
  
  console.log('📊 误判模式分析完成:');
  console.log('   误判总数:', misclassifiedRecords.length);
  console.log('   误判率:', `${misclassificationRate.toFixed(2)}%`);
  console.log('   发现模式:', patterns.length);
  
  return {
    hasPattern,
    misclassificationRate,
    patterns,
    recommendation: hasPattern 
      ? `误判率 ${misclassificationRate.toFixed(2)}% 超过阈值，建议进行模型优化`
      : '误判率在可接受范围内，无需优化'
  };
}

/**
 * 生成 Few-shot 示例
 */
export async function generateFewShotExamples() {
  const misclassifiedRecords = await getMisclassifiedRecords();
  
  if (misclassifiedRecords.length < OPTIMIZATION_CONFIG.SAMPLING.MIN_SAMPLE_SIZE) {
    console.log('⚠️  样本量不足，无法生成 Few-shot 示例');
    return {
      success: false,
      reason: '样本量不足',
      examples: []
    };
  }
  
  console.log(`🎯 生成 Few-shot 示例，基于 ${misclassifiedRecords.length} 个误判案例`);
  
  // 采样：按误判类型分组，各取 3-5 个
  const falsePositives = misclassifiedRecords.filter(r => r.misclassificationType === 'false_positive')
    .slice(0, OPTIMIZATION_CONFIG.SAMPLING.FEW_SHOT_COUNT);
  const falseNegatives = misclassifiedRecords.filter(r => r.misclassificationType === 'false_negative')
    .slice(0, OPTIMIZATION_CONFIG.SAMPLING.FEW_SHOT_COUNT);
  
  const examples: any[] = [];
  
  // 生成假阳性示例
  falsePositives.forEach(record => {
    examples.push({
      type: 'false_positive',
      aiScore: record.aiMatchScore,
      actualDecision: record.finalDecision,
      aiEvaluation: record.aiEvaluation,
      interviewScores: record.interviewScores,
      lesson: `此案例AI评分 ${record.aiMatchScore}，但实际被${record.finalDecision === 'hired' ? '录用' : '淘汰'}。原因：${record.decisionReason || '未提供'}`
    });
  });
  
  // 生成假阴性示例
  falseNegatives.forEach(record => {
    examples.push({
      type: 'false_negative',
      aiScore: record.aiMatchScore,
      actualDecision: record.finalDecision,
      aiEvaluation: record.aiEvaluation,
      interviewScores: record.interviewScores,
      lesson: `此案例AI评分 ${record.aiMatchScore}，但实际被${record.finalDecision === 'hired' ? '录用' : '淘汰'}。原因：${record.decisionReason || '未提供'}`
    });
  });
  
  console.log(`✅ 生成了 ${examples.length} 个 Few-shot 示例`);
  
  return {
    success: true,
    examples,
    count: examples.length
  };
}

/**
 * 计算模型当前性能指标
 */
export async function calculateModelMetrics() {
  const records = await getOptimizationData();
  
  if (records.length < 10) {
    console.log('⚠️  数据不足，无法计算准确的性能指标');
    return {
      accuracy: 0,
      errorRate: 100,
      avgPredictionError: 0,
      confidence: 'low'
    };
  }
  
  // 计算准确率（允许误差范围内算正确）
  const correctPredictions = records.filter(
    r => r.predictionError !== null && r.predictionError <= OPTIMIZATION_CONFIG.THRESHOLDS.MARGIN_OF_ERROR
  ).length;
  const accuracy = (correctPredictions / records.length) * 100;
  
  // 计算平均预测误差
  const totalError = records.reduce((sum, r) => sum + (r.predictionError || 0), 0);
  const avgPredictionError = totalError / records.length;
  
  // 计算误判率
  const misclassifiedCount = records.filter(r => r.isMisclassified).length;
  const errorRate = (misclassifiedCount / records.length) * 100;
  
  // 置信度
  let confidence = 'low';
  if (records.length >= 50) confidence = 'medium';
  if (records.length >= 100) confidence = 'high';
  
  console.log('📊 模型性能指标:');
  console.log('   总样本数:', records.length);
  console.log('   准确率:', `${accuracy.toFixed(2)}%`);
  console.log('   误判率:', `${errorRate.toFixed(2)}%`);
  console.log('   平均预测误差:', `${avgPredictionError.toFixed(2)}`);
  console.log('   置信度:', confidence);
  
  return {
    accuracy,
    errorRate,
    avgPredictionError,
    confidence,
    sampleSize: records.length
  };
}

/**
 * 判断是否需要优化
 */
export async function shouldOptimize() {
  const metrics = await calculateModelMetrics();
  const patterns = await analyzeMisclassificationPatterns();
  
  const needsOptimization = 
    metrics.errorRate > OPTIMIZATION_CONFIG.THRESHOLDS.ACCEPTABLE_ERROR_RATE ||
    patterns.hasPattern ||
    (metrics.confidence !== 'low' && metrics.accuracy < OPTIMIZATION_CONFIG.THRESHOLDS.MIN_ACCURACY);
  
  return {
    shouldOptimize: needsOptimization,
    metrics,
    patterns,
    reason: needsOptimization 
      ? `误判率 ${metrics.errorRate.toFixed(2)}% 超过阈值 ${OPTIMIZATION_CONFIG.THRESHOLDS.ACCEPTABLE_ERROR_RATE}%，或存在明显的误判模式`
      : '模型表现良好，无需优化'
  };
}
