import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ArrowLeft, Clock3, ArrowUpRight } from "lucide-react";
import { getI18n } from "@/lib/i18n";
import { serverApi } from "@/lib/server/api";
import { formatDate } from "@/lib/format";
import type { Post, PaginatedPosts, SiteSettings } from "@/lib/types";
import { Markdown, headingId } from "@/components/markdown";

// 将不存在和未发布文章统一转换为 404，避免泄露草稿状态。
async function getPost(slug: string) {
  try {
    return await serverApi<Post>(`/posts/${encodeURIComponent(slug)}`);
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("API 404:"))
      notFound();
    throw error;
  }
}

// 元信息读取当前文章，分享链接和搜索摘要不会全部使用首页标题。
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const post = await getPost((await params).slug);
  return {
    title: post.title,
    description: post.excerpt,
    alternates: { canonical: `/blog/${post.slug}` },
    openGraph: {
      type: "article",
      title: post.title,
      description: post.excerpt,
      publishedTime: post.publishedAt || undefined,
      modifiedTime: post.updatedAt,
      ...(post.cover ? { images: [post.cover] } : {}),
    },
  };
}

// 正文与目录使用同一锚点规则，目录忽略代码块中的 Markdown 标记。
export default async function ArticlePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const [{ t, locale }, post, recent, settings] = await Promise.all([
    getI18n(),
    getPost((await params).slug),
    serverApi<PaginatedPosts>("/posts?pageSize=5"),
    serverApi<SiteSettings>("/settings"),
  ]);
  const toc = post.content
    .replace(/```[\s\S]*?```/g, "")
    .split("\n")
    .filter((line) => /^#{2,3}\s/.test(line))
    .map((line) => ({
      text: line.replace(/^#+\s/, ""),
      nested: line.startsWith("###"),
    }));
  const related = recent.items
    .filter((item) => item.id !== post.id)
    .slice(0, 2);
  return (
    <main id="main" className="container article-page">
      <Link href="/blog" className="back-link">
        <ArrowLeft size={15} />
        {t("common.back")}
      </Link>
      <div className="article-layout">
        <article>
          <header className="article-heading">
            <div className="post-meta">
              <span className="category-text">{post.category}</span>
              <span>
                {formatDate(post.publishedAt || post.createdAt, true, locale)}
              </span>
              <span>
                <Clock3 size={13} />
                {post.readingMinutes} {t("common.minute")}
              </span>
            </div>
            <h1>{post.title}</h1>
            <p>{post.excerpt}</p>
            <div className="article-byline">
              <span className="tiny-avatar">{settings.author.slice(0, 1)}</span>
              <strong>{settings.author}</strong>
              <span>
                {t("common.updated")}{" "}
                {formatDate(post.updatedAt, false, locale)}
              </span>
            </div>
          </header>
          {post.cover && (
            <img className="article-cover" src={post.cover} alt={post.title} />
          )}
          <Markdown content={post.content} />
          <footer className="article-end">
            <div className="tag-list">
              {post.tags.map((tag, index) => (
                <Link
                  href={`/blog?tag=${encodeURIComponent(post.tagValues?.[index] ?? tag)}`}
                  key={post.tagValues?.[index] ?? tag}
                >
                  # {tag}
                </Link>
              ))}
            </div>
            <p>{settings.tagline}</p>
          </footer>
          {related.length > 0 && (
            <section className="related-posts">
              <h2>{t("home.recent")}</h2>
              {related.map((item) => (
                <Link href={`/blog/${item.slug}`} key={item.id}>
                  <span>{item.title}</span>
                  <ArrowUpRight size={18} />
                </Link>
              ))}
            </section>
          )}
        </article>
        <aside className="article-toc">
          <h2>{t("common.tableOfContents")}</h2>
          {toc.map((heading, index) => (
            <a
              href={`#${headingId(heading.text)}`}
              className={heading.nested ? "nested" : ""}
              key={index}
            >
              {heading.text}
            </a>
          ))}
          <Link href="/blog">
            <ArrowLeft size={14} />
            {t("common.writing")}
          </Link>
        </aside>
      </div>
    </main>
  );
}
