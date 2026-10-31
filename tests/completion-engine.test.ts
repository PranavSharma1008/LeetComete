import { describe, expect, it } from "vitest";
import { CompletionEngine } from "../src/completion/completion-engine";
import { defaultSettings } from "../src/shared/settings";
import type { CompletionRequest, LanguageId } from "../src/shared/types";

function request(
  text: string,
  offset: number,
  language: LanguageId,
  overrides: Partial<CompletionRequest> = {},
): CompletionRequest {
  const settings = defaultSettings();
  return {
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
    ...overrides,
  };
}

describe("CompletionEngine", () => {
  it("suggests a previously declared variable", () => {
    const text = `class Solution {
  void solve() {
    int complement = 0;
    comp
  }
}`;
    const offset = text.indexOf("comp\n") + "comp".length;
    const engine = new CompletionEngine();
    const result = engine.complete(request(text, offset, "java"));
    expect(result.items.map((item) => item.label)).toContain("complement");
    expect(result.context.prefix).toBe("comp");
    expect(result.context.blocked).toBe(false);
  });

  it("ranks a local variable above keywords", () => {
    const text = `class Solution {
  void solve() {
    int result = 0;
    re
  }
}`;
    const offset = text.indexOf("re\n") + 2;
    const engine = new CompletionEngine();
    const result = engine.complete(request(text, offset, "java"));
    expect(result.items[0]?.label).toBe("result");
  });

  it("finds member methods from an inferred variable type", () => {
    const text = `class Solution {
  void solve() {
    String word = "hello";
    word.
  }
}`;
    const offset = text.indexOf("word.\n") + "word.".length;
    const engine = new CompletionEngine();
    const result = engine.complete(request(text, offset, "java"));
    const labels = result.items.map((item) => item.label);
    expect(result.context.memberAccess).toBe(true);
    expect(result.context.receiverName).toBe("word");
    expect(result.context.receiverType).toBe("String");
    expect(labels).toContain("substring");
    expect(labels).toContain("length");
  });

  it("finds members of the current class after this.", () => {
    const text = `class Solution {
  int count = 0;
  void solve() {
    this.
  }
}`;
    const offset = text.indexOf("this.\n") + "this.".length;
    const engine = new CompletionEngine();
    const result = engine.complete(request(text, offset, "java"));
    const labels = result.items.map((item) => item.label);
    expect(labels).toContain("count");
    expect(labels).toContain("solve");
  });

  it("keeps a Python function scope after a nested block dedents", () => {
    const text = `def solve(self):
    total = 0
    if total:
        inner = 1
    `;
    const offset = text.length;
    const engine = new CompletionEngine();
    const result = engine.complete(request(text, offset, "python", { explicit: true }));
    const labels = result.items.map((item) => item.label);
    expect(labels).toContain("total");
    // Python has no block scope: a name bound inside `if` is visible after it.
    expect(labels).toContain("inner");
  });

  it("tracks a Python function declared across multiple lines", () => {
    const text = `def solve(
    self,
    nums,
):
    total = 0
    tot`;
    const offset = text.length;
    const engine = new CompletionEngine();
    const result = engine.complete(request(text, offset, "python"));
    expect(result.items.map((item) => item.label)).toContain("total");
  });

  it("finds Python self attributes", () => {
    const text = `class Solution:
    def __init__(self):
        self.cache = {}
    def solve(self):
        self.
`;
    const offset = text.lastIndexOf("self.") + "self.".length;
    const engine = new CompletionEngine();
    const result = engine.complete(request(text, offset, "python"));
    expect(result.items.map((item) => item.label)).toContain("cache");
  });

  it("suppresses suggestions inside comments and strings", () => {
    const text = `const value = 1;
// val
const text = "val`;
    const engine = new CompletionEngine();
    const commentOffset = text.indexOf("// val") + "// val".length;
    const commentResult = engine.complete(request(text, commentOffset, "javascript"));
    expect(commentResult.context.blocked).toBe(true);
    expect(commentResult.items).toHaveLength(0);

    const stringOffset = text.length;
    const stringResult = engine.complete(request(text, stringOffset, "javascript"));
    expect(stringResult.context.blocked).toBe(true);
    expect(stringResult.items).toHaveLength(0);
  });

  it("respects minPrefixLength unless explicitly triggered", () => {
    const text = "const value = 1;\nconst v";
    const offset = text.length;
    const engine = new CompletionEngine();
    const short = engine.complete(
      request(text, offset, "javascript", {
        settings: {
          ...defaultSettings(),
          minPrefixLength: 3,
        },
      }),
    );
    expect(short.items).toHaveLength(0);

    const explicit = engine.complete(
      request(text, offset, "javascript", {
        explicit: true,
        settings: {
          ...defaultSettings(),
          minPrefixLength: 3,
        },
      }),
    );
    expect(explicit.items.map((item) => item.label)).toContain("value");
  });

  it("supports fuzzy matching", () => {
    const text = "const complement = 0;\ncmpl";
    const offset = text.length;
    const engine = new CompletionEngine();
    const fuzzy = engine.complete(
      request(text, offset, "javascript", {
        settings: { ...defaultSettings(), fuzzyMatching: true },
      }),
    );
    expect(fuzzy.items.map((item) => item.label)).toContain("complement");

    const strict = engine.complete(
      request(text, offset, "javascript", {
        settings: { ...defaultSettings(), fuzzyMatching: false },
      }),
    );
    expect(strict.items.map((item) => item.label)).not.toContain("complement");
  });

  it("never returns duplicate labels", () => {
    const text = `class Solution {
  void solve() {
    int value = 0;
    int value2 = value;
    val
  }
}`;
    const offset = text.indexOf("val\n") + 3;
    const engine = new CompletionEngine();
    const result = engine.complete(request(text, offset, "java"));
    const labels = result.items.map((item) => item.label);
    expect(new Set(labels).size).toBe(labels.length);
  });

  it("returns snippet metadata with the caret position", () => {
    const text = "for";
    const engine = new CompletionEngine();
    const result = engine.complete(
      request(text, text.length, "java", { explicit: true }),
    );
    const snippet = result.items.find((item) => item.label === "fori");
    expect(snippet).toBeDefined();
    expect(snippet!.snippet).toBe(true);
    expect(snippet!.insertText).not.toContain("$0");
    expect(snippet!.cursorOffset).toBeGreaterThan(0);
    expect(snippet!.insertText.slice(snippet!.cursorOffset!)).toBe("\n}");
  });

  it("caches indexes by cache key", () => {
    const text = "const value = 1;\nval";
    const engine = new CompletionEngine();
    const first = engine.complete(
      request(text, text.length, "javascript", { cacheKey: "v1" }),
    );
    const second = engine.complete(
      request(text, text.length, "javascript", { cacheKey: "v1" }),
    );
    expect(first.index.cached).toBe(false);
    expect(second.index.cached).toBe(true);
    expect(second.parseMs).toBe(0);
  });

  it("handles a large document without pathological slowdown", () => {
    const lines = ["class Big {", "  void solve() {"];
    for (let i = 0; i < 2000; i++) {
      lines.push(`    int value${i} = ${i};`);
    }
    lines.push("    val", "  }", "}");
    const text = lines.join("\n");
    const offset = text.lastIndexOf("val") + 3;
    const engine = new CompletionEngine();
    const started = performance.now();
    const result = engine.complete(request(text, offset, "java"));
    const elapsed = performance.now() - started;
    expect(result.index.declarationCount).toBeGreaterThan(2000);
    expect(result.items.length).toBeGreaterThan(0);
    expect(elapsed).toBeLessThan(3000);
  });

  it("suppresses automatic suggestions when the caret is inside an existing word", () => {
    const text = `class Solution {
  void solve() {
    return hs.contains(value);
  }
}`;
    const offset = text.indexOf("retu") + 4; // caret at "retu|rn"
    const engine = new CompletionEngine();
    const result = engine.complete(request(text, offset, "java"));
    expect(result.items).toHaveLength(0);
    expect(result.context.reason).toBe("Caret is inside an existing word.");

    // Explicit completion should still work if requested
    const explicit = engine.complete(request(text, offset, "java", { explicit: true }));
    expect(explicit.items.map((i) => i.label)).toContain("return");
  });

  it("suppresses automatic suggestions when the prefix already matches all candidates", () => {
    const text = `class Solution {
  void solve() {
    return hs.contains(value);
  }
}`;
    const offset = text.indexOf("return") + "return".length;
    const engine = new CompletionEngine();
    const result = engine.complete(request(text, offset, "java"));
    expect(result.items).toHaveLength(0);
    expect(result.context.reason).toBe("Prefix already matches all candidates.");
  });
});
