import type {
  CompletionContext,
  CompletionItem,
  LanguageId,
} from "../shared/types";
import { detectLanguage } from "../languages/language-detection";
import type { ChangeSource, EditorAdapter } from "./editor-adapter";

/** Minimal structural type for a CodeMirror 5 instance. */
export interface CodeMirror5Instance {
  getValue(): string;
  getCursor(): { line: number; ch: number };
  indexFromPos(position: { line: number; ch: number }): number;
  posFromIndex(offset: number): { line: number; ch: number };
  replaceRange(
    text: string,
    from: { line: number; ch: number },
    to?: { line: number; ch: number },
    origin?: string,
  ): void;
  setCursor(position: { line: number; ch: number }): void;
  getOption?(name: string): unknown;
  cursorCoords?(where: unknown, mode: string): { left: number; right: number; top: number; bottom: number };
  getWrapperElement(): HTMLElement;
  focus(): void;
  on(event: string, handler: () => void): void;
  off?(event: string, handler: () => void): void;
}

/**
 * Adapter for CodeMirror 5, which is still used by GeeksforGeeks, HackerRank,
 * Codeforces, CodeChef and AtCoder depending on the page.
 */
export class CodeMirror5Adapter implements EditorAdapter {
  readonly kind = "codemirror5" as const;

  constructor(
    private readonly cm: CodeMirror5Instance,
    private readonly getLanguageHint: () => string | null,
  ) {}

  getText(): string {
    return this.cm.getValue();
  }

  getOffset(): number {
    return this.cm.indexFromPos(this.cm.getCursor());
  }

  getLanguage(): LanguageId {
    const mode = this.cm.getOption?.("mode");
    const editorHint =
      typeof mode === "string" ? mode
        : mode && typeof mode === "object" && "name" in mode
          ? String((mode as { name?: unknown }).name ?? "")
          : null;
    return detectLanguage({
      editorHint,
      hint: this.getLanguageHint(),
      code: this.cm.getValue(),
    });
  }

  getAnchorRect(): DOMRect | null {
    if (!this.cm.cursorCoords) return null;
    const coords = this.cm.cursorCoords(null, "window");
    return new DOMRect(
      coords.left,
      coords.top,
      Math.max(1, coords.right - coords.left),
      Math.max(1, coords.bottom - coords.top),
    );
  }

  applyCompletion(item: CompletionItem, context: CompletionContext): boolean {
    const from = this.cm.posFromIndex(Math.max(0, context.prefixStart));
    const to = this.cm.getCursor();
    this.cm.replaceRange(item.insertText, from, to, "+leetcomete");
    const cursorOffset = Math.max(0, context.prefixStart + (item.cursorOffset ?? item.insertText.length));
    this.cm.setCursor(this.cm.posFromIndex(cursorOffset));
    this.cm.focus();
    return true;
  }

  onDidChange(listener: (source: ChangeSource) => void): () => void {
    const changeHandler = () => listener("text");
    const cursorHandler = () => listener("selection");
    this.cm.on("change", changeHandler);
    this.cm.on("cursorActivity", cursorHandler);
    return () => {
      this.cm.off?.("change", changeHandler);
      this.cm.off?.("cursorActivity", cursorHandler);
    };
  }

  onKeyDown(listener: (event: KeyboardEvent) => void): () => void {
    const wrapper = this.cm.getWrapperElement();
    wrapper.addEventListener("keydown", listener, true);
    return () => wrapper.removeEventListener("keydown", listener, true);
  }

  focus(): void {
    this.cm.focus();
  }
}

/** Locate a CodeMirror 5 instance from its wrapper element. */
export function findCodeMirror5(): { cm: CodeMirror5Instance; element: HTMLElement } | null {
  const wrappers = document.querySelectorAll<HTMLElement>(".CodeMirror");
  for (const wrapper of wrappers) {
    const candidate = (wrapper as unknown as { CodeMirror?: CodeMirror5Instance }).CodeMirror;
    if (candidate && typeof candidate.getValue === "function") {
      return { cm: candidate, element: wrapper };
    }
  }
  return null;
}
