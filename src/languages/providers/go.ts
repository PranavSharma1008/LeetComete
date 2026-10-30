import { defineLanguage, m } from "../language-config";

export const goLanguage = defineLanguage({
  id: "go",
  name: "Go",
  family: "go",
  keywords: [
    "break", "case", "chan", "const", "continue", "default", "defer", "else",
    "fallthrough", "for", "func", "go", "goto", "if", "import", "interface", "map",
    "package", "range", "return", "select", "struct", "switch", "type", "var",
    "true", "false", "nil", "iota",
  ],
  builtinTypes: [
    "bool", "byte", "complex64", "complex128", "error", "float32", "float64",
    "int", "int8", "int16", "int32", "int64", "rune", "string", "uint", "uint8",
    "uint16", "uint32", "uint64", "uintptr", "any",
  ],
  declarationKeywords: ["var", "const"],
  functionKeywords: ["func"],
  classKeywords: ["type", "struct", "interface"],
  modifiers: ["const", "var"],
  lineComments: ["//"],
  blockComments: [["/*", "*/"]],
  stringDelimiters: ['"', "'", "`"],
  caseSensitive: true,
  members: {
    // Go has no methods on built-in slices/maps/strings. Suggestions after a
    // dot are intentionally not invented; struct methods are resolved by the
    // editor or omitted rather than guessed.
    error: [m("Error", "Error(): string")],
  },
  globals: [
    { name: "fmt", detail: "fmt package" },
    { name: "strings", detail: "strings package" },
    { name: "strconv", detail: "strconv package" },
    { name: "sort", detail: "sort package" },
    { name: "math", detail: "math package" },
    { name: "os", detail: "os package" },
    { name: "bufio", detail: "bufio package" },
    { name: "make", kind: "function", detail: "make(type, length[, capacity])" },
    { name: "new", kind: "function", detail: "new(type): *T" },
    { name: "len", kind: "function", detail: "len(v): int" },
    { name: "cap", kind: "function", detail: "cap(v): int" },
    { name: "append", kind: "function", detail: "append(slice, items...): slice" },
    { name: "copy", kind: "function", detail: "copy(dst, src): int" },
    { name: "delete", kind: "function", detail: "delete(map, key)" },
    { name: "panic", kind: "function", detail: "panic(value)" },
    { name: "recover", kind: "function", detail: "recover(): any" },
    { name: "print", kind: "function", detail: "print(args...)" },
    { name: "println", kind: "function", detail: "println(args...)" },
    { name: "close", kind: "function", detail: "close(channel)" },
  ],
  snippets: [
    { prefix: "fori", body: "for i := 0; i < n; i++ {\n    $0\n}", detail: "Indexed for loop" },
    { prefix: "forr", body: "for _, value := range values {\n    $0\n}", detail: "Range loop" },
    { prefix: "func", body: "func solve($0) {\n    \n}", detail: "Function declaration" },
    { prefix: "main", body: "package main\n\nimport \"fmt\"\n\nfunc main() {\n    $0\n}", detail: "Main program" },
    { prefix: "iferr", body: "if err != nil {\n    $0\n}", detail: "Error check" },
  ],
});
