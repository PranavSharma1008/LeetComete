import { describe, expect, it } from "vitest";
import { CompletionEngine } from "../src/completion/completion-engine";
import { defaultSettings } from "../src/shared/settings";
import type { CompletionRequest, LanguageId } from "../src/shared/types";

function request(text: string, offset: number, language: LanguageId): CompletionRequest {
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
  };
}

function membersAfter(text: string, marker: string, language: LanguageId) {
  const offset = text.indexOf(marker) + marker.length;
  const result = new CompletionEngine().complete(request(text, offset, language));
  return {
    receiverType: result.context.receiverType,
    labels: result.items.map((item) => item.label),
  };
}

describe("receiver type inference", () => {
  it("infers Java constructor types without leaking the argument list", () => {
    const text = `class Solution {
  void solve() {
    Map<Integer, Integer> seen = new HashMap<>();
    seen.
  }
}`;
    const result = membersAfter(text, "seen.", "java");
    expect(result.receiverType).toBe("Map");
    expect(result.labels).toContain("put");
  });

  it("uses a Java declared type even without an initializer", () => {
    const text = `class Solution {
  void solve() {
    Map<Integer, Integer> seen;
    seen.
  }
}`;
    const result = membersAfter(text, "seen.", "java");
    expect(result.receiverType).toBe("Map");
    expect(result.labels).toContain("put");
  });

  it("uses a C++ declared container type", () => {
    const text = `void solve() {
  vector<int> nums;
  nums.
}`;
    const result = membersAfter(text, "nums.", "cpp");
    expect(result.receiverType).toBe("vector");
    expect(result.labels).toContain("push_back");
  });

  it("infers JavaScript and TypeScript constructor types", () => {
    const js = membersAfter(
      `function f() {\n  const seen = new Map();\n  seen.\n}`,
      "seen.",
      "javascript",
    );
    expect(js.receiverType).toBe("Map");
    expect(js.labels).toContain("has");

    const ts = membersAfter(
      `function f() {\n  const seen: Map<string, number> = new Map();\n  seen.\n}`,
      "seen.",
      "typescript",
    );
    expect(ts.receiverType).toBe("Map");
    expect(ts.labels).toContain("has");
  });

  it("uses Rust type annotations", () => {
    const text = `fn solve() {
    let mut seen: HashMap<i32, i32> = HashMap::new();
    seen.
}`;
    const result = membersAfter(text, "seen.", "rust");
    expect(result.receiverType).toBe("HashMap");
    expect(result.labels).toContain("insert");
  });

  it("uses Kotlin and Scala type annotations", () => {
    const kotlin = membersAfter(
      `fun solve() {\n    val seen: MutableMap<Int, Int> = mutableMapOf()\n    seen.\n}`,
      "seen.",
      "kotlin",
    );
    expect(kotlin.receiverType).toBe("MutableMap");
    expect(kotlin.labels).toContain("put");

    const scala = membersAfter(
      `object Solution {\n  def solve(): Unit = {\n    val seen: mutable.Map[Int, Int] = mutable.Map()\n    seen.\n  }\n}`,
      "seen.",
      "scala",
    );
    expect(scala.receiverType).toBe("Map");
    expect(scala.labels).toContain("get");
  });

  it("maps Swift dictionary annotations to Dictionary members", () => {
    const text = `func solve() {
    var seen: [Int: Int]()
    seen.
}`;
    const result = membersAfter(text, "seen.", "swift");
    expect(result.receiverType).toBe("Dictionary");
    expect(result.labels).toContain("keys");
  });
});
