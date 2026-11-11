import { cookies } from "next/headers";
import { translator, type Locale } from "@/lang";

// 从同一站点 cookie 读取语言，避免首屏与水合后的文字不一致。
export async function getI18n() {
  const locale: Locale =
    (await cookies()).get("locale")?.value === "en" ? "en" : "zh";
  return { locale, t: translator(locale) };
}
