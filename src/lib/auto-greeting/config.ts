import { getClient } from "coze-coding-dev-sdk";
import {
  DEFAULT_AUTO_REPLY_CONFIG,
  DEFAULT_HUMAN_SIMULATION_CONFIG,
} from "@/lib/auto-greeting/constants";

type PlainObject = Record<string, unknown>;

export interface AutoGreetingGeneralSettings {
  autoGreetingEnabled: boolean;
  autoReplyEnabled: boolean;
  maxDailyGreetings: number;
  greetingIntervalMin: number;
  greetingIntervalMax: number;
  replyDelayMin: number;
  replyDelayMax: number;
  workingHoursStart: string;
  workingHoursEnd: string;
  weekendEnabled: boolean;
}

export interface AutoGreetingRiskSettings {
  maxDailyGreetingsPerAccount: number;
  maxHourlyGreetings: number;
  minGreetingIntervalMin: number;
  minGreetingIntervalMax: number;
  maxRetryCount: number;
  riskThreshold: number;
  autoBlacklistEnabled: boolean;
  sensitiveWordsEnabled: boolean;
}

export interface AutoGreetingMatchingSettings {
  matchThreshold: number;
  skillWeight: number;
  experienceWeight: number;
  locationWeight: number;
  salaryWeight: number;
}

export interface AutoGreetingConversationSettings {
  maxConversationRounds: number;
  intentThreshold: number;
  sentimentThreshold: number;
  maxFollowUpDays: number;
  secondGreetingEnabled: boolean;
  secondGreetingDays: number;
}

export interface AutoGreetingNotificationSettings {
  interviewNotify: boolean;
  blacklistNotify: boolean;
  errorNotify: boolean;
  dailyReport: boolean;
  notifyEmail: string;
  notifyWebhook: string;
}

export interface AutoGreetingSettings {
  general: AutoGreetingGeneralSettings;
  risk: AutoGreetingRiskSettings;
  matching: AutoGreetingMatchingSettings;
  conversation: AutoGreetingConversationSettings;
  sensitiveWords: string[];
  notification: AutoGreetingNotificationSettings;
  platforms: Array<Record<string, unknown>>;
}

function isPlainObject(value: unknown): value is PlainObject {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function parseStoredValue(value: unknown): unknown {
  if (typeof value !== "string") {
    return value;
  }

  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

export function createDefaultAutoGreetingSettings(): AutoGreetingSettings {
  return {
    general: {
      autoGreetingEnabled: true,
      autoReplyEnabled: true,
      maxDailyGreetings: DEFAULT_HUMAN_SIMULATION_CONFIG.maxGreetings,
      greetingIntervalMin: DEFAULT_HUMAN_SIMULATION_CONFIG.minDelaySeconds,
      greetingIntervalMax: DEFAULT_HUMAN_SIMULATION_CONFIG.maxDelaySeconds,
      replyDelayMin: DEFAULT_AUTO_REPLY_CONFIG.replyDelayMin,
      replyDelayMax: DEFAULT_AUTO_REPLY_CONFIG.replyDelayMax,
      workingHoursStart: DEFAULT_HUMAN_SIMULATION_CONFIG.workingHoursStart,
      workingHoursEnd: DEFAULT_HUMAN_SIMULATION_CONFIG.workingHoursEnd,
      weekendEnabled: false,
    },
    risk: {
      maxDailyGreetingsPerAccount: 50,
      maxHourlyGreetings: 10,
      minGreetingIntervalMin: 20,
      minGreetingIntervalMax: 40,
      maxRetryCount: 3,
      riskThreshold: 80,
      autoBlacklistEnabled: true,
      sensitiveWordsEnabled: true,
    },
    matching: {
      matchThreshold: 60,
      skillWeight: 40,
      experienceWeight: 30,
      locationWeight: 20,
      salaryWeight: 10,
    },
    conversation: {
      maxConversationRounds: 20,
      intentThreshold: 70,
      sentimentThreshold: 30,
      maxFollowUpDays: 7,
      secondGreetingEnabled: true,
      secondGreetingDays: 3,
    },
    sensitiveWords: [],
    notification: {
      interviewNotify: true,
      blacklistNotify: true,
      errorNotify: true,
      dailyReport: true,
      notifyEmail: "",
      notifyWebhook: "",
    },
    platforms: [],
  };
}

export async function loadAutoGreetingSettings(): Promise<AutoGreetingSettings> {
  const client = await getClient();
  const settings = createDefaultAutoGreetingSettings();

  try {
    const result = await client.query(
      `
        SELECT category, key, value
        FROM ag_system_config
        ORDER BY category ASC, key ASC
      `
    );

    for (const row of result.rows) {
      const category = String(row.category || "");
      const key = String(row.key || "");
      const value = parseStoredValue(row.value);

      if (category === "platforms") {
        if (isPlainObject(value)) {
          settings.platforms = [
            ...settings.platforms.filter(platform => String(platform.id || "") !== key),
            value,
          ];
        }
        continue;
      }

      if (category === "sensitiveWords") {
        if (key === "words" && Array.isArray(value)) {
          settings.sensitiveWords = value.map(item => String(item)).filter(Boolean);
        }
        continue;
      }

      if (!["general", "risk", "matching", "conversation", "notification"].includes(category)) {
        continue;
      }

      const categorySettings = settings[category as keyof AutoGreetingSettings];
      if (isPlainObject(categorySettings)) {
        categorySettings[key] = value;
      }
    }

    return settings;
  } finally {
    client.release();
  }
}

export function mergeJobExecutionSettings(
  jobRow: Record<string, unknown>,
  settings: AutoGreetingSettings
) {
  const humanSimulation = {
    ...DEFAULT_HUMAN_SIMULATION_CONFIG,
    ...(isPlainObject(jobRow.human_simulation) ? jobRow.human_simulation : {}),
  };

  const autoReplyConfig = {
    ...DEFAULT_AUTO_REPLY_CONFIG,
    ...(isPlainObject(jobRow.auto_reply_config) ? jobRow.auto_reply_config : {}),
  };

  return {
    humanSimulation,
    autoReplyConfig,
    maxGreetings: Number(humanSimulation.maxGreetings || settings.general.maxDailyGreetings),
    greetingIntervalMin: Number(humanSimulation.minDelaySeconds || settings.general.greetingIntervalMin),
    greetingIntervalMax: Number(humanSimulation.maxDelaySeconds || settings.general.greetingIntervalMax),
    replyDelayMin: Number(autoReplyConfig.replyDelayMin || settings.general.replyDelayMin),
    replyDelayMax: Number(autoReplyConfig.replyDelayMax || settings.general.replyDelayMax),
    workingHoursStart: String(
      humanSimulation.workingHoursStart || settings.general.workingHoursStart
    ),
    workingHoursEnd: String(
      humanSimulation.workingHoursEnd || settings.general.workingHoursEnd
    ),
  };
}
