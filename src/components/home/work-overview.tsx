import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { getI18n } from "@/lib/i18n";
import { projectDetailHref } from "@/lib/profile";
import type { PostSummary, Project } from "@/lib/types";

// 两条深入阅读路径共享相同入口层级，标题和链接不会与内容争夺注意力。
function OverviewHeading({
  id,
  title,
  href,
  label,
}: {
  id: string;
  title: string;
  href: string;
  label: string;
}) {
  return (
    <div className="overview-heading">
      <h2 id={id}>{title}</h2>
      <Link href={href}>
        {label}
        <ArrowRight size={14} aria-hidden="true" />
      </Link>
    </div>
  );
}

// 近期作品按真实更新时间展示，状态独立标明，避免将探索中的项目说成已经发布。
export async function ProjectOverview({ projects }: { projects: Project[] }) {
  const { t } = await getI18n();
  const recent = [...projects]
    .filter((project) => project.status !== "archived")
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, 3);
  return (
    <section id="recent-work" aria-labelledby="recent-work-title">
      <OverviewHeading
        id="recent-work-title"
        title={t("overview.work")}
        href="/projects"
        label={t("home.allProjects")}
      />
      {recent.length ? (
        <div className="home-project-list">
          {recent.map((project) => (
            <article className="home-project" key={project.id}>
              <div className="home-project-heading">
                <h3>
                  <Link href={projectDetailHref(project.id)}>
                    {project.title}
                  </Link>
                </h3>
                <span className={`home-project-state state-${project.status}`}>
                  <span className="status-dot" />
                  {t(
                    project.status === "online"
                      ? "overview.released"
                      : "overview.exploring",
                  )}
                </span>
              </div>
              {project.description.trim() && <p>{project.description}</p>}
            </article>
          ))}
        </div>
      ) : (
        <p className="home-empty">{t("common.noProjects")}</p>
      )}
    </section>
  );
}

// 显示文字与语义时间共用上海时区的年月，避免 UTC 月末日期在两处出现偏差。
function writingMonth(value: string): { dateTime: string; label: string } {
  const parts = new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "2-digit",
    timeZone: "Asia/Shanghai",
  }).formatToParts(new Date(value));
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  return { dateTime: `${year}-${month}`, label: `${year}.${month}` };
}

// 最近四篇各自显示标题与年月，让读者逐条扫描，完整资料仍留给文章页。
export async function RecentWriting({ posts }: { posts: PostSummary[] }) {
  const { t } = await getI18n();
  return (
    <section aria-labelledby="recent-writing-title">
      <OverviewHeading
        id="recent-writing-title"
        title={t("overview.writing")}
        href="/blog"
        label={t("home.allWriting")}
      />
      {posts.length ? (
        <div className="home-writing-list">
          {posts.slice(0, 4).map((post) => {
            const month = writingMonth(post.publishedAt || post.createdAt);
            return (
              <article className="home-writing" key={post.id}>
                <div className="home-writing-heading">
                  <h3>
                    <Link href={`/blog/${encodeURIComponent(post.slug)}`}>
                      {post.title}
                    </Link>
                  </h3>
                  <time className="home-writing-date" dateTime={month.dateTime}>
                    {month.label}
                  </time>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <p className="home-empty">{t("common.noPosts")}</p>
      )}
    </section>
  );
}
