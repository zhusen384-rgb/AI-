/**
 * 模型优化配置
 * 定义优化过程中的各项阈值和参数
 */

// ==================== 简历初筛阶段权重配置 ====================
// 简历初筛阶段（Pre-Interview）：只基于简历内容和岗位JD进行评估
export const RESUME_SCREENING_WEIGHTS = {
  // 技术能力相关（60%）
  technicalSkills: 25,      // 技术技能匹配度（从简历提取的技能与JD对比）
  experienceMatch: 20,      // 工作经验相关性（工作年限、行业匹配）
  projectExperience: 15,    // 项目经验（项目数量、复杂度、成果量化）

  // 背景相关（25%）
  education: 12,            // 教育背景（学历、学校、专业）
  certificates: 8,          // 证书/奖项
  companyBackground: 5,     // 曾任职公司背景（知名公司、行业地位）

  // 岗位匹配度（15%）
  skillMatch: 10,           // 核心技能匹配度（JD中的必备技能）
  keywordMatch: 5,          // 关键词匹配（岗位名称、职位描述）

  // 综合评估（可选）
  overall: 0,               // 综合评估（初始为0，后续根据误判调整）
};

// ==================== 综合评估阶段权重配置 ====================
// 综合评估阶段（Post-Interview）：基于简历和面试表现进行评估
export const FINAL_EVALUATION_WEIGHTS = {
  // 简历评估（40%）
  resumeScore: 20,          // 简历初筛分数（参考）
  technicalSkills: 12,      // 技术能力（简历 + 面试验证）
  experience: 8,            // 工作经验（简历 + 面试验证）

  // 面试表现（50%）
  technicalInterview: 15,   // 技术面试表现（代码、问题解决）
  communication: 10,        // 沟通表达能力
  teamwork: 8,              // 团队协作能力
  problemSolving: 10,       // 问题解决能力
  attitude: 7,              // 工作态度和学习意愿

  // 潜力评估（10%）
  potential: 5,             // 发展潜力
  cultureFit: 5,            // 文化匹配度
};

// ==================== 优化配置 ====================
export const OPTIMIZATION_CONFIG = {
  // 优化阈值
  THRESHOLDS: {
    // 可接受的误差范围（±分）
    MARGIN_OF_ERROR: 20,
    // 可接受的误判率（%）
    ACCEPTABLE_ERROR_RATE: 15,
    // 最小准确率（%）
    MIN_ACCURACY: 70,
    // 最小改进幅度（%）
    MIN_IMPROVEMENT: 5,
    // 高分阈值
    HIGH_SCORE: 80,
    // 低分阈值
    LOW_SCORE: 40,
  },

  // 采样参数
  SAMPLING: {
    // 最小样本量
    MIN_SAMPLE_SIZE: 20,
    // 最大样本量
    MAX_SAMPLE_SIZE: 500,
    // Few-shot 示例数量
    FEW_SHOT_COUNT: 5,
    // 时间范围（天）
    TIME_RANGE_DAYS: 30,
  },

  // 评估阶段类型
  EVALUATION_STAGE: {
    RESUME_SCREENING: 'resume_screening',    // 简历初筛阶段
    FINAL_EVALUATION: 'final_evaluation',    // 综合评估阶段
  } as const,

  // 简历初筛阶段 Prompt 模板
  RESUME_SCREENING_PROMPT: `你是一个专业的简历匹配度评估专家。你的任务是根据候选人的简历和职位要求，给出准确的匹配度评分（0-100分）。

请考虑以下因素：
1. 技术技能匹配度（25%）：候选人的技术栈与岗位要求的匹配程度
2. 工作经验相关性（20%）：工作年限、行业背景、职位相关性
3. 项目经验（15%）：项目数量、复杂度、量化成果
4. 教育背景（12%）：学历层次、学校排名、专业匹配度
5. 证书/奖项（8%）：相关证书、获奖情况
6. 公司背景（5%）：曾任职公司的行业地位
7. 核心技能匹配度（10%）：JD中必备技能的覆盖情况
8. 关键词匹配（5%）：岗位关键词的匹配程度

评分标准：
- 0-20分：完全不匹配，无任何相关技能或经验
- 21-40分：匹配度低，仅有少量相关技能或经验
- 41-60分：中等匹配，具备基本技能和部分经验
- 61-80分：高匹配，大部分技能和经验符合要求
- 81-100分：完美匹配，所有技能和经验高度符合要求

注意事项：
- 仔细分析候选人的实际工作成果，而非仅看职位名称
- 重视项目成果的量化数据，如"提升20%"、"管理10人团队"等
- 避免过度评估，保持评分的客观性和准确性
- 对于高学历、知名公司背景，适当考虑但不作为唯一评分依据

请仔细分析候选人的简历，给出客观、准确的评分，并简要说明评分理由。`,

  // 综合评估阶段 Prompt 模板
  FINAL_EVALUATION_PROMPT: `你是一个专业的面试评估专家。你的任务是根据候选人的简历和面试表现，给出综合评估评分（0-100分）。

请考虑以下因素：
1. 简历初筛分数（20%）：简历评估的初步分数作为参考
2. 技术能力（12%）：技术面试中表现出的技术水平和问题解决能力
3. 工作经验（8%）：过往工作经验与岗位需求的匹配度（面试验证）
4. 技术面试表现（15%）：代码能力、算法理解、技术深度
5. 沟通表达能力（10%）：逻辑清晰度、表达能力、倾听能力
6. 团队协作能力（8%）：团队合作经验、协作意识
7. 问题解决能力（10%）：分析问题、解决问题的思路和能力
8. 工作态度和学习意愿（7%）：积极主动性、学习能力强弱
9. 发展潜力（5%）：成长空间、适应性
10. 文化匹配度（5%）：与公司文化的契合程度

评分标准：
- 0-20分：完全不匹配，不适合该岗位
- 21-40分：匹配度低，存在明显不足
- 41-60分：中等匹配，基本符合要求
- 61-80分：高匹配，综合表现优秀
- 81-100分：完美匹配，各方面表现突出

注意事项：
- 面试表现应占更大权重，避免过度依赖简历
- 重视候选人的实际能力和潜力，而非仅仅关注背景
- 评估要全面，避免单一维度决定一切
- 对于有潜力的候选人，可以适当提高评分

请综合评估候选人的简历和面试表现，给出客观、准确的评分，并简要说明评分理由。`,

  // 优化策略
  OPTIMIZATION_STRATEGIES: {
    // 是否启用 Few-shot Learning
    ENABLE_FEW_SHOT: true,
    // 是否启用权重调整
    ENABLE_WEIGHT_ADJUSTMENT: true,
    // 是否自动部署优化结果
    AUTO_DEPLOY: false,
    // 优化间隔（天）
    OPTIMIZATION_INTERVAL_DAYS: 7,
  },

  // 监控和告警
  MONITORING: {
    // 是否启用监控
    ENABLE_MONITORING: true,
    // 告警阈值
    ALERT_THRESHOLDS: {
      ERROR_RATE_HIGH: 30,      // 误判率告警阈值（%）
      ERROR_RATE_CRITICAL: 50,  // 误判率严重告警阈值（%）
      ACCURACY_LOW: 60,         // 准确率低告警阈值（%）
    },
    // 告警方式
    ALERT_CHANNELS: ['log', 'console'],
  },
};

// 导出当前配置（可从数据库加载覆盖）
export function getCurrentConfig() {
  return {
    ...OPTIMIZATION_CONFIG,
    // 这里可以从数据库加载最新的配置
  };
}

// 更新配置
export function updateConfig(newConfig: Partial<typeof OPTIMIZATION_CONFIG>) {
  Object.assign(OPTIMIZATION_CONFIG, newConfig);
  return OPTIMIZATION_CONFIG;
}

// 根据评估阶段获取初始权重
export function getInitialWeights(evaluationStage: 'resume_screening' | 'final_evaluation') {
  if (evaluationStage === 'resume_screening') {
    return { ...RESUME_SCREENING_WEIGHTS };
  } else if (evaluationStage === 'final_evaluation') {
    return { ...FINAL_EVALUATION_WEIGHTS };
  }
  throw new Error(`未知的评估阶段: ${evaluationStage}`);
}

// 根据评估阶段获取初始 Prompt
export function getInitialPrompt(evaluationStage: 'resume_screening' | 'final_evaluation') {
  if (evaluationStage === 'resume_screening') {
    return OPTIMIZATION_CONFIG.RESUME_SCREENING_PROMPT;
  } else if (evaluationStage === 'final_evaluation') {
    return OPTIMIZATION_CONFIG.FINAL_EVALUATION_PROMPT;
  }
  throw new Error(`未知的评估阶段: ${evaluationStage}`);
}
