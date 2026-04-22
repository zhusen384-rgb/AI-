import type { NextRequest } from 'next/server';

export const INIT_TOKEN_HEADER = 'x-init-token';

export interface InitAccessError {
  message: string;
  status: number;
}

export function validateInitAccess(request: NextRequest): InitAccessError | null {
  if (process.env.NODE_ENV !== 'production') {
    return null;
  }

  const configuredToken = process.env.INIT_API_TOKEN?.trim();
  if (!configuredToken) {
    return {
      message: '生产环境未配置 INIT_API_TOKEN，初始化接口已禁用',
      status: 503,
    };
  }

  const requestToken = request.headers.get(INIT_TOKEN_HEADER)?.trim();
  if (!requestToken || requestToken !== configuredToken) {
    return {
      message: '初始化令牌无效',
      status: 403,
    };
  }

  return null;
}
