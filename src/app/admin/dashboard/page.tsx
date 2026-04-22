"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Activity,
  ArrowDownWideNarrow,
  ArrowUpWideNarrow,
  Briefcase,
  CheckCircle,
  Download,
  Eye,
  FileCheck,
  FileText,
  Filter,
  Loader2,
  RefreshCw,
  TrendingUp,
  UserPlus,
  Users,
  Video,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  XAxis,
  YAxis,
} from "recharts";
import { useAuth } from "@/lib/auth-provider";
import { fetchClientJsonCached } from "@/lib/client-api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface RecruitmentMetrics {
  positionsCount: number;
  candidatesCount: number;
  interviewsCount: number;
  resumesCount: number;
  initialInterviewsCount: number;
  initialPassedCount: number;
  secondInterviewsCount: number;
  secondPassedCount: number;
  finalInterviewsCount: number;
  finalPassedCount: number;
  hiredCount: number;
  notHiredCount: number;
  initialPassRate: number;
  secondPassRate: number;
  finalPassRate: number;
}

interface RecruitmentUserStats extends RecruitmentMetrics {
  userId: string;
  username: string;
  name: string;
  email: string;
  role: string;
  loginCount: number;
  lastActiveAt: string | null;
  lastLoginIp: string | null;
  status: string;
}

interface RecruitmentTrendPoint extends RecruitmentMetrics {
  periodKey: string;
  periodLabel: string;
  periodStart: string;
}

interface RecruitmentDashboardData {
  filters: {
    granularity: "day" | "month" | "year";
    startDate: string;
    endDate: string;
  };
  teamSummary: RecruitmentMetrics & {
    totalUsers: number;
    usersWithData: number;
  };
  users: RecruitmentUserStats[];
  trends: RecruitmentTrendPoint[];
}

interface UserDetailResponse {
  user: {
    userId: string;
    username: string;
    name: string;
    email: string;
    role: string;
    status: string;
    tenantId: string;
    loginCount: number;
    lastLoginAt: string | null;
    lastLoginIp: string | null;
    createdAt: string;
    updatedAt: string | null;
  };
  summary: {
    positionsCount: number;
    candidatesCount: number;
    interviewsCount: number;
    resumesCount: number;
    loginCount: number;
    lastActiveAt: string | null;
    lastLoginIp: string | null;
  };
  candidateStatusCounts: Array<{ status: string; count: number }>;
  recentPositions: Array<{
    id: number;
    title: string;
    department: string;
    status: string;
    createdAt: string;
  }>;
  recentCandidates: Array<{
    id: number;
    name: string;
    position: string | null;
    status: string;
    source: string | null;
    resumeUploaded: boolean;
    createdAt: string;
  }>;
  recentInterviews: Array<{
    id: number;
    interviewId: string;
    candidateName: string;
    position: string;
    recommendation: string;
    overallScore5: number;
    overallScore100: number;
    completedAt: string;
    createdAt: string;
  }>;
  recentResumes: Array<{
    id: number;
    candidateId: number;
    fileName: string;
    createdAt: string;
    candidateName: string | null;
    candidatePosition: string | null;
  }>;
  recentLogins: Array<{
    id: number;
    ip: string | null;
    status: string;
    loginTime: string;
    failureReason: string | null;
    userAgent: string | null;
  }>;
  recentActivities: Array<{
    id: number;
    action: string;
    resource: string;
    resourceName: string | null;
    detail: unknown;
    createdAt: string;
  }>;
}

interface ActivityLog {
  id: number;
  userId: string;
  userName: string;
  action: string;
  resource: string;
  resourceName: string;
  detail: unknown;
  createdAt: string;
}

interface ApiResponse<T> {
  success: boolean;
  data: T;
  error?: string;
}

type SortField =
  | "name"
  | "positionsCount"
  | "candidatesCount"
  | "interviewsCount"
  | "resumesCount"
  | "initialInterviewsCount"
  | "secondInterviewsCount"
  | "finalInterviewsCount"
  | "hiredCount"
  | "initialPassRate"
  | "secondPassRate"
  | "finalPassRate"
  | "lastActiveAt";

const volumeChartConfig = {
  candidatesCount: { label: "候选人数", color: "var(--chart-1)" },
  interviewsCount: { label: "面试数", color: "var(--chart-2)" },
  resumesCount: { label: "简历数", color: "var(--chart-3)" },
  hiredCount: { label: "入职人数", color: "var(--chart-4)" },
};

const funnelChartConfig = {
  initialInterviewsCount: { label: "初试人数", color: "var(--chart-1)" },
  initialPassedCount: { label: "初试通过", color: "var(--chart-2)" },
  secondInterviewsCount: { label: "复试人数", color: "var(--chart-3)" },
  secondPassedCount: { label: "复试通过", color: "var(--chart-4)" },
  finalInterviewsCount: { label: "终试人数", color: "var(--chart-5)" },
  finalPassedCount: { label: "终试通过", color: "#16a34a" },
};

const rateChartConfig = {
  initialPassRate: { label: "初试通过率", color: "var(--chart-1)" },
  secondPassRate: { label: "复试通过率", color: "var(--chart-2)" },
  finalPassRate: { label: "终试通过率", color: "var(--chart-4)" },
};

const actionMap: Record<string, { label: string; color: string; icon: LucideIcon }> = {
  create: { label: "创建", color: "bg-green-500", icon: CheckCircle },
  update: { label: "更新", color: "bg-blue-500", icon: Activity },
  delete: { label: "删除", color: "bg-red-500", icon: XCircle },
  view: { label: "查看", color: "bg-gray-500", icon: Eye },
  login: { label: "登录", color: "bg-purple-500", icon: UserPlus },
  logout: { label: "登出", color: "bg-orange-500", icon: XCircle },
};

const resourceMap: Record<string, { label: string; icon: LucideIcon }> = {
  candidate: { label: "候选人", icon: Users },
  position: { label: "岗位", icon: Briefcase },
  interview: { label: "面试", icon: Video },
  resume: { label: "简历", icon: FileText },
  report: { label: "报告", icon: FileCheck },
};

function pad(value: number) {
  return String(value).padStart(2, "0");
}

function formatDateInput(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function getDefaultDateRange() {
  const today = new Date();
  const endDate = formatDateInput(today);
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 29);
  const startDate = formatDateInput(start);
  return { startDate, endDate };
}

function formatDateTime(value: string | null | undefined) {
  if (!value) {
    return "暂无";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString("zh-CN");
}

function formatPercent(value: number) {
  return `${Number(value || 0).toFixed(1)}%`;
}

function normalizeDateRange(startDate: string, endDate: string) {
  if (startDate <= endDate) {
    return { startDate, endDate };
  }

  return { startDate: endDate, endDate: startDate };
}

function createEmptyMetrics(): RecruitmentMetrics {
  return {
    positionsCount: 0,
    candidatesCount: 0,
    interviewsCount: 0,
    resumesCount: 0,
    initialInterviewsCount: 0,
    initialPassedCount: 0,
    secondInterviewsCount: 0,
    secondPassedCount: 0,
    finalInterviewsCount: 0,
    finalPassedCount: 0,
    hiredCount: 0,
    notHiredCount: 0,
    initialPassRate: 0,
    secondPassRate: 0,
    finalPassRate: 0,
  };
}

function summarizeUsers(users: RecruitmentUserStats[]) {
  const totals = users.reduce<RecruitmentMetrics>((acc, user) => {
    acc.positionsCount += user.positionsCount;
    acc.candidatesCount += user.candidatesCount;
    acc.interviewsCount += user.interviewsCount;
    acc.resumesCount += user.resumesCount;
    acc.initialInterviewsCount += user.initialInterviewsCount;
    acc.initialPassedCount += user.initialPassedCount;
    acc.secondInterviewsCount += user.secondInterviewsCount;
    acc.secondPassedCount += user.secondPassedCount;
    acc.finalInterviewsCount += user.finalInterviewsCount;
    acc.finalPassedCount += user.finalPassedCount;
    acc.hiredCount += user.hiredCount;
    acc.notHiredCount += user.notHiredCount;
    return acc;
  }, createEmptyMetrics());

  totals.initialPassRate = totals.initialInterviewsCount
    ? Number(((totals.initialPassedCount / totals.initialInterviewsCount) * 100).toFixed(1))
    : 0;
  totals.secondPassRate = totals.secondInterviewsCount
    ? Number(((totals.secondPassedCount / totals.secondInterviewsCount) * 100).toFixed(1))
    : 0;
  totals.finalPassRate = totals.finalInterviewsCount
    ? Number(((totals.finalPassedCount / totals.finalInterviewsCount) * 100).toFixed(1))
    : 0;

  return totals;
}

function hasAnyRecruitmentData(user: RecruitmentUserStats) {
  return (
    user.positionsCount > 0 ||
    user.candidatesCount > 0 ||
    user.interviewsCount > 0 ||
    user.resumesCount > 0 ||
    user.initialInterviewsCount > 0 ||
    user.secondInterviewsCount > 0 ||
    user.finalInterviewsCount > 0 ||
    user.hiredCount > 0 ||
    user.notHiredCount > 0
  );
}

function getSortValue(user: RecruitmentUserStats, field: SortField) {
  if (field === "name") {
    return user.name || user.username;
  }

  if (field === "lastActiveAt") {
    return user.lastActiveAt ? new Date(user.lastActiveAt).getTime() : 0;
  }

  return user[field];
}

function getRateBadgeClass(rate: number) {
  if (rate >= 70) {
    return "bg-green-50 text-green-700 border-green-200";
  }
  if (rate >= 40) {
    return "bg-amber-50 text-amber-700 border-amber-200";
  }
  return "bg-rose-50 text-rose-700 border-rose-200";
}

function StatCard({
  title,
  value,
  description,
  icon: Icon,
}: {
  title: string;
  value: number;
  description: string;
  icon: LucideIcon;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        <p className="text-xs text-muted-foreground">{description}</p>
      </CardContent>
    </Card>
  );
}

function RateCard({
  title,
  value,
  denominator,
}: {
  title: string;
  value: number;
  denominator: number;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription>{title}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="flex items-end justify-between gap-3">
          <div className="text-2xl font-bold">{formatPercent(value)}</div>
          <Badge variant="outline" className={getRateBadgeClass(value)}>
            基数 {denominator}
          </Badge>
        </div>
        <div className="h-2 rounded-full bg-muted">
          <div
            className="h-2 rounded-full bg-primary transition-all"
            style={{ width: `${Math.max(0, Math.min(value, 100))}%` }}
          />
        </div>
      </CardContent>
    </Card>
  );
}

export default function AdminDashboardPage() {
  const router = useRouter();
  const { user, isAuthenticated } = useAuth();
  const defaultRange = getDefaultDateRange();

  const [dashboardData, setDashboardData] = useState<RecruitmentDashboardData | null>(null);
  const [activityLogs, setActivityLogs] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedUserDetail, setSelectedUserDetail] = useState<UserDetailResponse | null>(null);
  const [selectedUserDetailLoading, setSelectedUserDetailLoading] = useState(false);
  const [selectedUserDetailError, setSelectedUserDetailError] = useState<string | null>(null);

  const [searchTerm, setSearchTerm] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [sortField, setSortField] = useState<SortField>("candidatesCount");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");
  const [granularity, setGranularity] = useState<"day" | "month" | "year">("day");
  const [startDate, setStartDate] = useState(defaultRange.startDate);
  const [endDate, setEndDate] = useState(defaultRange.endDate);
  const [activityFilter, setActivityFilter] = useState("all");
  const [resourceFilter, setResourceFilter] = useState("all");

  useEffect(() => {
    if (isAuthenticated && user?.role !== "super_admin" && user?.role !== "admin") {
      router.push("/");
    }
  }, [isAuthenticated, router, user]);

  const loadData = useCallback(async (forceRefresh: boolean = false) => {
    setLoading(true);
    try {
      const normalized = normalizeDateRange(startDate, endDate);
      const query = new URLSearchParams({
        granularity,
        startDate: normalized.startDate,
        endDate: normalized.endDate,
      });

      const [dashboardResult, logsResult] = await Promise.allSettled([
        fetchClientJsonCached<ApiResponse<RecruitmentDashboardData>>(
          `/api/admin/recruitment-dashboard?${query.toString()}`,
          {},
          {
            forceRefresh,
            ttlMs: 20_000,
          }
        ),
        fetchClientJsonCached<ApiResponse<ActivityLog[]>>("/api/admin/activity-logs", {}, {
          forceRefresh,
          ttlMs: 20_000,
        }),
      ]);

      if (dashboardResult.status === "fulfilled" && dashboardResult.value.success) {
        setDashboardData(dashboardResult.value.data);
      } else {
        setDashboardData(null);
      }

      if (logsResult.status === "fulfilled" && logsResult.value.success) {
        setActivityLogs(logsResult.value.data);
      } else {
        setActivityLogs([]);
      }
    } catch (error) {
      console.error("加载管理员看板数据失败:", error);
    } finally {
      setLoading(false);
    }
  }, [endDate, granularity, startDate]);

  useEffect(() => {
    if (!isAuthenticated) {
      return;
    }

    const load = () => {
      void loadData(false);
    };

    const idleCallback = globalThis.requestIdleCallback;
    if (typeof idleCallback === "function") {
      const handle = idleCallback(load, { timeout: 1200 });
      return () => globalThis.cancelIdleCallback?.(handle);
    }

    const timer = window.setTimeout(load, 120);
    return () => window.clearTimeout(timer);
  }, [isAuthenticated, loadData]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadData(true);
    setRefreshing(false);
  };

  const handleViewUserDetail = async (userStats: RecruitmentUserStats) => {
    setSelectedUserDetailLoading(true);
    setSelectedUserDetailError(null);
    setSelectedUserDetail(null);

    try {
      const result = await fetchClientJsonCached<ApiResponse<UserDetailResponse>>(
        `/api/admin/user-stats/${userStats.userId}`,
        {},
        { forceRefresh: true, ttlMs: 0 }
      );

      if (result.success) {
        setSelectedUserDetail(result.data);
      } else {
        setSelectedUserDetailError(result.error || "获取用户详情失败");
      }
    } catch (error) {
      console.error("获取用户详情失败:", error);
      setSelectedUserDetailError(error instanceof Error ? error.message : "获取用户详情失败");
    } finally {
      setSelectedUserDetailLoading(false);
    }
  };

  const toggleSortDirection = () => {
    setSortDirection((current) => (current === "desc" ? "asc" : "desc"));
  };

  const filteredUserStats = (dashboardData?.users || [])
    .filter((item) => {
      const keyword = searchTerm.trim().toLowerCase();
      const matchesSearch =
        !keyword ||
        item.username.toLowerCase().includes(keyword) ||
        item.name.toLowerCase().includes(keyword) ||
        item.email.toLowerCase().includes(keyword);
      const matchesRole = roleFilter === "all" || item.role === roleFilter;
      return matchesSearch && matchesRole;
    })
    .sort((left, right) => {
      const a = getSortValue(left, sortField);
      const b = getSortValue(right, sortField);

      if (typeof a === "string" && typeof b === "string") {
        return sortDirection === "desc" ? b.localeCompare(a, "zh-CN") : a.localeCompare(b, "zh-CN");
      }

      const numericA = Number(a || 0);
      const numericB = Number(b || 0);
      return sortDirection === "desc" ? numericB - numericA : numericA - numericB;
    });

  const currentSummary = summarizeUsers(filteredUserStats);
  const usersWithVisibleData = filteredUserStats.filter(hasAnyRecruitmentData).length;

  const filteredActivityLogs = activityLogs.filter((log) => {
    const matchAction = activityFilter === "all" || log.action === activityFilter;
    const matchResource = resourceFilter === "all" || log.resource === resourceFilter;
    return matchAction && matchResource;
  });

  const handleExportUsers = async () => {
    const XLSX = await import("xlsx");
    const normalized = normalizeDateRange(startDate, endDate);
    const exportData = filteredUserStats.map((u) => ({
      姓名: u.name,
      用户名: u.username,
      邮箱: u.email,
      角色:
        u.role === "super_admin"
          ? "超级管理员"
          : u.role === "admin"
            ? "管理员"
            : u.role === "tenant_admin"
              ? "租户管理员"
              : "普通用户",
      岗位数: u.positionsCount,
      候选人数: u.candidatesCount,
      面试数: u.interviewsCount,
      简历数: u.resumesCount,
      初试人数: u.initialInterviewsCount,
      初试通过人数: u.initialPassedCount,
      初试通过率: formatPercent(u.initialPassRate),
      复试人数: u.secondInterviewsCount,
      复试通过人数: u.secondPassedCount,
      复试通过率: formatPercent(u.secondPassRate),
      终试人数: u.finalInterviewsCount,
      终试通过人数: u.finalPassedCount,
      终试通过率: formatPercent(u.finalPassRate),
      入职人数: u.hiredCount,
      未入职人数: u.notHiredCount,
      登录次数: u.loginCount,
      最后活跃: formatDateTime(u.lastActiveAt),
      最近登录IP: u.lastLoginIp || "",
    }));

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "招聘统计");
    XLSX.writeFile(
      wb,
      `超级管理员招聘统计_${normalized.startDate}_${normalized.endDate}_${granularity}.xlsx`
    );
  };

  if (!isAuthenticated || (user?.role !== "super_admin" && user?.role !== "admin")) {
    return null;
  }

  const metricsSummary = currentSummary;

  return (
    <div className="container mx-auto space-y-6 p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Badge variant="outline">超级管理员</Badge>
            <Badge variant="secondary">招聘统计升级</Badge>
          </div>
          <div>
            <h1 className="text-3xl font-bold">管理员数据看板</h1>
            <p className="mt-2 text-muted-foreground">
              只基于现有岗位、候选人、面试和简历数据做聚合展示，支持按日、按月、按年查看招聘指标走势。
            </p>
          </div>
        </div>
        <Button onClick={handleRefresh} disabled={refreshing}>
          <RefreshCw className={`mr-2 h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
          刷新数据
        </Button>
      </div>

      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList>
          <TabsTrigger value="overview">
            <TrendingUp className="mr-2 h-4 w-4" />
            招聘统计
          </TabsTrigger>
          <TabsTrigger value="activity">
            <Activity className="mr-2 h-4 w-4" />
            活动日志
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>统计筛选</CardTitle>
              <CardDescription>支持按面试官筛选查看，并按日 / 月 / 年维度自动汇总统计数据。</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <div className="space-y-2">
                  <div className="text-sm font-medium">搜索面试官</div>
                  <Input
                    placeholder="姓名 / 用户名 / 邮箱"
                    value={searchTerm}
                    onChange={(event) => setSearchTerm(event.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <div className="text-sm font-medium">角色筛选</div>
                  <Select value={roleFilter} onValueChange={setRoleFilter}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">所有角色</SelectItem>
                      <SelectItem value="super_admin">超级管理员</SelectItem>
                      <SelectItem value="admin">管理员</SelectItem>
                      <SelectItem value="tenant_admin">租户管理员</SelectItem>
                      <SelectItem value="user">普通用户</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <div className="text-sm font-medium">统计粒度</div>
                  <Select value={granularity} onValueChange={(value) => setGranularity(value as "day" | "month" | "year")}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="day">按日汇总</SelectItem>
                      <SelectItem value="month">按月汇总</SelectItem>
                      <SelectItem value="year">按年汇总</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <div className="text-sm font-medium">排序字段</div>
                  <Select value={sortField} onValueChange={(value) => setSortField(value as SortField)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="candidatesCount">按候选人数</SelectItem>
                      <SelectItem value="interviewsCount">按面试数</SelectItem>
                      <SelectItem value="hiredCount">按入职人数</SelectItem>
                      <SelectItem value="initialPassRate">按初试通过率</SelectItem>
                      <SelectItem value="secondPassRate">按复试通过率</SelectItem>
                      <SelectItem value="finalPassRate">按终试通过率</SelectItem>
                      <SelectItem value="positionsCount">按岗位数</SelectItem>
                      <SelectItem value="lastActiveAt">按最后活跃</SelectItem>
                      <SelectItem value="name">按姓名</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-[1fr_1fr_auto_auto]">
                <div className="space-y-2">
                  <div className="text-sm font-medium">开始日期</div>
                  <Input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} />
                </div>
                <div className="space-y-2">
                  <div className="text-sm font-medium">结束日期</div>
                  <Input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} />
                </div>
                <div className="flex items-end">
                  <Button variant="outline" onClick={toggleSortDirection} className="w-full">
                    {sortDirection === "desc" ? (
                      <ArrowDownWideNarrow className="mr-2 h-4 w-4" />
                    ) : (
                      <ArrowUpWideNarrow className="mr-2 h-4 w-4" />
                    )}
                    {sortDirection === "desc" ? "降序" : "升序"}
                  </Button>
                </div>
                <div className="flex items-end">
                  <Button variant="outline" onClick={handleExportUsers} className="w-full">
                    <Download className="mr-2 h-4 w-4" />
                    导出 Excel
                  </Button>
                </div>
              </div>

              <div className="flex flex-wrap gap-2 text-sm text-muted-foreground">
                <Badge variant="outline">
                  统计范围 {normalizeDateRange(startDate, endDate).startDate} 至 {normalizeDateRange(startDate, endDate).endDate}
                </Badge>
                <Badge variant="outline">
                  团队用户 {dashboardData?.teamSummary.totalUsers ?? 0} 人
                </Badge>
                <Badge variant="outline">
                  当前筛选可见 {filteredUserStats.length} 人
                </Badge>
                <Badge variant="outline">
                  有统计数据 {usersWithVisibleData} 人
                </Badge>
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <StatCard
              title="岗位数"
              value={metricsSummary.positionsCount}
              description="保留原有核心统计字段"
              icon={Briefcase}
            />
            <StatCard
              title="候选人数"
              value={metricsSummary.candidatesCount}
              description="当前筛选范围内新增候选人"
              icon={Users}
            />
            <StatCard
              title="面试数"
              value={metricsSummary.interviewsCount}
              description="全 AI 面试完成记录"
              icon={Video}
            />
            <StatCard
              title="简历数"
              value={metricsSummary.resumesCount}
              description="当前筛选范围内上传简历"
              icon={FileText}
            />
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <StatCard
              title="初试人数"
              value={metricsSummary.initialInterviewsCount}
              description={`通过 ${metricsSummary.initialPassedCount} 人`}
              icon={Filter}
            />
            <StatCard
              title="复试人数"
              value={metricsSummary.secondInterviewsCount}
              description={`通过 ${metricsSummary.secondPassedCount} 人`}
              icon={TrendingUp}
            />
            <StatCard
              title="终试人数"
              value={metricsSummary.finalInterviewsCount}
              description={`通过 ${metricsSummary.finalPassedCount} 人`}
              icon={CheckCircle}
            />
            <StatCard
              title="入职结果"
              value={metricsSummary.hiredCount}
              description={`未入职 ${metricsSummary.notHiredCount} 人`}
              icon={UserPlus}
            />
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <RateCard
              title="初试通过率"
              value={metricsSummary.initialPassRate}
              denominator={metricsSummary.initialInterviewsCount}
            />
            <RateCard
              title="复试通过率"
              value={metricsSummary.secondPassRate}
              denominator={metricsSummary.secondInterviewsCount}
            />
            <RateCard
              title="终试通过率"
              value={metricsSummary.finalPassRate}
              denominator={metricsSummary.finalInterviewsCount}
            />
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>团队招聘趋势</CardTitle>
                <CardDescription>候选人、面试、简历、入职指标按所选粒度汇总展示。</CardDescription>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="flex h-[320px] items-center justify-center text-muted-foreground">加载中...</div>
                ) : (
                  <ChartContainer config={volumeChartConfig} className="h-[320px] w-full">
                    <BarChart data={dashboardData?.trends || []} accessibilityLayer>
                      <CartesianGrid vertical={false} />
                      <XAxis dataKey="periodLabel" tickLine={false} axisLine={false} minTickGap={24} />
                      <YAxis allowDecimals={false} />
                      <ChartTooltip content={<ChartTooltipContent />} />
                      <Legend />
                      <Bar name="候选人数" dataKey="candidatesCount" fill="var(--color-candidatesCount)" radius={[4, 4, 0, 0]} />
                      <Bar name="面试数" dataKey="interviewsCount" fill="var(--color-interviewsCount)" radius={[4, 4, 0, 0]} />
                      <Bar name="简历数" dataKey="resumesCount" fill="var(--color-resumesCount)" radius={[4, 4, 0, 0]} />
                      <Bar name="入职人数" dataKey="hiredCount" fill="var(--color-hiredCount)" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ChartContainer>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>流程漏斗趋势</CardTitle>
                <CardDescription>初试、复试、终试及各阶段通过人数的时间分布。</CardDescription>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="flex h-[320px] items-center justify-center text-muted-foreground">加载中...</div>
                ) : (
                  <ChartContainer config={funnelChartConfig} className="h-[320px] w-full">
                    <BarChart data={dashboardData?.trends || []} accessibilityLayer>
                      <CartesianGrid vertical={false} />
                      <XAxis dataKey="periodLabel" tickLine={false} axisLine={false} minTickGap={24} />
                      <YAxis allowDecimals={false} />
                      <ChartTooltip content={<ChartTooltipContent />} />
                      <Legend />
                      <Bar name="初试人数" dataKey="initialInterviewsCount" fill="var(--color-initialInterviewsCount)" radius={[4, 4, 0, 0]} />
                      <Bar name="初试通过" dataKey="initialPassedCount" fill="var(--color-initialPassedCount)" radius={[4, 4, 0, 0]} />
                      <Bar name="复试人数" dataKey="secondInterviewsCount" fill="var(--color-secondInterviewsCount)" radius={[4, 4, 0, 0]} />
                      <Bar name="复试通过" dataKey="secondPassedCount" fill="var(--color-secondPassedCount)" radius={[4, 4, 0, 0]} />
                      <Bar name="终试人数" dataKey="finalInterviewsCount" fill="var(--color-finalInterviewsCount)" radius={[4, 4, 0, 0]} />
                      <Bar name="终试通过" dataKey="finalPassedCount" fill="var(--color-finalPassedCount)" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ChartContainer>
                )}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>通过率趋势</CardTitle>
              <CardDescription>
                展示团队整体通过率变化。表格筛选按面试官查看明细，趋势图保持团队口径，避免因为文本搜索导致图表失真。
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {loading ? (
                <div className="flex h-[280px] items-center justify-center text-muted-foreground">加载中...</div>
              ) : (
                <ChartContainer config={rateChartConfig} className="h-[280px] w-full">
                  <LineChart data={dashboardData?.trends || []} accessibilityLayer>
                    <CartesianGrid vertical={false} />
                    <XAxis dataKey="periodLabel" tickLine={false} axisLine={false} minTickGap={24} />
                    <YAxis domain={[0, 100]} tickFormatter={(value) => `${value}%`} />
                    <ChartTooltip
                      content={
                        <ChartTooltipContent
                          formatter={(value, name) => (
                            <div className="flex w-full items-center justify-between gap-3">
                              <span>{String(name)}</span>
                              <span className="font-medium">{formatPercent(Number(value))}</span>
                            </div>
                          )}
                        />
                      }
                    />
                    <Legend />
                    <Line
                      name="初试通过率"
                      type="monotone"
                      dataKey="initialPassRate"
                      stroke="var(--color-initialPassRate)"
                      strokeWidth={2}
                      dot={false}
                    />
                    <Line
                      name="复试通过率"
                      type="monotone"
                      dataKey="secondPassRate"
                      stroke="var(--color-secondPassRate)"
                      strokeWidth={2}
                      dot={false}
                    />
                    <Line
                      name="终试通过率"
                      type="monotone"
                      dataKey="finalPassRate"
                      stroke="var(--color-finalPassRate)"
                      strokeWidth={2}
                      dot={false}
                    />
                  </LineChart>
                </ChartContainer>
              )}

              <div className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
                入职人数与未入职人数沿用现有候选人状态字段进行统计，时间归档基于候选人最近一次状态更新时间，不改写任何现有业务数据。
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <CardTitle>按面试官统计</CardTitle>
                  <CardDescription>按单人逐行展示招聘指标，支持排序、筛选和用户详情查看。</CardDescription>
                </div>
                <Badge variant="outline">当前排序: {sortField}</Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>面试官</TableHead>
                      <TableHead>角色</TableHead>
                      <TableHead className="text-center">岗位数</TableHead>
                      <TableHead className="text-center">候选人数</TableHead>
                      <TableHead className="text-center">面试数</TableHead>
                      <TableHead className="text-center">简历数</TableHead>
                      <TableHead className="text-center">初试</TableHead>
                      <TableHead className="text-center">初试通过</TableHead>
                      <TableHead className="text-center">初试率</TableHead>
                      <TableHead className="text-center">复试</TableHead>
                      <TableHead className="text-center">复试通过</TableHead>
                      <TableHead className="text-center">复试率</TableHead>
                      <TableHead className="text-center">终试</TableHead>
                      <TableHead className="text-center">终试通过</TableHead>
                      <TableHead className="text-center">终试率</TableHead>
                      <TableHead className="text-center">入职</TableHead>
                      <TableHead className="text-center">未入职</TableHead>
                      <TableHead className="text-center">登录次数</TableHead>
                      <TableHead>最后活跃</TableHead>
                      <TableHead>最近登录 IP</TableHead>
                      <TableHead className="text-right">详情</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loading ? (
                      <TableRow>
                        <TableCell colSpan={21} className="py-10 text-center">
                          加载中...
                        </TableCell>
                      </TableRow>
                    ) : filteredUserStats.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={21} className="py-10 text-center">
                          暂无符合条件的数据
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredUserStats.map((item) => (
                        <TableRow key={item.userId}>
                          <TableCell>
                            <div className="min-w-[180px]">
                              <div className="font-medium">{item.name}</div>
                              <div className="text-sm text-muted-foreground">{item.email}</div>
                              <div className="text-xs text-muted-foreground">@{item.username}</div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant={item.role === "super_admin" ? "default" : "secondary"}>
                              {item.role === "super_admin"
                                ? "超级管理员"
                                : item.role === "admin"
                                  ? "管理员"
                                  : item.role === "tenant_admin"
                                    ? "租户管理员"
                                    : "普通用户"}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-center">{item.positionsCount}</TableCell>
                          <TableCell className="text-center">{item.candidatesCount}</TableCell>
                          <TableCell className="text-center">{item.interviewsCount}</TableCell>
                          <TableCell className="text-center">{item.resumesCount}</TableCell>
                          <TableCell className="text-center">{item.initialInterviewsCount}</TableCell>
                          <TableCell className="text-center">{item.initialPassedCount}</TableCell>
                          <TableCell className="text-center">
                            <Badge variant="outline" className={getRateBadgeClass(item.initialPassRate)}>
                              {formatPercent(item.initialPassRate)}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-center">{item.secondInterviewsCount}</TableCell>
                          <TableCell className="text-center">{item.secondPassedCount}</TableCell>
                          <TableCell className="text-center">
                            <Badge variant="outline" className={getRateBadgeClass(item.secondPassRate)}>
                              {formatPercent(item.secondPassRate)}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-center">{item.finalInterviewsCount}</TableCell>
                          <TableCell className="text-center">{item.finalPassedCount}</TableCell>
                          <TableCell className="text-center">
                            <Badge variant="outline" className={getRateBadgeClass(item.finalPassRate)}>
                              {formatPercent(item.finalPassRate)}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-center">{item.hiredCount}</TableCell>
                          <TableCell className="text-center">{item.notHiredCount}</TableCell>
                          <TableCell className="text-center">{item.loginCount}</TableCell>
                          <TableCell>{formatDateTime(item.lastActiveAt)}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">{item.lastLoginIp || "未知"}</TableCell>
                          <TableCell className="text-right">
                            <Button variant="outline" size="sm" onClick={() => void handleViewUserDetail(item)}>
                              查看详情
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="activity">
          <Card>
            <CardHeader>
              <CardTitle>用户活动日志</CardTitle>
              <CardDescription>保留现有活动日志能力，便于排查管理员和面试官操作轨迹。</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="mb-4 flex gap-4">
                <Select value={activityFilter} onValueChange={setActivityFilter}>
                  <SelectTrigger className="w-32">
                    <SelectValue placeholder="操作类型" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">全部操作</SelectItem>
                    <SelectItem value="create">创建</SelectItem>
                    <SelectItem value="update">更新</SelectItem>
                    <SelectItem value="delete">删除</SelectItem>
                    <SelectItem value="login">登录</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={resourceFilter} onValueChange={setResourceFilter}>
                  <SelectTrigger className="w-32">
                    <SelectValue placeholder="资源类型" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">全部资源</SelectItem>
                    <SelectItem value="candidate">候选人</SelectItem>
                    <SelectItem value="position">岗位</SelectItem>
                    <SelectItem value="interview">面试</SelectItem>
                    <SelectItem value="resume">简历</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>时间</TableHead>
                    <TableHead>用户</TableHead>
                    <TableHead>操作</TableHead>
                    <TableHead>资源</TableHead>
                    <TableHead>详情</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRow>
                      <TableCell colSpan={5} className="py-8 text-center">
                        加载中...
                      </TableCell>
                    </TableRow>
                  ) : filteredActivityLogs.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="py-8 text-center">
                        暂无活动记录
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredActivityLogs.map((log) => {
                      const actionInfo = actionMap[log.action] || {
                        label: log.action,
                        color: "bg-gray-500",
                        icon: Activity,
                      };
                      const resourceInfo = resourceMap[log.resource] || {
                        label: log.resource,
                        icon: FileText,
                      };
                      const ActionIcon = actionInfo.icon;
                      const ResourceIcon = resourceInfo.icon;
                      const detailText = log.detail == null ? "" : JSON.stringify(log.detail);

                      return (
                        <TableRow key={log.id}>
                          <TableCell>{formatDateTime(log.createdAt)}</TableCell>
                          <TableCell>
                            <p className="font-medium">{log.userName}</p>
                          </TableCell>
                          <TableCell>
                            <Badge className={`${actionInfo.color} text-white`}>
                              <ActionIcon className="mr-1 h-3 w-3" />
                              {actionInfo.label}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <ResourceIcon className="h-4 w-4 text-muted-foreground" />
                              <span>{resourceInfo.label}</span>
                              {log.resourceName && (
                                <span className="text-muted-foreground">- {log.resourceName}</span>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            {detailText && (
                              <span className="text-sm text-muted-foreground">
                                {detailText.slice(0, 80)}
                                {detailText.length > 80 ? "..." : ""}
                              </span>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog
        open={selectedUserDetailLoading || Boolean(selectedUserDetail) || Boolean(selectedUserDetailError)}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedUserDetail(null);
            setSelectedUserDetailError(null);
            setSelectedUserDetailLoading(false);
          }
        }}
      >
        <DialogContent className="max-h-[90vh] max-w-6xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>用户详情</DialogTitle>
            <DialogDescription>查看该用户的岗位、候选人、面试、简历和登录轨迹</DialogDescription>
          </DialogHeader>

          {selectedUserDetailLoading ? (
            <div className="flex items-center justify-center py-16 text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              加载用户详情中...
            </div>
          ) : selectedUserDetailError ? (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
              {selectedUserDetailError}
            </div>
          ) : selectedUserDetail ? (
            <div className="space-y-6">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium">基础信息</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-1 text-sm">
                    <div>{selectedUserDetail.user.name}</div>
                    <div className="text-muted-foreground">{selectedUserDetail.user.username}</div>
                    <div className="text-muted-foreground">{selectedUserDetail.user.email}</div>
                    <Badge variant="outline" className="mt-1">
                      {selectedUserDetail.user.role}
                    </Badge>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium">数据总览</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-1 text-sm">
                    <div>岗位 {selectedUserDetail.summary.positionsCount}</div>
                    <div>候选人 {selectedUserDetail.summary.candidatesCount}</div>
                    <div>面试 {selectedUserDetail.summary.interviewsCount}</div>
                    <div>简历 {selectedUserDetail.summary.resumesCount}</div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium">登录信息</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-1 text-sm">
                    <div>登录次数 {selectedUserDetail.summary.loginCount}</div>
                    <div className="text-muted-foreground">
                      最近活跃 {formatDateTime(selectedUserDetail.summary.lastActiveAt)}
                    </div>
                    <div className="text-muted-foreground">
                      最近登录 IP {selectedUserDetail.summary.lastLoginIp || "暂无"}
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium">候选人状态</CardTitle>
                  </CardHeader>
                  <CardContent className="flex flex-wrap gap-2">
                    {selectedUserDetail.candidateStatusCounts.length > 0 ? (
                      selectedUserDetail.candidateStatusCounts.map((item) => (
                        <Badge key={item.status} variant="secondary">
                          {item.status}: {item.count}
                        </Badge>
                      ))
                    ) : (
                      <span className="text-sm text-muted-foreground">暂无候选人数据</span>
                    )}
                  </CardContent>
                </Card>
              </div>

              <div className="grid gap-4 xl:grid-cols-2">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">最近岗位</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {selectedUserDetail.recentPositions.length === 0 ? (
                      <div className="text-sm text-muted-foreground">暂无岗位记录</div>
                    ) : (
                      selectedUserDetail.recentPositions.map((item) => (
                        <div key={item.id} className="rounded-lg border p-3 text-sm">
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <div className="font-medium">{item.title}</div>
                              <div className="text-muted-foreground">{item.department}</div>
                            </div>
                            <Badge variant="outline">{item.status}</Badge>
                          </div>
                          <div className="mt-2 text-xs text-muted-foreground">
                            创建于 {formatDateTime(item.createdAt)}
                          </div>
                        </div>
                      ))
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">最近候选人</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {selectedUserDetail.recentCandidates.length === 0 ? (
                      <div className="text-sm text-muted-foreground">暂无候选人记录</div>
                    ) : (
                      selectedUserDetail.recentCandidates.map((item) => (
                        <div key={item.id} className="rounded-lg border p-3 text-sm">
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <div className="font-medium">{item.name}</div>
                              <div className="text-muted-foreground">{item.position || "未设置岗位"}</div>
                            </div>
                            <Badge variant="outline">{item.status}</Badge>
                          </div>
                          <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
                            <span>{item.source || "未知来源"}</span>
                            <span>{item.resumeUploaded ? "已上传简历" : "未上传简历"}</span>
                          </div>
                          <div className="mt-1 text-xs text-muted-foreground">创建于 {formatDateTime(item.createdAt)}</div>
                        </div>
                      ))
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">最近全 AI 面试</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {selectedUserDetail.recentInterviews.length === 0 ? (
                      <div className="text-sm text-muted-foreground">暂无面试记录</div>
                    ) : (
                      selectedUserDetail.recentInterviews.map((item) => (
                        <div key={item.id} className="rounded-lg border p-3 text-sm">
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <div className="font-medium">{item.candidateName}</div>
                              <div className="text-muted-foreground">{item.position}</div>
                            </div>
                            <Badge variant="secondary">{item.recommendation}</Badge>
                          </div>
                          <div className="mt-2 flex flex-wrap gap-3 text-xs text-muted-foreground">
                            <span>5分制 {item.overallScore5}</span>
                            <span>100分制 {item.overallScore100}</span>
                            <span>{formatDateTime(item.completedAt)}</span>
                          </div>
                        </div>
                      ))
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">最近简历</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {selectedUserDetail.recentResumes.length === 0 ? (
                      <div className="text-sm text-muted-foreground">暂无简历记录</div>
                    ) : (
                      selectedUserDetail.recentResumes.map((item) => (
                        <div key={item.id} className="rounded-lg border p-3 text-sm">
                          <div className="font-medium">{item.fileName}</div>
                          <div className="text-muted-foreground">
                            {item.candidateName || "未知候选人"} {item.candidatePosition ? `· ${item.candidatePosition}` : ""}
                          </div>
                          <div className="mt-1 text-xs text-muted-foreground">创建于 {formatDateTime(item.createdAt)}</div>
                        </div>
                      ))
                    )}
                  </CardContent>
                </Card>
              </div>

              <div className="grid gap-4 xl:grid-cols-2">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">最近登录</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {selectedUserDetail.recentLogins.length === 0 ? (
                      <div className="text-sm text-muted-foreground">暂无登录记录</div>
                    ) : (
                      selectedUserDetail.recentLogins.map((item) => (
                        <div key={item.id} className="rounded-lg border p-3 text-sm">
                          <div className="flex items-center justify-between gap-3">
                            <Badge variant={item.status === "success" ? "default" : "secondary"}>
                              {item.status}
                            </Badge>
                            <span className="text-xs text-muted-foreground">{item.ip || "未知 IP"}</span>
                          </div>
                          <div className="mt-2 text-xs text-muted-foreground">{formatDateTime(item.loginTime)}</div>
                          {item.failureReason && (
                            <div className="mt-1 text-xs text-destructive">{item.failureReason}</div>
                          )}
                        </div>
                      ))
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">最近活动</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {selectedUserDetail.recentActivities.length === 0 ? (
                      <div className="text-sm text-muted-foreground">暂无活动记录</div>
                    ) : (
                      selectedUserDetail.recentActivities.map((item) => (
                        <div key={item.id} className="rounded-lg border p-3 text-sm">
                          <div className="flex items-center justify-between gap-3">
                            <div className="font-medium">{item.action}</div>
                            <Badge variant="outline">{item.resource}</Badge>
                          </div>
                          <div className="mt-1 text-muted-foreground">{item.resourceName || "未命名资源"}</div>
                          <div className="mt-1 text-xs text-muted-foreground">{formatDateTime(item.createdAt)}</div>
                        </div>
                      ))
                    )}
                  </CardContent>
                </Card>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
