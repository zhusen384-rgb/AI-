export interface ExtractedCandidateSignals {
  phone?: string;
  email?: string;
  wechat?: string;
  resumeFileUrl?: string;
}

function uniqueFirstMatch(matches: string[] | null | undefined): string | undefined {
  if (!matches || matches.length === 0) {
    return undefined;
  }

  return matches[0];
}

export function extractCandidateSignals(
  message: string,
  options?: {
    resumeMessage?: boolean;
  }
): ExtractedCandidateSignals {
  const phoneMatches = message.match(/(?<!\d)(1[3-9]\d{9})(?!\d)/g);
  const emailMatches = message.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi);

  const wechatPatterns = [
    /(?:微信|vx|v信|wechat)[:：\s]*([a-zA-Z][-_a-zA-Z0-9]{5,19})/i,
    /\b(wxid_[a-zA-Z0-9]+)\b/i,
  ];

  let wechat: string | undefined;
  for (const pattern of wechatPatterns) {
    const matched = message.match(pattern);
    if (matched?.[1]) {
      wechat = matched[1];
      break;
    }
  }

  const urlMatch = message.match(/https?:\/\/[^\s]+?\.(pdf|doc|docx)(\?[^\s]+)?/i);
  const resumeFileUrl = options?.resumeMessage
    ? urlMatch?.[0] || 'resume-message'
    : urlMatch?.[0];

  return {
    phone: uniqueFirstMatch(phoneMatches),
    email: uniqueFirstMatch(emailMatches),
    wechat,
    resumeFileUrl,
  };
}
