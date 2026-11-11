"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "./providers";

// 前后台共享语言切换，持久保存偏好并在页面更新期间阻止重复点击。
export function useLocaleSwitch() {
  const { locale } = useI18n();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  // 刷新服务端内容而不重载整个页面，保留当前地址、筛选与尚未保存的编辑内容。
  function switchLocale() {
    if (pending) return;
    const secure = location.protocol === "https:" ? ";Secure" : "";
    document.cookie = `locale=${locale === "zh" ? "en" : "zh"};path=/;max-age=31536000;SameSite=Lax${secure}`;
    startTransition(() => router.refresh());
  }
  return { switchLocale, pending };
}
