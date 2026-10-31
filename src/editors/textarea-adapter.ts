import type {
  CompletionContext,
  CompletionItem,
  LanguageId,
} from "../shared/types";
import { detectLanguage } from "../languages/language-detection";
import {
  applyCompletionEdit,
  type ChangeSource,
  type EditorAdapter,
} from "./editor-adapter";

/**
 * Adapter for the plain `<textarea>` editors used by several practice sites
 * (and by HackerRank's older editor). Acceptance uses `setRangeText` so the
 * browser's native undo stack is preserved.
 */
export class TextareaAdapter implements EditorAdapter {
  readonly kind = "textarea" as const;

  constructor(
    private readonly textarea: HTMLTextAreaElement,
    private readonly getLanguageHint: () => string | null,
  ) {}

  getText(): string {
    return this.textarea.value;
  }

  getOffset(): number {
    return this.textarea.selectionStart;
  }

  getLanguage(): LanguageId {
    return detectLanguage({
      hint: this.getLanguageHint(),
      code: this.textarea.value,
    });
  }

  getAnchorRect(): DOMRect | null {
    return caretRect(this.textarea, this.textarea.selectionStart);
  }

  applyCompletion(item: CompletionItem, context: CompletionContext): boolean {
    const value = this.textarea.value;
    const start = Math.max(0, Math.min(context.prefixStart, value.length));
    const end = Math.max(start, Math.min(this.textarea.selectionEnd, value.length));
    const edit = applyCompletionEdit(value, this.textarea.selectionStart, end, context, item);

    this.textarea.focus();
    this.textarea.setRangeText(item.insertText, start, end, "end");
    const cursor = start + (item.cursorOffset ?? item.insertText.length);
    this.textarea.setSelectionRange(cursor, cursor);

    // Keep framework-controlled editors (React et al.) in sync with the DOM.
    this.textarea.dispatchEvent(
      new InputEvent("input", {
        bubbles: true,
        inputType: "insertText",
        data: item.insertText,
      }),
    );
    if (this.textarea.value !== edit.text) {
      // A controlled component may have rewritten the value; nothing else to do.
      return false;
    }
    return true;
  }

  onDidChange(listener: (source: ChangeSource) => void): () => void {
    const textHandler = () => listener("text");
    const selectionHandler = () => {
      if (document.activeElement === this.textarea) listener("selection");
    };
    // No keyup listener: the keyup that follows Escape or an arrow key would
    // reschedule completion and immediately reopen the popup. Text edits fire
    // `input`; caret movement fires `selectionchange`.
    this.textarea.addEventListener("input", textHandler);
    this.textarea.addEventListener("click", selectionHandler);
    document.addEventListener("selectionchange", selectionHandler);
    return () => {
      this.textarea.removeEventListener("input", textHandler);
      this.textarea.removeEventListener("click", selectionHandler);
      document.removeEventListener("selectionchange", selectionHandler);
    };
  }

  onKeyDown(listener: (event: KeyboardEvent) => void): () => void {
    this.textarea.addEventListener("keydown", listener, true);
    return () => this.textarea.removeEventListener("keydown", listener, true);
  }

  focus(): void {
    this.textarea.focus();
  }

  getDomNode(): HTMLElement | null {
    return this.textarea;
  }
}

const MIRROR_PROPERTIES = [
  "boxSizing",
  "width",
  "height",
  "overflowX",
  "overflowY",
  "borderTopWidth",
  "borderRightWidth",
  "borderBottomWidth",
  "borderLeftWidth",
  "paddingTop",
  "paddingRight",
  "paddingBottom",
  "paddingLeft",
  "fontStyle",
  "fontVariant",
  "fontWeight",
  "fontStretch",
  "fontSize",
  "lineHeight",
  "fontFamily",
  "textAlign",
  "textTransform",
  "textIndent",
  "letterSpacing",
  "wordSpacing",
  "tabSize",
  "whiteSpace",
  "wordWrap",
  "overflowWrap",
] as const;

/**
 * Compute the caret's viewport rectangle using the standard hidden-mirror
 * technique. `textarea` exposes no caret geometry API, so this is the only
 * reliable way to anchor a popup at the caret.
 */
export function caretRect(textarea: HTMLTextAreaElement, offset: number): DOMRect | null {
  const rect = textarea.getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) return null;

  const style = window.getComputedStyle(textarea);
  const mirror = document.createElement("div");
  mirror.setAttribute("aria-hidden", "true");
  mirror.style.position = "fixed";
  mirror.style.top = `${rect.top}px`;
  mirror.style.left = `${rect.left}px`;
  mirror.style.visibility = "hidden";
  mirror.style.pointerEvents = "none";
  mirror.style.zIndex = "-1";
  mirror.style.overflow = "hidden";
  mirror.style.whiteSpace = "pre-wrap";
  mirror.style.wordWrap = "break-word";

  for (const property of MIRROR_PROPERTIES) {
    mirror.style[property] = style[property];
  }
  mirror.style.width = `${textarea.clientWidth}px`;
  mirror.style.height = `${textarea.clientHeight}px`;

  const before = document.createTextNode(textarea.value.slice(0, offset));
  const marker = document.createElement("span");
  marker.textContent = "\u200b";
  mirror.append(before, marker);
  document.body.appendChild(mirror);

  try {
    const markerRect = marker.getBoundingClientRect();
    const lineHeight = Number.parseFloat(style.lineHeight) || Number.parseFloat(style.fontSize) * 1.4 || 18;
    const left = markerRect.left - textarea.scrollLeft;
    const top = markerRect.top - textarea.scrollTop;
    return new DOMRect(left, top, 1, lineHeight);
  } finally {
    mirror.remove();
  }
}
