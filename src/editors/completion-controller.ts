import type { CompletionItem, CompletionResult, Settings } from "../shared/types";
import { CompletionEngine } from "../completion/completion-engine";
import {
  isAcceptEnter,
  isAcceptTab,
  isExplicitTrigger,
  type EditorAdapter,
} from "./editor-adapter";
import { SuggestionPopup } from "../ui/suggestion-popup";

/**
 * Connects an editor adapter to the engine and the popup, and owns all keyboard
 * behaviour. Monaco does not use this class; it uses its native provider.
 */
export class CompletionController {
  private readonly popup = new SuggestionPopup();
  private readonly disposers: Array<() => void> = [];
  private timer: ReturnType<typeof setTimeout> | undefined;
  private suppressTextTimer: ReturnType<typeof setTimeout> | undefined;
  private suppressSelectionTimer: ReturnType<typeof setTimeout> | undefined;
  private suppressText = false;
  private suppressSelection = false;
  private lastResult: CompletionResult | null = null;
  /** Caret offset the last result was computed for. */
  private lastOffset = -1;
  private disposed = false;
  private lastSettings: Settings;

  constructor(
    private readonly adapter: EditorAdapter,
    private readonly engine: CompletionEngine,
    private readonly getSettings: () => Settings,
  ) {
    this.lastSettings = getSettings();
    this.popup.setTheme(this.lastSettings.theme);
  }

  start(): void {
    this.disposers.push(
      this.adapter.onDidChange((source) => {
        // Accepting a suggestion edits the document and moves the caret. Those
        // programmatic events must not immediately reopen the popup for the
        // word that was just inserted, while the next real keystroke must.
        if (source === "text" && this.suppressText) return;
        if (source === "selection" && this.suppressSelection) return;
        this.schedule(false);
      }),
    );
    this.disposers.push(this.adapter.onKeyDown((event) => this.handleKeyDown(event)));
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    if (this.timer !== undefined) clearTimeout(this.timer);
    if (this.suppressTextTimer !== undefined) clearTimeout(this.suppressTextTimer);
    if (this.suppressSelectionTimer !== undefined) clearTimeout(this.suppressSelectionTimer);
    for (const dispose of this.disposers) dispose();
    this.popup.destroy();
  }

  hide(): void {
    this.popup.hide();
  }

  /** Trigger a completion pass immediately, e.g. after a programmatic edit. */
  refresh(explicit = false): void {
    this.schedule(explicit, true);
  }

  private schedule(explicit: boolean, immediate = false): void {
    if (this.disposed) return;
    const settings = this.getSettings();
    this.lastSettings = settings;
    if (!settings.enabled) {
      this.popup.hide();
      return;
    }

    if (this.timer !== undefined) clearTimeout(this.timer);
    const delay = immediate ? 0 : explicit ? 0 : settings.debounceMs;
    this.timer = setTimeout(() => {
      this.timer = undefined;
      this.update(explicit);
    }, delay);
  }

  private update(explicit: boolean): void {
    if (this.disposed) return;
    const settings = this.getSettings();
    if (!settings.enabled) {
      this.popup.hide();
      return;
    }

    const text = this.adapter.getText();
    const offset = this.adapter.getOffset();
    const language = this.adapter.getLanguage();

    if (language !== "plaintext" && !settings.languages[language]) {
      this.popup.hide();
      return;
    }

    const result = this.engine.complete({
      text,
      offset,
      language,
      explicit,
      settings: {
        minPrefixLength: settings.minPrefixLength,
        maxSuggestions: settings.maxSuggestions,
        fuzzyMatching: settings.fuzzyMatching,
        showKeywords: settings.showKeywords,
        showBuiltins: settings.showBuiltins,
        showSnippets: settings.showSnippets,
        showMemberSuggestions: settings.showMemberSuggestions,
      },
      cacheKey: this.adapter.kind,
    });
    this.lastResult = result;
    this.lastOffset = offset;

    if (result.items.length === 0) {
      this.popup.hide();
      return;
    }

    this.popup.setTheme(settings.theme);
    this.popup.show(
      result.items,
      result.context.prefix,
      this.adapter.getAnchorRect(),
      {
        onAccept: (item) => this.accept(item),
        onDismiss: () => this.popup.hide(),
      },
    );
  }

  private accept(item: CompletionItem): void {
    const result = this.lastResult;
    if (!result) return;
    // The caret may have moved between showing the popup and accepting (for
    // example a click elsewhere during the debounce window). Applying the old
    // prefix range then would corrupt the document, so discard the result and
    // let the next change event recompute it.
    if (this.adapter.getOffset() !== this.lastOffset) {
      this.popup.hide();
      this.lastResult = null;
      this.lastOffset = -1;
      return;
    }
    this.popup.hide();
    this.lastResult = null;
    this.lastOffset = -1;

    // Adapters apply the edit synchronously and emit change/cursor events.
    // The text event arrives synchronously; the selection event is usually
    // queued for the next task. Suppress both, then let the next real keydown
    // or a short timeout re-enable selection-driven updates.
    this.suppressText = true;
    this.suppressSelection = true;
    if (this.suppressTextTimer !== undefined) clearTimeout(this.suppressTextTimer);
    if (this.suppressSelectionTimer !== undefined) clearTimeout(this.suppressSelectionTimer);
    this.suppressTextTimer = setTimeout(() => {
      this.suppressText = false;
      this.suppressTextTimer = undefined;
    }, 0);
    this.suppressSelectionTimer = setTimeout(() => {
      this.suppressSelection = false;
      this.suppressSelectionTimer = undefined;
    }, 100);

    this.adapter.applyCompletion(item, result.context);
  }

  private handleKeyDown(event: KeyboardEvent): void {
    // A real keydown means the user is interacting again; allow the next
    // selection change to drive completion even if it happens quickly.
    this.suppressSelection = false;
    const settings = this.getSettings();
    this.lastSettings = settings;
    if (!settings.enabled) return;

    if (this.popup.isVisible) {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        event.stopPropagation();
        this.popup.move(1);
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        event.stopPropagation();
        this.popup.move(-1);
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        this.popup.hide();
        return;
      }
      if (isAcceptTab(event, settings.acceptOnTab)) {
        if (this.popup.acceptSelected()) {
          event.preventDefault();
          event.stopPropagation();
        }
        return;
      }
      if (isAcceptEnter(event, settings.acceptOnEnter)) {
        if (this.popup.acceptSelected()) {
          event.preventDefault();
          event.stopPropagation();
        }
        return;
      }
    }

    if (isExplicitTrigger(event)) {
      event.preventDefault();
      event.stopPropagation();
      this.schedule(true, true);
    }
  }

  /** Exposed for diagnostics in the page bridge. */
  get diagnostics(): { visible: boolean; result: CompletionResult | null; settings: Settings } {
    return {
      visible: this.popup.isVisible,
      result: this.lastResult,
      settings: this.lastSettings,
    };
  }
}
