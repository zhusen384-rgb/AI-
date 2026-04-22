import type {
  ScoreRuleConfig,
  ScoreRuleDimension,
  ScoreRuleInterviewStrategy,
  ScoreRuleRequiredQuestion,
} from "@/lib/ai-score-rules";

export type DimensionCoverageState = {
  askedCount: number;
  followUpCount: number;
  coverageScore: number;
  coverageLevel: "missing" | "partial" | "enough";
  confidence: number;
  needFollowUp: boolean;
  lastEvidenceSummary: string;
};

export type RequiredQuestionRuntimeState = ScoreRuleRequiredQuestion & {
  asked: boolean;
  askedAtQuestionCount?: number;
};

export type CurrentQuestionMeta = {
  dimensionCode: string;
  requiredQuestionId?: string;
  isFollowUp: boolean;
  source: "required_question" | "dimension_question" | "technical_question";
  questionText: string;
  targetEvidence: string[];
  maxFollowUps: number;
};

export type RuleDrivenRuntimeState = {
  scoreRuleSnapshot: ScoreRuleConfig;
  dimensionCoverage: Record<string, DimensionCoverageState>;
  requiredQuestionState: RequiredQuestionRuntimeState[];
  currentQuestionMeta: CurrentQuestionMeta | null;
  askedQuestionKeys: string[];
};

export function initializeDimensionCoverage(rule: ScoreRuleConfig): Record<string, DimensionCoverageState> {
  return Object.fromEntries(
    rule.dimensions.map((dimension) => [
      dimension.code,
      {
        askedCount: 0,
        followUpCount: 0,
        coverageScore: 0,
        coverageLevel: "missing",
        confidence: 0,
        needFollowUp: false,
        lastEvidenceSummary: "",
      },
    ])
  );
}

export function initializeRequiredQuestionState(rule: ScoreRuleConfig): RequiredQuestionRuntimeState[] {
  return (rule.requiredQuestions || []).map((item) => ({
    ...item,
    asked: false,
  }));
}

export function createRuleDrivenRuntimeState(rule: ScoreRuleConfig): RuleDrivenRuntimeState {
  return {
    scoreRuleSnapshot: rule,
    dimensionCoverage: initializeDimensionCoverage(rule),
    requiredQuestionState: initializeRequiredQuestionState(rule),
    currentQuestionMeta: null,
    askedQuestionKeys: [],
  };
}

function normalizeAnswer(answer: string): string {
  return answer.replace(/\s+/g, " ").trim();
}

function isVagueAnswer(answer: string): boolean {
  const normalized = normalizeAnswer(answer);
  if (!normalized) {
    return true;
  }
  if (normalized.length < 25) {
    return true;
  }
  const vaguePhrases = ["还行", "一般", "差不多", "就这样", "没有了", "不知道", "忘了", "不太清楚"];
  return vaguePhrases.some((item) => normalized.includes(item));
}

function estimateCoverageDelta(answer: string, isFollowUp: boolean): { delta: number; confidence: number; summary: string; needFollowUp: boolean } {
  const normalized = normalizeAnswer(answer);
  const lengthScore = Math.min(1, normalized.length / 180);
  const hasNumbers = /\d+/.test(normalized);
  const hasSequence = /(因为|所以|然后|后来|当时|最后|最终|首先)/.test(normalized);
  const vague = isVagueAnswer(normalized);
  const base = isFollowUp ? 0.18 : 0.28;
  let delta = base + lengthScore * 0.18 + (hasNumbers ? 0.08 : 0) + (hasSequence ? 0.08 : 0);
  if (vague) {
    delta -= 0.18;
  }
  delta = Math.max(0.06, Math.min(0.5, delta));
  const confidence = Math.max(0.2, Math.min(0.95, lengthScore * 0.55 + (hasNumbers ? 0.15 : 0) + (hasSequence ? 0.15 : 0) + (vague ? -0.2 : 0.15)));
  return {
    delta,
    confidence,
    summary: normalized.slice(0, 120),
    needFollowUp: vague || normalized.length < 60 || (!hasNumbers && normalized.length < 100),
  };
}

export function updateCoverageAfterAnswer(
  coverage: Record<string, DimensionCoverageState>,
  meta: CurrentQuestionMeta | null,
  answer: string,
  fallbackStrategy: ScoreRuleInterviewStrategy
): Record<string, DimensionCoverageState> {
  if (!meta || !meta.dimensionCode || !coverage[meta.dimensionCode]) {
    return coverage;
  }

  const current = coverage[meta.dimensionCode];
  const next = { ...current };
  const estimated = estimateCoverageDelta(answer, meta.isFollowUp);
  next.coverageScore = Math.max(0, Math.min(1, next.coverageScore + estimated.delta));
  next.confidence = Math.max(next.confidence, estimated.confidence);
  next.lastEvidenceSummary = estimated.summary;
  if (meta.isFollowUp) {
    next.followUpCount += 1;
  }
  next.needFollowUp = estimated.needFollowUp && next.followUpCount < (meta.maxFollowUps ?? fallbackStrategy.maxFollowUpsPerQuestion);
  next.coverageLevel = next.coverageScore >= 0.75 ? "enough" : next.coverageScore >= 0.4 ? "partial" : "missing";

  return {
    ...coverage,
    [meta.dimensionCode]: next,
  };
}

export function markQuestionAsked(
  coverage: Record<string, DimensionCoverageState>,
  dimensionCode: string,
  isFollowUp: boolean
): Record<string, DimensionCoverageState> {
  if (!dimensionCode || !coverage[dimensionCode]) {
    return coverage;
  }
  const current = coverage[dimensionCode];
  return {
    ...coverage,
    [dimensionCode]: {
      ...current,
      askedCount: isFollowUp ? current.askedCount : current.askedCount + 1,
    },
  };
}

function questionWhenScore(item: RequiredQuestionRuntimeState, currentQuestionCount: number, strategy: ScoreRuleInterviewStrategy): number {
  const progress = strategy.maxCoreQuestions > 0 ? currentQuestionCount / strategy.maxCoreQuestions : 0;
  switch (item.when) {
    case "early":
      return progress <= 0.35 ? 2 : 0;
    case "middle":
      return progress > 0.2 && progress < 0.8 ? 2 : 0;
    case "late":
      return progress >= 0.6 ? 2 : 0;
    default:
      return 1;
  }
}

export function pickNextRequiredQuestion(
  requiredQuestions: RequiredQuestionRuntimeState[],
  currentQuestionCount: number,
  strategy: ScoreRuleInterviewStrategy
): RequiredQuestionRuntimeState | null {
  const pending = requiredQuestions.filter((item) => !item.asked);
  if (pending.length === 0) {
    return null;
  }

  return pending.sort((a, b) => questionWhenScore(b, currentQuestionCount, strategy) - questionWhenScore(a, currentQuestionCount, strategy))[0] || null;
}

export function selectNextDimension(
  rule: ScoreRuleConfig,
  coverage: Record<string, DimensionCoverageState>
): ScoreRuleDimension | null {
  const dimensions = [...rule.dimensions];
  dimensions.sort((left, right) => {
    const leftCoverage = coverage[left.code];
    const rightCoverage = coverage[right.code];
    const leftPriority = (left.mustAsk ? 100 : 0) + ((left.weight || 0) * 100) + ((leftCoverage?.coverageLevel === "missing" ? 20 : leftCoverage?.coverageLevel === "partial" ? 10 : 0));
    const rightPriority = (right.mustAsk ? 100 : 0) + ((right.weight || 0) * 100) + ((rightCoverage?.coverageLevel === "missing" ? 20 : rightCoverage?.coverageLevel === "partial" ? 10 : 0));
    return rightPriority - leftPriority;
  });
  return dimensions[0] || null;
}

export function shouldMoveToStage3(
  rule: ScoreRuleConfig,
  coverage: Record<string, DimensionCoverageState>,
  requiredQuestions: RequiredQuestionRuntimeState[],
  currentQuestionCount: number
): boolean {
  if (currentQuestionCount < rule.interviewStrategy.minCoreQuestions) {
    return false;
  }

  const pendingRequiredQuestion = requiredQuestions.some((item) => !item.asked);
  if (pendingRequiredQuestion && currentQuestionCount < rule.interviewStrategy.maxCoreQuestions) {
    return false;
  }

  const missingMustAsk = rule.dimensions.some((dimension) => {
    const state = coverage[dimension.code];
    const threshold = dimension.coverageThreshold ?? 0.75;
    if (!dimension.mustAsk) {
      return false;
    }
    return !state || state.coverageScore < threshold || state.askedCount < (dimension.minQuestions || 1);
  });

  if (missingMustAsk) {
    return false;
  }

  return currentQuestionCount >= rule.interviewStrategy.minCoreQuestions;
}
