'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { fetchClientJsonCached } from '@/lib/client-api';
import { useAuth } from '@/lib/auth-provider';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Briefcase, MessageSquare, Users, Settings, BarChart3, Zap, Activity, Shield, Cog, TrendingUp, Link2 } from 'lucide-react';

export default function AutoGreetingPage() {
  const { user } = useAuth();
  const [stats, setStats] = useState({
    activeJobs: 0,
    totalCommunications: 0,
    todayGreetings: 0,
    responseRate: '0%',
  });
  const [selectedUserId, setSelectedUserId] = useState('all');
  const [usersList, setUsersList] = useState<Array<{ id: string; name: string; username: string }>>([]);
  const isSuperAdmin = user?.role === 'super_admin';

  const loadStats = async () => {
    try {
      const ownerUserId = isSuperAdmin && selectedUserId !== 'all' ? `&ownerUserId=${encodeURIComponent(selectedUserId)}` : '';
      const data = await fetchClientJsonCached<any>(`/api/auto-greeting/stats?type=overview${ownerUserId}`, {}, {
        ttlMs: 20_000,
      });
      if (data.success) {
        setStats({
          activeJobs: data.data.jobs?.active || 0,
          totalCommunications: data.data.communications?.total || 0,
          todayGreetings: data.data.communications?.greeted || 0,
          responseRate: data.data.conversion?.replyRate || '0%',
        });
      }
    } catch (error) {
      console.error('加载统计失败:', error);
    }
  };

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadStats();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [selectedUserId]);

  useEffect(() => {
    if (!isSuperAdmin) {
      return;
    }

    const loadUsers = async () => {
      try {
        const data = await fetchClientJsonCached<any>('/api/admin/users-list', {}, {
          ttlMs: 30_000,
        });
        if (data.success) {
          setUsersList(data.data || []);
        }
      } catch (error) {
        console.error('加载用户列表失败:', error);
      }
    };

    void loadUsers();
  }, [isSuperAdmin]);

  const features = [
    {
      title: '岗位管理',
      description: '配置招聘岗位、目标平台、匹配规则',
      icon: Briefcase,
      href: '/auto-greeting/jobs',
      color: 'text-blue-600',
      bgColor: 'bg-blue-100',
    },
    {
      title: '话术管理',
      description: '编辑打招呼模板、问答库',
      icon: MessageSquare,
      href: '/auto-greeting/templates',
      color: 'text-purple-600',
      bgColor: 'bg-purple-100',
    },
    {
      title: '沟通记录',
      description: '查看候选人沟通详情、意向分析',
      icon: Users,
      href: '/auto-greeting/communications',
      color: 'text-green-600',
      bgColor: 'bg-green-100',
    },
    {
      title: '数据看板',
      description: '可视化数据分析、转化漏斗、趋势图表',
      icon: BarChart3,
      href: '/auto-greeting/dashboard',
      color: 'text-orange-600',
      bgColor: 'bg-orange-100',
    },
    {
      title: '平台账号',
      description: '管理招聘平台账号登录凭证',
      icon: Link2,
      href: '/auto-greeting/accounts',
      color: 'text-cyan-600',
      bgColor: 'bg-cyan-100',
    },
    {
      title: '风控中心',
      description: '风险监控、账号健康管理',
      icon: Shield,
      href: '/auto-greeting/risk',
      color: 'text-red-600',
      bgColor: 'bg-red-100',
    },
    {
      title: '系统配置',
      description: '通用设置、风控参数、通知配置',
      icon: Cog,
      href: '/auto-greeting/settings',
      color: 'text-gray-600',
      bgColor: 'bg-gray-100',
    },
  ];

  return (
    <div className="container mx-auto py-8">
      <div className="text-center mb-8">
        <h1 className="text-4xl font-bold mb-2">自动打招呼智能体</h1>
        <p className="text-muted-foreground text-lg">
          AI 驱动的招聘沟通自动化平台
        </p>
        {isSuperAdmin && usersList.length > 0 && (
          <div className="mt-4 flex justify-center">
            <Select value={selectedUserId} onValueChange={setSelectedUserId}>
              <SelectTrigger className="w-[220px]">
                <SelectValue placeholder="按用户查看数据" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">所有用户</SelectItem>
                {usersList.map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.name || u.username}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      {/* 实时统计 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">活跃岗位</p>
                <p className="text-2xl font-bold">{stats.activeJobs}</p>
              </div>
              <Briefcase className="h-8 w-8 text-blue-600 opacity-50" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">总沟通数</p>
                <p className="text-2xl font-bold">{stats.totalCommunications}</p>
              </div>
              <Users className="h-8 w-8 text-green-600 opacity-50" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">今日打招呼</p>
                <p className="text-2xl font-bold">{stats.todayGreetings}</p>
              </div>
              <Activity className="h-8 w-8 text-orange-600 opacity-50" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">回复率</p>
                <p className="text-2xl font-bold text-green-600">{stats.responseRate}</p>
              </div>
              <TrendingUp className="h-8 w-8 text-green-600 opacity-50" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 功能特性 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
        {features.map((feature) => {
          const Icon = feature.icon;
          return (
            <Link key={feature.href} href={feature.href}>
              <Card className="h-full hover:shadow-lg transition-shadow cursor-pointer">
                <CardHeader>
                  <div className={`w-12 h-12 ${feature.bgColor} rounded-lg flex items-center justify-center mb-4`}>
                    <Icon className={`h-6 w-6 ${feature.color}`} />
                  </div>
                  <CardTitle>{feature.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-muted-foreground">{feature.description}</p>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>

      {/* 快速开始 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5" />
            快速开始
          </CardTitle>
          <CardDescription>三步开启自动化招聘沟通</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 border rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <Badge variant="secondary">1</Badge>
                <span className="font-medium">创建岗位</span>
              </div>
              <p className="text-sm text-muted-foreground mb-4">
                配置招聘需求、目标平台和匹配规则
              </p>
              <Link href="/auto-greeting/jobs">
                <Button size="sm">创建岗位</Button>
              </Link>
            </div>
            <div className="p-4 border rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <Badge variant="secondary">2</Badge>
                <span className="font-medium">编写话术</span>
              </div>
              <p className="text-sm text-muted-foreground mb-4">
                设计个性化的打招呼模板和回复话术
              </p>
              <Link href="/auto-greeting/templates">
                <Button size="sm">编写话术</Button>
              </Link>
            </div>
            <div className="p-4 border rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <Badge variant="secondary">3</Badge>
                <span className="font-medium">启动运行</span>
              </div>
              <p className="text-sm text-muted-foreground mb-4">
                一键启动自动化沟通，实时监控效果
              </p>
              <Link href="/auto-greeting/dashboard">
                <Button size="sm">查看看板</Button>
              </Link>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 系统状态 */}
      <div className="mt-8 flex items-center justify-between text-sm text-muted-foreground">
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-green-500"></span>
            系统运行正常
          </span>
          <span>|</span>
          <span>AI 模型: doubao-seed-1-6-lite</span>
        </div>
        <Link href="/auto-greeting/settings" className="text-primary hover:underline">
          系统设置
        </Link>
      </div>
    </div>
  );
}
