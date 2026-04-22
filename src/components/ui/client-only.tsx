"use client";

import { ReactNode } from "react";

interface ClientOnlyProps {
  children: ReactNode;
  fallback?: ReactNode;
}

/**
 * 只在客户端渲染子组件，避免 SSR hydration mismatch
 * 用于包含动态 ID 或浏览器特有 API 的组件
 */
export function ClientOnly({ children, fallback = null }: ClientOnlyProps) {
  if (typeof window === "undefined") {
    return <>{fallback}</>;
  }

  return <>{children}</>;
}
