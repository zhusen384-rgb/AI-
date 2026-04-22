/**
 * 执行数据库迁移 - 创建优化相关的表
 * 运行方式: node migrations/run-migration.js
 */

import { db } from '@/lib/db';
import { sql } from 'drizzle-orm';
import fs from 'fs';
import path from 'path';

async function runMigration() {
  console.log('开始执行数据库迁移...');
  
  try {
    // 读取 SQL 文件
    const sqlFilePath = path.join(process.cwd(), 'migrations/add_optimization_tables.sql');
    const sqlContent = fs.readFileSync(sqlFilePath, 'utf-8');
    
    console.log('读取 SQL 文件成功');
    
    // 执行 SQL
    await db.execute(sql.raw(sqlContent));
    
    console.log('✅ 数据库迁移成功完成！');
    console.log('已创建以下表：');
    console.log('  - resume_evaluation_records (简历评估记录表)');
    console.log('  - model_optimization_history (模型优化历史表)');
    
  } catch (error) {
    console.error('❌ 数据库迁移失败：', error);
    process.exit(1);
  }
}

// 运行迁移
runMigration();
