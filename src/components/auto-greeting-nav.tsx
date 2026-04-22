'use client';

import Link from 'next/link';
import { ChevronLeft, Briefcase, MessageSquare, Users, BarChart3, Shield, Settings } from 'lucide-react';

interface AutoGreetingNavProps {
  title: string;
  description?: string;
  icon?: 'jobs' | 'templates' | 'communications' | 'dashboard' | 'risk' | 'settings';
}

const iconMap = {
  jobs: Briefcase,
  templates: MessageSquare,
  communications: Users,
  dashboard: BarChart3,
  risk: Shield,
  settings: Settings,
};

/**
 * 自动打招呼子页面通用导航
 */
export function AutoGreetingNav({ title, description, icon = 'settings' }: AutoGreetingNavProps) {
  const Icon = iconMap[icon];

  return (
    <nav className="border-b bg-background">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center h-16">
          {/* 返回按钮 */}
          <Link 
            href="/auto-greeting" 
            className="flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors mr-4"
          >
            <ChevronLeft className="h-4 w-4" />
            <span className="text-sm">返回</span>
          </Link>

          <div className="w-px h-6 bg-border mx-2" />

          {/* 面包屑 */}
          <div className="flex items-center gap-2">
            <Link 
              href="/auto-greeting" 
              className="text-sm text-muted-foreground hover:text-foreground"
            >
              自动打招呼
            </Link>
            <span className="text-muted-foreground">/</span>
          </div>

          {/* 当前页面标题 */}
          <div className="flex items-center gap-2">
            {Icon && <Icon className="h-4 w-4 text-primary" />}
            <h1 className="text-sm font-medium">{title}</h1>
          </div>
        </div>
      </div>
    </nav>
  );
}
