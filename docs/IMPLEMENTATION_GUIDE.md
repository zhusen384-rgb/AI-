# 动态调整功能实施指南

本指南将帮助你分步骤实现简历匹配度评估的动态调整功能。

---

## 📋 实施总览

**总耗时**：约 3-5 天  
**技术难度**：中等  
**预期效果**：3 个月后匹配度评估准确率提升至 80%+

---

## 🗓️ 实施步骤

### 阶段一：数据库准备（第 1 天）

#### 步骤 1.1：执行数据库迁移

```bash
# 运行迁移脚本
pnpm tsx migrations/run-optimization-migration.ts
```

**预期输出**：
```
🚀 开始执行数据库迁移...
📄 读取 SQL 文件成功
📝 准备执行 12 条 SQL 语句
✅ 第 1/12 条语句执行成功
✅ 第 2/12 条语句执行成功
...
🎉 数据库迁移成功完成！
📋 已创建以下表：
  ✅ resume_evaluation_records (简历评估记录表)
  ✅ model_optimization_history (模型优化历史表)
```

#### 步骤 1.2：验证表创建

```bash
# 连接数据库并验证表
psql -d your_database -c "\d resume_evaluation_records"
psql -d your_database -c "\d model_optimization_history"
```

---

### 阶段二：集成数据收集（第 2 天）

#### 步骤 2.1：修改简历解析 API

在 `src/app/api/resume/parse/route.ts` 中添加评估记录：

```typescript
import { recordResumeEvaluation } from '@/lib/optimization/collect-data';

// 在返回结果之前，添加评估记录
if (position && position.jobDescription) {
  console.log('开始岗位匹配分析...');
  const matchAnalysis = await analyzeMatch(resumeContent, position);
  if (matchAnalysis) {
    parsedData.matchAnalysis = matchAnalysis;
    
    // 🆕 记录评估结果（如果提供了 candidateId 和 resumeId）
    if (parsedData.candidateId && parsedData.resumeId) {
      await recordResumeEvaluation({
        candidateId: parsedData.candidateId,
        resumeId: parsedData.resumeId,
        positionId: position.id,
        aiMatchScore: matchAnalysis.matchScore,
        aiEvaluation: matchAnalysis,
      });
    }
  }
}
```

#### 步骤 2.2：在候选人决策时记录实际结果

在候选人管理页面的决策逻辑中添加：

```typescript
import { updateInterviewDecision } from '@/lib/optimization/collect-data';

// 在面试官做出最终决策后调用
async function handleFinalDecision(decision: 'hired' | 'rejected', reason: string) {
  // ... 原有逻辑
  
  // 🆕 更新评估记录
  if (evaluationRecordId) {
    await updateInterviewDecision({
      evaluationRecordId,
      finalDecision: decision,
      decisionReason: reason,
      decisionMadeBy: interviewerId,
      interviewScores: {
        technical: technicalScore,
        communication: communicationScore,
        potential: potentialScore,
      },
    });
  }
}
```

#### 步骤 2.3：初始化历史数据（可选）

如果系统已有历史数据，需要导入：

```bash
# 创建初始化脚本
pnpm tsx src/lib/optimization/init-history-data.ts
```

---

### 阶段三：实现分析功能（第 3 天）

#### 步骤 3.1：创建分析 API

创建 `src/app/api/optimization/analyze/route.ts`：

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { generateOptimizationReport } from '@/lib/optimization/analyze';

export async function GET(req: NextRequest) {
  try {
    const report = await generateOptimizationReport();
    
    return NextResponse.json({
      success: true,
      data: report,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : '分析失败',
      },
      { status: 500 }
    );
  }
}
```

#### 步骤 3.2：创建监控 Dashboard

在管理后台添加优化监控页面 `src/app/admin/optimization/page.tsx`：

```typescript
'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default function OptimizationDashboard() {
  const [metrics, setMetrics] = useState<any>(null);
  const [recommendations, setRecommendations] = useState<any[]>([]);

  useEffect(() => {
    fetchMetrics();
  }, []);

  async function fetchMetrics() {
    const res = await fetch('/api/optimization/analyze');
    const data = await res.json();
    if (data.success) {
      setMetrics(data.data.metrics);
      setRecommendations(data.data.recommendations);
    }
  }

  return (
    <div className="container mx-auto p-6">
      <h1 className="text-3xl font-bold mb-6">模型优化监控</h1>
      
      {/* 性能指标卡片 */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <Card>
          <CardHeader><CardTitle>准确率</CardTitle></CardHeader>
          <CardContent>
            <div className="text-4xl font-bold">
              {metrics ? `${(metrics.overall * 100).toFixed(1)}%` : '-'}
            </div>
          </CardContent>
        </Card>
        {/* ... 其他指标卡片 */}
      </div>

      {/* 优化建议 */}
      <Card>
        <CardHeader><CardTitle>优化建议</CardTitle></CardHeader>
        <CardContent>
          {recommendations.map((rec, idx) => (
            <div key={idx} className={`p-4 rounded-lg mb-2 ${
              rec.type === 'urgent' ? 'bg-red-50 border-red-200' :
              rec.type === 'warning' ? 'bg-yellow-50 border-yellow-200' :
              'bg-blue-50 border-blue-200'
            }`}>
              {rec.message}
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
```

---

### 阶段四：实现自动优化（第 4-5 天）

#### 步骤 4.1：创建优化 API

创建 `src/app/api/optimization/optimize/route.ts`：

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { optimizeModel, saveOptimizationHistory } from '@/lib/optimization/optimize';

export async function POST(req: NextRequest) {
  try {
    const result = await optimizeModel();
    
    if (!result) {
      return NextResponse.json({
        success: false,
        error: '样本量不足，无法优化',
      });
    }
    
    if (!result.shouldDeploy) {
      return NextResponse.json({
        success: true,
        shouldDeploy: false,
        reason: result.reason,
        evaluation: result.evaluation,
      });
    }
    
    // 保存优化历史
    await saveOptimizationHistory({
      oldPrompt: '', // TODO: 从配置中获取
      oldWeights: result.currentMetrics,
      oldAccuracy: result.currentMetrics,
      newPrompt: result.newPrompt,
      newWeights: result.newWeights,
      newAccuracy: result.evaluation.new,
      optimizationMethod: 'hybrid',
      notes: '自动优化',
    });
    
    return NextResponse.json({
      success: true,
      shouldDeploy: true,
      evaluation: result.evaluation,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : '优化失败',
      },
      { status: 500 }
    );
  }
}
```

#### 步骤 4.2：设置定时任务

创建 `scripts/schedule-weekly-optimization.ts`：

```typescript
import { optimizeModel, saveOptimizationHistory } from '@/lib/optimization/optimize';
import { getLatestOptimizedPrompt } from '@/lib/optimization/optimize';

export async function weeklyOptimization() {
  console.log('🗓️  执行每周模型优化...');
  
  try {
    // 1. 获取当前优化配置
    const currentConfig = await getLatestOptimizedPrompt();
    
    // 2. 执行优化
    const result = await optimizeModel();
    
    if (!result || !result.shouldDeploy) {
      console.log('✅ 本周无需优化');
      return;
    }
    
    // 3. 保存优化历史
    await saveOptimizationHistory({
      oldPrompt: currentConfig?.prompt || '默认 Prompt',
      oldWeights: currentConfig?.weights || {},
      oldAccuracy: result.currentMetrics,
      newPrompt: result.newPrompt,
      newWeights: result.newWeights,
      newAccuracy: result.evaluation.new,
      optimizationMethod: 'hybrid',
      notes: '每周自动优化',
    });
    
    console.log('✅ 每周模型优化完成');
  } catch (error) {
    console.error('❌ 每周模型优化失败:', error);
  }
}

// 如果直接运行此脚本
if (require.main === module) {
  weeklyOptimization().then(() => process.exit(0));
}
```

#### 步骤 4.3：集成到简历解析 API

修改 `src/app/api/resume/parse/route.ts`，使用优化后的 Prompt：

```typescript
import { getLatestOptimizedPrompt } from '@/lib/optimization/optimize';

async function analyzeMatch(resumeContent: string, position: any) {
  // 获取最新优化的 Prompt
  const optimizedConfig = await getLatestOptimizedPrompt();
  
  const systemPrompt = optimizedConfig?.prompt || `你是招聘专家...`; // 使用优化后的 Prompt
  
  const messages = [
    { role: 'system' as const, content: systemPrompt },
    { role: 'user' as const, content: matchPrompt },
  ];
  
  // ... 其余逻辑
}
```

---

### 阶段五：监控和验证（持续）

#### 步骤 5.1：设置监控告警

创建 `scripts/check-model-performance.ts`：

```typescript
import { calculateModelAccuracy } from '@/lib/optimization/analyze';
import { OPTIMIZATION_CONFIG } from '@/lib/optimization/config';

export async function checkModelPerformance() {
  console.log('🔍 检查模型性能...');
  
  const metrics = await calculateModelAccuracy();
  
  if (metrics.overall < OPTIMIZATION_CONFIG.MONITORING.ALERT_THRESHOLD) {
    // 发送告警（邮件、钉钉、Slack 等）
    console.error('🚨 模型性能告警！');
    console.error(`   当前准确率: ${(metrics.overall * 100).toFixed(1)}%`);
    console.error(`   阈值: ${OPTIMIZATION_CONFIG.MONITORING.ALERT_THRESHOLD * 100}%`);
    
    // TODO: 实现告警发送逻辑
    // await sendAlert({
    //   title: '模型性能告警',
    //   message: `准确率低于阈值 ${OPTIMIZATION_CONFIG.MONITORING.ALERT_THRESHOLD * 100}%`,
    // });
  } else {
    console.log('✅ 模型性能正常');
  }
}

// 如果直接运行此脚本
if (require.main === module) {
  checkModelPerformance().then(() => process.exit(0));
}
```

#### 步骤 5.2：设置 Cron 任务

在服务器上设置定时任务：

```bash
# 编辑 crontab
crontab -e

# 添加以下任务
# 每周日凌晨 2 点执行优化
0 2 * * 0 cd /path/to/project && pnpm tsx scripts/schedule-weekly-optimization.ts

# 每天早上 9 点检查模型性能
0 9 * * * cd /path/to/project && pnpm tsx scripts/check-model-performance.ts
```

---

## 📊 预期效果

### 时间线

| 时间节点 | 预期准确率 | 关键事件 |
|----------|-----------|---------|
| 第 1 周 | 60-65% | 数据收集开始 |
| 第 1 个月 | 65-72% | 积累 50+ 案例 |
| 第 3 个月 | 75-82% | 首次自动优化 |
| 第 6 个月 | 82-88% | 模型趋于稳定 |

### 收益分析

✅ **减少误判**
- 减少 AI 高分但实际淘汰的候选人（节省面试成本约 30%）
- 发现 AI 低分但实际优秀的候选人（不遗漏人才）

✅ **提高效率**
- 自动筛选准确率提升 15-20%
- 减少人工复核工作量

✅ **知识沉淀**
- 将资深面试官的经验固化到系统中
- 降低对个人经验的依赖

---

## ⚠️ 注意事项

1. **数据质量**
   - 确保所有面试评价都准确录入
   - 决策理由要具体明确
   - 避免主观偏见影响数据

2. **样本偏差**
   - 定期审查优化结果
   - 避免系统学习到不当偏见
   - 必要时进行人工干预

3. **隐私保护**
   - 妥善处理候选人数据
   - 遵守相关法律法规
   - 定期清理过期数据

4. **A/B 测试**
   - 新模型先小范围测试
   - 对比新旧模型效果
   - 确认提升后再全面推广

---

## 🔧 故障排查

### 问题 1：迁移失败

**症状**：运行迁移脚本时报错

**解决**：
```bash
# 检查数据库连接
pnpm tsx -e "import { getDb } from 'coze-coding-dev-sdk'; getDb().query('SELECT 1').then(() => console.log('OK')).catch(e => console.error(e));"

# 检查 SQL 文件路径
ls -la migrations/add_optimization_tables.sql

# 手动执行 SQL（如果需要）
psql -d your_database -f migrations/add_optimization_tables.sql
```

### 问题 2：样本量不足

**症状**：优化时提示"样本量不足"

**解决**：
```bash
# 检查评估记录数量
pnpm tsx -e "import { getEvaluationStats } from './src/lib/optimization/collect-data'; getEvaluationStats().then(console.log);"

# 如果数据量少，可以：
# 1. 扩大采样时间范围（修改 config.ts）
# 2. 手动添加历史数据
# 3. 等待更多数据积累
```

### 问题 3：优化后准确率下降

**症状**：部署新模型后准确率反而下降

**解决**：
```bash
# 回滚到上一个版本
pnpm tsx -e "import { getDb } from 'coze-coding-dev-sdk'; getDb().query(\"UPDATE model_optimization_history SET status = 'rolled_back' WHERE id = (SELECT MAX(id) FROM model_optimization_history)\").then(() => console.log('已回滚'));"

# 检查优化配置
pnpm tsx -e "import { getLatestOptimizedPrompt } from './src/lib/optimization/optimize'; getLatestOptimizedPrompt().then(console.log);"

# 手动调整 Prompt 和权重
```

---

## 📞 支持

如果在实施过程中遇到问题：

1. 检查日志：`tail -f /app/work/logs/bypass/app.log`
2. 运行诊断：`pnpm tsx scripts/diagnose-optimization.ts`
3. 查看文档：参考代码中的注释

---

## 🎉 完成检查清单

- [ ] 数据库迁移成功
- [ ] 数据收集功能集成到简历解析 API
- [ ] 数据收集功能集成到决策流程
- [ ] 分析 Dashboard 创建完成
- [ ] 优化 API 创建完成
- [ ] 定时任务配置完成
- [ ] 监控告警配置完成
- [ ] A/B 测试完成
- [ ] 文档更新完成

完成以上所有项后，恭喜你成功实现了动态调整功能！🎊
