# 简历匹配度分数计算说明

## 📊 当前实现方式

李文森的简历匹配度 82% 是通过 **LLM（大语言模型）直接分析计算**得出的，具体流程如下：

### 1. 计算流程

```
用户上传简历 → 提取简历内容 → 调用 LLM 分析 → LLM 输出匹配度分数
```

### 2. 代码位置

**文件**：`src/app/api/resume/parse/route.ts`

**关键函数**：`analyzeMatch(resumeContent, position)`

### 3. LLM 分析提示词

当用户上传简历并提供岗位信息时，系统会向 LLM 发送以下提示词：

```
岗位匹配分析。

简历：
{简历内容}

岗位：{岗位名称}|{部门}|{学历要求}|{经验要求}
JD：{岗位描述}

严格按JSON格式输出：
{
  "matchScore": 85,
  "strengths": [...],
  "weaknesses": [...],
  "matchedItems": [...],
  "unmatchedItems": [...],
  "conflictMarkers": [...]
}
```

### 4. LLM 模型参数

- **模型**：`doubao-seed-1-8-251228`（豆包 Agent 优化模型）
- **Temperature**：`0.4`（适中的温度，平衡准确性和创造性）
- **角色**：招聘专家

### 5. 评分标准（隐性）

LLM 会根据以下标准进行评分（虽然这些标准在代码中没有明确定义，但 LLM 会基于常识理解）：

#### 评分等级
- **0-20分**：完全不匹配，无任何相关经验或技能
- **21-40分**：匹配度低，仅有少量相关技能或经验
- **41-60分**：中等匹配，具备基本技能和部分经验
- **61-80分**：高匹配，大部分技能和经验符合要求
- **81-100分**：完美匹配，所有技能和经验高度符合要求

#### 考虑因素（LLM 可能关注的维度）
1. **技术技能匹配度**：候选人技术栈与岗位要求的匹配程度
2. **工作经验相关性**：工作年限、行业背景、职位相关性
3. **项目经验**：项目数量、复杂度、量化成果
4. **教育背景**：学历层次、学校排名、专业匹配度
5. **证书/奖项**：相关证书、获奖情况
6. **公司背景**：曾任职公司的行业地位

### 6. 返回的数据结构

LLM 返回的 JSON 包含以下信息：

```json
{
  "matchScore": 82,  // 匹配度分数（0-100）
  "strengths": [    // 优势领域
    {
      "area": "技术能力",
      "description": "具备扎实的Java和Spring框架经验",
      "evidence": "简历中提到使用Spring Boot开发微服务项目"
    }
  ],
  "weaknesses": [   // 不足领域
    {
      "area": "经验年限",
      "description": "工作经验偏短",
      "gap": "要求5年以上，候选人仅有3年"
    }
  ],
  "matchedItems": [ // 匹配的岗位需求
    {
      "requirement": "Java开发经验",
      "evidence": "3年Java开发经验",
      "matchLevel": "部分匹配"
    }
  ],
  "unmatchedItems": [ // 未匹配的岗位需求
    {
      "requirement": "微服务架构设计经验",
      "gap": "未提及微服务设计经验",
      "importance": "重要"
    }
  ],
  "conflictMarkers": [ // 潜在问题
    {
      "type": "描述夸大",
      "description": "项目成果描述过于夸张",
      "severity": "中"
    }
  ]
}
```

---

## ⚠️ 当前实现的问题

### 问题1：没有使用权重方案

我们之前设计了详细的权重方案（`RESUME_SCREENING_WEIGHTS`），但当前的实现**完全没有使用**这些权重配置。匹配度分数完全依赖 LLM 的"直觉"判断。

### 问题2：缺乏可解释性

LLM 如何计算 82 分？具体的权重分配是什么？我们无法得知。这使得评分结果难以解释和调试。

### 问题3：不一致性

由于 LLM 的随机性（即使设置了较低的 temperature），同一份简历可能在不同时间得到不同的分数。

### 问题4：难以优化

如果要调整评分标准，只能通过修改 LLM 的提示词，这不够精确和可控。

---

## 💡 改进方案

### 方案1：使用权重方案（推荐）

使用我们设计的权重方案，将 LLM 分析结果转换为加权分数：

```typescript
// 1. 使用 LLM 分析各个维度
const analysis = await analyzeMatchDimensions(resumeContent, position);

// 2. 根据权重计算总分
const weights = RESUME_SCREENING_WEIGHTS;
const totalScore =
  analysis.technicalSkills * weights.technicalSkills +
  analysis.experienceMatch * weights.experienceMatch +
  analysis.projectExperience * weights.projectExperience +
  analysis.education * weights.education +
  analysis.certificates * weights.certificates +
  analysis.companyBackground * weights.companyBackground +
  analysis.skillMatch * weights.skillMatch +
  analysis.keywordMatch * weights.keywordMatch;

// 3. 返回加权分数和详细分析
return {
  matchScore: Math.round(totalScore),
  detailedAnalysis: analysis,
  weightsUsed: weights
};
```

**优势**：
- 可解释性强：知道每个维度的权重
- 一致性好：分数计算是确定性的
- 易于优化：可以调整权重配置
- 支持动态调整：可以通过优化模块自动调整权重

### 方案2：增强 LLM 提示词

在 LLM 提示词中明确指定权重和评分标准：

```typescript
const enhancedPrompt = `你是一个专业的简历匹配度评估专家。

请按照以下权重计算匹配度分数：
- 技术技能匹配度（25%）
- 工作经验相关性（20%）
- 项目经验（15%）
- 教育背景（12%）
- 证书/奖项（8%）
- 公司背景（5%）
- 核心技能匹配度（10%）
- 关键词匹配（5%）

评分步骤：
1. 评估每个维度的匹配度（0-100分）
2. 按照权重计算加权总分
3. 返回最终的 matchScore（0-100整数）

示例计算：
- 技术技能匹配度：80分 × 25% = 20分
- 工作经验相关性：70分 × 20% = 14分
- 项目经验：90分 × 15% = 13.5分
- 教育背景：85分 × 12% = 10.2分
- 证书/奖项：60分 × 8% = 4.8分
- 公司背景：75分 × 5% = 3.75分
- 核心技能匹配度：85分 × 10% = 8.5分
- 关键词匹配：90分 × 5% = 4.5分

总分 = 20 + 14 + 13.5 + 10.2 + 4.8 + 3.75 + 8.5 + 4.5 = 79.25 ≈ 79分
`;
```

**优势**：
- 实现简单，不需要改动太多代码
- LLM 会按照权重进行计算

**劣势**：
- 仍然依赖 LLM 的理解，可能不准确
- 一致性问题仍然存在

### 方案3：混合方案（最佳实践）

结合方案1和方案2：

```typescript
async function calculateMatchScore(resumeContent: string, position: any) {
  // 1. 使用增强的 LLM 提示词获取各个维度的评分
  const dimensionScores = await analyzeMatchDimensions(
    resumeContent,
    position,
    RESUME_SCREENING_WEIGHTS
  );

  // 2. 使用预设权重计算总分
  const weights = RESUME_SCREENING_WEIGHTS;
  const totalScore = calculateWeightedScore(dimensionScores, weights);

  // 3. 记录评估结果（用于后续优化）
  await recordResumeEvaluation({
    candidateId: position.candidateId,
    resumeId: position.resumeId,
    positionId: position.positionId,
    aiMatchScore: totalScore,
    aiEvaluation: {
      dimensionScores,
      weightsUsed: weights,
      matchAnalysis: dimensionScores.matchAnalysis
    },
    evaluationStage: 'resume_screening'
  });

  return {
    matchScore: totalScore,
    dimensionScores,
    weightsUsed: weights
  };
}
```

---

## 📊 李文森的 82 分是如何计算的？

基于当前的实现，**我们无法确定 82 分的确切计算过程**，因为：

1. LLM 的内部推理过程是不透明的
2. 代码中没有记录 LLM 的评分依据
3. 没有使用明确的权重方案

### 可能的判断依据（推测）

LLM 可能基于以下因素给出了 82 分：

- ✅ **技术技能匹配度高**：候选人具备岗位要求的大部分技能
- ✅ **项目经验丰富**：有相关项目经验，且有量化成果
- ✅ **教育背景良好**：学历和专业匹配
- ⚠️ **工作经验略短**：可能比要求少一些，但差距不大
- ✅ **公司背景较好**：曾在知名公司工作
- ⚠️ **部分技能缺失**：某些高级技能可能不具备

---

## 🎯 建议

为了提高匹配度评分的可解释性和准确性，建议：

### 短期改进（快速实施）

1. **增强 LLM 提示词**：在提示词中明确指定权重和评分标准
2. **记录评分依据**：在 `aiEvaluation` 中记录 LLM 对每个维度的评分
3. **添加评分说明**：返回详细的评分依据和计算过程

### 中期改进（逐步优化）

1. **使用权重方案**：实现方案1，使用我们设计的权重配置
2. **记录评估数据**：在简历解析时记录到 `resume_evaluation_records` 表
3. **收集反馈**：在面试决策后收集实际决策数据
4. **开始优化**：使用优化模块调整权重

### 长期改进（持续优化）

1. **A/B 测试**：对比不同评分方案的效果
2. **机器学习优化**：使用历史数据训练更准确的评分模型
3. **实时监控**：监控评分的准确性和误判率
4. **自动调优**：基于数据自动调整权重配置

---

## 📝 总结

**当前状态**：
- 匹配度分数由 LLM 直接输出
- 没有使用我们设计的权重方案
- 评分过程不透明，难以解释

**李文森的 82 分**：
- 是 LLM 基于简历和岗位要求的综合判断
- 具体计算过程不明确
- 可能受多个因素影响（技术技能、工作经验、项目经验等）

**改进方向**：
- 使用明确的权重方案
- 记录详细的评分依据
- 支持动态权重调整
- 提高评分的可解释性和准确性
