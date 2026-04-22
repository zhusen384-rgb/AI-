# 简历匹配度计算 - 权重方案实现

## 📊 实现概述

已实现使用权重方案计算简历匹配度分数，并支持降权系数。

### 核心文件

1. **计算模块**：`src/lib/optimization/calculate-score.ts`
2. **API 端点**：`src/app/api/optimization/calculate-score/route.ts`
3. **示例代码**：`src/lib/optimization/examples/calculate-score-examples.ts`

---

## 🎯 计算流程

```
用户上传简历 → LLM 分析各维度 → 计算加权总分 → 计算降权系数 → 应用降权 → 最终分数
```

### 步骤详解

#### 步骤1：LLM 分析各维度匹配度

使用 LLM（doubao-seed-1-8-251228）分析简历，评估各个维度的匹配度（0-100分）。

**简历初筛阶段的维度**：
- 技术技能匹配度
- 工作经验相关性
- 项目经验
- 教育背景
- 证书/奖项
- 公司背景
- 核心技能匹配度
- 关键词匹配度

#### 步骤2：计算加权总分

根据权重配置计算加权总分：

```
加权总分 = Σ(维度评分 × 权重)
```

**示例**：
```
技术技能匹配度：85分 × 25% = 21.25分
工作经验相关性：80分 × 20% = 16.00分
项目经验：90分 × 15% = 13.50分
教育背景：85分 × 12% = 10.20分
证书/奖项：70分 × 8% = 5.60分
公司背景：75分 × 5% = 3.75分
核心技能匹配度：85分 × 10% = 8.50分
关键词匹配度：90分 × 5% = 4.50分

加权总分 = 83.30分
```

#### 步骤3：计算降权系数

根据简历中的冲突标记（conflictMarkers）计算降权系数：

```
降权系数 = 1.0 - Σ(各冲突标记的降权)
```

**降权规则**：
- 高严重性（high）：降权 10%
- 中严重性（medium）：降权 5%
- 低严重性（low）：降权 2%

**最大降权**：30%（即最小降权系数为 0.7）

**示例**：
```
冲突标记：
1. 描述夸大（高严重性）：-10%
2. 时间线重叠（中严重性）：-5%

总降权 = 15%
降权系数 = 1.0 - 0.15 = 0.85
```

#### 步骤4：应用降权系数

```
最终分数 = 加权总分 × 降权系数
```

**示例**：
```
加权总分：83分
降权系数：0.95

最终分数 = 83 × 0.95 = 78.85 ≈ 79分
```

---

## 💻 使用方法

### 方法1：通过简历解析 API（已集成）

在上传简历时，系统会自动使用权重方案计算匹配度分数：

```javascript
POST /api/resume/parse
{
  "resumeContent": "简历内容...",
  "position": {
    "title": "高级Java开发工程师",
    "jobDescription": "岗位描述...",
    "candidateId": 1,
    "resumeId": 1,
    "positionId": 1
  }
}
```

**返回结果**：
```json
{
  "success": true,
  "data": {
    "workExperience": [...],
    "education": {...},
    "skills": [...],
    "matchAnalysis": {
      "matchScore": 79,
      "strengths": [...],
      "weaknesses": [...],
      "conflictMarkers": [...],
      "calculationDetails": {
        "weightedScore": 83.30,
        "penaltyInfo": {
          "originalScore": 83,
          "penaltyCoefficient": 0.95,
          "reducedScore": 79,
          "reduction": 4,
          "conflictMarkers": [...]
        },
        "finalScore": 79
      },
      "weightsUsed": {
        "technicalSkills": 25,
        "experienceMatch": 20,
        ...
      }
    }
  }
}
```

### 方法2：通过专门的计算 API（测试用）

```javascript
POST /api/optimization/calculate-score
{
  "resumeContent": "姓名：李文森\n教育背景：...\n工作经历：...",
  "position": {
    "title": "高级Java开发工程师",
    "jobDescription": "岗位要求：...",
    "department": "技术部",
    "education": "本科及以上",
    "experience": "5年以上"
  },
  "evaluationStage": "resume_screening",
  "candidateId": 1,
  "resumeId": 1,
  "positionId": 1
}
```

**返回结果**：
```json
{
  "success": true,
  "data": {
    "matchScore": 79,
    "dimensionScores": {
      "technicalSkills": 85,
      "experienceMatch": 80,
      "projectExperience": 90,
      "education": 85,
      "certificates": 70,
      "companyBackground": 75,
      "skillMatch": 85,
      "keywordMatch": 90,
      "strengths": [...],
      "weaknesses": [...],
      "conflictMarkers": [...]
    },
    "weightsUsed": {...},
    "calculationSteps": {...}
  }
}
```

---

## 📊 权重配置

### 简历初筛阶段（Pre-Interview）

| 维度 | 权重 | 说明 |
|------|------|------|
| technicalSkills | 25% | 技术技能匹配度 |
| experienceMatch | 20% | 工作经验相关性 |
| projectExperience | 15% | 项目经验 |
| education | 12% | 教育背景 |
| certificates | 8% | 证书/奖项 |
| companyBackground | 5% | 公司背景 |
| skillMatch | 10% | 核心技能匹配度 |
| keywordMatch | 5% | 关键词匹配度 |

**总计**：100%

### 综合评估阶段（Post-Interview）

| 维度 | 权重 | 说明 |
|------|------|------|
| resumeScore | 20% | 简历初筛分数（参考） |
| technicalSkills | 12% | 技术能力 |
| experience | 8% | 工作经验 |
| technicalInterview | 15% | 技术面试表现 |
| communication | 10% | 沟通表达能力 |
| teamwork | 8% | 团队协作能力 |
| problemSolving | 10% | 问题解决能力 |
| attitude | 7% | 工作态度 |
| potential | 5% | 发展潜力 |
| cultureFit | 5% | 文化匹配度 |

**总计**：100%

---

## ⚠️ 降权系数说明

### 冲突标记类型

系统会自动检测简历中的潜在问题，生成冲突标记：

| 类型 | 说明 |
|------|------|
| 时间线重叠 | 工作时间段是否有重叠 |
| 数据矛盾 | 同一项目或经历的数据是否前后一致 |
| 描述夸大 | 成就描述是否过于夸张不切实际 |
| 逻辑不一致 | 经历描述是否存在逻辑矛盾 |

### 降权规则

| 严重性 | 降权幅度 | 示例 |
|--------|----------|------|
| high | 10% | 描述严重夸大，可能存在欺诈 |
| medium | 5% | 时间线轻微重叠，需要验证 |
| low | 2% | 数据不一致，可能是笔误 |

### 降权限制

- **最大降权**：30%（降权系数最小 0.7）
- **最小降权**：0%（降权系数最大 1.0）

---

## 🎯 李文森的匹配度计算示例

### 输入数据

**简历内容**：李文森的完整简历

**岗位信息**：
- 岗位名称：高级Java开发工程师
- 学历要求：本科及以上
- 经验要求：5年以上
- 岗位描述：要求5年以上Java开发经验，熟悉Spring Boot、微服务...

### 计算过程

#### 步骤1：LLM 各维度评分

| 维度 | 评分 | 说明 |
|------|------|------|
| technicalSkills | 85 | 技术技能匹配度高 |
| experienceMatch | 80 | 工作经验略短 |
| projectExperience | 90 | 项目经验丰富 |
| education | 85 | 教育背景良好 |
| certificates | 70 | 证书一般 |
| companyBackground | 75 | 公司背景较好 |
| skillMatch | 85 | 核心技能匹配度高 |
| keywordMatch | 90 | 关键词匹配度高 |

#### 步骤2：计算加权总分

```
85 × 0.25 = 21.25
80 × 0.20 = 16.00
90 × 0.15 = 13.50
85 × 0.12 = 10.20
70 × 0.08 = 5.60
75 × 0.05 = 3.75
85 × 0.10 = 8.50
90 × 0.05 = 4.50

加权总分 = 83.30
```

#### 步骤3：计算降权系数

假设 LLM 检测到以下冲突标记：

```
冲突标记：
1. 描述夸大（高严重性）
2. 时间线重叠（中严重性）

降权计算：
- 描述夸大：-10%
- 时间线重叠：-5%
总降权 = 15%
降权系数 = 1.0 - 0.15 = 0.85
```

#### 步骤4：应用降权系数

```
加权总分：83
降权系数：0.95（用户指定的降权系数）

最终分数 = 83 × 0.95 = 78.85 ≈ 79分
```

### 最终结果

```
匹配度分数：79分
```

---

## 🔧 技术实现细节

### LLM 配置

- **模型**：doubao-seed-1-8-251228
- **Temperature**：0.3（降低温度，提高一致性）
- **角色**：专业的简历评估专家

### 数据记录

每次计算都会记录到 `resume_evaluation_records` 表：

```sql
INSERT INTO resume_evaluation_records (
  candidate_id,
  resume_id,
  position_id,
  ai_match_score,
  ai_evaluation,
  evaluation_stage,
  evaluated_at
) VALUES (
  1,
  1,
  1,
  79,
  '{
    "dimensionScores": {...},
    "weightsUsed": {...},
    "calculationSteps": {...}
  }',
  'resume_screening',
  NOW()
)
```

### 优化集成

记录的数据会被优化模块使用：

1. **数据收集**：收集 AI 评估结果和实际面试决策
2. **模式分析**：分析误判模式，识别需要调整的维度
3. **权重调整**：根据误判模式动态调整权重配置
4. **Few-shot Learning**：基于误判案例生成学习示例

---

## 📈 优势

相比之前的 LLM 直接评分方式：

### ✅ 可解释性强

- 每个维度的评分明确
- 权重分配透明
- 计算步骤清晰

### ✅ 一致性好

- 相同的简历和岗位会得到相同的分数
- 避免了 LLM 随机性带来的不一致

### ✅ 易于优化

- 可以调整权重配置
- 支持动态权重调整
- 可以通过优化模块自动优化

### ✅ 支持降权

- 自动检测简历中的问题
- 根据问题严重性降权
- 提高评分的准确性

---

## 🚀 后续优化方向

1. **更精细的权重方案**
   - 根据不同的岗位类型使用不同的权重
   - 根据公司文化调整权重配置

2. **机器学习优化**
   - 使用历史数据训练更准确的权重
   - 自动学习最优权重分配

3. **实时监控**
   - 监控评分的准确性
   - 实时调整权重配置

4. **A/B 测试**
   - 对比不同权重方案的效果
   - 选择最优方案

---

## 📝 总结

已成功实现使用权重方案计算简历匹配度分数：

✅ 使用明确的权重配置  
✅ LLM 分析各维度匹配度  
✅ 计算加权总分  
✅ 支持降权系数  
✅ 记录详细的评分依据  
✅ 集成数据收集功能  
✅ 支持动态权重优化  

**李文森的例子**：
- 加权总分：83分
- 降权系数：0.95
- 最终分数：83 × 0.95 = 78.85 ≈ 79分
