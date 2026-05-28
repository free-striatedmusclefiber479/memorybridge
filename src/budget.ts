import { encode } from "gpt-tokenizer";

export const TOKEN_BUDGET = {
  DEFAULT_LOAD: 400,
  HARD_CAP: 1500,
  SEARCH_RESULT_CAP: 600,
  ENTRY_CHAR_CAP: 120,
} as const;

export function countTokens(text: string): number {
  if (!text) return 0;
  try {
    return encode(text).length;
  } catch {
    return Math.ceil(text.length / 4);
  }
}

export function truncateToBudget(text: string, maxTokens: number): { text: string; tokens: number; truncated: boolean } {
  const tokens = countTokens(text);
  if (tokens <= maxTokens) return { text, tokens, truncated: false };

  const lines = text.split("\n");
  let acc = "";
  let accTokens = 0;
  for (const line of lines) {
    const lineTokens = countTokens(line + "\n");
    if (accTokens + lineTokens > maxTokens) break;
    acc += line + "\n";
    accTokens += lineTokens;
  }
  return { text: acc.trimEnd() + "\n[…truncated for token budget]", tokens: accTokens, truncated: true };
}
