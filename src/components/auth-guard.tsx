"use client";

import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuth } from '@/lib/auth-provider';
import { matchesAnyRoute } from '@/lib/route-matcher';

// 公开路由，不需要认证
const publicRoutes = ['/login', '/register'];

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { isAuthenticated, isLoading } = useAuth();

  useEffect(() => {
    // 如果是公开路由，不需要检查认证
    if (matchesAnyRoute(pathname, publicRoutes)) {
      return;
    }

    // 如果未认证且不在加载状态，重定向到登录页
    if (!isLoading && !isAuthenticated) {
      router.push('/login');
    }
  }, [isAuthenticated, isLoading, pathname, router]);

  // 如果是公开路由，直接渲染
  if (matchesAnyRoute(pathname, publicRoutes)) {
    return <>{children}</>;
  }

  // 如果正在加载，显示加载状态
  if (isLoading) {
    return (
      <div className="flex h-screen w-screen items-center justify-center">
        <div className="text-center">
          <div className="mb-4 h-12 w-12 animate-spin rounded-full border-4 border-primary border-t-transparent mx-auto" />
          <p className="text-muted-foreground">加载中...</p>
        </div>
      </div>
    );
  }

  // 如果已认证，渲染子组件
  if (isAuthenticated) {
    return <>{children}</>;
  }

  // 未认证，返回空（会被 useEffect 重定向）
  return null;
}
