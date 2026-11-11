import Link from "next/link";
import { Search, ArrowLeft, ArrowRight, X } from "lucide-react";
import type { Metadata } from "next";
import { getI18n } from "@/lib/i18n";
import { serverApi } from "@/lib/server/api";
import type { PaginatedPosts, CategoryCount } from "@/lib/types";
import { PostCard } from "@/components/post-card";

// 静态页面标题同导航共享语言文案，避免切换后浏览器标签仍显示旧语言。
export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t("common.writing"), alternates: { canonical: "/blog" } };
}

// 筛选保留为 GET 参数，无 JavaScript 时依然可搜索和翻页。
export default async function BlogPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const q = typeof params.q === "string" ? params.q.slice(0, 100) : "";
  const category = typeof params.category === "string" ? params.category : "";
  const tag = typeof params.tag === "string" ? params.tag : "";
  const requestedPage = Number(params.page);
  const page =
    Number.isSafeInteger(requestedPage) && requestedPage > 0
      ? requestedPage
      : 1;
  const query = new URLSearchParams({
    query: q,
    category,
    tag,
    page: String(page),
    pageSize: "8",
  });
  const [{ t, locale }, posts, categories] = await Promise.all([
    getI18n(),
    serverApi<PaginatedPosts>(`/posts?${query}`),
    serverApi<CategoryCount[]>("/categories"),
  ]);
  // 显示接口提供的译名，URL 仍保留原始标签值，切换语言后筛选结果不变。
  const tagPost =
    posts.items.find((post) => post.tagValues?.includes(tag)) ??
    (tag && locale === "en"
      ? (
          await serverApi<PaginatedPosts>(
            `/posts?tag=${encodeURIComponent(tag)}&pageSize=1`,
          )
        ).items[0]
      : undefined);
  const tagLabel = tagPost
    ? tagPost.tags[tagPost.tagValues!.indexOf(tag)]
    : tag;
  // 只覆盖需要变化的筛选项，使分类切换与分页保持一致。
  function filterUrl(changes: Record<string, string>) {
    const next = new URLSearchParams({
      ...(q ? { q } : {}),
      ...(category ? { category } : {}),
      ...(tag ? { tag } : {}),
      ...changes,
    });
    for (const [key, value] of next) if (!value) next.delete(key);
    return `/blog?${next}`;
  }
  return (
    <main id="main" className="container journal-page blog-page">
      <header className="page-heading">
        <h1>{t("common.writing")}</h1>
        <p>{t("writing.description")}</p>
      </header>
      <form className="archive-search" action="/blog">
        <Search size={18} aria-hidden="true" />
        <input
          type="search"
          name="q"
          defaultValue={q}
          placeholder={t("common.searchPlaceholder")}
          aria-label={t("common.search")}
          maxLength={100}
        />
        {category && <input type="hidden" name="category" value={category} />}
        {tag && <input type="hidden" name="tag" value={tag} />}
        <button type="submit" className="button primary">
          {t("common.search")}
        </button>
      </form>
      <nav className="category-tabs" aria-label={t("writing.categoryFilter")}>
        <Link
          href={filterUrl({ category: "", page: "1" })}
          className={!category ? "selected" : ""}
          aria-current={!category ? "page" : undefined}
        >
          {t("common.all")}
        </Link>
        {categories.map((item) => (
          <Link
            key={item.value ?? item.name}
            href={filterUrl({ category: item.value ?? item.name, page: "1" })}
            className={category === (item.value ?? item.name) ? "selected" : ""}
            aria-current={
              category === (item.value ?? item.name) ? "page" : undefined
            }
          >
            {item.name}
          </Link>
        ))}
      </nav>
      <div className="archive-summary">
        <span className="archive-count">
          {posts.total} {t("common.articles")}
        </span>
        {(q || tag) && (
          <div
            className="active-filters"
            aria-label={t("writing.activeFilters")}
          >
            {q && (
              <Link
                href={filterUrl({ q: "", page: "1" })}
                className="filter-token"
                aria-label={`${t("writing.removeFilter")}：${q}`}
              >
                {t("common.search")}：{q}
                <X size={12} />
              </Link>
            )}
            {tag && (
              <Link
                href={filterUrl({ tag: "", page: "1" })}
                className="filter-token"
                aria-label={`${t("writing.removeFilter")}：${tagLabel}`}
              >
                {t("common.tags")}：{tagLabel}
                <X size={12} />
              </Link>
            )}
          </div>
        )}
        {(q || category || tag) && (
          <Link href="/blog" className="filter-reset">
            {t("common.clear")}
          </Link>
        )}
      </div>
      <div className="archive-posts">
        {posts.items.map((post) => (
          <PostCard post={post} key={post.id} headingLevel={2} />
        ))}
      </div>
      {!posts.items.length && (
        <div className="empty-state">
          <Search size={30} />
          <h2>{t("common.noResults")}</h2>
          <p>{t("common.noResultsHint")}</p>
          <Link className="button secondary" href="/blog">
            {t("writing.reset")}
          </Link>
        </div>
      )}
      {posts.totalPages > 1 && (
        <nav className="pagination" aria-label={t("common.page")}>
          {page > 1 ? (
            <Link href={filterUrl({ page: String(page - 1) })}>
              <ArrowLeft size={15} />
              {t("common.previous")}
            </Link>
          ) : (
            <span />
          )}
          <span>
            {page} / {posts.totalPages}
          </span>
          {page < posts.totalPages ? (
            <Link href={filterUrl({ page: String(page + 1) })}>
              {t("common.next")}
              <ArrowRight size={15} />
            </Link>
          ) : (
            <span />
          )}
        </nav>
      )}
    </main>
  );
}
