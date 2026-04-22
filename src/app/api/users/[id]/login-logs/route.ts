import { NextRequest, NextResponse } from 'next/server';
import { userManager } from '@/storage/database';
import { authenticateApi, isAdmin } from '@/lib/api-auth';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // JWT认证
    const payload = await authenticateApi(req);

    // 验证当前用户权限
    if (!isAdmin(payload) && payload.userId !== id) {
      return NextResponse.json(
        { error: '权限不足' },
        { status: 403 }
      );
    }

    // 获取查询参数
    const { searchParams } = new URL(req.url);
    const limit = parseInt(searchParams.get('limit') || '20');

    // 获取用户登录日志
    const logs = await userManager.getUserLoginLogs(id, limit);

    return NextResponse.json({
      success: true,
      data: logs,
    });
  } catch (error) {
    console.error('获取登录日志失败:', error);

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
        error: error instanceof Error ? error.message : '获取登录日志失败',
      },
      { status: 500 }
    );
  }
}
