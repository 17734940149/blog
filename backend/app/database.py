import json
import sqlite3
from collections.abc import Iterator
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from app.config import Settings

DEFAULT_SETTINGS: dict[str, Any] = {
    "title": "栈间",
    "tagline": "在代码与生活之间，留下一点思考。",
    "description": "一个关于开发、设计与持续学习的个人博客。记录真实的问题，分享可复用的经验。",
    "author": "古月",
    "bio": "专注于把想法变成可用的产品，喜欢清晰的代码和克制的设计。",
    "email": "",
    "github": "",
    "location": "中国",
    "about": "## 你好，欢迎来到栈间\n\n这里是一个开发者的数字花园。我在这里记录工程实践、开发笔记与设计思考，希望每一次记录都能帮助未来的自己。\n\n我相信，好的软件应当清晰、可靠，并且尊重使用者的时间。相比追逐每一个新工具，我更愿意把眼前的问题理解透彻。\n\n## 关于这个站点\n\n栈间采用 Next.js、Python FastAPI 和 SQLite 构建，文章以 Markdown 编写。页面保留了技术感，也为阅读留出了足够安静的空间。\n\n> 这是一份可替换的示例介绍，文章与项目也包含原创演示内容。请登录管理后台，修改为自己的资料后再正式对外发布。",
    "currently": "持续学习，认真构建。",
    "role": "全栈开发者 · 独立产品构建",
    "avatar": "",
    "gitlab": "",
    "skills": "[lightbulb] AI 产品能力：需求分析、产品规划、功能定义、方案验证\n[figma] AI 设计能力：交互设计、UI/UX、原型构建、体验优化\n[code] AI 全栈测开：AI 应用开发、全栈开发、测试用例设计、自动化测试\n[rocket] AI 工程交付：环境搭建、容器部署、上线迭代",
    "purpose": "把作品、思考和探索放在同一个地方。记录从想法到交付的过程，整理可复用的经验，也让新的合作从相互了解开始。",
    "en": {},
}

SCHEMA = """
CREATE TABLE IF NOT EXISTS schema_version (version INTEGER PRIMARY KEY);
CREATE TABLE IF NOT EXISTS settings (id INTEGER PRIMARY KEY CHECK(id=1), body TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS posts (
 id TEXT PRIMARY KEY, title TEXT NOT NULL, slug TEXT NOT NULL UNIQUE, excerpt TEXT NOT NULL,
 content TEXT NOT NULL, cover TEXT NOT NULL, category TEXT NOT NULL, tags TEXT NOT NULL,
 status TEXT NOT NULL CHECK(status IN ('draft','published')), featured INTEGER NOT NULL DEFAULT 0,
 published_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, en TEXT NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS posts_public ON posts(status, published_at DESC);
CREATE INDEX IF NOT EXISTS posts_category ON posts(category, status);
CREATE TABLE IF NOT EXISTS projects (
 id TEXT PRIMARY KEY, title TEXT NOT NULL, description TEXT NOT NULL, url TEXT NOT NULL,
 github_url TEXT NOT NULL, stack TEXT NOT NULL, status TEXT NOT NULL, cover TEXT NOT NULL,
 created_at TEXT NOT NULL, updated_at TEXT NOT NULL, en TEXT NOT NULL DEFAULT '{}'
);
CREATE TABLE IF NOT EXISTS admins (id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS sessions (
 token_hash TEXT PRIMARY KEY, admin_id TEXT NOT NULL REFERENCES admins(id) ON DELETE CASCADE,
 expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_expiry ON sessions(expires_at);
CREATE TABLE IF NOT EXISTS login_attempts (key TEXT PRIMARY KEY, attempts INTEGER NOT NULL, reset_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL);
INSERT OR IGNORE INTO schema_version(version) VALUES(1);
"""


def utc_now() -> str:
    """统一数据库时间为可排序的 UTC 字符串，避免跨时区展示与筛选不一致。"""
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


@contextmanager
def connection(settings: Settings) -> Iterator[sqlite3.Connection]:
    """每次操作独立连接并及时提交关闭，避免线程共享 SQLite 连接产生竞态。"""
    conn = sqlite3.connect(settings.data_dir / "blog.db", timeout=10)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    try:
        with conn:
            yield conn
    finally:
        conn.close()


def initialize(settings: Settings) -> None:
    """启动时幂等迁移，并按显式演示开关初始化内容，绝不生成默认管理员。"""
    settings.data_dir.mkdir(parents=True, exist_ok=True)
    (settings.data_dir / "uploads").mkdir(exist_ok=True)
    with connection(settings) as conn:
        conn.execute("PRAGMA journal_mode=WAL")
        conn.executescript(SCHEMA)
        migrate_manual_locales(conn)
        conn.execute("INSERT OR IGNORE INTO settings(id,body) VALUES(1,?)", (json.dumps(DEFAULT_SETTINGS, ensure_ascii=False),))
        if settings.demo_seed:
            from app.seed import seed_demo
            seed_demo(conn)


def migrate_manual_locales(conn: sqlite3.Connection) -> None:
    """只补充手动英文字段并删除已废弃的机器缓存，旧文章、资料和上传资源完整保留。"""
    for table in ("posts", "projects"):
        columns = {row["name"] for row in conn.execute(f"PRAGMA table_info({table})")}
        if "en" not in columns:
            conn.execute(f"ALTER TABLE {table} ADD COLUMN en TEXT NOT NULL DEFAULT '{{}}'")
    conn.execute("DROP TABLE IF EXISTS translation_cache")
    conn.execute("INSERT OR IGNORE INTO schema_version(version) VALUES(2)")


def backup_database(settings: Settings, output: Path) -> None:
    """使用 SQLite 在线备份 API 得到一致快照，避免直接复制 WAL 数据库造成丢失。"""
    with connection(settings) as source:
        destination = sqlite3.connect(output)
        try:
            source.backup(destination)
        finally:
            destination.close()
