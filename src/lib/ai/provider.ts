export interface AIProvider {
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
    const note = i.notes ? ` | Note: ${i.notes.slice(0, 300)}` : "";
    return `- [${i.status}, ${Math.round(i.actualCompletionPct * 100)}%, due ${i.endDate}] ${(i.requirement || i.action).slice(0, 150)} (${i.owner})${note}${changed}`;
  }).join("\n");

  return `You are a McKinsey-style strategy consultant writing an executive weekly status update.

Deliverable: ${d.name}
Items:
${itemLines}

Write 2 sections:
1. progressUpdate: 2-4 ultra-concise bullets of what's done/progressing. Each bullet MUST be a short fragment, not a full sentence. No filler verbs, no "Hassen completed X by date" — say "X finalized [date]" or "X 80% complete".
2. nextSteps: 2-3 ultra-concise bullets of upcoming work. Same telegraphic style.

Style rules (critical):
- Telegraphic, fragment-style: "Full BP model finalized 31 Mar" NOT "Hassen completed the full BP model by March 31"
- Drop subject if obvious. Drop articles. Use noun + status + date.
- Max ~10 words per bullet.
- Concrete dates and percentages, no narrative.

Each bullet starts with "- " (dash space).

Respond with ONLY a valid JSON object (no markdown, no preamble). Shape:
{"progressUpdate":"- bullet one\\n- bullet two","nextSteps":"- bullet"}`;
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
        needsFromClient: "", // Always blank — user fills this manually
      };
    } catch { /* try next */ }
  }
  console.error(`[AI] Parse failed for ${deliverableName}. Text:`, text.slice(0, 300));
  return emptyResult(deliverableName);
}

function emptyResult(name: string): WeeklyUpdateAIResult {
  return { deliverable: name, progressUpdate: "", nextSteps: "", needsFromClient: "" };
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
