import { afterEach, describe, expect, it } from "vitest";
import { CompletionEngine } from "../src/completion/completion-engine";
import { CompletionController } from "../src/editors/completion-controller";
import {
  applyCompletionEdit,
  isAcceptEnter,
  isAcceptTab,
} from "../src/editors/editor-adapter";
import { TextareaAdapter } from "../src/editors/textarea-adapter";
import {
  MonacoAdapter,
  type MonacoEditorInstance,
  type MonacoModel,
} from "../src/editors/monaco-adapter";
import {
  AceAdapter,
  type AceEditorInstance,
} from "../src/editors/ace-adapter";
import { defaultSettings } from "../src/shared/settings";
import type { CompletionContext, CompletionItem } from "../src/shared/types";

function item(overrides: Partial<CompletionItem> = {}): CompletionItem {
  return {
    label: "result",
    insertText: "result",
    kind: "variable",
    source: "declaration",
    score: 100,
    ...overrides,
  };
}

function context(prefixStart: number, prefix = "re"): CompletionContext {
  return {
    prefix,
    prefixStart,
    memberAccess: false,
    blocked: false,
  };
}

function textarea(value: string): HTMLTextAreaElement {
  const element = document.createElement("textarea");
  element.value = value;
  element.setSelectionRange(value.length, value.length);
  document.body.appendChild(element);
  return element;
}

function keydown(target: HTMLElement, key: string): KeyboardEvent {
  const event = new KeyboardEvent("keydown", {
    key,
    bubbles: true,
    cancelable: true,
  });
  target.dispatchEvent(event);
  return event;
}

function keyup(target: HTMLElement, key: string): KeyboardEvent {
  const event = new KeyboardEvent("keyup", {
    key,
    bubbles: true,
    cancelable: true,
  });
  target.dispatchEvent(event);
  return event;
}

afterEach(() => {
  document.body.replaceChildren();
});

describe("completion text edits", () => {
  it("replaces exactly the typed prefix without duplicating characters", () => {
    const text = "int result = 0;\nre";
    const edit = applyCompletionEdit(text, text.length, text.length, context(16), item());
    expect(edit.text).toBe("int result = 0;\nresult");
    expect(edit.selectionStart).toBe(edit.text.length);
  });

  it("preserves text after the caret", () => {
    const text = "va + tail";
    const edit = applyCompletionEdit(text, 2, 2, context(0, "va"), item({ insertText: "value" }));
    expect(edit.text).toBe("value + tail");
    expect(edit.selectionStart).toBe(5);
  });

  it("honours a snippet cursor offset", () => {
    const text = "for";
    const snippet = item({
      label: "fori",
      insertText: "for (int i = 0; i < n; i++) {\n  \n}",
      cursorOffset: 29,
      snippet: true,
      kind: "snippet",
    });
    const edit = applyCompletionEdit(text, text.length, text.length, context(0, "for"), snippet);
    expect(edit.text).toBe("for (int i = 0; i < n; i++) {\n  \n}");
    expect(edit.selectionStart).toBe(29);
  });
});

describe("keyboard predicates", () => {
  it("accepts plain Tab and Enter only when enabled", () => {
    expect(isAcceptTab(new KeyboardEvent("keydown", { key: "Tab" }), true)).toBe(true);
    expect(isAcceptTab(new KeyboardEvent("keydown", { key: "Tab", shiftKey: true }), true)).toBe(false);
    expect(isAcceptTab(new KeyboardEvent("keydown", { key: "Tab" }), false)).toBe(false);

    expect(isAcceptEnter(new KeyboardEvent("keydown", { key: "Enter" }), true)).toBe(true);
    expect(isAcceptEnter(new KeyboardEvent("keydown", { key: "Enter", shiftKey: true }), true)).toBe(false);
    expect(isAcceptEnter(new KeyboardEvent("keydown", { key: "Enter" }), false)).toBe(false);
  });
});

describe("TextareaAdapter", () => {
  it("applies a completion through setRangeText and keeps native events", () => {
    const element = textarea("int result = 0;\nre");
    const adapter = new TextareaAdapter(element, () => "Java");
    let inputEvents = 0;
    element.addEventListener("input", () => inputEvents++);

    const ok = adapter.applyCompletion(item(), context(16));
    expect(ok).toBe(true);
    expect(element.value).toBe("int result = 0;\nresult");
    expect(element.selectionStart).toBe(element.value.length);
    expect(inputEvents).toBe(1);
  });

  it("reports the detected language from the platform hint", () => {
    const element = textarea("class Solution {}");
    const adapter = new TextareaAdapter(element, () => "C++ (GCC 12)");
    expect(adapter.getLanguage()).toBe("cpp");
  });
});

describe("MonacoAdapter", () => {
  it("applies completion through executeEdits and updates cursor position", () => {
    let text = "int result = 0;\nre";
    let pos = { lineNumber: 2, column: 3 }; // after "re"
    let editsApplied: Array<{ range: unknown; text: string }> = [];
    const domNode = document.createElement("div");
    document.body.appendChild(domNode);

    const mockModel: MonacoModel = {
      getValue: () => text,
      getOffsetAt: (p) => (p.lineNumber === 1 ? p.column - 1 : 16 + (p.column - 1)),
      getPositionAt: (offset) => {
        if (offset <= 16) return { lineNumber: 1, column: offset + 1 };
        return { lineNumber: 2, column: offset - 16 + 1 };
      },
      getLanguageId: () => "java",
    };

    const mockEditor: MonacoEditorInstance = {
      getModel: () => mockModel,
      getPosition: () => pos,
      setPosition: (newPos) => {
        pos = newPos;
      },
      getDomNode: () => domNode,
      executeEdits: (_source, edits) => {
        editsApplied = edits;
        text = "int result = 0;\nresult";
      },
      focus: () => undefined,
    };

    const adapter = new MonacoAdapter(mockEditor, () => "Java");
    expect(adapter.getLanguage()).toBe("java");
    expect(adapter.getText()).toBe("int result = 0;\nre");
    expect(adapter.getOffset()).toBe(18);

    const ok = adapter.applyCompletion(item(), context(16));
    expect(ok).toBe(true);
    expect(editsApplied.length).toBe(1);
    expect(editsApplied[0]?.text).toBe("result");
    expect(pos).toEqual({ lineNumber: 2, column: 7 });
  });
});

describe("AceAdapter", () => {
  it("applies completion through session.replace and moves cursor", () => {
    let text = "int result = 0;\nre";
    let curPos = { row: 1, column: 2 };
    let replacedText = "";
    const container = document.createElement("div");
    document.body.appendChild(container);

    const mockAce: AceEditorInstance = {
      container,
      renderer: {
        lineHeight: 18,
        textToScreenCoordinates: (row, column) => ({ pageX: column * 8, pageY: row * 18 }),
      },
      getCursorPosition: () => curPos,
      moveCursorToPosition: (p) => {
        curPos = p;
      },
      focus: () => undefined,
      getValue: () => text,
      selection: {
        on: () => undefined,
      },
      session: {
        getValue: () => text,
        getMode: () => ({ $id: "ace/mode/java" }),
        doc: {
          positionToIndex: (p) => (p.row === 0 ? p.column : 16 + p.column),
          indexToPosition: (idx) => (idx <= 16 ? { row: 0, column: idx } : { row: 1, column: idx - 16 }),
        },
        replace: (_range, newText) => {
          replacedText = newText;
          text = "int result = 0;\nresult";
        },
        on: () => undefined,
      },
    };

    const adapter = new AceAdapter(mockAce, () => "Java");
    expect(adapter.getLanguage()).toBe("java");
    expect(adapter.getText()).toBe("int result = 0;\nre");
    expect(adapter.getOffset()).toBe(18);

    const ok = adapter.applyCompletion(item(), context(16));
    expect(ok).toBe(true);
    expect(replacedText).toBe("result");
    expect(curPos).toEqual({ row: 1, column: 6 });
  });
});

describe("CompletionController", () => {
  it("accepts the selected suggestion with Tab and does not reopen immediately", async () => {
    const value = "int result = 0;\nre";
    const element = textarea(value);
    const adapter = new TextareaAdapter(element, () => "Java");
    const controller = new CompletionController(
      adapter,
      new CompletionEngine(),
      defaultSettings,
    );

    try {
      controller.start();
      controller.refresh(true);
      await new Promise((resolve) => setTimeout(resolve, 10));
      expect(controller.diagnostics.visible).toBe(true);
      expect(controller.diagnostics.result?.items[0]?.label).toBe("result");

      const event = keydown(element, "Tab");
      expect(event.defaultPrevented).toBe(true);
      expect(element.value).toBe("int result = 0;\nresult");

      await new Promise((resolve) => setTimeout(resolve, 20));
      expect(controller.diagnostics.visible).toBe(false);
    } finally {
      controller.dispose();
    }
  });

  it("does not reopen when the programmatic selectionchange arrives after Tab", async () => {
    const element = textarea("int result = 0;\nre");
    const adapter = new TextareaAdapter(element, () => "Java");
    const controller = new CompletionController(
      adapter,
      new CompletionEngine(),
      defaultSettings,
    );

    try {
      controller.start();
      controller.refresh(true);
      await new Promise((resolve) => setTimeout(resolve, 10));
      expect(controller.diagnostics.visible).toBe(true);

      keydown(element, "Tab");
      document.dispatchEvent(new Event("selectionchange"));
      await new Promise((resolve) => setTimeout(resolve, 130));
      expect(controller.diagnostics.visible).toBe(false);
      expect(element.value).toBe("int result = 0;\nresult");
    } finally {
      controller.dispose();
    }
  });

  it("stays dismissed after the Escape key is released", async () => {
    const element = textarea("int result = 0;\nre");
    const adapter = new TextareaAdapter(element, () => "Java");
    const controller = new CompletionController(
      adapter,
      new CompletionEngine(),
      defaultSettings,
    );

    try {
      controller.start();
      controller.refresh(true);
      await new Promise((resolve) => setTimeout(resolve, 10));
      expect(controller.diagnostics.visible).toBe(true);

      keydown(element, "Escape");
      keyup(element, "Escape");
      await new Promise((resolve) => setTimeout(resolve, 100));
      expect(controller.diagnostics.visible).toBe(false);
      expect(element.value).toBe("int result = 0;\nre");
    } finally {
      controller.dispose();
    }
  });

  it("navigates with arrows and dismisses with Escape", async () => {
    const element = textarea("int result = 0;\nint response = 0;\nre");
    const adapter = new TextareaAdapter(element, () => "Java");
    const controller = new CompletionController(
      adapter,
      new CompletionEngine(),
      defaultSettings,
    );

    try {
      controller.start();
      controller.refresh(true);
      await new Promise((resolve) => setTimeout(resolve, 10));
      expect(controller.diagnostics.visible).toBe(true);
      const first = controller.diagnostics.result?.items[0]?.label;
      keydown(element, "ArrowDown");
      keydown(element, "ArrowUp");
      expect(controller.diagnostics.result?.items[0]?.label).toBe(first);
      keydown(element, "Escape");
      expect(controller.diagnostics.visible).toBe(false);
    } finally {
      controller.dispose();
    }
  });
});
