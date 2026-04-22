import { readFileSync } from 'fs';
import { join } from 'path';
import { getDb } from '@/lib/db';

/**
 * 运行 interview_sessions 表的租户隔离迁移
 * 
 * 使用方法：
 * pnpm tsx migrations/run-interview-sessions-migration.ts
 */

async function runMigration() {
  console.log('开始运行 interview_sessions 租户隔离迁移...');

  try {
    // 读取迁移 SQL 文件
    const sqlPath = join(process.cwd(), 'migrations', 'add-interview-sessions-tenant-isolation.sql');
    const migrationSQL = readFileSync(sqlPath, 'utf-8');

    console.log('迁移 SQL 内容:', migrationSQL);

    // 获取数据库实例
    const db = await getDb();

    // 执行迁移 SQL（直接使用 SQL 语句）
    // 注意：需要将 SQL 分割成单独的语句执行
    const statements = migrationSQL
      .split(';')
      .map(stmt => stmt.trim())
      .filter(stmt => stmt.length > 0 && !stmt.startsWith('--'));

    console.log(`准备执行 ${statements.length} 条 SQL 语句...`);

    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i];
      console.log(`执行语句 ${i + 1}/${statements.length}: ${statement.substring(0, 100)}...`);
      
      try {
        // 使用 execute 来执行原始 SQL
        await db.execute(statement as any);
        console.log(`✓ 语句 ${i + 1} 执行成功`);
      } catch (error) {
        console.error(`✗ 语句 ${i + 1} 执行失败:`, error);
        throw error;
      }
    }

    console.log('✅ interview_sessions 租户隔离迁移完成！');
  } catch (error) {
    console.error('❌ 迁移失败:', error);
    throw error;
  }
}

// 运行迁移
runMigration()
  .then(() => {
    console.log('迁移成功完成');
    process.exit(0);
  })
  .catch((error) => {
    console.error('迁移失败:', error);
    process.exit(1);
  });
