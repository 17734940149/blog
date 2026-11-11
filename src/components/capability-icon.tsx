import { Blocks, Brain, CodeXml, Database, Figma, Lightbulb, Rocket, Wrench } from "lucide-react";
import type { CapabilityIconName } from "@/lib/profile";

const icons = {
  lightbulb: Lightbulb,
  figma: Figma,
  code: CodeXml,
  rocket: Rocket,
  database: Database,
  wrench: Wrench,
  brain: Brain,
  blocks: Blocks,
};

// 前台与后台预览共用图标映射，确保选择结果与最终展示一致，并避免加载任意外部图标。
export function CapabilityIcon({ name, size = 18 }: { name: CapabilityIconName; size?: number }) {
  const Icon = icons[name];
  return <Icon size={size} strokeWidth={1.6} aria-hidden="true" />;
}
