"use client";

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/lib/auth-provider";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ClientOnly } from "@/components/ui/client-only";
import { Users, Briefcase, Video, FileCheck, TrendingUp, Clock, ChevronRight, UserCheck, FileText, Calendar, Download, BarChart3, Loader2 } from "lucide-react";

export default function DashboardPage() {
  const { isAuthenticated, isLoading, logout, user } = useAuth();

  // 检查登录状态
  useEffect(() => {
    console.log('[Dashboard] 状态: isLoading=', isLoading, ', isAuthenticated=', isAuthenticated);
    
    if (!isLoading && !isAuthenticated) {
      console.log('[Dashboard] 未登录，跳转到登录页');
      window.location.href = '/login';
    }
  }, [isAuthenticated, isLoading]);

  console.log('[Dashboard] 用户已登录，显示仪表盘:', user?.username);

  // 年月选择器状态
  const [selectedYear, setSelectedYear] = useState(() => {
    const now = new Date();
    return now.getFullYear();
  });
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date();
    return now.getMonth() + 1; // 1-12
  });

  const [isInterviewDialogOpen, setIsInterviewDialogOpen] = useState(false);
  const [isCandidatesDialogOpen, setIsCandidatesDialogOpen] = useState(false);
  const [isExportDialogOpen, setIsExportDialogOpen] = useState(false);
  const [candidatesFilterType, setCandidatesFilterType] = useState<'all' | 'offer' | 'hired' | 'rejectedOffer'>('all');
  const [candidates, setCandidates] = useState<any[]>([]);
  const [interviewStats, setInterviewStats] = useState({
    pending: 0,    // 待初试（初始）
    initial: 0,    // 待初试
    second: 0,     // 待复试
    final: 0,      // 待终试
    offer: 0,      // 待入职
    hired: 0,      // 已入职
    rejected: 0,   // 已淘汰（终试未通过）
    rejectedOffer: 0,  // 拒绝入职
    pendingInterview: 0,  // 待定
  });
  const [monthlyCandidateCount, setMonthlyCandidateCount] = useState(0);  // 选中月份的候选人总数
  const [lastMonthStats, setLastMonthStats] = useState<any>(null);  // 上个月的统计数据
  const [showComparison, setShowComparison] = useState(false);  // 是否显示月度对比
  const [finalPassedCount, setFinalPassedCount] = useState(0);  // 终试通过人数
  const [hiredCount, setHiredCount] = useState(0);  // 入职人数
  const [interviewRate, setInterviewRate] = useState({
    initialPass: 0,    // 初试通过率
    secondPass: 0,     // 复试通过率
    finalPass: 0,      // 终试通过率
    fail: 0,           // 未通过率
  });

  // 快速选择年月的函数
  const handleQuickSelect = (type: 'thisMonth' | 'lastMonth' | 'lastMonthSameDay') => {
    const now = new Date();
    
    if (type === 'thisMonth') {
      setSelectedYear(now.getFullYear());
      setSelectedMonth(now.getMonth() + 1);
    } else if (type === 'lastMonth') {
      const lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      setSelectedYear(lastMonthDate.getFullYear());
      setSelectedMonth(lastMonthDate.getMonth() + 1);
    } else if (type === 'lastMonthSameDay') {
      const lastMonthSameDay = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate());
      setSelectedYear(lastMonthSameDay.getFullYear());
      setSelectedMonth(lastMonthSameDay.getMonth() + 1);
    }
  };

  // 面试阶段映射
  const interviewStageMap = {
    pending: { label: "待初试", variant: "secondary" as const, color: "bg-gray-500" },
    initial: { label: "待初试", variant: "default" as const, color: "bg-blue-500" },
    second: { label: "待复试", variant: "default" as const, color: "bg-orange-500" },
    final: { label: "待终试", variant: "default" as const, color: "bg-purple-500" },
    offer: { label: "待入职", variant: "default" as const, color: "bg-blue-600" },
    hired: { label: "已入职", variant: "default" as const, color: "bg-green-600" },
    rejected: { label: "已淘汰", variant: "secondary" as const, color: "bg-red-600" },
    rejectedOffer: { label: "拒绝入职", variant: "secondary" as const, color: "bg-orange-600" },
  };

  // 统计候选人数据的函数（只统计指定月份有面试活动的候选人）
  const updateStatistics = (candidatesData: any[], year: number, month: number) => {
    // month 参数为 1-12
    const result = calculateMonthStats(candidatesData, year, month);
    
    setInterviewStats(result.stats);
    setMonthlyCandidateCount(result.monthlyCount);
    setFinalPassedCount(result.finalPassed);
    setHiredCount(result.hired);

    // 计算面试通过率
    setInterviewRate({
      initialPass: result.totalInterviewed > 0 ? Math.round((result.initialPassed / result.totalInterviewed) * 100) : 0,
      secondPass: result.initialPassed > 0 ? Math.round((result.secondPassed / result.initialPassed) * 100) : 0,
      finalPass: result.secondPassed > 0 ? Math.round((result.finalPassed / result.secondPassed) * 100) : 0,
      fail: result.totalInterviewed > 0 ? Math.round((result.failed / result.totalInterviewed) * 100) : 0,
    });

    // 计算上个月的数据（用于对比）
    const lastMonthDate = new Date(year, month - 2, 1);
    const lastMonthStatsValue = calculateMonthStats(candidatesData, lastMonthDate.getFullYear(), lastMonthDate.getMonth() + 1);
    console.log('[月度对比] 计算上月数据:', {
      currentDate: `${year}年${month}月`,
      lastMonthDate: `${lastMonthDate.getFullYear()}年${lastMonthDate.getMonth() + 1}月`,
      lastMonthStatsValue
    });
    setLastMonthStats(lastMonthStatsValue);
  };

  // 计算指定月份的统计数据
  const calculateMonthStats = (candidatesData: any[], year: number, month: number) => {
    const stats = {
      pending: 0,  // 待初试（初始）：本月添加，但还没有设置初试时间
      initial: 0,  // 待初试：已设置初试时间，等待面试
      second: 0,
      final: 0,
      offer: 0,
      hired: 0,
      rejected: 0,  // 已淘汰（终试未通过）
      rejectedOffer: 0,  // 拒绝入职
      pendingInterview: 0,
    };

    let monthlyCount = 0;
    let finalPassed = 0;
    let hired = 0;
    let initialPassed = 0;
    let secondPassed = 0;
    let failed = 0;
    let totalInterviewed = 0;

    candidatesData.forEach((c: any) => {
      // 判断候选人是否属于本月统计范围
      let isCandidateInMonth = false;

      // 特殊情况：对于已明确的状态（待入职、已入职、拒绝入职），统计所有该状态的候选人
      if (['offer', 'hired', 'rejectedOffer'].includes(c.interviewStage)) {
        isCandidateInMonth = true;
      }
      // 情况1：待初试（初始）- 本月添加，但还没有设置初试时间
      else if (c.interviewStage === 'pending' && !c.initialInterviewTime) {
        if (c.createdAt) {
          const createdDate = new Date(c.createdAt);
          if (createdDate.getFullYear() === year && (createdDate.getMonth() + 1) === month) {
            isCandidateInMonth = true;
          }
        }
      }
      // 情况2：已设置初试、复试或终试时间（包括所有面试阶段）
      else {
        let hasTargetMonthInterview = false;

        if (c.initialInterviewTime) {
          const initialDate = new Date(c.initialInterviewTime);
          if (initialDate.getFullYear() === year && (initialDate.getMonth() + 1) === month) {
            hasTargetMonthInterview = true;
          }
        }

        if (c.secondInterviewTime) {
          const secondDate = new Date(c.secondInterviewTime);
          if (secondDate.getFullYear() === year && (secondDate.getMonth() + 1) === month) {
            hasTargetMonthInterview = true;
          }
        }

        if (c.finalInterviewTime) {
          const finalDate = new Date(c.finalInterviewTime);
          if (finalDate.getFullYear() === year && (finalDate.getMonth() + 1) === month) {
            hasTargetMonthInterview = true;
          }
        }

        if (hasTargetMonthInterview) {
          isCandidateInMonth = true;
        }
      }

      // 只统计本月相关的候选人
      if (!isCandidateInMonth) {
        return;
      }

      monthlyCount++;

      // 根据实际情况确定统计的面试阶段（优先考虑实际设置的面试时间）
      let statStage = c.interviewStage || 'pending';

      // 特殊处理：对于已明确的状态（如拒绝入职、已入职、已淘汰等），不要被面试时间覆盖
      if (['rejectedOffer', 'hired', 'rejected'].includes(statStage)) {
        // 保持原状态不变
      }
      // 特殊处理：如果设置了初试时间，应该统计到"待初试"而不是"待初试（初始）"
      else if (c.initialInterviewTime && statStage === 'pending') {
        statStage = 'initial';
      }
      // 特殊处理：如果设置了复试时间，应该统计到"待复试"
      else if (c.secondInterviewTime && (statStage === 'pending' || statStage === 'initial')) {
        statStage = 'second';
      }
      // 特殊处理：如果设置了终试时间，应该统计到"待终试"
      else if (c.finalInterviewTime && (statStage === 'pending' || statStage === 'initial' || statStage === 'second')) {
        statStage = 'final';
      }

      if (stats.hasOwnProperty(statStage)) {
        stats[statStage as keyof typeof stats]++;
      }

      if (c.initialInterviewPassed === 'pending' ||
          c.secondInterviewPassed === 'pending' ||
          c.finalInterviewPassed === 'pending') {
        stats.pendingInterview++;
      }

      if (c.finalInterviewPassed === 'pass') {
        finalPassed++;
      }
      if (c.isHired === true) {
        hired++;
      }

      if (c.initialInterviewPassed !== null) {
        totalInterviewed++;
      }

      if (c.initialInterviewPassed === 'pass') {
        initialPassed++;
      }

      if (c.secondInterviewPassed === 'pass') {
        secondPassed++;
      }

      if (
        c.initialInterviewPassed === 'fail' ||
        c.secondInterviewPassed === 'fail' ||
        c.finalInterviewPassed === 'fail'
      ) {
        failed++;
      }
    });

    return {
      stats,
      monthlyCount,
      finalPassed,
      hired,
      initialPassed,
      secondPassed,
      failed,
      totalInterviewed,
    };
  };

  // 获取全AI面试记录数据
  const fetchAiInterviewRecords = async (year: number, month: number) => {
    try {
      const params = new URLSearchParams({
        year: year.toString(),
        month: month.toString(),
        recommendation: 'all',
      });

      const response = await fetch(`/api/full-ai-interview/records?${params}`);
      const result = await response.json();

      if (result.success) {
        return result.data;
      } else {
        console.error("获取全AI面试记录失败:", result.error);
        return [];
      }
    } catch (error) {
      console.error("获取全AI面试记录失败:", error);
      return [];
    }
  };

  // 导出传统面试数据
  const exportTraditionalData = (wb: any, XLSX: typeof import("xlsx")) => {
    // 筛选选中月份的候选人
    const monthlyCandidates = candidates.filter((c: any) => {
      let hasTargetMonthInterview = false;

      if (c.initialInterviewTime) {
        const initialDate = new Date(c.initialInterviewTime);
        if (initialDate.getFullYear() === selectedYear && (initialDate.getMonth() + 1) === selectedMonth) {
          hasTargetMonthInterview = true;
        }
      }

      if (c.secondInterviewTime) {
        const secondDate = new Date(c.secondInterviewTime);
        if (secondDate.getFullYear() === selectedYear && (secondDate.getMonth() + 1) === selectedMonth) {
          hasTargetMonthInterview = true;
        }
      }

      if (c.finalInterviewTime) {
        const finalDate = new Date(c.finalInterviewTime);
        if (finalDate.getFullYear() === selectedYear && (finalDate.getMonth() + 1) === selectedMonth) {
          hasTargetMonthInterview = true;
        }
      }

      return hasTargetMonthInterview;
    });

    // 准备导出数据
    const exportData = monthlyCandidates.map((c: any) => ({
      姓名: c.name,
      手机号: c.phone,
      邮箱: c.email,
      应聘岗位: c.position,
      面试阶段: interviewStageMap[c.interviewStage as keyof typeof interviewStageMap]?.label || c.interviewStage,
      初试时间: c.initialInterviewTime ? new Date(c.initialInterviewTime).toLocaleString('zh-CN') : '',
      初试结果: c.initialInterviewPassed === 'pass' ? '通过' : c.initialInterviewPassed === 'fail' ? '未通过' : c.initialInterviewPassed === 'pending' ? '待定' : '',
      复试时间: c.secondInterviewTime ? new Date(c.secondInterviewTime).toLocaleString('zh-CN') : '',
      复试结果: c.secondInterviewPassed === 'pass' ? '通过' : c.secondInterviewPassed === 'fail' ? '未通过' : c.secondInterviewPassed === 'pending' ? '待定' : '',
      终试时间: c.finalInterviewTime ? new Date(c.finalInterviewTime).toLocaleString('zh-CN') : '',
      终试结果: c.finalInterviewPassed === 'pass' ? '通过' : c.finalInterviewPassed === 'fail' ? '未通过' : c.finalInterviewPassed === 'pending' ? '待定' : '',
      是否入职: c.isHired ? '是' : '否',
      入职时间: c.hiredDate ? new Date(c.hiredDate).toLocaleString('zh-CN') : '',
    }));

    // 添加工作表
    const ws = XLSX.utils.json_to_sheet(exportData);
    XLSX.utils.book_append_sheet(wb, ws, '传统面试数据');
  };

  // 导出全AI面试数据
  const exportAiData = async (wb: any, XLSX: typeof import("xlsx")) => {
    const aiRecords = await fetchAiInterviewRecords(selectedYear, selectedMonth);

    // 转换数据格式
    const exportData = aiRecords.map((record: any) => {
      const evalData = record.evaluation;
      const rec = evalData?.recommendation === 'consider' ? '考虑录用' :
                  evalData?.recommendation === 'reject' ? '不建议录用' : '未知';

      return {
        '面试ID': record.interviewId,
        '候选人姓名': record.candidateName,
        '应聘岗位': record.position,
        '完成时间': record.completedAt ? new Date(record.completedAt).toLocaleString('zh-CN') : '',
        '综合得分': evalData?.overallScore5 || 0,
        '是否淘汰': evalData?.isEliminated ? '是' : '否',
        '淘汰原因': evalData?.eliminationReason || '',
        '推荐状态': rec,
        '优势': evalData?.strengths?.join('; ') || '',
        '改进建议': evalData?.improvements?.join('; ') || '',
        '评估摘要': evalData?.summary || '',
      };
    });

    // 添加工作表
    const ws = XLSX.utils.json_to_sheet(exportData);
    XLSX.utils.book_append_sheet(wb, ws, '全AI面试数据');
  };

  // 导出当前月份的数据（主函数）
  const exportMonthlyData = async (exportType: 'traditional' | 'ai' | 'both') => {
    const XLSX = await import("xlsx");
    // 创建工作簿
    const wb = XLSX.utils.book_new();

    // 根据类型导出数据
    if (exportType === 'traditional' || exportType === 'both') {
      exportTraditionalData(wb, XLSX);
    }

    if (exportType === 'ai' || exportType === 'both') {
      await exportAiData(wb, XLSX);
    }

    // 下载文件
    const fileName = `面试数据_${selectedYear}年${selectedMonth}月.xlsx`;
    XLSX.writeFile(wb, fileName);
    console.log('[导出] 导出成功:', fileName);
  };

  // 处理导出选项
  const handleExport = async (exportType: 'traditional' | 'ai' | 'both') => {
    setIsExportDialogOpen(false);
    await exportMonthlyData(exportType);
  };

  // 判断候选人是否属于选中月份
  const isCandidateInMonth = (candidate: any, year: number, month: number) => {
    // 情况1：待初试（初始）- 本月添加，但还没有设置初试时间
    if (candidate.interviewStage === 'pending' && !candidate.initialInterviewTime) {
      if (candidate.createdAt) {
        const createdDate = new Date(candidate.createdAt);
        if (createdDate.getFullYear() === year && (createdDate.getMonth() + 1) === month) {
          return true;
        }
      }
    }

    // 情况2：已设置初试、复试或终试时间
    if (candidate.initialInterviewTime) {
      const initialDate = new Date(candidate.initialInterviewTime);
      if (initialDate.getFullYear() === year && (initialDate.getMonth() + 1) === month) {
        return true;
      }
    }

    if (candidate.secondInterviewTime) {
      const secondDate = new Date(candidate.secondInterviewTime);
      if (secondDate.getFullYear() === year && (secondDate.getMonth() + 1) === month) {
        return true;
      }
    }

    if (candidate.finalInterviewTime) {
      const finalDate = new Date(candidate.finalInterviewTime);
      if (finalDate.getFullYear() === year && (finalDate.getMonth() + 1) === month) {
        return true;
      }
    }

    return false;
  };

  const refreshData = useCallback(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const stored = localStorage.getItem('candidates');
    if (!stored) {
      setCandidates([]);
      updateStatistics([], selectedYear, selectedMonth);
      return;
    }

    try {
      const candidatesData = JSON.parse(stored);
      setCandidates(candidatesData);
      updateStatistics(candidatesData, selectedYear, selectedMonth);
    } catch (error) {
      console.error('[Dashboard] 解析 candidates 缓存失败:', error);
    }
  }, [selectedMonth, selectedYear]);

  // 从 localStorage 加载候选人数据并统计面试阶段
  useEffect(() => {
    refreshData();
  }, [refreshData]);

  // 监听 localStorage 变化，实现实时更新
  useEffect(() => {
    const handleStorageChange = (event?: StorageEvent) => {
      if (event && event.key && event.key !== 'candidates') {
        return;
      }
      refreshData();
    };

    // 监听自定义事件（同标签页内）
    const handleCandidatesUpdate = () => {
      refreshData();
    };

    window.addEventListener('storage', handleStorageChange);
    window.addEventListener('candidatesUpdated', handleCandidatesUpdate);

    return () => {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('candidatesUpdated', handleCandidatesUpdate);
    };
  }, [refreshData]);

  // 注意：必须在所有 Hooks 声明完成后再做条件渲染，避免 Hook 顺序变化
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-12 w-12 animate-spin mx-auto mb-4 text-blue-600" />
          <p className="text-gray-600">加载中...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-12 w-12 animate-spin mx-auto mb-4 text-blue-600" />
          <p className="text-gray-600">跳转到登录页...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">仪表盘</h1>
          <p className="mt-2 text-gray-600">欢迎回来，查看面试概览</p>
        </div>
        <div className="flex items-center gap-4">
          {/* 快速选择按钮 */}
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleQuickSelect('thisMonth')}
            >
              本月
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleQuickSelect('lastMonth')}
            >
              上月
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleQuickSelect('lastMonthSameDay')}
            >
              上月同日
            </Button>
          </div>
          
          {/* 年月选择器 */}
          <div className="flex items-center gap-2 bg-white border rounded-lg p-2 shadow-sm">
            <Calendar className="h-4 w-4 text-gray-500" />
            <ClientOnly>
              <Select
                value={selectedYear.toString()}
                onValueChange={(value) => setSelectedYear(parseInt(value))}
              >
                <SelectTrigger className="w-24">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 5 }, (_, i) => {
                    const year = new Date().getFullYear() - 2 + i;
                    return (
                      <SelectItem key={year} value={year.toString()}>
                        {year}年
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </ClientOnly>
            <ClientOnly>
              <Select
                value={selectedMonth.toString()}
                onValueChange={(value) => setSelectedMonth(parseInt(value))}
              >
                <SelectTrigger className="w-20">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 12 }, (_, i) => {
                    const month = i + 1;
                    return (
                      <SelectItem key={month} value={month.toString()}>
                        {month}月
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </ClientOnly>
          </div>

          {/* 功能按钮 */}
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                console.log('[月度对比] 点击前:', { showComparison, lastMonthStats });
                setShowComparison(!showComparison);
                console.log('[月度对比] 点击后:', { showComparison: !showComparison, lastMonthStats });
              }}
            >
              <BarChart3 className="h-4 w-4 mr-2" />
              月度对比
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsExportDialogOpen(true)}
            >
              <Download className="h-4 w-4 mr-2" />
              导出数据
            </Button>
          </div>

          <Button
            variant="outline"
            onClick={logout}
          >
            退出登录
          </Button>
        </div>
      </div>

      {/* 统计卡片 */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        <Card
          className="cursor-pointer hover:shadow-lg transition-all hover:border-primary"
          onClick={() => {
            setCandidatesFilterType('all');
            setIsCandidatesDialogOpen(true);
          }}
        >
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">候选人总数</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{monthlyCandidateCount}</div>
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              点击查看详情 <ChevronRight className="h-3 w-3" />
            </p>
          </CardContent>
        </Card>

        <Card
          className="cursor-pointer hover:shadow-lg transition-all hover:border-primary"
          onClick={() => setIsInterviewDialogOpen(true)}
        >
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">待面试</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {interviewStats.initial + interviewStats.second + interviewStats.final}
            </div>
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              点击查看详情 <ChevronRight className="h-3 w-3" />
            </p>
          </CardContent>
        </Card>

        <Card
          className="cursor-pointer hover:shadow-lg transition-all hover:border-primary"
          onClick={() => {
            setCandidatesFilterType('offer');
            setIsCandidatesDialogOpen(true);
          }}
        >
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">待入职</CardTitle>
            <FileCheck className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{interviewStats.offer}</div>
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              点击查看详情 <ChevronRight className="h-3 w-3" />
            </p>
            {interviewStats.rejectedOffer > 0 && (
              <div
                className="mt-2 pt-2 border-t"
                onClick={(e) => {
                  e.stopPropagation();
                  // 设置过滤类型为拒绝入职并打开对话框
                  setCandidatesFilterType('rejectedOffer');
                  setIsCandidatesDialogOpen(true);
                }}
              >
                <p className="text-xs text-orange-600 hover:text-orange-700 cursor-pointer flex items-center gap-1">
                  <span className="font-semibold">{interviewStats.rejectedOffer}</span> 人拒绝入职
                  <ChevronRight className="h-3 w-3" />
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card
          className="cursor-pointer hover:shadow-lg transition-all hover:border-primary"
          onClick={() => {
            setCandidatesFilterType('hired');
            setIsCandidatesDialogOpen(true);
          }}
        >
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">入职</CardTitle>
            <UserCheck className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{hiredCount}</div>
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              点击查看详情 <ChevronRight className="h-3 w-3" />
            </p>
          </CardContent>
        </Card>

        {/* 全AI面试记录 */}
        <Card
          className="cursor-pointer hover:shadow-lg transition-all hover:border-primary"
          onClick={() => window.location.href = '/full-ai-interview-records'}
        >
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">全AI面试记录</CardTitle>
            <Video className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              <Video className="h-5 w-5 inline-block" />
            </div>
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              点击查看记录 <ChevronRight className="h-3 w-3" />
            </p>
          </CardContent>
        </Card>

        {/* 全AI面试统计 */}
        <Card
          className="cursor-pointer hover:shadow-lg transition-all hover:border-primary"
          onClick={() => window.location.href = '/full-ai-interview-statistics'}
        >
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">全AI面试统计</CardTitle>
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              <BarChart3 className="h-5 w-5 inline-block" />
            </div>
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              查看统计数据 <ChevronRight className="h-3 w-3" />
            </p>
          </CardContent>
        </Card>
      </div>

      {/* 近期面试 */}
      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>今日面试安排</CardTitle>
            <CardDescription>查看今天的面试时间表</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {(() => {
                // 获取今天的本地日期字符串（格式：YYYY-MM-DD）
                const now = new Date();
                const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

                // 筛选今天的待面试候选人（initial/second/final 阶段且有面试时间且面试时间是今天）
                const pendingInterviews = candidates
                  .filter((c) => {
                    // 检查是否有面试时间
                    let interviewTime = '';
                    if (c.interviewStage === 'initial' && c.initialInterviewTime) {
                      interviewTime = c.initialInterviewTime;
                    } else if (c.interviewStage === 'second' && c.secondInterviewTime) {
                      interviewTime = c.secondInterviewTime;
                    } else if (c.interviewStage === 'final' && c.finalInterviewTime) {
                      interviewTime = c.finalInterviewTime;
                    }

                    // 只筛选面试时间是今天的候选人
                    if (!interviewTime) return false;
                    return interviewTime.split('T')[0] === today;
                  })
                  .map((c) => {
                    // 获取当前阶段的面试时间
                    let interviewTime = '';
                    if (c.interviewStage === 'initial' && c.initialInterviewTime) {
                      interviewTime = c.initialInterviewTime;
                    } else if (c.interviewStage === 'second' && c.secondInterviewTime) {
                      interviewTime = c.secondInterviewTime;
                    } else if (c.interviewStage === 'final' && c.finalInterviewTime) {
                      interviewTime = c.finalInterviewTime;
                    }
                    return { ...c, interviewTime };
                  })
                  .sort((a, b) => new Date(a.interviewTime).getTime() - new Date(b.interviewTime).getTime());

                if (pendingInterviews.length === 0) {
                  return (
                    <div className="text-center py-8 text-gray-500">
                      今天暂无面试安排
                    </div>
                  );
                }

                return pendingInterviews.map((candidate) => {
                  const stageInfo = interviewStageMap[candidate.interviewStage as keyof typeof interviewStageMap];
                  const interviewDate = new Date(candidate.interviewTime);
                  const timeStr = interviewDate.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });

                  return (
                    <div key={`${candidate.id}-${candidate.interviewStage}-${candidate.interviewTime}`} className="flex items-center justify-between border-b pb-3 last:border-0">
                      <div className="flex items-center gap-4">
                        <div className={`w-20 text-sm font-medium text-primary`}>
                          {timeStr}
                        </div>
                        <div>
                          <div className="font-medium">{candidate.name}</div>
                          <div className="text-sm text-gray-500">{candidate.position}</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="default" className="bg-primary text-primary-foreground">
                          今天
                        </Badge>
                        <Badge
                          variant={stageInfo.variant}
                          className={stageInfo.color || ""}
                        >
                          {stageInfo.label}
                        </Badge>
                      </div>
                    </div>
                  );
                });
              })()}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>面试统计</CardTitle>
            <CardDescription>{selectedYear}年{selectedMonth}月面试数据分析</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="h-3 w-3 rounded-full bg-blue-500" />
                  <span className="text-sm">通过复试</span>
                </div>
                <span className="font-semibold">{interviewRate.secondPass}%</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div className="bg-blue-500 h-2 rounded-full transition-all duration-500" style={{ width: `${interviewRate.secondPass}%` }} />
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="h-3 w-3 rounded-full bg-green-500" />
                  <span className="text-sm">一面通过</span>
                </div>
                <span className="font-semibold">{interviewRate.initialPass}%</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div className="bg-green-500 h-2 rounded-full transition-all duration-500" style={{ width: `${interviewRate.initialPass}%` }} />
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="h-3 w-3 rounded-full bg-red-500" />
                  <span className="text-sm">未通过</span>
                </div>
                <span className="font-semibold">{interviewRate.fail}%</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div className="bg-red-500 h-2 rounded-full transition-all duration-500" style={{ width: `${interviewRate.fail}%` }} />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* 月度对比卡片 */}
        {showComparison && lastMonthStats && (
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>月度对比</CardTitle>
              <CardDescription>
                {selectedYear}年{selectedMonth}月 vs 
                {(() => {
                  const lastMonthDate = new Date(selectedYear, selectedMonth - 2, 1);
                  return `${lastMonthDate.getFullYear()}年${lastMonthDate.getMonth() + 1}月`;
                })()}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {/* 候选人总数对比 */}
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="text-sm text-gray-600 mb-1">候选人总数</div>
                    <div className="flex items-center gap-4">
                      <div>
                        <div className="text-xs text-gray-500">本月</div>
                        <div className="text-xl font-bold text-blue-600">{monthlyCandidateCount}</div>
                      </div>
                      <div>
                        <div className="text-xs text-gray-500">上月</div>
                        <div className="text-xl font-bold text-gray-600">{lastMonthStats.monthlyCount}</div>
                      </div>
                      <div className={`text-sm font-medium ${
                        monthlyCandidateCount >= lastMonthStats.monthlyCount ? 'text-green-600' : 'text-red-600'
                      }`}>
                        {(() => {
                          const diff = monthlyCandidateCount - lastMonthStats.monthlyCount;
                          const percent = lastMonthStats.monthlyCount > 0 
                            ? Math.round((diff / lastMonthStats.monthlyCount) * 100) 
                            : 0;
                          return `${diff >= 0 ? '+' : ''}${diff} (${diff >= 0 ? '+' : ''}${percent}%)`;
                        })()}
                      </div>
                    </div>
                  </div>
                </div>

                {/* 入职人数对比 */}
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="text-sm text-gray-600 mb-1">入职人数</div>
                    <div className="flex items-center gap-4">
                      <div>
                        <div className="text-xs text-gray-500">本月</div>
                        <div className="text-xl font-bold text-green-600">{hiredCount}</div>
                      </div>
                      <div>
                        <div className="text-xs text-gray-500">上月</div>
                        <div className="text-xl font-bold text-gray-600">{lastMonthStats.hired}</div>
                      </div>
                      <div className={`text-sm font-medium ${
                        hiredCount >= lastMonthStats.hired ? 'text-green-600' : 'text-red-600'
                      }`}>
                        {(() => {
                          const diff = hiredCount - lastMonthStats.hired;
                          const percent = lastMonthStats.hired > 0 
                            ? Math.round((diff / lastMonthStats.hired) * 100) 
                            : 0;
                          return `${diff >= 0 ? '+' : ''}${diff} (${diff >= 0 ? '+' : ''}${percent}%)`;
                        })()}
                      </div>
                    </div>
                  </div>
                </div>

                {/* 初试通过率对比 */}
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="text-sm text-gray-600 mb-1">初试通过率</div>
                    <div className="flex items-center gap-4">
                      <div>
                        <div className="text-xs text-gray-500">本月</div>
                        <div className="text-xl font-bold text-green-600">{interviewRate.initialPass}%</div>
                      </div>
                      <div>
                        <div className="text-xs text-gray-500">上月</div>
                        <div className="text-xl font-bold text-gray-600">
                          {(() => {
                            const lastMonthRate = lastMonthStats.totalInterviewed > 0
                              ? Math.round((lastMonthStats.initialPassed / lastMonthStats.totalInterviewed) * 100)
                              : 0;
                            return `${lastMonthRate}%`;
                          })()}
                        </div>
                      </div>
                      <div className={`text-sm font-medium ${
                        interviewRate.initialPass >= (lastMonthStats.totalInterviewed > 0
                          ? Math.round((lastMonthStats.initialPassed / lastMonthStats.totalInterviewed) * 100)
                          : 0) ? 'text-green-600' : 'text-red-600'
                      }`}>
                        {(() => {
                          const currentRate = interviewRate.initialPass;
                          const lastMonthRate = lastMonthStats.totalInterviewed > 0
                            ? Math.round((lastMonthStats.initialPassed / lastMonthStats.totalInterviewed) * 100)
                            : 0;
                          const diff = currentRate - lastMonthRate;
                          return `${diff >= 0 ? '+' : ''}${diff}%`;
                        })()}
                      </div>
                    </div>
                  </div>
                </div>

                {/* 复试通过率对比 */}
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="text-sm text-gray-600 mb-1">复试通过率</div>
                    <div className="flex items-center gap-4">
                      <div>
                        <div className="text-xs text-gray-500">本月</div>
                        <div className="text-xl font-bold text-blue-600">{interviewRate.secondPass}%</div>
                      </div>
                      <div>
                        <div className="text-xs text-gray-500">上月</div>
                        <div className="text-xl font-bold text-gray-600">
                          {(() => {
                            const lastMonthRate = lastMonthStats.initialPassed > 0 
                              ? Math.round((lastMonthStats.secondPassed / lastMonthStats.initialPassed) * 100) 
                              : 0;
                            return `${lastMonthRate}%`;
                          })()}
                        </div>
                      </div>
                      <div className={`text-sm font-medium ${
                        interviewRate.secondPass >= (lastMonthStats.initialPassed > 0 
                          ? Math.round((lastMonthStats.secondPassed / lastMonthStats.initialPassed) * 100) 
                          : 0) ? 'text-green-600' : 'text-red-600'
                      }`}>
                        {(() => {
                          const currentRate = interviewRate.secondPass;
                          const lastMonthRate = lastMonthStats.initialPassed > 0 
                            ? Math.round((lastMonthStats.secondPassed / lastMonthStats.initialPassed) * 100) 
                            : 0;
                          const diff = currentRate - lastMonthRate;
                          return `${diff >= 0 ? '+' : ''}${diff}%`;
                        })()}
                      </div>
                    </div>
                  </div>
                </div>

                {/* 终试通过率对比 */}
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="text-sm text-gray-600 mb-1">终试通过率</div>
                    <div className="flex items-center gap-4">
                      <div>
                        <div className="text-xs text-gray-500">本月</div>
                        <div className="text-xl font-bold text-purple-600">{interviewRate.finalPass}%</div>
                      </div>
                      <div>
                        <div className="text-xs text-gray-500">上月</div>
                        <div className="text-xl font-bold text-gray-600">
                          {(() => {
                            const lastMonthRate = lastMonthStats.secondPassed > 0
                              ? Math.round((lastMonthStats.finalPassed / lastMonthStats.secondPassed) * 100)
                              : 0;
                            return `${lastMonthRate}%`;
                          })()}
                        </div>
                      </div>
                      <div className={`text-sm font-medium ${
                        interviewRate.finalPass >= (lastMonthStats.secondPassed > 0
                          ? Math.round((lastMonthStats.finalPassed / lastMonthStats.secondPassed) * 100)
                          : 0) ? 'text-green-600' : 'text-red-600'
                      }`}>
                        {(() => {
                          const currentRate = interviewRate.finalPass;
                          const lastMonthRate = lastMonthStats.secondPassed > 0
                            ? Math.round((lastMonthStats.finalPassed / lastMonthStats.secondPassed) * 100)
                            : 0;
                          const diff = currentRate - lastMonthRate;
                          return `${diff >= 0 ? '+' : ''}${diff}%`;
                        })()}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* 面试阶段统计详情对话框 */}
      <Dialog open={isInterviewDialogOpen} onOpenChange={setIsInterviewDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>待面试详情</DialogTitle>
            <DialogDescription>按面试阶段统计的候选人数量</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex items-center justify-between p-4 bg-blue-50 rounded-lg">
              <div className="flex items-center gap-3">
                <div className="h-3 w-3 rounded-full bg-blue-500" />
                <span className="font-medium">待初试</span>
              </div>
              <Badge variant="default" className="text-lg px-4 py-1">
                {interviewStats.initial}
              </Badge>
            </div>

            <div className="flex items-center justify-between p-4 bg-orange-100 rounded-lg">
              <div className="flex items-center gap-3">
                <div className="h-3 w-3 rounded-full bg-orange-600" />
                <span className="font-medium">待定</span>
              </div>
              <Badge variant="secondary" className="text-lg px-4 py-1 text-orange-600 bg-orange-50">
                {interviewStats.pendingInterview}
              </Badge>
            </div>

            <div className="flex items-center justify-between p-4 bg-orange-50 rounded-lg">
              <div className="flex items-center gap-3">
                <div className="h-3 w-3 rounded-full bg-orange-500" />
                <span className="font-medium">待复试</span>
              </div>
              <Badge variant="default" className="text-lg px-4 py-1">
                {interviewStats.second}
              </Badge>
            </div>

            <div className="flex items-center justify-between p-4 bg-purple-50 rounded-lg">
              <div className="flex items-center gap-3">
                <div className="h-3 w-3 rounded-full bg-purple-500" />
                <span className="font-medium">待终试</span>
              </div>
              <Badge variant="default" className="text-lg px-4 py-1">
                {interviewStats.final}
              </Badge>
            </div>

            <div className="flex items-center justify-between p-4 bg-blue-100 rounded-lg">
              <div className="flex items-center gap-3">
                <div className="h-3 w-3 rounded-full bg-blue-600" />
                <span className="font-medium">待入职</span>
              </div>
              <Badge variant="default" className="text-lg px-4 py-1">
                {interviewStats.offer}
              </Badge>
            </div>

            <div className="border-t pt-4 space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-600">待初试（初始）</span>
                <Badge variant="secondary">{interviewStats.pending}</Badge>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-600">待定</span>
                <Badge variant="secondary" className="bg-orange-100 text-orange-800">{interviewStats.pendingInterview}</Badge>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-600">已入职</span>
                <Badge variant="secondary" className="bg-green-100 text-green-800">{interviewStats.hired}</Badge>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-600">已淘汰</span>
                <Badge variant="secondary" className="bg-red-100 text-red-800">{interviewStats.rejected}</Badge>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* 候选人列表详情对话框 */}
      <Dialog open={isCandidatesDialogOpen} onOpenChange={setIsCandidatesDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>
              {candidatesFilterType === 'all' && `${selectedYear}年${selectedMonth}月候选人列表`}
              {candidatesFilterType === 'offer' && `${selectedYear}年${selectedMonth}月待入职候选人`}
              {candidatesFilterType === 'hired' && `${selectedYear}年${selectedMonth}月已入职候选人`}
              {candidatesFilterType === 'rejectedOffer' && `${selectedYear}年${selectedMonth}月拒绝入职候选人`}
            </DialogTitle>
            <DialogDescription>
              {candidatesFilterType === 'all' && `查看${selectedYear}年${selectedMonth}月的候选人及其当前面试阶段`}
              {candidatesFilterType === 'offer' && `查看${selectedYear}年${selectedMonth}月已通过终试、等待入职的候选人`}
              {candidatesFilterType === 'hired' && `查看${selectedYear}年${selectedMonth}月已成功入职的候选人`}
              {candidatesFilterType === 'rejectedOffer' && `查看${selectedYear}年${selectedMonth}月已拒绝入职的候选人`}
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto min-h-0">
            {(() => {
              // 根据筛选类型过滤候选人，并只显示选中月份的候选人
              const filteredCandidates = candidates.filter((candidate) => {
                // 首先筛选是否属于选中月份
                if (!isCandidateInMonth(candidate, selectedYear, selectedMonth)) {
                  return false;
                }
                
                // 然后根据类型筛选
                if (candidatesFilterType === 'all') return true;
                if (candidatesFilterType === 'offer') return candidate.interviewStage === 'offer';
                if (candidatesFilterType === 'hired') return candidate.isHired === true;
                if (candidatesFilterType === 'rejectedOffer') return candidate.interviewStage === 'rejectedOffer';
                return true;
              });

              if (filteredCandidates.length === 0) {
                return (
                  <div className="text-center py-8 text-gray-500">
                    {candidatesFilterType === 'all' && '暂无候选人数据'}
                    {candidatesFilterType === 'offer' && '暂无待入职候选人'}
                    {candidatesFilterType === 'hired' && '暂无已入职候选人'}
                    {candidatesFilterType === 'rejectedOffer' && '暂无拒绝入职候选人'}
                  </div>
                );
              }

              return (
                <div className="space-y-3">
                  {filteredCandidates.map((candidate) => {
                    const stageInfo = interviewStageMap[candidate.interviewStage as keyof typeof interviewStageMap] || interviewStageMap.pending;

                    // 检查是否待定
                    const isPending = candidate.initialInterviewPassed === 'pending' ||
                                     candidate.secondInterviewPassed === 'pending' ||
                                     candidate.finalInterviewPassed === 'pending';

                    return (
                      <div
                        key={`${candidate.id}-${candidate.interviewStage}-${candidate.createdAt}`}
                        className="flex items-center justify-between p-4 border rounded-lg hover:bg-gray-50 transition-colors"
                      >
                        <div className="flex-1">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-semibold">
                              {candidate.name.charAt(0)}
                            </div>
                            <div>
                              <div className="font-semibold">{candidate.name}</div>
                              <div className="text-sm text-gray-500">{candidate.position}</div>
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-4">
                          {candidate.resumeUploaded && (
                            <div className="flex items-center gap-1 text-sm text-gray-500">
                              <FileText className="h-4 w-4" />
                              <span>简历</span>
                            </div>
                          )}
                          <Badge
                            variant={stageInfo.variant}
                            className={stageInfo.color || ""}
                          >
                            {stageInfo.label}
                          </Badge>
                          {isPending && (
                            <Badge variant="secondary" className="text-orange-600 bg-orange-50">
                              待定
                            </Badge>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })()}
          </div>
        </DialogContent>
      </Dialog>

      {/* 导出选项对话框 */}
      <Dialog open={isExportDialogOpen} onOpenChange={setIsExportDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Download className="h-5 w-5" />
              选择导出类型
            </DialogTitle>
            <DialogDescription>
              请选择要导出的数据类型
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <Button
              variant="outline"
              className="w-full h-auto py-6 flex flex-col items-center gap-2"
              onClick={() => handleExport('traditional')}
            >
              <UserCheck className="h-8 w-8" />
              <span className="text-center">
                <span className="block font-semibold">传统面试数据</span>
                <span className="block text-sm text-muted-foreground">
                  导出传统面试的候选人数据（初试、复试、终试）
                </span>
              </span>
            </Button>

            <Button
              variant="outline"
              className="w-full h-auto py-6 flex flex-col items-center gap-2"
              onClick={() => handleExport('ai')}
            >
              <Video className="h-8 w-8" />
              <span className="text-center">
                <span className="block font-semibold">全AI面试数据</span>
                <span className="block text-sm text-muted-foreground">
                  导出全AI面试的记录和评估报告
                </span>
              </span>
            </Button>

            <Button
              variant="default"
              className="w-full h-auto py-6 flex flex-col items-center gap-2"
              onClick={() => handleExport('both')}
            >
              <FileCheck className="h-8 w-8" />
              <span className="text-center">
                <span className="block font-semibold">全部数据</span>
                <span className="block text-sm text-muted-foreground">
                  同时导出传统面试和全AI面试数据
                </span>
              </span>
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
