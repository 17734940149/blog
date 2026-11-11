import type { MetadataRoute } from "next";

export const dynamic = "force-dynamic";

// 管理页面不进入搜索索引，公开文章由动态 sitemap 提供。
export default function robots(): MetadataRoute.Robots {
  const base = process.env.APP_URL || "http://localhost:3000";
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/admin", "/api/"] },
    sitemap: `${base}/sitemap.xml`,
  };
}
