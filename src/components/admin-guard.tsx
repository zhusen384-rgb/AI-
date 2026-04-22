"use client";

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-provider';

export function AdminGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { isAuthenticated, isLoading, isAdmin } = useAuth();

  useEffect(() => {
    // 如果未认证，重定向到登录页
    if (!isLoading && !isAuthenticated) {
      router.push('/login');
      return;
    }

    // 如果不是管理员，重定向到首页
    if (!isLoading && isAuthenticated && !isAdmin()) {
      router.push('/');
      return;
    }
  }, [isAuthenticated, isLoading, isAdmin, router]);

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

  // 如果已认证且是管理员，渲染子组件
  if (isAuthenticated && isAdmin()) {
    return <>{children}</>;
  }

  // 未认证或非管理员，返回空（会被 useEffect 重定向）
  return null;
}
