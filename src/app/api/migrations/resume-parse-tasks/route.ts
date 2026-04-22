import { NextRequest, NextResponse } from 'next/server';
import { getDb } from 'coze-coding-dev-sdk';
import * as schema from '@/lib/db/schema';
import { sql } from 'drizzle-orm';
import { authenticateApi } from '@/lib/api-auth';

/**
 * 执行数据库迁移 - 创建简历批量解析任务表
 * POST /api/migrations/resume-parse-tasks
 */
export async function POST(req: NextRequest) {
  try {
    // 验证管理员权限
    const payload = await authenticateApi(req);
    if (payload.role !== 'super_admin') {
      return NextResponse.json({ error: '权限不足' }, { status: 403 });
    }

    const db = await getDb(schema);

    // 创建表
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS resume_parse_tasks (
        id SERIAL PRIMARY KEY,
        user_id VARCHAR(255) NOT NULL,
        tenant_id VARCHAR(255),
        status VARCHAR(50) NOT NULL DEFAULT 'pending',
        total_count INTEGER NOT NULL DEFAULT 0,
        processed_count INTEGER NOT NULL DEFAULT 0,
        success_count INTEGER NOT NULL DEFAULT 0,
        failed_count INTEGER NOT NULL DEFAULT 0,
        results JSONB NOT NULL DEFAULT '[]',
        error_message TEXT,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);

    // 创建索引
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS idx_resume_parse_tasks_user_id ON resume_parse_tasks(user_id)
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS idx_resume_parse_tasks_status ON resume_parse_tasks(status)
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS idx_resume_parse_tasks_created_at ON resume_parse_tasks(created_at)
    `);

    // 创建唯一约束：同一用户只有一个有效任务
    await db.execute(sql`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_resume_parse_tasks_unique_user 
      ON resume_parse_tasks(user_id) 
      WHERE status IN ('pending', 'processing')
    `);

    return NextResponse.json({
      success: true,
      message: '数据库迁移成功完成！已创建 resume_parse_tasks 表',
    });
  } catch (error) {
    console.error('数据库迁移失败:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : '数据库迁移失败',
      },
      { status: 500 }
    );
  }
}
