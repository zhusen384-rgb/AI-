import { NextRequest, NextResponse } from 'next/server';
import { interactiveLoginManager } from '@/lib/auto-greeting/interactive-login';
import type { Platform } from '@/lib/auto-greeting/types';
import { requireAutoGreetingAuth } from '@/lib/auto-greeting/auth';
import { ensureAutoGreetingRuntimeTables } from '@/lib/db/ensure-auto-greeting-runtime-tables';

const SUPPORTED_PLATFORMS: Platform[] = ['boss'];

export async function POST(request: NextRequest) {
  try {
    const authResult = await requireAutoGreetingAuth(request);
    if (!authResult.success) {
      return authResult.response;
    }

    await ensureAutoGreetingRuntimeTables();
    const body = await request.json();
    const { platform = 'boss' } = body;

    if (!SUPPORTED_PLATFORMS.includes(platform)) {
      return NextResponse.json(
        { success: false, error: '当前仅支持 Boss 交互式登录' },
        { status: 400 }
      );
    }

    const session = await interactiveLoginManager.startSession(platform, {
      userId: authResult.auth.userId,
      tenantId: authResult.auth.tenantId,
    });

    return NextResponse.json({
      success: true,
      data: session,
      message: '交互式登录窗口已打开，请在弹出的浏览器中完成人工登录',
    });
  } catch (error) {
    console.error('启动交互式登录失败:', error);
    return NextResponse.json(
      { success: false, error: '启动交互式登录失败' },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const authResult = await requireAutoGreetingAuth(request);
    if (!authResult.success) {
      return authResult.response;
    }

    await ensureAutoGreetingRuntimeTables();
    const sessionId = request.nextUrl.searchParams.get('sessionId');
    if (!sessionId) {
      return NextResponse.json(
        { success: false, error: '缺少 sessionId' },
        { status: 400 }
      );
    }

    const session = await interactiveLoginManager.getSession(sessionId);
    if (!session) {
      return NextResponse.json(
        { success: false, error: '登录会话不存在' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: session,
    });
  } catch (error) {
    console.error('获取交互式登录状态失败:', error);
    return NextResponse.json(
      { success: false, error: '获取交互式登录状态失败' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const authResult = await requireAutoGreetingAuth(request);
    if (!authResult.success) {
      return authResult.response;
    }

    await ensureAutoGreetingRuntimeTables();
    const sessionId = request.nextUrl.searchParams.get('sessionId');
    if (!sessionId) {
      return NextResponse.json(
        { success: false, error: '缺少 sessionId' },
        { status: 400 }
      );
    }

    const cancelled = await interactiveLoginManager.cancelSession(sessionId);
    if (!cancelled) {
      return NextResponse.json(
        { success: false, error: '登录会话不存在' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      message: '交互式登录会话已取消',
    });
  } catch (error) {
    console.error('取消交互式登录失败:', error);
    return NextResponse.json(
      { success: false, error: '取消交互式登录失败' },
      { status: 500 }
    );
  }
}
