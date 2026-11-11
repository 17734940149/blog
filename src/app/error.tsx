"use client";

import { useI18n } from "@/components/providers";

// 后端临时异常时提供恢复操作，不用静态示例掩盖真实连接失败。
export default function ErrorPage({ reset }: { reset: () => void }) {
  const { t } = useI18n();
  return (
    <main id="main" className="container empty-state error-page">
      <h1>{t("common.error")}</h1>
      <p>{t("common.errorHint")}</p>
      <button className="button primary" onClick={reset}>
        {t("common.retry")}
      </button>
    </main>
  );
}
