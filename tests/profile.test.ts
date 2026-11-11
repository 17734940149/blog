import test from "node:test";
import assert from "node:assert/strict";
import { parseCapabilities, serializeCapabilities } from "../src/lib/profile";

test("已有能力配置继续读取，原有标点与说明中的冒号不会丢失", () => {
  assert.deepEqual(parseCapabilities("前端：React、TypeScript, Next.js\n接口: REST: JSON，数据管理"), [
    { icon: "blocks", title: "前端", description: "React、TypeScript, Next.js" },
    { icon: "blocks", title: "接口", description: "REST: JSON，数据管理" },
  ]);
});

test("只识别白名单图标，旧标题里的方括号按原文保留", () => {
  assert.deepEqual(parseCapabilities("[lightbulb] AI 产品：需求分析\n[custom] 自定义：其他能力"), [
    { icon: "lightbulb", title: "AI 产品", description: "需求分析" },
    { icon: "blocks", title: "[custom] 自定义", description: "其他能力" },
  ]);
});

test("保存再读取保留图标、原始内容和后台配置的行序", () => {
  const groups = parseCapabilities("[rocket] 交付：测试、部署\n[figma] 设计：交互, 原型，验证");
  assert.deepEqual(parseCapabilities(serializeCapabilities(groups)), groups);
  assert.equal(serializeCapabilities([]), "");
});

test("清空配置或空标题不产生可见的占位能力", () => {
  assert.deepEqual(parseCapabilities("\n [code] ：未完成的输入\n ： \n"), []);
  assert.deepEqual(parseCapabilities("[brain] AI 探索"), [
    { icon: "brain", title: "AI 探索", description: "" },
  ]);
});
