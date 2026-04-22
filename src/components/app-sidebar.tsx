"use client";

import React, { useCallback, useMemo } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { fetchClientJsonCached } from "@/lib/client-api";
import {
  LayoutDashboard,
  Briefcase,
  Users,
  FileText,
  Video,
  FileCheck,
  Settings,
  Brain,
  Bot,
  LogOut,
  BarChart3,
  MessageSquareHeart,
  SlidersHorizontal,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth-provider";

// 菜单项定义
const sidebarItems: Array<{
  title: string;
  href: string;
  icon: LucideIcon;
  requiredRole?: 'super_admin'; // 仅超级管理员可见
}> = [
  {
    title: "仪表盘",
    href: "/",
    icon: LayoutDashboard,
  },
  {
    title: "岗位管理",
    href: "/positions",
    icon: Briefcase,
  },
  {
    title: "候选人管理",
    href: "/candidates",
    icon: Users,
  },
  {
    title: "简历解析",
    href: "/resumes",
    icon: FileText,
  },
  {
    title: "全AI面试",
    href: "/full-ai-interview",
    icon: Bot,
  },
  {
    title: "面试室",
    href: "/interview",
    icon: Video,
  },
  {
    title: "评估报告",
    href: "/reports",
    icon: FileCheck,
  },
  {
    title: "自动打招呼",
    href: "/auto-greeting",
    icon: MessageSquareHeart,
  },
  {
    title: "AI面试陪练",
    href: "/practice",
    icon: Brain,
  },
  {
    title: "用户管理",
    href: "/users",
    icon: Users,
    requiredRole: 'super_admin', // 仅超级管理员可见
  },
  {
    title: "AI评分规则",
    href: "/admin/ai-score-rules",
    icon: SlidersHorizontal,
    requiredRole: 'super_admin',
  },
  {
    title: "系统设置",
    href: "/settings",
    icon: Settings,
  },
  {
    title: "面试官音色",
    href: "/settings/interviewer-voice",
    icon: Settings,
    requiredRole: 'super_admin',
  },
];

// 管理员专属菜单
const adminSidebarItems = [
  {
    title: "管理员数据看板",
    href: "/admin/dashboard",
    icon: BarChart3,
  },
];

// 导航项组件，使用 React.memo 优化
const SidebarNavItem = React.memo(function SidebarNavItem({
  item,
  isActive,
  onPrefetch,
}: {
  item: typeof sidebarItems[0];
  isActive: boolean;
  onPrefetch: (href: string) => void;
}) {
  const Icon = item.icon;

  return (
    <Link
      key={item.href}
      href={item.href}
      prefetch
      onMouseEnter={() => onPrefetch(item.href)}
      onFocus={() => onPrefetch(item.href)}
      onTouchStart={() => onPrefetch(item.href)}
    >
      <Button
        variant={isActive ? "default" : "ghost"}
        className={cn(
          "w-full justify-start",
          isActive && "bg-primary text-primary-foreground"
        )}
      >
        <Icon className="mr-2 h-4 w-4" />
        {item.title}
      </Button>
    </Link>
  );
});

export function AppSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useAuth();
  const prefetchedRoutes = React.useRef(new Set<string>());
  const prefetchedRouteData = React.useRef(new Set<string>());

  // 判断是否为超级管理员
  const isSuperAdmin = user?.role === 'super_admin';

  // 判断是否为管理员（包括超级管理员和普通管理员）
  const isAdmin = isSuperAdmin || user?.role === 'admin';
  const visiblePrefetchRoutes = useMemo(() => {
    const allowedRoutes = sidebarItems
      .filter((item) => item.requiredRole !== 'super_admin' || isSuperAdmin)
      .map((item) => item.href);

    if (isAdmin) {
      allowedRoutes.push(...adminSidebarItems.map((item) => item.href));
    }

    const priorityRoutes = [
      "/",
      "/positions",
      "/candidates",
      "/resumes",
      "/full-ai-interview",
      "/reports",
      "/auto-greeting",
      "/admin/dashboard",
      "/settings",
      "/interview",
    ];

    const prioritizedRoutes = priorityRoutes.filter(
      (href) => allowedRoutes.includes(href) && href !== pathname
    );
    const remainingRoutes = allowedRoutes.filter(
      (href) => href !== pathname && !priorityRoutes.includes(href)
    );

    return [...prioritizedRoutes, ...remainingRoutes];
  }, [isAdmin, isSuperAdmin, pathname]);

  const routeDataPrefetchMap = useMemo<Record<string, string[]>>(
    () => ({
      "/positions": ["/api/positions"],
      "/candidates": ["/api/positions", "/api/candidates"],
      "/resumes": ["/api/positions"],
      "/full-ai-interview": ["/api/positions", "/api/full-ai-interview/interviewer-voice"],
      "/interview": ["/api/positions"],
      "/settings/interviewer-voice": ["/api/full-ai-interview/interviewer-voice"],
    }),
    []
  );

  const warmRouteData = useCallback((href: string) => {
    const dataUrls = routeDataPrefetchMap[href];
    if (!dataUrls || dataUrls.length === 0 || prefetchedRouteData.current.has(href)) {
      return;
    }

    prefetchedRouteData.current.add(href);
    void Promise.allSettled(
      dataUrls.map((url) =>
        fetchClientJsonCached(url, {}, { ttlMs: 20_000 })
      )
    );
  }, [routeDataPrefetchMap]);

  const handlePrefetch = useCallback((href: string) => {
    if (!href || href === pathname || prefetchedRoutes.current.has(href)) {
      warmRouteData(href);
      return;
    }

    prefetchedRoutes.current.add(href);
    router.prefetch(href);
    warmRouteData(href);
  }, [pathname, router, warmRouteData]);

  React.useEffect(() => {
    if (visiblePrefetchRoutes.length === 0) {
      return;
    }

    const connection = (navigator as Navigator & {
      connection?: { saveData?: boolean };
    }).connection;
    if (connection?.saveData) {
      return;
    }

    let cancelled = false;
    const prefetchRoutes = () => {
      for (const href of visiblePrefetchRoutes) {
        if (cancelled) {
          return;
        }

        if (prefetchedRoutes.current.has(href)) {
          warmRouteData(href);
          continue;
        }

        prefetchedRoutes.current.add(href);
        router.prefetch(href);
        warmRouteData(href);
      }
    };

    const idleCallback = globalThis.requestIdleCallback;
    if (typeof idleCallback === "function") {
      const handle = idleCallback(prefetchRoutes, { timeout: 1500 });
      return () => {
        cancelled = true;
        globalThis.cancelIdleCallback?.(handle);
      };
    }

    const timer = window.setTimeout(prefetchRoutes, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [router, visiblePrefetchRoutes, warmRouteData]);

  // 根据用户角色过滤菜单项
  const navItems = useMemo(() => {
    return sidebarItems
      .filter((item) => {
        // 如果菜单项需要超级管理员权限，则只有超级管理员可见
        if (item.requiredRole === 'super_admin') {
          return isSuperAdmin;
        }
        return true;
      })
      .map((item) => (
        <SidebarNavItem
          key={item.href}
          item={item}
          isActive={pathname === item.href || pathname?.startsWith(item.href + '/')}
          onPrefetch={handlePrefetch}
        />
      ));
  }, [handlePrefetch, pathname, isSuperAdmin]);

  // 管理员菜单项
  const adminNavItems = useMemo(() => {
    if (!isAdmin) return null;
    return adminSidebarItems.map((item) => (
      <SidebarNavItem
        key={item.href}
        item={item}
        isActive={pathname === item.href || pathname?.startsWith(item.href + '/')}
        onPrefetch={handlePrefetch}
      />
    ));
  }, [handlePrefetch, pathname, isAdmin]);

  const handleLogout = async () => {
    await logout();
  };

  return (
    <div className="flex h-screen w-64 flex-col border-r bg-gray-50">
      <div className="flex h-16 items-center border-b px-6">
        <h1 className="text-xl font-bold text-gray-900">面试官系统</h1>
      </div>
      <nav className="flex-1 space-y-1 p-4">
        {navItems}
        {adminNavItems && (
          <>
            <div className="my-2 border-t border-gray-200" />
            {adminNavItems}
          </>
        )}
      </nav>
      <div className="border-t p-4 space-y-2">
        <div className="text-sm text-gray-500">
          <p className="font-medium text-gray-700">{user?.name || user?.username || '未知用户'}</p>
          <p className="text-xs">{user?.email || ''}</p>
          <p className="text-xs mt-1">在线</p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start text-gray-600 hover:text-red-600"
          onClick={handleLogout}
        >
          <LogOut className="mr-2 h-4 w-4" />
          退出登录
        </Button>
      </div>
    </div>
  );
}
