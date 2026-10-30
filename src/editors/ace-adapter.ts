import type {
  CompletionContext,
  CompletionItem,
  LanguageId,
} from "../shared/types";
import { detectLanguage } from "../languages/language-detection";
import type { ChangeSource, EditorAdapter } from "./editor-adapter";

export interface AcePosition {
  row: number;
  column: number;
}

export interface AceRange {
  start: AcePosition;
  end: AcePosition;
}

export interface AceSession {
  getValue(): string;
  getMode?(): { $id?: string };
  doc: {
    positionToIndex(position: AcePosition): number;
    indexToPosition(index: number): AcePosition;
  };
  replace(range: AceRange, text: string): void;
  on(event: string, handler: (e?: unknown) => void): void;
  off?(event: string, handler: (e?: unknown) => void): void;
}

export interface AceEditorInstance {
  session: AceSession;
  container: HTMLElement;
  renderer: {
    lineHeight?: number;
    textToScreenCoordinates(row: number, column: number): { pageX: number; pageY: number };
  };
  getCursorPosition(): AcePosition;
  moveCursorToPosition(position: AcePosition): void;
  focus(): void;
  getValue(): string;
  selection: {
    on(event: string, handler: () => void): void;
    off?(event: string, handler: () => void): void;
  };
}

export interface AceElement extends HTMLElement {
  env?: {
    editor?: AceEditorInstance;
  };
}

/**
 * Locate the active Ace Editor instance on sites like GeeksforGeeks and CodeChef.
 */
export function findAceEditor(): AceEditorInstance | null {
  const elements = document.querySelectorAll<AceElement>(".ace_editor");
  for (const el of elements) {
    if (el.env?.editor) {
      return el.env.editor;
    }
  }

  const candidate = (
    window as unknown as { ace?: { edit?: (el: Element) => AceEditorInstance } }
  ).ace;
  if (candidate && typeof candidate.edit === "function") {
    const el = document.querySelector(".ace_editor");
    if (el) {
      try {
        const ed = candidate.edit(el);
        if (typeof ed?.session?.doc?.positionToIndex === "function") return ed;
      } catch {
        // ignore
      }
    }
  }

  return null;
}

/**
 * Adapter for Ace Editor. Powers autocomplete on GeeksforGeeks and other platforms.
 */
export class AceAdapter implements EditorAdapter {
  readonly kind = "ace" as const;

  constructor(
    private readonly editor: AceEditorInstance,
    private readonly getLanguageHint: () => string | null,
  ) {}

  getText(): string {
    return this.editor.session.getValue();
  }

  getOffset(): number {
    const pos = this.editor.getCursorPosition();
    return this.editor.session.doc.positionToIndex(pos);
  }

  getLanguage(): LanguageId {
    const mode = this.editor.session.getMode?.()?.$id ?? "";
    const modeName = mode.replace(/^ace\/mode\//, "");
    return detectLanguage({
      editorHint: modeName || null,
      hint: this.getLanguageHint(),
      code: this.getText(),
    });
  }

  getAnchorRect(): DOMRect | null {
    const pos = this.editor.getCursorPosition();
    try {
      const screenCoords = this.editor.renderer.textToScreenCoordinates(pos.row, pos.column);
      const lineHeight = this.editor.renderer.lineHeight || 19;
      const left = screenCoords.pageX - window.scrollX;
      const top = screenCoords.pageY - window.scrollY;
      return new DOMRect(left, top, 2, lineHeight);
    } catch {
      const cursor = this.editor.container.querySelector<HTMLElement>(".ace_cursor");
      if (cursor) return cursor.getBoundingClientRect();
      return this.editor.container.getBoundingClientRect();
    }
  }

  applyCompletion(item: CompletionItem, context: CompletionContext): boolean {
    const doc = this.editor.session.doc;
    const startPos = doc.indexToPosition(Math.max(0, context.prefixStart));
    const currentPos = this.editor.getCursorPosition();

    const range: AceRange = {
      start: startPos,
      end: currentPos,
    };

    const insertText = item.insertText;
    this.editor.session.replace(range, insertText);

    const cursorOffset = Math.max(
      0,
      context.prefixStart + (item.cursorOffset ?? insertText.length),
    );
    const newPos = doc.indexToPosition(cursorOffset);
    this.editor.moveCursorToPosition(newPos);
    this.editor.focus();
    return true;
  }

  onDidChange(listener: (source: ChangeSource) => void): () => void {
    const changeHandler = () => listener("text");
    const cursorHandler = () => listener("selection");

    this.editor.session.on("change", changeHandler);
    this.editor.selection.on("changeCursor", cursorHandler);

    return () => {
      this.editor.session.off?.("change", changeHandler);
      this.editor.selection.off?.("changeCursor", cursorHandler);
    };
  }

  onKeyDown(listener: (event: KeyboardEvent) => void): () => void {
    const container = this.editor.container;
    container.addEventListener("keydown", listener, true);
    return () => container.removeEventListener("keydown", listener, true);
  }

  focus(): void {
    this.editor.focus();
  }
}
