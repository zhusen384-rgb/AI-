/**
 * 平台账号管理 API
 * 
 * GET  - 获取账号列表
 * POST - 添加账号（通过 Cookie）
 * PUT  - 更新账号状态
 * DELETE - 删除账号
 */

import { NextRequest, NextResponse } from 'next/server';
import { getClient } from 'coze-coding-dev-sdk';
import { loginManager } from '@/lib/auto-greeting/login-manager';
import type { Platform } from '@/lib/auto-greeting/types';
import { ensureAutoGreetingRuntimeTables } from '@/lib/db/ensure-auto-greeting-runtime-tables';
import { requireAutoGreetingAuth, isAutoGreetingSuperAdmin } from '@/lib/auto-greeting/auth';

/**
 * 获取平台账号列表
 */
export async function GET(req: NextRequest) {
  try {
    const authResult = await requireAutoGreetingAuth(req);
    if (!authResult.success) {
      return authResult.response;
    }

    await ensureAutoGreetingRuntimeTables();
    const searchParams = req.nextUrl.searchParams;
    const platform = searchParams.get('platform');
    const status = searchParams.get('status');
    const { auth } = authResult;

    const client = await getClient();

    let query = 'SELECT * FROM ag_platform_accounts WHERE 1=1';
    const params: Array<string> = [];
    let paramIndex = 1;

    if (!isAutoGreetingSuperAdmin(auth.role)) {
      query += ` AND created_by_id = $${paramIndex++}`;
      params.push(auth.userId);
    }

    if (platform) {
      query += ` AND platform = $${paramIndex++}`;
      params.push(platform);
    }

    if (status) {
      query += ` AND status = $${paramIndex++}`;
      params.push(status);
    }

    query += ' ORDER BY created_at DESC';

    const result = await client.query(query, params);
    client.release();

    // 隐藏敏感信息
    const accounts = result.rows.map(row => ({
      id: row.id,
      platform: row.platform,
      accountId: row.account_id,
      nickname: row.nickname,
      loginStatus: row.login_status,
      status: row.status,
      lastLoginTime: row.last_login_time,
      lastActiveTime: row.last_active_time,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      // 不返回完整的 cookies
      hasCookies: row.cookies && row.cookies.length > 0,
    }));

    return NextResponse.json({
      success: true,
      data: accounts,
    });

  } catch (error) {
    console.error('获取平台账号列表失败:', error);
    return NextResponse.json(
      { success: false, error: '获取账号列表失败' },
      { status: 500 }
    );
  }
}

/**
 * 添加平台账号
 */
export async function POST(req: NextRequest) {
  try {
    const authResult = await requireAutoGreetingAuth(req);
    if (!authResult.success) {
      return authResult.response;
    }

    await ensureAutoGreetingRuntimeTables();
    const body = await req.json();
    const { platform, cookies, userAgent, nickname, accountId } = body;
    const { auth } = authResult;

    if (!platform || !cookies || !Array.isArray(cookies)) {
      return NextResponse.json(
        { success: false, error: '缺少必要参数' },
        { status: 400 }
      );
    }

    // 验证平台
    const validPlatforms = ['boss', 'zhilian', 'liepin', '51job'];
    if (!validPlatforms.includes(platform)) {
      return NextResponse.json(
        { success: false, error: '不支持的平台' },
        { status: 400 }
      );
    }

    // 尝试检测登录状态（如果浏览器可用）
    let loginStatus: 'valid' | 'expired' | 'unknown' = 'unknown';
    let accountInfo: { nickname?: string; userId?: string } | undefined;

    try {
      const loginCheck = await loginManager.checkLoginStatus(platform as Platform, cookies);
      loginStatus = loginCheck.isLoggedIn ? 'valid' : 'expired';
      accountInfo = loginCheck.accountInfo;
    } catch (error) {
      console.log('浏览器检测失败，跳过登录验证:', error);
      // 浏览器不可用时，标记为未知状态
      loginStatus = 'unknown';
    }

    // 保存账号
    const id = await loginManager.saveAccount({
      platform: platform as Platform,
      accountId: accountId || '',
      nickname: nickname || accountInfo?.nickname || '',
      cookies,
      userAgent: userAgent || 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      loginStatus,
      status: 'active',
      createdById: auth.userId,
      tenantId: auth.tenantId,
    });

    return NextResponse.json({
      success: true,
      data: {
        id,
        loginStatus,
        accountInfo,
      },
      message: loginStatus === 'valid' ? '账号添加成功' : loginStatus === 'unknown' ? '账号已添加，登录状态待验证' : '账号已添加，但登录状态无效，请检查 Cookie',
    });

  } catch (error) {
    console.error('添加平台账号失败:', error);
    return NextResponse.json(
      { success: false, error: '添加账号失败' },
      { status: 500 }
    );
  }
}

/**
 * 更新平台账号
 */
export async function PUT(req: NextRequest) {
  try {
    const authResult = await requireAutoGreetingAuth(req);
    if (!authResult.success) {
      return authResult.response;
    }

    await ensureAutoGreetingRuntimeTables();
    const body = await req.json();
    const { id, status, cookies } = body;
    const { auth } = authResult;

    if (!id) {
      return NextResponse.json(
        { success: false, error: '缺少账号 ID' },
        { status: 400 }
      );
    }

    const client = await getClient();

    if (status) {
      await client.query(`
        UPDATE ag_platform_accounts 
        SET status = $1, updated_at = NOW()
        WHERE id = $2
          AND ($3 = true OR created_by_id = $4)
      `, [status, id, isAutoGreetingSuperAdmin(auth.role), auth.userId]);
    }

    if (cookies && Array.isArray(cookies)) {
      await client.query(`
        UPDATE ag_platform_accounts 
        SET cookies = $1, updated_at = NOW()
        WHERE id = $2
          AND ($3 = true OR created_by_id = $4)
      `, [JSON.stringify(cookies), id, isAutoGreetingSuperAdmin(auth.role), auth.userId]);
    }

    client.release();

    return NextResponse.json({
      success: true,
      message: '更新成功',
    });

  } catch (error) {
    console.error('更新平台账号失败:', error);
    return NextResponse.json(
      { success: false, error: '更新账号失败' },
      { status: 500 }
    );
  }
}

/**
 * 删除平台账号
 */
export async function DELETE(req: NextRequest) {
  try {
    const authResult = await requireAutoGreetingAuth(req);
    if (!authResult.success) {
      return authResult.response;
    }

    await ensureAutoGreetingRuntimeTables();
    const searchParams = req.nextUrl.searchParams;
    const id = searchParams.get('id');
    const { auth } = authResult;

    if (!id) {
      return NextResponse.json(
        { success: false, error: '缺少账号 ID' },
        { status: 400 }
      );
    }

    const client = await getClient();
    await client.query(`
      DELETE FROM ag_platform_accounts
      WHERE id = $1
        AND ($2 = true OR created_by_id = $3)
    `, [id, isAutoGreetingSuperAdmin(auth.role), auth.userId]);
    client.release();

    return NextResponse.json({
      success: true,
      message: '删除成功',
    });

  } catch (error) {
    console.error('删除平台账号失败:', error);
    return NextResponse.json(
      { success: false, error: '删除账号失败' },
      { status: 500 }
    );
  }
}
