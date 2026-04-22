"use client";

import { usePathname } from "next/navigation";
import { AuthProvider } from "@/lib/auth-provider";
import { SafeAuthGuard } from "@/components/safe-auth-guard";
import { SidebarWrapper } from "@/components/sidebar-wrapper";
import { ChatBotLazy } from "@/components/chatbot-lazy";
import { matchesAnyRoute } from "@/lib/route-matcher";

const CANDIDATE_PUBLIC_ROUTES = ["/i", "/full-ai-interview/share"];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isCandidatePublicRoute = pathname ? matchesAnyRoute(pathname, CANDIDATE_PUBLIC_ROUTES) : false;

  if (isCandidatePublicRoute) {
    return (
      <main className="h-screen w-full overflow-y-auto bg-white">
        {children}
      </main>
    );
  }

  return (
    <AuthProvider>
      <SafeAuthGuard>
        <SidebarWrapper>{children}</SidebarWrapper>
      </SafeAuthGuard>
      <ChatBotLazy />
    </AuthProvider>
  );
}
