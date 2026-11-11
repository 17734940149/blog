import { serverApi } from "@/lib/server/api";
import { getI18n } from "@/lib/i18n";
import type { PaginatedPosts, SiteSettings } from "@/lib/types";

export const dynamic = "force-dynamic";

// XML 转义独立处理，标题中的符号不能破坏订阅文件结构。
function xml(value: string) {
  return value.replace(
    /[<>&"']/g,
    (character) =>
      ({
        "<": "&lt;",
        ">": "&gt;",
        "&": "&amp;",
        '"': "&quot;",
        "'": "&apos;",
      })[character] || character,
  );
}

// 订阅只包含已发布文章，后台草稿不会进入公开 RSS。
export async function GET() {
  const [posts, settings, { locale }] = await Promise.all([
    serverApi<PaginatedPosts>("/posts?pageSize=30"),
    serverApi<SiteSettings>("/settings"),
    getI18n(),
  ]);
  const base = process.env.APP_URL || "http://localhost:3000";
  const items = posts.items
    .map(
      (post) =>
        `<item><title>${xml(post.title)}</title><link>${xml(`${base}/blog/${encodeURIComponent(post.slug)}`)}</link><guid isPermaLink="true">${xml(`${base}/blog/${encodeURIComponent(post.slug)}`)}</guid><description>${xml(post.excerpt)}</description><pubDate>${new Date(post.publishedAt || post.createdAt).toUTCString()}</pubDate><category>${xml(post.category)}</category></item>`,
    )
    .join("");
  return new Response(
    `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>${xml(settings.title)}</title><link>${xml(base)}</link><description>${xml(settings.description)}</description><language>${locale === "en" ? "en" : "zh-CN"}</language>${items}</channel></rss>`,
    {
      headers: {
        "Content-Type": "application/rss+xml; charset=utf-8",
        "Cache-Control": "public, max-age=300",
        Vary: "Cookie, Accept-Language",
      },
    },
  );
}
