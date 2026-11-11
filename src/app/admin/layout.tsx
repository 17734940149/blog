import type { Metadata } from "next";
import { AdminShell } from "@/components/admin/shell";
import { getI18n } from "@/lib/i18n";
import "@/components/admin/admin.css";

// 管理页面不参与搜索收录，标题仍随站点语言切换。
export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return {
    title: t("admin.metadataTitle"),
    robots: { index: false, follow: false },
  };
}

// 管理区域复用站点的语言与主题提供器，并隔离自己的布局样式。
export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AdminShell>{children}</AdminShell>;
}
