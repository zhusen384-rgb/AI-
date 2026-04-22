export type ArkScene = "interview_dialog" | "evaluation" | "resume_parse";

export interface ModelCatalogItem {
  id: string;
  name: string;
  description: string;
  category: "doubao" | "deepseek" | "glm" | "kimi";
}

export const DEFAULT_ARK_BASE_URL = "https://ark.cn-beijing.volces.com/api/v3";

export const DEFAULT_SCENE_MODELS: Record<ArkScene, string> = {
  interview_dialog: "doubao-seed-2-0-pro-260215",
  evaluation: "doubao-seed-2-0-pro-260215",
  resume_parse: "doubao-seed-2-0-pro-260215",
};

export const DEFAULT_RESUME_VISION_MODEL = "doubao-seed-1-8-251228";

const SCENE_ENV_KEYS: Record<ArkScene, string> = {
  interview_dialog: "ARK_INTERVIEW_MODEL",
  evaluation: "ARK_EVALUATION_MODEL",
  resume_parse: "ARK_RESUME_MODEL",
};

export const MODEL_CATALOG: ModelCatalogItem[] = [
  {
    id: "deepseek-v3-1-250821",
    name: "DeepSeek V3.1",
    description: "AI 面试默认模型，适合长对话与追问",
    category: "deepseek",
  },
  {
    id: "deepseek-v3-2-251201",
    name: "DeepSeek V3.2",
    description: "更强推理能力，适合复杂对话",
    category: "deepseek",
  },
  {
    id: "deepseek-r1-250528",
    name: "DeepSeek R1",
    description: "研究与分析能力更强",
    category: "deepseek",
  },
  {
    id: "doubao-seed-1-6-flash-250715",
    name: "豆包 Seed 1.6 Flash",
    description: "简历解析与评分默认模型，响应快",
    category: "doubao",
  },
  {
    id: "doubao-seed-1-6-thinking-250715",
    name: "豆包 Seed 1.6 Thinking",
    description: "更适合复杂评估与分析",
    category: "doubao",
  },
  {
    id: "doubao-seed-1-6-vision-250815",
    name: "豆包 Seed 1.6 Vision",
    description: "适合图片与 PDF 视觉解析",
    category: "doubao",
  },
  {
    id: "doubao-seed-1-8-251228",
    name: "豆包 Seed 1.8",
    description: "多模态能力更强，适合视觉简历提取",
    category: "doubao",
  },
  {
    id: "doubao-seed-2-0-pro-260215",
    name: "豆包 Seed 2.0 Pro",
    description: "旗舰模型，适合复杂推理",
    category: "doubao",
  },
  {
    id: "doubao-seed-2-0-lite-260215",
    name: "豆包 Seed 2.0 Lite",
    description: "均衡性能与成本",
    category: "doubao",
  },
  {
    id: "glm-4-7-251222",
    name: "GLM-4-7",
    description: "通用任务",
    category: "glm",
  },
  {
    id: "kimi-k2-250905",
    name: "Kimi K2",
    description: "长上下文能力较强",
    category: "kimi",
  },
  {
    id: "kimi-k2-5-260127",
    name: "Kimi K2.5",
    description: "Agent、代码、多模态能力更强",
    category: "kimi",
  },
];

export function getArkBaseUrl(): string {
  return (process.env.ARK_BASE_URL || DEFAULT_ARK_BASE_URL).trim().replace(/\/+$/, "");
}

export function getSceneEnvModel(scene: ArkScene): string | undefined {
  const dedicatedModel = process.env[SCENE_ENV_KEYS[scene]]?.trim();
  if (dedicatedModel) {
    return dedicatedModel;
  }

  if (scene === "interview_dialog") {
    const legacyModelName = process.env.MODEL_NAME?.trim();
    if (legacyModelName) {
      return legacyModelName;
    }
  }

  return undefined;
}

export function getDefaultSceneModel(scene: ArkScene): string {
  return getSceneEnvModel(scene) || DEFAULT_SCENE_MODELS[scene];
}

export function getModelInfo(modelId: string): ModelCatalogItem | undefined {
  return MODEL_CATALOG.find((model) => model.id === modelId);
}

export function getDefaultSceneModelName(scene: ArkScene): string {
  return getModelInfo(getDefaultSceneModel(scene))?.name || getDefaultSceneModel(scene);
}

export function isLikelyVisionModel(modelId: string): boolean {
  const normalized = modelId.toLowerCase();
  return normalized.includes("vision") || normalized.includes("vl");
}

export function getResumeVisionModel(): string {
  const explicitVisionModel = process.env.ARK_RESUME_VISION_MODEL?.trim();
  if (explicitVisionModel) {
    return explicitVisionModel;
  }

  const resumeModel = getDefaultSceneModel("resume_parse");
  if (isLikelyVisionModel(resumeModel)) {
    return resumeModel;
  }

  return DEFAULT_RESUME_VISION_MODEL;
}
