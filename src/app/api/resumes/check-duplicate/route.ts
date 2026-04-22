import { NextRequest, NextResponse } from 'next/server';
import { authenticateApi } from '@/lib/api-auth';
import { getDb } from 'coze-coding-dev-sdk';
import * as schema from '@/lib/db/schema';
import { and, eq, or, isNotNull } from 'drizzle-orm';

interface DuplicateCheckRequest {
  name?: string;
  phone?: string;
  email?: string;
  // 检测模式：strict（姓名+手机号联合匹配）或 loose（任一字段匹配）
  mode?: 'strict' | 'loose';
}

interface DuplicateCheckResult {
  isDuplicate: boolean;
  existingCandidateId?: number;
  existingCandidateName?: string;
  existingCandidatePhone?: string;
  matchFields?: string[];
  message?: string;
}

export async function POST(request: NextRequest) {
  try {
    // JWT认证
    const payload = await authenticateApi(request);

    const body: DuplicateCheckRequest = await request.json();
    const { name, phone, email, mode = 'strict' } = body;

    // 严格模式：姓名和手机号都必须提供
    if (mode === 'strict') {
      if (!name || !name.trim() || !phone || !phone.trim()) {
        return NextResponse.json({
          isDuplicate: false,
          message: '姓名和手机号都必须提供才能进行重复检测',
        });
      }

      // 获取数据库连接
      const db = await getDb(schema);

      // 双字段联合精准匹配：姓名 AND 手机号
      const existingCandidates = await db
        .select()
        .from(schema.candidates)
        .where(
          and(
            eq(schema.candidates.name, name.trim()),
            eq(schema.candidates.phone, phone.trim())
          )
        );

      if (existingCandidates.length === 0) {
        return NextResponse.json({
          isDuplicate: false,
        });
      }

      // 找到重复候选人
      const existingCandidate = existingCandidates[0];

      const result: DuplicateCheckResult = {
        isDuplicate: true,
        existingCandidateId: existingCandidate.id,
        existingCandidateName: existingCandidate.name,
        existingCandidatePhone: existingCandidate.phone || undefined,
        matchFields: ['姓名', '手机号'],
        message: `该候选人姓名+手机号已存在系统中（${existingCandidate.name}，${existingCandidate.phone || '未填写'}），不可重复上传简历，请核对信息后上传新的简历`,
      };

      return NextResponse.json(result);
    }

    // 宽松模式：任一字段匹配（保持向后兼容）
    if (!name && !phone && !email) {
      return NextResponse.json({
        isDuplicate: false,
      });
    }

    // 获取数据库连接
    const db = await getDb(schema);

    // 构建查询条件：姓名、手机号或邮箱任一匹配
    const conditions = [];

    if (name && name.trim()) {
      conditions.push(eq(schema.candidates.name, name.trim()));
    }
    if (phone && phone.trim()) {
      conditions.push(eq(schema.candidates.phone, phone.trim()));
    }
    if (email && email.trim()) {
      conditions.push(eq(schema.candidates.email, email.trim()));
    }

    if (conditions.length === 0) {
      return NextResponse.json({
        isDuplicate: false,
      });
    }

    // 查询匹配的候选人
    const existingCandidates = await db
      .select()
      .from(schema.candidates)
      .where(or(...conditions));

    if (existingCandidates.length === 0) {
      return NextResponse.json({
        isDuplicate: false,
      });
    }

    // 找到最佳匹配的候选人
    let bestMatch = existingCandidates[0];
    let bestScore = 0;
    const matchFields: string[] = [];

    for (const candidate of existingCandidates) {
      let score = 0;
      const currentMatchFields: string[] = [];

      // 姓名匹配
      if (name && name.trim() && candidate.name === name.trim()) {
        score += 3;
        currentMatchFields.push('姓名');
      }

      // 手机号匹配
      if (phone && phone.trim() && candidate.phone === phone.trim()) {
        score += 4;
        currentMatchFields.push('手机号');
      }

      // 邮箱匹配
      if (email && email.trim() && candidate.email === email.trim()) {
        score += 4;
        currentMatchFields.push('邮箱');
      }

      if (score > bestScore) {
        bestScore = score;
        bestMatch = candidate;
        matchFields.length = 0;
        matchFields.push(...currentMatchFields);
      }
    }

    const result: DuplicateCheckResult = {
      isDuplicate: true,
      existingCandidateId: bestMatch.id,
      existingCandidateName: bestMatch.name,
      existingCandidatePhone: bestMatch.phone || undefined,
      matchFields,
    };

    return NextResponse.json(result);
  } catch (error) {
    console.error('重复检测失败:', error);

    // 认证错误
    if (error && typeof error === 'object' && 'statusCode' in error) {
      return NextResponse.json(
        { error: (error as any).message || '认证失败' },
        { status: (error as any).statusCode || 401 }
      );
    }

    return NextResponse.json(
      { error: '重复检测失败', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
