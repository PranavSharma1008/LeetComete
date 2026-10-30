import type { IndexStats, LanguageId } from "../shared/types";
import type { LanguageDefinition } from "../languages/language-config";
import { getLanguageDefinition } from "../languages/language-registry";
import { extractIdentifiers, type ExtractionResult } from "./identifier-extractor";
import { lex, type Token } from "./lexer";
import { buildScopes } from "./scope";

export interface IdentifierIndex extends ExtractionResult {
  language: LanguageId;
  definition: LanguageDefinition;
  text: string;
  tokens: Token[];
  /** Milliseconds spent lexing, building scopes and extracting declarations. */
  parseMs: number;
}

export interface IndexLookup {
  index: IdentifierIndex;
  cached: boolean;
}

/**
 * Build a complete identifier index for one document snapshot.
 *
 * The whole pipeline is synchronous and linear in the size of the document.
 * For a typical LeetCode solution (a few hundred lines) it takes a couple of
 * milliseconds; large pasted files are still handled because the lexer never
 * backtracks.
 */
export function buildIdentifierIndex(text: string, language: LanguageId): IdentifierIndex {
  const started = now();
  const definition = getLanguageDefinition(language);
  const { tokens, blockedRanges } = lex(text, definition);
  const scopes = buildScopes(text, tokens, definition);
  const extraction = extractIdentifiers(text, definition, tokens, blockedRanges, scopes);
  return {
    ...extraction,
    language,
    definition,
    text,
    tokens,
    parseMs: Math.max(0, now() - started),
  };
}

export function indexStats(index: IdentifierIndex, cached: boolean): IndexStats {
  return {
    declarationCount: index.declarations.length,
    identifierCount: index.identifiers.size,
    scopeCount: index.scopes.scopes.length,
    tokenCount: index.tokenCount,
    parseMs: index.parseMs,
    cached,
  };
}

/**
 * Small LRU cache keyed by an editor-supplied document version. Without a
 * version we fall back to a content hash, so the cache is still useful for
 * repeated completions on the same text.
 *
 * Entries hold a reference to the indexed text; equality is checked before
 * reuse so a stale editor version can never serve outdated suggestions.
 */
export class IdentifierIndexCache {
  private readonly entries = new Map<string, IdentifierIndex>();
  private readonly maxEntries: number;

  constructor(maxEntries = 8) {
    this.maxEntries = Math.max(1, maxEntries);
  }

  get(text: string, language: LanguageId, versionKey?: string): IndexLookup {
    const key = `${language}:${versionKey ?? hashText(text)}`;
    const cached = this.entries.get(key);
    if (cached && cached.text === text && cached.language === language) {
      // Refresh LRU position.
      this.entries.delete(key);
      this.entries.set(key, cached);
      return { index: cached, cached: true };
    }

    const index = buildIdentifierIndex(text, language);
    this.entries.set(key, index);
    this.trim();
    return { index, cached: false };
  }

  clear(): void {
    this.entries.clear();
  }

  get size(): number {
    return this.entries.size;
  }

  private trim(): void {
    while (this.entries.size > this.maxEntries) {
      const oldest = this.entries.keys().next().value;
      if (oldest === undefined) return;
      this.entries.delete(oldest);
    }
  }
}

/** FNV-1a. Fast enough for editor-sized documents and stable across reloads. */
export function hashText(text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

function now(): number {
  return typeof performance !== "undefined" && typeof performance.now === "function"
    ? performance.now()
    : Date.now();
}
