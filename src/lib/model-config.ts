/**
 * 模型配置管理
 * 支持不同场景使用不同的 AI 模型
 */

import {
  DEFAULT_RESUME_VISION_MODEL,
  getDefaultSceneModel,
  MODEL_CATALOG,
} from "@/lib/ai-models";

// 可用模型列表
export const AVAILABLE_MODELS = {
  // 通用对话模型
  conversation: [
    ...MODEL_CATALOG.filter((model) => model.category === "deepseek" || model.category === "doubao" || model.category === "kimi" || model.category === "glm").map((model) => ({
      id: model.id,
      name: model.name,
      description: model.description,
    })),
  ],
  // 评估打分模型
  evaluation: [
    ...MODEL_CATALOG.filter((model) => model.category === "doubao" || model.category === "deepseek").map((model) => ({
      id: model.id,
      name: model.name,
      description: model.description,
    })),
  ],
  // 视觉模型（简历解析）
  vision: [
    ...MODEL_CATALOG.filter((model) => model.id === DEFAULT_RESUME_VISION_MODEL || model.id.includes("vision")).map((model) => ({
      id: model.id,
      name: model.name,
      description: model.description,
    })),
  ],
} as const;

// 场景类型
export type ModelScene = 'conversation' | 'evaluation' | 'vision';

// 模型配置接口
export interface ModelConfig {
  conversation: string;  // 面试对话模型
  evaluation: string;    // 评估打分模型
  vision: string;        // 视觉模型（简历解析）
}

// 默认模型配置
export const DEFAULT_MODEL_CONFIG: ModelConfig = {
  conversation: getDefaultSceneModel("interview_dialog"),
  evaluation: getDefaultSceneModel("evaluation"),
  vision: process.env.ARK_RESUME_VISION_MODEL || DEFAULT_RESUME_VISION_MODEL,
};

// 存储键名
const STORAGE_KEY = 'ai_model_config';

/**
 * 获取模型配置
 */
export function getModelConfig(): ModelConfig {
  if (typeof window !== 'undefined') {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        return { ...DEFAULT_MODEL_CONFIG, ...JSON.parse(saved) };
      } catch {
        console.error('[模型配置] 解析失败，使用默认配置');
      }
    }
  }
  return { ...DEFAULT_MODEL_CONFIG };
}

/**
 * 保存模型配置
 */
export function saveModelConfig(config: Partial<ModelConfig>): ModelConfig {
  const currentConfig = getModelConfig();
  const newConfig = { ...currentConfig, ...config };
  
  if (typeof window !== 'undefined') {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(newConfig));
  }
  
  return newConfig;
}

/**
 * 获取指定场景的模型 ID
 */
export function getModelForScene(scene: ModelScene): string {
  const config = getModelConfig();
  return config[scene];
}

/**
 * 验证模型 ID 是否有效
 */
export function isValidModel(modelId: string, scene: ModelScene): boolean {
  const models = AVAILABLE_MODELS[scene];
  return models.some(m => m.id === modelId);
}

/**
 * 获取模型信息
 */
export function getModelInfo(modelId: string, scene: ModelScene) {
  const models = AVAILABLE_MODELS[scene];
  return models.find(m => m.id === modelId);
}
