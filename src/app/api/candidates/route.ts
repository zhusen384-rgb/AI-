import { NextRequest, NextResponse } from 'next/server';
import { getDb } from 'coze-coding-dev-sdk';
import * as schema from '@/lib/db/schema';
import { authenticateApi } from '@/lib/api-auth';
import { and, eq, or, sql } from 'drizzle-orm';
import { ensureCandidatesTable } from '@/lib/db/ensure-candidates-table';
import {
  normalizeResumeEmail,
  normalizeResumeName,
  normalizeResumePhone,
} from '@/lib/resume-contact-info';

interface CreateCandidateRequest {
  name: string;
  gender?: string;
  school?: string;
  major?: string;
  education?: string;
  phone?: string;
  email?: string;
  position?: string;
  source?: string;
  status?: string;
  resumeUploaded?: boolean;
  resumeFileName?: string;
  resumeFileKey?: string;
  resumeDownloadUrl?: string;
  resumeParsedData?: unknown;
  resumeUploadedAt?: string;
  interviewStage?: string;
  initialInterviewPassed?: string | null;
  secondInterviewPassed?: string | null;
  finalInterviewPassed?: string | null;
  isHired?: boolean;
  initialInterviewTime?: string | null;
  secondInterviewTime?: string | null;
  finalInterviewTime?: string | null;
  initialInterviewEvaluation?: string | null;
  secondInterviewEvaluation?: string | null;
  finalInterviewEvaluation?: string | null;
  resumeData?: unknown;
  positionId?: string;
  forceCreate?: boolean; // 强制创建，跳过重复检测
}

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

function buildDuplicateResponse(existingCandidate: typeof schema.candidates.$inferSelect, matchFields: string[]) {
  return NextResponse.json({
    success: false,
    error: '检测到重复候选人',
    isDuplicate: true,
    existingCandidate,
    matchFields,
  }, { status: 409 });
}

type DuplicateCandidateResult = {
  candidate: typeof schema.candidates.$inferSelect;
  matchFields: string[];
};

function buildCandidateDedupKeys(params: {
  normalizedName: string;
  normalizedPhone: string;
  normalizedEmail: string;
  normalizedResumeFileKey: string;
  normalizedResumeFileName: string;
}) {
  const keys = new Set<string>();

  if (params.normalizedResumeFileKey) {
    keys.add(`resume-file-key:${params.normalizedResumeFileKey}`);
  }

  if (params.normalizedPhone) {
    keys.add(`phone:${params.normalizedPhone}`);
  }

  if (params.normalizedEmail) {
    keys.add(`email:${params.normalizedEmail}`);
  }

  if (params.normalizedName && params.normalizedResumeFileName) {
    keys.add(`name-file:${params.normalizedName}::${params.normalizedResumeFileName}`);
  }

  if (params.normalizedName && params.normalizedPhone) {
    keys.add(`name-phone:${params.normalizedName}::${params.normalizedPhone}`);
  }

  return Array.from(keys).sort();
}

async function findExistingDuplicateCandidate(
  db: any,
  params: {
    normalizedName: string;
    normalizedPhone: string;
    normalizedEmail: string;
    normalizedResumeFileKey: string;
    normalizedResumeFileName: string;
  }
): Promise<DuplicateCandidateResult | null> {
  const {
    normalizedName,
    normalizedPhone,
    normalizedEmail,
    normalizedResumeFileKey,
    normalizedResumeFileName,
  } = params;

  if (normalizedResumeFileKey) {
    const existingByFileKey = await db
      .select()
      .from(schema.candidates)
      .where(eq(schema.candidates.resumeFileKey, normalizedResumeFileKey))
      .limit(1);

    if (existingByFileKey.length > 0) {
      return { candidate: existingByFileKey[0], matchFields: ['简历文件'] };
    }
  }

  const contactConditions = [];
  if (normalizedPhone) {
    contactConditions.push(eq(schema.candidates.phone, normalizedPhone));
  }
  if (normalizedEmail) {
    contactConditions.push(eq(schema.candidates.email, normalizedEmail));
  }

  if (contactConditions.length > 0) {
    const existingByContact = await db
      .select()
      .from(schema.candidates)
      .where(or(...contactConditions));

    if (existingByContact.length > 0) {
      const matchedCandidate = existingByContact[0];
      return {
        candidate: matchedCandidate,
        matchFields:
          normalizedPhone && matchedCandidate.phone === normalizedPhone
            ? ['手机号']
            : ['邮箱'],
      };
    }
  }

  if (normalizedName && normalizedResumeFileName) {
    const existingByNameAndFileName = await db
      .select()
      .from(schema.candidates)
      .where(
        and(
          eq(schema.candidates.name, normalizedName),
          eq(schema.candidates.resumeFileName, normalizedResumeFileName)
        )
      )
      .limit(1);

    if (existingByNameAndFileName.length > 0) {
      return { candidate: existingByNameAndFileName[0], matchFields: ['姓名', '文件名'] };
    }
  }

  return null;
}

function isApiAuthError(error: unknown): error is { message?: string; statusCode?: number } {
  return Boolean(error && typeof error === 'object' && 'statusCode' in error);
}

// GET - 获取候选人列表（全域共享）
export async function GET(request: NextRequest) {
  try {
    const payload = await authenticateApi(request);
    await ensureCandidatesTable();
    
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const search = searchParams.get('search');

    // 获取数据库连接
    const db = await getDb(schema);

    // 全域共享：查询所有候选人数据
    const candidateList =
      status && status !== 'all'
        ? await db.select().from(schema.candidates).where(eq(schema.candidates.status, status))
        : await db.select().from(schema.candidates);

    // 如果有搜索关键词
    let filteredList = candidateList;
    if (search) {
      const searchLower = search.toLowerCase();
      filteredList = candidateList.filter((c) => 
        c.name.toLowerCase().includes(searchLower) ||
        c.phone?.includes(search) ||
        c.email?.toLowerCase().includes(searchLower)
      );
    }

    // 为每个候选人添加权限信息
    const candidatesWithPermission = filteredList.map((c) => ({
      ...c,
      canEdit: canEditCandidate({ userId: payload.userId, role: payload.role }, c),
      canDelete: canEditCandidate({ userId: payload.userId, role: payload.role }, c),
    }));

    return NextResponse.json({
      success: true,
      data: candidatesWithPermission,
      currentUser: {
        userId: payload.userId,
        name: payload.name,
        role: payload.role,
      },
    });
  } catch (error) {
    console.error('获取候选人列表失败:', error);
    
    if (isApiAuthError(error)) {
      return NextResponse.json(
        { error: error.message || '认证失败' },
        { status: error.statusCode || 401 }
      );
    }

    return NextResponse.json(
      { error: '获取候选人列表失败' },
      { status: 500 }
    );
  }
}

// POST - 创建候选人（记录创建者信息）
export async function POST(request: NextRequest) {
  try {
    const payload = await authenticateApi(request);
    await ensureCandidatesTable();
    
    const body: CreateCandidateRequest = await request.json();
    const {
      name,
      gender,
      school,
      major,
      education,
      phone,
      email,
      position,
      source,
      status,
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
      resumeData,
      forceCreate,
    } = body;

    if (!name?.trim()) {
      return NextResponse.json(
        { error: '姓名不能为空' },
        { status: 400 }
      );
    }

    if (!gender?.trim()) {
      return NextResponse.json(
        { error: '性别不能为空' },
        { status: 400 }
      );
    }

    if (!school?.trim()) {
      return NextResponse.json(
        { error: '学校不能为空' },
        { status: 400 }
      );
    }

    if (!major?.trim()) {
      return NextResponse.json(
        { error: '专业不能为空' },
        { status: 400 }
      );
    }

    if (!education?.trim()) {
      return NextResponse.json(
        { error: '学历不能为空' },
        { status: 400 }
      );
    }

    if (!phone?.trim()) {
      return NextResponse.json(
        { error: '手机号不能为空' },
        { status: 400 }
      );
    }

    if (!position?.trim()) {
      return NextResponse.json(
        { error: '应聘岗位不能为空' },
        { status: 400 }
      );
    }

    const normalizedName = normalizeResumeName(name) || name.trim();
    const normalizedPhone = normalizeResumePhone(phone);
    const normalizedEmail = normalizeResumeEmail(email);
    const normalizedGender = typeof gender === 'string' ? gender.trim() : '';
    const normalizedSchool = typeof school === 'string' ? school.trim() : '';
    const normalizedMajor = typeof major === 'string' ? major.trim() : '';
    const normalizedEducation = typeof education === 'string' ? education.trim() : '';
    const normalizedPosition = typeof position === 'string' ? position.trim() : '';
    const normalizedResumeFileKey = typeof resumeFileKey === 'string' ? resumeFileKey.trim() : '';
    const normalizedResumeFileName = typeof resumeFileName === 'string' ? resumeFileName.trim() : '';

    // 获取数据库连接
    const db = await getDb(schema);

    const transactionResult = await db.transaction(async (tx) => {
      if (!forceCreate) {
        const dedupKeys = buildCandidateDedupKeys({
          normalizedName,
          normalizedPhone,
          normalizedEmail,
          normalizedResumeFileKey,
          normalizedResumeFileName,
        });

        for (const dedupKey of dedupKeys) {
          await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${dedupKey}))`);
        }

        const duplicateCandidateResult = await findExistingDuplicateCandidate(tx, {
          normalizedName,
          normalizedPhone,
          normalizedEmail,
          normalizedResumeFileKey,
          normalizedResumeFileName,
        });

        if (duplicateCandidateResult) {
          return {
            newCandidate: null,
            duplicateCandidateResult,
          };
        }
      }

      const [createdCandidate] = await tx
        .insert(schema.candidates)
        .values({
          name: normalizedName,
          gender: normalizedGender || null,
          school: normalizedSchool || null,
          major: normalizedMajor || null,
          education: normalizedEducation || null,
          phone: normalizedPhone || null,
          email: normalizedEmail || null,
          position: normalizedPosition || null,
          source: source || '手动录入',
          status: status || 'pending',
          resumeUploaded: resumeUploaded ?? false,
          resumeFileName: normalizedResumeFileName || null,
          resumeFileKey: normalizedResumeFileKey || null,
          resumeDownloadUrl: resumeDownloadUrl || null,
          resumeParsedData: resumeParsedData ?? null,
          resumeUploadedAt: resumeUploadedAt || null,
          interviewStage: interviewStage || 'pending',
          initialInterviewPassed: initialInterviewPassed ?? null,
          secondInterviewPassed: secondInterviewPassed ?? null,
          finalInterviewPassed: finalInterviewPassed ?? null,
          isHired: isHired ?? false,
          initialInterviewTime: initialInterviewTime ?? null,
          secondInterviewTime: secondInterviewTime ?? null,
          finalInterviewTime: finalInterviewTime ?? null,
          initialInterviewEvaluation: initialInterviewEvaluation ?? null,
          secondInterviewEvaluation: secondInterviewEvaluation ?? null,
          finalInterviewEvaluation: finalInterviewEvaluation ?? null,
          // 记录创建者信息
          createdById: payload.userId,
          createdByName: payload.name,
          createdByUsername: payload.username,
          updatedAt: new Date(),
        })
        .returning();

      return {
        newCandidate: createdCandidate,
        duplicateCandidateResult: null,
      };
    });

    const { newCandidate, duplicateCandidateResult: duplicateInfo } = transactionResult;

    if (duplicateInfo) {
      return buildDuplicateResponse(
        duplicateInfo.candidate,
        duplicateInfo.matchFields
      );
    }

    if (!newCandidate) {
      return NextResponse.json(
        { error: '创建候选人失败' },
        { status: 500 }
      );
    }

    // 如果有简历数据，创建简历记录
    if (resumeData && newCandidate.id) {
      // 注意：这里需要 fileUrl，暂时跳过简历表插入
      // 在实际使用中，应该先上传文件到对象存储
      console.log('候选人创建成功，简历数据待处理:', newCandidate.id);
    }

    return NextResponse.json({
      success: true,
      data: {
        ...newCandidate,
        canEdit: true, // 创建者拥有编辑权限
        canDelete: true, // 创建者拥有删除权限
      },
    });
  } catch (error) {
    console.error('创建候选人失败:', error);
    
    if (isApiAuthError(error)) {
      return NextResponse.json(
        { error: error.message || '认证失败' },
        { status: error.statusCode || 401 }
      );
    }

    return NextResponse.json(
      { error: '创建候选人失败' },
      { status: 500 }
    );
  }
}
