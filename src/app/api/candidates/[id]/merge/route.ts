import { NextRequest, NextResponse } from 'next/server';
import { getDb } from 'coze-coding-dev-sdk';
import * as schema from '@/lib/db/schema';
import { authenticateApi } from '@/lib/api-auth';
import { eq } from 'drizzle-orm';

interface MergeRequest {
  newResumeData: any;
  newFileName: string;
}

// POST - 合并重复候选人的简历信息
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const payload = await authenticateApi(request);
    const { id } = await params;
    const candidateId = parseInt(id, 10);

    if (isNaN(candidateId)) {
      return NextResponse.json(
        { error: '无效的候选人ID' },
        { status: 400 }
      );
    }

    const body: MergeRequest = await request.json();
    const { newResumeData, newFileName } = body;

    // 获取数据库连接
    const db = await getDb(schema);

    // 获取现有候选人信息
    const [existingCandidate] = await db
      .select()
      .from(schema.candidates)
      .where(eq(schema.candidates.id, candidateId));

    if (!existingCandidate) {
      return NextResponse.json(
        { error: '候选人不存在' },
        { status: 404 }
      );
    }

    // 合并基本信息
    const mergedBasicInfo = {
      ...newResumeData?.basicInfo,
      // 保留现有信息（如果新信息为空）
      name: newResumeData?.basicInfo?.name || existingCandidate.name,
      phone: newResumeData?.basicInfo?.phone || existingCandidate.phone,
      email: newResumeData?.basicInfo?.email || existingCandidate.email,
    };

    // 更新候选人基本信息（如果新数据有补充）
    const updateData: any = {};
    if (newResumeData?.basicInfo?.phone && !existingCandidate.phone) {
      updateData.phone = newResumeData.basicInfo.phone;
    }
    if (newResumeData?.basicInfo?.email && !existingCandidate.email) {
      updateData.email = newResumeData.basicInfo.email;
    }

    if (Object.keys(updateData).length > 0) {
      await db
        .update(schema.candidates)
        .set(updateData)
        .where(eq(schema.candidates.id, candidateId));
    }

    // 创建新的简历记录（关联到现有候选人）
    // 注意：这里需要一个 fileUrl，暂时使用占位符
    const newResume = await db
      .insert(schema.resumes)
      .values({
        candidateId,
        fileName: newFileName || 'merged_resume.txt',
        fileUrl: `merged://${candidateId}/${Date.now()}`, // 占位符 URL
        parsedData: {
          ...newResumeData,
          basicInfo: mergedBasicInfo,
          mergedAt: new Date().toISOString(),
          mergedBy: payload.userId,
        },
        conflictMarkers: newResumeData?.conflictMarkers || null,
      })
      .returning();

    return NextResponse.json({
      success: true,
      data: {
        candidate: existingCandidate,
        newResume: newResume[0],
        mergedFields: Object.keys(updateData),
      },
      message: '简历信息已合并',
    });
  } catch (error) {
    console.error('合并候选人失败:', error);
    
    if (error && typeof error === 'object' && 'statusCode' in error) {
      return NextResponse.json(
        { error: (error as any).message || '认证失败' },
        { status: (error as any).statusCode || 401 }
      );
    }

    return NextResponse.json(
      { error: '合并候选人失败' },
      { status: 500 }
    );
  }
}
