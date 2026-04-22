/**
 * 数据库迁移脚本 - 优化模块表
 * 
 * 执行方式: pnpm tsx migrations/run-optimization-migration.ts
 */

import { exec_sql } from '../node_modules/coze-coding-dev-sdk/dist/database';
import * as fs from 'fs';
import * as path from 'path';

// 读取 SQL 文件
const sqlPath = path.join(process.cwd(), 'migrations', 'add_optimization_tables.sql');
let sqlStatements: string[] = [];

try {
  const sqlContent = fs.readFileSync(sqlPath, 'utf-8');
  // 按分号分割 SQL 语句，过滤空语句和注释
  sqlStatements = sqlContent
    .split(';')
    .map(s => s.trim())
    .filter(s => s && !s.startsWith('--') && !s.startsWith('/*'));
} catch (error) {
  console.error(`❌ 读取 SQL 文件失败: ${error}`);
  process.exit(1);
}

console.log(`🚀 开始执行数据库迁移...`);
console.log(`📄 读取 SQL 文件成功`);
console.log(`📝 准备执行 ${sqlStatements.length} 条 SQL 语句`);

// 逐条执行 SQL 语句
async function runMigration() {
  let successCount = 0;
  let failCount = 0;

  for (let i = 0; i < sqlStatements.length; i++) {
    const statement = sqlStatements[i];
    try {
      console.log(`\n执行第 ${i + 1}/${sqlStatements.length} 条语句...`);
      const result = await exec_sql({ sql: statement });
      console.log(`✅ 第 ${i + 1} 条语句执行成功`);
      successCount++;
    } catch (error) {
      console.error(`❌ 第 ${i + 1} 条语句执行失败: ${error}`);
      console.error(`失败语句: ${statement.substring(0, 100)}...`);
      failCount++;
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log(`📊 迁移执行结果:`);
  console.log(`   ✅ 成功: ${successCount} 条`);
  console.log(`   ❌ 失败: ${failCount} 条`);
  console.log('='.repeat(60));

  if (failCount > 0) {
    console.error('\n❌ 数据库迁移失败');
    process.exit(1);
  } else {
    console.log('\n✅ 数据库迁移成功完成！');
  }
}

runMigration().catch(error => {
  console.error('\n❌ 数据库迁移异常:', error);
  process.exit(1);
});
