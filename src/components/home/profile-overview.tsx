import Link from "next/link";
import { ArrowUpRight, Sparkles } from "lucide-react";
import { getI18n } from "@/lib/i18n";
import { projectDetailHref, type CapabilityGroup } from "@/lib/profile";
import type { Project, SiteSettings } from "@/lib/types";
import { ProfileLinks } from "@/components/profile-links";
import { Markdown } from "@/components/markdown";
import { CapabilityOverview } from "@/components/home/capability-overview";

const defaultAboutNote =
  "> 这是一份可替换的示例介绍，文章与项目也包含原创演示内容。请登录管理后台，修改为自己的资料后再正式对外发布。";

// 复用后台的中英文简介，过滤旧模板提示和已取消展示的站点章节。
function getIntroduction(content: string) {
  const about = content.trimEnd().replace(/\r\n/g, "\n");
  const note = `\n\n${defaultAboutNote}`;
  const cleaned = about.endsWith(note) ? about.slice(0, -note.length).trimEnd() : about;
  // 围栏代码可包含同名标题，扫描时跳过这些代码，避免拆断自定义 Markdown。
  const lines = /^( {0,3})(`{3,}|~{3,})([^\n]*)$|^#{1,6}[ \t]+(?:关于这个站点|About this site)[ \t]*$/gim;
  let fence = "";
  for (const match of cleaned.matchAll(lines)) {
    const marker = match[2];
    if (marker) {
      if (!fence) fence = marker;
      else if (marker[0] === fence[0] && marker.length >= fence.length && !match[3].trim()) fence = "";
    } else if (!fence) {
      return cleaned.slice(0, match.index).trimEnd();
    }
  }
  return cleaned;
}

// 能力作为简介后的简短补充，近况和作品保留右栏，避免单独分区拉长首页。
export async function ProfileOverview({
  settings,
  projects,
  capabilities,
}: {
  settings: SiteSettings;
  projects: Project[];
  capabilities: CapabilityGroup[];
}) {
  const { t } = await getI18n();
  const intro = getIntroduction(settings.about);
  const released = projects.filter((project) => project.status === "online");
  const hasActivity = Boolean(settings.currently || released.length);
  return (
    <section className="profile-overview" aria-labelledby="profile-name">
      <div className="profile-lead">
        <div className="profile-identity">
          <div className="profile-portrait">
            {settings.avatar ? (
              <img
                src={settings.avatar}
                alt={settings.author}
                width={64}
                height={64}
              />
            ) : (
              <span aria-hidden="true">{Array.from(settings.author)[0]}</span>
            )}
          </div>
          <div>
            <h1 id="profile-name">{settings.author}</h1>
            {settings.role && <p className="profile-role">{settings.role}</p>}
          </div>
        </div>
        {settings.bio && <p className="profile-bio">{settings.bio}</p>}
      </div>
      <div
        className={`profile-story${hasActivity ? " has-activity" : ""}`}
        id="about-site"
      >
        <div className="profile-story-main">
          {intro ? (
            <Markdown content={intro} />
          ) : (
            <p>{settings.purpose || settings.description || t("overview.noPurpose")}</p>
          )}
          <CapabilityOverview groups={capabilities} />
          <section className="profile-contact" aria-labelledby="profile-contact-title">
            <h2 id="profile-contact-title">{t("overview.connect")}： </h2>
            <ProfileLinks settings={settings} />
          </section>
        </div>
        {hasActivity && (
          <aside className="profile-currently" aria-labelledby="profile-currently-title">
            <h2 id="profile-currently-title">
              <Sparkles size={16} aria-hidden="true" />
              {t("overview.now")}
            </h2>
            {settings.currently && <p>{settings.currently}</p>}
            <section className="profile-released" aria-labelledby="profile-released-title">
              <h3 id="profile-released-title">
                <span className="status-dot" aria-hidden="true" />
                {t("common.online")}
              </h3>
              {released.length ? (
                <ul>
                  {released.slice(0, 4).map((project) => (
                    <li key={project.id}>
                      <Link href={projectDetailHref(project.id)}>
                        <span>{project.title}</span>
                        <ArrowUpRight size={14} aria-hidden="true" />
                      </Link>
                    </li>
                  ))}
                  {released.length > 4 && (
                    <li><Link href="/projects">{t("home.allProjects")}<ArrowUpRight size={14} aria-hidden="true" /></Link></li>
                  )}
                </ul>
              ) : (
                <p>{t("overview.noReleased")}</p>
              )}
            </section>
            <div className="profile-currently-status">
              <span className="status-dot" aria-hidden="true" />
              {t("home.status")}
            </div>
          </aside>
        )}
      </div>
    </section>
  );
}
