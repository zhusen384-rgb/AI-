/**
 * 检测登录状态 API
 * 
 * POST - 检测账号登录状态
 */

import { NextRequest, NextResponse } from 'next/server';
import { loginManager } from '@/lib/auto-greeting/login-manager';
import type { Platform } from '@/lib/auto-greeting/types';
import { Cookie } from 'puppeteer';
import { requireAutoGreetingAuth } from '@/lib/auto-greeting/auth';
import { ensureAutoGreetingRuntimeTables } from '@/lib/db/ensure-auto-greeting-runtime-tables';

/**
 * 检测账号登录状态
 */
export async function POST(req: NextRequest) {
  try {
    const authResult = await requireAutoGreetingAuth(req);
    if (!authResult.success) {
      return authResult.response;
    }

    await ensureAutoGreetingRuntimeTables();
    const body = await req.json();
    const { platform, cookies, accountId } = body;

    // 如果提供了 accountId，从数据库获取 cookies
    let cookiesToCheck: Cookie[] = cookies;
    
    if (accountId && !cookies) {
      const account = await loginManager.getAccount(accountId);
      if (!account) {
        return NextResponse.json(
          { success: false, error: '账号不存在' },
          { status: 404 }
        );
      }
      cookiesToCheck = account.cookies;
      // 使用数据库中的账号平台
      const result = await loginManager.checkLoginStatus(account.platform, cookiesToCheck);
      
      // 更新登录状态
      await loginManager.refreshLoginStatus(accountId);
      
      return NextResponse.json({
        success: true,
        data: {
          isLoggedIn: result.isLoggedIn,
          accountInfo: result.accountInfo,
          error: result.error,
        },
      });
    }

    if (!platform || !cookiesToCheck) {
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

    // 检测登录状态
    const result = await loginManager.checkLoginStatus(platform as Platform, cookiesToCheck);

    return NextResponse.json({
      success: true,
      data: {
        isLoggedIn: result.isLoggedIn,
        accountInfo: result.accountInfo,
        error: result.error,
      },
    });

  } catch (error) {
    console.error('检测登录状态失败:', error);
    return NextResponse.json(
      { success: false, error: '检测登录状态失败' },
      { status: 500 }
    );
  }
}
