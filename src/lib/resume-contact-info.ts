export interface ResumeContactInfo {
  name: string;
  phone: string;
  email: string;
}

const CHINESE_NAME_PATTERN = /^[\u4e00-\u9fa5]{2,4}$/;
const ENGLISH_NAME_PATTERN = /^[A-Za-z]+(?:\s+[A-Za-z]+){0,2}$/;
const INVALID_NAME_KEYWORDS = [
  "简历",
  "个人",
  "个人信息",
  "求职",
  "应聘",
  "候选人",
  "岗位",
  "开发",
  "前端",
  "后端",
  "测试",
  "工程师",
  "产品",
  "运营",
  "设计",
  "信息",
  "教育",
  "经历",
  "教育经历",
  "工作经历",
  "项目经历",
  "荣誉",
  "课程",
  "优势",
  "技能",
  "人工智能",
  "软件工程",
  "计算机",
  "数据科学",
  "电子信息",
  "网络工程",
];

function cleanupSourceText(text: string): string {
  return text
    .replace(/[\u200B-\u200D\uFEFF\u00A0]/g, " ")
    .replace(/\r/g, "\n")
    .replace(/[ \t]+/g, " ")
    .trim();
}

function compressEmailText(text: string): string {
  let result = text;

  for (let i = 0; i < 3; i += 1) {
    result = result
      .replace(/([A-Za-z0-9._%+-])\s+(?=[A-Za-z0-9._%+-])/g, "$1")
      .replace(/\s*@\s*/g, "@")
      .replace(/\s*\.\s*/g, ".")
      .replace(/\s*-\s*/g, "-");
  }

  return result;
}

export function normalizeResumePhone(value?: string): string {
  if (!value) {
    return "";
  }

  const digitsOnly = value.replace(/[^\d]/g, "").replace(/^86/, "");
  if (digitsOnly.length === 11 && digitsOnly.startsWith("1")) {
    return digitsOnly;
  }

  return value.replace(/[^\d-]/g, "").trim();
}

export function normalizeResumeEmail(value?: string): string {
  if (!value) {
    return "";
  }

  return value.replace(/\s+/g, "").trim().toLowerCase();
}

export function normalizeResumeName(value?: string): string {
  if (!value) {
    return "";
  }

  return value
    .replace(/[|｜•·●▪◆★☆]/g, " ")
    .replace(/[：:，,。;；()（）【】\[\]<>《》]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isLikelyName(value: string): boolean {
  const normalized = normalizeResumeName(value);
  if (!normalized) {
    return false;
  }

  const condensed = normalized.replace(/\s+/g, "");
  if (INVALID_NAME_KEYWORDS.some((keyword) => condensed.includes(keyword))) {
    return false;
  }

  return CHINESE_NAME_PATTERN.test(condensed) || ENGLISH_NAME_PATTERN.test(normalized);
}

function finalizeName(value?: string): string {
  if (!value) {
    return "";
  }

  const normalized = normalizeResumeName(value);
  if (!normalized) {
    return "";
  }

  if (CHINESE_NAME_PATTERN.test(normalized.replace(/\s+/g, ""))) {
    return normalized.replace(/\s+/g, "");
  }

  if (ENGLISH_NAME_PATTERN.test(normalized)) {
    return normalized;
  }

  return "";
}

export function extractNameFromResumeFileName(fileName: string): string {
  const baseName = fileName.replace(/\.[^.]+$/, "");
  const condensedName = baseName.replace(/[\s_-]+/g, "");
  const match = condensedName.match(/([\u4e00-\u9fa5]{2,4}|[A-Za-z]{2,30})(?:简历|个人简历|求职简历|应聘简历|cv|CV|resume|Resume)?/);

  if (!match?.[1]) {
    return "";
  }

  const candidateName = finalizeName(match[1]);
  return isLikelyName(candidateName) ? candidateName : "";
}

function extractEmail(text: string): string {
  const keywordMatch = text.match(/(?:邮箱|email|邮件|e-mail)\s*[:：]?\s*([^\s\n]+)/i);
  if (keywordMatch?.[1]) {
    const email = normalizeResumeEmail(keywordMatch[1]);
    if (email) {
      return email;
    }
  }

  const compressedText = compressEmailText(text);
  const emailMatch = compressedText.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/);
  return normalizeResumeEmail(emailMatch?.[0]);
}

function extractPhone(text: string): string {
  const phonePatterns = [
    /(?:\+?86[-\s]?)?1(?:[-\s]?\d){10}/,
    /1\s*[3-9](?:\s*\d){9}/,
    /0\d{2,3}[-\s]?\d{7,8}/,
  ];

  for (const pattern of phonePatterns) {
    const match = text.match(pattern);
    const phone = normalizeResumePhone(match?.[0]);
    if (phone) {
      return phone;
    }
  }

  return "";
}

function extractName(text: string, fileName?: string): string {
  const lines = cleanupSourceText(text)
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  for (const line of lines.slice(0, 6)) {
    const leadingNameMatch = line.match(
      /^([\u4e00-\u9fa5]{2,4}|[A-Za-z]+(?:\s+[A-Za-z]+){0,2})(?=\s|[|｜/]|🗸|☎|📧|🎂|男|女|年龄|电话|手机|邮箱|应届生|求职)/i
    );
    const leadingName = finalizeName(leadingNameMatch?.[1]);
    if (leadingName && isLikelyName(leadingName)) {
      return leadingName;
    }
  }

  for (const line of lines.slice(0, 20)) {
    const labelMatch = line.match(
      /(?:姓名|名字|候选人|name|姓\s*名|名\s*字)\s*[:：]?\s*([A-Za-z\u4e00-\u9fa5·\s]{2,20})(?=\s{2,}|[|｜/,，。;；]|(?:出生|性别|电话|手机|邮箱|email|年龄|求职|意向|现居地|教育|工作|项目)|$)/i
    );
    const labeledName = finalizeName(labelMatch?.[1]);
    if (labeledName && isLikelyName(labeledName)) {
      return labeledName;
    }

    const inlineMatch = line.match(
      /^([A-Za-z\u4e00-\u9fa5·\s]{2,20})\s*(?:性别|男|女|邮箱|电话|手机|求职意向|现居地|年龄|出生|应聘|职位|岗位|意向)/i
    );
    const inlineName = finalizeName(inlineMatch?.[1]);
    if (inlineName && isLikelyName(inlineName)) {
      return inlineName;
    }
  }

  if (fileName) {
    const fileNameCandidate = extractNameFromResumeFileName(fileName);
    if (fileNameCandidate) {
      return fileNameCandidate;
    }
  }

  const topLines = lines.slice(0, 8);

  for (const line of topLines) {
    const lineHead = line.split(/[|｜/]/)[0]?.trim() || line;
    const exactName = finalizeName(lineHead);
    if (exactName && isLikelyName(exactName)) {
      return exactName;
    }

    const prefixMatch = line.match(/^([\u4e00-\u9fa5]{2,4}|[A-Za-z]+(?:\s+[A-Za-z]+){0,2})\s*(?:求职|简历|个人|电话|手机|邮箱|男|女|本科|硕士|博士|应聘|年龄|现居地|意向)/);
    const prefixName = finalizeName(prefixMatch?.[1]);
    if (prefixName && isLikelyName(prefixName)) {
      return prefixName;
    }
  }

  return "";
}

export function extractContactInfoFromText(
  text: string,
  options?: { fileName?: string }
): ResumeContactInfo {
  const cleanedText = cleanupSourceText(text);

  return {
    name: extractName(cleanedText, options?.fileName),
    phone: extractPhone(cleanedText),
    email: extractEmail(cleanedText),
  };
}
