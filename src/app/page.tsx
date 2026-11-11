import { getI18n } from "@/lib/i18n";
import { serverApi } from "@/lib/server/api";
import { parseCapabilities } from "@/lib/profile";
import type { PaginatedPosts, Project, SiteSettings } from "@/lib/types";
import { ProfileOverview } from "@/components/home/profile-overview";
import {
  ProjectOverview,
  RecentWriting,
} from "@/components/home/work-overview";

// 首页先建立个人名片，再沿作品、文章和能力展开；全部内容继续来自可维护的后台资料。
export default async function HomePage() {
  const [{ t }, posts, projects, settings] = await Promise.all([
    getI18n(),
    serverApi<PaginatedPosts>("/posts?pageSize=4"),
    serverApi<Project[]>("/projects"),
    serverApi<SiteSettings>("/settings"),
  ]);
  const capabilities = parseCapabilities(settings.skills || "");
  return (
    <main
      id="main"
      className="container home-page"
      aria-label={t("overview.pageLabel")}
    >
      <ProfileOverview
        settings={settings}
        projects={projects}
        capabilities={capabilities}
      />
      <div className="home-work-grid">
        <ProjectOverview projects={projects} />
        <RecentWriting posts={posts.items} />
      </div>
    </main>
  );
}
