export const capabilityIconNames = [
  "lightbulb", "figma", "code", "rocket", "database", "wrench", "brain", "blocks",
] as const;

export type CapabilityIconName = (typeof capabilityIconNames)[number];

export interface CapabilityGroup {
  icon: CapabilityIconName;
  title: string;
  description: string;
}

// 在原有逐行配置上增加可选图标前缀；只识别白名单，避免把旧标题中的方括号误删。
export function parseCapabilities(value: string): CapabilityGroup[] {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const prefix = line.match(/^\[([a-z]+)\]\s*/);
      const icon = prefix && capabilityIconNames.includes(prefix[1] as CapabilityIconName)
        ? prefix[1] as CapabilityIconName
        : "blocks";
      const content = prefix && icon === prefix[1] ? line.slice(prefix[0].length) : line;
      const separator = content.search(/[:：]/);
      if (separator < 0) return { icon, title: content, description: "" };
      return {
        icon,
        title: content.slice(0, separator).trim(),
        description: content.slice(separator + 1).trim(),
      };
    })
    .filter((group) => Boolean(group.title));
}

// 继续写入既有 skills 字段，保留内容标点与行序，避免为了配置图标新增数据库结构。
export function serializeCapabilities(groups: CapabilityGroup[]): string {
  return groups
    .map((group) => `${group.icon === "blocks" ? "" : `[${group.icon}] `}${group.title.trim()}：${group.description.trim()}`)
    .join("\n");
}

// 总览与项目页使用相同锚点，让没有外链的探索项目也能继续查看完整资料。
export function projectSectionId(id: string): string {
  return `project-${id}`;
}

// 首页内部链接统一指向本站项目记录，外部访问由项目详情中的按钮承接。
export function projectDetailHref(id: string): string {
  return `/projects#${projectSectionId(id)}`;
}
