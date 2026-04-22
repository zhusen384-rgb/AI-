export interface InterviewerVoiceOption {
  id: string;
  label: string;
  description: string;
  speaker: string;
  meloSpeakerKey: string;
  meloSpeed: number;
  speechRate: number;
  loudnessRate: number;
  browserRate: number;
  browserPitch: number;
  browserVoiceKeywords: string[];
}

export const DEFAULT_INTERVIEWER_VOICE_ID = "warm_encouraging";

const BASE_INTERVIEWER_SPEAKER = "zh_male_m191_uranus_bigtts";
const WARM_FEMALE_SPEAKER = "zh_female_xiaohe_uranus_bigtts";

export const INTERVIEWER_VOICE_OPTIONS: InterviewerVoiceOption[] = [
  {
    id: "warm_encouraging",
    label: "温和自然",
    description: "更接近日常真人对话，适合默认 AI 面试官。",
    speaker: WARM_FEMALE_SPEAKER,
    meloSpeakerKey: "ZH",
    meloSpeed: 0.98,
    speechRate: -2,
    loudnessRate: 1,
    browserRate: 0.98,
    browserPitch: 1.03,
    browserVoiceKeywords: ["female", "xiaoxiao", "xiaoyi", "xiaohan", "meijia", "sinji", "microsoft xiaoxiao", "tingting", "google 普通话"],
  },
  {
    id: "calm_supportive",
    label: "平静耐心",
    description: "更舒缓克制，适合校招或需要陪伴感的场景。",
    speaker: WARM_FEMALE_SPEAKER,
    meloSpeakerKey: "ZH",
    meloSpeed: 0.88,
    speechRate: -12,
    loudnessRate: -1,
    browserRate: 0.88,
    browserPitch: 0.9,
    browserVoiceKeywords: ["female", "xiaoxiao", "xiaoyi", "yunxi", "meijia", "sinji", "soft", "microsoft xiaoxiao", "google 普通话"],
  },
  {
    id: "steady_professional",
    label: "沉稳专业",
    description: "语速更稳，适合正式、专业的结构化面试。",
    speaker: BASE_INTERVIEWER_SPEAKER,
    meloSpeakerKey: "ZH",
    meloSpeed: 0.94,
    speechRate: -8,
    loudnessRate: 0,
    browserRate: 0.92,
    browserPitch: 0.92,
    browserVoiceKeywords: ["male", "yunxi", "yunjian", "xiaoming", "gang", "boy", "microsoft yunxi", "ting-ting", "tingting", "google 普通话"],
  },
  {
    id: "clear_efficient",
    label: "清晰干练",
    description: "节奏更利落，适合短句提问和高效率面试。",
    speaker: BASE_INTERVIEWER_SPEAKER,
    meloSpeakerKey: "ZH",
    meloSpeed: 1.05,
    speechRate: 6,
    loudnessRate: 0,
    browserRate: 1.04,
    browserPitch: 0.95,
    browserVoiceKeywords: ["male", "xiaoming", "gang", "jun", "boy", "yunxi", "microsoft yunxi", "google 普通话"],
  },
];

export function getInterviewerVoiceOption(voiceId?: string | null): InterviewerVoiceOption {
  return (
    INTERVIEWER_VOICE_OPTIONS.find((voice) => voice.id === voiceId) ||
    INTERVIEWER_VOICE_OPTIONS.find((voice) => voice.id === DEFAULT_INTERVIEWER_VOICE_ID) ||
    INTERVIEWER_VOICE_OPTIONS[0]
  );
}

export function normalizeInterviewerVoiceId(voiceId?: string | null): string {
  return getInterviewerVoiceOption(voiceId).id;
}
