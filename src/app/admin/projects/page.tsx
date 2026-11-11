"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowUpRight, FolderKanban, Pencil, Plus, Trash2 } from "lucide-react";
import { useI18n } from "@/components/providers";
import { formatDate } from "@/lib/format";
import type { Project } from "@/lib/types";
import { adminRequest, useAdminResource } from "@/components/admin/api";
import {
  AdminEmpty,
  AdminError,
  AdminHeading,
  AdminLoading,
  ConfirmDialog,
} from "@/components/admin/ui";

// 项目以作品卡片呈现，保留公开状态与技术栈，方便检查前台内容。
export default function AdminProjectsPage() {
  const { t, locale } = useI18n();
  const { data, setData, loading, error, reload } = useAdminResource<Project[]>(
    "/api/admin/projects",
  );
  const [pending, setPending] = useState<Project | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<unknown>(null);
  // 删除只在二次确认后发起，服务端成功后再从列表移除。
  async function deleteProject() {
    if (!pending || busy) return;
    setBusy(true);
    setActionError(null);
    try {
      await adminRequest(`/api/admin/projects/${pending.id}`, {
        method: "DELETE",
      });
      setData(
        (current) =>
          current?.filter((project) => project.id !== pending.id) || [],
      );
    } catch (cause) {
      setActionError(cause);
    } finally {
      setBusy(false);
      setPending(null);
    }
  }
  return (
    <>
      <AdminHeading
        title={t("admin.projects")}
        description={t("admin.projectsDescription")}
        action={
          <Link href="/admin/projects/new" className="admin-button">
            <Plus size={17} />
            {t("admin.newProject")}
          </Link>
        }
      />
      {Boolean(actionError) && <AdminError error={actionError} />}
      {loading ? (
        <AdminLoading />
      ) : error ? (
        <AdminError error={error} retry={reload} />
      ) : data?.length ? (
        <div className="admin-project-grid">
          {data.map((project) => (
            <article
              className="admin-panel admin-project-card"
              key={project.id}
            >
              {project.cover ? (
                <img
                  src={project.cover}
                  className="admin-project-cover"
                  alt=""
                />
              ) : (
                <div className="admin-project-fallback">
                  <FolderKanban size={34} strokeWidth={1.2} />
                </div>
              )}
              <div className="admin-project-body">
                <div className="admin-project-card-top">
                  <span className={`admin-badge admin-badge-${project.status}`}>
                    {t(`admin.${project.status}`)}
                  </span>
                  <div className="admin-table-actions">
                    <Link
                      href={`/admin/projects/${project.id}`}
                      className="admin-icon-button"
                      aria-label={`${t("admin.edit")} ${project.title}`}
                      title={t("admin.edit")}
                    >
                      <Pencil size={16} />
                    </Link>
                    <button
                      type="button"
                      className="admin-icon-button admin-danger-text"
                      onClick={() => setPending(project)}
                      aria-label={`${t("admin.delete")} ${project.title}`}
                      title={t("admin.delete")}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
                <h2>
                  <Link href={`/admin/projects/${project.id}`}>
                    {project.title}
                  </Link>
                </h2>
                <p>{project.description}</p>
                <div className="admin-tags">
                  {project.stack.map((item) => (
                    <span key={item}>{item}</span>
                  ))}
                </div>
                <footer>
                  <small>
                    {t("admin.updatedAt")}{" "}
                    {formatDate(project.updatedAt, false, locale)}
                  </small>
                  {project.url && (
                    <a
                      href={project.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="admin-text-link"
                    >
                      {t("admin.viewProject")}
                      <ArrowUpRight size={14} />
                    </a>
                  )}
                </footer>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <AdminEmpty
          title={t("admin.noProjects")}
          description={t("admin.noProjectsHint")}
          action={
            <Link
              href="/admin/projects/new"
              className="admin-button admin-button-secondary"
            >
              {t("admin.newProject")}
            </Link>
          }
        />
      )}
      {pending && (
        <ConfirmDialog
          title={t("admin.deleteProjectTitle")}
          description={`${pending.title}\n${t("admin.deleteProjectDescription")}`}
          confirm={t("admin.delete")}
          dangerous
          busy={busy}
          onCancel={() => setPending(null)}
          onConfirm={deleteProject}
        />
      )}
    </>
  );
}
