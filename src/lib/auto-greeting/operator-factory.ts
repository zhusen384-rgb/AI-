import { BossOperator } from "@/lib/auto-greeting/boss-operator";
import type { BossAutomationOperator } from "@/lib/auto-greeting/operator-interface";
import { PlaywrightMcpBossOperator } from "@/lib/auto-greeting/playwright-mcp-operator";

export type AutoGreetingExecutionMode =
  | "computer-user-playwright-mcp"
  | "legacy-puppeteer";

export async function createBossAutomationOperator(
  executionMode: AutoGreetingExecutionMode = "computer-user-playwright-mcp"
): Promise<{
  operator: BossAutomationOperator;
  executionMode: AutoGreetingExecutionMode;
  warning?: string;
}> {
  if (executionMode === "legacy-puppeteer") {
    return {
      operator: new BossOperator(),
      executionMode,
    };
  }

  return {
    operator: new PlaywrightMcpBossOperator(),
    executionMode: "computer-user-playwright-mcp",
  };
}
