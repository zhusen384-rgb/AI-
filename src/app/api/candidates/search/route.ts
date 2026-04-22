import { NextRequest, NextResponse } from 'next/server';
import { getDb } from 'coze-coding-dev-sdk';
import * as schema from '@/lib/db/schema';
import { eq, ilike, desc } from 'drizzle-orm';
import { authenticateApi } from '@/lib/api-auth';
import { ensureCandidatesTable } from '@/lib/db/ensure-candidates-table';
import { extractResumeFromBuffer } from '@/lib/resume-extract';
import { readResumeFileByKey, getResumeContentType } from '@/lib/resume-storage';

interface ParsedResumeData {
  basicInfo?: {
    name?: string;
    phone?: string;
    email?: string;
    location?: string;
  };
  workExperience?: Array<{
    company?: string;
    position?: string;
    duration?: string;
    description?: string;
    responsibilities?: string[];
    achievements?: string[];
  }>;
  education?: {
    school?: string;
    major?: string;
    degree?: string;
    gpa?: string;
    scholarships?: string[];
  };
  skills?: Array<string | { name?: string; level?: string }>;
  projects?: Array<{
    name?: string;
    duration?: string;
    role?: string;
    description?: string;
    tasks?: string[];
    results?: string[];
    technologies?: string[];
  }>;
  awards?: Array<{
    name?: string;
    date?: string;
  }>;
}

interface CandidateResumeParsedData {
  content?: string;
  parsedData?: ParsedResumeData | null;
  parsedAt?: string;
  error?: string;
  parseStatus?: string;
}

type UnknownRecord = Record<string, unknown>;

interface LegacyResumeParsedData {
  personal_info?: {
    name?: string;
    phone?: string;
    email?: string;
    location?: string;
  };
  work_experience?: Array<{
    company?: string;
    position?: string;
    startDate?: string;
    endDate?: string;
    responsibilities?: string;
  }>;
  education?: Array<{
    school?: string;
    major?: string;
    degree?: string;
    graduationYear?: string;
  }>;
  skills?: string[];
  projects?: Array<{
    name?: string;
    description?: string;
  }>;
  awards?: Array<{
    name?: string;
    date?: string;
  }>;
}

function isApiAuthError(error: unknown): error is { message?: string; statusCode?: number } {
  return Boolean(error && typeof error === 'object' && 'statusCode' in error);
}

function isRecord(value: unknown): value is UnknownRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizeCandidateResumeParsedData(value: unknown): CandidateResumeParsedData | null {
  if (!value) {
    return null;
  }

  let normalizedValue = value;
  if (typeof normalizedValue === 'string') {
    try {
      normalizedValue = JSON.parse(normalizedValue);
    } catch {
      return null;
    }
  }

  if (!isRecord(normalizedValue)) {
    return null;
  }

  if ('content' in normalizedValue || 'parsedData' in normalizedValue || 'error' in normalizedValue) {
    return normalizedValue as CandidateResumeParsedData;
  }

  return {
    parsedData: normalizedValue as ParsedResumeData,
  };
}

function normalizeLegacyResumeParsedData(value: unknown): LegacyResumeParsedData | null {
  if (!value) {
    return null;
  }

  let normalizedValue = value;
  if (typeof normalizedValue === 'string') {
    try {
      normalizedValue = JSON.parse(normalizedValue);
    } catch {
      return null;
    }
  }

  return isRecord(normalizedValue) ? normalizedValue as LegacyResumeParsedData : null;
}

function buildResumeTextFromParsedData(
  parsedData: ParsedResumeData | null | undefined,
  candidateName: string
): string {
  if (!parsedData) {
    return '';
  }

  const parts: string[] = [];

  if (parsedData.basicInfo) {
    parts.push('【基本信息】');
    parts.push(`姓名：${parsedData.basicInfo.name || candidateName}`);
    if (parsedData.basicInfo.phone) parts.push(`电话：${parsedData.basicInfo.phone}`);
    if (parsedData.basicInfo.email) parts.push(`邮箱：${parsedData.basicInfo.email}`);
    if (parsedData.basicInfo.location) parts.push(`所在地：${parsedData.basicInfo.location}`);
    parts.push('');
  }

  if (parsedData.workExperience?.length) {
    parts.push('【工作经历】');
    parsedData.workExperience.forEach((exp) => {
      parts.push(`${exp.company || ''} - ${exp.position || ''}`.trim());
      if (exp.duration) parts.push(exp.duration);
      if (exp.description) parts.push(`工作内容：${exp.description}`);
      if (exp.responsibilities?.length) {
        parts.push(`工作职责：${exp.responsibilities.join('；')}`);
      }
      if (exp.achievements?.length) {
        parts.push(`工作结果：${exp.achievements.join('；')}`);
      }
      parts.push('');
    });
  }

  if (parsedData.education) {
    parts.push('【教育背景】');
    parts.push(`${parsedData.education.school || ''} - ${parsedData.education.major || ''}`.trim());
    if (parsedData.education.degree) {
      parts.push(parsedData.education.degree);
    }
    if (parsedData.education.gpa) {
      parts.push(`GPA/课程：${parsedData.education.gpa}`);
    }
    if (parsedData.education.scholarships?.length) {
      parts.push(`奖项/成果：${parsedData.education.scholarships.join('；')}`);
    }
    parts.push('');
  }

  if (parsedData.skills?.length) {
    parts.push('【技能】');
    parts.push(
      parsedData.skills
        .map((skill) =>
          typeof skill === 'string'
            ? skill
            : `${skill.name || ''}${skill.level ? `（${skill.level}）` : ''}`
        )
        .filter(Boolean)
        .join(', ')
    );
    parts.push('');
  }

  if (parsedData.projects?.length) {
    parts.push('【项目经历】');
    parsedData.projects.forEach((project) => {
      if (project.name) parts.push(project.name);
      if (project.duration) parts.push(`项目周期：${project.duration}`);
      if (project.role) parts.push(`项目角色：${project.role}`);
      if (project.description) parts.push(project.description);
      if (project.tasks?.length) parts.push(`项目任务：${project.tasks.join('；')}`);
      if (project.results?.length) parts.push(`项目结果：${project.results.join('；')}`);
      if (project.technologies?.length) parts.push(`技术栈：${project.technologies.join('、')}`);
      parts.push('');
    });
  }

  if (parsedData.awards?.length) {
    parts.push('【荣誉奖项】');
    parsedData.awards.forEach((award) => {
      parts.push(`${award.name || ''}${award.date ? ` - ${award.date}` : ''}`.trim());
      parts.push('');
    });
  }

  return parts.join('\n').trim();
}

function isMissingTableError(error: unknown): boolean {
  return Boolean(
    error &&
      typeof error === 'object' &&
      'cause' in error &&
      (error as { cause?: { code?: string } }).cause?.code === '42P01'
  ) || Boolean(
    error &&
      typeof error === 'object' &&
      'code' in error &&
      (error as { code?: string }).code === '42P01'
  );
}

function isUsableResumeText(value?: string | null): value is string {
  if (!value) {
    return false;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return false;
  }

  return !trimmed.includes('简历文件已上传，但暂未解析内容');
}

async function extractResumeTextOnDemand(params: {
  candidate: typeof schema.candidates.$inferSelect;
  db: Awaited<ReturnType<typeof getDb<typeof schema>>>;
  candidateResumeParsedData: CandidateResumeParsedData | null;
}): Promise<string> {
  const { candidate, db, candidateResumeParsedData } = params;

  if (!candidate.resumeFileKey || !candidate.resumeFileName) {
    return '';
  }

  try {
    const buffer = await readResumeFileByKey(candidate.resumeFileKey);
    const result = await extractResumeFromBuffer({
      buffer,
      fileName: candidate.resumeFileName,
      fileType: getResumeContentType(candidate.resumeFileName),
      fileSize: buffer.length,
      fileKey: candidate.resumeFileKey,
    });

    if (!result.success || !isUsableResumeText(result.content)) {
      return '';
    }

    const parsedAt = new Date().toISOString();
    await db
      .update(schema.candidates)
      .set({
        resumeParsedData: {
          ...(candidateResumeParsedData || {}),
          content: result.content,
          parsedAt,
          parseStatus: candidateResumeParsedData?.parsedData ? 'completed' : candidateResumeParsedData?.parseStatus || 'completed',
        },
        updatedAt: new Date(),
      })
      .where(eq(schema.candidates.id, candidate.id));

    return result.content;
  } catch (error) {
    console.error('[搜索候选人] 按需提取简历文本失败:', error);
    return '';
  }
}

/**
 * 根据候选人姓名搜索候选人及其简历信息
 */
export async function GET(req: NextRequest) {
  try {
    // JWT认证
    await authenticateApi(req);
    await ensureCandidatesTable();

    const searchParams = req.nextUrl.searchParams;
    const name = searchParams.get('name');

    if (!name || name.trim().length === 0) {
      return NextResponse.json(
        { success: false, error: '候选人姓名不能为空' },
        { status: 400 }
      );
    }

    const db = await getDb(schema);
    const normalizedName = name.trim();
    const normalizedLowerName = normalizedName.toLowerCase();

    // 搜索候选人（模糊匹配）
    const candidates = await db
      .select()
      .from(schema.candidates)
      .where(ilike(schema.candidates.name, `%${normalizedName}%`))
      .orderBy(desc(schema.candidates.createdAt))
      .limit(5); // 最多返回5条结果

    if (candidates.length === 0) {
      return NextResponse.json({
        success: true,
        found: false,
        message: '未找到匹配的候选人',
        candidates: []
      });
    }

    // 获取每个候选人的简历信息
    const candidatesWithResume = await Promise.all(
      candidates.map(async (candidate) => {
        const candidateResumeParsedData = normalizeCandidateResumeParsedData(candidate.resumeParsedData);
        let resume: (typeof schema.resumes.$inferSelect) | undefined;

        let resumeText = '';
        if (isUsableResumeText(candidateResumeParsedData?.content)) {
          resumeText = candidateResumeParsedData.content;
        } else if (candidateResumeParsedData?.parsedData) {
          resumeText = buildResumeTextFromParsedData(candidateResumeParsedData.parsedData, candidate.name);
        }

        if (!resumeText) {
          try {
            const resumes = await db
              .select()
              .from(schema.resumes)
              .where(eq(schema.resumes.candidateId, candidate.id))
              .orderBy(desc(schema.resumes.createdAt))
              .limit(1);

            resume = resumes[0];
          } catch (error) {
            if (isMissingTableError(error)) {
              console.warn('[搜索候选人] resumes 表不存在，已自动回退到 candidates.resumeParsedData');
            } else {
              throw error;
            }
          }
        }

        if (!resumeText && isUsableResumeText(resume?.resumeText)) {
          resumeText = resume.resumeText;
        }

        if (!resumeText && resume?.parsedData) {
          // 如果有解析后的数据，构建简历文本
          const parsedData = normalizeLegacyResumeParsedData(resume.parsedData);
          const parts: string[] = [];

          if (parsedData?.personal_info) {
            parts.push('【基本信息】');
            parts.push(`姓名：${parsedData.personal_info.name || candidate.name}`);
            if (parsedData.personal_info.phone) parts.push(`电话：${parsedData.personal_info.phone}`);
            if (parsedData.personal_info.email) parts.push(`邮箱：${parsedData.personal_info.email}`);
            if (parsedData.personal_info.location) parts.push(`所在地：${parsedData.personal_info.location}`);
            parts.push('');
          }

          if (parsedData?.work_experience) {
            parts.push('【工作经历】');
            parsedData.work_experience.forEach((exp) => {
              parts.push(`${exp.company} - ${exp.position}`);
              parts.push(`${exp.startDate} ~ ${exp.endDate}`);
              parts.push(`工作内容：${exp.responsibilities || ''}`);
              parts.push('');
            });
          }

          if (parsedData?.education) {
            parts.push('【教育背景】');
            parsedData.education.forEach((edu) => {
              parts.push(`${edu.school} - ${edu.major}`);
              parts.push(`${edu.degree} - ${edu.graduationYear}`);
              parts.push('');
            });
          }

          if (parsedData?.skills) {
            parts.push('【技能】');
            parts.push(parsedData.skills.join(', '));
            parts.push('');
          }

          if (parsedData?.projects) {
            parts.push('【项目经历】');
            parsedData.projects.forEach((proj) => {
              parts.push(`${proj.name}`);
              parts.push(`${proj.description || ''}`);
              parts.push('');
            });
          }

          if (parsedData?.awards) {
            parts.push('【荣誉奖项】');
            parsedData.awards.forEach((award) => {
              parts.push(`${award.name} - ${award.date}`);
              parts.push('');
            });
          }

          resumeText = parts.join('\n');
        }

        if (!resumeText) {
          resumeText = await extractResumeTextOnDemand({
            candidate,
            db,
            candidateResumeParsedData,
          });
        }

        if (!resumeText && resume?.fileUrl) {
          // 如果没有解析后的数据但有文件URL，返回提示
          resumeText = '简历文件已上传，但暂未解析内容。请联系管理员手动处理。';
        } else if (!resumeText && candidate.resumeUploaded) {
          resumeText = candidateResumeParsedData?.error
            ? `简历解析失败：${candidateResumeParsedData.error}`
            : '简历文件已上传，但暂未解析内容。请联系管理员手动处理。';
        }

        return {
          id: candidate.id,
          name: candidate.name,
          phone: candidate.phone,
          email: candidate.email,
          position: candidate.position,
          status: candidate.status,
          source: candidate.source,
          createdAt: candidate.createdAt,
          resumeFileName: resume?.fileName || candidate.resumeFileName || null,
          resumeFileUrl: resume?.fileUrl || candidate.resumeDownloadUrl || null,
          resumeText: resumeText || null
        };
      })
    );

    // 找到精确匹配的候选人
    const exactMatch = candidatesWithResume.find(
      (candidate) => candidate.name.trim().toLowerCase() === normalizedLowerName
    );

    return NextResponse.json({
      success: true,
      found: true,
      exactMatch: !!exactMatch,
      message: exactMatch
        ? '找到精确匹配的候选人'
        : `找到 ${candidatesWithResume.length} 个相似候选人`,
      candidates: candidatesWithResume
    });
  } catch (error) {
    console.error('搜索候选人失败:', error);

    // 认证错误
    if (isApiAuthError(error)) {
      return NextResponse.json(
        { error: error.message || '认证失败' },
        { status: error.statusCode || 401 }
      );
    }

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : '搜索候选人失败'
      },
      { status: 500 }
    );
  }
}
