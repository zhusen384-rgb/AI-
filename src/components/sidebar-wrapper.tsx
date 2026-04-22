"use client";

import { usePathname } from "next/navigation";
import { AppSidebar } from "@/components/app-sidebar";
import { cn } from "@/lib/utils";
import { matchesAnyRoute } from "@/lib/route-matcher";

export function SidebarWrapper({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  // 候选人入口和公开登录页不应暴露后台导航
  const routesWithoutSidebar = [
    "/login",
    "/register",
    "/i",
    "/full-ai-interview",
    "/full-ai-interview/share",
  ];

  const shouldHideSidebar = pathname ? matchesAnyRoute(pathname, routesWithoutSidebar) : false;

  if (shouldHideSidebar) {
    return (
      <main className="h-screen w-full overflow-y-auto bg-white">
        {children}
      </main>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <aside className="flex-shrink-0 transition-opacity duration-200">
        <AppSidebar />
      </aside>
      <main className={cn("flex-1 overflow-y-auto bg-white")}>{children}</main>
    </div>
  );
}
