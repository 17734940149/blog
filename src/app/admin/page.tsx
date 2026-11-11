"use client";

import Link from "next/link";
import {
  ArrowRight,
  FileCheck2,
  FileClock,
  Files,
  FolderKanban,
  Plus,
} from "lucide-react";
import { useI18n } from "@/components/providers";
import { formatDate } from "@/lib/format";
import type { DashboardStats } from "@/lib/types";
import { useAdminResource } from "@/components/admin/api";
import {
  AdminEmpty,
  AdminError,
  AdminHeading,
  AdminLoading,
} from "@/components/admin/ui";

// 概览只显示数据库中的实际内容统计，便于作者判断下一步写作任务。
export default function AdminOverviewPage() {
  const { t, locale } = useI18n();
  const { data, loading, error, reload } =
    useAdminResource<DashboardStats>("/api/admin/stats");
  return (
    <>
      <AdminHeading
        title={t("admin.overviewTitle")}
        description={t("admin.overviewDescription")}
        action={
          <Link href="/admin/posts/new" className="admin-button">
            <Plus size={17} />
            {t("admin.newPost")}
          </Link>
        }
      />
      {loading ? (
        <AdminLoading />
      ) : error ? (
        <AdminError error={error} retry={reload} />
      ) : (
        data && (
          <>
            <section className="admin-stats" aria-label={t("admin.statistics")}>
              {[
                { key: "totalPosts", value: data.totalPosts, icon: Files },
                {
                  key: "publishedPosts",
                  value: data.publishedPosts,
                  icon: FileCheck2,
                },
                { key: "draftPosts", value: data.draftPosts, icon: FileClock },
                {
                  key: "totalProjects",
                  value: data.totalProjects,
                  icon: FolderKanban,
                },
              ].map(({ key, value, icon: Icon }) => (
                <div className="admin-stat" key={key}>
                  <span>
                    {t(`admin.${key}`)}
                    <Icon size={18} />
                  </span>
                  <strong>{value}</strong>
                </div>
              ))}
            </section>
            <section className="admin-panel">
              <div className="admin-panel-heading">
                <h2>{t("admin.recentPosts")}</h2>
                <Link href="/admin/posts" className="admin-text-link">
                  {t("admin.managePosts")}
                  <ArrowRight size={15} />
                </Link>
              </div>
              {data.recentPosts.length ? (
                <div className="admin-table-wrap">
                  <table className="admin-table">
                    <thead>
                      <tr>
                        <th>{t("admin.postTitle")}</th>
                        <th>{t("admin.status")}</th>
                        <th>{t("admin.updatedAt")}</th>
                        <th>
                          <span className="admin-sr-only">
                            {t("admin.actions")}
                          </span>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.recentPosts.map((post) => (
                        <tr key={post.id}>
                          <td>
                            <Link
                              href={`/admin/posts/${post.id}`}
                              className="admin-table-title"
                            >
                              {post.title}
                            </Link>
                            <small>
                              {post.category || t("admin.uncategorized")}
                            </small>
                          </td>
                          <td>
                            <span
                              className={`admin-badge admin-badge-${post.status}`}
                            >
                              {t(`admin.${post.status}`)}
                            </span>
                          </td>
                          <td className="admin-nowrap">
                            {formatDate(post.updatedAt, false, locale)}
                          </td>
                          <td>
                            <Link
                              className="admin-text-link"
                              href={`/admin/posts/${post.id}`}
                            >
                              {t("admin.edit")}
                            </Link>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <AdminEmpty
                  title={t("admin.noPosts")}
                  description={t("admin.noPostsHint")}
                  action={
                    <Link
                      href="/admin/posts/new"
                      className="admin-button admin-button-secondary"
                    >
                      {t("admin.newPost")}
                    </Link>
                  }
                />
              )}
            </section>
            <section className="admin-writing-note">
              <span className="admin-note-line" />
              <div>
                <h2>{t("admin.writingNoteTitle")}</h2>
                <p>{t("admin.writingNote")}</p>
              </div>
              <Link href="/admin/settings" className="admin-text-link">
                {t("admin.completeProfile")}
                <ArrowRight size={15} />
              </Link>
            </section>
          </>
        )
      )}
    </>
  );
}
