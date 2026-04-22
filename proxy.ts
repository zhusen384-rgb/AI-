import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { verifyToken } from '@/lib/auth/jwt';
import { matchesAnyRoute } from '@/lib/route-matcher';

// 公开路由列表（不需要认证）
const PUBLIC_ROUTES = [
  '/login',
  '/register',
  '/api/auth/login',
  '/api/auth/logout',
  '/api/auth/register',
  '/api/auth/refresh-token',
  '/api/init',
  '/api/reset-admin', // 用于生产环境重置 admin 密码
  '/api/speech-recognition',
  '/api/full-ai-interview/check-session',
  '/api/full-ai-interview/resume-session',
  '/api/full-ai-interview/status',
  '/api/full-ai-interview/start',
  '/api/full-ai-interview/answer',
  '/api/full-ai-interview/detect-answer-end',
  '/api/full-ai-interview/tts',
  '/api/full-ai-interview/candidate-questions',
  '/api/full-ai-interview/save-config',
  '/api/full-ai-interview/evaluate',
  '/api/full-ai-interview/save-result',
  '/api/full-ai-interview/recording-url',
  '/api/full-ai-interview/download-recording',
  '/api/full-ai-interview/upload-chunk',
  '/api/full-ai-interview/merge-chunks',
  '/api/interview/session',
  '/i',
  '/initialize', // 数据库初始化页面
  '/full-ai-interview/share', // 候选人旧版分享链接兼容入口
];

// 检查是否为公开路由
function isPublicRoute(pathname: string): boolean {
  return matchesAnyRoute(pathname, PUBLIC_ROUTES);
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isApiRoute = pathname.startsWith('/api/');

  // 如果是公开路由，放行
  if (isPublicRoute(pathname)) {
    return NextResponse.next();
  }

  // 检查是否有认证 Cookie
  const authToken = request.cookies.get('auth-token');

  // 如果没有 token，重定向到登录页
  if (!authToken) {
    if (isApiRoute) {
      return NextResponse.json({ error: '未提供认证token' }, { status: 401 });
    }
    const loginUrl = new URL('/login', request.url);
    return NextResponse.redirect(loginUrl);
  }

  // 验证 JWT token（使用正确的 JWT 验证）
  const decoded = verifyToken(authToken.value);
  
  // 如果 token 无效，重定向到登录页
  if (!decoded) {
    if (isApiRoute) {
      return NextResponse.json({ error: '认证token无效或已过期' }, { status: 401 });
    }
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('redirect', pathname);
    return NextResponse.redirect(loginUrl);
  }

  // 将用户信息添加到请求头，供后续使用
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-user-id', decoded.userId);
  requestHeaders.set('x-tenant-id', decoded.tenantId);
  requestHeaders.set('x-user-role', decoded.role);
  if (decoded.username) {
    requestHeaders.set('x-username', decoded.username);
  }
  if (decoded.name) {
    requestHeaders.set('x-user-name', decoded.name);
  }

  return NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });
}

// 配置中间件匹配的路径
export const config = {
  matcher: [
    /*
     * 匹配所有路径除了:
     * - _next/static (静态文件)
     * - _next/image (图片优化文件)
     * - favicon.ico (favicon 文件)
     * - public folder
     */
    '/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|manifest.webmanifest|.*\\.[^/]+$).*)',
  ],
};
