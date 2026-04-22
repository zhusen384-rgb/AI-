/**
 * 简历匹配度计算模块
 * 使用权重方案计算简历与岗位的匹配度分数
 */

import { getDb } from 'coze-coding-dev-sdk';
import { RESUME_SCREENING_WEIGHTS, FINAL_EVALUATION_WEIGHTS } from './config';
import { recordResumeEvaluation } from './collect-data';
import { createCompatibleLlmClient } from '@/lib/ark-llm';
import { getModelId } from '@/lib/db/model-config-utils';

/**
 * 使用权重方案计算匹配度分数
 */
export async function calculateMatchScore(
  resumeContent: string,
  position: any,
  evaluationStage: 'resume_screening' | 'final_evaluation' = 'resume_screening',
  penaltyCoefficient: number = 1.0 // 降权系数，默认为1.0（无降权）
) {
  console.log('🎯 开始使用权重方案计算匹配度分数...');
  console.log('   评估阶段:', evaluationStage);
  console.log('   降权系数:', penaltyCoefficient);

  // 1. 使用 LLM 分析各个维度的匹配度（0-100分）
  const dimensionScores = await analyzeMatchDimensions(
    resumeContent,
    position,
    evaluationStage
  );

  console.log('📊 各维度评分:');
  console.log(JSON.stringify(dimensionScores, null, 2));

  // 2. 根据评估阶段选择权重配置
  const weights = evaluationStage === 'resume_screening'
    ? RESUME_SCREENING_WEIGHTS
    : FINAL_EVALUATION_WEIGHTS;

  // 3. 计算加权总分
  const totalScore = calculateWeightedScore(dimensionScores, weights);

  console.log('✅ 加权总分:', totalScore.toFixed(2));

  // 4. 应用降权系数
  let finalScore = totalScore;
  let penaltyInfo = null;

  if (penaltyCoefficient < 1.0) {
    finalScore = totalScore * penaltyCoefficient;
    penaltyInfo = {
      originalScore: totalScore,
      penaltyCoefficient,
      reducedScore: finalScore,
      reduction: totalScore - finalScore,
      conflictMarkers: []
    };
    console.log('⚠️  应用降权系数:');
    console.log(`   原始分数: ${totalScore.toFixed(2)}`);
    console.log(`   降权系数: ${penaltyCoefficient}`);
    console.log(`   最终分数: ${finalScore.toFixed(2)}`);
  }

  // 5. 四舍五入到整数
  finalScore = Math.round(finalScore);

  console.log('📊 最终匹配度分数:', finalScore);

  // 6. 返回详细结果
  return {
    matchScore: finalScore,
    dimensionScores,
    weightsUsed: weights,
    calculationSteps: {
      weightedScore: totalScore,
      penaltyInfo,
      finalScore
    }
  };
}

/**
 * 使用 LLM 分析各个维度的匹配度
 */
async function analyzeMatchDimensions(
  resumeContent: string,
  position: any,
  evaluationStage: 'resume_screening' | 'final_evaluation'
) {
  const client = createCompatibleLlmClient();

  // 根据评估阶段选择不同的提示词
  let prompt = '';
  if (evaluationStage === 'resume_screening') {
    prompt = generateResumeScreeningPrompt(resumeContent, position);
  } else {
    prompt = generateFinalEvaluationPrompt(resumeContent, position);
  }

  try {
    const evaluationModelId = await getModelId('evaluation');
    console.log('🧠 简历评分使用模型:', evaluationModelId);

    const response = await client.invoke([
      { role: 'system' as const, content: '你是一个专业的简历评估专家。请严格按照JSON格式输出，不要包含任何其他文字。' },
      { role: 'user' as const, content: prompt }
    ], {
      model: evaluationModelId,
      temperature: 0.3, // 降低温度，提高一致性
    });

    // 解析 JSON
    const safeJsonParse = (content: string) => {
      const trimmed = content.trim();
      try {
        return JSON.parse(trimmed);
      } catch (e) {
        const match = trimmed.match(/\{[\s\S]*?\}/);
        if (match) {
          return JSON.parse(match[0]);
        }
        throw new Error('无法解析JSON');
      }
    };

    const parsed = safeJsonParse(response.content);
    console.log('✅ LLM 各维度评分解析成功');

    return parsed;
  } catch (error) {
    console.error('❌ LLM 各维度评分失败:', error);
    throw error;
  }
}

/**
 * 生成简历初筛阶段的提示词
 */
function generateResumeScreeningPrompt(resumeContent: string, position: any) {
  const weights = RESUME_SCREENING_WEIGHTS;

  return `请分析以下简历与岗位的匹配度，评估各个维度的匹配度（0-100分）。

简历内容：
${resumeContent}

岗位信息：
- 岗位名称：${position.title}
- 部门：${position.department || '未指定'}
- 学历要求：${position.education || '未指定'}
- 经验要求：${position.experience || '未指定'}
- 岗位描述（JD）：
${position.jobDescription || '未提供'}

请按照以下权重配置评估各个维度：
1. 技术技能匹配度（${weights.technicalSkills}%）：候选人的技术栈与岗位要求的匹配程度
2. 工作经验相关性（${weights.experienceMatch}%）：工作年限、行业背景、职位相关性
3. 项目经验（${weights.projectExperience}%）：项目数量、复杂度、量化成果
4. 教育背景（${weights.education}%）：学历层次、学校排名、专业匹配度
5. 证书/奖项（${weights.certificates}%）：相关证书、获奖情况
6. 公司背景（${weights.companyBackground}%）：曾任职公司的行业地位
7. 核心技能匹配度（${weights.skillMatch}%）：JD中必备技能的覆盖情况
8. 关键词匹配度（${weights.keywordMatch}%）：岗位关键词的匹配程度

严格按照以下JSON格式输出：
{
  "technicalSkills": 85,
  "experienceMatch": 80,
  "projectExperience": 90,
  "education": 85,
  "certificates": 70,
  "companyBackground": 75,
  "skillMatch": 85,
  "keywordMatch": 90,
  "matchedItems": [
    {
      "requirement": "岗位要求的具体内容",
      "evidence": "简历中的匹配证据，需明确写出项目/工作经历/技能/量化结果"
    }
  ],
  "strengths": [
    {
      "area": "优势主题，如大模型与RAG技术能力/全栈工程化能力/项目落地能力",
      "description": "用完整一句话总结该优势，不能只写几个词",
      "evidence": "引用简历中的具体项目、工作职责、技术栈、量化结果作为证据"
    }
  ],
  "weaknesses": [
    {
      "area": "不足主题，如行业经验/向量库多样性/流程自动化深度",
      "description": "说明为什么这是潜在不足，以及它会影响什么",
      "gap": "明确写出缺失的技能、场景经验或落地能力"
    }
  ]
}

要求：
- 只输出JSON，无其他文字
- 每个维度评分为0-100的整数
- matchedItems 列出简历中与岗位要求匹配的具体内容，至少4-6项
  - requirement: 尽量直接复述岗位JD中的原始要求，而不是只写一个关键词
  - evidence: 必须引用简历中的具体证据，优先写清项目名称、技术栈、职责动作、量化结果
- strengths 列出3-5个主要优势
  - 每条都要包含 area / description / evidence
  - description 必须像招聘分析报告，不要写成“技能强”“经验丰富”这种空泛短语
- weaknesses 列出2-4个主要不足
  - 不要为了凑数胡编，必须基于岗位JD和简历缺口来写
  - gap 要明确到具体技能、行业经验、系统规模、生产落地能力或业务场景
- 评分要客观公正，基于简历中的实际内容`;
}

/**
 * 生成综合评估阶段的提示词
 */
function generateFinalEvaluationPrompt(resumeContent: string, position: any) {
  const weights = FINAL_EVALUATION_WEIGHTS;

  return `请综合分析以下简历和面试表现，评估各个维度的匹配度（0-100分）。

简历内容：
${resumeContent}

岗位信息：
- 岗位名称：${position.title}
- 岗位描述（JD）：
${position.jobDescription || '未提供'}

面试表现：
${position.interviewScores ? JSON.stringify(position.interviewScores, null, 2) : '未提供'}

请按照以下权重配置评估各个维度：
1. 简历初筛分数（${weights.resumeScore}%）：简历评估的初步分数作为参考
2. 技术能力（${weights.technicalSkills}%）：技术面试中表现出的技术水平和问题解决能力
3. 工作经验（${weights.experience}%）：过往工作经验与岗位需求的匹配度
4. 技术面试表现（${weights.technicalInterview}%）：代码能力、算法理解、技术深度
5. 沟通表达能力（${weights.communication}%）：逻辑清晰度、表达能力、倾听能力
6. 团队协作能力（${weights.teamwork}%）：团队合作经验、协作意识
7. 问题解决能力（${weights.problemSolving}%）：分析问题、解决问题的思路和能力
8. 工作态度和学习意愿（${weights.attitude}%）：积极主动性、学习能力强弱
9. 发展潜力（${weights.potential}%）：成长空间、适应性
10. 文化匹配度（${weights.cultureFit}%）：与公司文化的契合程度

严格按照以下JSON格式输出：
{
  "resumeScore": 85,
  "technicalSkills": 82,
  "experience": 80,
  "technicalInterview": 88,
  "communication": 85,
  "teamwork": 80,
  "problemSolving": 87,
  "attitude": 90,
  "potential": 88,
  "cultureFit": 82,
  "matchedItems": [
    {
      "requirement": "岗位要求的具体内容",
      "evidence": "简历或面试中的匹配证据"
    }
  ],
  "unmatchedItems": [
    {
      "requirement": "岗位要求的具体内容",
      "gap": "简历或面试中缺失或不满足的部分"
    }
  ],
  "strengths": [...],
  "weaknesses": [...]
}

要求：
- 只输出JSON，无其他文字
- 每个维度评分为0-100的整数
- matchedItems 列出简历和面试中与岗位要求匹配的具体内容，至少3-5项
  - requirement: 从岗位JD中提取的具体要求
  - evidence: 简历或面试中对应的具体匹配证据
- unmatchedItems 列出简历和面试中与岗位要求不匹配或缺失的内容，至少2-3项
  - requirement: 从岗位JD中提取的具体要求
  - gap: 简历或面试中缺失或不满足的具体部分
- 评分要综合考虑简历和面试表现`;
}

/**
 * 计算加权分数
 */
function calculateWeightedScore(dimensionScores: any, weights: any) {
  let totalScore = 0;

  for (const [key, weight] of Object.entries(weights)) {
    const score = dimensionScores[key];
    if (score !== undefined && score !== null) {
      totalScore += (score * (weight as number)) / 100;
    }
  }

  return totalScore;
}

/**
 * 计算降权系数
 * 根据简历中的潜在问题计算降权系数
 */
export function calculatePenaltyCoefficient(conflictMarkers: any[]): number {
  if (!conflictMarkers || conflictMarkers.length === 0) {
    return 1.0; // 无降权
  }

  let totalPenalty = 0;

  conflictMarkers.forEach((marker: any) => {
    const severity = marker.severity || 'low';

    switch (severity) {
      case 'high':
        totalPenalty += 0.1; // 高严重性：降权10%
        break;
      case 'medium':
        totalPenalty += 0.05; // 中严重性：降权5%
        break;
      case 'low':
        totalPenalty += 0.02; // 低严重性：降权2%
        break;
    }
  });

  // 最大降权30%，最小降权0%
  const penaltyCoefficient = Math.max(0.7, 1.0 - totalPenalty);

  console.log(`📊 计算降权系数:`);
  console.log(`   冲突标记数量: ${conflictMarkers.length}`);
  console.log(`   总降权: ${(totalPenalty * 100).toFixed(1)}%`);
  console.log(`   降权系数: ${penaltyCoefficient.toFixed(2)}`);

  return penaltyCoefficient;
}

/**
 * 完整的匹配度计算流程（包含降权系数）
 */
export async function calculateMatchScoreWithPenalty(
  resumeContent: string,
  position: any,
  evaluationStage: 'resume_screening' | 'final_evaluation' = 'resume_screening',
  candidateId?: number,
  resumeId?: number,
  positionId?: number
) {
  console.log('🚀 开始完整的匹配度计算流程...');

  // 1. 使用权重方案计算分数
  const result = await calculateMatchScore(
    resumeContent,
    position,
    evaluationStage,
    1.0 // 先不应用降权系数
  );

  // 2. 使用固定的降权系数 0.95
  const fixedPenaltyCoefficient = 0.95;

  // 3. 应用降权系数
  let finalScore = result.matchScore;
  let penaltyInfo = null;

  const originalScore = result.matchScore;
  finalScore = Math.round(originalScore * fixedPenaltyCoefficient);
  penaltyInfo = {
    originalScore,
    penaltyCoefficient: fixedPenaltyCoefficient,
    reducedScore: finalScore,
    reduction: originalScore - finalScore,
    conflictMarkers: result.dimensionScores.conflictMarkers || []
  };

  console.log('⚠️  应用降权系数后的结果:');
  console.log(`   原始分数: ${originalScore}`);
  console.log(`   降权系数: ${fixedPenaltyCoefficient.toFixed(2)}`);
  console.log(`   最终分数: ${finalScore}`);

  // 4. 更新结果
  result.matchScore = finalScore;
  if (penaltyInfo) {
    result.calculationSteps.penaltyInfo = {
      originalScore: penaltyInfo.originalScore,
      penaltyCoefficient: penaltyInfo.penaltyCoefficient,
      reducedScore: penaltyInfo.reducedScore,
      reduction: penaltyInfo.reduction,
      conflictMarkers: penaltyInfo.conflictMarkers || []
    };
  }
  result.calculationSteps.finalScore = finalScore;

  // 5. 记录评估结果（如果提供了必要的参数）
  if (candidateId && resumeId && positionId) {
    try {
      await recordResumeEvaluation({
        candidateId,
        resumeId,
        positionId,
        aiMatchScore: finalScore,
        aiEvaluation: {
          dimensionScores: result.dimensionScores,
          weightsUsed: result.weightsUsed,
          calculationSteps: result.calculationSteps
        },
        evaluationStage
      });
      console.log('✅ 评估结果已记录到数据库');
    } catch (error) {
      console.error('❌ 记录评估结果失败:', error);
    }
  }

  return result;
}
