/**
 * 执行数据库迁移 - 创建简历批量解析任务表
 * 运行方式: npx tsx migrations/run-resume-parse-tasks-migration.ts
 */

import { getDb } from 'coze-coding-dev-sdk';
import * as schema from '@/lib/db/schema';
import { sql } from 'drizzle-orm';
import fs from 'fs';
import path from 'path';

async function runMigration() {
  console.log('开始执行数据库迁移...');
  
  try {
    // 获取数据库连接
    const db = await getDb(schema);
    
    // 读取 SQL 文件
    const sqlFilePath = path.join(process.cwd(), 'migrations/add_resume_parse_tasks_table.sql');
    const sqlContent = fs.readFileSync(sqlFilePath, 'utf-8');
    
    console.log('读取 SQL 文件成功');
    
    // 执行 SQL
    await db.execute(sql.raw(sqlContent));
    
    console.log('✅ 数据库迁移成功完成！');
    console.log('已创建以下表：');
    console.log('  - resume_parse_tasks (简历批量解析任务表)');
    
  } catch (error) {
    console.error('❌ 数据库迁移失败：', error);
    process.exit(1);
  }
}

// 运行迁移
runMigration();
