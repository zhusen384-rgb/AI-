import { NextRequest, NextResponse } from "next/server";
import {
  getAllModelConfigs,
  updateModelConfig,
  initializeModelConfigs,
  AVAILABLE_MODELS,
  SCENE_CONFIG,
  ModelScene
} from "@/lib/db/model-config-utils";
import { getDb } from "@/lib/db";
import { modelConfigs } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { authenticateApi, isAdmin } from "@/lib/api-auth";

/**
 * GET /api/model-configs
 * 获取所有模型配置（需要认证）
 */
export async function GET(request: NextRequest) {
  try {
    // JWT认证
    const payload = await authenticateApi(request);

    // 初始化默认配置（如果不存在）
    await initializeModelConfigs();

    // 获取所有配置
    const configs = await getAllModelConfigs();

    return NextResponse.json({
      success: true,
      data: {
        configs,
        availableModels: AVAILABLE_MODELS,
        sceneConfig: SCENE_CONFIG,
      },
    });
  } catch (error) {
    console.error("[ModelConfigs API] 获取配置失败:", error);

    // 认证错误
    if (error && typeof error === 'object' && 'statusCode' in error) {
      return NextResponse.json(
        { error: (error as any).message || '认证失败' },
        { status: (error as any).statusCode || 401 }
      );
    }

    return NextResponse.json(
      { success: false, error: "获取模型配置失败" },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/model-configs
 * 更新模型配置（需要认证）
 */
export async function PUT(request: NextRequest) {
  try {
    // JWT认证
    const payload = await authenticateApi(request);

    // 验证当前用户权限
    if (!isAdmin(payload)) {
      return NextResponse.json(
        { error: '权限不足，仅管理员可以更新模型配置' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { scene, modelId } = body;

    if (!scene || !modelId) {
      return NextResponse.json(
        { success: false, error: "缺少必要参数" },
        { status: 400 }
      );
    }

    // 验证场景
    if (!['interview_dialog', 'evaluation', 'resume_parse'].includes(scene)) {
      return NextResponse.json(
        { success: false, error: "无效的场景标识" },
        { status: 400 }
      );
    }

    // 验证模型
    const model = AVAILABLE_MODELS.find(m => m.id === modelId);
    if (!model) {
      return NextResponse.json(
        { success: false, error: "无效的模型 ID" },
        { status: 400 }
      );
    }

    // 更新配置
    const success = await updateModelConfig(scene as ModelScene, modelId);

    if (!success) {
      return NextResponse.json(
        { success: false, error: "更新配置失败" },
        { status: 500 }
      );
    }

    // 获取更新后的配置
    const db = await getDb();
    const updatedConfig = await db
      .select()
      .from(modelConfigs)
      .where(eq(modelConfigs.scene, scene))
      .limit(1);

    return NextResponse.json({
      success: true,
      data: updatedConfig[0],
      message: `已将 ${SCENE_CONFIG[scene as ModelScene].name} 的模型更新为 ${model.name}`,
    });
  } catch (error) {
    console.error("[ModelConfigs API] 更新配置失败:", error);

    // 认证错误
    if (error && typeof error === 'object' && 'statusCode' in error) {
      return NextResponse.json(
        { error: (error as any).message || '认证失败' },
        { status: (error as any).statusCode || 401 }
      );
    }

    return NextResponse.json(
      { success: false, error: "更新模型配置失败" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/model-configs
 * 重置模型配置为默认值（需要认证）
 */
export async function POST(request: NextRequest) {
  try {
    // JWT认证
    const payload = await authenticateApi(request);

    // 验证当前用户权限
    if (!isAdmin(payload)) {
      return NextResponse.json(
        { error: '权限不足，仅管理员可以重置模型配置' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { scene } = body;

    if (scene) {
      // 重置单个场景
      const defaultConfig = SCENE_CONFIG[scene as ModelScene];
      if (!defaultConfig) {
        return NextResponse.json(
          { success: false, error: "无效的场景标识" },
          { status: 400 }
        );
      }

      const success = await updateModelConfig(scene as ModelScene, defaultConfig.defaultModel);
      if (!success) {
        return NextResponse.json(
          { success: false, error: "重置配置失败" },
          { status: 500 }
        );
      }

      return NextResponse.json({
        success: true,
        message: `已将 ${defaultConfig.name} 重置为默认模型 ${defaultConfig.defaultModelName}`,
      });
    } else {
      // 重置所有场景
      const db = await getDb();

      for (const [sceneKey, config] of Object.entries(SCENE_CONFIG)) {
        await db
          .update(modelConfigs)
          .set({
            modelId: config.defaultModel,
            modelName: config.defaultModelName,
            updatedAt: new Date(),
          })
          .where(eq(modelConfigs.scene, sceneKey));
      }

      return NextResponse.json({
        success: true,
        message: "已将所有场景重置为默认模型配置",
      });
    }
  } catch (error) {
    console.error("[ModelConfigs API] 重置配置失败:", error);

    // 认证错误
    if (error && typeof error === 'object' && 'statusCode' in error) {
      return NextResponse.json(
        { error: (error as any).message || '认证失败' },
        { status: (error as any).statusCode || 401 }
      );
    }

    return NextResponse.json(
      { success: false, error: "重置模型配置失败" },
      { status: 500 }
    );
  }
}
