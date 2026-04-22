import { getDb } from '../node_modules/coze-coding-dev-sdk/dist/database';
import { readFileSync } from 'fs';
import { join } from 'path';
import { sql } from 'drizzle-orm';

async function runMigration() {
  try {
    console.log('开始执行数据库迁移 - 添加认证安全表...');

    // 读取 SQL 文件
    const sqlPath = join(process.cwd(), 'migrations/add-auth-security-tables.sql');
    const sqlContent = readFileSync(sqlPath, 'utf-8');

    console.log('读取 SQL 文件成功');

    // 执行 SQL
    const db = await getDb();
    await db.execute(sql.raw(sqlContent));

    console.log('✅ 数据库迁移成功完成！');
    console.log('已创建以下表和字段：');
    console.log('  - login_logs (登录日志表)');
    console.log('  - invitation_codes (邀请码表)');
    console.log('  - users 表新增字段：loginCount, lastLoginIp, createdBy, updatedBy');
    console.log('  - 自动更新触发器：users.updated_at, invitation_codes.updated_at');

  } catch (error) {
    console.error('❌ 数据库迁移失败：', error);
    process.exit(1);
  }
}

runMigration();
