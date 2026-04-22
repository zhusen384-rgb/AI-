'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { fetchClientJsonCached } from '@/lib/client-api';
import { useAuth } from '@/lib/auth-provider';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ChevronLeft } from 'lucide-react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, PieChart, Pie, Cell, Legend
} from 'recharts';

// 定义颜色
const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8'];

interface DashboardOverview {
  jobs?: {
    total?: number;
    active?: number;
  };
  communications?: {
    total?: number;
    greeted?: number;
    communicating?: number;
    replied?: number;
    interviewed?: number;
    rejected?: number;
  };
  messages?: {
    total?: number;
  };
  conversion?: {
    replyRate?: string;
    interviewRate?: string;
  };
}

interface DashboardJobStat {
  id: string;
  name: string;
  status: string;
  candidates: {
    total: number;
    greeted: number;
    communicating: number;
    interviewed: number;
  };
}

interface DashboardTrendData {
  communicationTrend?: Array<{
    period: string;
    total: number;
    greeted: number;
  }>;
  messageTrend?: Array<{
    period: string;
    total: number;
    candidateMessages: number;
  }>;
}

interface DashboardPerformance {
  averageResponseTime?: {
    firstResponse?: string;
    candidateResponse?: string;
  };
  effectiveCommunicationRate?: string;
  automationRate?: string;
}

/**
 * 数据看板页面
 */
export default function DashboardPage() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [overview, setOverview] = useState<DashboardOverview | null>(null);
  const [jobStats, setJobStats] = useState<DashboardJobStat[]>([]);
  const [trend, setTrend] = useState<DashboardTrendData | null>(null);
  const [performance, setPerformance] = useState<DashboardPerformance | null>(null);
  const [timeRange, setTimeRange] = useState('7d');
  const [selectedJob, setSelectedJob] = useState('all');
  const [selectedUserId, setSelectedUserId] = useState('all');
  const [usersList, setUsersList] = useState<Array<{ id: string; name: string; username: string }>>([]);
  const isSuperAdmin = user?.role === 'super_admin';

  useEffect(() => {
    void loadDashboardData(false);
  }, [timeRange, selectedJob, selectedUserId]);

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

  const loadDashboardData = async (forceRefresh: boolean = false) => {
    setLoading(true);
    try {
      const endDate = new Date().toISOString().split('T')[0];
      const startDate = new Date(Date.now() - parseInt(timeRange) * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      const jobId = selectedJob === 'all' ? '' : selectedJob;
      const ownerUserId = isSuperAdmin && selectedUserId !== 'all' ? selectedUserId : '';
      const ownerUserParam = ownerUserId ? `&ownerUserId=${encodeURIComponent(ownerUserId)}` : '';

      // 并行请求
      const [overviewData, jobData, trendData, perfData] = await Promise.all([
        fetchClientJsonCached<any>(
          `/api/auto-greeting/stats?type=overview&jobId=${jobId}&startDate=${startDate}&endDate=${endDate}${ownerUserParam}`,
          {},
          { forceRefresh, ttlMs: 15_000 }
        ),
        fetchClientJsonCached<any>(
          `/api/auto-greeting/stats?type=job${ownerUserParam}`,
          {},
          { forceRefresh, ttlMs: 15_000 }
        ),
        fetchClientJsonCached<any>(
          `/api/auto-greeting/stats?type=trend&jobId=${jobId}&period=day&startDate=${startDate}&endDate=${endDate}${ownerUserParam}`,
          {},
          { forceRefresh, ttlMs: 15_000 }
        ),
        fetchClientJsonCached<any>(
          `/api/auto-greeting/stats?type=performance&jobId=${jobId}${ownerUserParam}`,
          {},
          { forceRefresh, ttlMs: 15_000 }
        ),
      ]);

      if (overviewData.success) setOverview(overviewData.data);
      if (jobData.success) setJobStats(jobData.data.jobs || []);
      if (trendData.success) setTrend(trendData.data);
      if (perfData.success) setPerformance(perfData.data);

    } catch (error) {
      console.error('加载数据失败:', error);
    } finally {
      setLoading(false);
    }
  };

  // 计算转化率
  const calculateConversionRate = (from: number, to: number) => {
    if (from === 0) return '0%';
    return ((to / from) * 100).toFixed(1) + '%';
  };

  return (
    <div className="min-h-screen bg-background">
      {/* 顶部导航 */}
      <nav className="border-b bg-background">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex items-center">
              <Link 
                href="/auto-greeting" 
                className="flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors mr-4"
              >
                <ChevronLeft className="h-4 w-4" />
                <span className="text-sm">返回</span>
              </Link>
              <div className="w-px h-6 bg-border mx-2" />
              <Link 
                href="/auto-greeting" 
                className="text-sm text-muted-foreground hover:text-foreground"
              >
                自动打招呼
              </Link>
              <span className="text-muted-foreground mx-2">/</span>
              <span className="text-sm font-medium">数据看板</span>
            </div>
            <div className="flex items-center gap-4">
              {isSuperAdmin && usersList.length > 0 && (
                <Select value={selectedUserId} onValueChange={setSelectedUserId}>
                  <SelectTrigger className="w-[180px]">
                    <SelectValue placeholder="按用户筛选" />
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
              )}
              <Select value={timeRange} onValueChange={setTimeRange}>
                <SelectTrigger className="w-[120px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="7d">近7天</SelectItem>
                  <SelectItem value="30d">近30天</SelectItem>
                  <SelectItem value="90d">近90天</SelectItem>
                </SelectContent>
              </Select>
              <Button variant="outline" onClick={() => void loadDashboardData(true)}>
                刷新数据
              </Button>
            </div>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="text-muted-foreground">加载中...</div>
          </div>
        ) : (
          <div className="space-y-6">
            {/* 核心指标 */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardDescription>活跃岗位</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold">{overview?.jobs?.active || 0}</div>
                  <p className="text-sm text-muted-foreground mt-1">
                    共 {overview?.jobs?.total || 0} 个岗位
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardDescription>总沟通数</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold">{overview?.communications?.total || 0}</div>
                  <p className="text-sm text-muted-foreground mt-1">
                    已打招呼 {overview?.communications?.greeted || 0}
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardDescription>回复率</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold text-green-600">
                    {overview?.conversion?.replyRate || '0%'}
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">
                    面试率 {overview?.conversion?.interviewRate || '0%'}
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardDescription>自动化率</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold text-blue-600">
                    {performance?.automationRate || '0%'}
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">
                    消息总数 {overview?.messages?.total || 0}
                  </p>
                </CardContent>
              </Card>
            </div>

            {/* 转化漏斗 */}
            <Card>
              <CardHeader>
                <CardTitle>沟通转化漏斗</CardTitle>
                <CardDescription>从打招呼到面试的转化过程</CardDescription>
              </CardHeader>
              <CardContent>
                {overview?.communications && (
                  <div className="space-y-4">
                    {[
                      { label: '打招呼', value: overview.communications.greeted || 0, total: overview.communications.total || 1 },
                      { label: '沟通中', value: overview.communications.communicating || 0, total: overview.communications.total || 1 },
                      { label: '已回复', value: overview.communications.replied || 0, total: overview.communications.total || 1 },
                      { label: '已约面', value: overview.communications.interviewed || 0, total: overview.communications.total || 1 },
                    ].map((item, index) => (
                      <div key={index} className="flex items-center gap-4">
                        <div className="w-20 text-sm text-muted-foreground">{item.label}</div>
                        <Progress 
                          value={(item.value / item.total) * 100} 
                          className="flex-1"
                        />
                        <div className="w-24 text-right text-sm font-medium">
                          {item.value} ({((item.value / item.total) * 100).toFixed(1)}%)
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* 趋势图表 */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle>沟通趋势</CardTitle>
                  <CardDescription>每日新增沟通数量</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="h-[300px]">
                    {trend?.communicationTrend && (
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={trend.communicationTrend}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="period" />
                          <YAxis />
                          <Tooltip />
                          <Line 
                            type="monotone" 
                            dataKey="total" 
                            stroke="#8884d8" 
                            name="总数"
                          />
                          <Line 
                            type="monotone" 
                            dataKey="greeted" 
                            stroke="#82ca9d" 
                            name="已打招呼"
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    )}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>消息趋势</CardTitle>
                  <CardDescription>每日消息发送情况</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="h-[300px]">
                    {trend?.messageTrend && (
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={trend.messageTrend}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="period" />
                          <YAxis />
                          <Tooltip />
                          <Legend />
                          <Bar dataKey="total" fill="#8884d8" name="总消息" />
                          <Bar dataKey="candidateMessages" fill="#82ca9d" name="候选人消息" />
                        </BarChart>
                      </ResponsiveContainer>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* 岗位排行 */}
            <Card>
              <CardHeader>
                <CardTitle>岗位表现排行</CardTitle>
                <CardDescription>各岗位的沟通效果对比</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left py-3 px-4">岗位名称</th>
                        <th className="text-center py-3 px-4">状态</th>
                        <th className="text-center py-3 px-4">总候选人</th>
                        <th className="text-center py-3 px-4">已打招呼</th>
                        <th className="text-center py-3 px-4">沟通中</th>
                        <th className="text-center py-3 px-4">已约面</th>
                        <th className="text-center py-3 px-4">转化率</th>
                      </tr>
                    </thead>
                    <tbody>
                      {jobStats.slice(0, 10).map((job) => (
                        <tr key={job.id} className="border-b hover:bg-muted/50">
                          <td className="py-3 px-4">
                            <Link 
                              href={`/auto-greeting/communications?jobId=${job.id}`}
                              className="text-primary hover:underline"
                            >
                              {job.name}
                            </Link>
                          </td>
                          <td className="py-3 px-4 text-center">
                            <Badge variant={job.status === 'active' ? 'default' : 'secondary'}>
                              {job.status === 'active' ? '进行中' : '已暂停'}
                            </Badge>
                          </td>
                          <td className="py-3 px-4 text-center">{job.candidates.total}</td>
                          <td className="py-3 px-4 text-center">{job.candidates.greeted}</td>
                          <td className="py-3 px-4 text-center">{job.candidates.communicating}</td>
                          <td className="py-3 px-4 text-center">{job.candidates.interviewed}</td>
                          <td className="py-3 px-4 text-center">
                            <span className="text-green-600 font-medium">
                              {calculateConversionRate(
                                job.candidates.greeted,
                                job.candidates.interviewed
                              )}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>

            {/* 性能指标 */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card>
                <CardHeader>
                  <CardTitle>响应时间</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">首次回复</span>
                      <span className="font-medium">{performance?.averageResponseTime?.firstResponse || 'N/A'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">候选人响应</span>
                      <span className="font-medium">{performance?.averageResponseTime?.candidateResponse || 'N/A'}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>有效沟通</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-center">
                    <div className="text-4xl font-bold text-green-600">
                      {performance?.effectiveCommunicationRate || '0%'}
                    </div>
                    <p className="text-sm text-muted-foreground mt-2">
                      产生有效对话的沟通比例
                    </p>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>自动化效率</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-center">
                    <div className="text-4xl font-bold text-blue-600">
                      {performance?.automationRate || '0%'}
                    </div>
                    <p className="text-sm text-muted-foreground mt-2">
                      自动发送消息占比
                    </p>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
