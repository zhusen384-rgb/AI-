"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";

const ChatBot = dynamic(
  () => import("@/components/chatbot").then((mod) => mod.ChatBot),
  { ssr: false }
);

export function ChatBotLazy() {
  const [shouldRender, setShouldRender] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const mountChatBot = () => {
      if (!cancelled) {
        setShouldRender(true);
      }
    };

    const idleCallback = globalThis.requestIdleCallback;
    if (typeof idleCallback === "function") {
      const handle = idleCallback(mountChatBot, { timeout: 1500 });
      return () => {
        cancelled = true;
        globalThis.cancelIdleCallback?.(handle);
      };
    }

    const timer = window.setTimeout(mountChatBot, 600);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, []);

  if (!shouldRender) {
    return null;
  }

  return <ChatBot />;
}
