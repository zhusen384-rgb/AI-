import { NextRequest, NextResponse } from 'next/server';
import { getDb } from 'coze-coding-dev-sdk';
import * as schema from '@/lib/db/schema';
import { authenticateApi } from '@/lib/api-auth';
import { eq, like, or, desc, sql } from 'drizzle-orm';
import { ensureCandidatesTable } from '@/lib/db/ensure-candidates-table';

interface CandidateResumeParsedData {
  content?: string;
  parsedData?: {
    skills?: Array<string | { name?: string }>;
    workExperience?: Array<{ company?: string; position?: string }>;
    projects?: Array<{ name?: string }>;
  } | null;
}

/**
 * 简历关键词搜索 API
 * 
 * 功能：搜索简历内容中的关键词
 * 
 * GET /api/candidates/resume-search?keyword=Java
 * 
 * 参数：
 * - keyword: 搜索关键词（必填）
 * - limit: 返回结果数量限制（默认20）
 * 
 * 返回：
 * - 匹配的候选人列表，包含简历文本中的匹配片段
 */
export async function GET(req: NextRequest) {
  try {
    // JWT认证
    const payload = await authenticateApi(req);
    await ensureCandidatesTable();

    const searchParams = req.nextUrl.searchParams;
    const keyword = searchParams.get('keyword')?.trim();
    const limit = parseInt(searchParams.get('limit') || '20');

    if (!keyword) {
      return NextResponse.json(
        { success: false, error: '搜索关键词不能为空' },
        { status: 400 }
      );
    }

    console.log(`[简历搜索] 关键词: "${keyword}", 用户: ${payload.username}`);

    const db = await getDb(schema);

    // 搜索策略：
    // 1. 在 resumes 表中搜索 resumeText 字段
    // 2. 同时搜索 parsedData 中的关键字段
    // 3. 关联 candidates 表获取候选人信息

    // 使用 SQL 的 LIKE 或 ILIKE（不区分大小写）进行搜索
    // 同时搜索 resumeText 和 keywords 字段
    const searchPattern = `%${keyword}%`;

    // 查询简历表，搜索简历文本内容
    const resumeResults = await db
      .select({
        resumeId: schema.resumes.id,
        candidateId: schema.resumes.candidateId,
        fileName: schema.resumes.fileName,
        resumeText: schema.resumes.resumeText,
        keywords: schema.resumes.keywords,
        parsedData: schema.resumes.parsedData,
      })
      .from(schema.resumes)
      .where(
        or(
          // 搜索简历原文
          like(schema.resumes.resumeText, searchPattern),
          // 搜索关键词字段
          like(schema.resumes.keywords, searchPattern)
        )
      )
      .orderBy(desc(schema.resumes.createdAt))
      .limit(limit);

    console.log(`[简历搜索] 在简历表中找到 ${resumeResults.length} 条匹配`);

    // 如果没有在简历表中找到结果，尝试在候选人表中的新简历字段中搜索
    if (resumeResults.length === 0) {
      const candidateResults = await db
        .select()
        .from(schema.candidates)
        .where(
          or(
            like(schema.candidates.name, searchPattern),
            like(schema.candidates.phone, searchPattern),
            like(schema.candidates.email, searchPattern),
            like(schema.candidates.resumeFileName, searchPattern)
          )
        )
        .orderBy(desc(schema.candidates.createdAt))
        .limit(limit);

      if (candidateResults.length === 0) {
        return NextResponse.json({
          success: true,
          found: false,
          message: `未找到包含 "${keyword}" 的简历`,
          candidates: [],
          total: 0,
          keyword,
        });
      }

      const results = candidateResults.map((candidate) => {
        const resumeParsedData = candidate.resumeParsedData as CandidateResumeParsedData | null;
        const matchedContent: Array<{
          field: string;
          text: string;
          highlight: string;
        }> = [];

        if (resumeParsedData?.content?.toLowerCase().includes(keyword.toLowerCase())) {
          const text = resumeParsedData.content;
          const index = text.toLowerCase().indexOf(keyword.toLowerCase());
          matchedContent.push({
            field: 'resumeContent',
            text: text.substring(Math.max(0, index - 30), Math.min(text.length, index + keyword.length + 30)),
            highlight: keyword,
          });
        }

        if (resumeParsedData?.parsedData?.skills?.length) {
          const skills = resumeParsedData.parsedData.skills
            .map((skill) => typeof skill === 'string' ? skill : skill.name || '')
            .filter(Boolean)
            .filter((skill) => skill.toLowerCase().includes(keyword.toLowerCase()));
          if (skills.length > 0) {
            matchedContent.push({
              field: 'skills',
              text: skills.join(', '),
              highlight: keyword,
            });
          }
        }

        if (resumeParsedData?.parsedData?.workExperience?.length) {
          for (const experience of resumeParsedData.parsedData.workExperience) {
            const company = experience.company || '';
            const position = experience.position || '';
            if (company.toLowerCase().includes(keyword.toLowerCase()) || position.toLowerCase().includes(keyword.toLowerCase())) {
              matchedContent.push({
                field: 'workExperience',
                text: `${company} - ${position}`.trim(),
                highlight: keyword,
              });
            }
          }
        }

        if (resumeParsedData?.parsedData?.projects?.length) {
          for (const project of resumeParsedData.parsedData.projects) {
            if ((project.name || '').toLowerCase().includes(keyword.toLowerCase())) {
              matchedContent.push({
                field: 'projects',
                text: project.name || '',
                highlight: keyword,
              });
            }
          }
        }

        return {
          id: candidate.id,
          name: candidate.name,
          phone: candidate.phone,
          email: candidate.email,
          status: candidate.status,
          source: candidate.source,
          createdAt: candidate.createdAt,
          createdById: candidate.createdById,
          createdByName: candidate.createdByName,
          createdByUsername: candidate.createdByUsername,
          matchType: 'candidate' as const,
          matchScore: matchedContent.length > 0 ? Math.min(1, matchedContent.length * 0.2 + 0.2) : 0.5,
          matchedContent,
          resumeText: resumeParsedData?.content || null,
          resumeFileName: candidate.resumeFileName || null,
        };
      });

      return NextResponse.json({
        success: true,
        found: true,
        message: `找到 ${results.length} 个相关候选人`,
        candidates: results,
        total: results.length,
        keyword,
      });
    }

    // 获取匹配的候选人信息
    const candidateIds = resumeResults.map(r => r.candidateId);
    const candidates = await db
      .select()
      .from(schema.candidates)
      .where(sql`${schema.candidates.id} IN (${candidateIds.join(',')})`);

    // 组装结果
    const results = resumeResults.map((resume) => {
      const candidate = candidates.find(c => c.id === resume.candidateId);
      
      // 提取匹配的内容片段
      const matchedContent: Array<{
        field: string;
        text: string;
        highlight: string;
      }> = [];

      // 从简历文本中提取匹配片段
      if (resume.resumeText) {
        const text = resume.resumeText as string;
        const lowerText = text.toLowerCase();
        const lowerKeyword = keyword.toLowerCase();
        
        // 找到所有匹配位置
        let pos = 0;
        const matches: number[] = [];
        while ((pos = lowerText.indexOf(lowerKeyword, pos)) !== -1) {
          matches.push(pos);
          pos += 1;
        }

        // 提取前5个匹配片段
        for (let i = 0; i < Math.min(matches.length, 5); i++) {
          const matchPos = matches[i];
          const contextStart = Math.max(0, matchPos - 30);
          const contextEnd = Math.min(text.length, matchPos + keyword.length + 30);
          const snippet = text.substring(contextStart, contextEnd);
          
          matchedContent.push({
            field: 'resumeText',
            text: snippet,
            highlight: keyword,
          });
        }
      }

      // 从 parsedData 中提取匹配字段
      if (resume.parsedData) {
        const parsed = resume.parsedData as any;
        
        // 检查技能
        if (parsed.skills && Array.isArray(parsed.skills)) {
          const matchedSkills = parsed.skills.filter((s: any) => 
            (typeof s === 'string' && s.toLowerCase().includes(keyword.toLowerCase())) ||
            (s.name && s.name.toLowerCase().includes(keyword.toLowerCase()))
          );
          if (matchedSkills.length > 0) {
            matchedContent.push({
              field: 'skills',
              text: matchedSkills.map((s: any) => typeof s === 'string' ? s : s.name).join(', '),
              highlight: keyword,
            });
          }
        }

        // 检查工作经历
        if (parsed.workExperience && Array.isArray(parsed.workExperience)) {
          for (const exp of parsed.workExperience) {
            if (exp.company && exp.company.toLowerCase().includes(keyword.toLowerCase())) {
              matchedContent.push({
                field: 'workExperience',
                text: `${exp.company} - ${exp.position}`,
                highlight: keyword,
              });
            }
            if (exp.position && exp.position.toLowerCase().includes(keyword.toLowerCase())) {
              matchedContent.push({
                field: 'workExperience',
                text: `${exp.company} - ${exp.position}`,
                highlight: keyword,
              });
            }
          }
        }

        // 检查项目经历
        if (parsed.projects && Array.isArray(parsed.projects)) {
          for (const proj of parsed.projects) {
            if (proj.name && proj.name.toLowerCase().includes(keyword.toLowerCase())) {
              matchedContent.push({
                field: 'projects',
                text: proj.name,
                highlight: keyword,
              });
            }
          }
        }
      }

      // 计算匹配度分数
      const matchScore = Math.min(1, matchedContent.length * 0.2 + 0.2);

      return {
        id: candidate?.id || resume.candidateId,
        name: candidate?.name || '未知候选人',
        phone: candidate?.phone || null,
        email: candidate?.email || null,
        status: candidate?.status || 'pending',
        source: candidate?.source || null,
        createdAt: candidate?.createdAt || null,
        createdById: candidate?.createdById || null,
        createdByName: candidate?.createdByName || null,
        createdByUsername: candidate?.createdByUsername || null,
        matchType: 'resume' as const,
        matchScore,
        matchedContent,
        resumeText: resume.resumeText,
        resumeFileName: resume.fileName,
      };
    });

    // 按匹配度排序
    results.sort((a, b) => b.matchScore - a.matchScore);

    return NextResponse.json({
      success: true,
      found: true,
      message: `找到 ${results.length} 个包含 "${keyword}" 的简历`,
      candidates: results,
      total: results.length,
      keyword,
    });
  } catch (error) {
    console.error('简历搜索失败:', error);

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
        error: error instanceof Error ? error.message : '简历搜索失败'
      },
      { status: 500 }
    );
  }
}
