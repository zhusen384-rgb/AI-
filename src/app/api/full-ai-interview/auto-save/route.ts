import { NextRequest, NextResponse } from 'next/server';
import { getDb } from 'coze-coding-dev-sdk';
import * as schema from '@/storage/database/shared/schema';
import { eq, desc, and } from 'drizzle-orm';
import { authenticateApi } from '@/lib/api-auth';
import { buildTenantUserFilter } from '@/lib/tenant-filter';

export async function POST(req: NextRequest) {
  try {
    // JWT认证
    const payload = await authenticateApi(req);

    const body = await req.json();
    const { interviewId, messages, qaHistory, currentRound, candidateStatus } = body;

    if (!interviewId) {
      return NextResponse.json(
        { success: false, error: '缺少 interviewId' },
        { status: 400 }
      );
    }

    const db = await getDb(schema);

    // 构建查询条件
    const conditions = [eq(schema.interviewSessions.interviewId, interviewId)];

    // 添加租户和用户过滤
    const tenantUserFilter = buildTenantUserFilter(payload, schema.interviewSessions);
    if (tenantUserFilter) {
      conditions.push(tenantUserFilter);
    }

    // 查找现有的面试会话
    const existingSession = await db
      .select()
      .from(schema.interviewSessions)
      .where(and(...conditions))
      .limit(1);

    if (existingSession.length === 0) {
      return NextResponse.json(
        { success: false, error: '面试会话不存在' },
        { status: 404 }
      );
    }

    // 更新面试会话
    const updateData: any = {
      updatedAt: new Date(),
    };

    if (messages) {
      updateData.messages = messages;
    }

    if (qaHistory) {
      updateData.qaHistory = qaHistory;
    }

    if (currentRound !== undefined) {
      updateData.currentQuestionCount = currentRound;
      updateData.interviewStage = currentRound + 1;
    }

    if (candidateStatus) {
      updateData.candidateStatus = candidateStatus;
    }

    await db
      .update(schema.interviewSessions)
      .set(updateData)
      .where(eq(schema.interviewSessions.interviewId, interviewId));

    return NextResponse.json({
      success: true,
      message: '自动保存成功',
      data: {
        savedAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error('自动保存失败:', error);

    // 认证错误
    if (error && typeof error === 'object' && 'statusCode' in error) {
      return NextResponse.json(
        { error: (error as any).message || '认证失败' },
        { status: (error as any).statusCode || 401 }
      );
    }

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : '自动保存失败',
      },
      { status: 500 }
    );
  }
}

// GET 接口：获取面试会话的自动保存状态
export async function GET(req: NextRequest) {
  try {
    // JWT认证
    const payload = await authenticateApi(req);

    const { searchParams } = new URL(req.url);
    const interviewId = searchParams.get('interviewId');

    if (!interviewId) {
      return NextResponse.json(
        { success: false, error: '缺少 interviewId' },
        { status: 400 }
      );
    }

    const db = await getDb(schema);

    // 构建查询条件
    const conditions = [eq(schema.interviewSessions.interviewId, interviewId)];

    // 添加租户和用户过滤
    const tenantUserFilter = buildTenantUserFilter(payload, schema.interviewSessions);
    if (tenantUserFilter) {
      conditions.push(tenantUserFilter);
    }

    const sessions = await db
      .select()
      .from(schema.interviewSessions)
      .where(and(...conditions))
      .limit(1);

    if (sessions.length === 0) {
      return NextResponse.json(
        { success: false, error: '面试会话不存在' },
        { status: 404 }
      );
    }

    const session = sessions[0];

    return NextResponse.json({
      success: true,
      data: {
        interviewId: session.interviewId,
        messages: session.messages,
        qaHistory: session.qaHistory,
        currentRound: session.currentQuestionCount,
        interviewStage: session.interviewStage,
        candidateStatus: session.candidateStatus,
        lastSavedAt: session.updatedAt,
      },
    });
  } catch (error) {
    console.error('获取自动保存状态失败:', error);

    // 认证错误
    if (error && typeof error === 'object' && 'statusCode' in error) {
      return NextResponse.json(
        { error: (error as any).message || '认证失败' },
        { status: (error as any).statusCode || 401 }
      );
    }

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : '获取自动保存状态失败',
      },
      { status: 500 }
    );
  }
}
