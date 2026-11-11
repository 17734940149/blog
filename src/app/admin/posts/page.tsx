"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Eye,
  FileDown,
  Pencil,
  Plus,
  Search,
  Trash2,
} from "lucide-react";
import { useI18n } from "@/components/providers";
import { formatDate } from "@/lib/format";
import type { Post } from "@/lib/types";
import {
  AdminApiError,
  adminRequest,
  useAdminResource,
} from "@/components/admin/api";
import {
  AdminEmpty,
  AdminError,
  AdminHeading,
  AdminLoading,
  ConfirmDialog,
} from "@/components/admin/ui";

// 在已有管理数据上筛选，状态切换和删除只操作用户明确选择的文章。
export default function AdminPostsPage() {
  const { t, locale } = useI18n();
  const { data, setData, loading, error, reload } =
    useAdminResource<Post[]>("/api/admin/posts");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [pending, setPending] = useState<{
    kind: "delete" | "status";
    post: Post;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<unknown>(null);
  const filtered = useMemo(
    () =>
      (data || []).filter(
        (post) =>
          (filter === "all" || post.status === filter) &&
          `${post.title} ${post.category} ${post.tags.join(" ")}`
            .toLocaleLowerCase()
            .includes(query.trim().toLocaleLowerCase()),
      ),
    [data, filter, query],
  );
  const totalPages = Math.max(1, Math.ceil(filtered.length / 12));
  const currentPage = Math.min(page, totalPages);
  const rows = filtered.slice((currentPage - 1) * 12, currentPage * 12);
  // 写入成功后再更新列表，失败时保留原记录，避免界面与数据库不一致。
  async function confirmAction() {
    if (!pending || busy) return;
    if (
      pending.kind === "status" &&
      pending.post.status === "draft" &&
      !pending.post.content.trim()
    ) {
      setActionError(
        new AdminApiError(t("admin.contentRequired"), "CONTENT_REQUIRED", 422),
      );
      setPending(null);
      return;
    }
    setBusy(true);
    setActionError(null);
    try {
      if (pending.kind === "delete") {
        await adminRequest(`/api/admin/posts/${pending.post.id}`, {
          method: "DELETE",
        });
        setData(
          (current) =>
            current?.filter((post) => post.id !== pending.post.id) || [],
        );
      } else {
        const updated = await adminRequest<Post>(
          `/api/admin/posts/${pending.post.id}`,
          {
            method: "PUT",
            body: JSON.stringify({
              ...pending.post,
              status: pending.post.status === "draft" ? "published" : "draft",
            }),
          },
        );
        setData(
          (current) =>
            current?.map((post) => (post.id === updated.id ? updated : post)) ||
            [],
        );
      }
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
        title={t("admin.posts")}
        description={t("admin.postsDescription")}
        action={
          <Link href="/admin/posts/new" className="admin-button">
            <Plus size={17} />
            {t("admin.newPost")}
          </Link>
        }
      />
      {Boolean(actionError) && <AdminError error={actionError} />}
      <div className="admin-toolbar">
        <label className="admin-search">
          <Search size={18} />
          <span className="admin-sr-only">{t("admin.searchPosts")}</span>
          <input
            type="search"
            placeholder={t("admin.searchPosts")}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setPage(1);
            }}
          />
        </label>
        <label className="admin-filter">
          <span className="admin-sr-only">{t("admin.filterStatus")}</span>
          <select
            value={filter}
            onChange={(event) => {
              setFilter(event.target.value);
              setPage(1);
            }}
          >
            <option value="all">{t("admin.allStatus")}</option>
            <option value="published">{t("admin.published")}</option>
            <option value="draft">{t("admin.draft")}</option>
          </select>
        </label>
        <span className="admin-result-count">
          {filtered.length} {t("admin.postsUnit")}
        </span>
      </div>
      {loading ? (
        <AdminLoading />
      ) : error ? (
        <AdminError error={error} retry={reload} />
      ) : rows.length ? (
        <section className="admin-panel">
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>{t("admin.postTitle")}</th>
                  <th>{t("admin.category")}</th>
                  <th>{t("admin.status")}</th>
                  <th>{t("admin.updatedAt")}</th>
                  <th className="admin-table-actions-heading">
                    {t("admin.actions")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((post) => (
                  <tr key={post.id}>
                    <td className="admin-post-title-cell">
                      <Link
                        href={`/admin/posts/${post.id}`}
                        className="admin-table-title"
                      >
                        {post.title}
                      </Link>
                      <small>/{post.slug}</small>
                    </td>
                    <td>{post.category}</td>
                    <td>
                      <span
                        className={`admin-badge admin-badge-${post.status}`}
                      >
                        {t(`admin.${post.status}`)}
                      </span>
                      {post.featured && (
                        <span
                          className="admin-featured-mark"
                          title={t("admin.featured")}
                        >
                          ◆
                        </span>
                      )}
                    </td>
                    <td className="admin-nowrap">
                      {formatDate(post.updatedAt, false, locale)}
                    </td>
                    <td>
                      <div className="admin-table-actions">
                        <Link
                          href={`/admin/posts/${post.id}`}
                          className="admin-icon-button"
                          title={t("admin.edit")}
                          aria-label={`${t("admin.edit")} ${post.title}`}
                        >
                          <Pencil size={16} />
                        </Link>
                        {post.status === "published" && (
                          <Link
                            href={`/blog/${post.slug}`}
                            target="_blank"
                            className="admin-icon-button"
                            title={t("admin.viewPost")}
                            aria-label={`${t("admin.viewPost")} ${post.title}`}
                          >
                            <Eye size={16} />
                          </Link>
                        )}
                        <button
                          type="button"
                          className="admin-icon-button"
                          onClick={() => setPending({ kind: "status", post })}
                          title={
                            post.status === "draft"
                              ? t("admin.publish")
                              : t("admin.unpublish")
                          }
                          aria-label={`${post.status === "draft" ? t("admin.publish") : t("admin.unpublish")} ${post.title}`}
                        >
                          <FileDown size={16} />
                        </button>
                        <button
                          type="button"
                          className="admin-icon-button admin-danger-text"
                          onClick={() => setPending({ kind: "delete", post })}
                          title={t("admin.delete")}
                          aria-label={`${t("admin.delete")} ${post.title}`}
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="admin-pagination">
            <span>
              {currentPage} / {totalPages} {t("admin.page")}
            </span>
            <div>
              <button
                className="admin-icon-button"
                type="button"
                disabled={currentPage <= 1}
                onClick={() => setPage(currentPage - 1)}
                aria-label={t("admin.previous")}
              >
                <ChevronLeft size={18} />
              </button>
              <button
                className="admin-icon-button"
                type="button"
                disabled={currentPage >= totalPages}
                onClick={() => setPage(currentPage + 1)}
                aria-label={t("admin.next")}
              >
                <ChevronRight size={18} />
              </button>
            </div>
          </div>
        </section>
      ) : (
        <AdminEmpty
          title={
            query || filter !== "all"
              ? t("admin.noSearchResults")
              : t("admin.noPosts")
          }
          description={
            query || filter !== "all"
              ? t("admin.tryOtherSearch")
              : t("admin.noPostsHint")
          }
        />
      )}
      {pending && (
        <ConfirmDialog
          title={
            pending.kind === "delete"
              ? t("admin.deletePostTitle")
              : pending.post.status === "draft"
                ? t("admin.publishTitle")
                : t("admin.unpublishTitle")
          }
          description={`${pending.post.title}\n${pending.kind === "delete" ? t("admin.deletePostDescription") : pending.post.status === "draft" ? t("admin.publishDescription") : t("admin.unpublishDescription")}`}
          confirm={
            pending.kind === "delete"
              ? t("admin.delete")
              : pending.post.status === "draft"
                ? t("admin.publish")
                : t("admin.unpublish")
          }
          dangerous={pending.kind === "delete"}
          busy={busy}
          onCancel={() => setPending(null)}
          onConfirm={confirmAction}
        />
      )}
    </>
  );
}
