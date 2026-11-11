import type { Locale } from "@/lang";

// 日期随界面语言变化，仍用上海时区，避免语言切换使文章跨日。
export function formatDate(value: string, full = false, locale: Locale = "zh") {
  return new Intl.DateTimeFormat(locale === "en" ? "en-US" : "zh-CN", {
    year: "numeric",
    month: full ? "long" : "2-digit",
    day: "2-digit",
    timeZone: "Asia/Shanghai",
  }).format(new Date(value));
}
