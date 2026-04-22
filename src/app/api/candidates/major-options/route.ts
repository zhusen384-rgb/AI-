import { NextRequest, NextResponse } from "next/server";
import { authenticateApi, isAuthError } from "@/lib/api-auth";
import {
  addCandidateMajorOptions,
  deleteCandidateMajorOption,
  getCandidateMajorOptions,
  renameCandidateMajorOption,
  syncCandidateMajorOptions,
} from "@/lib/candidate-major-options-settings";
import { dedupeCandidateMajorOptions, normalizeCandidateMajorOption } from "@/lib/candidate-major-library";

function isSuperAdminRole(role?: string | null): boolean {
  return role === "super_admin";
}

function collectMajors(body: unknown): string[] {
  if (!body || typeof body !== "object") {
    return [];
  }

  const major = "major" in body && typeof body.major === "string" ? body.major : "";
  const majors =
    "majors" in body && Array.isArray(body.majors)
      ? body.majors.filter((item): item is string => typeof item === "string")
      : [];

  return dedupeCandidateMajorOptions([major, ...majors]);
}

export async function GET(request: NextRequest) {
  try {
    await authenticateApi(request);

    return NextResponse.json({
      success: true,
      data: await getCandidateMajorOptions(),
    });
  } catch (error) {
    if (isAuthError(error)) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.statusCode }
      );
    }

    console.error("[candidate-major-options GET] 获取专业选项失败:", error);
    return NextResponse.json(
      { success: false, error: "获取专业选项失败" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const payload = await authenticateApi(request);
    const body = await request.json().catch(() => ({}));
    const majors = collectMajors(body);

    if (majors.length === 0) {
      return NextResponse.json(
        { success: false, error: "请提供至少一个专业名称" },
        { status: 400 }
      );
    }

    const mode =
      body && typeof body === "object" && "mode" in body && body.mode === "sync"
        ? "sync"
        : "manual";

    if (mode !== "sync" && !isSuperAdminRole(payload.role)) {
      return NextResponse.json(
        { success: false, error: "仅超级管理员可以维护专业库" },
        { status: 403 }
      );
    }

    const data =
      mode === "sync"
        ? await syncCandidateMajorOptions(majors, payload.userId)
        : await addCandidateMajorOptions(majors, payload.userId);

    return NextResponse.json({
      success: true,
      data,
    });
  } catch (error) {
    if (isAuthError(error)) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.statusCode }
      );
    }

    console.error("[candidate-major-options POST] 保存专业选项失败:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "保存专业选项失败" },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const payload = await authenticateApi(request);

    if (!isSuperAdminRole(payload.role)) {
      return NextResponse.json(
        { success: false, error: "仅超级管理员可以维护专业库" },
        { status: 403 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const previousMajor =
      body && typeof body === "object" && "previousMajor" in body && typeof body.previousMajor === "string"
        ? normalizeCandidateMajorOption(body.previousMajor)
        : "";
    const nextMajor =
      body && typeof body === "object" && "nextMajor" in body && typeof body.nextMajor === "string"
        ? normalizeCandidateMajorOption(body.nextMajor)
        : "";

    if (!previousMajor || !nextMajor) {
      return NextResponse.json(
        { success: false, error: "请提供原专业名称和新专业名称" },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      data: await renameCandidateMajorOption(previousMajor, nextMajor, payload.userId),
    });
  } catch (error) {
    if (isAuthError(error)) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.statusCode }
      );
    }

    console.error("[candidate-major-options PUT] 修改专业选项失败:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "修改专业选项失败" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const payload = await authenticateApi(request);

    if (!isSuperAdminRole(payload.role)) {
      return NextResponse.json(
        { success: false, error: "仅超级管理员可以维护专业库" },
        { status: 403 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const major =
      body && typeof body === "object" && "major" in body && typeof body.major === "string"
        ? normalizeCandidateMajorOption(body.major)
        : "";

    if (!major) {
      return NextResponse.json(
        { success: false, error: "请提供要删除的专业名称" },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      data: await deleteCandidateMajorOption(major, payload.userId),
    });
  } catch (error) {
    if (isAuthError(error)) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.statusCode }
      );
    }

    console.error("[candidate-major-options DELETE] 删除专业选项失败:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "删除专业选项失败" },
      { status: 500 }
    );
  }
}
