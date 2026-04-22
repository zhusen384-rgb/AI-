import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { fullAiInterviewResults } from "@/lib/db/schema";
import { authenticateApi, isAdmin } from "@/lib/api-auth";
import { buildTenantUserFilter } from "@/lib/tenant-filter";

export async function DELETE(request: NextRequest) {
  try {
    const payload = await authenticateApi(request);
    if (!isAdmin(payload)) {
      return NextResponse.json(
        { success: false, error: "权限不足" },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json(
        { success: false, error: "请提供面试ID" },
        { status: 400 }
      );
    }

    console.log(`[delete-result DELETE] 收到删除请求: id=${id}`);

    const db = await getDb();
    const conditions = [eq(fullAiInterviewResults.interviewId, id)];
    const accessFilter = buildTenantUserFilter(payload, fullAiInterviewResults);
    if (accessFilter) {
      conditions.push(accessFilter);
    }

    const [resultToDelete] = await db
      .select()
      .from(fullAiInterviewResults)
      .where(and(...conditions))
      .limit(1);

    if (!resultToDelete) {
      return NextResponse.json(
        { success: false, error: "面试结果不存在或无权访问" },
        { status: 404 }
      );
    }

    const result = await db
      .delete(fullAiInterviewResults)
      .where(eq(fullAiInterviewResults.id, resultToDelete.id))
      .returning();

    console.log(`[delete-result DELETE] 删除结果:`, {
      deletedCount: result.length,
      id,
    });

    return NextResponse.json({
      success: true,
      message: "删除成功",
    });
  } catch (error) {
    console.error("[delete-result DELETE] 删除面试结果失败:", error);

    if (error && typeof error === "object" && "statusCode" in error) {
      return NextResponse.json(
        { success: false, error: (error as { message?: string }).message || "认证失败" },
        { status: (error as { statusCode?: number }).statusCode || 401 }
      );
    }

    return NextResponse.json(
      { success: false, error: "删除面试结果失败" },
      { status: 500 }
    );
  }
}
