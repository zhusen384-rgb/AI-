import { createCompatibleLlmClient } from "@/lib/ark-llm";
import { getModelId } from "@/lib/db/model-config-utils";

export type ComputerUserAction =
  | "open_recommend_page"
  | "inspect_candidate"
  | "trigger_greet"
  | "type_custom_message"
  | "send_custom_message"
  | "open_chat_page"
  | "reply_candidate"
  | "wait";

export interface ComputerUserPlan {
  action: ComputerUserAction;
  reasoning: string;
}

function extractJsonObject(content: string): Record<string, unknown> | null {
  const matched = content.match(/\{[\s\S]*\}/);
  if (!matched) {
    return null;
  }

  try {
    return JSON.parse(matched[0]) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function fallbackAction(pageState: string): ComputerUserAction {
  if (pageState.includes("recommend")) {
    return "inspect_candidate";
  }
  if (pageState.includes("resume_dialog")) {
    return "trigger_greet";
  }
  if (pageState.includes("chat_editor")) {
    return "send_custom_message";
  }
  if (pageState.includes("chat_list")) {
    return "reply_candidate";
  }
  return "wait";
}

export async function planBossComputerUserAction(input: {
  goal: string;
  pageState: string;
  observation: string;
}): Promise<ComputerUserPlan> {
  const client = createCompatibleLlmClient();
  const allowedActions: ComputerUserAction[] = [
    "open_recommend_page",
    "inspect_candidate",
    "trigger_greet",
    "type_custom_message",
    "send_custom_message",
    "open_chat_page",
    "reply_candidate",
    "wait",
  ];

  try {
    const response = await client.invoke(
      [
        {
          role: "system",
          content: `你是招聘自动化的 computer-user planner。
你不会直接操作浏览器，你只负责根据当前页面观察结果，给出下一步最合适的单一动作。

只允许返回 JSON：
{
  "action": "open_recommend_page" | "inspect_candidate" | "trigger_greet" | "type_custom_message" | "send_custom_message" | "open_chat_page" | "reply_candidate" | "wait",
  "reasoning": "一句简短原因"
}

不要输出任何额外文字。`,
        },
        {
          role: "user",
          content: `目标：${input.goal}
页面状态：${input.pageState}
页面观察：${input.observation}`,
        },
      ],
      {
        model: await getModelId("evaluation"),
        temperature: 0.1,
      }
    );

    const payload = extractJsonObject(response.content);
    const action = payload?.action;
    const reasoning = payload?.reasoning;

    if (typeof action === "string" && allowedActions.includes(action as ComputerUserAction)) {
      return {
        action: action as ComputerUserAction,
        reasoning: typeof reasoning === "string" && reasoning.trim().length > 0
          ? reasoning.trim()
          : "基于当前页面状态选择下一步动作",
      };
    }
  } catch (error) {
    console.warn("[computer-user] planner failed, falling back:", error);
  }

  return {
    action: fallbackAction(input.pageState),
    reasoning: "使用本地兜底规则选择下一步动作",
  };
}
