"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import { translator, type Locale } from "@/lang";

const I18nContext = createContext({
  locale: "zh" as Locale,
  t: translator("zh"),
});

// 注入首屏语言，后台和前台组件均通过同一个入口使用文案。
export function Providers({
  locale,
  children,
}: {
  locale: Locale;
  children: ReactNode;
}) {
  const value = useMemo(() => ({ locale, t: translator(locale) }), [locale]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

// 封装上下文入口，页面不直接依赖语言包结构。
export function useI18n() {
  return useContext(I18nContext);
}
