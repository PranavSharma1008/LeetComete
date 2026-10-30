import { describe, expect, it } from "vitest";
import {
  detectLanguage,
  detectLanguageFromCode,
  detectLanguageFromHint,
  detectLanguageFromMonacoId,
} from "../src/languages/language-detection";

describe("language detection from platform hints", () => {
  it("maps common LeetCode labels", () => {
    expect(detectLanguageFromHint("Java")).toBe("java");
    expect(detectLanguageFromHint("Python3")).toBe("python");
    expect(detectLanguageFromHint("C++")).toBe("cpp");
    expect(detectLanguageFromHint("C")).toBe("c");
    expect(detectLanguageFromHint("C#")).toBe("csharp");
    expect(detectLanguageFromHint("JavaScript")).toBe("javascript");
    expect(detectLanguageFromHint("TypeScript")).toBe("typescript");
    expect(detectLanguageFromHint("Golang")).toBe("go");
    expect(detectLanguageFromHint("Rust")).toBe("rust");
    expect(detectLanguageFromHint("Kotlin")).toBe("kotlin");
    expect(detectLanguageFromHint("Swift")).toBe("swift");
    expect(detectLanguageFromHint("Ruby")).toBe("ruby");
    expect(detectLanguageFromHint("PHP")).toBe("php");
    expect(detectLanguageFromHint("Scala")).toBe("scala");
    expect(detectLanguageFromHint("MySQL")).toBe("sql");
  });

  it("does not confuse JavaScript with Java", () => {
    expect(detectLanguageFromHint("JavaScript")).toBe("javascript");
    expect(detectLanguageFromHint("Java")).toBe("java");
  });

  it("ignores placeholders", () => {
    expect(detectLanguageFromHint("Select a language")).toBeNull();
    expect(detectLanguageFromHint("plain text")).toBeNull();
  });

  it("maps Monaco ids and aliases", () => {
    expect(detectLanguageFromMonacoId("python")).toBe("python");
    expect(detectLanguageFromMonacoId("csharp")).toBe("csharp");
    expect(detectLanguageFromMonacoId("pgsql")).toBe("sql");
    expect(detectLanguageFromMonacoId("unknown-mode")).toBeNull();
  });
});

describe("language detection from code", () => {
  it("detects Java from standard import code", () => {
    expect(
      detectLanguageFromCode(
        "import java.util.*;\nclass Main { public static void main(String[] args) { System.out.println(1); } }",
      ),
    ).toBe("java");
  });

  it("detects Java from LeetCode and GfG method template code without imports", () => {
    const gfgCode = `
      class Solution {
        public int lcs(String s1, String s2) {
          int n = s1.length();
          int m = s2.length();
          s
        }
      }
    `;
    expect(detectLanguageFromCode(gfgCode)).toBe("java");
  });

  it("detects C++", () => {
    expect(
      detectLanguageFromCode(
        "#include <bits/stdc++.h>\nusing namespace std;\nint main(){cout << 1;}",
      ),
    ).toBe("cpp");
  });

  it("detects Python", () => {
    expect(
      detectLanguageFromCode("def solve(nums):\n    return [x for x in nums]\n"),
    ).toBe("python");
  });

  it("detects Go", () => {
    expect(
      detectLanguageFromCode("package main\nfunc main() { fmt.Println(1) }"),
    ).toBe("go");
  });

  it("returns null for ambiguous snippets", () => {
    expect(detectLanguageFromCode("x = 1")).toBeNull();
    expect(detectLanguageFromCode("")).toBeNull();
  });
});

describe("detectLanguage priority", () => {
  it("prefers the editor hint, then the platform hint, then code", () => {
    expect(
      detectLanguage({ editorHint: "rust", hint: "Java", code: "class Main {}" }),
    ).toBe("rust");
    expect(detectLanguage({ hint: "Kotlin", code: "class Main {}" })).toBe("kotlin");
    expect(detectLanguage({ code: "package main\nfunc main(){}" })).toBe("go");
    expect(detectLanguage({})).toBe("plaintext");
  });
});
