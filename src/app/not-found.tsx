import Link from "next/link";
import { getI18n } from "@/lib/i18n";

// 未找到内容时保留公共导航入口，帮助读者回到可访问页面。
export default async function NotFound() {
  const { t } = await getI18n();
  return (
    <main id="main" className="container empty-state error-page">
      <span className="error-number">404</span>
      <h1>{t("common.notFound")}</h1>
      <p>{t("common.notFoundHint")}</p>
      <Link href="/" className="button primary">
        {t("common.goHome")}
      </Link>
    </main>
  );
}
