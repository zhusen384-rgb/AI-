/**
 * 模型配置辅助函数
 * 用于获取和管理不同场景的 AI 模型配置
 */

import { getDb } from './index';
import { modelConfigs } from './schema';
import { eq } from 'drizzle-orm';
import {
  ArkScene,
  getDefaultSceneModel,
  getDefaultSceneModelName,
  getModelInfo as getCatalogModelInfo,
  MODEL_CATALOG,
} from '@/lib/ai-models';

// 场景类型定义
export type ModelScene = ArkScene;

const MODEL_ID_CACHE_TTL_MS = 60_000;
const modelIdCache = new Map<ModelScene, { modelId: string; expiresAt: number }>();

// 场景配置
export const SCENE_CONFIG: Record<ModelScene, { name: string; description: string; defaultModel: string; defaultModelName: string }> = {
  interview_dialog: {
    name: '面试对话',
    description: '用于面试过程中的对话生成，需要快速响应和自然流畅的对话能力',
    defaultModel: getDefaultSceneModel('interview_dialog'),
    defaultModelName: getDefaultSceneModelName('interview_dialog'),
  },
  evaluation: {
    name: '评估打分',
    description: '用于面试后的评估打分，需要准确理解候选人回答并进行评分',
    defaultModel: getDefaultSceneModel('evaluation'),
    defaultModelName: getDefaultSceneModelName('evaluation'),
  },
  resume_parse: {
    name: '简历解析',
    description: '用于简历内容的解析和提取，需要视觉理解能力',
    defaultModel: getDefaultSceneModel('resume_parse'),
    defaultModelName: getDefaultSceneModelName('resume_parse'),
  },
};

// 可用模型列表
export const AVAILABLE_MODELS = MODEL_CATALOG.map((model) => ({
  id: model.id,
  name: model.name,
  category: model.category,
}));

/**
 * 初始化默认模型配置
 * 如果数据库中没有配置，则插入默认配置
 */
export async function initializeModelConfigs(): Promise<void> {
  const db = await getDb();
  
  for (const [scene, config] of Object.entries(SCENE_CONFIG)) {
    const existing = await db
      .select()
      .from(modelConfigs)
      .where(eq(modelConfigs.scene, scene))
      .limit(1);
    
    if (existing.length === 0) {
      await db.insert(modelConfigs).values({
        scene: scene,
        sceneName: config.name,
        modelId: config.defaultModel,
        modelName: config.defaultModelName,
        description: config.description,
        enabled: true,
      });
      console.log(`[ModelConfig] 初始化场景配置: ${scene} -> ${config.defaultModel}`);
    }
  }
}

/**
 * 获取指定场景的模型 ID
 * @param scene 场景标识
 * @returns 模型 ID，如果未配置则返回默认值
 */
export async function getModelId(scene: ModelScene): Promise<string> {
  try {
    const envDefaultModel = getDefaultSceneModel(scene);

    const cached = modelIdCache.get(scene);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.modelId;
    }

    const db = await getDb();
    
    const config = await db
      .select()
      .from(modelConfigs)
      .where(eq(modelConfigs.scene, scene))
      .limit(1);
    
    if (process.env.ARK_FORCE_SCENE_MODELS === 'true') {
      modelIdCache.set(scene, {
        modelId: envDefaultModel,
        expiresAt: Date.now() + MODEL_ID_CACHE_TTL_MS,
      });
      return envDefaultModel;
    }

    if (config.length > 0 && config[0].enabled) {
      modelIdCache.set(scene, {
        modelId: config[0].modelId,
        expiresAt: Date.now() + MODEL_ID_CACHE_TTL_MS,
      });
      return config[0].modelId;
    }
    
    // 返回默认模型
    modelIdCache.set(scene, {
      modelId: envDefaultModel,
      expiresAt: Date.now() + MODEL_ID_CACHE_TTL_MS,
    });
    return envDefaultModel;
  } catch (error) {
    console.error(`[ModelConfig] 获取模型配置失败: ${scene}`, error);
    // 返回默认模型
    return getDefaultSceneModel(scene);
  }
}

/**
 * 获取所有模型配置
 * @returns 所有场景的模型配置列表
 */
export async function getAllModelConfigs(): Promise<typeof modelConfigs.$inferSelect[]> {
  try {
    const db = await getDb();
    
    // 确保所有场景都有配置
    await initializeModelConfigs();
    
    const configs = await db
      .select()
      .from(modelConfigs)
      .orderBy(modelConfigs.id);
    
    return configs;
  } catch (error) {
    console.error('[ModelConfig] 获取所有模型配置失败', error);
    return [];
  }
}

/**
 * 更新模型配置
 * @param scene 场景标识
 * @param modelId 新的模型 ID
 * @returns 是否更新成功
 */
export async function updateModelConfig(
  scene: ModelScene,
  modelId: string
): Promise<boolean> {
  try {
    const db = await getDb();
    
    // 查找模型名称
    const model = AVAILABLE_MODELS.find(m => m.id === modelId);
    if (!model) {
      console.error(`[ModelConfig] 找不到模型: ${modelId}`);
      return false;
    }
    
    // 更新配置
    await db
      .update(modelConfigs)
      .set({
        modelId: modelId,
        modelName: model.name,
        updatedAt: new Date(),
      })
      .where(eq(modelConfigs.scene, scene));
    
    modelIdCache.delete(scene);
    console.log(`[ModelConfig] 更新模型配置: ${scene} -> ${modelId}`);
    return true;
  } catch (error) {
    console.error(`[ModelConfig] 更新模型配置失败: ${scene}`, error);
    return false;
  }
}

/**
 * 获取模型信息
 * @param modelId 模型 ID
 * @returns 模型信息
 */
export function getModelInfo(modelId: string): { id: string; name: string; category: string } | undefined {
  return getCatalogModelInfo(modelId);
}
