import { describe, expect, it } from "vitest";
import {
  matchScore,
  rankSuggestions,
  type SuggestionCandidate,
} from "../src/completion/suggestion-ranking";
import type { CompletionItem, CompletionKind } from "../src/shared/types";

function candidate(
  label: string,
  kind: CompletionKind,
  options: Partial<SuggestionCandidate> = {},
): SuggestionCandidate {
  const item: CompletionItem = {
    label,
    insertText: label,
    kind,
    source: "declaration",
    score: 0,
  };
  return { item, baseScore: 0, ...options };
}

describe("matchScore", () => {
  it("ranks exact above prefix above case-insensitive prefix", () => {
    const exact = matchScore("value", "value", true, true)!;
    const prefix = matchScore("valueOf", "value", true, true)!;
    const insensitive = matchScore("Value", "value", true, true)!;
    expect(exact).toBeGreaterThan(prefix);
    expect(prefix).toBeGreaterThan(insensitive);
  });

  it("matches camel-case boundaries", () => {
    expect(matchScore("getValue", "gv", true, true)).not.toBeNull();
    expect(matchScore("max_len", "ml", true, true)).not.toBeNull();
    expect(matchScore("sumOfTwo", "sot", true, true)).not.toBeNull();
  });

  it("does not match unrelated words or words that do not start with the prefix", () => {
    // When typing "te", unrelated words containing 't' and 'e' must not match
    expect(matchScore("byte", "te", true, true)).toBeNull();
    expect(matchScore("System", "te", true, true)).toBeNull();
    expect(matchScore("Integer", "te", true, true)).toBeNull();
    expect(matchScore("Character", "te", true, true)).toBeNull();
    expect(matchScore("extends", "te", true, true)).toBeNull();
    expect(matchScore("private", "te", true, true)).toBeNull();
    expect(matchScore("addTwoNumbers", "te", true, true)).toBeNull();
    expect(matchScore("sumoftwo", "dog", true, true)).toBeNull();

    // Actual matches starting with "te" must match
    expect(matchScore("temp1", "te", true, false)).not.toBeNull();
    expect(matchScore("temp2", "te", true, false)).not.toBeNull();
    expect(matchScore("temp", "te", true, false)).not.toBeNull();
  });

  it("matches fuzzy subsequences only when enabled", () => {
    expect(matchScore("complement", "cmpl", true, true)).not.toBeNull();
    expect(matchScore("complement", "cmpl", true, false)).toBeNull();
  });

  it("returns null when characters are missing", () => {
    expect(matchScore("value", "xyz", true, true)).toBeNull();
  });
});

describe("rankSuggestions", () => {
  it("prefers local declarations over keywords", () => {
    const items = rankSuggestions(
      [
        candidate("return", "keyword"),
        candidate("result", "variable", { scopeId: 1 }),
      ],
      {
        prefix: "re",
        caseSensitive: true,
        fuzzyMatching: true,
        maxResults: 10,
        scopeDistance: () => 0,
      },
    );
    expect(items[0]?.label).toBe("result");
  });

  it("prefers the nearest scope for shadowed names", () => {
    const items = rankSuggestions(
      [
        candidate("value", "variable", { scopeId: 0 }),
        candidate("value", "variable", { scopeId: 2 }),
      ],
      {
        prefix: "val",
        caseSensitive: true,
        fuzzyMatching: true,
        maxResults: 10,
        scopeDistance: (scopeId) => (scopeId === 2 ? 0 : 3),
      },
    );
    expect(items).toHaveLength(1);
    expect(items[0]?.label).toBe("value");
  });

  it("deduplicates labels case-insensitively when the language is", () => {
    const items = rankSuggestions(
      [candidate("SELECT", "keyword"), candidate("select", "function")],
      {
        prefix: "sel",
        caseSensitive: false,
        fuzzyMatching: true,
        maxResults: 10,
      },
    );
    expect(items).toHaveLength(1);
  });

  it("respects maxResults", () => {
    const items = rankSuggestions(
      Array.from({ length: 20 }, (_, i) => candidate(`value${i}`, "variable")),
      {
        prefix: "value",
        caseSensitive: true,
        fuzzyMatching: true,
        maxResults: 5,
      },
    );
    expect(items).toHaveLength(5);
  });

  it("gives frequently used identifiers a boost", () => {
    const items = rankSuggestions(
      [
        candidate("alpha", "variable", { frequency: 1 }),
        candidate("alpine", "variable", { frequency: 40 }),
      ],
      {
        prefix: "al",
        caseSensitive: true,
        fuzzyMatching: true,
        maxResults: 10,
      },
    );
    expect(items[0]?.label).toBe("alpine");
  });

  it("prioritizes variables and identifiers used in code over keywords and snippets", () => {
    const items = rankSuggestions(
      [
        candidate("tryc", "snippet", { baseScore: 0 }),
        candidate("try", "keyword", { baseScore: 0 }),
        candidate("this", "keyword", { baseScore: 0 }),
        candidate("temp1", "variable", { baseScore: 45, frequency: 4, scopeId: 0 }),
        candidate("temp2", "variable", { baseScore: 45, frequency: 3, scopeId: 0 }),
        candidate("tmpdummy", "variable", { baseScore: 45, frequency: 2, scopeId: 0 }),
      ],
      {
        prefix: "t",
        caseSensitive: true,
        fuzzyMatching: false,
        maxResults: 10,
        scopeDistance: () => 0,
      },
    );
    const labels = items.map((i) => i.label);
    expect(labels.indexOf("temp1")).toBeLessThan(labels.indexOf("tryc"));
    expect(labels.indexOf("temp2")).toBeLessThan(labels.indexOf("tryc"));
    expect(labels.indexOf("tmpdummy")).toBeLessThan(labels.indexOf("tryc"));
    expect(labels.indexOf("temp1")).toBeLessThan(labels.indexOf("try"));
    expect(labels.indexOf("temp1")).toBeLessThan(labels.indexOf("this"));
  });
});
