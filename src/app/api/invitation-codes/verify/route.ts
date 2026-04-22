import { NextRequest, NextResponse } from 'next/server';
import { invitationCodes } from '@/storage/database/shared/schema';
import { getDb } from 'coze-coding-dev-sdk';
import { eq, and } from 'drizzle-orm';
import { sql } from 'drizzle-orm';
import { authenticateApi, isAdmin } from '@/lib/api-auth';

/**
 * POST /api/invitation-codes/verify
 * 验证邀请码
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { code } = body;

    if (!code) {
      return NextResponse.json(
        { error: '邀请码不能为空' },
        { status: 400 }
      );
    }

    const db = await getDb();

    // 查找邀请码
    const result = await db
      .select()
      .from(invitationCodes)
      .where(
        and(
          eq(invitationCodes.code, code),
          eq(invitationCodes.status, 'active')
        )
      )
      .limit(1);

    if (!result || result.length === 0) {
      return NextResponse.json(
        { error: '邀请码无效' },
        { status: 400 }
      );
    }

    const invitationCode = result[0];

    // 检查是否已用完
    if (invitationCode.usedCount >= invitationCode.maxUses) {
      return NextResponse.json(
        { error: '邀请码已使用完' },
        { status: 400 }
      );
    }

    // 检查是否过期
    if (invitationCode.expiresAt && new Date(invitationCode.expiresAt) < new Date()) {
      return NextResponse.json(
        { error: '邀请码已过期' },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        tenantId: invitationCode.tenantId,
        code: invitationCode.code,
        remainingUses: invitationCode.maxUses - invitationCode.usedCount,
      },
    });
  } catch (error) {
    console.error('验证邀请码失败:', error);

    return NextResponse.json(
      { error: '验证邀请码失败' },
      { status: 500 }
    );
  }
}
