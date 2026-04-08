import { DashboardSummary, WorkstreamHealth, ActionItem, Risk } from "@/types";

export interface AIProvider {
  generateSummary(context: SummaryContext): Promise<string>;
  generateWeeklyUpdate(context: WeeklyUpdateContext): Promise<WeeklyUpdateAIResult[]>;
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

export interface WeeklyUpdateContext {
  deliverables: Array<{
    name: string;
    items: Array<{
      action: string;
      requirement: string;
      owner: string;
      status: string;
      actualCompletionPct: number;
      endDate: string;
      notes: string;
      recentlyChanged: boolean;
    }>;
    previousUpdate?: {
      progressUpdate: string;
      nextSteps: string;
      needsFromClient: string;
    };
  }>;
}

export interface WeeklyUpdateAIResult {
  deliverable: string;
  progressUpdate: string;
  nextSteps: string;
  needsFromClient: string;
}

function buildWeeklyUpdatePrompt(ctx: WeeklyUpdateContext): string {
  const sections = ctx.deliverables.map((d) => {
    const itemLines = d.items.map((i) => {
      const changed = i.recentlyChanged ? " [CHANGED THIS WEEK]" : "";
      const note = i.notes ? ` | Note: ${i.notes.slice(0, 100)}` : "";
      return `  - [${i.status}, ${Math.round(i.actualCompletionPct * 100)}%, due ${i.endDate}] ${i.requirement || i.action} (${i.owner})${note}${changed}`;
    }).join("\n");

    let prev = "";
    if (d.previousUpdate) {
      prev = `\n  Last week's update:\n  Progress: ${d.previousUpdate.progressUpdate.slice(0, 200)}\n  Next steps: ${d.previousUpdate.nextSteps.slice(0, 200)}`;
    }

    return `Deliverable: ${d.name}\nItems:\n${itemLines}${prev}`;
  }).join("\n---\n");

  return `You are a strategy consultant writing a weekly client status update.

For each deliverable, write 3 sections:
1. Progress Update: 2-4 bullet points of what happened/progressed this week. Focus on items marked [CHANGED THIS WEEK] and completed items. Use specific names and owners.
2. Next Steps: 2-3 bullet points of upcoming work, prioritizing items with near deadlines.
3. What We Need From You: 0-2 bullet points of client actions/approvals needed. Write "n/a" if nothing needed.

Each bullet must start with "• ". Be specific, professional, concise. No generic filler.

${sections}

Return a JSON array (no markdown fencing): [{"deliverable":"...","progressUpdate":"• ...","nextSteps":"• ...","needsFromClient":"• ..."}]`;
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
    async generateWeeklyUpdate(ctx) {
      const message = await client.messages.create({
        model: process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6",
        max_tokens: 2000,
        messages: [{ role: "user", content: buildWeeklyUpdatePrompt(ctx) }],
      });
      const block = message.content[0];
      if (block.type === "text") return parseWeeklyUpdateResponse(block.text);
      return [];
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
    async generateWeeklyUpdate(ctx) {
      const completion = await client.chat.completions.create({
        model: "gpt-4o",
        max_tokens: 2000,
        messages: [{ role: "user", content: buildWeeklyUpdatePrompt(ctx) }],
      });
      return parseWeeklyUpdateResponse(completion.choices[0]?.message?.content || "[]");
    },
  };
}

function parseWeeklyUpdateResponse(text: string): WeeklyUpdateAIResult[] {
  try {
    // Strip markdown code fences if present
    const cleaned = text.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
    return JSON.parse(cleaned);
  } catch {
    console.error("Failed to parse weekly update AI response:", text.slice(0, 200));
    return [];
  }
}

// Null provider (no AI configured)
const nullProvider: AIProvider = {
  isAvailable: () => false,
  async generateSummary() {
    return "";
  },
  async generateWeeklyUpdate() {
    return [];
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
