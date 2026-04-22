import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { ensurePositionsTable } from '@/lib/db/ensure-positions-table';
import { positions as sharedPositions } from '@/storage/database/shared/schema';
import { calculateMatchScoreWithPenalty } from '@/lib/optimization/calculate-score';
import { safeJsonParse } from '@/lib/utils/json-parser';
import { createCompatibleLlmClient } from '@/lib/ark-llm';
import { getModelId } from '@/lib/db/model-config-utils';
import { buildResumeParseCacheKey, getOrCreateParseCache } from '@/lib/resume-pipeline-cache';
import { registerParseResumeContent } from '@/lib/resume-helper-registry';
import {
  evaluatePositionVetoRules,
  normalizePositionVetoRules,
  type PositionVetoCheck,
  type PositionVetoRule,
} from '@/lib/position-veto-rules';
import {
  extractContactInfoFromText,
  extractNameFromResumeFileName,
  normalizeResumeEmail,
  normalizeResumeName,
  normalizeResumePhone,
} from '@/lib/resume-contact-info';

const client = createCompatibleLlmClient();
const POSITION_PAYLOAD_CACHE_TTL_MS = 60 * 1000;

type PositionPayloadCacheEntry = {
  value: PositionPayload | null;
  expiresAt: number;
};

type ResumeParseRouteGlobal = typeof globalThis & {
  __resumePositionPayloadCache?: Map<string, PositionPayloadCacheEntry>;
};

const resumeParseRouteGlobal = globalThis as ResumeParseRouteGlobal;
const positionPayloadCache =
  resumeParseRouteGlobal.__resumePositionPayloadCache ||
  (resumeParseRouteGlobal.__resumePositionPayloadCache = new Map<
    string,
    PositionPayloadCacheEntry
  >());

type ParsedResumeData = {
  basicInfo?: {
    name?: string;
    phone?: string;
    email?: string;
    age?: number | null;
    gender?: string;
    location?: string;
    workYears?: number | null;
    currentCompany?: string;
    currentPosition?: string;
  };
  workExperience?: Array<{
    company?: string;
    position?: string;
    duration?: string;
    responsibilities?: string[];
    achievements?: string[];
  }>;
  education?: {
    school?: string;
    major?: string;
    degree?: string;
    gpa?: string;
    scholarships?: string[];
  };
  skills?: Array<{
    name?: string;
    level?: string;
  }>;
  certificates?: Array<{
    name?: string;
    level?: string;
    date?: string;
  }>;
  projects?: Array<{
    name?: string;
    duration?: string;
    role?: string;
    tasks?: string[];
    results?: string[];
    technologies?: string[];
  }>;
  conflictMarkers?: Array<{
    type?: string;
    description?: string;
  }>;
  matchAnalysis?: {
    matchScore?: number;
    matchedItems?: Array<{ requirement?: string; evidence?: string }>;
    unmatchedItems?: Array<{ requirement?: string; gap?: string }>;
    strengths?: Array<string | { area?: string; description?: string; evidence?: string }>;
    weaknesses?: Array<string | { area?: string; description?: string; gap?: string }>;
    jobAspectAnalysis?: Array<{
      aspect?: string;
      conclusion?: string;
      evidence?: string;
    }>;
    vetoCheck?: PositionVetoCheck;
    [key: string]: unknown;
  };
  [key: string]: unknown;
};

type PositionPayload = {
  id?: number;
  positionId?: number;
  title?: string;
  department?: string;
  jobDescription?: string;
  education?: string;
  experience?: string;
  coreRequirements?: unknown;
  softSkills?: unknown;
  interviewerPreferences?: {
    focusAreas?: string[];
    questionStyle?: string;
    additionalNotes?: string;
  } | null;
  vetoRules?: PositionVetoRule[];
  candidateId?: number;
  resumeId?: number;
  [key: string]: unknown;
};

function readUnknownString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizePositionPayload(value: unknown): PositionPayload | null {
  if (!value) {
    return null;
  }

  if (typeof value === 'string') {
    const normalizedValue = value.trim();
    if (!normalizedValue) {
      return null;
    }

    const numericId = Number(normalizedValue);
    return Number.isFinite(numericId)
      ? { positionId: numericId, title: normalizedValue }
      : { title: normalizedValue };
  }

  if (typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  const input = value as Record<string, unknown>;
  const rawId = input.positionId ?? input.id;
  const numericId =
    typeof rawId === 'number'
      ? rawId
      : typeof rawId === 'string' && rawId.trim().length > 0 && Number.isFinite(Number(rawId))
        ? Number(rawId)
        : undefined;

  const interviewerPreferences =
    input.interviewerPreferences && typeof input.interviewerPreferences === 'object'
      ? (input.interviewerPreferences as PositionPayload['interviewerPreferences'])
      : null;

  return {
    id: numericId,
    positionId: numericId,
    title: readUnknownString(input.title) || readUnknownString(input.name),
    department: readUnknownString(input.department),
    jobDescription: readUnknownString(input.jobDescription) || readUnknownString(input.description),
    education: readUnknownString(input.education),
    experience: readUnknownString(input.experience),
    coreRequirements: input.coreRequirements,
    softSkills: input.softSkills,
    interviewerPreferences,
    vetoRules: normalizePositionVetoRules(input.vetoRules),
    candidateId: typeof input.candidateId === 'number' ? input.candidateId : undefined,
    resumeId: typeof input.resumeId === 'number' ? input.resumeId : undefined,
  };
}

function hasPositionAnalysisDetails(position: PositionPayload | null): position is PositionPayload {
  if (!position) {
    return false;
  }

  return Boolean(
    position.title ||
      position.jobDescription ||
      position.education ||
      position.experience ||
      (Array.isArray(position.coreRequirements) && position.coreRequirements.length > 0) ||
      (Array.isArray(position.softSkills) && position.softSkills.length > 0) ||
      position.interviewerPreferences
  );
}

async function resolvePositionPayload(positionInput: unknown): Promise<PositionPayload | null> {
  const normalizedPosition = normalizePositionPayload(positionInput);
  if (!normalizedPosition) {
    return null;
  }

  if (
    normalizedPosition.jobDescription ||
    normalizedPosition.education ||
    normalizedPosition.experience ||
    (Array.isArray(normalizedPosition.coreRequirements) && normalizedPosition.coreRequirements.length > 0) ||
    (Array.isArray(normalizedPosition.softSkills) && normalizedPosition.softSkills.length > 0) ||
    normalizedPosition.interviewerPreferences
  ) {
    return normalizedPosition;
  }

  const cacheKey = normalizedPosition.positionId
    ? `id:${normalizedPosition.positionId}`
    : normalizedPosition.title
      ? `title:${normalizedPosition.title.toLowerCase()}`
      : "";

  if (cacheKey) {
    const cached = positionPayloadCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.value;
    }
    if (cached) {
      positionPayloadCache.delete(cacheKey);
    }
  }

  try {
    await ensurePositionsTable();
    const db = await getDb();

    let matchedPosition: typeof sharedPositions.$inferSelect | undefined;
    if (typeof normalizedPosition.positionId === 'number' && Number.isFinite(normalizedPosition.positionId)) {
      const records = await db
        .select()
        .from(sharedPositions)
        .where(eq(sharedPositions.id, normalizedPosition.positionId))
        .limit(1);
      matchedPosition = records[0];
    }

    if (!matchedPosition && normalizedPosition.title) {
      const records = await db
        .select()
        .from(sharedPositions)
        .where(eq(sharedPositions.title, normalizedPosition.title))
        .limit(1);
      matchedPosition = records[0];
    }

    if (!matchedPosition) {
      if (cacheKey) {
        positionPayloadCache.set(cacheKey, {
          value: normalizedPosition,
          expiresAt: Date.now() + POSITION_PAYLOAD_CACHE_TTL_MS,
        });
      }
      return normalizedPosition;
    }

    const resolvedPosition = {
      ...normalizedPosition,
      id: matchedPosition.id,
      positionId: matchedPosition.id,
      title: matchedPosition.title,
      department: matchedPosition.department,
      jobDescription: matchedPosition.jobDescription,
      education: matchedPosition.education,
      experience: matchedPosition.experience || '',
      coreRequirements: matchedPosition.coreRequirements || [],
      softSkills: matchedPosition.softSkills || [],
      interviewerPreferences:
      matchedPosition.interviewerPreferences && typeof matchedPosition.interviewerPreferences === 'object'
          ? (matchedPosition.interviewerPreferences as PositionPayload['interviewerPreferences'])
          : null,
      vetoRules: normalizePositionVetoRules(matchedPosition.vetoRules),
    };

    if (cacheKey) {
      positionPayloadCache.set(cacheKey, {
        value: resolvedPosition,
        expiresAt: Date.now() + POSITION_PAYLOAD_CACHE_TTL_MS,
      });
    }

    return resolvedPosition;
  } catch (error) {
    console.error('[简历解析] 补齐岗位信息失败，继续使用原始岗位参数:', error);
    return normalizedPosition;
  }
}

const DEGREE_ORDER: Record<string, number> = {
  中专: 1,
  高中: 1,
  大专: 2,
  专科: 2,
  本科: 3,
  研究生: 4,
  硕士: 4,
  博士: 5,
};

const SKILL_PATTERNS: Array<{ name: string; aliases: string[] }> = [
  { name: 'Python', aliases: ['python'] },
  { name: 'FastAPI', aliases: ['fastapi'] },
  { name: 'WebSocket', aliases: ['websocket'] },
  { name: 'SSE', aliases: ['sse'] },
  { name: 'LangChain', aliases: ['langchain'] },
  { name: 'LlamaIndex', aliases: ['llamaindex'] },
  { name: 'AutoGen', aliases: ['autogen'] },
  { name: 'AgentScope', aliases: ['agentscope'] },
  { name: 'RAG', aliases: ['rag', '检索增强生成', '知识库检索'] },
  { name: 'Prompt 工程', aliases: ['prompt 工程', 'prompt工程', '提示词优化', '提示词'] },
  { name: 'LoRA', aliases: ['lora'] },
  { name: '通义千问', aliases: ['通义千问', 'qwen'] },
  { name: 'DeepSeek', aliases: ['deepseek'] },
  { name: 'ChatGPT', aliases: ['chatgpt', 'chatgpt'] },
  { name: 'DashScope', aliases: ['dashscope'] },
  { name: 'Ragas', aliases: ['ragas'] },
  { name: 'OpenCV', aliases: ['opencv'] },
  { name: 'PyTorch', aliases: ['pytorch'] },
  { name: 'TensorFlow', aliases: ['tensorflow'] },
  { name: 'YOLO', aliases: ['yolo'] },
  { name: 'CNN', aliases: ['cnn'] },
  { name: 'MySQL', aliases: ['mysql'] },
  { name: 'MinIO', aliases: ['minio'] },
  { name: 'Docker', aliases: ['docker'] },
  { name: 'Linux', aliases: ['linux'] },
  { name: 'Git', aliases: ['git'] },
  { name: 'MobaXterm', aliases: ['mobaxterm'] },
  { name: 'Pandas', aliases: ['pandas'] },
  { name: 'NumPy', aliases: ['numpy'] },
  { name: 'Matplotlib', aliases: ['matplotlib'] },
  { name: 'Vue', aliases: ['vue'] },
  { name: 'Element UI', aliases: ['element ui', 'elementui'] },
  { name: 'ReactFlow', aliases: ['reactflow'] },
  { name: 'API 测试', aliases: ['apipost', '接口测试', '联调'] },
  { name: '数据分析', aliases: ['数据分析'] },
  { name: '机器学习', aliases: ['机器学习'] },
  { name: '深度学习', aliases: ['深度学习'] },
  { name: '计算机视觉', aliases: ['计算机视觉'] },
  { name: '前端开发', aliases: ['前端', 'html', 'css', 'js'] },
  { name: '后端开发', aliases: ['后端', 'web 服务', 'web服务'] },
];

const TECH_KEYWORDS = Array.from(
  new Set(SKILL_PATTERNS.flatMap((item) => item.aliases.map((alias) => alias.toLowerCase())))
);

const SECTION_HEADER_ALIASES: Array<{ key: string; aliases: string[] }> = [
  { key: '基本信息', aliases: ['基本信息', '个人信息', '个人资料'] },
  { key: '教育背景', aliases: ['教育背景', '教育经历', '教育信息'] },
  { key: '项目经验', aliases: ['项目经验', '项目经历', '项目背景'] },
  { key: '工作经历', aliases: ['工作经历', '工作经验', '实习经历', '职业经历'] },
  { key: '技能特长', aliases: ['技能特长', '专业技能', '技能', '核心技能', '技术栈'] },
  { key: '荣誉证书', aliases: ['荣誉证书', '荣誉奖项', '证书', '获奖经历'] },
  { key: '自我评价', aliases: ['自我评价', '个人评价', '个人优势', '综合评价'] },
];

function isNoiseLine(line: string): boolean {
  const compact = line.replace(/\s+/g, '');
  if (!compact) return true;
  if (compact.length > 24 && /^[A-Za-z0-9_-]+$/.test(compact)) return true;
  return false;
}

function normalizeTextLines(text: string): string[] {
  return text
    .replace(/\r/g, '\n')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => Boolean(line) && !isNoiseLine(line));
}

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
}

function extractSections(lines: string[]): Record<string, string[]> {
  const sections: Record<string, string[]> = {};
  let currentSection = '全文';
  sections[currentSection] = [];

  for (const line of lines) {
    const matchedHeader = SECTION_HEADER_ALIASES.find(({ aliases }) =>
      aliases.some((header) => line.includes(header) && line.length <= 16)
    );
    if (matchedHeader) {
      currentSection = matchedHeader.key;
      if (!sections[currentSection]) {
        sections[currentSection] = [];
      }
      continue;
    }

    sections[currentSection].push(line);
  }

  return sections;
}

function lineIncludesAny(line: string, aliases: string[]): boolean {
  const lowerLine = line.toLowerCase();
  return aliases.some((alias) => lowerLine.includes(alias.toLowerCase()));
}

function collectEvidenceLines(lines: string[], aliases: string[], limit = 3): string[] {
  const results: string[] = [];

  for (const line of lines) {
    if (results.length >= limit) break;
    if (lineIncludesAny(line, aliases)) {
      results.push(line);
    }
  }

  return results;
}

function detectSkillLevel(text: string, skill: string): string {
  const lowerText = text.toLowerCase();
  const lowerSkill = skill.toLowerCase();
  const windowIndex = lowerText.indexOf(lowerSkill);
  if (windowIndex === -1) {
    return '掌握';
  }

  const context = lowerText.slice(Math.max(0, windowIndex - 12), windowIndex + lowerSkill.length + 12);
  if (/(精通|expert)/i.test(context)) return '精通';
  if (/(熟练|proficient)/i.test(context)) return '熟练';
  if (/(熟悉|familiar)/i.test(context)) return '熟悉';
  if (/(了解|know)/i.test(context)) return '了解';
  return '掌握';
}

function extractBasicEducation(text: string, lines: string[]) {
  const schoolLine = lines.find((line) => /(大学|学院|学校|school|university)/i.test(line)) || '';
  const schoolIndex = lines.findIndex((line) => line === schoolLine);
  const schoolMatch = schoolLine.match(/([\u4e00-\u9fa5A-Za-z（）()·\s]{2,40}(?:大学|学院|学校))/);
  const degreeMatch = text.match(/(博士研究生|硕士研究生|博士|硕士|研究生|本科|大专|专科)/);
  const majorMatch = text.match(/(?:专业|方向|major)\s*[:：]?\s*([\u4e00-\u9fa5A-Za-z0-9（）()\/\s]{2,40})/i);
  const schoolNextLine = schoolIndex >= 0 ? (lines[schoolIndex + 1] || '') : '';
  const inlineMajorDegreeMatch = schoolNextLine.match(
    /([\u4e00-\u9fa5A-Za-z0-9（）()\/]+)\s*[·•▪\-\s]\s*(本科|硕士|博士|大专|专科)/
  );
  const gpaMatch = text.match(/(?:GPA|绩点|相关课程)\s*[:：]?\s*([^\n]+)/i);

  return {
    school: schoolMatch?.[1]?.trim() || '',
    degree: degreeMatch?.[1] || '',
    major: majorMatch?.[1]?.trim() || inlineMajorDegreeMatch?.[1]?.trim() || '',
    gpa: gpaMatch?.[1]?.trim() || '',
    scholarships: [],
  };
}

function extractSkillsFromText(text: string) {
  const lowerText = text.toLowerCase();

  return SKILL_PATTERNS
    .filter((skill) => skill.aliases.some((alias) => lowerText.includes(alias.toLowerCase())))
    .slice(0, 24)
    .map((skill) => ({
      name: skill.name,
      level: detectSkillLevel(text, skill.aliases[0]),
    }));
}

function cleanBulletPrefix(line: string): string {
  return line.replace(/^[\s•●▪◆★☆\-—–·\d.、()（）]+/, '').trim();
}

function normalizeEntryLines(lines: string[]): string[] {
  return lines
    .map((line) => cleanBulletPrefix(line))
    .filter((line) => line.length > 0);
}

function extractDuration(line: string): string {
  return line.match(/((?:19|20)\d{2}[./-]\d{1,2}\s*(?:-|~|至|到|—|–)\s*(?:(?:19|20)\d{2}[./-]\d{1,2}|至今|现在))/)?.[1] || '';
}

function extractCompanyFromLine(line: string): string {
  const matched = line.match(/([\u4e00-\u9fa5A-Za-z0-9（）()·\s]{2,50}(?:公司|集团|科技|信息|网络|软件|智能|有限责任公司|有限公司|研究院|事务所|银行|大学|医院))/);
  return matched?.[1]?.trim() || '';
}

function isQuantifiedResult(line: string): boolean {
  return /(\d+%|\d+\+|提升|优化|增长|降低|完成|上线|交付|落地|达成|节省|缩短|获奖|准确率|召回率|转化率|效率|稳定性|性能)/.test(line);
}

function isRoleLine(line: string): boolean {
  return /(担任|任职|岗位|角色|职位|负责人|开发工程师|算法工程师|产品经理|运营|实习生)/.test(line);
}

function isLikelyWorkHeader(line: string): boolean {
  return Boolean(
    extractDuration(line) &&
      (/(公司|集团|科技|有限|软件|网络|信息|银行|研究院|医院|大学)/.test(line) ||
        /(工程师|开发|算法|产品|运营|经理|顾问|实习)/.test(line))
  );
}

function isLikelyProjectHeader(line: string): boolean {
  return Boolean(
    /项目|系统|平台|方案|应用|助手|问答|管理|小程序|网站|App|APP/i.test(line) &&
      (line.length <= 40 || Boolean(extractDuration(line)))
  );
}

function splitEntries(
  lines: string[],
  isHeader: (line: string) => boolean
): string[][] {
  const normalized = normalizeEntryLines(lines);
  const entries: string[][] = [];
  let current: string[] = [];

  for (const line of normalized) {
    if (isHeader(line)) {
      if (current.length > 0) {
        entries.push(current);
      }
      current = [line];
      continue;
    }

    if (current.length === 0) {
      current = [line];
    } else {
      current.push(line);
    }
  }

  if (current.length > 0) {
    entries.push(current);
  }

  return entries.filter((entry) => entry.length > 0);
}

function dedupeNonEmpty(values: Array<string | undefined>, limit = 6): string[] {
  return Array.from(
    new Set(
      values
        .map((item) => item?.trim() || '')
        .filter((item) => item.length > 0)
    )
  ).slice(0, limit);
}

function extractResponsibilities(lines: string[]): string[] {
  return dedupeNonEmpty(
    lines.filter((line) => /(负责|参与|主导|设计|开发|搭建|维护|实现|推进|协同|编写|完成|支持|对接)/.test(line)),
    5
  );
}

function extractAchievements(lines: string[]): string[] {
  const quantified = lines.filter((line) => isQuantifiedResult(line));
  if (quantified.length > 0) {
    return dedupeNonEmpty(quantified, 4);
  }

  return dedupeNonEmpty(
    lines.filter((line) => /(上线|交付|落地|优化|提升|改进|完成|达成|解决|支撑)/.test(line)),
    4
  );
}

function extractTechnologies(lines: string[]): string[] {
  const text = lines.join(' ').toLowerCase();
  return dedupeNonEmpty(
    SKILL_PATTERNS.filter((item) => item.aliases.some((alias) => text.includes(alias.toLowerCase()))).map((item) => item.name),
    8
  );
}

function parseWorkEntriesFromSection(lines: string[]) {
  return splitEntries(lines, isLikelyWorkHeader)
    .map((entry) => {
      const [header, ...detailLines] = entry;
      const allLines = [header, ...detailLines];
      const duration = extractDuration(header) || detailLines.map(extractDuration).find(Boolean) || '';
      const company = extractCompanyFromLine(header) || detailLines.map(extractCompanyFromLine).find(Boolean) || '';
      const roleLine = allLines.find((line) => isRoleLine(line)) || header;
      const position = roleLine
        .replace(company, '')
        .replace(duration, '')
        .replace(/[()（）·•▪]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      const responsibilities = extractResponsibilities(detailLines);
      const achievements = extractAchievements(detailLines);

      return {
        company,
        position,
        duration,
        responsibilities,
        achievements,
      };
    })
    .filter((entry) => entry.company || entry.position || entry.duration)
    .slice(0, 6);
}

function parseProjectsFromSection(lines: string[]) {
  return splitEntries(lines, isLikelyProjectHeader)
    .map((entry) => {
      const [header, ...detailLines] = entry;
      const duration = extractDuration(header) || detailLines.map(extractDuration).find(Boolean) || '';
      const roleLine = detailLines.find((line) => /(角色|担任|负责|职位)/.test(line)) || '';
      const role = roleLine.replace(/^(角色|担任|负责|职位)\s*[:：]?/, '').trim();
      const tasks = extractResponsibilities(detailLines);
      const results = extractAchievements(detailLines);
      const technologies = extractTechnologies(entry);

      return {
        name: header.replace(duration, '').replace(/\s+/g, ' ').trim(),
        duration,
        role,
        tasks,
        results,
        technologies,
      };
    })
    .filter((entry) => entry.name)
    .slice(0, 6);
}

function extractProjects(lines: string[]) {
  return parseProjectsFromSection(lines);
}

function extractWorkExperience(lines: string[]) {
  return parseWorkEntriesFromSection(lines);
}

function inferWorkYears(text: string): number | null {
  const directMatch = text.match(/(\d{1,2})\s*年(?:工作经验|经验)/);
  if (directMatch?.[1]) {
    return Number(directMatch[1]);
  }

  const yearMentions = Array.from(text.matchAll(/20(\d{2})[./-]\d{1,2}/g)).map((match) => Number(`20${match[1]}`));
  if (yearMentions.length >= 2) {
    const years = Math.max(...yearMentions) - Math.min(...yearMentions);
    return years > 0 && years < 20 ? years : null;
  }

  return null;
}

function getRequirementKeywords(position: PositionPayload): string[] {
  const source = [
    position.title,
    position.department,
    position.jobDescription,
    position.education,
    position.experience,
  ].filter(Boolean).join(' ');

  const lowerSource = source.toLowerCase();
  const keywords = new Set<string>();

  for (const keyword of TECH_KEYWORDS) {
    if (lowerSource.includes(keyword.toLowerCase())) {
      keywords.add(keyword);
    }
  }

  const englishWords = lowerSource.match(/\b[a-z][a-z0-9+#.-]{2,}\b/g) || [];
  for (const word of englishWords) {
    if (!['and', 'the', 'with', 'for', 'you', 'are', 'this'].includes(word)) {
      keywords.add(word);
    }
    if (keywords.size >= 12) break;
  }

  return Array.from(keywords).slice(0, 12);
}

function findEvidenceForKeyword(lines: string[], keyword: string): string {
  const matchedLine = lines.find((line) => line.toLowerCase().includes(keyword.toLowerCase()));
  return matchedLine || `简历中提到了 ${keyword} 相关经验`;
}

function extractRequirementStatements(position: PositionPayload): string[] {
  const rawSegments = [position.title, position.education, position.experience, position.jobDescription]
    .filter(Boolean)
    .join('\n')
    .split(/[\n。；;]/)
    .map((segment) => segment.trim())
    .filter((segment) => segment.length >= 6 && segment.length <= 80);

  return Array.from(new Set(rawSegments)).slice(0, 10);
}

function extractQuantifiedAchievements(lines: string[]): string[] {
  return lines.filter((line) => /(\d+\+|\d+%|≤\s*\d+|准确率|响应速度|提升|入库|分类|推荐)/.test(line)).slice(0, 6);
}

function buildDetailedStrengths(
  sections: Record<string, string[]>,
  parsedData: ParsedResumeData,
  matchedKeywords: string[]
): Array<string | { area?: string; description?: string; evidence?: string }> {
  const projectLines = sections['项目经验'] || [];
  const workLines = sections['工作经历'] || [];
  const skillLines = sections['技能特长'] || [];
  const honorLines = sections['荣誉证书'] || [];
  const allLines = [...projectLines, ...workLines, ...skillLines];
  const strengths: Array<string | { area?: string; description?: string; evidence?: string }> = [];

  const ragEvidence = collectEvidenceLines(allLines, [
    'rag', 'langchain', 'llamaindex', 'agentscope', 'autogen', '通义千问', 'qwen', 'dashscope', 'ragas'
  ], 4);
  if (ragEvidence.length > 0) {
    strengths.push({
      area: '大模型与 RAG 技术能力',
      description: '具备较扎实的大模型应用、知识库检索与智能体编排实践，能完成从文档处理、检索链路设计到问答优化的完整落地。',
      evidence: ragEvidence.join('；'),
    });
  }

  const engineeringEvidence = collectEvidenceLines(allLines, [
    'fastapi', 'docker', 'linux', 'vue', 'reactflow', 'websocket', 'sse', 'mysql', 'minio'
  ], 4);
  if (engineeringEvidence.length > 0) {
    strengths.push({
      area: '全栈工程化能力',
      description: '具备后端服务开发、前端交互、容器化部署与数据存储协同能力，能够把算法或智能体能力接入到可用系统中。',
      evidence: engineeringEvidence.join('；'),
    });
  }

  const quantifiedAchievements = extractQuantifiedAchievements([...projectLines, ...workLines]);
  if (quantifiedAchievements.length > 0) {
    strengths.push({
      area: '项目落地与问题解决能力',
      description: '项目经历中不只是参与实现，还能通过评估、调优和工程改造拿到可量化的结果，体现出较强的问题拆解和迭代能力。',
      evidence: quantifiedAchievements.join('；'),
    });
  }

  if ((honorLines.length > 0 || (parsedData.skills?.length || 0) >= 10) && strengths.length < 4) {
    strengths.push({
      area: '学习与技术迭代能力',
      description: '覆盖技术面较广，既有大模型、RAG，也有传统后端、数据处理和深度学习工具，说明学习速度和技术迁移能力较强。',
      evidence: [...honorLines.slice(0, 3), ...matchedKeywords.slice(0, 4)].join('；'),
    });
  }

  const teamworkEvidence = collectEvidenceLines(workLines, ['联调', '协同', '团队', '接口测试', '异常处理'], 3);
  if (teamworkEvidence.length > 0 && strengths.length < 5) {
    strengths.push({
      area: '沟通协作与交付配合',
      description: '能够在接口联调、问题定位和节点维护中与前后端或业务侧协作，具备一定的跨角色沟通基础。',
      evidence: teamworkEvidence.join('；'),
    });
  }

  return strengths;
}

function buildDetailedWeaknesses(
  position: PositionPayload,
  sections: Record<string, string[]>,
  missingKeywords: string[]
): Array<string | { area?: string; description?: string; gap?: string }> {
  const lowerJobDescription = String(position.jobDescription || '').toLowerCase();
  const allText = Object.values(sections).flat().join('\n').toLowerCase();
  const weaknesses: Array<string | { area?: string; description?: string; gap?: string }> = [];

  for (const keyword of missingKeywords.slice(0, 4)) {
    weaknesses.push({
      area: keyword,
      description: `岗位描述中对 ${keyword} 有明确期待，但简历里缺少足够直接的项目、工作成果或生产环境落地证据。`,
      gap: `建议补充 ${keyword} 的项目背景、使用深度、业务结果或线上部署经验。`,
    });
  }

  if (/零售|门店|pos|商品|库存/.test(lowerJobDescription) && !/零售|门店|pos|商品|库存/.test(allText)) {
    weaknesses.push({
      area: '业务行业经验',
      description: '当前经历主要集中在教育、诊疗、制造业和 AI 平台，若岗位面向零售或门店数字化场景，业务迁移成本会更高。',
      gap: '缺少零售业务流程、POS、门店履约、商品/库存等场景经验。',
    });
  }

  if (/(milvus|faiss|pgvector)/.test(lowerJobDescription) && !/(milvus|faiss|pgvector)/.test(allText)) {
    weaknesses.push({
      area: '向量库多样性',
      description: '简历体现了 RAG 与本地向量存储能力，但未明确展示 Milvus、FAISS、PGVector 等主流向量库的使用经验。',
      gap: '缺少主流开源向量数据库的选型、部署和调优案例。',
    });
  }

  if (/(流程自动化|工作流|自动编排|agent workflow)/.test(lowerJobDescription) && !/(流程自动化|工作流)/.test(allText)) {
    weaknesses.push({
      area: '流程自动化深度',
      description: '已有智能体节点和编排经验，但如果岗位要求复杂业务流程自动化，简历里对长链路编排和线上稳定性优化的描述还不够充分。',
      gap: '可补充工作流编排复杂度、异常恢复机制、监控指标与线上优化经验。',
    });
  }

  return weaknesses.slice(0, 5);
}

function buildDetailedMatchedItems(
  requirementStatements: string[],
  lines: string[]
): Array<{ requirement?: string; evidence?: string }> {
  const items: Array<{ requirement?: string; evidence?: string }> = [];

  for (const statement of requirementStatements) {
    const relatedKeywords = TECH_KEYWORDS.filter((keyword) => statement.toLowerCase().includes(keyword.toLowerCase())).slice(0, 3);
    const evidenceLines = relatedKeywords.length > 0
      ? lines.filter((line) => relatedKeywords.some((keyword) => line.toLowerCase().includes(keyword.toLowerCase()))).slice(0, 2)
      : [];

    if (evidenceLines.length > 0) {
      items.push({
        requirement: statement,
        evidence: evidenceLines.join('；'),
      });
    }
  }

  return items.slice(0, 6);
}

function buildDetailedConflictMarkers(
  sections: Record<string, string[]>
): Array<{ type?: string; description?: string }> {
  const workLines = sections['工作经历'] || [];
  const projectLines = sections['项目经验'] || [];
  const markers: Array<{ type?: string; description?: string }> = [];
  const now = new Date();
  const currentYearMonth = now.getFullYear() * 100 + (now.getMonth() + 1);

  const dateRanges = [...workLines, ...projectLines]
    .map((line) => {
      const match = line.match(/(20\d{2})[-./](\d{1,2}).*?(20\d{2})[-./](\d{1,2}|至今|现在)/);
      return { line, match };
    })
    .filter((item) => item.match);

  for (const item of dateRanges) {
    const match = item.match!;
    const start = Number(match[1]) * 100 + Number(match[2]);
    const end = /至今|现在/.test(match[4])
      ? currentYearMonth
      : Number(match[3]) * 100 + Number(match[4]);

    if (start > end) {
      markers.push({
        type: '时间线矛盾',
        description: `时间范围存在前后倒置：${item.line}`,
      });
    }

    if (start > currentYearMonth + 1) {
      markers.push({
        type: '未来时间标记',
        description: `经历起始时间晚于当前时间，建议核对是否填写错误：${item.line}`,
      });
    }
  }

  return markers;
}

function buildJobAspectAnalysis(
  position: PositionPayload,
  parsedData: ParsedResumeData,
  sections: Record<string, string[]>,
  matchedKeywords: string[],
  missingKeywords: string[]
) {
  const analyses: Array<{ aspect?: string; conclusion?: string; evidence?: string }> = [];
  const coreRequirements = readStringArray(position.coreRequirements);
  const softSkills = readStringArray(position.softSkills);
  const preferenceFocus = readStringArray(position.interviewerPreferences?.focusAreas);
  const skillNames = (parsedData.skills || []).map((skill) => skill.name).filter(Boolean).join('、');

  if (position.education) {
    analyses.push({
      aspect: '学历要求',
      conclusion: parsedData.education?.degree
        ? `岗位要求 ${position.education}，候选人当前识别学历为 ${parsedData.education.degree}，可作为学历匹配判断依据。`
        : `岗位要求 ${position.education}，但简历中的学历层次信息仍需结合教育经历进一步确认。`,
      evidence: `${parsedData.education?.school || '教育背景'} ${parsedData.education?.major || ''} ${parsedData.education?.degree || ''}`.trim(),
    });
  }

  if (position.experience) {
    analyses.push({
      aspect: '经验要求',
      conclusion: `岗位经验要求为 ${position.experience}，当前简历展示的相关项目/工作经历将作为经验匹配的核心依据。`,
      evidence: [...(sections['工作经历'] || []).slice(0, 2), ...(sections['项目经验'] || []).slice(0, 2)].join('；') || '简历中的工作与项目经历',
    });
  }

  if (position.jobDescription) {
    analyses.push({
      aspect: '岗位描述',
      conclusion: `岗位描述中的核心关注点与候选人简历存在 ${matchedKeywords.length} 项直接重合${missingKeywords.length > 0 ? `，也有 ${missingKeywords.length} 项需要补证` : ''}。`,
      evidence: matchedKeywords.slice(0, 6).join('、') || '根据岗位描述与简历全文比对得到',
    });
  }

  if (coreRequirements.length > 0) {
    analyses.push({
      aspect: '核心能力要求',
      conclusion: `岗位配置了 ${coreRequirements.length} 项核心能力要求，当前简历已能覆盖其中一部分，但仍需结合项目职责和落地结果做深度验证。`,
      evidence: `核心要求：${coreRequirements.join('、')}；已识别技能：${skillNames || '待补充'}`,
    });
  }

  if (softSkills.length > 0) {
    analyses.push({
      aspect: '软技能要求',
      conclusion: `岗位强调 ${softSkills.join('、')} 等软技能，当前简历可从团队协作、联调配合、知识分享等表述中找到部分佐证。`,
      evidence: [...(sections['工作经历'] || []).filter((line) => /(协同|沟通|团队|分享|联调)/.test(line)).slice(0, 2), ...(sections['自我评价'] || []).slice(0, 1)].join('；') || '需结合后续面试进一步验证',
    });
  }

  if (preferenceFocus.length > 0 || position.interviewerPreferences?.questionStyle || position.interviewerPreferences?.additionalNotes) {
    analyses.push({
      aspect: '面试官偏好',
      conclusion: `面试官偏好会影响简历关注重点，系统已将重点考察领域、提问风格和补充说明纳入匹配分析。`,
      evidence: [
        preferenceFocus.length > 0 ? `重点考察：${preferenceFocus.join('、')}` : '',
        position.interviewerPreferences?.questionStyle ? `提问风格：${position.interviewerPreferences.questionStyle}` : '',
        position.interviewerPreferences?.additionalNotes ? `补充说明：${position.interviewerPreferences.additionalNotes}` : '',
      ].filter(Boolean).join('；'),
    });
  }

  return analyses;
}

function normalizeDegree(degree: string): string {
  if (!degree) return '';
  if (degree.includes('博士')) return '博士';
  if (degree.includes('硕士') || degree.includes('研究生')) return '硕士';
  if (degree.includes('本科')) return '本科';
  if (degree.includes('大专') || degree.includes('专科')) return '大专';
  return degree;
}

type ResumeParseContext = {
  lines: string[];
  sections: Record<string, string[]>;
  resumeLower: string;
  requirementStatements: string[];
  requirementKeywords: string[];
  matchedKeywords: string[];
  missingKeywords: string[];
  fallbackData: ParsedResumeData;
};

function createResumeParseContext(
  resumeContent: string,
  position?: PositionPayload | null
): ResumeParseContext {
  const lines = normalizeTextLines(resumeContent);
  const sections = extractSections(lines);
  const contactInfo = extractContactInfoFromText(resumeContent);
  const workExperience = extractWorkExperience(lines);
  const education = extractBasicEducation(resumeContent, lines);
  const skills = extractSkillsFromText(resumeContent);
  const projects = extractProjects(lines);
  const ageMatch = /年龄\s*[:：]?\s*(\d{1,2})/.exec(resumeContent);
  const locationMatch = /(?:现居地|所在地|期望城市|城市)\s*[:：]?\s*([^\n|｜]{2,20})/.exec(resumeContent);
  const fallbackData: ParsedResumeData = {
    basicInfo: {
      name: normalizeResumeName(contactInfo.name) || extractNameFromResumeFileName(lines[0] || '') || '',
      phone: normalizeResumePhone(contactInfo.phone),
      email: normalizeResumeEmail(contactInfo.email),
      age: ageMatch?.[1] ? Number(ageMatch[1]) : null,
      gender: /(^|[|｜/\s])(男|女)(?=$|[|｜/\s])/.exec(resumeContent)?.[2] || '',
      location: locationMatch?.[1]?.trim() || '',
      workYears: inferWorkYears(resumeContent),
      currentCompany: workExperience[0]?.company || '',
      currentPosition: workExperience[0]?.position || '',
    },
    workExperience,
    education,
    skills,
    certificates: [],
    projects,
    conflictMarkers: buildDetailedConflictMarkers(sections),
  };

  const requirementStatements = position ? extractRequirementStatements(position) : [];
  const requirementKeywords = position ? getRequirementKeywords(position) : [];
  const resumeLower = resumeContent.toLowerCase();
  const matchedKeywords = requirementKeywords.filter((keyword) => resumeLower.includes(keyword.toLowerCase()));
  const missingKeywords = requirementKeywords.filter((keyword) => !resumeLower.includes(keyword.toLowerCase()));

  return {
    lines,
    sections,
    resumeLower,
    requirementStatements,
    requirementKeywords,
    matchedKeywords,
    missingKeywords,
    fallbackData,
  };
}

function buildFallbackMatchAnalysis(
  resumeContent: string,
  position: PositionPayload,
  parsedData: ParsedResumeData,
  context?: ResumeParseContext
) {
  const lines = context?.lines || normalizeTextLines(resumeContent);
  const sections = context?.sections || extractSections(lines);
  const resumeLower = context?.resumeLower || resumeContent.toLowerCase();
  const requirementStatements = context?.requirementStatements || extractRequirementStatements(position);
  const requirementKeywords = context?.requirementKeywords || getRequirementKeywords(position);
  const matchedKeywords = context?.matchedKeywords || requirementKeywords.filter((keyword) => resumeLower.includes(keyword.toLowerCase()));
  const missingKeywords = context?.missingKeywords || requirementKeywords.filter((keyword) => !resumeLower.includes(keyword.toLowerCase()));

  const requiredDegree = normalizeDegree(String(position.education || ''));
  const candidateDegree = normalizeDegree(String(parsedData.education?.degree || ''));
  const degreeMatched = !requiredDegree || !candidateDegree
    ? null
    : (DEGREE_ORDER[candidateDegree] || 0) >= (DEGREE_ORDER[requiredDegree] || 0);

  const keywordCoverage = requirementKeywords.length > 0
    ? matchedKeywords.length / requirementKeywords.length
    : 0.5;

  let score = 48 + keywordCoverage * 37;
  if (degreeMatched === true) score += 8;
  if ((parsedData.skills?.length || 0) >= 5) score += 4;
  if ((parsedData.projects?.length || 0) >= 2) score += 3;
  if ((parsedData.workExperience?.length || 0) >= 1) score += 3;
  if (degreeMatched === false) score -= 6;

  const keywordMatchedItems = matchedKeywords.slice(0, 5).map((keyword) => ({
    requirement: `岗位要求涉及 ${keyword}`,
    evidence: findEvidenceForKeyword(lines, keyword),
  }));

  const matchedItems = [
    ...buildDetailedMatchedItems(requirementStatements, lines),
    ...keywordMatchedItems,
  ].slice(0, 6);

  if (degreeMatched === true && requiredDegree) {
    matchedItems.unshift({
      requirement: `学历要求 ${requiredDegree}`,
      evidence: `简历显示候选人学历为 ${candidateDegree}`,
    });
  }

  const unmatchedItems = missingKeywords.slice(0, 4).map((keyword) => ({
    requirement: `岗位期望 ${keyword} 能力`,
    gap: `简历中暂未找到明确的 ${keyword} 相关证据`,
  }));

  if (degreeMatched === false && requiredDegree) {
    unmatchedItems.unshift({
      requirement: `学历要求 ${requiredDegree}`,
      gap: `简历中识别到的学历为 ${candidateDegree || '未明确标注'}`,
    });
  }

  const strengths = buildDetailedStrengths(sections, parsedData, matchedKeywords);

  const weaknesses = buildDetailedWeaknesses(position, sections, missingKeywords);
  if (degreeMatched === false && requiredDegree) {
    weaknesses.unshift({
      area: '学历匹配',
      description: `当前识别学历与岗位要求存在差距，可能影响岗位基础门槛判断。`,
      gap: `岗位要求 ${requiredDegree}，简历识别为 ${candidateDegree || '未明确'}`,
    });
  }

  const conflictMarkers = [
    ...(parsedData.conflictMarkers || []),
    ...buildDetailedConflictMarkers(sections),
  ].slice(0, 4);

  const jobAspectAnalysis = buildJobAspectAnalysis(
    position,
    parsedData,
    sections,
    matchedKeywords,
    missingKeywords
  );

  return {
    matchScore: Math.max(35, Math.min(95, Math.round(score))),
    matchedItems,
    unmatchedItems,
    strengths,
    weaknesses,
    conflictMarkers,
    jobAspectAnalysis,
    fallbackUsed: true,
  };
}

function applyVetoCheckToMatchAnalysis(
  matchAnalysis: ParsedResumeData['matchAnalysis'],
  vetoCheck: PositionVetoCheck
): ParsedResumeData['matchAnalysis'] {
  if (!matchAnalysis || !vetoCheck.triggered) {
    return matchAnalysis;
  }

  const originalMatchScore =
    typeof matchAnalysis.matchScore === 'number' ? matchAnalysis.matchScore : 0;
  const nextMatchAnalysis = {
    ...matchAnalysis,
    matchScore: 0,
    vetoCheck,
  } as ParsedResumeData['matchAnalysis'] & {
    calculationDetails?: Record<string, unknown>;
  };

  const calculationDetails = nextMatchAnalysis.calculationDetails;
  if (calculationDetails && typeof calculationDetails === 'object') {
    const originalFinalScore =
      typeof calculationDetails.finalScore === 'number'
        ? calculationDetails.finalScore
        : originalMatchScore;
    const penaltyInfo = calculationDetails.penaltyInfo;

    nextMatchAnalysis.calculationDetails = {
      ...calculationDetails,
      finalScore: 0,
      penaltyInfo: penaltyInfo && typeof penaltyInfo === 'object'
        ? {
            ...(penaltyInfo as Record<string, unknown>),
            reducedScore: 0,
            reduction: originalFinalScore,
            vetoOverride: true,
          }
        : {
            originalScore: originalFinalScore,
            penaltyCoefficient: 0,
            reducedScore: 0,
            reduction: originalFinalScore,
            conflictMarkers: [],
            vetoOverride: true,
          },
    };
  }

  return nextMatchAnalysis;
}

function buildFallbackParsedData(
  resumeContent: string,
  context?: ResumeParseContext
): ParsedResumeData {
  if (context) {
    return context.fallbackData;
  }

  return createResumeParseContext(resumeContent).fallbackData;
}

function mergeWorkExperience(
  current: ParsedResumeData['workExperience'],
  fallback: ParsedResumeData['workExperience']
): ParsedResumeData['workExperience'] {
  const source = (current && current.length > 0 ? current : fallback) || [];

  return source.map((item, index) => {
    const fallbackItem = fallback?.[index];
    return {
      company: item.company || fallbackItem?.company || '',
      position: item.position || fallbackItem?.position || '',
      duration: item.duration || fallbackItem?.duration || '',
      responsibilities: dedupeNonEmpty([
        ...(item.responsibilities || []),
        ...((fallbackItem?.responsibilities || [])),
      ], 5),
      achievements: dedupeNonEmpty([
        ...(item.achievements || []),
        ...((fallbackItem?.achievements || [])),
      ], 4),
    };
  }).filter((item) => item.company || item.position || item.duration || item.responsibilities.length > 0 || item.achievements.length > 0);
}

function mergeProjects(
  current: ParsedResumeData['projects'],
  fallback: ParsedResumeData['projects']
): ParsedResumeData['projects'] {
  const source = (current && current.length > 0 ? current : fallback) || [];

  return source.map((item, index) => {
    const fallbackItem = fallback?.[index];
    return {
      name: item.name || fallbackItem?.name || '',
      duration: item.duration || fallbackItem?.duration || '',
      role: item.role || fallbackItem?.role || '',
      tasks: dedupeNonEmpty([
        ...(item.tasks || []),
        ...((fallbackItem?.tasks || [])),
      ], 5),
      results: dedupeNonEmpty([
        ...(item.results || []),
        ...((fallbackItem?.results || [])),
      ], 4),
      technologies: dedupeNonEmpty([
        ...(item.technologies || []),
        ...((fallbackItem?.technologies || [])),
      ], 8),
    };
  }).filter((item) => item.name || item.tasks.length > 0 || item.results.length > 0 || item.technologies.length > 0);
}

function enrichParsedData(
  resumeContent: string,
  parsedData: ParsedResumeData,
  fallbackData?: ParsedResumeData,
  context?: ResumeParseContext
): ParsedResumeData {
  const resolvedFallbackData = fallbackData || buildFallbackParsedData(resumeContent, context);

  return {
    ...parsedData,
    basicInfo: {
      ...resolvedFallbackData.basicInfo,
      ...(parsedData.basicInfo || {}),
    },
    workExperience: mergeWorkExperience(parsedData.workExperience, resolvedFallbackData.workExperience),
    education: {
      ...(resolvedFallbackData.education || {}),
      ...(parsedData.education || {}),
      scholarships: dedupeNonEmpty([
        ...((parsedData.education?.scholarships || [])),
        ...((resolvedFallbackData.education?.scholarships || [])),
      ], 6),
    },
    skills:
      parsedData.skills && parsedData.skills.length > 0
        ? parsedData.skills
        : resolvedFallbackData.skills,
    certificates:
      parsedData.certificates && parsedData.certificates.length > 0
        ? parsedData.certificates
        : resolvedFallbackData.certificates,
    projects: mergeProjects(parsedData.projects, resolvedFallbackData.projects),
    conflictMarkers: [
      ...((parsedData.conflictMarkers || [])),
      ...((resolvedFallbackData.conflictMarkers || [])),
    ].slice(0, 6),
  };
}

async function parseResumeContent(params: {
  resumeContent: string;
  position?: unknown;
}) {
  const { resumeContent, position: rawPosition } = params;

  if (!resumeContent) {
    throw new Error('简历内容不能为空');
  }

  console.log('开始简历解析，简历内容长度:', resumeContent.length);
  const position = await resolvePositionPayload(rawPosition);
  const cacheKey = buildResumeParseCacheKey({ resumeContent, position });

  return getOrCreateParseCache(cacheKey, async () => {
    const parseContext = createResumeParseContext(resumeContent, position);
    const vetoCheck = evaluatePositionVetoRules({
      resumeContent,
      position,
      lines: parseContext.lines,
    });
    const systemPrompt = `简历解析专家。提取简历关键信息，严格按JSON格式输出，无其他文字：

{
  "basicInfo": {
    "name": "姓名",
    "phone": "手机号",
    "email": "邮箱",
    "age": 年龄数字,
    "gender": "性别",
    "location": "现居地",
    "workYears": 工作年限数字,
    "currentCompany": "当前公司",
    "currentPosition": "当前职位"
  },
  "workExperience": [
    {
      "company": "公司名",
      "position": "岗位",
      "duration": "时长(如:2020.06-2023.05)",
      "responsibilities": ["职责1"],
      "achievements": ["成果数据(量化)"]
    }
  ],
  "education": {
    "school": "院校",
    "major": "专业",
    "degree": "学历",
    "gpa": "GPA/课程",
    "scholarships": ["奖学金"]
  },
  "skills": [
    {
      "name": "技能名",
      "level": "精通/熟练/掌握/了解"
    }
  ],
  "certificates": [
    {
      "name": "证书名",
      "level": "等级",
      "date": "时间"
    }
  ],
  "projects": [
    {
      "name": "项目名",
      "duration": "周期",
      "role": "主导/参与/协助",
      "tasks": ["任务"],
      "results": ["成果(量化)"],
      "technologies": ["技术"]
    }
  ],
  "conflictMarkers": [
    {
      "type": "时间线重叠/数据矛盾/描述夸大",
      "description": "具体描述"
    }
  ]
}

要求：
- 只输出JSON，无其他文字
- 信息缺失用空数组、空字符串或null，数字类型缺失用null
- skills 优先输出可直接展示的具体技术名，不要只写“AI能力”“后端开发”这种泛化描述
- workExperience / projects 中尽量保留职责动作、技术栈和量化结果，便于后续生成详细优势、匹配项和风险提示
- basicInfo 必须提取，这是最重要的字段，用于候选人识别和重复检测
- 成果尽可能量化，如"提升20%"、"管理10人团队"等
- conflictMarkers检查简历中的潜在问题，包括：
  - 时间线重叠：工作时间段是否有重叠
  - 数据矛盾：同一项目或经历的数据是否前后一致
  - 描述夸大：成就描述是否过于夸张不切实际
  - 逻辑不一致：经历描述是否存在逻辑矛盾
- 仔细核对工作经历的起止时间，确保时间线合理
- 检查项目成果数据的合理性
`;

    const messages = [
      { role: 'system' as const, content: systemPrompt },
      { role: 'user' as const, content: resumeContent },
    ];

    let parsedData: ParsedResumeData;
    let parseFallbackUsed = false;
    let parseWarning = '';

    const shouldRunMatchAnalysis = hasPositionAnalysisDetails(position);
    const matchAnalysisPromise = shouldRunMatchAnalysis
      ? calculateMatchScoreWithPenalty(
          resumeContent,
          position,
          'resume_screening',
          position?.candidateId,
          position?.resumeId,
          position?.positionId
        )
      : Promise.resolve(null);

    try {
      console.log('调用 LLM 解析简历...');
      const resumeModelId = await getModelId('resume_parse');
      console.log('简历结构化解析使用模型:', resumeModelId);

      const response = await client.invoke(messages, {
        model: resumeModelId,
        temperature: 0.4,
      });

      console.log('LLM 返回内容长度:', response.content.length);
      console.log('LLM 返回内容前200字符:', response.content.substring(0, 200));

      parsedData = safeJsonParse(response.content) as ParsedResumeData;
      console.log('✅ JSON 解析成功');
    } catch (error) {
      console.error('❌ LLM 简历解析失败，启用本地兜底解析:', error);
      parsedData = buildFallbackParsedData(resumeContent, parseContext);
      parseFallbackUsed = true;
      parseWarning = error instanceof Error ? error.message : '结构化解析失败，已使用本地兜底解析';
    }

    parsedData = enrichParsedData(resumeContent, parsedData, parseContext.fallbackData, parseContext);

    if (shouldRunMatchAnalysis) {
      try {
        console.log('开始岗位匹配分析（使用权重方案）...');
        const matchResult = await matchAnalysisPromise;

        if (matchResult) {
          const fallbackMatchAnalysis = buildFallbackMatchAnalysis(
            resumeContent,
            position ?? ({} as PositionPayload),
            parsedData,
            parseContext
          );

          parsedData.matchAnalysis = {
            matchScore: matchResult.matchScore,
            matchedItems:
              (matchResult.dimensionScores.matchedItems || []).length > 0
                ? matchResult.dimensionScores.matchedItems || []
                : fallbackMatchAnalysis.matchedItems || [],
            unmatchedItems:
              (matchResult.dimensionScores.unmatchedItems || []).length > 0
                ? matchResult.dimensionScores.unmatchedItems || []
                : fallbackMatchAnalysis.unmatchedItems || [],
            strengths:
              (matchResult.dimensionScores.strengths || []).length > 0
                ? matchResult.dimensionScores.strengths || []
                : fallbackMatchAnalysis.strengths || [],
            weaknesses:
              (matchResult.dimensionScores.weaknesses || []).length > 0
                ? matchResult.dimensionScores.weaknesses || []
                : fallbackMatchAnalysis.weaknesses || [],
            conflictMarkers: matchResult.dimensionScores.conflictMarkers || [],
            calculationDetails: matchResult.calculationSteps,
            weightsUsed: matchResult.weightsUsed,
            jobAspectAnalysis: fallbackMatchAnalysis.jobAspectAnalysis || [],
          };

          parsedData.conflictMarkers = [
            ...(parsedData.conflictMarkers || []),
            ...((matchResult.dimensionScores.conflictMarkers as Array<{ type?: string; description?: string }>) || []),
            ...((fallbackMatchAnalysis.conflictMarkers as Array<{ type?: string; description?: string }>) || []),
          ].slice(0, 6);

          console.log('✅ 岗位匹配分析完成');
          console.log('   最终匹配度分数:', matchResult.matchScore);
          console.log('   已匹配项数量:', (matchResult.dimensionScores.matchedItems || []).length);
          console.log('   未匹配项数量:', (matchResult.dimensionScores.unmatchedItems || []).length);
        }
      } catch (error) {
        console.error('❌ 岗位匹配分析失败，启用本地兜底匹配分析:', error);
        parsedData.matchAnalysis = buildFallbackMatchAnalysis(
          resumeContent,
          position ?? ({} as PositionPayload),
          parsedData,
          parseContext
        );
      }
    } else if (vetoCheck.triggered) {
      parsedData.matchAnalysis = buildFallbackMatchAnalysis(
        resumeContent,
        position ?? ({} as PositionPayload),
        parsedData,
        parseContext
      );
    }

    if (vetoCheck.triggered) {
      parsedData.matchAnalysis = applyVetoCheckToMatchAnalysis(parsedData.matchAnalysis, vetoCheck);
      console.log('🚫 一票否决前置校验命中，简历筛选分数已强制置为 0');
      console.log('   命中规则数量:', vetoCheck.hits.length);
    }

    return {
      success: true as const,
      data: parsedData,
      fallbackUsed: parseFallbackUsed || Boolean(parsedData.matchAnalysis?.fallbackUsed),
      warning: parseWarning || undefined,
    };
  });
}

registerParseResumeContent(parseResumeContent);

export async function POST(req: NextRequest) {
  try {
    const { resumeContent, position: rawPosition } = await req.json();

    if (!resumeContent) {
      return NextResponse.json(
        { error: '简历内容不能为空' },
        { status: 400 }
      );
    }

    const result = await parseResumeContent({
      resumeContent,
      position: rawPosition,
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error('简历解析失败:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : '简历解析失败',
      },
      { status: 500 }
    );
  }
}
