import { NextRequest, NextResponse } from 'next/server';
import { getDb } from 'coze-coding-dev-sdk';
import * as schema from '@/storage/database/shared/schema';
import { positions } from '@/storage/database/shared/schema';
import { eq } from 'drizzle-orm';
import { authenticateApi } from '@/lib/auth-api';
import { ensurePositionsTable } from '@/lib/db/ensure-positions-table';
import { normalizePositionVetoRules } from '@/lib/position-veto-rules';

/**
 * 更新岗位
 * PUT /api/positions/[id]
 */
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await authenticateApi(req);
    if (!auth.success) {
      return NextResponse.json({ error: auth.error }, { status: 401 });
    }

    const { userId, role } = auth;
    const { id } = await params;
    const body = await req.json();
    await ensurePositionsTable();
    
    const {
      title,
      department,
      jobDescription,
      education,
      experience,
      status,
      coreRequirements,
      softSkills,
      interviewerPreferences,
      vetoRules,
    } = body;

    const db = await getDb(schema);

    // 检查岗位是否存在
    const existingPosition = await db
      .select()
      .from(positions)
      .where(eq(positions.id, parseInt(id)))
      .limit(1);

    if (existingPosition.length === 0) {
      return NextResponse.json(
        { error: '岗位不存在' },
        { status: 404 }
      );
    }

    const position = existingPosition[0];

    // 权限检查：只有创建者或超级管理员可以编辑
    if (position.userId !== userId && role !== 'super_admin') {
      return NextResponse.json(
        { error: '权限不足' },
        { status: 403 }
      );
    }

    // 更新岗位
    const [updatedPosition] = await db
      .update(positions)
      .set({
        title: title || position.title,
        department: department || position.department,
        jobDescription: jobDescription || position.jobDescription,
        education: education || position.education,
        experience: experience !== undefined ? experience : position.experience,
        status: status || position.status,
        coreRequirements: coreRequirements !== undefined ? coreRequirements : position.coreRequirements,
        softSkills: softSkills !== undefined ? softSkills : position.softSkills,
        interviewerPreferences: interviewerPreferences !== undefined ? interviewerPreferences : position.interviewerPreferences,
        vetoRules: vetoRules !== undefined ? normalizePositionVetoRules(vetoRules) : normalizePositionVetoRules(position.vetoRules),
        updatedAt: new Date(),
      })
      .where(eq(positions.id, parseInt(id)))
      .returning();

    return NextResponse.json({
      success: true,
      data: updatedPosition,
      message: '岗位更新成功',
    });
  } catch (error) {
    console.error('更新岗位失败:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : '更新岗位失败',
      },
      { status: 500 }
    );
  }
}

/**
 * 删除岗位
 * DELETE /api/positions/[id]
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await authenticateApi(req);
    if (!auth.success) {
      return NextResponse.json({ error: auth.error }, { status: 401 });
    }

    const { userId, role } = auth;
    const { id } = await params;
    await ensurePositionsTable();

    const db = await getDb(schema);

    // 检查岗位是否存在
    const existingPosition = await db
      .select()
      .from(positions)
      .where(eq(positions.id, parseInt(id)))
      .limit(1);

    if (existingPosition.length === 0) {
      return NextResponse.json(
        { error: '岗位不存在' },
        { status: 404 }
      );
    }

    const position = existingPosition[0];

    // 权限检查：只有创建者或超级管理员可以删除
    if (position.userId !== userId && role !== 'super_admin') {
      return NextResponse.json(
        { error: '权限不足' },
        { status: 403 }
      );
    }

    // 删除岗位
    await db.delete(positions).where(eq(positions.id, parseInt(id)));

    return NextResponse.json({
      success: true,
      message: '岗位删除成功',
    });
  } catch (error) {
    console.error('删除岗位失败:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : '删除岗位失败',
      },
      { status: 500 }
    );
  }
}
