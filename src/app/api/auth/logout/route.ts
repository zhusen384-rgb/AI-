import { NextResponse } from 'next/server';

function clearAuthCookies(response: NextResponse) {
  response.cookies.set('auth-token', '', {
    httpOnly: true,
    secure: false,
    sameSite: 'lax',
    maxAge: 0,
    path: '/',
  });

  response.cookies.set('refresh-token', '', {
    httpOnly: true,
    secure: false,
    sameSite: 'lax',
    maxAge: 0,
    path: '/',
  });
}

export async function POST() {
  const response = NextResponse.json({
    success: true,
    message: '已退出登录',
  });

  clearAuthCookies(response);
  return response;
}
