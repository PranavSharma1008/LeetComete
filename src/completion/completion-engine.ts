import type {
  CompletionContext,
  CompletionItem,
  CompletionKind,
  CompletionRequest,
  CompletionResult,
  Declaration,
  LanguageId,
} from "../shared/types";
import type { LanguageDefinition } from "../languages/language-config";
import { getMembersForType } from "../languages/language-registry";
import { buildCompletionContext } from "./completion-context";
import {
  IdentifierIndexCache,
  indexStats,
  type IdentifierIndex,
} from "./identifier-index";
import { rankSuggestions, type SuggestionCandidate } from "./suggestion-ranking";

/**
 * The platform-independent completion engine.
 *
 * Every editor adapter calls `complete()` with the current document snapshot.
 * The engine owns indexing, scope analysis and ranking, and returns plain data
 * so it can be tested in Node and reused by Monaco, CodeMirror and textareas.
 */
export class CompletionEngine {
  private readonly cache: IdentifierIndexCache;

  constructor(cache = new IdentifierIndexCache()) {
    this.cache = cache;
  }

  complete(request: CompletionRequest): CompletionResult {
    const suggestStarted = now();
    const { index, cached } = this.cache.get(
      request.text,
      request.language,
      request.cacheKey,
    );
    const context = buildCompletionContext(
      request.text,
      request.offset,
      index.definition,
      index,
    );
    const stats = indexStats(index, cached);

    if (context.blocked) {
      return this.empty(context, index, stats, suggestStarted, context.reason);
    }

    const prefixTooShort =
      !request.explicit &&
      !context.memberAccess &&
      context.prefix.length < request.settings.minPrefixLength;
    if (prefixTooShort) {
      return this.empty(context, index, stats, suggestStarted, "Prefix is too short.");
    }

    const candidates = this.collectCandidates(request, index, context);
    const items = rankSuggestions(candidates, {
      prefix: context.prefix,
      caseSensitive: index.definition.caseSensitive,
      fuzzyMatching: request.settings.fuzzyMatching,
      maxResults: request.settings.maxSuggestions,
      scopeDistance: (scopeId) =>
        scopeDistance(index, scopeId, index.scopes.scopeAt(request.offset).id),
    });

    return {
      items,
      context,
      parseMs: cached ? 0 : index.parseMs,
      suggestMs: Math.max(0, now() - suggestStarted),
      index: stats,
    };
  }

  /** Exposed for diagnostics and tests. */
  clearCache(): void {
    this.cache.clear();
  }

  get cacheSize(): number {
    return this.cache.size;
  }

  private empty(
    context: CompletionContext,
    index: IdentifierIndex,
    stats: CompletionResult["index"],
    started: number,
    reason?: string,
  ): CompletionResult {
    return {
      items: [],
      context: reason ? { ...context, reason } : context,
      parseMs: stats.cached ? 0 : index.parseMs,
      suggestMs: Math.max(0, now() - started),
      index: stats,
    };
  }

  private collectCandidates(
    request: CompletionRequest,
    index: IdentifierIndex,
    context: CompletionContext,
  ): SuggestionCandidate[] {
    return context.memberAccess
      ? this.collectMemberCandidates(request, index, context)
      : this.collectScopeCandidates(request, index, context);
  }

  // -------------------------------------------------------------------------
  // Normal scope completion
  // -------------------------------------------------------------------------

  private collectScopeCandidates(
    request: CompletionRequest,
    index: IdentifierIndex,
    context: CompletionContext,
  ): SuggestionCandidate[] {
    const candidates: SuggestionCandidate[] = [];
    const cursorScope = index.scopes.scopeAt(request.offset);
    const definition = index.definition;

    for (const declaration of index.declarations) {
      // `self.x = ...` / `this.x = ...` are only useful after a member access.
      if (declaration.memberOf !== undefined) continue;
      // Never suggest the identifier currently being typed.
      if (declaration.start <= request.offset && request.offset <= declaration.end) {
        continue;
      }
      if (
        !index.scopes.isVisible(
          declaration.scopeId,
          cursorScope.id,
          declaration.start,
          request.offset,
          declaration.kind,
        )
      ) {
        continue;
      }

      candidates.push({
        item: {
          label: declaration.name,
          insertText: declaration.name,
          kind: declaration.kind,
          detail: declaration.detail,
          source: "declaration",
          score: 0,
          language: index.language,
        },
        baseScore: 45,
        scopeId: declaration.scopeId,
      });
    }

    // Identifiers the user has already written but that the extractor did not
    // classify (method calls, imported names, destructured keys, ...).
    const normalizedPrefix = definition.caseSensitive
      ? context.prefix
      : context.prefix.toLowerCase();
    for (const [name, frequency] of index.identifiers) {
      // The word currently being typed is itself an identifier occurrence; do
      // not let it outrank a real declaration that starts with the same text.
      if (name === normalizedPrefix) continue;
      candidates.push({
        item: {
          label: name,
          insertText: name,
          kind: "variable",
          detail: `identifier · used ${frequency}×`,
          source: "identifier",
          score: 0,
          language: index.language,
        },
        baseScore: 0,
        frequency,
      });
    }

    if (request.settings.showKeywords) {
      for (const keyword of definition.keywords) {
        candidates.push(languageCandidate(keyword, "keyword", "keyword", index.language));
      }
      for (const keyword of definition.modifiers) {
        candidates.push(languageCandidate(keyword, "keyword", "modifier", index.language));
      }
    }

    if (request.settings.showBuiltins) {
      for (const type of definition.builtinTypes) {
        candidates.push(languageCandidate(type, "builtin", "built-in type", index.language));
      }
      for (const global of definition.globals ?? []) {
        const kind: CompletionKind =
          global.kind === "constant" ? "constant"
            : global.kind === "function" ? "function"
              : "builtin";
        candidates.push({
          item: {
            label: global.name,
            insertText: global.name,
            kind,
            detail: global.detail ?? global.kind ?? "built-in",
            source: "language",
            score: 0,
            language: index.language,
          },
          baseScore: 4,
        });
      }
    }

    if (request.settings.showSnippets) {
      for (const snippet of definition.snippets ?? []) {
        candidates.push(snippetCandidate(snippet, index.language));
      }
    }

    return candidates;
  }

  // -------------------------------------------------------------------------
  // Member completion (`obj.`, `this.`, `Type::`)
  // -------------------------------------------------------------------------

  private collectMemberCandidates(
    request: CompletionRequest,
    index: IdentifierIndex,
    context: CompletionContext,
  ): SuggestionCandidate[] {
    if (!request.settings.showMemberSuggestions) return [];
    const candidates: SuggestionCandidate[] = [];
    const definition = index.definition;
    const receiverName = context.receiverName;

    const memberType = context.receiverType;
    if (memberType) {
      for (const member of getMembersForType(index.language, memberType)) {
        candidates.push(memberCandidate(member.name, member.detail, index.language));
      }
    }

    const cursorScope = index.scopes.scopeAt(request.offset);
    const isSelfAccess = receiverName === "this" || receiverName === "self";
    const classScopeId = isSelfAccess ? enclosingClassScope(index, cursorScope.id) : undefined;

    for (const declaration of index.declarations) {
      if (declaration.start >= request.offset) continue;
      const belongsToClass =
        classScopeId !== undefined &&
        declaration.scopeId === classScopeId &&
        (declaration.kind === "field" ||
          declaration.kind === "property" ||
          declaration.kind === "method" ||
          declaration.kind === "function");
      const belongsToReceiver =
        receiverName !== undefined &&
        (declaration.memberOf === receiverName ||
          (isSelfAccess && (declaration.memberOf === "this" || declaration.memberOf === "self")));
      if (!belongsToClass && !belongsToReceiver) continue;

      candidates.push({
        item: {
          label: declaration.name,
          insertText: declaration.name,
          kind: declaration.kind,
          detail: declaration.detail,
          source: "declaration",
          score: 0,
          language: index.language,
        },
        baseScore: 50,
        scopeId: declaration.scopeId,
      });
    }

    return candidates;
  }
}

function languageCandidate(
  label: string,
  kind: CompletionKind,
  detail: string,
  language: LanguageId,
): SuggestionCandidate {
  return {
    item: {
      label,
      insertText: label,
      kind,
      detail,
      source: "language",
      score: 0,
      language,
    },
    baseScore: 0,
  };
}

function memberCandidate(
  name: string,
  detail: string | undefined,
  language: LanguageId,
): SuggestionCandidate {
  const kind: CompletionKind = detail?.includes("(") ? "method" : "property";
  return {
    item: {
      label: name,
      insertText: name,
      kind,
      detail,
      source: "member",
      score: 0,
      language,
    },
    baseScore: 35,
  };
}

function snippetCandidate(
  snippet: { prefix: string; body: string; detail: string },
  language: LanguageId,
): SuggestionCandidate {
  const marker = snippet.body.indexOf("$0");
  const insertText = marker >= 0
    ? snippet.body.slice(0, marker) + snippet.body.slice(marker + 2)
    : snippet.body;
  return {
    item: {
      label: snippet.prefix,
      insertText,
      kind: "snippet",
      detail: snippet.detail,
      source: "snippet",
      score: 0,
      cursorOffset: marker >= 0 ? marker : insertText.length,
      snippet: true,
      language,
    },
    baseScore: 10,
  };
}

/** Number of parent hops from `fromScopeId` up to `toScopeId`. */
function scopeDistance(index: IdentifierIndex, fromScopeId: number, toScopeId: number): number {
  if (fromScopeId === toScopeId) return 0;
  let current = toScopeId;
  let distance = 0;
  while (current >= 0 && distance < 64) {
    const scope = index.scopes.scopes[current];
    if (!scope || scope.parentId < 0) break;
    current = scope.parentId;
    distance++;
    if (current === fromScopeId) return distance;
  }
  return 99;
}

function enclosingClassScope(index: IdentifierIndex, scopeId: number): number | undefined {
  let current = scopeId;
  let guard = 0;
  while (current >= 0 && guard++ < 64) {
    const scope = index.scopes.scopes[current];
    if (!scope) return undefined;
    if (scope.kind === "class") return scope.id;
    current = scope.parentId;
  }
  return undefined;
}

function now(): number {
  return typeof performance !== "undefined" && typeof performance.now === "function"
    ? performance.now()
    : Date.now();
}

/** Re-exported so adapters do not need to import the index module directly. */
export type { Declaration };
