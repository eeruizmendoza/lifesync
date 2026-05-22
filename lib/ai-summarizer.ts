/**
 * lib/ai-summarizer.ts
 * Phase 53 — AI Communication Summaries
 *
 * Generates structured summaries of calls, chat threads, and voice messages.
 * Provider priority:
 *   1. Anthropic Claude (ANTHROPIC_API_KEY)
 *   2. OpenAI GPT-4o-mini (OPENAI_API_KEY)
 *   3. Graceful no-op (returns null)
 *
 * Summary schema:
 * {
 *   digest:      string    — one-sentence overview
 *   topics:      string[]  — main topics discussed
 *   decisions:   string[]  — concrete decisions made
 *   actionItems: { text: string; owner?: string; deadline?: string }[]
 *   sentiment:   'positive' | 'neutral' | 'tense'
 *   keyPhrases:  string[]  — notable phrases / quotes
 *   generatedAt: string    — ISO timestamp
 * }
 */

export interface ActionItem {
  text: string;
  owner?: string;
  deadline?: string;
}

export interface AISummary {
  digest: string;
  topics: string[];
  decisions: string[];
  actionItems: ActionItem[];
  sentiment: 'positive' | 'neutral' | 'tense';
  keyPhrases: string[];
  generatedAt: string;
}

export interface SummarizeInput {
  /** Type of interaction */
  kind: 'call' | 'chat' | 'voice_message';
  /** Transcript lines or message texts */
  content: string[];
  /** Languages involved (e.g. ['en', 'es']) */
  languages?: string[];
  /** How long in seconds (for calls) */
  durationSeconds?: number;
  /** Contact name if known */
  contactName?: string;
}

// ─── System prompt ─────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are a professional communication analyst for LifeSync, a multilingual communication platform.
Given a conversation transcript or message thread, return a concise structured JSON summary.

Return ONLY valid JSON matching this exact schema (no markdown, no extra keys):
{
  "digest": "<1-2 sentence plain-language summary>",
  "topics": ["<topic1>", "<topic2>"],
  "decisions": ["<decision1>"],
  "actionItems": [{"text": "<action>", "owner": "<person or null>", "deadline": "<date or null>"}],
  "sentiment": "<positive|neutral|tense>",
  "keyPhrases": ["<notable phrase1>"]
}

Rules:
- digest: max 150 characters, plain English, third-person perspective
- topics: 1-5 topics, noun phrases, Title Case
- decisions: concrete agreements/conclusions reached; empty array if none
- actionItems: clear next steps only; owner = person responsible; deadline = explicit date if mentioned
- sentiment: positive = friendly/collaborative, tense = conflict/frustration, neutral = neutral/professional
- keyPhrases: 0-3 notable phrases, exact quotes preferred
- If content is too short or unclear, still return valid JSON with best-effort values`;

function buildUserMessage(input: SummarizeInput): string {
  const parts: string[] = [];

  const kindLabel = input.kind === 'call'
    ? `Phone/Video Call`
    : input.kind === 'voice_message' ? 'Voice Message' : 'Chat Thread';

  parts.push(`=== ${kindLabel} ===`);

  if (input.contactName) parts.push(`Contact: ${input.contactName}`);
  if (input.durationSeconds && input.durationSeconds > 0) {
    const m = Math.floor(input.durationSeconds / 60);
    const s = input.durationSeconds % 60;
    parts.push(`Duration: ${m}m ${s}s`);
  }
  if (input.languages?.length) {
    parts.push(`Languages: ${input.languages.join(', ')}`);
  }

  parts.push('');
  parts.push('Transcript/Messages:');
  if (input.content.length === 0) {
    parts.push('[No transcript available]');
  } else {
    input.content.forEach((line, i) => parts.push(`${i + 1}. ${line}`));
  }

  return parts.join('\n');
}

function parseJsonResponse(raw: string): AISummary | null {
  try {
    // Strip markdown code fences if present
    const cleaned = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const parsed = JSON.parse(cleaned);

    // Validate required fields
    if (typeof parsed.digest !== 'string') return null;

    return {
      digest: String(parsed.digest).slice(0, 200),
      topics: Array.isArray(parsed.topics) ? parsed.topics.map(String).slice(0, 5) : [],
      decisions: Array.isArray(parsed.decisions) ? parsed.decisions.map(String).slice(0, 10) : [],
      actionItems: Array.isArray(parsed.actionItems)
        ? parsed.actionItems.slice(0, 10).map((a: any) => ({
            text: String(a.text ?? ''),
            owner: a.owner ? String(a.owner) : undefined,
            deadline: a.deadline ? String(a.deadline) : undefined,
          }))
        : [],
      sentiment: ['positive', 'neutral', 'tense'].includes(parsed.sentiment)
        ? parsed.sentiment
        : 'neutral',
      keyPhrases: Array.isArray(parsed.keyPhrases) ? parsed.keyPhrases.map(String).slice(0, 3) : [],
      generatedAt: new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

// ─── Provider: Anthropic Claude ─────────────────────────────────────────────

async function summarizeWithClaude(input: SummarizeInput): Promise<{ summary: AISummary; model: string } | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5',
        max_tokens: 512,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: buildUserMessage(input) }],
      }),
      signal: AbortSignal.timeout(15_000),
    });

    if (!res.ok) return null;
    const data = await res.json();
    const text = data?.content?.[0]?.text ?? '';
    const summary = parseJsonResponse(text);
    if (!summary) return null;
    return { summary, model: 'claude-haiku-4-5' };
  } catch {
    return null;
  }
}

// ─── Provider: OpenAI GPT-4o-mini ───────────────────────────────────────────

async function summarizeWithOpenAI(input: SummarizeInput): Promise<{ summary: AISummary; model: string } | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        max_tokens: 512,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: buildUserMessage(input) },
        ],
      }),
      signal: AbortSignal.timeout(15_000),
    });

    if (!res.ok) return null;
    const data = await res.json();
    const text = data?.choices?.[0]?.message?.content ?? '';
    const summary = parseJsonResponse(text);
    if (!summary) return null;
    return { summary, model: 'gpt-4o-mini' };
  } catch {
    return null;
  }
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Summarize a communication.
 * Returns null if no AI provider is configured or summary generation fails.
 */
export async function summarize(
  input: SummarizeInput,
): Promise<{ summary: AISummary; model: string } | null> {
  // Try Claude first (cheaper for structured output tasks), then OpenAI
  const result = await summarizeWithClaude(input) ?? await summarizeWithOpenAI(input);
  return result;
}

/**
 * Returns true if any AI provider is configured.
 */
export function hasAIProvider(): boolean {
  return !!(process.env.ANTHROPIC_API_KEY || process.env.OPENAI_API_KEY);
}
