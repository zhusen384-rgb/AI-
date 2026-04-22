"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar, Clock, User, Link as LinkIcon, Video, Search, RefreshCw, FileText, CheckCircle, XCircle, ArrowLeft, Trash2, AlertTriangle, type LucideIcon } from "lucide-react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { fetchClientJson } from "@/lib/client-api";
import { copyTextToClipboard } from "@/lib/clipboard";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface InterviewStatistics {
  id: number;
  linkId: string;
  interviewId: string;
  candidateName: string;
  position: string;
  mode: string;
  interviewTime: string;
  meetingLink: string;
  meetingId: string;
  status: string;
  createdAt: string;
  evaluation: {
    isEliminated?: boolean;
    overallScore5?: number;
    overallScore100?: number;
    categoryScores?: Record<string, { score: number; basis: string }>;
    categoryLabels?: Record<string, string>;
  } | null;
  completedAt: string | null;
}

interface CategoryScore {
  score: number;
  basis: string;
}

interface ApiResponse<T> {
  success: boolean;
  data: T;
  error?: string;
  message?: string;
}

const modeLabels: Record<string, string> = {
  junior: "初级岗位",
  senior: "中级岗位",
  expert: "高级岗位",
};

const positionLabels: Record<string, string> = {
  hr: "人事",
  ai_management: "智能体管培生",
};

const statusConfig: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline"; icon: LucideIcon }> = {
  in_progress: {
    label: "进行中",
    variant: "secondary",
    icon: Clock,
  },
  completed: {
    label: "已完成",
    variant: "outline",
    icon: CheckCircle,
  },
  cancelled: {
    label: "已取消",
    variant: "destructive",
    icon: XCircle,
  },
};

export default function FullAiInterviewStatisticsPage() {
  const router = useRouter();
  const [statistics, setStatistics] = useState<InterviewStatistics[]>([]);
  const [filteredStatistics, setFilteredStatistics] = useState<InterviewStatistics[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [positionFilter, setPositionFilter] = useState<string>("all");
  const [yearFilter, setYearFilter] = useState<string>("all");
  const [monthFilter, setMonthFilter] = useState<string>("all");
  const [dayFilter, setDayFilter] = useState<string>("all");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // 获取统计列表
  const fetchStatistics = async () => {
    try {
      setIsLoading(true);
      const result = await fetchClientJson<ApiResponse<InterviewStatistics[]>>("/api/full-ai-interview/statistics");

      if (result.success) {
        setStatistics(result.data);
        setFilteredStatistics(result.data);
      } else {
        toast.error(result.error || "获取统计数据失败");
      }
    } catch (error) {
      console.error("获取统计数据失败:", error);
      toast.error("获取统计数据失败");
    } finally {
      setIsLoading(false);
    }
  };

  // 初始加载数据
  useEffect(() => {
    const timer = window.setTimeout(() => {
      void fetchStatistics();
    }, 0);

    return () => window.clearTimeout(timer);
  }, []);

  // 搜索和过滤
  useEffect(() => {
    let filtered = statistics;

    // 按状态过滤
    if (statusFilter !== "all") {
      filtered = filtered.filter((item) => item.status === statusFilter);
    }

    // 按岗位过滤
    if (positionFilter !== "all") {
      filtered = filtered.filter((item) => item.position === positionFilter);
    }

    // 按日期过滤
    if (yearFilter !== "all" || monthFilter !== "all" || dayFilter !== "all") {
      filtered = filtered.filter((item) => {
        const interviewDate = new Date(item.interviewTime);
        const itemYear = interviewDate.getFullYear().toString();
        const itemMonth = (interviewDate.getMonth() + 1).toString();
        const itemDay = interviewDate.getDate().toString();

        let match = true;
        
        if (yearFilter !== "all" && itemYear !== yearFilter) {
          match = false;
        }
        
        if (match && monthFilter !== "all" && itemMonth !== monthFilter) {
          match = false;
        }
        
        if (match && dayFilter !== "all" && itemDay !== dayFilter) {
          match = false;
        }
        
        return match;
      });
    }

    // 按搜索词过滤
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(
        (item) =>
          item.candidateName.toLowerCase().includes(term) ||
          item.interviewId.toLowerCase().includes(term) ||
          item.meetingId.toLowerCase().includes(term) ||
          item.position.toLowerCase().includes(term)
      );
    }

    setFilteredStatistics(filtered);
  }, [statistics, searchTerm, statusFilter, positionFilter, yearFilter, monthFilter, dayFilter]);

  // 格式化时间
  const formatDateTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString("zh-CN", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  // 复制会议链接
  const copyMeetingLink = async (link: string) => {
    const copied = await copyTextToClipboard(link);
    if (copied) {
      toast.success("会议链接已复制");
      return;
    }

    toast.error("复制失败，请手动复制会议链接");
  };

  // 复制会议ID
  const copyMeetingId = async (id: string) => {
    const copied = await copyTextToClipboard(id);
    if (copied) {
      toast.success("会议ID已复制");
      return;
    }

    toast.error("复制失败，请手动复制会议ID");
  };

  // 查看面试详情
  const viewInterviewDetail = (linkId: string) => {
    router.push(`/full-ai-interview-records?linkId=${linkId}`);
  };

  // 全选/取消全选
  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      // 使用数据库主键 id（唯一标识），而不是 interviewId
      setSelectedIds(filteredStatistics.map(s => s.id.toString()));
    } else {
      setSelectedIds([]);
    }
  };

  // 单个选择
  const handleSelectOne = (recordId: number, checked: boolean) => {
    const recordIdStr = recordId.toString();
    if (checked) {
      setSelectedIds([...selectedIds, recordIdStr]);
    } else {
      setSelectedIds(selectedIds.filter(id => id !== recordIdStr));
    }
  };

  // 批量删除
  const handleBatchDelete = async () => {
    if (selectedIds.length === 0) {
      toast.error("请先选择要删除的记录");
      return;
    }

    setIsDeleting(true);
    try {
      const result = await fetchClientJson<ApiResponse<null>>("/api/full-ai-interview/batch-delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: selectedIds }),  // 使用 ids 而不是 interviewIds
      });

      if (result.success) {
        toast.success(result.message || "批量删除成功");
        setSelectedIds([]);
        setShowDeleteDialog(false);
        // 刷新列表
        await fetchStatistics();
      } else {
        toast.error(result.error || "批量删除失败");
      }
    } catch (error) {
      console.error("批量删除失败:", error);
      toast.error("批量删除失败");
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 dark:from-slate-950 dark:via-blue-950 dark:to-indigo-950">
      <div className="container mx-auto px-4 py-8 max-w-7xl">
        {/* 页面标题 */}
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-slate-900 dark:text-white mb-2">
              全AI面试统计
            </h1>
            <p className="text-slate-600 dark:text-slate-400">
              查看和管理所有全AI面试的统计信息
            </p>
          </div>
          <Button
            variant="outline"
            onClick={() => router.push('/')}
            className="flex items-center gap-2"
          >
            <ArrowLeft className="h-4 w-4" />
            返回仪表盘
          </Button>
        </div>

        {/* 统计卡片 */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">总面试数</CardTitle>
              <FileText className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{statistics.length}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">进行中</CardTitle>
              <Clock className="h-4 w-4 text-blue-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-blue-600">
                {statistics.filter((s) => s.status === "in_progress").length}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">已完成</CardTitle>
              <CheckCircle className="h-4 w-4 text-green-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">
                {statistics.filter((s) => s.status === "completed").length}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">已取消</CardTitle>
              <XCircle className="h-4 w-4 text-red-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-red-600">
                {statistics.filter((s) => s.status === "cancelled").length}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* 筛选和搜索 */}
        <Card className="mb-6">
          <CardContent className="pt-6">
            <div className="flex flex-col gap-4">
              {/* 第一行：搜索框和筛选 */}
              <div className="flex flex-col sm:flex-row gap-4">
                <div className="flex-1">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 h-4 w-4" />
                    <Input
                      placeholder="搜索候选人姓名、面试ID、会议ID..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-10"
                    />
                  </div>
                </div>
                <div className="w-full sm:w-40">
                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger>
                      <SelectValue placeholder="选择状态" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">全部状态</SelectItem>
                      <SelectItem value="in_progress">进行中</SelectItem>
                      <SelectItem value="completed">已完成</SelectItem>
                      <SelectItem value="cancelled">已取消</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="w-full sm:w-40">
                  <Select value={positionFilter} onValueChange={setPositionFilter}>
                    <SelectTrigger>
                      <SelectValue placeholder="选择岗位" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">全部岗位</SelectItem>
                      {(() => {
                        const positions = Array.from(new Set(statistics.map(s => s.position))).filter(p => p);
                        return positions.map(position => (
                          <SelectItem key={position} value={position}>
                            {positionLabels[position] || position}
                          </SelectItem>
                        ));
                      })()}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* 第二行：日期筛选 */}
              <div className="flex flex-col sm:flex-row gap-4 items-end">
                <div className="w-full sm:w-32">
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                    年份
                  </label>
                  <Select value={yearFilter} onValueChange={setYearFilter}>
                    <SelectTrigger>
                      <SelectValue placeholder="全部" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">全部</SelectItem>
                      {(() => {
                        const years = Array.from(new Set(statistics.map(s => new Date(s.interviewTime).getFullYear()))).sort((a, b) => b - a);
                        return years.map(year => (
                          <SelectItem key={year} value={year.toString()}>{year}年</SelectItem>
                        ));
                      })()}
                    </SelectContent>
                  </Select>
                </div>
                <div className="w-full sm:w-32">
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                    月份
                  </label>
                  <Select value={monthFilter} onValueChange={setMonthFilter}>
                    <SelectTrigger>
                      <SelectValue placeholder="全部" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">全部</SelectItem>
                      {Array.from({ length: 12 }, (_, i) => (
                        <SelectItem key={i + 1} value={(i + 1).toString()}>{i + 1}月</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="w-full sm:w-32">
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                    日期
                  </label>
                  <Select value={dayFilter} onValueChange={setDayFilter}>
                    <SelectTrigger>
                      <SelectValue placeholder="全部" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">全部</SelectItem>
                      {(() => {
                        // 根据选中的年份和月份计算该月有多少天
                        let daysInMonth = 31;
                        if (yearFilter !== "all" && monthFilter !== "all") {
                          const year = parseInt(yearFilter);
                          const month = parseInt(monthFilter);
                          daysInMonth = new Date(year, month, 0).getDate();
                        } else if (monthFilter !== "all") {
                          // 如果只选了月份，默认显示该月份的最大天数（28-31）
                          const month = parseInt(monthFilter);
                          daysInMonth = new Date(2024, month, 0).getDate(); // 使用2024年作为默认闰年参考
                        }
                        // 生成1到该月天数的日期列表
                        return Array.from({ length: daysInMonth }, (_, i) => (
                          <SelectItem key={i + 1} value={(i + 1).toString()}>{i + 1}日</SelectItem>
                        ));
                      })()}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex-1 flex justify-end">
                  <Button
                    variant="outline"
                    onClick={fetchStatistics}
                    disabled={isLoading}
                  >
                    <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? "animate-spin" : ""}`} />
                    刷新
                  </Button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* 统计表格 */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>面试列表</CardTitle>
                <CardDescription>
                  显示 {filteredStatistics.length} 条记录
                </CardDescription>
              </div>
              {selectedIds.length > 0 && (
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => setShowDeleteDialog(true)}
                  className="flex items-center gap-2"
                >
                  <Trash2 className="h-4 w-4" />
                  批量删除 ({selectedIds.length})
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-center py-8 text-slate-500">加载中...</div>
            ) : filteredStatistics.length === 0 ? (
              <div className="text-center py-8 text-slate-500">
                {searchTerm || statusFilter !== "all"
                  ? "没有找到匹配的记录"
                  : "暂无面试记录"}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12">
                        <input
                          type="checkbox"
                          checked={selectedIds.length > 0 && selectedIds.length === filteredStatistics.length}
                          onChange={(e) => handleSelectAll(e.target.checked)}
                          className="w-4 h-4 rounded border-gray-300"
                        />
                      </TableHead>
                      <TableHead>候选人</TableHead>
                      <TableHead>岗位</TableHead>
                      <TableHead>面试模式</TableHead>
                      <TableHead>面试时间</TableHead>
                      <TableHead>综合得分</TableHead>
                      <TableHead>维度分数</TableHead>
                      <TableHead>会议链接</TableHead>
                      <TableHead>会议ID</TableHead>
                      <TableHead>状态</TableHead>
                      <TableHead>操作</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredStatistics.map((stat) => {
                      const statusInfo = statusConfig[stat.status] || statusConfig.in_progress;
                      const StatusIcon = statusInfo.icon;

                      // 获取评估信息
                      const evaluation = stat.evaluation;
                      const isEliminated = evaluation?.isEliminated;
                      const overallScore5 = evaluation?.overallScore5;
                      const overallScore100 = evaluation?.overallScore100;
                      const categoryScores = evaluation?.categoryScores || {};
                      const categoryLabels = evaluation?.categoryLabels || {};

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

                      // 生成维度分数显示
                      const renderCategoryScores = () => {
                        const entries = Object.entries(categoryScores);
                        if (entries.length === 0) {
                          return <span className="text-slate-400 text-sm">暂无数据</span>;
                        }

                        return (
                          <div className="space-y-1">
                            {entries.map(([key, value]: [string, CategoryScore]) => {
                              // 优先使用 evaluation 中的 categoryLabels，其次使用维度映射，最后使用原始key
                              const label = categoryLabels[key] || dimensionLabels[key] || key;
                              const score = value?.score;
                              return (
                                <div key={key} className="flex items-center justify-between text-xs">
                                  <span className="text-slate-600">{label}</span>
                                  <span className={`font-medium ${
                                    score >= 4 ? 'text-green-600' : 
                                    score >= 3.5 ? 'text-blue-600' : 
                                    'text-red-600'
                                  }`}>
                                    {score}分
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        );
                      };

                      return (
                        <TableRow key={stat.id}>
                          <TableCell>
                            <input
                              type="checkbox"
                              checked={selectedIds.includes(stat.id.toString())}
                              onChange={(e) => handleSelectOne(stat.id, e.target.checked)}
                              className="w-4 h-4 rounded border-gray-300"
                            />
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <User className="h-4 w-4 text-slate-400" />
                              <span className="font-medium">{stat.candidateName}</span>
                            </div>
                          </TableCell>
                          <TableCell>
                            {positionLabels[stat.position] || stat.position}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline">
                              {modeLabels[stat.mode] || stat.mode}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2 text-sm">
                              <Calendar className="h-4 w-4 text-slate-400" />
                              {formatDateTime(stat.interviewTime)}
                            </div>
                          </TableCell>
                          <TableCell>
                            {isEliminated ? (
                              <Badge variant="destructive">
                                <XCircle className="h-3 w-3 mr-1" />
                                淘汰
                              </Badge>
                            ) : overallScore100 !== undefined ? (
                              <div className="flex flex-col items-start gap-1">
                                <div className="flex items-center gap-2">
                                  <span className={`text-lg font-bold ${
                                    overallScore100 >= 86 ? 'text-green-600' : 
                                    overallScore100 >= 68 ? 'text-blue-600' : 
                                    'text-red-600'
                                  }`}>
                                    {overallScore100}分
                                  </span>
                                  {overallScore5 !== undefined && (
                                    <Badge variant={overallScore5 >= 4 ? 'default' : overallScore5 >= 3.5 ? 'secondary' : 'destructive'}>
                                      {overallScore5}分制
                                    </Badge>
                                  )}
                                </div>
                              </div>
                            ) : (
                              <span className="text-slate-400 text-sm">暂无数据</span>
                            )}
                          </TableCell>
                          <TableCell>
                            {renderCategoryScores()}
                          </TableCell>
                          <TableCell>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                void copyMeetingLink(stat.meetingLink);
                              }}
                              className="h-8 px-2"
                            >
                              <LinkIcon className="h-4 w-4 mr-1" />
                              复制
                            </Button>
                          </TableCell>
                          <TableCell>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                void copyMeetingId(stat.meetingId);
                              }}
                              className="h-8 px-2"
                            >
                              <Video className="h-4 w-4 mr-1" />
                              复制
                            </Button>
                          </TableCell>
                          <TableCell>
                            <Badge variant={statusInfo.variant}>
                              <StatusIcon className="h-3 w-3 mr-1" />
                              {statusInfo.label}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => viewInterviewDetail(stat.linkId)}
                              className="h-8 px-3"
                            >
                              查看详情
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* 批量删除确认对话框 */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              确认批量删除
            </AlertDialogTitle>
            <AlertDialogDescription>
              您即将删除 <span className="font-semibold text-destructive">{selectedIds.length}</span> 条面试记录。
              <br /><br />
              此操作将同时删除：
              <ul className="list-disc list-inside mt-2 text-sm">
                <li>面试评估结果</li>
                <li>面试统计数据</li>
              </ul>
              <br />
              <span className="text-destructive font-semibold">此操作无法撤销，请谨慎操作！</span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleBatchDelete}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? (
                <>
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  删除中...
                </>
              ) : (
                <>
                  <Trash2 className="h-4 w-4 mr-2" />
                  确认删除
                </>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
