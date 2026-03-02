import { ActionItem, Dependency, Risk, RiskSeverity } from "@/types";

export interface AIRiskContext {
  projectTitle: string;
  day1TargetDate: string;
  daysRemaining: number;
  items: ActionItem[];
  dependencies: Dependency[];
  existingRisks: Risk[];
}

interface AIRiskResult {
  severity: RiskSeverity;
  description: string;
  suggestedMitigation: string;
  affectedItemIds: string[];
  owners: string[];
  workstream: string | null;
}

const SYSTEM_PROMPT = `You are a senior PMO risk analyst for a JV Day-1 readiness program.
Your job is to identify STRATEGIC and CROSS-CUTTING risks that a simple rule-based engine would miss.

DO NOT duplicate risks that already exist. Focus on:
- Cross-workstream dependencies and convergence risks
- Resource concentration and organizational risks
- Scope/timeline feasibility risks
- Patterns suggesting systemic issues (e.g., entire workstreams stalling)
- Risks from items with no clear plan or vague definitions
- Critical path risks where multiple items on the longest chain are at risk

Respond ONLY with a JSON array. Each element must have exactly these fields:
{
  "severity": "Critical" | "High" | "Medium" | "Low",
  "description": "Clear, specific risk description mentioning owners and workstreams by name. NEVER include item IDs or UUIDs in descriptions — use requirement names instead.",
  "suggestedMitigation": "Actionable mitigation recommendation",
  "affectedItemIds": ["uuid1", "uuid2"],
  "owners": ["Owner Name 1", "Owner Name 2"],
  "workstream": "Workstream Name" or null
}

Return between 3 and 6 risks. Keep descriptions under 2 sentences and mitigations under 2 sentences.
If there are no strategic risks beyond what the rule-based engine found, return an empty array [].
Do not wrap the JSON in markdown code fences. Return raw JSON only.`;

function buildUserPrompt(ctx: AIRiskContext): string {
  // Only send non-completed items to reduce prompt size and AI thinking time
  const activeItems = ctx.items.filter((i) => i.status !== "Completed");
  const activeIds = new Set(activeItems.map((i) => i.id));

  const itemLines = activeItems
    .map(
      (item) =>
        `[${item.id.slice(0, 8)}] WS:${item.workstream} | Cat:${item.category} | "${item.requirement || item.action.slice(0, 80)}" | Owner:${item.owner} | Status:${item.status} | ${item.startDate}→${item.endDate} | Actual:${Math.round(item.actualCompletionPct * 100)}%`
    )
    .join("\n");

  // Only include deps where both items are active
  const depLines = ctx.dependencies
    .filter((d) => activeIds.has(d.predecessorId) && activeIds.has(d.successorId))
    .map((d) => `${d.predecessorId.slice(0, 8)} → ${d.successorId.slice(0, 8)}`)
    .join("\n");

  const existingRiskLines = ctx.existingRisks
    .map((r) => `[${r.severity}] ${r.type}: ${r.description.slice(0, 120)}`)
    .join("\n");

  return `Project: ${ctx.projectTitle}
Day-1 Target: ${ctx.day1TargetDate} (${ctx.daysRemaining} days remaining)
Total items: ${ctx.items.length} (${activeItems.length} active, ${ctx.items.length - activeItems.length} completed)

=== ACTION ITEMS ===
${itemLines}

=== DEPENDENCIES ===
${depLines || "None"}

=== EXISTING RULE-BASED RISKS (do NOT duplicate these) ===
${existingRiskLines || "None"}

Analyze the above data and return strategic risks as a JSON array.`;
}

async function callAI(system: string, user: string): Promise<string> {
  const providerName = process.env.AI_PROVIDER || "anthropic";

  if (providerName === "anthropic" && process.env.ANTHROPIC_API_KEY) {
    const { default: Anthropic } = await import("@anthropic-ai/sdk");
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const message = await client.messages.create({
      model: process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6",
      max_tokens: 4096,
      system,
      messages: [{ role: "user", content: user }],
    });
    const block = message.content[0];
    return block.type === "text" ? block.text : "";
  }

  if (providerName === "openai" && process.env.OPENAI_API_KEY) {
    const { default: OpenAI } = await import("openai");
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const completion = await client.chat.completions.create({
      model: "gpt-4o",
      max_tokens: 4096,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    });
    return completion.choices[0]?.message?.content || "";
  }

  throw new Error("No AI provider configured. Set ANTHROPIC_API_KEY or OPENAI_API_KEY.");
}

function parseAIResponse(raw: string, validItemIds: Set<string>, shortToFull: Map<string, string>): AIRiskResult[] {
  let cleaned = raw.trim();
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    // Truncated JSON — try to salvage complete objects by closing the array
    try {
      // Find the last complete object (ends with "}")
      const lastBrace = cleaned.lastIndexOf("}");
      if (lastBrace > 0) {
        const salvaged = cleaned.slice(0, lastBrace + 1) + "]";
        parsed = JSON.parse(salvaged);
      }
    } catch {
      // Still invalid — give up
    }
    if (!parsed) {
      console.error("AI risk analysis returned unparseable JSON:", raw.slice(0, 300));
      return [];
    }
  }

  if (!Array.isArray(parsed)) {
    console.error("AI risk analysis did not return an array");
    return [];
  }

  const validSeverities = new Set(["Critical", "High", "Medium", "Low"]);

  return parsed
    .filter(
      (r: Record<string, unknown>) =>
        r &&
        typeof r.description === "string" &&
        (r.description as string).length > 0 &&
        validSeverities.has(r.severity as string)
    )
    .map((r: Record<string, unknown>) => ({
      severity: r.severity as RiskSeverity,
      // Strip any UUID/hex codes the AI included in descriptions
      description: (r.description as string).slice(0, 500).replace(/\s*\([0-9a-f]{6,}\)/gi, ""),
      suggestedMitigation:
        typeof r.suggestedMitigation === "string"
          ? (r.suggestedMitigation as string).slice(0, 500).replace(/\s*\([0-9a-f]{6,}\)/gi, "")
          : "",
      affectedItemIds: Array.isArray(r.affectedItemIds)
        ? (r.affectedItemIds as string[])
            .map((id) => validItemIds.has(id) ? id : shortToFull.get(id) || null)
            .filter((id): id is string => id !== null)
        : [],
      owners: Array.isArray(r.owners)
        ? (r.owners as string[]).filter((o) => typeof o === "string")
        : [],
      workstream:
        typeof r.workstream === "string" ? (r.workstream as string) : null,
    }))
    .slice(0, 8);
}

export async function analyzeRisks(
  ctx: AIRiskContext
): Promise<Omit<Risk, "id" | "createdAt" | "updatedAt">[]> {
  const userPrompt = buildUserPrompt(ctx);
  const rawResponse = await callAI(SYSTEM_PROMPT, userPrompt);

  // Build map from short ID (8 chars) → full UUID for matching AI response
  const shortToFull = new Map<string, string>();
  for (const item of ctx.items) shortToFull.set(item.id.slice(0, 8), item.id);
  const validItemIds = new Set(ctx.items.map((i) => i.id));
  const aiResults = parseAIResponse(rawResponse, validItemIds, shortToFull);

  return aiResults.map((r) => ({
    type: "AI-Inferred" as const,
    severity: r.severity,
    description: r.description,
    suggestedMitigation: r.suggestedMitigation,
    affectedItemIds: r.affectedItemIds,
    owners: r.owners,
    riskStatus: "Open" as const,
    workstream: r.workstream,
  }));
}
