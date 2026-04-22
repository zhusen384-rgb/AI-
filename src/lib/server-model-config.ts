import {
  ModelConfig,
  DEFAULT_MODEL_CONFIG,
  ModelScene,
} from "@/lib/model-config";

let serverModelConfig: ModelConfig = { ...DEFAULT_MODEL_CONFIG };

export function getServerModelConfig(): ModelConfig {
  return { ...serverModelConfig };
}

export function getServerModelForScene(scene: ModelScene): string {
  return serverModelConfig[scene];
}

export function setServerModelForScene(scene: ModelScene, modelId: string): ModelConfig {
  serverModelConfig[scene] = modelId;
  return getServerModelConfig();
}

export function updateServerModelConfig(config: Partial<ModelConfig>): ModelConfig {
  serverModelConfig = {
    ...serverModelConfig,
    ...config,
  };

  return getServerModelConfig();
}
