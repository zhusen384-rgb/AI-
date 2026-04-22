import { NextRequest, NextResponse } from 'next/server';
import { getDb } from 'coze-coding-dev-sdk';
import * as schema from '@/storage/database/shared/schema';
import { positions } from '@/storage/database/shared/schema';
import { eq, or, desc } from 'drizzle-orm';
import { authenticateApi } from '@/lib/auth-api';
import { ensurePositionsTable } from '@/lib/db/ensure-positions-table';
import { normalizePositionVetoRules } from '@/lib/position-veto-rules';

/**
 * 获取岗位列表
 * GET /api/positions
 */
export async function GET(req: NextRequest) {
  try {
    const auth = await authenticateApi(req);
    if (!auth.success) {
      return NextResponse.json({ error: auth.error }, { status: 401 });
    }

    const { userId, role } = auth;
    await ensurePositionsTable();
    const db = await getDb(schema);

    // 获取岗位列表
    // 规则：
    // 1. 全局岗位（is_global = true）所有用户都能看到
    // 2. 非全局岗位只有创建者能看到
    let positionsList;

    if (role === 'super_admin') {
      // 超级管理员能看到所有岗位
      positionsList = await db
        .select()
        .from(positions)
        .orderBy(desc(positions.createdAt));
    } else {
      // 确保userId存在
      const currentUserId = userId as string;
      
      // 其他用户：能看到全局岗位 + 自己创建的岗位
      positionsList = await db
        .select()
        .from(positions)
        .where(
          or(
            eq(positions.isGlobal, true),
            eq(positions.userId, currentUserId)
          )
        )
        .orderBy(desc(positions.createdAt));
    }

    return NextResponse.json({
      success: true,
      data: positionsList,
    });
  } catch (error) {
    console.error('获取岗位列表失败:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : '获取岗位列表失败',
      },
      { status: 500 }
    );
  }
}

/**
 * 创建岗位
 * POST /api/positions
 */
export async function POST(req: NextRequest) {
  try {
    const auth = await authenticateApi(req);
    if (!auth.success) {
      return NextResponse.json({ error: auth.error }, { status: 401 });
    }

    const { userId, tenantId, role } = auth;
    
    // 检查必要字段
    if (!userId) {
      return NextResponse.json({ error: '用户信息不完整' }, { status: 400 });
    }
    
    const body = await req.json();
    
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
      isGlobal, // 是否同步给所有用户
    } = body;

    // 验证必填字段
    if (!title || !department || !jobDescription || !education) {
      return NextResponse.json(
        { error: '请填写所有必填字段' },
        { status: 400 }
      );
    }

    await ensurePositionsTable();
    const db = await getDb(schema);

    // 只有超级管理员可以创建全局岗位
    const isGlobalPosition = role === 'super_admin' && isGlobal === true;

    // 创建岗位
    const [newPosition] = await db
      .insert(positions)
      .values({
        title,
        department,
        jobDescription,
        education,
        experience: experience || null,
        status: status || 'active',
        coreRequirements: coreRequirements || [],
        softSkills: softSkills || [],
        interviewerPreferences: interviewerPreferences || null,
        vetoRules: normalizePositionVetoRules(vetoRules),
        userId,
        tenantId,
        isGlobal: isGlobalPosition,
      })
      .returning();

    return NextResponse.json({
      success: true,
      data: newPosition,
      message: isGlobalPosition 
        ? '岗位创建成功并已同步给所有用户' 
        : '岗位创建成功',
    });
  } catch (error) {
    console.error('创建岗位失败:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : '创建岗位失败',
      },
      { status: 500 }
    );
  }
}
