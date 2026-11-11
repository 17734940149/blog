import zh from "./zh";
import en from "./en";

export type Locale = "zh" | "en";
const dictionaries = { zh, en };

// 统一按命名空间取文案，让服务端和浏览器共享相同语言规则。
export function translator(locale: Locale) {
  return (key: string): string => {
    const value = key
      .split(".")
      .reduce<unknown>(
        (node, part) =>
          node && typeof node === "object"
            ? (node as Record<string, unknown>)[part]
            : undefined,
        dictionaries[locale],
      );
    return typeof value === "string" ? value : key;
  };
}
