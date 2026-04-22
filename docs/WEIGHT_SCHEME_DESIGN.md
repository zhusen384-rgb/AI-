# 简历评估权重方案设计

## 🎯 两个评估阶段的区分

### 阶段1：简历初筛阶段（Pre-Interview）
**时间点**：简历上传后、面试开始前
**目的**：快速筛选候选人，决定是否邀请面试
**可用信息**：简历内容、岗位JD

### 阶段2：综合评估阶段（Post-Interview）
**时间点**：面试结束后
**目的**：综合评估，做出最终录用决策
**可用信息**：简历内容 + 面试表现 + 面试官评分

## 📊 方案一：基于不同阶段的权重方案（推荐）

### 1. 简历初筛阶段权重配置

```typescript
RESUME_SCREENING_WEIGHTS = {
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
}
```

**计算逻辑**：
```typescript
function calculateResumeMatchScore(resume: Resume, job: Job): number {
  // 技术技能匹配度（25%）
  const technicalSkills = calculateSkillMatch(resume.skills, job.requiredSkills) * 25;

  // 工作经验相关性（20%）
  const experienceMatch = calculateExperienceMatch(resume.experience, job.requirements) * 20;

  // 项目经验（15%）
  const projectExperience = calculateProjectScore(resume.projects) * 15;

  // 教育背景（12%）
  const education = calculateEducationScore(resume.education) * 12;

  // 证书/奖项（8%）
  const certificates = calculateCertificateScore(resume.certificates) * 8;

  // 公司背景（5%）
  const companyBackground = calculateCompanyScore(resume.experience) * 5;

  // 核心技能匹配度（10%）
  const skillMatch = calculateCoreSkillMatch(resume.skills, job.coreSkills) * 10;

  // 关键词匹配（5%）
  const keywordMatch = calculateKeywordMatch(resume, job) * 5;

  return technicalSkills + experienceMatch + projectExperience +
         education + certificates + companyBackground +
         skillMatch + keywordMatch;
}
```

### 2. 综合评估阶段权重配置

```typescript
FINAL_EVALUATION_WEIGHTS = {
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
}
```

**计算逻辑**：
```typescript
function calculateFinalEvaluationScore(
  resumeScore: number,
  interviewScores: InterviewScores
): number {
  // 简历评估（40%）
  const resumeEval = resumeScore * 20; // 简历初筛分数作为参考

  // 技术能力（12%）
  const technicalSkills = interviewScores.technicalInterview * 12;

  // 工作经验（8%）
  const experience = interviewScores.experienceValidation * 8;

  // 技术面试表现（15%）
  const technicalInterview = interviewScores.technicalInterview * 15;

  // 沟通表达能力（10%）
  const communication = interviewScores.communication * 10;

  // 团队协作能力（8%）
  const teamwork = interviewScores.teamwork * 8;

  // 问题解决能力（10%）
  const problemSolving = interviewScores.problemSolving * 10;

  // 工作态度和学习意愿（7%）
  const attitude = interviewScores.attitude * 7;

  // 发展潜力（5%）
  const potential = interviewScores.potential * 5;

  // 文化匹配度（5%）
  const cultureFit = interviewScores.cultureFit * 5;

  return resumeEval + technicalSkills + experience +
         technicalInterview + communication + teamwork +
         problemSolving + attitude + potential + cultureFit;
}
```

## 📊 方案二：基于岗位类型的权重方案

不同类型的岗位可以使用不同的权重配置：

### 技术岗位权重配置
```typescript
TECHNICAL_POSITION_WEIGHTS = {
  // 技术能力（重点）
  technicalSkills: 35,
  projectExperience: 25,
  problemSolving: 15,

  // 软技能（次要）
  communication: 10,
  teamwork: 8,
  attitude: 5,

  // 背景
  education: 2,
  certificates: 0, // 技术岗不太看重证书
}
```

### 产品/设计岗位权重配置
```typescript
PRODUCT_DESIGN_POSITION_WEIGHTS = {
  // 产品思维/设计能力（重点）
  productThinking: 30,
  designSkills: 25,
  problemSolving: 15,

  // 软技能（重要）
  communication: 15,
  teamwork: 10,
  userEmpathy: 5,

  // 背景
  education: 0,
  certificates: 0,
}
```

### 销售/市场岗位权重配置
```typescript
SALES_MARKETING_POSITION_WEIGHTS = {
  // 销售能力（重点）
  communication: 30,
  negotiation: 25,
  relationshipBuilding: 15,

  // 软技能
  teamwork: 10,
  attitude: 10,

  // 背景
  education: 5,
  experience: 5,
}
```

## 📊 方案三：基于AI模型的权重方案

不使用预设权重，而是使用机器学习模型自动学习权重：

```typescript
// 使用线性回归模型
function calculateWeightedScore(features: Features): number {
  const model = {
    intercept: 10.5,
    coefficients: {
      technicalSkills: 0.25,
      experience: 0.20,
      education: 0.12,
      projectExperience: 0.15,
      interviewPerformance: 0.18,
      communication: 0.10,
      teamwork: 0.08,
      potential: 0.12,
      cultureFit: 0.05,
    }
  };

  let score = model.intercept;
  for (const [feature, coefficient] of Object.entries(model.coefficients)) {
    score += features[feature] * coefficient;
  }

  return Math.min(100, Math.max(0, score));
}
```

**模型训练**：
```typescript
// 使用历史数据训练模型
async function trainWeightModel(historicalData: HistoricalRecord[]) {
  // 提取特征和标签
  const features = historicalData.map(d => extractFeatures(d));
  const labels = historicalData.map(d => {
    // 将实际决策转换为分数
    if (d.finalDecision === 'hired') return d.interviewScores.overall || 85;
    if (d.finalDecision === 'rejected') return d.interviewScores.overall || 45;
    return d.interviewScores.overall || 65;
  });

  // 训练线性回归模型
  const model = trainLinearRegression(features, labels);

  return model;
}
```

## 🔄 权重调整流程改进

### 1. 针对简历初筛阶段的调整

```typescript
// 识别误判模式并调整权重
function adjustResumeScreeningWeights(patterns: MisclassificationPattern[]) {
  const newWeights = { ...RESUME_SCREENING_WEIGHTS };

  patterns.forEach(pattern => {
    if (pattern.type === 'false_positive') {
      // 假阳性：简历分高但实际被拒
      // 可能原因：过度评估了简历内容，忽略了软技能
      newWeights.technicalSkills *= 0.9;
      newWeights.projectExperience *= 0.9;
      newWeights.companyBackground *= 0.8; // 降低公司背景权重
    } else if (pattern.type === 'false_negative') {
      // 假阴性：简历分低但实际被录
      // 可能原因：过度强调硬性条件，忽略了实际能力
      newWeights.education *= 0.8; // 降低学历权重
      newWeights.certificates *= 0.8; // 降低证书权重
      newWeights.overall *= 1.2; // 提高综合评估权重
    }
  });

  return normalizeWeights(newWeights);
}
```

### 2. 针对综合评估阶段的调整

```typescript
// 识别误判模式并调整权重
function adjustFinalEvaluationWeights(patterns: MisclassificationPattern[]) {
  const newWeights = { ...FINAL_EVALUATION_WEIGHTS };

  patterns.forEach(pattern => {
    if (pattern.type === 'false_positive') {
      // 假阳性：综合评分高但实际被拒
      // 可能原因：过度评估了简历，忽略了面试表现
      newWeights.resumeScore *= 0.7; // 降低简历分数权重
      newWeights.technicalSkills *= 0.9;
      newWeights.communication *= 1.2; // 提高沟通能力权重
      newWeights.cultureFit *= 1.3; // 提高文化匹配度权重
    } else if (pattern.type === 'false_negative') {
      // 假阴性：综合评分低但实际被录
      // 可能原因：过度强调某些维度
      newWeights.attitude *= 1.3; // 提高工作态度权重
      newWeights.potential *= 1.4; // 提高潜力权重
    }
  });

  return normalizeWeights(newWeights);
}
```

## 💡 推荐方案

### 使用方案一：两阶段权重方案

**理由**：
1. **逻辑清晰**：区分两个评估阶段，避免混淆
2. **灵活调整**：每个阶段可以独立优化
3. **业务对齐**：符合实际的招聘流程
4. **易于理解**：HR 和面试官可以理解权重分配

### 实施建议

1. **初始化**：使用方案一的初始权重配置
2. **数据收集**：分别收集两个阶段的数据
3. **独立优化**：每个阶段独立进行权重调整
4. **定期评估**：每月评估一次权重配置的有效性
5. **持续迭代**：根据业务变化调整权重

## 📝 数据库表结构调整

需要调整 `resumeEvaluationRecords` 表，添加阶段标识：

```sql
ALTER TABLE resume_evaluation_records
ADD COLUMN evaluation_stage VARCHAR(20) NOT NULL DEFAULT 'resume_screening';
-- 'resume_screening' = 简历初筛阶段
-- 'final_evaluation' = 综合评估阶段
```

## 🎯 总结

你的问题指出了一个重要的逻辑问题。正确的做法是：

1. **简历初筛阶段**：只使用简历相关的权重（技术能力、工作经验、教育背景等）
2. **综合评估阶段**：增加面试相关的权重（面试表现、沟通能力等）
3. **分开优化**：两个阶段独立进行权重调整，避免混淆

这样可以确保评估逻辑的正确性，提高评估的准确性。
