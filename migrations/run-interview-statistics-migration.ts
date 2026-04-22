/**
 * 执行数据库迁移 - 创建面试统计表
 * 运行方式: node migrations/run-interview-statistics-migration.js
 */

import { getClient } from '@/lib/db';
import fs from 'fs';
import path from 'path';

async function runMigration() {
  console.log('开始执行数据库迁移 - 创建面试统计表...');
  
  try {
    // 读取 SQL 文件
    const sqlFilePath = path.join(process.cwd(), 'migrations/add_interview_statistics_table.sql');
    const sqlContent = fs.readFileSync(sqlFilePath, 'utf-8');
    
    console.log('读取 SQL 文件成功');
    
    // 获取数据库客户端
    const client = getClient();
    
    // 执行 SQL（按语句分割）
    const statements = sqlContent
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0);
    
    for (const statement of statements) {
      await client.query(statement);
    }
    
    console.log('✅ 数据库迁移成功完成！');
    console.log('已创建以下表：');
    console.log('  - full_ai_interview_statistics (全AI面试统计表)');
    
  } catch (error) {
    console.error('❌ 数据库迁移失败：', error);
    process.exit(1);
  }
}

// 运行迁移
runMigration();
