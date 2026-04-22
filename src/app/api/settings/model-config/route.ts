import { NextRequest, NextResponse } from "next/server";
import {
  ModelConfig,
  DEFAULT_MODEL_CONFIG,
  AVAILABLE_MODELS,
  ModelScene,
} from "@/lib/model-config";
import {
  getServerModelConfig,
  setServerModelForScene,
  updateServerModelConfig,
} from "@/lib/server-model-config";

const DEFAULT_CONFIG = { ...DEFAULT_MODEL_CONFIG };

/**
 * GET - 获取模型配置
 */
export async function GET() {
  return NextResponse.json({
    success: true,
    config: getServerModelConfig(),
    availableModels: AVAILABLE_MODELS,
    defaultConfig: DEFAULT_CONFIG,
  });
}

/**
 * POST - 更新模型配置
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { scene, modelId } = body as { scene: ModelScene; modelId: string };

    if (!scene || !modelId) {
      return NextResponse.json(
        { success: false, error: "缺少必要参数：scene 或 modelId" },
        { status: 400 }
      );
    }

    // 验证场景
    const validScenes: ModelScene[] = ["conversation", "evaluation", "vision"];
    if (!validScenes.includes(scene)) {
      return NextResponse.json(
        { success: false, error: `无效的场景：${scene}` },
        { status: 400 }
      );
    }

    // 验证模型 ID
    const models = AVAILABLE_MODELS[scene];
    const isValidModel = models.some((m) => m.id === modelId);
    if (!isValidModel) {
      return NextResponse.json(
        { success: false, error: `无效的模型 ID：${modelId}` },
        { status: 400 }
      );
    }

    // 更新配置
    const config = setServerModelForScene(scene, modelId);

    console.log(`[模型配置] 已更新 ${scene} 场景模型为 ${modelId}`);

    return NextResponse.json({
      success: true,
      config,
      message: `已将 ${getSceneName(scene)} 模型更新为 ${getModelName(modelId, scene)}`,
    });
  } catch (error) {
    console.error("[模型配置] 更新失败:", error);
    return NextResponse.json(
      { success: false, error: "更新模型配置失败" },
      { status: 500 }
    );
  }
}

/**
 * PUT - 批量更新模型配置
 */
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const incomingConfig = body as Partial<ModelConfig>;
    const nextConfig: Partial<ModelConfig> = {};

    // 验证并更新每个场景
    const validScenes: ModelScene[] = ["conversation", "evaluation", "vision"];
    
    for (const scene of validScenes) {
      if (incomingConfig[scene]) {
        const models = AVAILABLE_MODELS[scene];
        const isValidModel = models.some((m) => m.id === incomingConfig[scene]);
        if (isValidModel) {
          nextConfig[scene] = incomingConfig[scene]!;
        }
      }
    }

    const config = updateServerModelConfig(nextConfig);

    console.log("[模型配置] 批量更新完成:", config);

    return NextResponse.json({
      success: true,
      config,
      message: "模型配置已更新",
    });
  } catch (error) {
    console.error("[模型配置] 批量更新失败:", error);
    return NextResponse.json(
      { success: false, error: "批量更新模型配置失败" },
      { status: 500 }
    );
  }
}

// 辅助函数：获取场景名称
function getSceneName(scene: ModelScene): string {
  const names: Record<ModelScene, string> = {
    conversation: "面试对话",
    evaluation: "评估打分",
    vision: "简历解析",
  };
  return names[scene];
}

// 辅助函数：获取模型名称
function getModelName(modelId: string, scene: ModelScene): string {
  const models = AVAILABLE_MODELS[scene];
  const model = models.find((m) => m.id === modelId);
  return model?.name || modelId;
}
