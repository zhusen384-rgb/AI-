/**
 * 快速开始脚本
 * 一键检查环境和执行基础配置
 */

import { getDb } from 'coze-coding-dev-sdk';
import { getEvaluationStats } from '../src/lib/optimization/collect-data';
import { calculateModelAccuracy } from '../src/lib/optimization/analyze';
import { getLatestOptimizedPrompt } from '../src/lib/optimization/optimize';
import fs from 'fs';
import path from 'path';

async function quickStart() {
  console.log('🚀 动态调整功能 - 快速开始\n');
  
  try {
    // 1. 检查数据库连接
    console.log('1️⃣  检查数据库连接...');
    const db = getDb();
    await db.query('SELECT 1');
    console.log('   ✅ 数据库连接正常\n');
    
    // 2. 检查表是否存在
    console.log('2️⃣  检查数据表...');
    const tablesQuery = `
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name IN ('resume_evaluation_records', 'model_optimization_history')
    `;
    const tablesResult = await db.query(tablesQuery);
    const existingTables = tablesResult.rows.map((r: any) => r.table_name);
    
    console.log(`   已存在的表: ${existingTables.join(', ') || '无'}`);
    
    if (existingTables.length < 2) {
      console.log('   ⚠️  缺少必要的数据表，请先运行迁移：');
      console.log('   pnpm tsx migrations/run-optimization-migration.ts\n');
      return;
    }
    console.log('   ✅ 数据表完整\n');
    
    // 3. 检查数据量
    console.log('3️⃣  检查数据量...');
    const stats = await getEvaluationStats();
    console.log(`   总记录数: ${stats.total_records}`);
    console.log(`   已完成评估: ${stats.completed_records}`);
    console.log(`   已录用: ${stats.hired_count}`);
    console.log(`   已淘汰: ${stats.rejected_count}`);
    console.log(`   误判数: ${stats.misclassified_count}\n`);
    
    // 4. 检查模型性能
    console.log('4️⃣  检查模型性能...');
    const metrics = await calculateModelAccuracy();
    console.log(`   准确率: ${(metrics.overall * 100).toFixed(1)}%`);
    console.log(`   精确率: ${(metrics.precision * 100).toFixed(1)}%`);
    console.log(`   召回率: ${(metrics.recall * 100).toFixed(1)}%`);
    console.log(`   F1分数: ${(metrics.f1 * 100).toFixed(1)}%`);
    
    if (metrics.overall < 0.7) {
      console.log('   ⚠️  准确率低于 70%，建议进行优化\n');
    } else {
      console.log('   ✅ 模型性能良好\n');
    }
    
    // 5. 检查优化配置
    console.log('5️⃣  检查优化配置...');
    const optimizedConfig = await getLatestOptimizedPrompt();
    if (optimizedConfig) {
      console.log('   ✅ 已有优化配置');
      console.log(`   创建时间: ${new Date(optimizedConfig.createdAt).toLocaleString('zh-CN')}\n`);
    } else {
      console.log('   ℹ️  暂无优化配置，使用默认设置\n');
    }
    
    // 6. 生成下一步建议
    console.log('6️⃣  下一步建议：');
    
    if (stats.completed_records < 20) {
      console.log('   📝 数据收集阶段');
      console.log('   - 继续收集更多评估记录（至少需要 20 条）');
      console.log('   - 确保每次简历解析都记录评估结果');
      console.log('   - 每次决策后更新实际结果');
    } else if (metrics.overall < 0.7) {
      console.log('   🔧 模型优化阶段');
      console.log('   - 运行分析：pnpm tsx src/lib/optimization/analyze.ts');
      console.log('   - 执行优化：pnpm tsx src/app/api/optimization/optimize/route.ts');
    } else {
      console.log('   📊 持续优化阶段');
      console.log('   - 设置定时任务，每周自动优化');
      console.log('   - 监控模型性能变化');
      console.log('   - 定期审查优化结果');
    }
    
    console.log('\n✅ 快速检查完成！');
    console.log('\n📚 详细文档：docs/IMPLEMENTATION_GUIDE.md\n');
    
  } catch (error) {
    console.error('❌ 检查失败：', error);
    console.error('\n💡 提示：');
    console.error('1. 检查数据库连接配置');
    console.error('2. 确保已运行数据库迁移');
    console.error('3. 查看日志：tail -f /app/work/logs/bypass/app.log');
    process.exit(1);
  }
}

// 运行快速开始
quickStart();
