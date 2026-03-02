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
  completed: number;
  onTrack: number;
  notStarted: number;
  delayed: number;
  overdue: number;
  workstreamSummary: WorkstreamHealth[];
  topRisks: Risk[];
  upcomingMilestones: ActionItem[];
}

function buildPrompt(ctx: SummaryContext): string {
  const wsSummary = ctx.workstreamSummary
    .map(
      (ws) =>
        `${ws.workstream}: ${ws.completed}/${ws.total} completed, ${ws.overdue} overdue, health: ${ws.health}`
    )
    .join("; ");

  const milestonesText = ctx.upcomingMilestones
    .slice(0, 5)
    .map((m) => `${m.requirement} (${m.owner}, due ${m.endDate})`)
    .join("; ");

  const risksText = ctx.topRisks
    .slice(0, 3)
    .map((r) => `[${r.severity}] ${r.description.slice(0, 100)}`)
    .join("; ");

  return `You are a PMO analyst writing a brief status summary for a consulting project.

Project: ${ctx.projectTitle}
Day-1 target: ${ctx.day1TargetDate}
Days remaining: ${ctx.daysRemaining}
Total items: ${ctx.total}, Completed: ${ctx.completed}, On-track: ${ctx.onTrack}, Not Started: ${ctx.notStarted}, Delayed: ${ctx.delayed}, Overdue: ${ctx.overdue}
Workstream summaries: ${wsSummary}
Top risks: ${risksText || "None detected"}
Upcoming milestones (next 14 days): ${milestonesText || "None"}

Write exactly 5-6 bullet points as a structured executive briefing. Each bullet must start with a bold topic label followed by a colon, then the insight.

Format each line as: **Topic**: Insight text here.

Example format:
**Overall Status**: Project is X days from Day-1 with Y of Z items completed across N workstreams.
**Key Progress**: [Specific workstream achievements with numbers]
**Critical Risks**: [Top 1-2 risks with owner names and specific impact]
**Upcoming Milestones**: [What's due in next 14 days and who owns it]
**Attention Required**: [What needs immediate action and from whom]

Be specific — mention workstream names, owner names, and exact numbers. Tone: professional, direct, McKinsey-style. No filler. Each bullet should deliver a distinct insight. Return ONLY the bullet lines, nothing else.`;
}

// Anthropic provider
async function createAnthropicProvider(): Promise<AIProvider> {
  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  return {
    isAvailable: () => !!process.env.ANTHROPIC_API_KEY,
    async generateSummary(ctx) {
      const message = await client.messages.create({
        model: process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6",
        max_tokens: 600,
        messages: [{ role: "user", content: buildPrompt(ctx) }],
      });
      const block = message.content[0];
      if (block.type === "text") return block.text;
      return "";
    },
  };
}

// OpenAI provider
async function createOpenAIProvider(): Promise<AIProvider> {
  const { default: OpenAI } = await import("openai");
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  return {
    isAvailable: () => !!process.env.OPENAI_API_KEY,
    async generateSummary(ctx) {
      const completion = await client.chat.completions.create({
        model: "gpt-4o",
        max_tokens: 600,
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
