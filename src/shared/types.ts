/**
 * Shared domain types for Leetcomete.
 *
 * The extension is deliberately split into three layers that only communicate
 * through these types: language analysis, editor integration, and platform
 * detection. Keeping them independent is what makes the engine testable
 * without a browser and reusable across Monaco, CodeMirror and textareas.
 */

export const SUPPORTED_LANGUAGE_IDS = [
  "java",
  "c",
  "cpp",
  "python",
  "javascript",
  "typescript",
  "csharp",
  "go",
  "rust",
  "kotlin",
  "swift",
  "ruby",
  "php",
  "scala",
  "sql",
] as const;

export type SupportedLanguageId = (typeof SUPPORTED_LANGUAGE_IDS)[number];
/** `plaintext` is used when the platform gives us no language hint. */
export type LanguageId = SupportedLanguageId | "plaintext";

export const SUPPORTED_PLATFORM_IDS = [
  "leetcode",
  "geeksforgeeks",
  "hackerrank",
  "codeforces",
  "codechef",
  "atcoder",
  "exercism",
] as const;

export type SupportedPlatformId = (typeof SUPPORTED_PLATFORM_IDS)[number];
export type PlatformId = SupportedPlatformId | "unknown";

export type EditorKind = "monaco" | "codemirror5" | "ace" | "textarea" | "none";

export type CompletionKind =
  | "variable"
  | "parameter"
  | "field"
  | "property"
  | "constant"
  | "function"
  | "method"
  | "class"
  | "struct"
  | "interface"
  | "enum"
  | "type"
  | "keyword"
  | "builtin"
  | "snippet";

export interface Declaration {
  name: string;
  kind: CompletionKind;
  /** Offset of the identifier itself. */
  start: number;
  end: number;
  /** Base type, e.g. `Stack` for `Stack<Integer> stack`. */
  type?: string;
  /** Full type expression as written, e.g. `Stack<Integer>`. */
  typeText?: string;
  /** Scope that the declaration belongs to. */
  scopeId: number;
  /** 0-based line. */
  line: number;
  /** Detail shown in the completion popup. */
  detail?: string;
  /** True for `self.x = ...` / `this.x = ...` style members. */
  memberOf?: string;
}

export interface CompletionItem {
  label: string;
  /** Text inserted on acceptance. Defaults to `label`. */
  insertText: string;
  kind: CompletionKind;
  detail?: string;
  documentation?: string;
  source: "declaration" | "identifier" | "language" | "snippet" | "member";
  /** Higher is better. The provider may override this with `sortText`. */
  score: number;
  /**
   * Where to put the caret after insertion, relative to the start of
   * `insertText`. Used by snippets. Defaults to the end of the insertion.
   */
  cursorOffset?: number;
  /** True when the item is a snippet that should be inserted verbatim. */
  snippet?: boolean;
  language?: LanguageId;
}

export interface CompletionContext {
  /** Word characters immediately before the caret. */
  prefix: string;
  prefixStart: number;
  /** A member access (`.`, `->`, `::`) immediately precedes the prefix. */
  memberAccess: boolean;
  /** Base type of the receiver when it can be inferred. */
  receiverType?: string;
  /** Identifier text of the receiver. */
  receiverName?: string;
  /** The caret is inside a comment or string literal. */
  blocked: boolean;
  /** The caret is not in code we understand. */
  reason?: string;
}

export interface CompletionRequest {
  text: string;
  /** UTF-16 offset of the caret. */
  offset: number;
  language: LanguageId;
  explicit?: boolean;
  triggerCharacter?: string;
  settings: Pick<
    CompletionSettings,
    | "minPrefixLength"
    | "maxSuggestions"
    | "fuzzyMatching"
    | "showKeywords"
    | "showBuiltins"
    | "showSnippets"
    | "showMemberSuggestions"
  >;
  /** Optional cache key supplied by an editor adapter (e.g. Monaco model version). */
  cacheKey?: string;
}

export interface CompletionSettings {
  minPrefixLength: number;
  maxSuggestions: number;
  acceptOnTab: boolean;
  acceptOnEnter: boolean;
  fuzzyMatching: boolean;
  showKeywords: boolean;
  showBuiltins: boolean;
  showSnippets: boolean;
  showMemberSuggestions: boolean;
  debounceMs: number;
}

export interface IndexStats {
  declarationCount: number;
  identifierCount: number;
  scopeCount: number;
  tokenCount: number;
  parseMs: number;
  cached: boolean;
}

export interface CompletionResult {
  items: CompletionItem[];
  context: CompletionContext;
  /** Milliseconds spent building the identifier index (0 when cached). */
  parseMs: number;
  /** Milliseconds spent ranking/filtering. */
  suggestMs: number;
  index: IndexStats;
}

export interface RuntimeStatus {
  platform: PlatformId;
  platformName: string;
  editor: EditorKind;
  language: LanguageId | null;
  supported: boolean;
  reason?: string;
  url: string;
  version: string;
  /** Set by the isolated-world bridge. */
  extensionEnabled?: boolean;
  indexMs?: number;
}

export type ThemeMode = "auto" | "light" | "dark";

export interface Settings {
  enabled: boolean;
  syncEnabled: boolean;
  platforms: Record<SupportedPlatformId, boolean>;
  languages: Record<SupportedLanguageId, boolean>;
  minPrefixLength: number;
  maxSuggestions: number;
  acceptOnTab: boolean;
  acceptOnEnter: boolean;
  fuzzyMatching: boolean;
  showKeywords: boolean;
  showBuiltins: boolean;
  showSnippets: boolean;
  showMemberSuggestions: boolean;
  debounceMs: number;
  theme: ThemeMode;
  debug: boolean;
}

/** Settings that are safe to hand to the MAIN-world page bridge. */
export type PublicSettings = Settings;

export interface GetStatusMessage {
  type: "LEETCOMETE_GET_STATUS";
}

export interface StatusResponse {
  status: RuntimeStatus | null;
  settings: Settings;
  version: string;
}

export interface OpenOptionsMessage {
  type: "LEETCOMETE_OPEN_OPTIONS";
}

export type RuntimeMessage = GetStatusMessage | OpenOptionsMessage;
