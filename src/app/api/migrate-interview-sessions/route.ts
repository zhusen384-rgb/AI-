import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { readFileSync } from 'fs';
import { join } from 'path';
import { validateMigrationAccess } from '@/lib/migration-access';

/**
 * 运行 interview_sessions 表的租户隔离迁移
 * 
 * 使用方法：
 * POST /api/migrate-interview-sessions
 */
export async function POST(request: NextRequest) {
  try {
    const accessError = validateMigrationAccess(request);
    if (accessError) {
      return NextResponse.json(
        { error: accessError.message },
        { status: accessError.status }
      );
    }

    console.log('开始运行 interview_sessions 租户隔离迁移...');

    // 读取迁移 SQL 文件
    const sqlPath = join(process.cwd(), 'migrations', 'add-interview-sessions-tenant-isolation.sql');
    const migrationSQL = readFileSync(sqlPath, 'utf-8');

    console.log('迁移 SQL 内容:', migrationSQL);

    // 获取数据库实例
    const db = await getDb();

    // 执行迁移 SQL - 按步骤执行
    // 步骤 1: 添加字段
    console.log('步骤 1: 添加租户和用户字段...');
    try {
      await db.execute(`
        ALTER TABLE interview_sessions
        ADD COLUMN IF NOT EXISTS tenant_id VARCHAR(36),
        ADD COLUMN IF NOT EXISTS user_id VARCHAR(36)
      ` as any);
      console.log('✓ 字段添加成功');
    } catch (error: any) {
      console.error('✗ 字段添加失败:', error);
      // 如果字段已存在，继续执行
      if (!error.message?.includes('already exists') && !error.message?.includes('duplicate column')) {
        throw error;
      }
      console.log('字段已存在，继续...');
    }

    // 步骤 2: 添加索引
    console.log('步骤 2: 添加索引...');
    try {
      await db.execute(`
        CREATE INDEX IF NOT EXISTS idx_interview_sessions_tenant ON interview_sessions(tenant_id)
      ` as any);
      console.log('✓ 租户索引添加成功');
    } catch (error: any) {
      console.error('✗ 租户索引添加失败:', error);
    }

    try {
      await db.execute(`
        CREATE INDEX IF NOT EXISTS idx_interview_sessions_user ON interview_sessions(user_id)
      ` as any);
      console.log('✓ 用户索引添加成功');
    } catch (error: any) {
      console.error('✗ 用户索引添加失败:', error);
    }

    // 步骤 3: 更新现有数据
    console.log('步骤 3: 更新现有数据...');
    try {
      await db.execute(`
        DO $$
        DECLARE
          default_tenant_id VARCHAR(36);
          admin_user_id VARCHAR(36);
        BEGIN
          -- 获取默认租户ID
          SELECT id INTO default_tenant_id FROM tenants WHERE code = 'default' LIMIT 1;
          
          -- 获取管理员用户ID
          SELECT id INTO admin_user_id FROM users WHERE role = 'admin' LIMIT 1;
          
          -- 更新 interview_sessions
          IF default_tenant_id IS NOT NULL THEN
            UPDATE interview_sessions
            SET tenant_id = default_tenant_id
            WHERE tenant_id IS NULL;
          END IF;
          
          IF admin_user_id IS NOT NULL THEN
            UPDATE interview_sessions
            SET user_id = admin_user_id
            WHERE user_id IS NULL;
          END IF;
        END $$
      ` as any);
      console.log('✓ 现有数据更新成功');
    } catch (error: any) {
      console.error('✗ 现有数据更新失败:', error);
    }

    console.log('✅ interview_sessions 租户隔离迁移完成！');

    return NextResponse.json({
      success: true,
      message: '迁移成功完成'
    });
  } catch (error) {
    console.error('❌ 迁移失败:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : '迁移失败',
      },
      { status: 500 }
    );
  }
}
