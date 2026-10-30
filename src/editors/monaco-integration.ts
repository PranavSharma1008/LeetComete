import { MONACO_LANGUAGE_ALIASES } from "../shared/constants";
import type { CompletionItem, LanguageId, Settings } from "../shared/types";
import { CompletionEngine } from "../completion/completion-engine";
import { detectLanguage } from "../languages/language-detection";
import { detectPlatform } from "../platforms/platform-registry";

interface MonacoPosition {
  lineNumber: number;
  column: number;
}

interface MonacoModel {
  id?: string;
  getValue(): string;
  getOffsetAt(position: MonacoPosition): number;
  getPositionAt(offset: number): MonacoPosition;
  getLanguageId(): string;
  getVersionId?(): number;
}

interface MonacoRange {
  new (startLine: number, startColumn: number, endLine: number, endColumn: number): unknown;
}

interface MonacoEditorInstance {
  getModel?(): MonacoModel | null;
  hasWidgetFocus?(): boolean;
  hasTextFocus?(): boolean;
  updateOptions?(options: Record<string, unknown>): void;
  trigger?(source: string, handlerId: string, payload: unknown): void;
}

interface MonacoApi {
  Range: MonacoRange;
  editor: {
    getModels?(): MonacoModel[];
    getEditors?(): MonacoEditorInstance[];
    onDidCreateEditor?(listener: (editor: unknown) => void): { dispose(): void };
  };
  languages: {
    CompletionItemKind?: Record<string, number>;
    CompletionItemInsertTextRule?: { InsertAsSnippet: number };
    getLanguages?(): Array<{ id: string }>;
    registerCompletionItemProvider(
      languageId: string,
      provider: {
        triggerCharacters?: string[];
        provideCompletionItems(
          model: MonacoModel,
          position: MonacoPosition,
        ): { suggestions: unknown[] };
      },
    ): { dispose(): void };
  };
}

interface MonacoGlobal {
  __leetcometeMonaco?: {
    engine: CompletionEngine;
    getSettings: () => Settings;
    disposables: Array<{ dispose(): void }>;
    languages: string[];
  };
}

const KIND_MAP: Record<CompletionItem["kind"], string> = {
  variable: "Variable",
  parameter: "Variable",
  field: "Field",
  property: "Property",
  constant: "Constant",
  function: "Function",
  method: "Method",
  class: "Class",
  struct: "Struct",
  interface: "Interface",
  enum: "Enum",
  type: "TypeParameter",
  keyword: "Keyword",
  builtin: "Value",
  snippet: "Snippet",
};

const MONACO_TRIGGER_CHARACTERS = [".", ">", ":", "(", "[", "$"];

/**
 * Configure Monaco editor instances on the page to ensure quickSuggestions and
 * autocomplete triggers are active (LeetCode disables them by default for free users).
 */
export function configureMonacoEditors(): void {
  const api = getMonacoApi();
  if (!api?.editor?.getEditors) return;
  try {
    const editors = api.editor.getEditors();
    for (const editor of editors) {
      const ed = editor as MonacoEditorInstance & { _leetcometeConfigured?: boolean };
      if (!ed._leetcometeConfigured && typeof ed.updateOptions === "function") {
        ed.updateOptions({
          quickSuggestions: {
            other: true,
            comments: false,
            strings: false,
          },
          suggestOnTriggerCharacters: true,
          acceptSuggestionOnEnter: "on",
          tabCompletion: "on",
        });
        ed._leetcometeConfigured = true;
      }
    }
  } catch (error) {
    console.warn("[Leetcomete] Could not configure Monaco editor options.", error);
  }
}

/**
 * Register a Monaco completion provider once per page. Monaco owns the popup,
 * keyboard handling and undo, so this integration is intentionally thin: we
 * only translate our engine result into Monaco's suggestion shape.
 */
export function registerMonaco(getSettings: () => Settings): boolean {
  const api = getMonacoApi();
  if (!api) return false;

  const host = window as unknown as MonacoGlobal;
  if (host.__leetcometeMonaco) {
    configureMonacoEditors();
    return true;
  }

  const engine = new CompletionEngine();
  const dynamicLanguages = api.languages.getLanguages?.()?.map((l) => l.id) ?? [];
  const languages = new Set<string>([
    "plaintext",
    ...Object.keys(MONACO_LANGUAGE_ALIASES),
    ...Object.values(MONACO_LANGUAGE_ALIASES),
    ...dynamicLanguages,
  ]);

  const state: NonNullable<MonacoGlobal["__leetcometeMonaco"]> = {
    engine,
    getSettings,
    disposables: [],
    languages: [...languages],
  };
  host.__leetcometeMonaco = state;

  for (const languageId of languages) {
    try {
      const disposable = api.languages.registerCompletionItemProvider(languageId, {
        triggerCharacters: MONACO_TRIGGER_CHARACTERS,
        provideCompletionItems(model, position) {
          return {
            suggestions: provideSuggestions(api, engine, getSettings, model, position),
          };
        },
      });
      state.disposables.push(disposable);
    } catch (error) {
      console.warn(`[Leetcomete] Could not register Monaco provider for ${languageId}.`, error);
    }
  }

  configureMonacoEditors();

  if (typeof api.editor.onDidCreateEditor === "function") {
    try {
      const disposable = api.editor.onDidCreateEditor(() => {
        configureMonacoEditors();
      });
      state.disposables.push(disposable);
    } catch {
      // best-effort
    }
  }

  // Explicit hotkey trigger (Ctrl+Space and Alt+/) on Monaco editor focus
  const handleKeydown = (event: KeyboardEvent): void => {
    if (
      (event.code === "Space" && event.ctrlKey && !event.altKey && !event.metaKey && !event.shiftKey) ||
      (event.key === "/" && event.altKey && !event.ctrlKey && !event.metaKey)
    ) {
      const editors = api.editor.getEditors?.() ?? [];
      for (const ed of editors) {
        if ((ed.hasWidgetFocus?.() || ed.hasTextFocus?.()) && typeof ed.trigger === "function") {
          event.preventDefault();
          ed.trigger("keyboard", "editor.action.triggerSuggest", {});
          break;
        }
      }
    }
  };
  window.addEventListener("keydown", handleKeydown, true);
  state.disposables.push({
    dispose: () => window.removeEventListener("keydown", handleKeydown, true),
  });

  return true;
}

function provideSuggestions(
  api: MonacoApi,
  engine: CompletionEngine,
  getSettings: () => Settings,
  model: MonacoModel,
  position: MonacoPosition,
): unknown[] {
  const settings = getSettings();
  if (!settings.enabled) return [];

  // Providers stay registered for the lifetime of the page, so check the
  // current host here as well as in the editor manager. This keeps a provider
  // from firing after the user navigates to another site (or disables the
  // current platform) without tearing down the whole page bridge.
  const platform = detectPlatform();
  if (!platform || !settings.platforms[platform.id]) return [];

  const text = model.getValue();
  const offset = model.getOffsetAt(position);
  const language = detectLanguage({
    editorHint: model.getLanguageId(),
    hint: platform.getLanguageHint(),
    code: text,
  });

  if (language !== "plaintext" && !settings.languages[language]) return [];

  const result = engine.complete({
    text,
    offset,
    language,
    settings: {
      minPrefixLength: settings.minPrefixLength,
      maxSuggestions: settings.maxSuggestions,
      fuzzyMatching: settings.fuzzyMatching,
      showKeywords: settings.showKeywords,
      showBuiltins: settings.showBuiltins,
      showSnippets: settings.showSnippets,
      showMemberSuggestions: settings.showMemberSuggestions,
    },
    cacheKey: `${model.id ?? "model"}:${model.getVersionId?.() ?? text.length}`,
  });

  if (result.items.length === 0) return [];

  const word = (model as unknown as {
    getWordUntilPosition?(pos: MonacoPosition): { startColumn: number; endColumn: number; word: string };
  }).getWordUntilPosition?.(position);
  const start = model.getPositionAt(result.context.prefixStart);
  const startCol = start.column;
  const endCol = word && word.endColumn > position.column ? word.endColumn : position.column;
  const range = api.Range
    ? new api.Range(position.lineNumber, startCol, position.lineNumber, endCol)
    : {
        startLineNumber: position.lineNumber,
        startColumn: startCol,
        endLineNumber: position.lineNumber,
        endColumn: endCol,
      };

  return result.items.map((item, index) =>
    toMonacoSuggestion(api, item, range, language, index === 0),
  );
}

function toMonacoSuggestion(
  api: MonacoApi,
  item: CompletionItem,
  range: unknown,
  language: LanguageId,
  preselect: boolean,
): Record<string, unknown> {
  const kind = api.languages.CompletionItemKind?.[KIND_MAP[item.kind]] ?? 0;
  const suggestion: Record<string, unknown> = {
    label: item.label,
    kind,
    detail: item.detail ? `Leetcomete · ${item.detail}` : "Leetcomete",
    documentation: item.documentation,
    insertText: item.insertText,
    filterText: item.label,
    range,
    // Monaco sorts ascending; invert the score so higher is earlier.
    sortText: `${String(1_000_000 - Math.round(item.score)).padStart(8, "0")}:${item.label}`,
    preselect,
  };

  if (item.snippet) {
    const cursor = item.cursorOffset ?? item.insertText.length;
    suggestion.insertText =
      escapeSnippet(item.insertText.slice(0, cursor)) +
      "$0" +
      escapeSnippet(item.insertText.slice(cursor));
    suggestion.insertTextRules =
      api.languages.CompletionItemInsertTextRule?.InsertAsSnippet ?? 4;
  }

  if (language === "plaintext") suggestion.detail = "Leetcomete · plain text";

  return suggestion;
}

/** Escape snippet metacharacters while preserving the `$0` marker we add. */
function escapeSnippet(text: string): string {
  return text.replace(/\\/g, "\\\\").replace(/\$/g, "\\$");
}

export function getMonacoApi(): MonacoApi | null {
  const candidate = (window as unknown as { monaco?: unknown }).monaco;
  if (!candidate || typeof candidate !== "object") return null;
  const api = candidate as Partial<MonacoApi>;
  if (!api.languages?.registerCompletionItemProvider || !api.Range) return null;
  return api as MonacoApi;
}

/** Best-effort language id for the active Monaco model, used for status only. */
export function getMonacoLanguageId(): string | null {
  const api = getMonacoApi();
  if (!api) return null;
  try {
    const editors = api.editor.getEditors?.() ?? [];
    // 1. If an editor has focus, prefer that editor's model:
    for (const ed of editors) {
      const edWithFocus = ed as { hasWidgetFocus?: () => boolean; hasTextFocus?: () => boolean };
      if (edWithFocus.hasWidgetFocus?.() || edWithFocus.hasTextFocus?.()) {
        const lang = ed.getModel?.()?.getLanguageId();
        if (lang && lang !== "plaintext") return lang;
      }
    }
    // 2. Look for any editor whose model has a recognized non-plaintext language:
    for (const ed of editors) {
      const lang = ed.getModel?.()?.getLanguageId();
      if (lang && lang !== "plaintext") return lang;
    }
    // 3. Look across all registered models for a non-plaintext language:
    const models = api.editor.getModels?.() ?? [];
    for (const m of models) {
      const lang = m.getLanguageId();
      if (lang && lang !== "plaintext") return lang;
    }
    // 4. Fallback to first editor or first model:
    if (editors.length > 0) {
      return editors[0]?.getModel?.()?.getLanguageId() ?? null;
    }
    if (models.length > 0) return models[0]?.getLanguageId() ?? null;
  } catch {
    // Monaco versions differ; status is not worth throwing over.
  }
  return null;
}
