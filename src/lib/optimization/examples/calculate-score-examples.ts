/**
 * 简历匹配度计算示例
 * 演示如何使用权重方案计算匹配度分数
 */

import { calculateMatchScoreWithPenalty, calculatePenaltyCoefficient } from '../calculate-score';

// 示例1：李文森的简历匹配度计算
export async function exampleLiWensen() {
  console.log('='.repeat(60));
  console.log('示例1：李文森的简历匹配度计算');
  console.log('='.repeat(60));

  const resumeContent = `
姓名：李文森
性别：男
年龄：28岁
电话：138****5678
邮箱：liwensen@email.com

教育背景：
2015.09 - 2019.06  XX大学  计算机科学与技术  本科

工作经历：
2019.07 - 2021.06  ABC科技公司  Java开发工程师
- 参与公司核心业务系统的开发和维护
- 使用Spring Boot框架开发微服务项目
- 负责数据库设计和优化

2021.07 - 至今  DEF互联网公司  高级Java开发工程师
- 主导电商平台的架构设计和开发
- 带领5人团队完成多个大型项目
- 使用Docker、K8s进行容器化部署

项目经验：
1. 电商平台微服务改造（2022.03 - 2022.12）
   - 主导从单体架构向微服务架构迁移
   - 系统性能提升30%
   - 代码覆盖率达到85%

2. 订单管理系统（2021.09 - 2022.02）
   - 设计并开发订单管理系统
   - 支持日均10万订单处理
   - 系统稳定性达99.9%

技能：
- 编程语言：Java、Python、JavaScript
- 框架：Spring Boot、Spring Cloud、MyBatis
- 数据库：MySQL、Redis、MongoDB
- 工具：Git、Maven、Docker、Kubernetes
- 其他：微服务架构、分布式系统、高并发处理

证书：
- Oracle认证Java程序员
- 阿里云云计算工程师认证
`;

  const position = {
    title: '高级Java开发工程师',
    department: '技术部',
    education: '本科及以上',
    experience: '5年以上',
    jobDescription: `
岗位要求：
1. 5年以上Java开发经验，具备扎实的Java基础
2. 熟悉Spring Boot、Spring Cloud等微服务框架
3. 熟悉分布式系统设计和高并发处理
4. 有电商平台或大型系统开发经验优先
5. 熟悉MySQL、Redis等数据库
6. 具备良好的沟通能力和团队协作能力
7. 有团队管理经验者优先

岗位职责：
1. 负责公司核心系统的设计和开发
2. 参与技术方案设计和评审
3. 带领团队完成项目开发
4. 解决技术难题，优化系统性能
`,
    candidateId: 1,
    resumeId: 1,
    positionId: 1
  };

  try {
    const result = await calculateMatchScoreWithPenalty(
      resumeContent,
      position,
      'resume_screening',
      position.candidateId,
      position.resumeId,
      position.positionId
    );

    console.log('\n📊 匹配度计算结果:');
    console.log('='.repeat(60));
    console.log('最终匹配度分数:', result.matchScore);
    console.log('\n各维度评分:');
    console.table(result.dimensionScores);
    console.log('\n权重配置:');
    console.table(result.weightsUsed);
    console.log('\n计算步骤:');
    console.log('加权总分:', result.calculationSteps.weightedScore.toFixed(2));
    if (result.calculationSteps.penaltyInfo) {
      console.log('降权信息:');
      console.log('  原始分数:', result.calculationSteps.penaltyInfo.originalScore);
      console.log('  降权系数:', result.calculationSteps.penaltyInfo.penaltyCoefficient.toFixed(2));
      console.log('  最终分数:', result.calculationSteps.penaltyInfo.reducedScore);
      console.log('  降权幅度:', result.calculationSteps.penaltyInfo.reduction.toFixed(2));
      const conflictMarkers = (result.calculationSteps.penaltyInfo as any).conflictMarkers;
      console.log('  冲突标记:', conflictMarkers);
    }
    console.log('\n优势领域:');
    result.dimensionScores.strengths?.forEach((strength: any, i: number) => {
      console.log(`  ${i + 1}. ${strength.area}: ${strength.description}`);
    });
    console.log('\n不足领域:');
    result.dimensionScores.weaknesses?.forEach((weakness: any, i: number) => {
      console.log(`  ${i + 1}. ${weakness.area}: ${weakness.description}`);
    });

    return result;
  } catch (error) {
    console.error('❌ 匹配度计算失败:', error);
    throw error;
  }
}

// 示例2：计算降权系数
export function examplePenaltyCoefficient() {
  console.log('\n' + '='.repeat(60));
  console.log('示例2：降权系数计算');
  console.log('='.repeat(60));

  const conflictMarkers = [
    {
      type: '描述夸大',
      description: '项目成果描述过于夸张，缺乏实际数据支撑',
      severity: 'high'
    },
    {
      type: '时间线重叠',
      description: '两个项目时间存在重叠，可能描述不准确',
      severity: 'medium'
    },
    {
      type: '数据矛盾',
      description: '简历中工作年限与实际不符',
      severity: 'high'
    },
    {
      type: '逻辑不一致',
      description: '项目描述与职位要求存在逻辑矛盾',
      severity: 'low'
    }
  ];

  const penaltyCoefficient = calculatePenaltyCoefficient(conflictMarkers);

  console.log('\n降权系数计算结果:');
  console.log('  冲突标记数量:', conflictMarkers.length);
  console.log('  降权系数:', penaltyCoefficient.toFixed(2));
  console.log('  降权幅度:', ((1 - penaltyCoefficient) * 100).toFixed(1) + '%');

  return penaltyCoefficient;
}

// 示例3：完整的计算流程演示
export async function exampleFullCalculation() {
  console.log('\n' + '='.repeat(60));
  console.log('示例3：完整的计算流程演示');
  console.log('='.repeat(60));

  // 假设 LLM 返回的各维度评分
  const dimensionScores = {
    technicalSkills: 85,      // 技术技能匹配度
    experienceMatch: 80,      // 工作经验相关性
    projectExperience: 90,    // 项目经验
    education: 85,            // 教育背景
    certificates: 70,         // 证书/奖项
    companyBackground: 75,    // 公司背景
    skillMatch: 85,           // 核心技能匹配度
    keywordMatch: 90          // 关键词匹配度
  };

  // 权重配置
  const weights = {
    technicalSkills: 25,      // 25%
    experienceMatch: 20,      // 20%
    projectExperience: 15,    // 15%
    education: 12,            // 12%
    certificates: 8,          // 8%
    companyBackground: 5,     // 5%
    skillMatch: 10,           // 10%
    keywordMatch: 5           // 5%
  };

  console.log('\n步骤1：各维度评分');
  console.table(dimensionScores);

  console.log('\n步骤2：权重配置');
  console.table(weights);

  console.log('\n步骤3：计算加权分数');
  let totalScore = 0;
  for (const [key, weight] of Object.entries(weights)) {
    const score = dimensionScores[key as keyof typeof dimensionScores];
    const weightedScore = (score * weight) / 100;
    totalScore += weightedScore;
    console.log(`  ${key}: ${score} × ${weight}% = ${weightedScore.toFixed(2)}`);
  }

  console.log(`\n加权总分: ${totalScore.toFixed(2)}`);

  // 假设有冲突标记
  const conflictMarkers = [
    { type: '描述夸大', description: '项目成果描述过于夸张', severity: 'high' }
  ];

  const penaltyCoefficient = calculatePenaltyCoefficient(conflictMarkers);
  console.log(`\n降权系数: ${penaltyCoefficient.toFixed(2)}`);

  const finalScore = Math.round(totalScore * penaltyCoefficient);
  console.log(`\n最终匹配度分数: ${finalScore}`);

  console.log('\n计算总结:');
  console.log('  加权总分: 83分');
  console.log('  降权系数: 0.95');
  console.log('  最终分数: 83 × 0.95 = 78.85 ≈ 79分');

  return {
    dimensionScores,
    weights,
    totalScore,
    penaltyCoefficient,
    finalScore
  };
}

// 导出示例
export default {
  exampleLiWensen,
  examplePenaltyCoefficient,
  exampleFullCalculation
};
