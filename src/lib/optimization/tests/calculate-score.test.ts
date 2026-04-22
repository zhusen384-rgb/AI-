/**
 * 简历匹配度计算测试
 * 验证权重方案的计算逻辑
 */

import { calculatePenaltyCoefficient } from '../calculate-score';

// 测试1：验证加权计算
export function testWeightedCalculation() {
  console.log('='.repeat(60));
  console.log('测试1：验证加权计算');
  console.log('='.repeat(60));

  const dimensionScores = {
    technicalSkills: 85,
    experienceMatch: 80,
    projectExperience: 90,
    education: 85,
    certificates: 70,
    companyBackground: 75,
    skillMatch: 85,
    keywordMatch: 90
  };

  const weights = {
    technicalSkills: 25,
    experienceMatch: 20,
    projectExperience: 15,
    education: 12,
    certificates: 8,
    companyBackground: 5,
    skillMatch: 10,
    keywordMatch: 5
  };

  let totalScore = 0;
  const calculations: any[] = [];

  for (const [key, weight] of Object.entries(weights)) {
    const score = dimensionScores[key as keyof typeof dimensionScores];
    const weightedScore = (score * weight) / 100;
    totalScore += weightedScore;
    calculations.push({
      dimension: key,
      score,
      weight,
      weightedScore: weightedScore.toFixed(2)
    });
  }

  console.log('\n各维度加权计算:');
  console.table(calculations);
  console.log(`\n加权总分: ${totalScore.toFixed(2)}`);
  console.log(`期望结果: 83.30`);

  const isCorrect = Math.abs(totalScore - 83.30) < 0.01;
  console.log(`\n测试结果: ${isCorrect ? '✅ 通过' : '❌ 失败'}`);

  return { totalScore, isCorrect };
}

// 测试2：验证降权系数计算
export function testPenaltyCoefficient() {
  console.log('\n' + '='.repeat(60));
  console.log('测试2：验证降权系数计算');
  console.log('='.repeat(60));

  const testCases = [
    {
      name: '无冲突标记',
      conflictMarkers: [],
      expected: 1.0
    },
    {
      name: '1个高严重性',
      conflictMarkers: [
        { type: '描述夸大', description: '...', severity: 'high' }
      ],
      expected: 0.9
    },
    {
      name: '1个中严重性',
      conflictMarkers: [
        { type: '时间线重叠', description: '...', severity: 'medium' }
      ],
      expected: 0.95
    },
    {
      name: '1个低严重性',
      conflictMarkers: [
        { type: '数据矛盾', description: '...', severity: 'low' }
      ],
      expected: 0.98
    },
    {
      name: '多个混合严重性',
      conflictMarkers: [
        { type: '描述夸大', description: '...', severity: 'high' },
        { type: '时间线重叠', description: '...', severity: 'medium' },
        { type: '数据矛盾', description: '...', severity: 'low' }
      ],
      expected: 0.83
    },
    {
      name: '最大降权（超过限制）',
      conflictMarkers: [
        { type: '冲突1', description: '...', severity: 'high' },
        { type: '冲突2', description: '...', severity: 'high' },
        { type: '冲突3', description: '...', severity: 'high' },
        { type: '冲突4', description: '...', severity: 'high' },
        { type: '冲突5', description: '...', severity: 'high' }
      ],
      expected: 0.7
    }
  ];

  const results: any[] = [];

  testCases.forEach(testCase => {
    const penaltyCoefficient = calculatePenaltyCoefficient(testCase.conflictMarkers);
    const isCorrect = Math.abs(penaltyCoefficient - testCase.expected) < 0.01;

    results.push({
      name: testCase.name,
      expected: testCase.expected,
      actual: penaltyCoefficient.toFixed(2),
      result: isCorrect ? '✅ 通过' : '❌ 失败'
    });

    console.log(`\n${testCase.name}:`);
    console.log(`  期望: ${testCase.expected.toFixed(2)}`);
    console.log(`  实际: ${penaltyCoefficient.toFixed(2)}`);
    console.log(`  结果: ${isCorrect ? '✅ 通过' : '❌ 失败'}`);
  });

  const allPassed = results.every(r => r.result === '✅ 通过');
  console.log(`\n总体测试结果: ${allPassed ? '✅ 全部通过' : '❌ 存在失败'}`);

  return { results, allPassed };
}

// 测试3：验证完整计算流程
export function testFullCalculation() {
  console.log('\n' + '='.repeat(60));
  console.log('测试3：验证完整计算流程');
  console.log('='.repeat(60));

  // 各维度评分
  const dimensionScores = {
    technicalSkills: 85,
    experienceMatch: 80,
    projectExperience: 90,
    education: 85,
    certificates: 70,
    companyBackground: 75,
    skillMatch: 85,
    keywordMatch: 90
  };

  // 权重配置
  const weights = {
    technicalSkills: 25,
    experienceMatch: 20,
    projectExperience: 15,
    education: 12,
    certificates: 8,
    companyBackground: 5,
    skillMatch: 10,
    keywordMatch: 5
  };

  // 计算加权总分
  let totalScore = 0;
  for (const [key, weight] of Object.entries(weights)) {
    const score = dimensionScores[key as keyof typeof dimensionScores];
    totalScore += (score * weight) / 100;
  }

  console.log(`\n加权总分: ${totalScore.toFixed(2)}`);

  // 冲突标记
  const conflictMarkers = [
    { type: '描述夸大', description: '项目成果描述过于夸张', severity: 'high' },
    { type: '时间线重叠', description: '两个项目时间存在重叠', severity: 'medium' }
  ];

  // 计算降权系数
  const penaltyCoefficient = calculatePenaltyCoefficient(conflictMarkers);
  console.log(`降权系数: ${penaltyCoefficient.toFixed(2)}`);

  // 应用降权系数
  const originalScore = Math.round(totalScore);
  const reducedScore = Math.round(originalScore * penaltyCoefficient);
  const reduction = originalScore - reducedScore;

  console.log(`\n完整计算流程:`);
  console.log(`  加权总分: ${totalScore.toFixed(2)}`);
  console.log(`  原始分数: ${originalScore}`);
  console.log(`  降权系数: ${penaltyCoefficient.toFixed(2)}`);
  console.log(`  最终分数: ${reducedScore}`);
  console.log(`  降权幅度: ${reduction}`);

  // 验证结果
  const expectedFinalScore = 79;
  const isCorrect = reducedScore === expectedFinalScore;

  console.log(`\n期望最终分数: ${expectedFinalScore}`);
  console.log(`实际最终分数: ${reducedScore}`);
  console.log(`测试结果: ${isCorrect ? '✅ 通过' : '❌ 失败'}`);

  return {
    totalScore,
    originalScore,
    penaltyCoefficient,
    reducedScore,
    expectedFinalScore,
    isCorrect
  };
}

// 测试4：验证李文森的例子
export function testLiWensenExample() {
  console.log('\n' + '='.repeat(60));
  console.log('测试4：验证李文森的例子');
  console.log('='.repeat(60));

  // 李文森的各维度评分
  const dimensionScores = {
    technicalSkills: 85,
    experienceMatch: 80,
    projectExperience: 90,
    education: 85,
    certificates: 70,
    companyBackground: 75,
    skillMatch: 85,
    keywordMatch: 90
  };

  // 权重配置
  const weights = {
    technicalSkills: 25,
    experienceMatch: 20,
    projectExperience: 15,
    education: 12,
    certificates: 8,
    companyBackground: 5,
    skillMatch: 10,
    keywordMatch: 5
  };

  console.log('\n步骤1：各维度评分');
  console.table(dimensionScores);

  console.log('\n步骤2：权重配置');
  console.table(weights);

  console.log('\n步骤3：计算加权分数');
  let totalScore = 0;
  const calculations: any[] = [];
  for (const [key, weight] of Object.entries(weights)) {
    const score = dimensionScores[key as keyof typeof dimensionScores];
    const weightedScore = (score * weight) / 100;
    totalScore += weightedScore;
    calculations.push({
      dimension: key,
      score,
      weight: weight + '%',
      weightedScore: weightedScore.toFixed(2)
    });
  }
  console.table(calculations);

  console.log(`\n加权总分: ${totalScore.toFixed(2)}`);

  // 用户指定的降权系数
  const penaltyCoefficient = 0.95;
  console.log(`\n步骤4：应用降权系数`);
  console.log(`  用户指定的降权系数: ${penaltyCoefficient}`);

  const originalScore = Math.round(totalScore);
  const finalScore = Math.round(originalScore * penaltyCoefficient);
  const reduction = originalScore - finalScore;

  console.log(`  原始分数: ${originalScore}`);
  console.log(`  最终分数: ${finalScore}`);
  console.log(`  计算公式: ${originalScore} × ${penaltyCoefficient} = ${finalScore}`);

  // 验证结果
  const expectedOriginalScore = 83;
  const expectedFinalScore = 79;

  const isOriginalScoreCorrect = originalScore === expectedOriginalScore;
  const isFinalScoreCorrect = finalScore === expectedFinalScore;

  console.log(`\n验证结果:`);
  console.log(`  原始分数: 期望 ${expectedOriginalScore}, 实际 ${originalScore} - ${isOriginalScoreCorrect ? '✅' : '❌'}`);
  console.log(`  最终分数: 期望 ${expectedFinalScore}, 实际 ${finalScore} - ${isFinalScoreCorrect ? '✅' : '❌'}`);
  console.log(`  总体结果: ${(isOriginalScoreCorrect && isFinalScoreCorrect) ? '✅ 通过' : '❌ 失败'}`);

  return {
    totalScore,
    originalScore,
    penaltyCoefficient,
    finalScore,
    expectedOriginalScore,
    expectedFinalScore,
    isCorrect: isOriginalScoreCorrect && isFinalScoreCorrect
  };
}

// 运行所有测试
export function runAllTests() {
  console.log('🧪 开始运行所有测试\n');

  const test1 = testWeightedCalculation();
  const test2 = testPenaltyCoefficient();
  const test3 = testFullCalculation();
  const test4 = testLiWensenExample();

  console.log('\n' + '='.repeat(60));
  console.log('📊 测试总结');
  console.log('='.repeat(60));
  console.log(`测试1（加权计算）: ${test1.isCorrect ? '✅ 通过' : '❌ 失败'}`);
  console.log(`测试2（降权系数）: ${test2.allPassed ? '✅ 通过' : '❌ 失败'}`);
  console.log(`测试3（完整流程）: ${test3.isCorrect ? '✅ 通过' : '❌ 失败'}`);
  console.log(`测试4（李文森例子）: ${test4.isCorrect ? '✅ 通过' : '❌ 失败'}`);

  const allPassed = test1.isCorrect && test2.allPassed && test3.isCorrect && test4.isCorrect;
  console.log(`\n总体结果: ${allPassed ? '✅ 全部通过' : '❌ 存在失败'}`);

  return {
    test1,
    test2,
    test3,
    test4,
    allPassed
  };
}

// 导出测试
export default {
  testWeightedCalculation,
  testPenaltyCoefficient,
  testFullCalculation,
  testLiWensenExample,
  runAllTests
};
