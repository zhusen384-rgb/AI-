"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { ClientOnly } from "@/components/ui/client-only";
import { Calendar, Filter, Video, Star, User, Clock, ChevronRight, CheckCircle, XCircle, ArrowLeft, Download, Search, X } from "lucide-react";
import { useAuth } from "@/lib/auth-provider";
import { useRouter } from "next/navigation";
import { fetchClientJson } from "@/lib/client-api";

interface Evaluation {
  isEliminated: boolean;
  eliminationReason: string | null;
  overallScore5: number;
  overallScore100: number;
  categoryScores: Record<string, { score: number; basis: string }>;
  categoryLabels: Record<string, string>;
  summary: string;
  strengths: string[];
  improvements: string[];
  recommendation: "hire" | "consider" | "reject";
}

interface InterviewRecord {
  id: string;
  linkId: string;
  interviewId: string;
  candidateName: string;
  position: string;
  evaluation: Evaluation;
  recordingKey: string;
  recordingUrl: string;
  completedAt: string;
  createdAt: string;
}

interface CategoryScore {
  score: number;
  basis: string;
}

interface ApiResponse<T> {
  success: boolean;
  data: T;
  error?: string;
  total?: number;
}

const recommendationMap = {
  hire: {
    label: "建议录用",
    variant: "default" as const,
    color: "bg-blue-600",
    icon: CheckCircle,
  },
  consider: {
    label: "考虑录用",
    variant: "secondary" as const,
    color: "bg-green-600",
    icon: CheckCircle,
  },
  reject: {
    label: "不建议录用",
    variant: "destructive" as const,
    color: "bg-red-600",
    icon: XCircle,
  },
};

export default function FullAiInterviewRecordsPage() {
  const router = useRouter();
  const { user } = useAuth(); // 获取当前用户

  // 年月日选择器状态
  const [selectedYear, setSelectedYear] = useState(() => {
    const now = new Date();
    return now.getFullYear();
  });
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date();
    return now.getMonth() + 1; // 1-12
  });
  const [selectedDay, setSelectedDay] = useState<string>("all"); // "all" 表示不筛选日，或 "1"-"31"

  // 录用状态筛选
  const [selectedRecommendation, setSelectedRecommendation] = useState<string>("all");

  // 搜索关键词
  const [searchKeyword, setSearchKeyword] = useState<string>("");

  // 用户筛选
  const [selectedUserId, setSelectedUserId] = useState<string>("all");
  const [usersList, setUsersList] = useState<{id: string; name: string; username: string}[]>([]);

  // 数据状态
  const [records, setRecords] = useState<InterviewRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [totalCount, setTotalCount] = useState(0);
  const currentSearchKeywordRef = useRef(searchKeyword);
  const previousSearchKeywordRef = useRef(searchKeyword);
  currentSearchKeywordRef.current = searchKeyword;

  // 获取用户列表（用于筛选）
  useEffect(() => {
    const fetchUsersList = async () => {
      try {
        const data = await fetchClientJson<ApiResponse<{id: string; name: string; username: string}[]>>('/api/admin/users-list');
        if (data.success) {
          setUsersList(data.data);
        }
      } catch (error) {
        console.error('获取用户列表失败:', error);
      }
    };

    if (user?.role === 'super_admin') {
      const timer = window.setTimeout(() => {
        void fetchUsersList();
      }, 0);

      return () => window.clearTimeout(timer);
    }
  }, [user]);

  const loadRecords = useCallback(async (keyword: string) => {
    try {
      setLoading(true);
      const params = new URLSearchParams({
        year: selectedYear.toString(),
        month: selectedMonth.toString(),
        recommendation: selectedRecommendation,
      });

      // 添加日筛选参数
      if (selectedDay !== "all") {
        params.append('day', selectedDay);
      }

      // 添加搜索参数
      const trimmedKeyword = keyword.trim();
      if (trimmedKeyword) {
        params.append('search', trimmedKeyword);
      }

      // 添加用户筛选参数（仅超级管理员可用）
      if (selectedUserId !== "all") {
        params.append('userId', selectedUserId);
      }

      const result = await fetchClientJson<ApiResponse<InterviewRecord[]>>(`/api/full-ai-interview/records?${params}`);

      if (result.success) {
        setRecords(result.data);
        setTotalCount(result.total ?? result.data.length);
      } else {
        console.error("加载面试记录失败:", result.error);
      }
    } catch (error) {
      console.error("加载面试记录失败:", error);
    } finally {
      setLoading(false);
    }
  }, [selectedDay, selectedMonth, selectedRecommendation, selectedUserId, selectedYear]);

  // 加载面试记录
  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadRecords(currentSearchKeywordRef.current);
    }, 0);

    return () => window.clearTimeout(timer);
  }, [loadRecords]);

  // 搜索防抖
  useEffect(() => {
    if (previousSearchKeywordRef.current === searchKeyword) {
      return;
    }

    previousSearchKeywordRef.current = searchKeyword;
    const debounceTimer = window.setTimeout(() => {
      void loadRecords(searchKeyword);
    }, 300);

    return () => window.clearTimeout(debounceTimer);
  }, [loadRecords, searchKeyword]);

  // 格式化日期
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  // 导出数据
  const handleExportData = async () => {
    if (records.length === 0) {
      alert("暂无数据可导出");
      return;
    }

    try {
      const XLSX = await import("xlsx");
      // 转换数据格式
      const exportData = records.map((record) => {
        const evalData = record.evaluation;
        const rec = evalData?.recommendation === 'hire' ? '建议录用' :
                    evalData?.recommendation === 'consider' ? '考虑录用' : 
                    evalData?.recommendation === 'reject' ? '不建议录用' : '未知';

        return {
          '面试ID': record.interviewId,
          '候选人姓名': record.candidateName,
          '应聘岗位': record.position,
          '完成时间': formatDate(record.completedAt),
          '综合得分': evalData?.overallScore5 || 0,
          '是否淘汰': evalData?.isEliminated ? '是' : '否',
          '淘汰原因': evalData?.eliminationReason || '',
          '推荐状态': rec,
          '优势': evalData?.strengths?.join('; ') || '',
          '改进建议': evalData?.improvements?.join('; ') || '',
          '评估摘要': evalData?.summary || '',
        };
      });

      // 创建工作簿
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.json_to_sheet(exportData);

      // 设置列宽
      const colWidths = [
        { wch: 20 },  // 面试ID
        { wch: 15 },  // 候选人姓名
        { wch: 20 },  // 应聘岗位
        { wch: 25 },  // 完成时间
        { wch: 10 },  // 综合得分（五分制）
        { wch: 12 },  // 是否淘汰
        { wch: 30 },  // 淘汰原因
        { wch: 12 },  // 推荐状态
        { wch: 50 },  // 优势
        { wch: 50 },  // 改进建议
        { wch: 60 },  // 评估摘要
      ];
      ws['!cols'] = colWidths;

      // 添加工作表到工作簿
      XLSX.utils.book_append_sheet(wb, ws, "面试记录");

      // 生成文件名
      const dateStr = selectedDay === "all" 
        ? `${selectedYear}年${selectedMonth}月` 
        : `${selectedYear}年${selectedMonth}月${selectedDay}日`;
      const fileName = `全AI面试记录_${dateStr}.xlsx`;

      // 导出文件
      XLSX.writeFile(wb, fileName);

      console.log('[导出] 导出成功:', fileName);
    } catch (error) {
      console.error('[导出] 导出失败:', error);
      alert("导出失败，请稍后重试");
    }
  };

  // 返回上一页
  const handleGoBack = () => {
    router.back();
  };

  // 获取推荐状态显示
  const getRecommendationDisplay = (evaluation: Evaluation) => {
    const rec = evaluation?.recommendation || "consider";
    const map = recommendationMap[rec as keyof typeof recommendationMap];
    const Icon = map.icon;

    return (
      <Badge variant={map.variant} className={`${map.color} text-white`}>
        <Icon className="h-3 w-3 mr-1" />
        {map.label}
      </Badge>
    );
  };

  // 快速选择年月
  const handleQuickSelect = (type: 'thisMonth' | 'lastMonth' | 'today' | 'yesterday') => {
    const now = new Date();

    if (type === 'thisMonth') {
      setSelectedYear(now.getFullYear());
      setSelectedMonth(now.getMonth() + 1);
      setSelectedDay("all");
    } else if (type === 'lastMonth') {
      const lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      setSelectedYear(lastMonthDate.getFullYear());
      setSelectedMonth(lastMonthDate.getMonth() + 1);
      setSelectedDay("all");
    } else if (type === 'today') {
      setSelectedYear(now.getFullYear());
      setSelectedMonth(now.getMonth() + 1);
      setSelectedDay(now.getDate().toString());
    } else if (type === 'yesterday') {
      const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
      setSelectedYear(yesterday.getFullYear());
      setSelectedMonth(yesterday.getMonth() + 1);
      setSelectedDay(yesterday.getDate().toString());
    }
  };

  // 获取当月天数
  const getDaysInMonth = (year: number, month: number) => {
    return new Date(year, month, 0).getDate();
  };

  return (
    <div className="p-8">
      {/* 页面标题 */}
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">全AI面试记录</h1>
          <p className="mt-2 text-gray-600">查看和管理全AI面试的历史记录</p>
        </div>
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            onClick={handleGoBack}
            className="flex items-center gap-2"
          >
            <ArrowLeft className="h-4 w-4" />
            返回
          </Button>
          <Button
            variant="default"
            onClick={handleExportData}
            disabled={records.length === 0}
            className="flex items-center gap-2"
          >
            <Download className="h-4 w-4" />
            导出数据
          </Button>
        </div>
      </div>

      {/* 筛选区域 */}
      <ClientOnly fallback={
        <Card className="mb-6">
          <CardContent className="p-6">
            <div className="flex items-center justify-center">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-solid border-current border-r-transparent" />
            </div>
          </CardContent>
        </Card>
      }>
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Filter className="h-5 w-5" />
              筛选条件
            </CardTitle>
            <CardDescription>根据年月日和录用状态筛选面试记录</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap items-center gap-6">
              {/* 搜索框 */}
              <div className="flex items-center gap-3">
                <span className="text-sm font-medium text-gray-700">搜索:</span>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <Input
                    type="text"
                    placeholder="姓名/面试ID/会议ID"
                    value={searchKeyword}
                    onChange={(e) => setSearchKeyword(e.target.value)}
                    className="pl-10 pr-10 w-56"
                  />
                  {searchKeyword && (
                    <button
                      onClick={() => setSearchKeyword("")}
                      className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>

              {/* 年月日筛选器 */}
              <div className="flex items-center gap-3">
                <span className="text-sm font-medium text-gray-700">日期筛选:</span>
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
                    onClick={() => handleQuickSelect('today')}
                  >
                    今日
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleQuickSelect('yesterday')}
                  >
                    昨日
                  </Button>
                </div>
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
                      onValueChange={(value) => {
                        setSelectedMonth(parseInt(value));
                        // 切换月份时，如果当前选择的日期超出新月份的天数，重置为"全部"
                        const newMonth = parseInt(value);
                        const daysInNewMonth = getDaysInMonth(selectedYear, newMonth);
                        if (selectedDay !== "all" && parseInt(selectedDay) > daysInNewMonth) {
                          setSelectedDay("all");
                        }
                      }}
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
                  <ClientOnly>
                    <Select
                      value={selectedDay}
                      onValueChange={setSelectedDay}
                    >
                      <SelectTrigger className="w-20">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">全部</SelectItem>
                        {Array.from({ length: getDaysInMonth(selectedYear, selectedMonth) }, (_, i) => {
                          const day = i + 1;
                          return (
                            <SelectItem key={day} value={day.toString()}>
                              {day}日
                            </SelectItem>
                          );
                        })}
                      </SelectContent>
                    </Select>
                  </ClientOnly>
                </div>
              </div>

              {/* 录用状态筛选器 */}
              <div className="flex items-center gap-3">
                <span className="text-sm font-medium text-gray-700">录用状态:</span>
                <ClientOnly>
                  <Select
                    value={selectedRecommendation}
                    onValueChange={setSelectedRecommendation}
                  >
                    <SelectTrigger className="w-40">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">全部状态</SelectItem>
                      <SelectItem value="hire">建议录用</SelectItem>
                      <SelectItem value="consider">考虑录用</SelectItem>
                      <SelectItem value="reject">不建议录用</SelectItem>
                    </SelectContent>
                  </Select>
                </ClientOnly>
              </div>

              {/* 用户筛选器 - 仅超级管理员可见 */}
              {user?.role === 'super_admin' && usersList.length > 0 && (
                <div className="flex items-center gap-3">
                  <span className="text-sm font-medium text-gray-700">创建用户:</span>
                  <ClientOnly>
                    <Select
                      value={selectedUserId}
                      onValueChange={setSelectedUserId}
                    >
                      <SelectTrigger className="w-40">
                        <SelectValue placeholder="全部用户" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">全部用户</SelectItem>
                        {usersList.map((u) => (
                          <SelectItem key={u.id} value={u.id}>
                            {u.name || u.username}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </ClientOnly>
                </div>
              )}

              {/* 统计信息 */}
              <div className="flex items-center gap-3 ml-auto">
                <span className="text-sm text-gray-600">共找到</span>
                <Badge variant="default" className="text-lg px-3">
                  {totalCount}
                </Badge>
                <span className="text-sm text-gray-600">条记录</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </ClientOnly>

      {/* 记录列表 */}
      <div className="space-y-4">
        {loading ? (
          <div className="text-center py-12">
            <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-current border-r-transparent" />
            <p className="mt-4 text-gray-600">加载中...</p>
          </div>
        ) : records.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <div className="text-gray-400 mb-4">
                <Video className="h-16 w-16 mx-auto" />
              </div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">暂无记录</h3>
              <p className="text-gray-600">
                {selectedRecommendation !== 'all'
                  ? `${selectedDay === "all" ? `${selectedYear}年${selectedMonth}月` : `${selectedYear}年${selectedMonth}月${selectedDay}日`}没有符合条件的面试记录`
                  : `${selectedDay === "all" ? `${selectedYear}年${selectedMonth}月` : `${selectedYear}年${selectedMonth}月${selectedDay}日`}暂无全AI面试记录`
                }
              </p>
            </CardContent>
          </Card>
        ) : (
          records.map((record) => (
            <Card
              key={record.id}
              className="hover:shadow-lg transition-all cursor-pointer"
              onClick={() => router.push(`/full-ai-interview?interviewId=${record.interviewId || record.id}`)}
            >
              <CardContent className="p-6">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    {/* 候选人信息 */}
                    <div className="flex items-center gap-3 mb-3">
                      <div className="flex items-center gap-2">
                        <User className="h-5 w-5 text-gray-500" />
                        <h3 className="text-lg font-semibold text-gray-900">
                          {record.candidateName}
                        </h3>
                      </div>
                      <Badge variant="outline" className="text-blue-600 border-blue-600">
                        {record.position}
                      </Badge>
                    </div>

                    {/* 面试信息 */}
                    <div className="flex items-center gap-6 text-sm text-gray-600 mb-3">
                      <div className="flex items-center gap-2">
                        <Clock className="h-4 w-4" />
                        <span>完成时间: {formatDate(record.completedAt)}</span>
                      </div>
                      {record.evaluation?.overallScore5 !== undefined && (
                        <div className="flex items-center gap-2">
                          <Star className="h-4 w-4 text-yellow-500" />
                          <span className="font-medium">
                            综合得分: {record.evaluation.overallScore5}分 / {record.evaluation.overallScore100 || 0}分
                          </span>
                        </div>
                      )}
                    </div>

                    {/* 维度分数 */}
                    {record.evaluation?.categoryScores && Object.keys(record.evaluation.categoryScores).length > 0 && (
                      <div className="bg-gray-50 rounded-lg p-3 mb-3">
                        <div className="text-xs font-medium text-gray-700 mb-2">各维度评分</div>
                        <div className="grid grid-cols-2 gap-2">
                          {Object.entries(record.evaluation.categoryScores).map(([key, value]: [string, CategoryScore]) => {
                            // 维度中英文映射（作为fallback）
                            const dimensionLabels: Record<string, string> = {
                              // 智能体管培生岗位
                              activeLearning: "主动学习能力",
                              practicalApplication: "实操与AI工具应用能力",
                              frontlineCommunication: "一线落地与沟通协作能力",
                              reflectionProblemSolving: "反思复盘与问题解决能力",
                              expressionSharing: "表达与知识分享能力",
                              technicalFoundation: "技术基础能力",
                              // 通用岗位
                              communication: "沟通表达与亲和力",
                              learning: "学习意愿与适配能力",
                              execution: "目标感与执行力",
                              resilience: "抗压与抗挫折能力",
                              customerSensitivity: "客户需求敏感度",
                            };
                            // 优先使用 evaluation 中的 categoryLabels，其次使用维度映射，最后使用原始key
                            const label = record.evaluation?.categoryLabels?.[key] || dimensionLabels[key] || key;
                            const score = value?.score || 0;
                            return (
                              <div key={key} className="flex items-center justify-between text-xs">
                                <span className="text-gray-600">{label}</span>
                                <span className={`font-medium ${score >= 4 ? 'text-green-600' : score >= 3 ? 'text-blue-600' : 'text-orange-600'}`}>
                                  {score}分
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* 推荐状态 */}
                    <div className="mt-3">
                      {getRecommendationDisplay(record.evaluation)}
                    </div>
                  </div>

                  {/* 操作按钮 */}
                  <div className="flex items-center gap-2">
                    <Button variant="ghost" size="icon">
                      <ChevronRight className="h-5 w-5" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
