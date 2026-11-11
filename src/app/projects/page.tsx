import type { Metadata } from "next";
import { ArrowUpRight, Github, Blocks, Code2, Workflow } from "lucide-react";
import { getI18n } from "@/lib/i18n";
import { serverApi } from "@/lib/server/api";
import { projectSectionId } from "@/lib/profile";
import type { Project } from "@/lib/types";

// 项目页标题与内容采用同一语言偏好，原始资料留在后台维护。
export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return {
    title: t("common.projects"),
    alternates: { canonical: "/projects" },
  };
}

// 作品使用宽幅条目承载真实资料，缺少封面时保持紧凑，避免装饰图压过项目内容。
export default async function ProjectsPage() {
  const [{ t }, projects] = await Promise.all([
    getI18n(),
    serverApi<Project[]>("/projects"),
  ]);
  const icons = [Blocks, Code2, Workflow];
  return (
    <main id="main" className="container work-page">
      <header className="work-page-heading">
        <h1>{t("projects.title")}</h1>
        <p>{t("projects.description")}</p>
      </header>
      <div className="work-list">
        {projects.map((project, index) => {
          const Icon = icons[index % icons.length];
          return (
            <article
              className={`work-item${project.cover ? " work-item-with-cover" : ""}`}
              id={projectSectionId(project.id)}
              key={project.id}
            >
              {project.cover && (
                <div className="work-preview">
                  <img src={project.cover} alt={project.title} loading="lazy" />
                </div>
              )}
              <div className="work-body">
                <div className="work-heading">
                  <div className="work-name">
                    {!project.cover && (
                      <span className="work-mark" aria-hidden="true">
                        <Icon size={24} strokeWidth={1.6} />
                      </span>
                    )}
                    <h2>{project.title}</h2>
                  </div>
                  <span className={`work-status work-status-${project.status}`}>
                    {t(`common.${project.status}`)}
                  </span>
                </div>
                {project.description && (
                  <p className="work-description">{project.description}</p>
                )}
                {project.stack.length > 0 && (
                  <ul className="work-stack" aria-label={t("projects.stack")}>
                    {project.stack.map((tech) => (
                      <li key={tech}>{tech}</li>
                    ))}
                  </ul>
                )}
                {(project.url || project.githubUrl) && (
                  <div className="work-actions">
                    {project.url && (
                      <a
                        className="work-link work-link-primary"
                        href={project.url}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {t("common.visit")}
                        <ArrowUpRight size={15} aria-hidden="true" />
                      </a>
                    )}
                    {project.githubUrl && (
                      <a
                        className="work-link"
                        href={project.githubUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <Github size={15} aria-hidden="true" />
                        {t("common.source")}
                      </a>
                    )}
                  </div>
                )}
              </div>
            </article>
          );
        })}
      </div>
      {!projects.length && (
        <div className="work-empty">
          <Blocks size={30} aria-hidden="true" />
          <h2>{t("common.noProjects")}</h2>
        </div>
      )}
      <p className="work-note">{t("projects.note")}</p>
    </main>
  );
}
