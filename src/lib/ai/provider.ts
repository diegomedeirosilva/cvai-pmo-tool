import { DashboardSummary, WorkstreamHealth, ActionItem, Risk } from "@/types";

export interface AIProvider {
  generateSummary(context: SummaryContext): Promise<string>;
  generateWeeklyUpdateForDeliverable(deliverable: WeeklyUpdateDeliverable): Promise<WeeklyUpdateAIResult>;
  isAvailable(): boolean;
}

export interface WeeklyUpdateDeliverable {
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

export interface WeeklyUpdateAIResult {
  deliverable: string;
  progressUpdate: string;
  nextSteps: string;
  needsFromClient: string;
}

function buildSingleDeliverablePrompt(d: WeeklyUpdateDeliverable): string {
  const itemLines = d.items.slice(0, 20).map((i) => {
    const changed = i.recentlyChanged ? " [CHANGED]" : "";
    const note = i.notes ? ` | Note: ${i.notes.slice(0, 80)}` : "";
    return `- [${i.status}, ${Math.round(i.actualCompletionPct * 100)}%, due ${i.endDate}] ${(i.requirement || i.action).slice(0, 100)} (${i.owner})${note}${changed}`;
  }).join("\n");

  let prev = "";
  if (d.previousUpdate) {
    prev = `\nLast week's progress note: ${d.previousUpdate.progressUpdate.slice(0, 200)}`;
  }

  return `You are a strategy consultant writing a weekly client status update for a JV readiness project.

Deliverable: ${d.name}
Items:
${itemLines}${prev}

Write 3 sections for this deliverable:
1. progressUpdate: 2-4 bullets of recent progress. Prioritize items marked [CHANGED] and completed items.
2. nextSteps: 2-3 bullets of upcoming work, prioritizing near deadlines.
3. needsFromClient: 0-2 bullets of client actions/approvals needed, or "n/a".

Each bullet starts with "- " (dash space). Use specific names, owners, dates. Professional, concise.

Respond with ONLY a valid JSON object (no markdown, no preamble). Shape:
{"progressUpdate":"- bullet one\\n- bullet two","nextSteps":"- bullet","needsFromClient":"n/a"}`;
}

function parseSingleDeliverableResponse(text: string, deliverableName: string): WeeklyUpdateAIResult {
  if (!text) return emptyResult(deliverableName);

  const strategies: (() => string)[] = [
    () => text.trim(),
    () => text.replace(/```(?:json)?\s*/gi, "").replace(/```\s*/g, "").trim(),
    () => {
      const start = text.indexOf("{");
      if (start === -1) return "";
      let depth = 0, inString = false, escape = false;
      for (let i = start; i < text.length; i++) {
        const c = text[i];
        if (escape) { escape = false; continue; }
        if (c === "\\") { escape = true; continue; }
        if (c === '"') { inString = !inString; continue; }
        if (inString) continue;
        if (c === "{") depth++;
        if (c === "}") { depth--; if (depth === 0) return text.slice(start, i + 1); }
      }
      return "";
    },
  ];

  for (const get of strategies) {
    const candidate = get();
    if (!candidate) continue;
    try {
      const parsed = JSON.parse(candidate);
      return {
        deliverable: deliverableName,
        progressUpdate: parsed.progressUpdate || "",
        nextSteps: parsed.nextSteps || "",
        needsFromClient: parsed.needsFromClient || "",
      };
    } catch { /* try next */ }
  }
  console.error(`[AI] Parse failed for ${deliverableName}. Text:`, text.slice(0, 300));
  return emptyResult(deliverableName);
}

function emptyResult(name: string): WeeklyUpdateAIResult {
  return { deliverable: name, progressUpdate: "", nextSteps: "", needsFromClient: "" };
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
    async generateWeeklyUpdateForDeliverable(d) {
      const message = await client.messages.create({
        model: process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6",
        max_tokens: 800,
        messages: [{ role: "user", content: buildSingleDeliverablePrompt(d) }],
      });
      const block = message.content[0];
      const text = block.type === "text" ? block.text : "";
      return parseSingleDeliverableResponse(text, d.name);
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
    async generateWeeklyUpdateForDeliverable(d) {
      const completion = await client.chat.completions.create({
        model: "gpt-4o",
        max_tokens: 800,
        response_format: { type: "json_object" },
        messages: [{ role: "user", content: buildSingleDeliverablePrompt(d) }],
      });
      const text = completion.choices[0]?.message?.content || "{}";
      return parseSingleDeliverableResponse(text, d.name);
    },
  };
}

// Null provider (no AI configured)
const nullProvider: AIProvider = {
  isAvailable: () => false,
  async generateSummary() {
    return "";
  },
  async generateWeeklyUpdateForDeliverable(d) {
    return emptyResult(d.name);
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
