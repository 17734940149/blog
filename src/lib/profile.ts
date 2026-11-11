export interface CapabilityGroup {
  title: string;
  tools: string[];
}

// 后台用自然文本维护能力，统一解析中英文标点，避免让作者编辑结构化数据。
export function parseCapabilities(value: string): CapabilityGroup[] {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const separator = line.search(/[:：]/);
      if (separator < 0) return { title: line, tools: [] };
      return {
        title: line.slice(0, separator).trim(),
        tools: line
          .slice(separator + 1)
          .split(/[、,，]/)
          .map((tool) => tool.trim())
          .filter(Boolean),
      };
    })
    .filter((group) => Boolean(group.title));
}

// 总览与项目页使用相同锚点，让没有外链的探索项目也能继续查看完整资料。
export function projectSectionId(id: string): string {
  return `project-${id}`;
}

// 首页内部链接统一指向本站项目记录，外部访问由项目详情中的按钮承接。
export function projectDetailHref(id: string): string {
  return `/projects#${projectSectionId(id)}`;
}
