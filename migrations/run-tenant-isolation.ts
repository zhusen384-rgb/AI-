import { readFileSync } from 'fs';
import { join } from 'path';
import { getDb } from 'coze-coding-dev-sdk';
import * as schema from './src/storage/database/shared/schema';

async function runMigration() {
  console.log('开始运行租户隔离迁移...');

  try {
    // 读取 SQL 迁移脚本
    const sqlPath = join(__dirname, 'add-tenant-isolation.sql');
    const sql = readFileSync(sqlPath, 'utf-8');

    // 获取数据库连接
    const db = await getDb(schema);

    // 执行迁移
    await db.$client.query(sql);

    console.log('✅ 租户隔离迁移完成！');
  } catch (error) {
    console.error('❌ 迁移失败:', error);
    process.exit(1);
  }
}

// 运行迁移
runMigration().then(() => {
  console.log('迁移脚本执行完毕');
  process.exit(0);
});
