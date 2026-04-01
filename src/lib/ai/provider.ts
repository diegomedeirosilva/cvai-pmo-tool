import { DashboardSummary, WorkstreamHealth, ActionItem, Risk } from "@/types";

export interface AIProvider {
  generateSummary(context: SummaryContext): Promise<string>;
  isAvailable(): boolean;
}

export interface SummaryContext {
  projectTitle: string;
  day1TargetDate: string;
  daysRemaining: number;
  total: number;
  notStarted: number;
  completed: number;
  onTrack: number;
  atRisk: number;
  overdue: number;
  workstreamSummary: WorkstreamHealth[];
  topRisks: Risk[];
  upcomingMilestones: ActionItem[];
}

function buildPrompt(ctx: SummaryContext): string {
  const wsSummary = ctx.workstreamSummary
    .map((ws) => `${ws.workstream}: ${ws.completed}/${ws.total} done, ${ws.overdue} overdue, ${ws.health}`)
    .join("; ");

  const risksText = ctx.topRisks
    .slice(0, 3)
    .map((r) => `[${r.severity}] ${r.description.slice(0, 80)}`)
    .join("; ");

  return `Executive PMO briefing. Be terse — max 1 sentence per bullet. No filler.

Data:
- Project: ${ctx.projectTitle} | Day-1: ${ctx.day1TargetDate} | ${ctx.daysRemaining} days left
- Items: ${ctx.total} total, ${ctx.completed} done, ${ctx.onTrack} on-track, ${ctx.atRisk} at-risk, ${ctx.overdue} overdue, ${ctx.notStarted} not started
- Workstreams: ${wsSummary}
- Risks: ${risksText || "None"}

Write exactly 4 bullets. Format: **Label**: One concise sentence with specific numbers/names.
Use these labels: Overall Status, Key Risks, Blockers, Next Steps.
Return ONLY the 4 bullet lines.`;
}

// Cache SDK imports so we don't re-import on every request
let _anthropicModule: any = null;

// Anthropic provider
async function createAnthropicProvider(): Promise<AIProvider> {
  if (!_anthropicModule) {
    _anthropicModule = await import("@anthropic-ai/sdk");
  }
  const client = new _anthropicModule.default({ apiKey: process.env.ANTHROPIC_API_KEY });

  return {
    isAvailable: () => !!process.env.ANTHROPIC_API_KEY,
    async generateSummary(ctx) {
      const message = await client.messages.create({
        model: process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6",
        max_tokens: 400,
        messages: [{ role: "user", content: buildPrompt(ctx) }],
      });
      const block = message.content[0];
      if (block.type === "text") return block.text;
      return "";
    },
  };
}

// Cache SDK imports
let _openaiModule: any = null;

// OpenAI provider
async function createOpenAIProvider(): Promise<AIProvider> {
  if (!_openaiModule) {
    _openaiModule = await import("openai");
  }
  const client = new _openaiModule.default({ apiKey: process.env.OPENAI_API_KEY });

  return {
    isAvailable: () => !!process.env.OPENAI_API_KEY,
    async generateSummary(ctx) {
      const completion = await client.chat.completions.create({
        model: "gpt-4o-mini",
        max_tokens: 400,
        messages: [{ role: "user", content: buildPrompt(ctx) }],
      });
      return completion.choices[0]?.message?.content || "";
    },
  };
}

// Null provider (no AI configured)
const nullProvider: AIProvider = {
  isAvailable: () => false,
  async generateSummary() {
    return "";
  },
};

// Don't cache — always create fresh to pick up env changes
export async function getAIProvider(): Promise<AIProvider> {

  const providerName = process.env.AI_PROVIDER || "anthropic";

  let provider: AIProvider;
  if (providerName === "anthropic" && process.env.ANTHROPIC_API_KEY) {
    provider = await createAnthropicProvider();
  } else if (providerName === "openai" && process.env.OPENAI_API_KEY) {
    provider = await createOpenAIProvider();
  } else {
    provider = nullProvider;
  }

  return provider;
}
