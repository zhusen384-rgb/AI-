'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Shield, AlertTriangle, CheckCircle, Clock, TrendingDown, 
  Activity, ChevronLeft, Settings, Ban
} from 'lucide-react';

/**
 * 风控中心页面
 */
export default function RiskControlPage() {
  const [loading, setLoading] = useState(true);
  const [riskMetrics, setRiskMetrics] = useState({
    overallRiskScore: 25,
    accountHealth: 95,
    dailyGreetingCount: 45,
    hourlyGreetingCount: 8,
    successRate: 98,
    flagRate: 1.5,
  });

  const [recentAlerts] = useState([
    {
      id: '1',
      type: 'warning',
      message: '今日打招呼数量接近每日上限',
      time: '2024-01-15 10:30:00',
      resolved: false,
    },
    {
      id: '2',
      type: 'info',
      message: '账号健康度良好，无异常行为',
      time: '2024-01-15 09:00:00',
      resolved: true,
    },
    {
      id: '3',
      type: 'error',
      message: '检测到敏感词：请候选人加微信',
      time: '2024-01-15 08:45:00',
      resolved: true,
    },
  ]);

  useEffect(() => {
    // 模拟加载数据
    setTimeout(() => setLoading(false), 500);
  }, []);

  const getRiskLevel = (score: number) => {
    if (score < 30) return { label: '低风险', color: 'text-green-600', bg: 'bg-green-100' };
    if (score < 60) return { label: '中等风险', color: 'text-yellow-600', bg: 'bg-yellow-100' };
    return { label: '高风险', color: 'text-red-600', bg: 'bg-red-100' };
  };

  const riskLevel = getRiskLevel(riskMetrics.overallRiskScore);

  return (
    <div className="min-h-screen bg-background">
      {/* 顶部导航 */}
      <nav className="border-b bg-background">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center h-16">
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
            <span className="text-sm font-medium">风控中心</span>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* 风险概览 */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">风险评分</p>
                  <p className={`text-2xl font-bold ${riskLevel.color}`}>
                    {riskMetrics.overallRiskScore}
                  </p>
                </div>
                <div className={`p-3 rounded-full ${riskLevel.bg}`}>
                  <Shield className={`h-6 w-6 ${riskLevel.color}`} />
                </div>
              </div>
              <Badge className={`mt-2 ${riskLevel.bg} ${riskLevel.color}`}>
                {riskLevel.label}
              </Badge>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">账号健康度</p>
                  <p className="text-2xl font-bold text-green-600">
                    {riskMetrics.accountHealth}%
                  </p>
                </div>
                <div className="p-3 bg-green-100 rounded-full">
                  <CheckCircle className="h-6 w-6 text-green-600" />
                </div>
              </div>
              <Progress value={riskMetrics.accountHealth} className="mt-2" />
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">今日打招呼</p>
                  <p className="text-2xl font-bold">
                    {riskMetrics.dailyGreetingCount}/100
                  </p>
                </div>
                <div className="p-3 bg-blue-100 rounded-full">
                  <Activity className="h-6 w-6 text-blue-600" />
                </div>
              </div>
              <Progress value={riskMetrics.dailyGreetingCount} className="mt-2" />
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">成功率</p>
                  <p className="text-2xl font-bold text-green-600">
                    {riskMetrics.successRate}%
                  </p>
                </div>
                <div className="p-3 bg-green-100 rounded-full">
                  <TrendingDown className="h-6 w-6 text-green-600" />
                </div>
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                标记率 {riskMetrics.flagRate}%
              </p>
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="alerts" className="space-y-4">
          <TabsList>
            <TabsTrigger value="alerts">风险预警</TabsTrigger>
            <TabsTrigger value="metrics">监控指标</TabsTrigger>
            <TabsTrigger value="blacklist">黑名单</TabsTrigger>
            <TabsTrigger value="sensitive">敏感词</TabsTrigger>
          </TabsList>

          {/* 风险预警 */}
          <TabsContent value="alerts">
            <Card>
              <CardHeader>
                <CardTitle>最近预警</CardTitle>
                <CardDescription>系统自动检测的风险事件</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {recentAlerts.map((alert) => (
                    <div 
                      key={alert.id}
                      className="flex items-start gap-4 p-4 border rounded-lg"
                    >
                      <div className={`p-2 rounded-full ${
                        alert.type === 'error' ? 'bg-red-100' :
                        alert.type === 'warning' ? 'bg-yellow-100' : 'bg-blue-100'
                      }`}>
                        {alert.type === 'error' ? (
                          <Ban className="h-4 w-4 text-red-600" />
                        ) : alert.type === 'warning' ? (
                          <AlertTriangle className="h-4 w-4 text-yellow-600" />
                        ) : (
                          <CheckCircle className="h-4 w-4 text-blue-600" />
                        )}
                      </div>
                      <div className="flex-1">
                        <p className="font-medium">{alert.message}</p>
                        <p className="text-sm text-muted-foreground">{alert.time}</p>
                      </div>
                      <Badge variant={alert.resolved ? 'secondary' : 'default'}>
                        {alert.resolved ? '已处理' : '待处理'}
                      </Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* 监控指标 */}
          <TabsContent value="metrics">
            <Card>
              <CardHeader>
                <CardTitle>实时监控指标</CardTitle>
                <CardDescription>关键风控指标的实时数据</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                  <div className="text-center">
                    <Clock className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                    <p className="text-2xl font-bold">{riskMetrics.hourlyGreetingCount}</p>
                    <p className="text-sm text-muted-foreground">每小时打招呼</p>
                  </div>
                  <div className="text-center">
                    <Activity className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                    <p className="text-2xl font-bold">{riskMetrics.successRate}%</p>
                    <p className="text-sm text-muted-foreground">发送成功率</p>
                  </div>
                  <div className="text-center">
                    <TrendingDown className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                    <p className="text-2xl font-bold">{riskMetrics.flagRate}%</p>
                    <p className="text-sm text-muted-foreground">被标记率</p>
                  </div>
                  <div className="text-center">
                    <CheckCircle className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                    <p className="text-2xl font-bold">{riskMetrics.accountHealth}%</p>
                    <p className="text-sm text-muted-foreground">账号健康度</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* 黑名单 */}
          <TabsContent value="blacklist">
            <Card>
              <CardHeader>
                <CardTitle>候选人黑名单</CardTitle>
                <CardDescription>已被系统自动拉黑的候选人</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-center py-12 text-muted-foreground">
                  <Ban className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>暂无黑名单候选人</p>
                  <p className="text-sm">系统会自动将发送敏感信息的候选人加入黑名单</p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* 敏感词 */}
          <TabsContent value="sensitive">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle>敏感词库</CardTitle>
                  <CardDescription>触发风控的敏感词列表</CardDescription>
                </div>
                <Link href="/auto-greeting/settings">
                  <Button variant="outline" size="sm">
                    <Settings className="h-4 w-4 mr-2" />
                    配置敏感词
                  </Button>
                </Link>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {['微信', '电话', '加我', '私聊', '直接面试', '转账', '红包'].map((word) => (
                    <Badge key={word} variant="secondary">
                      {word}
                    </Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
