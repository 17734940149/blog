import test from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import zh from "../src/lang/zh/index.js";
import en from "../src/lang/en/index.js";
import { Markdown, safeUrl } from "../src/components/markdown";

// 展平路径后核对语言包，防止新增页面在英文模式漏掉文案。
function flatten(value: object, prefix = ""): Record<string, string> {
  return Object.fromEntries(
    Object.entries(value).flatMap(([key, item]) =>
      typeof item === "string"
        ? [[`${prefix}${key}`, item]]
        : Object.entries(flatten(item, `${prefix}${key}.`)),
    ),
  );
}

test("双语 key 完全一致，新增文案遵循 EN 前缀约定并保留历史英文", () => {
  const chinese = flatten(zh),
    english = flatten(en);
  assert.deepEqual(Object.keys(english).sort(), Object.keys(chinese).sort());
  for (const key of Object.keys(chinese)) {
    assert.ok(english[key].trim().length > 0, key);
    // 兼容新增文案的 EN 前缀规则；历史真实英文继续保留，混入未标注中文仍会报错。
    if (/[\u3400-\u9fff]/u.test(english[key])) {
      assert.equal(english[key], `EN${chinese[key]}`, key);
    }
  }
});

test("Markdown 不执行原始 HTML 或危险链接", () => {
  const html = renderToStaticMarkup(
    createElement(Markdown, {
      content:
        "<script>alert(1)</script>\n\n[unsafe](javascript:alert(1))\n\n[safe](https://example.com)",
    }),
  );
  assert.ok(!html.includes("<script>"));
  assert.ok(!html.includes('href="javascript:'));
  assert.ok(html.includes('rel="noopener noreferrer"'));
  assert.equal(safeUrl("//example.com"), "");
  assert.equal(safeUrl("data:text/html,test"), "");
  assert.equal(safeUrl("/\\example.com"), "");
});
