import { NextRequest, NextResponse } from "next/server";
import { and, eq, gte, lte, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { authenticateApi } from "@/lib/api-auth";
import { ensureCandidatesTable } from "@/lib/db/ensure-candidates-table";
import { ensureResumesTable } from "@/lib/db/ensure-resumes-table";
import { ensureFullAiInterviewResultsTable } from "@/lib/db/ensure-full-ai-interview-results-table";
import * as sharedSchema from "@/storage/database/shared/schema";
import { candidates, resumes } from "@/lib/db/schema";

type Granularity = "day" | "month" | "year";

type MetricCounts = {
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
};

type UserAccumulator = {
  userId: string;
  username: string;
  name: string;
  email: string;
  role: string;
  loginCount: number;
  lastActiveAt: string | null;
  lastLoginIp: string | null;
  status: string;
} & MetricCounts;

type TrendAccumulator = {
  periodKey: string;
  periodLabel: string;
  periodStart: string;
} & MetricCounts;

function createEmptyMetricCounts(): MetricCounts {
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
  };
}

function calculateRate(numerator: number, denominator: number) {
  if (!denominator) {
    return 0;
  }

  return Number(((numerator / denominator) * 100).toFixed(1));
}

function finalizeMetrics<T extends MetricCounts>(metrics: T) {
  return {
    ...metrics,
    initialPassRate: calculateRate(metrics.initialPassedCount, metrics.initialInterviewsCount),
    secondPassRate: calculateRate(metrics.secondPassedCount, metrics.secondInterviewsCount),
    finalPassRate: calculateRate(metrics.finalPassedCount, metrics.finalInterviewsCount),
  };
}

function pad(value: number) {
  return String(value).padStart(2, "0");
}

function formatDateInput(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function formatPeriodLabel(date: Date, granularity: Granularity) {
  if (granularity === "year") {
    return `${date.getFullYear()}年`;
  }

  if (granularity === "month") {
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}`;
  }

  return `${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function alignPeriodStart(date: Date, granularity: Granularity) {
  if (granularity === "year") {
    return new Date(date.getFullYear(), 0, 1);
  }

  if (granularity === "month") {
    return new Date(date.getFullYear(), date.getMonth(), 1);
  }

  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function getNextPeriod(date: Date, granularity: Granularity) {
  if (granularity === "year") {
    return new Date(date.getFullYear() + 1, 0, 1);
  }

  if (granularity === "month") {
    return new Date(date.getFullYear(), date.getMonth() + 1, 1);
  }

  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1);
}

function getPeriodKey(date: Date, granularity: Granularity) {
  if (granularity === "year") {
    return `${date.getFullYear()}`;
  }

  if (granularity === "month") {
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}`;
  }

  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function parseDateLike(value: unknown): Date | null {
  if (!value) {
    return null;
  }

  const date = value instanceof Date ? value : new Date(String(value));

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date;
}

function startOfDay(date: Date) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

function endOfDay(date: Date) {
  const next = new Date(date);
  next.setHours(23, 59, 59, 999);
  return next;
}

function normalizeGranularity(value: string | null): Granularity {
  if (value === "month" || value === "year") {
    return value;
  }

  return "day";
}

function buildDateRange(searchParams: URLSearchParams) {
  const today = new Date();
  const defaultEnd = endOfDay(today);
  const defaultStart = startOfDay(new Date(today.getFullYear(), today.getMonth(), today.getDate() - 29));

  const requestedStart = parseDateLike(searchParams.get("startDate"));
  const requestedEnd = parseDateLike(searchParams.get("endDate"));

  const start = startOfDay(requestedStart ?? defaultStart);
  const end = endOfDay(requestedEnd ?? defaultEnd);

  if (start <= end) {
    return { start, end };
  }

  return { start: startOfDay(end), end: endOfDay(start) };
}

function buildTrendSeed(start: Date, end: Date, granularity: Granularity) {
  const buckets = new Map<string, TrendAccumulator>();

  let cursor = alignPeriodStart(start, granularity);
  const limit = endOfDay(end);

  while (cursor <= limit) {
    const periodKey = getPeriodKey(cursor, granularity);
    buckets.set(periodKey, {
      periodKey,
      periodLabel: formatPeriodLabel(cursor, granularity),
      periodStart: cursor.toISOString(),
      ...createEmptyMetricCounts(),
    });
    cursor = getNextPeriod(cursor, granularity);
  }

  return buckets;
}

function incrementMetric(target: MetricCounts, metric: keyof MetricCounts) {
  target[metric] += 1;
}

function hasAnyMetrics(metrics: MetricCounts) {
  return Object.values(metrics).some((value) => value > 0);
}

function isWithinRange(date: Date, start: Date, end: Date) {
  return date >= start && date <= end;
}

async function safeRows<T>(queryFactory: () => Promise<T[]>, fallback: T[] = []) {
  try {
    return await queryFactory();
  } catch (error) {
    console.warn("[管理员招聘看板API] 查询失败，已回退为空结果:", error);
    return fallback;
  }
}

export async function GET(request: NextRequest) {
  try {
    const payload = await authenticateApi(request);

    if (payload.role !== "super_admin" && payload.role !== "admin") {
      return NextResponse.json(
        { error: "权限不足，仅管理员可访问" },
        { status: 403 }
      );
    }

    const searchParams = request.nextUrl.searchParams;
    const granularity = normalizeGranularity(searchParams.get("granularity"));
    const { start, end } = buildDateRange(searchParams);
    const startTimestamp = start.toISOString();
    const endTimestamp = end.toISOString();

    const db = await getDb();

    await Promise.all([
      ensureCandidatesTable(),
      ensureResumesTable(),
      ensureFullAiInterviewResultsTable(),
    ]);

    const [
      users,
      positionsRows,
      candidateRows,
      interviewRows,
      resumeRows,
    ] = await Promise.all([
      db
        .select({
          userId: sharedSchema.users.id,
          username: sharedSchema.users.username,
          name: sharedSchema.users.name,
          email: sharedSchema.users.email,
          role: sharedSchema.users.role,
          loginCount: sharedSchema.users.loginCount,
          lastLoginAt: sharedSchema.users.lastLoginAt,
          lastLoginIp: sharedSchema.users.lastLoginIp,
          status: sharedSchema.users.status,
        })
        .from(sharedSchema.users),
      safeRows(() =>
        db
          .select({
            userId: sharedSchema.positions.userId,
            createdAt: sharedSchema.positions.createdAt,
          })
          .from(sharedSchema.positions)
          .where(
            and(
              gte(sharedSchema.positions.createdAt, start),
              lte(sharedSchema.positions.createdAt, end)
            )
          )
      ),
      safeRows(() =>
        db
          .select({
            createdById: candidates.createdById,
            createdAt: candidates.createdAt,
            updatedAt: candidates.updatedAt,
            initialInterviewTime: candidates.initialInterviewTime,
            secondInterviewTime: candidates.secondInterviewTime,
            finalInterviewTime: candidates.finalInterviewTime,
            initialInterviewPassed: candidates.initialInterviewPassed,
            secondInterviewPassed: candidates.secondInterviewPassed,
            finalInterviewPassed: candidates.finalInterviewPassed,
            isHired: candidates.isHired,
            interviewStage: candidates.interviewStage,
          })
          .from(candidates)
          .where(sql`${candidates.createdById} IS NOT NULL`)
      ),
      safeRows(() =>
        db
          .select({
            userId: sharedSchema.fullAiInterviewResults.userId,
            completedAt: sharedSchema.fullAiInterviewResults.completedAt,
          })
          .from(sharedSchema.fullAiInterviewResults)
          .where(
            and(
              sql`${sharedSchema.fullAiInterviewResults.userId} IS NOT NULL`,
              gte(sharedSchema.fullAiInterviewResults.completedAt, startTimestamp),
              lte(sharedSchema.fullAiInterviewResults.completedAt, endTimestamp)
            )
          )
      ),
      safeRows(() =>
        db
          .select({
            createdById: candidates.createdById,
            createdAt: resumes.createdAt,
          })
          .from(resumes)
          .leftJoin(candidates, eq(resumes.candidateId, candidates.id))
          .where(
            and(
              sql`${candidates.createdById} IS NOT NULL`,
              gte(resumes.createdAt, start),
              lte(resumes.createdAt, end)
            )
          )
      ),
    ]);

    const userMap = new Map<string, UserAccumulator>();
    for (const user of users) {
      userMap.set(user.userId, {
        userId: user.userId,
        username: user.username,
        name: user.name,
        email: user.email,
        role: user.role,
        loginCount: Number(user.loginCount || 0),
        lastActiveAt: user.lastLoginAt ? String(user.lastLoginAt) : null,
        lastLoginIp: user.lastLoginIp || null,
        status: user.status,
        ...createEmptyMetricCounts(),
      });
    }

    const teamMetrics = createEmptyMetricCounts();
    const trendMap = buildTrendSeed(start, end, granularity);

    const registerMetric = (
      userId: string | null | undefined,
      dateLike: unknown,
      metric: keyof MetricCounts
    ) => {
      if (!userId) {
        return;
      }

      const row = userMap.get(userId);
      if (!row) {
        return;
      }

      const date = parseDateLike(dateLike);
      if (!date || !isWithinRange(date, start, end)) {
        return;
      }

      incrementMetric(row, metric);
      incrementMetric(teamMetrics, metric);

      const bucketKey = getPeriodKey(date, granularity);
      const bucket = trendMap.get(bucketKey);
      if (bucket) {
        incrementMetric(bucket, metric);
      }
    };

    for (const row of positionsRows) {
      registerMetric(row.userId, row.createdAt, "positionsCount");
    }

    for (const row of interviewRows) {
      registerMetric(row.userId, row.completedAt, "interviewsCount");
    }

    for (const row of resumeRows) {
      registerMetric(row.createdById, row.createdAt, "resumesCount");
    }

    for (const row of candidateRows) {
      registerMetric(row.createdById, row.createdAt, "candidatesCount");

      const fallbackStageDate = parseDateLike(row.updatedAt);
      const initialStageDate = parseDateLike(row.initialInterviewTime) ?? fallbackStageDate;
      const secondStageDate = parseDateLike(row.secondInterviewTime) ?? fallbackStageDate;
      const finalStageDate = parseDateLike(row.finalInterviewTime) ?? fallbackStageDate;

      if (initialStageDate && (row.initialInterviewTime || row.initialInterviewPassed !== null)) {
        registerMetric(row.createdById, initialStageDate, "initialInterviewsCount");
      }
      if (row.initialInterviewPassed === "pass") {
        registerMetric(row.createdById, initialStageDate, "initialPassedCount");
      }

      if (secondStageDate && (row.secondInterviewTime || row.secondInterviewPassed !== null)) {
        registerMetric(row.createdById, secondStageDate, "secondInterviewsCount");
      }
      if (row.secondInterviewPassed === "pass") {
        registerMetric(row.createdById, secondStageDate, "secondPassedCount");
      }

      if (finalStageDate && (row.finalInterviewTime || row.finalInterviewPassed !== null)) {
        registerMetric(row.createdById, finalStageDate, "finalInterviewsCount");
      }
      if (row.finalInterviewPassed === "pass") {
        registerMetric(row.createdById, finalStageDate, "finalPassedCount");
      }

      if (row.isHired === true || row.interviewStage === "hired") {
        registerMetric(row.createdById, fallbackStageDate, "hiredCount");
      }

      if (row.isHired !== true && row.interviewStage === "rejectedOffer") {
        registerMetric(row.createdById, fallbackStageDate, "notHiredCount");
      }
    }

    const finalizedUsers = Array.from(userMap.values())
      .map((row) => finalizeMetrics(row))
      .sort((a, b) => {
        const totalA =
          a.candidatesCount +
          a.interviewsCount +
          a.initialInterviewsCount +
          a.secondInterviewsCount +
          a.finalInterviewsCount +
          a.hiredCount;
        const totalB =
          b.candidatesCount +
          b.interviewsCount +
          b.initialInterviewsCount +
          b.secondInterviewsCount +
          b.finalInterviewsCount +
          b.hiredCount;
        return totalB - totalA;
      });

    const finalizedTrends = Array.from(trendMap.values()).map((item) => finalizeMetrics(item));
    const usersWithData = finalizedUsers.filter((item) => hasAnyMetrics(item)).length;

    return NextResponse.json({
      success: true,
      data: {
        filters: {
          granularity,
          startDate: formatDateInput(start),
          endDate: formatDateInput(end),
        },
        teamSummary: {
          ...finalizeMetrics(teamMetrics),
          totalUsers: users.length,
          usersWithData,
        },
        users: finalizedUsers,
        trends: finalizedTrends,
      },
    });
  } catch (error) {
    console.error("[管理员招聘看板API] 错误:", error);

    if (error && typeof error === "object" && "statusCode" in error) {
      const authError = error as { message?: string; statusCode?: number };
      return NextResponse.json(
        { error: authError.message || "认证失败" },
        { status: authError.statusCode || 401 }
      );
    }

    return NextResponse.json(
      { success: false, error: "获取管理员招聘看板数据失败" },
      { status: 500 }
    );
  }
}
