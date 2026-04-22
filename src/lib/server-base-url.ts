import { NextRequest } from "next/server";

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

function isLocalhostLike(hostname: string): boolean {
  return ["localhost", "127.0.0.1", "0.0.0.0"].includes(hostname);
}

export function getServerBaseUrl(request: NextRequest): string {
  const configuredBaseUrl =
    process.env.APP_BASE_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.COZE_PROJECT_DOMAIN_DEFAULT;

  const requestOrigin = trimTrailingSlash(new URL(request.url).origin);

  if (configuredBaseUrl) {
    try {
      const configuredHostname = new URL(configuredBaseUrl).hostname;
      const requestHostname = new URL(requestOrigin).hostname;

      if (isLocalhostLike(configuredHostname) && !isLocalhostLike(requestHostname)) {
        return requestOrigin;
      }
    } catch {
      // 配置值不是完整 URL 时，保持原逻辑
    }

    return trimTrailingSlash(configuredBaseUrl);
  }

  return requestOrigin;
}
