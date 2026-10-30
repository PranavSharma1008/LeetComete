import { describe, expect, it } from "vitest";
import { buildIdentifierIndex } from "../src/completion/identifier-index";
import type { LanguageId } from "../src/shared/types";

interface Case {
  language: LanguageId;
  name: string;
  code: string;
  expected: string[];
  /** Names that must not be extracted (e.g. string/comment contents). */
  absent?: string[];
}

const cases: Case[] = [
  {
    language: "java",
    name: "Java",
    code: `
class Solution {
  public int[] twoSum(int[] nums, int target) {
    Map<Integer, Integer> seen = new HashMap<>();
    int complement = target - nums[0];
    return new int[] { complement };
  }
}`,
    expected: ["Solution", "twoSum", "nums", "target", "seen", "complement"],
  },
  {
    language: "c",
    name: "C",
    code: `
#include <stdio.h>
int main(void) {
  int count = 0;
  for (int i = 0; i < 10; i++) { count += i; }
  return count;
}`,
    expected: ["main", "count", "i"],
  },
  {
    language: "cpp",
    name: "C++",
    code: `
#include <vector>
using namespace std;
class Solution {
public:
  vector<int> twoSum(vector<int>& nums, int target) {
    unordered_map<int, int> seen;
    int complement = target - nums[0];
    return { complement };
  }
};`,
    expected: ["Solution", "twoSum", "nums", "target", "seen", "complement"],
  },
  {
    language: "python",
    name: "Python",
    code: `
class Solution:
    def two_sum(self, nums: list[int], target: int) -> list[int]:
        seen = {}
        for i, value in enumerate(nums):
            complement = target - value
            if complement in seen:
                return [seen[complement], i]
            seen[value] = i
        return []`,
    expected: ["Solution", "two_sum", "self", "nums", "target", "seen", "i", "value", "complement"],
  },
  {
    language: "javascript",
    name: "JavaScript",
    code: `
function twoSum(nums, target) {
  const seen = new Map();
  for (let i = 0; i < nums.length; i++) {
    const complement = target - nums[i];
    if (seen.has(complement)) return [seen.get(complement), i];
    seen.set(nums[i], i);
  }
  return [];
}`,
    expected: ["twoSum", "nums", "target", "seen", "i", "complement"],
    absent: ["return"],
  },
  {
    language: "typescript",
    name: "TypeScript",
    code: `
interface Pair { left: number; right: number; }
function twoSum(nums: number[], target: number): number[] {
  const seen = new Map<number, number>();
  let complement: number = target - nums[0];
  return [seen.get(complement) ?? -1, complement];
}`,
    expected: ["Pair", "twoSum", "nums", "target", "seen", "complement"],
  },
  {
    language: "csharp",
    name: "C#",
    code: `
public class Solution {
  public int[] TwoSum(int[] nums, int target) {
    var seen = new Dictionary<int, int>();
    int complement = target - nums[0];
    return new int[] { complement };
  }
}`,
    expected: ["Solution", "TwoSum", "nums", "target", "seen", "complement"],
  },
  {
    language: "go",
    name: "Go",
    code: `
package main
func twoSum(nums []int, target int) []int {
    seen := make(map[int]int)
    for i, value := range nums {
        complement := target - value
        if _, ok := seen[complement]; ok {
            return []int{seen[complement], i}
        }
        seen[value] = i
    }
    return nil
}`,
    expected: ["twoSum", "nums", "target", "seen", "i", "value", "complement"],
  },
  {
    language: "rust",
    name: "Rust",
    code: `
use std::collections::HashMap;
fn two_sum(nums: Vec<i32>, target: i32) -> Vec<i32> {
    let mut seen: HashMap<i32, i32> = HashMap::new();
    for (i, value) in nums.iter().enumerate() {
        let complement = target - *value;
        if let Some(&index) = seen.get(&complement) {
            return vec![index, i];
        }
        seen.insert(*value, i);
    }
    vec![]
}`,
    expected: ["two_sum", "nums", "target", "seen", "i", "value", "complement"],
  },
  {
    language: "kotlin",
    name: "Kotlin",
    code: `
class Solution {
    fun twoSum(nums: IntArray, target: Int): IntArray {
        val seen = mutableMapOf<Int, Int>()
        for (i in nums.indices) {
            val complement = target - nums[i]
            if (seen.containsKey(complement)) return intArrayOf(seen[complement]!!, i)
            seen[nums[i]] = i
        }
        return intArrayOf()
    }
}`,
    expected: ["Solution", "twoSum", "nums", "target", "seen", "i", "complement"],
  },
  {
    language: "swift",
    name: "Swift",
    code: `
class Solution {
    func twoSum(_ nums: [Int], _ target: Int) -> [Int] {
        var seen = [Int: Int]()
        for (i, value) in nums.enumerated() {
            let complement = target - value
            if let index = seen[complement] { return [index, i] }
            seen[value] = i
        }
        return []
    }
}`,
    expected: ["Solution", "twoSum", "nums", "target", "seen", "i", "value", "complement"],
  },
  {
    language: "ruby",
    name: "Ruby",
    code: `
class Solution
  def two_sum(nums, target)
    seen = {}
    nums.each_with_index do |value, i|
      complement = target - value
      return [seen[complement], i] if seen.key?(complement)
      seen[value] = i
    end
    []
  end
end`,
    expected: ["Solution", "two_sum", "nums", "target", "seen", "value", "i", "complement"],
  },
  {
    language: "php",
    name: "PHP",
    code: `<?php
class Solution {
    function twoSum($nums, $target) {
        $seen = [];
        foreach ($nums as $i => $value) {
            $complement = $target - $value;
            if (isset($seen[$complement])) return [$seen[$complement], $i];
            $seen[$value] = $i;
        }
        return [];
    }
}`,
    expected: ["Solution", "twoSum", "$nums", "$target", "$seen", "$i", "$value", "$complement"],
  },
  {
    language: "scala",
    name: "Scala",
    code: `
object Solution {
  def twoSum(nums: Array[Int], target: Int): Array[Int] = {
    val seen = scala.collection.mutable.Map[Int, Int]()
    for (i <- nums.indices) {
      val complement = target - nums(i)
      if (seen.contains(complement)) return Array(seen(complement), i)
      seen(nums(i)) = i
    }
    Array()
  }
}`,
    expected: ["Solution", "twoSum", "nums", "target", "seen", "i", "complement"],
  },
  {
    language: "sql",
    name: "SQL",
    code: `
CREATE TABLE users (id INT, name TEXT);
WITH recent AS (SELECT id, name FROM users WHERE id > 10)
SELECT u.id, u.name FROM users u JOIN recent r ON u.id = r.id;`,
    expected: ["users", "recent"],
  },
];

describe("identifier extraction across all supported languages", () => {
  for (const testCase of cases) {
    it(`extracts declarations in ${testCase.name}`, () => {
      const index = buildIdentifierIndex(testCase.code, testCase.language);
      const names = new Set(index.declarations.map((declaration) => declaration.name));
      for (const expected of testCase.expected) {
        expect(names, `${testCase.name} should extract ${expected}`).toContain(expected);
      }
      for (const absent of testCase.absent ?? []) {
        expect(names).not.toContain(absent);
      }
    });
  }

  it("does not extract identifiers from comments or strings", () => {
    const index = buildIdentifierIndex(
      `// commentOnly = 1\nconst real = "stringOnly";\nconst other = real;`,
      "javascript",
    );
    const names = new Set(index.declarations.map((declaration) => declaration.name));
    expect(names).toContain("real");
    expect(names).not.toContain("commentOnly");
    expect(names).not.toContain("stringOnly");
  });

  it("extracts record components as fields", () => {
    const index = buildIdentifierIndex(
      "record Point(int x, int y) {}",
      "java",
    );
    const kinds = new Map(index.declarations.map((d) => [d.name, d.kind]));
    expect(kinds.get("Point")).toBe("class");
    expect(kinds.get("x")).toBe("field");
    expect(kinds.get("y")).toBe("field");
  });

  it("extracts this/self properties for member completion", () => {
    const index = buildIdentifierIndex(
      `class Solution:\n    def __init__(self):\n        self.cache = {}\n`,
      "python",
    );
    const property = index.declarations.find((d) => d.name === "cache");
    expect(property).toBeDefined();
    expect(property!.memberOf).toBe("self");
  });
});
