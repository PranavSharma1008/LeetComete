import type {
  CompletionContext,
  CompletionItem,
  EditorKind,
  LanguageId,
} from "../shared/types";

/**
 * The narrow surface the completion controller needs from an editor. Monaco is
 * handled through its native completion provider, while CodeMirror 5 and plain
 * textareas implement this interface.
 */
export type ChangeSource = "text" | "selection";

export interface EditorAdapter {
  readonly kind: EditorKind;
  getText(): string;
  getOffset(): number;
  getLanguage(): LanguageId;
  /** Viewport rectangle to anchor the popup, usually the caret. */
  getAnchorRect(): DOMRect | null;
  applyCompletion(item: CompletionItem, context: CompletionContext): boolean;
  onDidChange(listener: (source: ChangeSource) => void): () => void;
  onKeyDown(listener: (event: KeyboardEvent) => void): () => void;
  focus(): void;
}

export interface TextEdit {
  text: string;
  selectionStart: number;
  selectionEnd: number;
}

/**
 * Pure acceptance logic shared by the adapters and tests. Replacing exactly the
 * typed prefix is what guarantees that accepting a suggestion never duplicates
 * characters.
 */
export function applyCompletionEdit(
  text: string,
  selectionStart: number,
  selectionEnd: number,
  context: CompletionContext,
  item: CompletionItem,
): TextEdit {
  const start = Math.max(0, Math.min(context.prefixStart, text.length));
  const end = Math.max(start, Math.min(selectionEnd, text.length));
  const insertText = item.insertText;
  const nextText = text.slice(0, start) + insertText + text.slice(end);
  const cursor = start + (item.cursorOffset ?? insertText.length);
  return {
    text: nextText,
    selectionStart: cursor,
    selectionEnd: cursor,
  };
}

export function isAcceptTab(event: KeyboardEvent, acceptOnTab: boolean): boolean {
  return (
    acceptOnTab &&
    event.key === "Tab" &&
    !event.shiftKey &&
    !event.ctrlKey &&
    !event.metaKey &&
    !event.altKey
  );
}

export function isAcceptEnter(event: KeyboardEvent, acceptOnEnter: boolean): boolean {
  return (
    acceptOnEnter &&
    event.key === "Enter" &&
    !event.shiftKey &&
    !event.ctrlKey &&
    !event.metaKey &&
    !event.altKey
  );
}

export function isExplicitTrigger(event: KeyboardEvent): boolean {
  return (
    (event.key === " " && (event.ctrlKey || event.metaKey)) ||
    (event.key === "/" && event.altKey)
  );
}
