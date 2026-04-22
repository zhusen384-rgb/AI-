import { NextRequest, NextResponse } from 'next/server';
import { invitationCodes, tenants } from '@/storage/database/shared/schema';
import { getDb } from 'coze-coding-dev-sdk';
import { eq, and, gt, desc } from 'drizzle-orm';
import { authenticateApi, isAdmin } from '@/lib/api-auth';

/**
 * POST /api/invitation-codes
 * 创建邀请码（仅管理员）
 */
export async function POST(req: NextRequest) {
  try {
    const payload = await authenticateApi(req);

    if (!isAdmin(payload)) {
      return NextResponse.json(
        { error: '权限不足，仅管理员可以创建邀请码' },
        { status: 403 }
      );
    }

    const body = await req.json();
    const { maxUses, expiresAt } = body;

    // 使用当前用户的租户 ID
    const tenantId = payload.tenantId;

    const db = await getDb();

    // 验证租户存在
    const tenant = await db
      .select()
      .from(tenants)
      .where(eq(tenants.id, tenantId))
      .limit(1);

    if (!tenant || tenant.length === 0) {
      return NextResponse.json(
        { error: '租户不存在' },
        { status: 404 }
      );
    }

    // 生成邀请码（6位随机字符串）
    const code = Math.random().toString(36).substring(2, 8).toUpperCase();

    // 计算过期时间
    let expiresAtDate = null;
    if (expiresAt) {
      expiresAtDate = new Date(expiresAt);
      if (isNaN(expiresAtDate.getTime())) {
        return NextResponse.json(
          { error: '过期时间格式无效' },
          { status: 400 }
        );
      }
    }

    // 创建邀请码
    const result = await db
      .insert(invitationCodes)
      .values({
        code,
        tenantId,
        maxUses: maxUses || 1,
        usedCount: 0,
        expiresAt: expiresAtDate,
        createdBy: payload.userId,
        status: 'active',
        createdAt: new Date(),
      })
      .returning();

    return NextResponse.json({
      success: true,
      data: result[0],
    });
  } catch (error) {
    console.error('创建邀请码失败:', error);

    if (error && typeof error === 'object' && 'statusCode' in error) {
      return NextResponse.json(
        { error: (error as any).message || '认证失败' },
        { status: (error as any).statusCode || 401 }
      );
    }

    return NextResponse.json(
      { error: '创建邀请码失败' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/invitation-codes
 * 获取邀请码列表（仅管理员）
 */
export async function GET(req: NextRequest) {
  try {
    const payload = await authenticateApi(req);

    if (!isAdmin(payload)) {
      return NextResponse.json(
        { error: '权限不足，仅管理员可以查看邀请码' },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(req.url);
    const tenantId = searchParams.get('tenantId');
    const status = searchParams.get('status');

    const db = await getDb();

    let query = db
      .select()
      .from(invitationCodes)
      .orderBy(desc(invitationCodes.createdAt));

    // 应用过滤条件
    const conditions = [];
    if (tenantId) conditions.push(eq(invitationCodes.tenantId, tenantId));
    if (status) conditions.push(eq(invitationCodes.status, status));

    if (conditions.length > 0) {
      query = query.where(and(...conditions)) as typeof query;
    }

    const codes = await query;

    return NextResponse.json({
      success: true,
      data: codes,
    });
  } catch (error) {
    console.error('获取邀请码列表失败:', error);

    if (error && typeof error === 'object' && 'statusCode' in error) {
      return NextResponse.json(
        { error: (error as any).message || '认证失败' },
        { status: (error as any).statusCode || 401 }
      );
    }

    return NextResponse.json(
      { error: '获取邀请码列表失败' },
      { status: 500 }
    );
  }
}
