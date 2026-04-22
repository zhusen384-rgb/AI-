import type {
  BossCandidate,
  BossChatSession,
  BossJobHint,
} from "@/lib/auto-greeting/boss-operator";

export interface BossGreetingDiagnostics {
  buttonTextBefore?: string;
  buttonTextAfter?: string;
  startRequestSeen?: boolean;
  checkJobOpenSeen?: boolean;
  executionMode?: string;
  plannerAction?: string;
  plannerReasoning?: string;
}

export interface BossGreetingExecutionResult {
  success: boolean;
  error?: string;
  platformUserId?: string;
  actualMessage?: string;
  deliveryMode?: "boss_default_greet" | "custom_message";
  diagnostics?: BossGreetingDiagnostics;
}

export interface BossAutomationOperator {
  init(accountId: string): Promise<{ success: boolean; error?: string }>;
  close(): Promise<void>;
  gotoRecommendPage(jobHint?: BossJobHint): Promise<void>;
  gotoChatPage(): Promise<void>;
  getRecommendCandidates(jobHint?: BossJobHint): Promise<BossCandidate[]>;
  inspectCandidateResume(candidate: BossCandidate): Promise<BossCandidate>;
  sendGreeting(
    candidate: BossCandidate,
    message: string,
    jobHint?: BossJobHint
  ): Promise<BossGreetingExecutionResult>;
  getChatSessions(): Promise<BossChatSession[]>;
  getChatHistory(candidateId: string): Promise<Array<{
    id: string;
    content: string;
    sender: "hr" | "candidate";
    time: Date;
    rawTime?: string;
    type: "text" | "image" | "resume" | "contact";
  }>>;
  replyMessage(candidateId: string, message: string): Promise<{ success: boolean; error?: string }>;
  checkLogin(): Promise<boolean>;
  screenshot(): Promise<Uint8Array | null>;
}
