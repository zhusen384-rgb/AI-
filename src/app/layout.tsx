import type { Metadata } from 'next';
import './globals.css';
import { AppShell } from '@/components/app-shell';
import { Toaster } from '@/components/ui/sonner';

export const metadata: Metadata = {
  title: {
    default: '面试官系统',
    template: '%s | 面试官系统',
  },
  description: '智能面试官系统 - 简历解析、问题生成、实时面试、结构化评估',
  keywords: [
    '面试系统',
    '智能面试',
    '简历解析',
    '结构化面试',
    '招聘系统',
  ],
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body className="antialiased">
        <AppShell>{children}</AppShell>
        <Toaster />
      </body>
    </html>
  );
}
