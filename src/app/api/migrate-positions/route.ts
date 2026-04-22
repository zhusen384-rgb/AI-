import { NextResponse } from 'next/server';
import { ensurePositionsTable } from '@/lib/db/ensure-positions-table';

/**
 * 执行岗位表的数据库迁移
 * 创建或更新 positions 表结构
 */
export async function POST() {
  try {
    console.log('开始执行岗位表迁移...');
    await ensurePositionsTable();

    console.log('✅ 岗位表迁移成功完成！');

    return NextResponse.json({
      success: true,
      message: '岗位表迁移成功完成',
      table: 'positions',
      fields: ['id', 'title', 'department', 'job_description', 'education', 'experience', 'status', 'core_requirements', 'soft_skills', 'interviewer_preferences', 'veto_rules', 'user_id', 'tenant_id', 'is_global'],
    });
  } catch (error) {
    console.error('❌ 岗位表迁移失败：', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : '岗位表迁移失败',
        details: error instanceof Error ? error.stack : undefined,
      },
      { status: 500 }
    );
  }
}
