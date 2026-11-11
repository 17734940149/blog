import type { Metadata } from "next";
import { getI18n } from "@/lib/i18n";
import { Providers } from "@/components/providers";
import { SiteChrome } from "@/components/site-chrome";
import { serverApi } from "@/lib/server/api";
import type { SiteSettings } from "@/lib/types";
import "@fontsource-variable/noto-sans-sc";
import "./globals.css";

export const dynamic = "force-dynamic";
const defaultMetadata: Metadata = {
  metadataBase: new URL(process.env.APP_URL || "http://localhost:3000"),
  title: {
    default: "栈间 · 记录思考，持续构建",
    template: "%s · 栈间",
  },
  description:
    "一个关于技术、设计和独立开发的数字花园。记录构建的过程，分享沿途的发现。",
  alternates: { types: { "application/rss+xml": "/feed.xml" } },
  robots: { index: true, follow: true },
};

// 站点标题与介绍随后台设置更新；服务异常时仍保留基础页面元信息。
export async function generateMetadata(): Promise<Metadata> {
  const settings = await serverApi<SiteSettings>("/settings").catch(() => null);
  return settings
    ? {
        ...defaultMetadata,
        title: {
          default: `${settings.title} · ${settings.tagline}`,
          template: `%s · ${settings.title}`,
        },
        description: settings.description,
      }
    : defaultMetadata;
}

// 首次访问采用暗色，首屏绘制前恢复已有主题偏好，避免页面闪烁。
export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { locale } = await getI18n();
  const settings = await serverApi<SiteSettings>("/settings").catch(() => null);
  return (
    <html
      lang={locale === "zh" ? "zh-CN" : "en"}
      data-theme="dark"
      data-scroll-behavior="smooth"
      suppressHydrationWarning
    >
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html:
              "try{if(localStorage.getItem('theme')==='light')document.documentElement.dataset.theme='light'}catch{}",
          }}
        />
      </head>
      <body>
        <Providers locale={locale}>
          <SiteChrome
            title={settings?.title}
            icpFilingNumber={process.env.ICP_FILING_NUMBER?.trim()}
          >
            {children}
          </SiteChrome>
        </Providers>
      </body>
    </html>
  );
}
