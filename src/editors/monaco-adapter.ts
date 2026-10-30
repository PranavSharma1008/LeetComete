import type {
  CompletionContext,
  CompletionItem,
  LanguageId,
} from "../shared/types";
import { detectLanguage } from "../languages/language-detection";
import type { ChangeSource, EditorAdapter } from "./editor-adapter";
import { getMonacoApi } from "./monaco-integration";

export interface MonacoPosition {
  lineNumber: number;
  column: number;
}

export interface MonacoModel {
  id?: string;
  getValue(): string;
  getOffsetAt(position: MonacoPosition): number;
  getPositionAt(offset: number): MonacoPosition;
  getLanguageId(): string;
  getVersionId?(): number;
  onDidChangeContent?(listener: (event: unknown) => void): { dispose(): void };
}

export interface MonacoEditorInstance {
  getModel(): MonacoModel | null;
  getPosition(): MonacoPosition | null;
  setPosition(position: MonacoPosition): void;
  revealPosition?(position: MonacoPosition): void;
  getDomNode(): HTMLElement | null;
  getScrolledVisiblePosition?(
    position: MonacoPosition,
  ): { top: number; left: number; height: number } | null;
  executeEdits(
    source: string,
    edits: Array<{
      range: {
        startLineNumber: number;
        startColumn: number;
        endLineNumber: number;
        endColumn: number;
      };
      text: string;
      forceMoveMarkers?: boolean;
    }>,
  ): void;
  focus(): void;
  onDidChangeModelContent?(listener: (event: unknown) => void): { dispose(): void };
  onDidChangeCursorPosition?(listener: (event: unknown) => void): { dispose(): void };
  hasTextFocus?(): boolean;
  hasWidgetFocus?(): boolean;
}

/**
 * Locate the active code editor on a Monaco-powered page such as LeetCode.
 * If multiple editors exist (e.g. code editor + testcase console), this prefers
 * the focused editor, or the one with a recognized non-plaintext programming language.
 */
export function findActiveMonacoEditor(): MonacoEditorInstance | null {
  const api = getMonacoApi();
  if (!api?.editor?.getEditors) return null;
  const editors = (api.editor.getEditors() ?? []) as MonacoEditorInstance[];
  if (editors.length === 0) return null;

  // 1. If an editor has focus and is not just a testcase box, prefer it
  for (const ed of editors) {
    if (
      (ed.hasTextFocus?.() || ed.hasWidgetFocus?.()) &&
      ed.getModel()?.getLanguageId() !== "plaintext"
    ) {
      return ed;
    }
  }

  // 2. Prefer the editor whose model has a programming language (not plaintext)
  for (const ed of editors) {
    const lang = ed.getModel()?.getLanguageId();
    if (lang && lang !== "plaintext") {
      return ed;
    }
  }

  // 3. If an editor has focus (even plaintext), use it
  for (const ed of editors) {
    if (ed.hasTextFocus?.() || ed.hasWidgetFocus?.()) {
      return ed;
    }
  }

  // 4. Fallback to the first editor with a valid model and DOM node
  for (const ed of editors) {
    if (ed.getModel() && ed.getDomNode()) return ed;
  }

  return editors[0] ?? null;
}

/**
 * Adapter for Monaco Editor. This connects Monaco directly to Leetcomete's
 * CompletionController and high-z-index SuggestionPopup, bypassing any site-level
 * restrictions (such as LeetCode locking Monaco's native autocomplete behind Premium).
 */
export class MonacoAdapter implements EditorAdapter {
  readonly kind = "monaco" as const;

  constructor(
    private readonly editor: MonacoEditorInstance,
    private readonly getLanguageHint: () => string | null,
  ) {}

  getText(): string {
    return this.editor.getModel()?.getValue() ?? "";
  }

  getOffset(): number {
    const model = this.editor.getModel();
    const position = this.editor.getPosition();
    if (!model || !position) return 0;
    return model.getOffsetAt(position);
  }

  getLanguage(): LanguageId {
    const model = this.editor.getModel();
    return detectLanguage({
      editorHint: model?.getLanguageId(),
      hint: this.getLanguageHint(),
      code: model?.getValue(),
    });
  }

  getAnchorRect(): DOMRect | null {
    const position = this.editor.getPosition();
    const domNode = this.editor.getDomNode();
    if (!position || !domNode) return null;

    if (typeof this.editor.getScrolledVisiblePosition === "function") {
      const scrolled = this.editor.getScrolledVisiblePosition(position);
      if (scrolled) {
        const editorRect = domNode.getBoundingClientRect();
        return new DOMRect(
          editorRect.left + scrolled.left,
          editorRect.top + scrolled.top,
          2,
          scrolled.height || 20,
        );
      }
    }

    // Fallback: search for cursor element inside Monaco's DOM
    const cursor = domNode.querySelector<HTMLElement>(".cursor");
    if (cursor) {
      return cursor.getBoundingClientRect();
    }

    return domNode.getBoundingClientRect();
  }

  applyCompletion(item: CompletionItem, context: CompletionContext): boolean {
    const model = this.editor.getModel();
    if (!model) return false;

    const startPos = model.getPositionAt(Math.max(0, context.prefixStart));
    const currentPos = this.editor.getPosition() ?? startPos;
    const range = {
      startLineNumber: startPos.lineNumber,
      startColumn: startPos.column,
      endLineNumber: currentPos.lineNumber,
      endColumn: currentPos.column,
    };

    const insertText = item.insertText;
    this.editor.executeEdits("leetcomete", [
      {
        range,
        text: insertText,
        forceMoveMarkers: true,
      },
    ]);

    const cursorOffset = Math.max(
      0,
      context.prefixStart + (item.cursorOffset ?? insertText.length),
    );
    const newPos = model.getPositionAt(cursorOffset);
    this.editor.setPosition(newPos);
    this.editor.revealPosition?.(newPos);
    this.editor.focus();
    return true;
  }

  onDidChange(listener: (source: ChangeSource) => void): () => void {
    const disposables: Array<{ dispose(): void }> = [];

    if (typeof this.editor.onDidChangeModelContent === "function") {
      disposables.push(this.editor.onDidChangeModelContent(() => listener("text")));
    } else {
      const model = this.editor.getModel();
      if (model && typeof model.onDidChangeContent === "function") {
        disposables.push(model.onDidChangeContent(() => listener("text")));
      }
    }

    if (typeof this.editor.onDidChangeCursorPosition === "function") {
      disposables.push(this.editor.onDidChangeCursorPosition(() => listener("selection")));
    }

    return () => {
      for (const d of disposables) {
        try {
          d.dispose();
        } catch {
          // ignore
        }
      }
    };
  }

  onKeyDown(listener: (event: KeyboardEvent) => void): () => void {
    const domNode = this.editor.getDomNode();
    if (!domNode) return () => undefined;
    domNode.addEventListener("keydown", listener, true);
    return () => domNode.removeEventListener("keydown", listener, true);
  }

  focus(): void {
    this.editor.focus();
  }
}
