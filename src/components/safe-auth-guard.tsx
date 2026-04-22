"use client";

import { useEffect, useSyncExternalStore } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuth } from '@/lib/auth-provider';
import { matchesAnyRoute } from '@/lib/route-matcher';

// 公开路由，不需要认证
const publicRoutes = ['/login', '/register', '/i', '/full-ai-interview/share'];
const emptySubscribe = () => () => {};

export function SafeAuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { isAuthenticated, isLoading } = useAuth();
  const isMounted = useSyncExternalStore(emptySubscribe, () => true, () => false);

  useEffect(() => {
    if (!isMounted) {
      return;
    }

    // 如果是公开路由，不需要检查认证
    if (matchesAnyRoute(pathname, publicRoutes)) {
      return;
    }

    // 如果未认证且不在加载状态，重定向到登录页
    if (!isLoading && !isAuthenticated) {
      router.push('/login');
    }
  }, [isAuthenticated, isLoading, isMounted, pathname, router]);

  if (!isMounted) {
    return (
      <div className="flex h-screen w-screen items-center justify-center">
        <div className="text-center">
          <div className="mb-4 h-12 w-12 animate-spin rounded-full border-4 border-primary border-t-transparent mx-auto" />
          <p className="text-muted-foreground">加载中...</p>
        </div>
      </div>
    );
  }

  // 如果是公开路由或已认证，直接渲染子组件
  if (matchesAnyRoute(pathname, publicRoutes) || isAuthenticated) {
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

  // 未认证，返回空（会被 useEffect 重定向）
  return null;
}
