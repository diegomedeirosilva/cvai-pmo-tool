export interface AIProvider {
  generateWeeklyUpdateForDeliverable(deliverable: WeeklyUpdateDeliverable): Promise<WeeklyUpdateAIResult>;
  isAvailable(): boolean;
}

export interface WeeklyUpdateDeliverable {
  name: string;
  // Deterministic rollup line (e.g. "3/9 complete · on track"), shown to the model
  // for context. The route prepends it as the first progress bullet — the model
  // must NOT emit its own count rollup.
  summaryLine: string;
  // OPEN items only (On-track / At-risk / Overdue). Completed & Not Started are excluded.
  items: Array<{
    action: string;
    requirement: string;
    owner: string;
    status: string;
    actualCompletionPct: number;
    endDate: string;
    notes: string;
    commentChanged: boolean; // note changed since last week's upload
  }>;
}

// Status sort weight for ordering open items: most urgent first.
const STATUS_WEIGHT: Record<string, number> = { Overdue: 0, "At-risk": 1, "On-track": 2 };

export interface WeeklyUpdateAIResult {
  deliverable: string;
  progressUpdate: string;
  nextSteps: string;
  needsFromClient: string;
}

function buildSingleDeliverablePrompt(d: WeeklyUpdateDeliverable): string {
  // Sort: newly-commented first, then by urgency (Overdue → At-risk → On-track), then by due date.
  const sorted = [...d.items].sort((a, b) => {
    if (a.commentChanged !== b.commentChanged) return a.commentChanged ? -1 : 1;
    const sw = (STATUS_WEIGHT[a.status] ?? 3) - (STATUS_WEIGHT[b.status] ?? 3);
    if (sw !== 0) return sw;
    return a.endDate.localeCompare(b.endDate);
  });

  const itemLines = sorted.slice(0, 25).map((i) => {
    const note = i.notes ? ` | LATEST: ${i.notes.slice(0, 400)}` : " | (no note)";
    const tag = i.commentChanged ? " [NEW]" : "";
    return `- [${i.status}, ${Math.round(i.actualCompletionPct * 100)}%, due ${i.endDate}] ${(i.requirement || i.action).slice(0, 200)} (${i.owner})${note}${tag}`;
  }).join("\n");

  return `You are a McKinsey-style strategy consultant writing the OPEN-ITEMS section of an executive weekly status update for one workstream.

Workstream: ${d.name}
Health summary (already shown to the reader — do NOT repeat as a bullet): ${d.summaryLine}

OPEN items below (status On-track, At-risk, or Overdue). Each line carries its LATEST comment from the source plan. Items tagged [NEW] changed since last week.

${itemLines}

Write two sections.

progressUpdate:
- ONE bullet per OPEN item above, reflecting the SUBSTANCE of its LATEST comment. Do not merge items. Do not skip an item because its comment seems minor.
- If an item shows "(no note)", still write a bullet from its requirement + status + due date.
- ORDER: [NEW] items first, then Overdue, then At-risk, then On-track.
- Telegraphic fragments, max ~12 words. Noun + status + date. Drop articles and obvious subjects. e.g. "Vendor SOW signed, kickoff 30 Jun" NOT "The vendor signed the SOW and we will kick off on June 30".
- Surface concrete dates, %s, blockers, owners only where they add signal.

nextSteps:
- 2-5 telegraphic bullets: the next concrete action for the open items, from the latest comments, owners, and due dates. Forward-looking only.

HARD RULES:
- NEVER write a bullet about a COMPLETED item or a past finished milestone with a date (e.g. "Procurement assessment complete Apr 4"). Excluded by design.
- Do NOT write a count/rollup bullet (e.g. "3/9 complete") — the system adds it.
- Every bullet starts with "- " (dash space).

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
        max_tokens: 1200,
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
        max_tokens: 1200,
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
