import { NextRequest } from "next/server";

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

function isLocalhostLike(hostname: string): boolean {
  return ["localhost", "127.0.0.1", "0.0.0.0"].includes(hostname);
}

function normalizeBaseUrl(value?: string | null): string {
  return value ? trimTrailingSlash(value.trim()) : "";
}

function resolveConfiguredInterviewPublicBaseUrl(): string {
  return normalizeBaseUrl(
    process.env.INTERVIEW_PUBLIC_BASE_URL ||
      process.env.NEXT_PUBLIC_INTERVIEW_PUBLIC_URL ||
      process.env.NEXT_PUBLIC_CANDIDATE_APP_URL ||
      process.env.APP_BASE_URL ||
      process.env.NEXT_PUBLIC_APP_URL ||
      process.env.COZE_PROJECT_DOMAIN_DEFAULT
  );
}

export function getInterviewPublicBaseUrlFromRequest(request: NextRequest): string {
  const configuredBaseUrl = resolveConfiguredInterviewPublicBaseUrl();
  const requestOrigin = trimTrailingSlash(new URL(request.url).origin);

  if (configuredBaseUrl) {
    try {
      const configuredHostname = new URL(configuredBaseUrl).hostname;
      const requestHostname = new URL(requestOrigin).hostname;

      if (isLocalhostLike(configuredHostname) && !isLocalhostLike(requestHostname)) {
        return requestOrigin;
      }
    } catch {
      return configuredBaseUrl;
    }

    return configuredBaseUrl;
  }

  return requestOrigin;
}

export function getInterviewPublicBaseUrlFromBrowser(): string {
  if (typeof window === "undefined") {
    return resolveConfiguredInterviewPublicBaseUrl();
  }

  const configuredBaseUrl = resolveConfiguredInterviewPublicBaseUrl();
  const browserOrigin = trimTrailingSlash(window.location.origin);

  if (configuredBaseUrl) {
    try {
      const configuredHostname = new URL(configuredBaseUrl).hostname;
      const browserHostname = new URL(browserOrigin).hostname;

      if (isLocalhostLike(configuredHostname) && !isLocalhostLike(browserHostname)) {
        return browserOrigin;
      }
    } catch {
      return configuredBaseUrl;
    }

    return configuredBaseUrl;
  }

  return browserOrigin;
}

export function buildCandidateInterviewLink(baseUrl: string, linkId: string): string {
  return `${trimTrailingSlash(baseUrl)}/i/${encodeURIComponent(linkId)}`;
}

export function isUnsafeLocalInterviewBaseUrl(baseUrl: string): boolean {
  try {
    return isLocalhostLike(new URL(baseUrl).hostname);
  } catch {
    return false;
  }
}
