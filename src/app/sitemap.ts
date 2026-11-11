import type { MetadataRoute } from "next";
import { serverApi } from "@/lib/server/api";
import type { PaginatedPosts } from "@/lib/types";

// 按页收集公开文章，避免只让第一页文章进入搜索引擎索引。
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = process.env.APP_URL || "http://localhost:3000";
  const pages: MetadataRoute.Sitemap = [
    "/",
    "/blog",
    "/projects",
  ].map((path) => ({ url: `${base}${path}`, changeFrequency: "weekly" }));
  let page = 1;
  let totalPages = 1;
  do {
    const posts = await serverApi<PaginatedPosts>(
      `/posts?page=${page}&pageSize=100`,
    );
    totalPages = posts.totalPages;
    pages.push(
      ...posts.items.map((post) => ({
        url: `${base}/blog/${encodeURIComponent(post.slug)}`,
        lastModified: post.updatedAt,
        changeFrequency: "monthly" as const,
      })),
    );
    page += 1;
  } while (page <= totalPages);
  return pages;
}
