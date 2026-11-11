import Link from "next/link";
import type { PostSummary } from "@/lib/types";
import { formatDate } from "@/lib/format";
import { getI18n } from "@/lib/i18n";

// 首页文章属于章节，归档文章直接属于页面，允许调用方保持连续的标题层级。
export async function PostCard({
  post,
  headingLevel = 3,
}: {
  post: PostSummary;
  headingLevel?: 2 | 3;
}) {
  const { t, locale } = await getI18n();
  const publishedAt = post.publishedAt || post.createdAt;
  const Heading = headingLevel === 2 ? "h2" : "h3";
  return (
    <article className="post-row">
      <div className="post-row-title">
        <Heading className="post-title">
          <Link href={"/blog/" + encodeURIComponent(post.slug)}>
            {post.title}
          </Link>
        </Heading>
        <time dateTime={publishedAt}>
          {formatDate(publishedAt, false, locale)}
        </time>
      </div>
      {post.excerpt && <p className="post-excerpt">{post.excerpt}</p>}
      <div className="post-row-meta">
        <Link
          href={
            "/blog?category=" +
            encodeURIComponent(post.categoryValue ?? post.category)
          }
        >
          {post.category}
        </Link>
        <span>
          {post.readingMinutes} {t("common.minute")}
        </span>
        {post.featured && (
          <span className="post-featured">{t("common.featured")}</span>
        )}
      </div>
    </article>
  );
}
