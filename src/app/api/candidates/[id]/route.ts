import { NextRequest, NextResponse } from 'next/server';
import { getDb } from 'coze-coding-dev-sdk';
import * as schema from '@/lib/db/schema';
import { authenticateApi } from '@/lib/api-auth';
import { eq } from 'drizzle-orm';
import { ensureCandidatesTable } from '@/lib/db/ensure-candidates-table';

/**
 * 检查用户是否有权限编辑/删除候选人
 * 规则：
 * 1. 超级管理员(super_admin)拥有所有数据的编辑权限
 * 2. 管理员(admin)拥有所有数据的编辑权限（兜底权限）
 * 3. 普通用户只能编辑自己创建的数据
 */
function canEditCandidate(user: { userId: string; role: string }, candidate: { createdById?: string | null }): boolean {
  // 超级管理员和管理员拥有所有权限
  if (user.role === 'super_admin' || user.role === 'admin') {
    return true;
  }
  
  // 普通用户只能编辑自己创建的数据
  return candidate.createdById === user.userId;
}

// GET - 获取候选人详情
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const payload = await authenticateApi(request);
    await ensureCandidatesTable();
    const { id } = await params;

    const db = await getDb(schema);

    const [candidate] = await db
      .select()
      .from(schema.candidates)
      .where(eq(schema.candidates.id, parseInt(id)));

    if (!candidate) {
      return NextResponse.json(
        { error: '候选人不存在' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        ...candidate,
        canEdit: canEditCandidate({ userId: payload.userId, role: payload.role }, candidate),
        canDelete: canEditCandidate({ userId: payload.userId, role: payload.role }, candidate),
      },
    });
  } catch (error) {
    console.error('获取候选人详情失败:', error);
    
    if (error && typeof error === 'object' && 'statusCode' in error) {
      return NextResponse.json(
        { error: (error as any).message || '认证失败' },
        { status: (error as any).statusCode || 401 }
      );
    }

    return NextResponse.json(
      { error: '获取候选人详情失败' },
      { status: 500 }
    );
  }
}

// PUT - 更新候选人（权限控制）
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const payload = await authenticateApi(request);
    await ensureCandidatesTable();
    const { id } = await params;

    const db = await getDb(schema);

    // 先获取候选人，检查权限
    const [existingCandidate] = await db
      .select()
      .from(schema.candidates)
      .where(eq(schema.candidates.id, parseInt(id)));

    if (!existingCandidate) {
      return NextResponse.json(
        { error: '候选人不存在' },
        { status: 404 }
      );
    }

    // 权限检查
    if (!canEditCandidate({ userId: payload.userId, role: payload.role }, existingCandidate)) {
      return NextResponse.json(
        { error: '权限不足，您只能编辑自己创建的候选人数据' },
        { status: 403 }
      );
    }

    // 解析更新数据
    const body = await request.json();
    const {
      name,
      gender,
      school,
      major,
      education,
      phone,
      email,
      position,
      status,
      source,
      resumeUploaded,
      resumeFileName,
      resumeFileKey,
      resumeDownloadUrl,
      resumeParsedData,
      resumeUploadedAt,
      interviewStage,
      initialInterviewPassed,
      secondInterviewPassed,
      finalInterviewPassed,
      isHired,
      initialInterviewTime,
      secondInterviewTime,
      finalInterviewTime,
      initialInterviewEvaluation,
      secondInterviewEvaluation,
      finalInterviewEvaluation,
    } = body;

    // 更新候选人
    const [updatedCandidate] = await db
      .update(schema.candidates)
      .set({
        ...(name && { name }),
        ...(gender !== undefined && { gender: gender || null }),
        ...(school !== undefined && { school: school || null }),
        ...(major !== undefined && { major: major || null }),
        ...(education !== undefined && { education: education || null }),
        ...(phone !== undefined && { phone: phone || null }),
        ...(email !== undefined && { email: email || null }),
        ...(position !== undefined && { position: position || null }),
        ...(status && { status }),
        ...(source !== undefined && { source: source || null }),
        ...(resumeUploaded !== undefined && { resumeUploaded }),
        ...(resumeFileName !== undefined && { resumeFileName: resumeFileName || null }),
        ...(resumeFileKey !== undefined && { resumeFileKey: resumeFileKey || null }),
        ...(resumeDownloadUrl !== undefined && { resumeDownloadUrl: resumeDownloadUrl || null }),
        ...(resumeParsedData !== undefined && { resumeParsedData: resumeParsedData || null }),
        ...(resumeUploadedAt !== undefined && { resumeUploadedAt: resumeUploadedAt || null }),
        ...(interviewStage !== undefined && { interviewStage: interviewStage || 'pending' }),
        ...(initialInterviewPassed !== undefined && { initialInterviewPassed: initialInterviewPassed || null }),
        ...(secondInterviewPassed !== undefined && { secondInterviewPassed: secondInterviewPassed || null }),
        ...(finalInterviewPassed !== undefined && { finalInterviewPassed: finalInterviewPassed || null }),
        ...(isHired !== undefined && { isHired }),
        ...(initialInterviewTime !== undefined && { initialInterviewTime: initialInterviewTime || null }),
        ...(secondInterviewTime !== undefined && { secondInterviewTime: secondInterviewTime || null }),
        ...(finalInterviewTime !== undefined && { finalInterviewTime: finalInterviewTime || null }),
        ...(initialInterviewEvaluation !== undefined && { initialInterviewEvaluation: initialInterviewEvaluation || null }),
        ...(secondInterviewEvaluation !== undefined && { secondInterviewEvaluation: secondInterviewEvaluation || null }),
        ...(finalInterviewEvaluation !== undefined && { finalInterviewEvaluation: finalInterviewEvaluation || null }),
        updatedAt: new Date(),
      })
      .where(eq(schema.candidates.id, parseInt(id)))
      .returning();

    return NextResponse.json({
      success: true,
      data: {
        ...updatedCandidate,
        canEdit: true,
        canDelete: true,
      },
    });
  } catch (error) {
    console.error('更新候选人失败:', error);
    
    if (error && typeof error === 'object' && 'statusCode' in error) {
      return NextResponse.json(
        { error: (error as any).message || '认证失败' },
        { status: (error as any).statusCode || 401 }
      );
    }

    return NextResponse.json(
      { error: '更新候选人失败' },
      { status: 500 }
    );
  }
}

// DELETE - 删除候选人（权限控制）
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const payload = await authenticateApi(request);
    await ensureCandidatesTable();
    const { id } = await params;

    const db = await getDb(schema);

    // 先获取候选人，检查权限
    const [existingCandidate] = await db
      .select()
      .from(schema.candidates)
      .where(eq(schema.candidates.id, parseInt(id)));

    if (!existingCandidate) {
      return NextResponse.json(
        { error: '候选人不存在' },
        { status: 404 }
      );
    }

    // 权限检查
    if (!canEditCandidate({ userId: payload.userId, role: payload.role }, existingCandidate)) {
      return NextResponse.json(
        { error: '权限不足，您只能删除自己创建的候选人数据' },
        { status: 403 }
      );
    }

    // 删除候选人
    await db
      .delete(schema.candidates)
      .where(eq(schema.candidates.id, parseInt(id)));

    return NextResponse.json({
      success: true,
      message: '候选人已删除',
    });
  } catch (error) {
    console.error('删除候选人失败:', error);
    
    if (error && typeof error === 'object' && 'statusCode' in error) {
      return NextResponse.json(
        { error: (error as any).message || '认证失败' },
        { status: (error as any).statusCode || 401 }
      );
    }

    return NextResponse.json(
      { error: '删除候选人失败' },
      { status: 500 }
    );
  }
}
