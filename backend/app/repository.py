import json
import math
import sqlite3
from typing import Any
from uuid import uuid4

from app.config import Settings
from app.database import DEFAULT_SETTINGS, connection, utc_now
from app.errors import ApiException
from app.schemas import PostInput, ProjectInput, SiteSettings


def post_dto(row: sqlite3.Row, full: bool = True) -> dict[str, Any]:
    """在唯一边界转换数据库字段，确保公开列表不会意外携带文章全文。"""
    result = dict(row)
    result["tags"] = json.loads(result["tags"])
    result["en"] = json.loads(result["en"])
    result["featured"] = bool(result["featured"])
    result["publishedAt"] = result.pop("published_at")
    result["createdAt"] = result.pop("created_at")
    result["updatedAt"] = result.pop("updated_at")
    result["readingMinutes"] = max(1, math.ceil(len(result["content"]) / 450))
    if not full:
        result.pop("content")
    return result


def project_dto(row: sqlite3.Row) -> dict[str, Any]:
    """统一项目字段和技术栈格式，使客户端无需理解数据库命名规则。"""
    result = dict(row)
    result["stack"] = json.loads(result["stack"])
    result["en"] = json.loads(result["en"])
    result["githubUrl"] = result.pop("github_url")
    result["createdAt"] = result.pop("created_at")
    result["updatedAt"] = result.pop("updated_at")
    return result


def list_public_posts(settings: Settings, query: str = "", category: str = "", tag: str = "", featured: bool | None = None, page: int = 1, page_size: int = 6) -> dict[str, Any]:
    """所有公开文章入口复用发布条件，草稿和未来发布时间不能通过筛选绕过。"""
    clauses = ["status='published'", "published_at IS NOT NULL", "published_at <= ?"]
    args: list[Any] = [utc_now()]
    if query:
        escaped = query.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
        # 两套作者内容在同一个 WHERE 中匹配，避免分页、计数或语言切换造成搜索遗漏。
        fields = ["title", "excerpt", "content", "category"]
        expressions = fields + [f"json_extract(en, '$.{field}')" for field in fields]
        search = [f"{field} LIKE ? ESCAPE '\\'" for field in expressions]
        search.extend(["EXISTS(SELECT 1 FROM json_each(posts.tags) WHERE value LIKE ? ESCAPE '\\')", "EXISTS(SELECT 1 FROM json_each(posts.en, '$.tags') WHERE value LIKE ? ESCAPE '\\')"])
        clauses.append("(" + " OR ".join(search) + ")")
        args.extend([f"%{escaped}%"] * len(search))
    if category:
        clauses.append("category=?")
        args.append(category)
    if tag:
        clauses.append("EXISTS(SELECT 1 FROM json_each(posts.tags) WHERE value=?)")
        args.append(tag)
    if featured is not None:
        clauses.append("featured=?")
        args.append(int(featured))
    where = " AND ".join(clauses)
    with connection(settings) as conn:
        total = conn.execute(f"SELECT COUNT(*) FROM posts WHERE {where}", args).fetchone()[0]
        rows = conn.execute(f"SELECT * FROM posts WHERE {where} ORDER BY published_at DESC, id DESC LIMIT ? OFFSET ?", (*args, page_size, (page - 1) * page_size)).fetchall()
    return {"items": [post_dto(row, False) for row in rows], "total": total, "page": page, "pageSize": page_size, "totalPages": math.ceil(total / page_size)}


def get_public_post(settings: Settings, slug: str) -> dict[str, Any]:
    """直接访问文章地址同样检查发布状态，不能通过猜测 slug 读取草稿。"""
    with connection(settings) as conn:
        row = conn.execute("SELECT * FROM posts WHERE slug=? AND status='published' AND published_at<=?", (slug, utc_now())).fetchone()
    if row is None:
        raise ApiException(404, "文章不存在或尚未发布", "NOT_FOUND")
    return post_dto(row)


def categories(settings: Settings) -> list[dict[str, Any]]:
    """分类只读取已公开文章，以稳定 ID 选择英文名，避免草稿或请求语言改变筛选源值。"""
    with connection(settings) as conn:
        rows = conn.execute("SELECT category,en FROM posts WHERE status='published' AND published_at<=? ORDER BY id", (utc_now(),)).fetchall()
    counts: dict[str, dict[str, Any]] = {}
    for row in rows:
        category = row["category"]
        record = counts.setdefault(category, {"name": category, "value": category, "count": 0, "enName": ""})
        record["count"] += 1
        english_name = json.loads(row["en"]).get("category", "").strip()
        if not record["enName"] and english_name:
            record["enName"] = english_name
    return sorted(counts.values(), key=lambda item: (-item["count"], item["name"]))


def list_admin_posts(settings: Settings) -> list[dict[str, Any]]:
    """后台按更新时间返回完整正文，支持编辑而不让公开查询接触草稿。"""
    with connection(settings) as conn:
        return [post_dto(row) for row in conn.execute("SELECT * FROM posts ORDER BY updated_at DESC, id DESC").fetchall()]


def get_admin_post(settings: Settings, post_id: str) -> dict[str, Any]:
    """后台用不可变 ID 编辑文章，允许用户修改地址而不丢失编辑上下文。"""
    with connection(settings) as conn:
        row = conn.execute("SELECT * FROM posts WHERE id=?", (post_id,)).fetchone()
    if row is None:
        raise ApiException(404, "文章不存在", "NOT_FOUND")
    return post_dto(row)


def save_post(settings: Settings, payload: PostInput, post_id: str | None = None) -> dict[str, Any]:
    """创建和更新共用一次字段映射，保证发布时自动补日期且不改变创建时间。"""
    now = utc_now()
    old = get_admin_post(settings, post_id) if post_id else None
    post_id = post_id or uuid4().hex
    published_at = payload.publishedAt or (now if payload.status == "published" else None)
    english = payload.en.model_dump(exclude_unset=True) if "en" in payload.model_fields_set else (old["en"] if old else {})
    values = (payload.title, payload.slug, payload.excerpt, payload.content, payload.cover, payload.category, json.dumps(payload.tags, ensure_ascii=False), payload.status, int(payload.featured), published_at, json.dumps(english, ensure_ascii=False), now, post_id)
    with connection(settings) as conn:
        if old:
            conn.execute("UPDATE posts SET title=?,slug=?,excerpt=?,content=?,cover=?,category=?,tags=?,status=?,featured=?,published_at=?,en=?,updated_at=? WHERE id=?", values)
        else:
            conn.execute("INSERT INTO posts(title,slug,excerpt,content,cover,category,tags,status,featured,published_at,en,updated_at,id,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)", (*values, now))
    return get_admin_post(settings, post_id)


def delete_record(settings: Settings, table: str, record_id: str) -> None:
    """仅允许两个内部白名单资源，复用删除行为而不引入动态表名注入。"""
    if table not in {"posts", "projects"}:
        raise ValueError("Unsupported resource")
    with connection(settings) as conn:
        cursor = conn.execute(f"DELETE FROM {table} WHERE id=?", (record_id,))
        if cursor.rowcount == 0:
            raise ApiException(404, "内容不存在", "NOT_FOUND")


def list_projects(settings: Settings) -> list[dict[str, Any]]:
    """项目没有隐藏草稿状态，按创建时间保持前后台一致的显示顺序。"""
    with connection(settings) as conn:
        return [project_dto(row) for row in conn.execute("SELECT * FROM projects ORDER BY created_at DESC, rowid ASC").fetchall()]


def get_project(settings: Settings, project_id: str) -> dict[str, Any]:
    """集中处理项目缺失，避免各个编辑接口出现不同的错误结构。"""
    with connection(settings) as conn:
        row = conn.execute("SELECT * FROM projects WHERE id=?", (project_id,)).fetchone()
    if row is None:
        raise ApiException(404, "项目不存在", "NOT_FOUND")
    return project_dto(row)


def save_project(settings: Settings, payload: ProjectInput, project_id: str | None = None) -> dict[str, Any]:
    """项目创建更新保持字段完整，空链接可保存，避免演示项目伪造外部地址。"""
    now = utc_now()
    old = get_project(settings, project_id) if project_id else None
    project_id = project_id or uuid4().hex
    english = payload.en.model_dump(exclude_unset=True) if "en" in payload.model_fields_set else (old["en"] if old else {})
    values = (payload.title, payload.description, payload.url, payload.githubUrl, json.dumps(payload.stack, ensure_ascii=False), payload.status, payload.cover, json.dumps(english, ensure_ascii=False), now, project_id)
    with connection(settings) as conn:
        if old:
            conn.execute("UPDATE projects SET title=?,description=?,url=?,github_url=?,stack=?,status=?,cover=?,en=?,updated_at=? WHERE id=?", values)
        else:
            conn.execute("INSERT INTO projects(title,description,url,github_url,stack,status,cover,en,updated_at,id,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)", (*values, now))
    return get_project(settings, project_id)


def get_settings(settings: Settings) -> dict[str, Any]:
    """只为旧记录缺失的公开字段补默认值，保留已有资料和显式留空且不回写数据库。"""
    with connection(settings) as conn:
        row = conn.execute("SELECT body FROM settings WHERE id=1").fetchone()
    return {**DEFAULT_SETTINGS, **json.loads(row[0])}


def save_settings(settings: Settings, payload: SiteSettings) -> dict[str, Any]:
    """只保存白名单配置，旧客户端未提交英文时保留现有内容，避免快捷操作误删第二语言。"""
    body = payload.model_dump()
    body["en"] = payload.en.model_dump(exclude_unset=True) if "en" in payload.model_fields_set else get_settings(settings)["en"]
    with connection(settings) as conn:
        conn.execute("UPDATE settings SET body=? WHERE id=1", (json.dumps(body, ensure_ascii=False),))
    return body


def dashboard_stats(settings: Settings) -> dict[str, Any]:
    """概览仅返回实际数据库计数，避免引入没有采集来源的浏览量指标。"""
    with connection(settings) as conn:
        total = conn.execute("SELECT COUNT(*) FROM posts").fetchone()[0]
        published = conn.execute("SELECT COUNT(*) FROM posts WHERE status='published'").fetchone()[0]
        projects = conn.execute("SELECT COUNT(*) FROM projects").fetchone()[0]
        recent = conn.execute("SELECT * FROM posts ORDER BY updated_at DESC LIMIT 5").fetchall()
    return {"totalPosts": total, "publishedPosts": published, "draftPosts": total - published, "totalProjects": projects, "recentPosts": [post_dto(row, False) for row in recent]}
