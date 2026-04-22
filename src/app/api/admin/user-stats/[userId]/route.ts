import { NextRequest, NextResponse } from "next/server";
import { and, desc, eq, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import * as sharedSchema from "@/storage/database/shared/schema";
import { candidates, resumes } from "@/lib/db/schema";
import { authenticateApi } from "@/lib/api-auth";
import { ensureCandidatesTable } from "@/lib/db/ensure-candidates-table";
import { ensurePositionsTable } from "@/lib/db/ensure-positions-table";
import { ensureResumesTable } from "@/lib/db/ensure-resumes-table";
import { ensureFullAiInterviewResultsTable } from "@/lib/db/ensure-full-ai-interview-results-table";

async function safeRows<T>(queryFactory: () => Promise<T[]>, fallback: T[] = []) {
  try {
    return await queryFactory();
  } catch (error) {
    console.warn("[用户详情API] 查询失败，已回退为空结果:", error);
    return fallback;
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    const payload = await authenticateApi(request);

    if (payload.role !== "super_admin" && payload.role !== "admin") {
      return NextResponse.json(
        { error: "权限不足，仅管理员可访问" },
        { status: 403 }
      );
    }

    const { userId } = await params;
    const db = await getDb();

    await Promise.all([
      ensureCandidatesTable(),
      ensurePositionsTable(),
      ensureResumesTable(),
      ensureFullAiInterviewResultsTable(),
    ]);

    const [user] = await db
      .select({
        userId: sharedSchema.users.id,
        username: sharedSchema.users.username,
        name: sharedSchema.users.name,
        email: sharedSchema.users.email,
        role: sharedSchema.users.role,
        status: sharedSchema.users.status,
        tenantId: sharedSchema.users.tenantId,
        loginCount: sharedSchema.users.loginCount,
        lastLoginAt: sharedSchema.users.lastLoginAt,
        lastLoginIp: sharedSchema.users.lastLoginIp,
        createdAt: sharedSchema.users.createdAt,
        updatedAt: sharedSchema.users.updatedAt,
      })
      .from(sharedSchema.users)
      .where(eq(sharedSchema.users.id, userId))
      .limit(1);

    if (!user) {
      return NextResponse.json(
        { success: false, error: "用户不存在" },
        { status: 404 }
      );
    }

    const [
      positions,
      candidateStatuses,
      candidatesList,
      interviews,
      resumesList,
      loginLogs,
      activityLogs,
    ] = await Promise.all([
      safeRows(() =>
        db
          .select({
            id: sharedSchema.positions.id,
            title: sharedSchema.positions.title,
            department: sharedSchema.positions.department,
            status: sharedSchema.positions.status,
            createdAt: sharedSchema.positions.createdAt,
          })
          .from(sharedSchema.positions)
          .where(eq(sharedSchema.positions.userId, userId))
          .orderBy(desc(sharedSchema.positions.createdAt))
          .limit(5)
      ),
      safeRows(() =>
        db
          .select({
            status: candidates.status,
            count: sql<number>`count(*)`,
          })
          .from(candidates)
          .where(eq(candidates.createdById, userId))
          .groupBy(candidates.status)
      ),
      safeRows(() =>
        db
          .select({
            id: candidates.id,
            name: candidates.name,
            position: candidates.position,
            status: candidates.status,
            source: candidates.source,
            resumeUploaded: candidates.resumeUploaded,
            createdAt: candidates.createdAt,
          })
          .from(candidates)
          .where(eq(candidates.createdById, userId))
          .orderBy(desc(candidates.createdAt))
          .limit(5)
      ),
      safeRows(() =>
        db
          .select({
            id: sharedSchema.fullAiInterviewResults.id,
            interviewId: sharedSchema.fullAiInterviewResults.interviewId,
            candidateName: sharedSchema.fullAiInterviewResults.candidateName,
            position: sharedSchema.fullAiInterviewResults.position,
            evaluation: sharedSchema.fullAiInterviewResults.evaluation,
            completedAt: sharedSchema.fullAiInterviewResults.completedAt,
            createdAt: sharedSchema.fullAiInterviewResults.createdAt,
          })
          .from(sharedSchema.fullAiInterviewResults)
          .where(eq(sharedSchema.fullAiInterviewResults.userId, userId))
          .orderBy(desc(sharedSchema.fullAiInterviewResults.completedAt))
          .limit(5)
      ),
      safeRows(() =>
        db
          .select({
            id: resumes.id,
            candidateId: resumes.candidateId,
            fileName: resumes.fileName,
            createdAt: resumes.createdAt,
            candidateName: candidates.name,
            candidatePosition: candidates.position,
          })
          .from(resumes)
          .leftJoin(candidates, eq(resumes.candidateId, candidates.id))
          .where(eq(candidates.createdById, userId))
          .orderBy(desc(resumes.createdAt))
          .limit(5)
      ),
      safeRows(() =>
        db
          .select({
            id: sharedSchema.loginLogs.id,
            ip: sharedSchema.loginLogs.ip,
            status: sharedSchema.loginLogs.status,
            loginTime: sharedSchema.loginLogs.loginTime,
            failureReason: sharedSchema.loginLogs.failureReason,
            userAgent: sharedSchema.loginLogs.userAgent,
          })
          .from(sharedSchema.loginLogs)
          .where(eq(sharedSchema.loginLogs.userId, userId))
          .orderBy(desc(sharedSchema.loginLogs.loginTime))
          .limit(5)
      ),
      safeRows(() =>
        db
          .select({
            id: sharedSchema.userActivityLogs.id,
            action: sharedSchema.userActivityLogs.action,
            resource: sharedSchema.userActivityLogs.resource,
            resourceName: sharedSchema.userActivityLogs.resourceName,
            detail: sharedSchema.userActivityLogs.detail,
            createdAt: sharedSchema.userActivityLogs.createdAt,
          })
          .from(sharedSchema.userActivityLogs)
          .where(eq(sharedSchema.userActivityLogs.userId, userId))
          .orderBy(desc(sharedSchema.userActivityLogs.createdAt))
          .limit(5)
      ),
    ]);

    return NextResponse.json({
      success: true,
      data: {
        user,
        summary: {
          positionsCount: positions.length,
          candidatesCount: candidatesList.length,
          interviewsCount: interviews.length,
          resumesCount: resumesList.length,
          loginCount: Number(user.loginCount || 0),
          lastActiveAt: user.lastLoginAt,
          lastLoginIp: user.lastLoginIp,
        },
        candidateStatusCounts: candidateStatuses.map((item) => ({
          status: item.status,
          count: Number(item.count || 0),
        })),
        recentPositions: positions,
        recentCandidates: candidatesList,
        recentInterviews: interviews.map((item) => ({
          ...item,
          recommendation: (item.evaluation as { recommendation?: string } | null)?.recommendation || "unknown",
          overallScore5: (item.evaluation as { overallScore5?: number } | null)?.overallScore5 ?? 0,
          overallScore100: (item.evaluation as { overallScore100?: number } | null)?.overallScore100 ?? 0,
        })),
        recentResumes: resumesList,
        recentLogins: loginLogs,
        recentActivities: activityLogs,
      },
    });
  } catch (error) {
    console.error("[用户详情API] 错误:", error);

    if (error && typeof error === "object" && "statusCode" in error) {
      return NextResponse.json(
        { error: (error as any).message || "认证失败" },
        { status: (error as any).statusCode || 401 }
      );
    }

    return NextResponse.json(
      { success: false, error: "获取用户详情失败" },
      { status: 500 }
    );
  }
}
