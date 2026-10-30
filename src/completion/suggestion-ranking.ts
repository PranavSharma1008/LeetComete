import type { CompletionItem, CompletionKind } from "../shared/types";

export interface SuggestionCandidate {
  item: CompletionItem;
  /** Context-independent quality of the source, e.g. declaration vs keyword. */
  baseScore: number;
  /** Scope the declaration belongs to, when known. */
  scopeId?: number;
  /** How often the identifier appears in the document. */
  frequency?: number;
}

export interface RankOptions {
  prefix: string;
  caseSensitive: boolean;
  fuzzyMatching: boolean;
  maxResults: number;
  /** Number of parent hops from a declaration scope to the cursor scope. */
  scopeDistance?: (scopeId: number) => number;
}

const KIND_WEIGHT: Record<CompletionKind, number> = {
  parameter: 34,
  variable: 30,
  field: 28,
  property: 28,
  function: 26,
  method: 26,
  constant: 22,
  class: 20,
  struct: 20,
  interface: 20,
  enum: 18,
  type: 18,
  builtin: 14,
  keyword: 10,
  snippet: 12,
};

const SOURCE_WEIGHT: Record<CompletionItem["source"], number> = {
  declaration: 26,
  member: 22,
  identifier: 12,
  snippet: 8,
  language: 4,
};

/**
 * Rank and de-duplicate candidates. The ordering is deliberately transparent:
 *
 * 1. match quality (exact > prefix > camel-case > fuzzy)
 * 2. kind (locals and parameters beat keywords)
 * 3. scope proximity (locals beat outer-scope declarations)
 * 4. document frequency (a name used often is usually the intended one)
 */
export function rankSuggestions(
  candidates: readonly SuggestionCandidate[],
  options: RankOptions,
): CompletionItem[] {
  const best = new Map<string, { item: CompletionItem; total: number }>();

  for (const candidate of candidates) {
    const match = matchScore(
      candidate.item.label,
      options.prefix,
      options.caseSensitive,
      options.fuzzyMatching,
    );
    if (match === null) continue;

    const distance = candidate.scopeId !== undefined
      ? options.scopeDistance?.(candidate.scopeId)
      : undefined;
    const scopeBonus =
      distance === undefined ? 0
        : distance === 0 ? 36
          : distance === 1 ? 22
            : distance === 2 ? 12
              : distance === 3 ? 6
                : 0;
    const frequencyBonus = candidate.frequency
      ? Math.min(18, Math.log2(candidate.frequency + 1) * 4)
      : 0;

    const total =
      match +
      candidate.baseScore +
      KIND_WEIGHT[candidate.item.kind] +
      SOURCE_WEIGHT[candidate.item.source] +
      scopeBonus +
      frequencyBonus;

    const key = options.caseSensitive
      ? candidate.item.label
      : candidate.item.label.toLowerCase();
    const existing = best.get(key);
    if (!existing || total > existing.total) {
      best.set(key, {
        item: { ...candidate.item, score: total },
        total,
      });
    }
  }

  const ranked = [...best.values()].sort((a, b) => {
    if (b.total !== a.total) return b.total - a.total;
    if (a.item.label.length !== b.item.label.length) {
      return a.item.label.length - b.item.label.length;
    }
    return a.item.label.localeCompare(b.item.label);
  });

  return ranked.slice(0, Math.max(1, options.maxResults)).map((entry) => entry.item);
}

/**
 * Returns a match score, or `null` when the label does not match the prefix.
 * Scores are intentionally large enough that match quality dominates kind
 * weights (a perfectly matched keyword should beat a fuzzy local variable).
 */
export function matchScore(
  label: string,
  prefix: string,
  caseSensitive: boolean,
  fuzzyMatching: boolean,
): number | null {
  if (!prefix) return 0;

  const lowerLabel = label.toLowerCase();
  const lowerPrefix = prefix.toLowerCase();

  if (label === prefix) {
    return 1200 + Math.min(label.length, 24);
  }

  if (lowerLabel === lowerPrefix) {
    return 900 + Math.min(label.length, 24);
  }

  if (label.startsWith(prefix)) {
    const coverage = Math.min(1, prefix.length / Math.max(1, label.length));
    return 920 + coverage * 80;
  }

  if (lowerLabel.startsWith(lowerPrefix)) {
    const coverage = Math.min(1, prefix.length / Math.max(1, label.length));
    // Case-insensitive prefixes are still strong, but exact-case wins.
    return 820 + coverage * 80;
  }

  // Word-boundary / camel-case match: `gv` -> `getValue`, `mli` -> `max_len`.
  const boundary = boundaryScore(lowerLabel, lowerPrefix);
  if (boundary !== null) return boundary;

  if (!fuzzyMatching) return null;

  return subsequenceScore(lowerLabel, lowerPrefix);
}

function boundaryScore(label: string, needle: string): number | null {
  if (needle.length < 2) return null;

  const positions: number[] = [];
  for (let i = 0; i < label.length; i++) {
    const previous = label[i - 1] ?? "";
    const char = label[i] ?? "";
    const isBoundary =
      i === 0 ||
      /[_\-\s]/.test(previous) ||
      (/[a-z0-9]/.test(previous) && /[A-Z]/.test(char));
    if (isBoundary) positions.push(i);
  }
  if (positions.length < needle.length) return null;

  let cursor = 0;
  let matched = 0;
  let gaps = 0;
  for (const position of positions) {
    const char = label[position] ?? "";
    const target = needle[matched] ?? "";
    if (char !== target) continue;
    if (matched > 0) gaps += position - cursor - 1;
    cursor = position;
    matched++;
    if (matched === needle.length) break;
  }
  if (matched !== needle.length) return null;

  return Math.max(520, 760 - gaps * 12);
}

function subsequenceScore(haystack: string, needle: string): number | null {
  let index = 0;
  let consecutive = 0;
  let bestConsecutive = 0;
  let gaps = 0;
  let lastMatch = -2;

  for (let i = 0; i < haystack.length && index < needle.length; i++) {
    if (haystack[i] !== needle[index]) continue;
    if (i === lastMatch + 1) {
      consecutive++;
      bestConsecutive = Math.max(bestConsecutive, consecutive);
    } else {
      consecutive = 0;
      if (lastMatch >= 0) gaps += i - lastMatch - 1;
    }
    lastMatch = i;
    index++;
  }
  if (index !== needle.length) return null;

  const density = needle.length / Math.max(1, haystack.length);
  const consecutiveBonus = (bestConsecutive / needle.length) * 120;
  return Math.max(220, 430 + consecutiveBonus + density * 90 - gaps * 6);
}
