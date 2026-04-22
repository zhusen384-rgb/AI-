export type MediaCapability = "camera" | "microphone" | "screen";

export interface MediaCapabilityProblem {
  title: string;
  description: string;
}

const LOCALHOST_HOSTNAMES = new Set(["localhost", "127.0.0.1", "0.0.0.0"]);

function isLocalhostLike(hostname: string): boolean {
  return LOCALHOST_HOSTNAMES.has(hostname);
}

function getCurrentOrigin(): string {
  if (typeof window === "undefined") {
    return "";
  }

  return window.location.origin;
}

function isSecureMediaContext(): boolean {
  if (typeof window === "undefined") {
    return true;
  }

  return window.isSecureContext || window.location.protocol === "https:" || isLocalhostLike(window.location.hostname);
}

export function getMediaCapabilityProblem(capability: MediaCapability): MediaCapabilityProblem | null {
  if (typeof navigator === "undefined" || typeof window === "undefined") {
    return null;
  }

  const origin = getCurrentOrigin();
  const secureContext = isSecureMediaContext();
  const hasMediaDevices = !!navigator.mediaDevices;
  const hasGetUserMedia = !!navigator.mediaDevices?.getUserMedia;
  const hasGetDisplayMedia = !!navigator.mediaDevices?.getDisplayMedia;

  if (!secureContext) {
    const featureName = capability === "screen" ? "屏幕录制" : "摄像头和麦克风";
    return {
      title: `${featureName}需要 HTTPS 或 localhost`,
      description:
        `当前访问地址 ${origin} 不是浏览器认可的安全上下文。请改用 HTTPS 面试链接，` +
        "或在发起面试的电脑上通过 localhost 打开页面后再继续。",
    };
  }

  if (!hasMediaDevices) {
    return {
      title: "当前浏览器无法访问媒体设备",
      description: "浏览器没有提供 mediaDevices API，请使用最新版 Chrome 或 Edge 浏览器重新打开面试链接。",
    };
  }

  if ((capability === "camera" || capability === "microphone") && !hasGetUserMedia) {
    return {
      title: "当前浏览器不支持摄像头或麦克风采集",
      description: "请使用最新版 Chrome 或 Edge 浏览器，并确认浏览器没有禁用摄像头或麦克风访问能力。",
    };
  }

  if (capability === "screen" && !hasGetDisplayMedia) {
    return {
      title: "当前浏览器不支持屏幕录制",
      description: "请使用最新版 Chrome 或 Edge 浏览器，并确认当前页面通过 HTTPS 或 localhost 打开。",
    };
  }

  return null;
}
