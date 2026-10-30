import { describe, expect, it } from "vitest";
import { getLanguageDefinition } from "../src/languages/language-registry";
import { lex } from "../src/completion/lexer";

describe("lexer", () => {
  it("separates identifiers, keywords, strings and comments", () => {
    const result = lex(
      'const value = "notAnIdentifier"; // commentWord\nlet other = 1;',
      getLanguageDefinition("javascript"),
    );
    const values = result.tokens.map((token) => token.value);
    expect(values).toContain("value");
    expect(values).toContain("other");
    expect(values).not.toContain("notAnIdentifier");
    expect(values).not.toContain("commentWord");
    expect(result.blockedRanges).toHaveLength(2);
  });

  it("does not treat Python triple-quoted strings as code", () => {
    const result = lex(
      '"""module doc\nwith fake_var = 1\n"""\nreal_var = 2',
      getLanguageDefinition("python"),
    );
    expect(result.tokens.some((token) => token.value === "fake_var")).toBe(false);
    expect(result.tokens.some((token) => token.value === "real_var")).toBe(true);
  });

  it("handles C preprocessor lines without swallowing code", () => {
    const result = lex(
      "#include <stdio.h>\n#define MAX 10\nint main(void) { return MAX; }",
      getLanguageDefinition("c"),
    );
    expect(result.tokens.some((token) => token.value === "stdio")).toBe(false);
    expect(result.tokens.some((token) => token.value === "main")).toBe(true);
  });

  it("handles Rust lifetimes and raw strings", () => {
    const result = lex(
      "fn borrow<'a>(x: &'a str) -> &'a str { x }",
      getLanguageDefinition("rust"),
    );
    expect(result.tokens.some((token) => token.value === "borrow")).toBe(true);
    expect(result.tokens.some((token) => token.value === "a")).toBe(false);
  });

  it("tracks offsets and line numbers", () => {
    const text = "int a = 1;\nint b = 2;";
    const result = lex(text, getLanguageDefinition("c"));
    const b = result.tokens.find((token) => token.value === "b");
    expect(b).toBeDefined();
    expect(text.slice(b!.start, b!.end)).toBe("b");
    expect(b!.line).toBe(1);
  });
});
