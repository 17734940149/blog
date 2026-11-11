import json
import sqlite3
from collections.abc import Iterator
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app import repository
from app.config import Settings
from app.database import DEFAULT_SETTINGS, SCHEMA, connection, initialize
from app.localization import PROFILE_FIELDS, resolve_locale
from app.main import create_app
from app.schemas import PostInput, ProjectInput, SiteSettings
from app.security import create_admin


@pytest.fixture
def client(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Iterator[TestClient]:
    """公开内容测试使用独立数据库并禁止网络调用，保证语言切换仅依赖作者填写的资料。"""
    def reject_network(*args: Any, **kwargs: Any) -> None:
        """一旦后端重新引入隐式模型请求便明确失败，避免手动双语功能退回外部依赖。"""
        raise AssertionError("手动双语不能发出外部网络请求")

    monkeypatch.setattr("urllib.request.urlopen", reject_network)
    with TestClient(create_app(Settings(data_dir=tmp_path, demo_seed=False))) as session:
        yield session


def published_post(client: TestClient, **overrides: Any) -> dict[str, Any]:
    """直接准备合法文章，让公开接口测试聚焦语言展示和可见性而不重复登录流程。"""
    payload = {"title": "中文标题", "slug": "public-note", "excerpt": "中文摘要", "content": "## 中文正文\n\n内容", "category": "工程实践", "tags": ["实践", "Python", "写作"], "status": "published", "publishedAt": "2026-01-01T00:00:00Z", **overrides}
    return repository.save_post(client.app.state.settings, PostInput(**payload))


def login(client: TestClient) -> None:
    """管理端回归使用临时账户的真实登录，确认两套原文始终受现有认证保护。"""
    email, password = "manual@example.test", "Manual-test-password-2026"
    create_admin(client.app.state.settings, email, password)
    client.headers["Origin"] = "http://localhost:3000"
    assert client.post("/api/auth/login", json={"email": email, "password": password}).status_code == 200


def test_post_manual_fields_fallback_and_public_list_hide_editor_payload(client: TestClient) -> None:
    """公开英文逐字段回退，列表不能通过嵌套英文对象泄露全文，语言切换也不能污染中文。"""
    english = {"title": "  English title  ", "excerpt": " \n ", "content": "# English\n\n`const x = 1`\n\n[Site](https://example.test/a?q=1)\n\n```python\nprint('原样代码')\n```", "category": "Engineering", "tags": ["Practice", "", "Writing"]}
    original = published_post(client, en=english)
    response = client.get("/api/posts/public-note", headers={"Accept-Language": "en-US"}).json()
    assert set(response) == {"data"}
    data = response["data"]
    assert data["title"] == "English title" and data["excerpt"] == original["excerpt"]
    assert data["content"] == english["content"]
    assert data["category"] == "Engineering" and data["categoryValue"] == "工程实践"
    assert data["tags"] == ["Practice", "Python", "Writing"]
    assert data["tagValues"] == original["tags"]
    for field in ("id", "slug", "cover", "status", "publishedAt", "createdAt", "updatedAt"):
        assert data[field] == original[field]
    assert "en" not in data
    listing = client.get("/api/posts", headers={"Accept-Language": "en"}).json()["data"]["items"][0]
    assert "en" not in listing and "content" not in listing and listing["title"] == "English title"
    chinese = client.get("/api/posts/public-note").json()["data"]
    assert chinese["title"] == original["title"] and chinese["tags"] == original["tags"]
    assert repository.get_admin_post(client.app.state.settings, original["id"])["en"] == english


def test_manual_markdown_preserves_indented_code_and_trailing_newlines(client: TestClient) -> None:
    """正文与关于页保留 Markdown 边界空白，避免后台预览的缩进代码在公开页面变成普通段落。"""
    content = "    print('English article code')\n    print('second line')\n\n"
    about = "    print('English profile code')\n\n"
    post = published_post(client, en={"title": "  English title  ", "content": content})
    settings = repository.get_settings(client.app.state.settings)
    settings["en"] = {"author": "  English author  ", "about": about}
    repository.save_settings(client.app.state.settings, SiteSettings(**settings))
    displayed_post = client.get("/api/posts/public-note", headers={"Accept-Language": "en"}).json()["data"]
    displayed_settings = client.get("/api/settings", headers={"Accept-Language": "en"}).json()["data"]
    assert displayed_post["content"] == content and displayed_post["title"] == "English title"
    assert displayed_settings["about"] == about and displayed_settings["author"] == "English author"
    repository.save_post(client.app.state.settings, PostInput(**{**post, "en": {"content": " \n\t "}}), post["id"])
    repository.save_settings(client.app.state.settings, SiteSettings(**{**settings, "en": {"about": " \n\t "}}))
    assert client.get("/api/posts/public-note", headers={"Accept-Language": "en"}).json()["data"]["content"] == post["content"]
    assert client.get("/api/settings", headers={"Accept-Language": "en"}).json()["data"]["about"] == settings["about"]


@pytest.mark.parametrize(("english", "expected"), [({}, ["实践", "Python", "写作"]), ({"tags": []}, ["实践", "Python", "写作"]), ({"tags": ["  Practice  ", " \t "]}, ["Practice", "Python", "写作"]), ({"tags": ["", "", "Writing", "Extra"]}, ["实践", "Python", "Writing"])])
def test_english_arrays_fallback_by_source_index(client: TestClient, english: dict[str, Any], expected: list[str]) -> None:
    """英文列表以中文项为稳定基准，空项、短列表及多余项都不能改变源标签对应关系。"""
    published_post(client, en=english)
    data = client.get("/api/posts/public-note", headers={"Accept-Language": "en"}).json()["data"]
    assert data["tags"] == expected
    assert data["tagValues"] == ["实践", "Python", "写作"]


def test_settings_and_project_manual_values_preserve_nonlocalized_fields(client: TestClient) -> None:
    """只覆盖约定的展示文案，个人链接、邮箱、头像、项目地址和品牌保持作者的原始值。"""
    settings = repository.get_settings(client.app.state.settings)
    settings.update({"email": "owner@example.test", "github": "https://github.com/owner", "gitlab": "https://gitlab.com/owner", "avatar": "/api/uploads/" + "a" * 32 + ".webp", "en": {field: "  English " + field + "  " for field in PROFILE_FIELDS}})
    settings["en"].update({"bio": " \n ", "email": "ignored@example.test", "github": "https://untrusted.example", "avatar": "javascript:ignored"})
    saved = repository.save_settings(client.app.state.settings, SiteSettings(**settings))
    english = client.get("/api/settings", headers={"Accept-Language": "en"}).json()["data"]
    for field in PROFILE_FIELDS:
        expected = settings[field] if field == "bio" else settings["en"][field] if field == "about" else "English " + field
        assert english[field] == expected
    for field in ("email", "github", "gitlab", "avatar"):
        assert english[field] == saved[field]
        assert field not in saved["en"]
    project = repository.save_project(client.app.state.settings, ProjectInput(title="中文项目", description="中文介绍", stack=["工具", "Python", "存储"], url="https://project.example", githubUrl="https://github.com/example/project", en={"title": "  Project title  ", "description": "  ", "stack": ["Tools", "", "Storage"]}))
    shown = client.get("/api/projects", headers={"Accept-Language": "en"}).json()["data"][0]
    assert shown["title"] == "Project title" and shown["description"] == "中文介绍"
    assert shown["stack"] == ["Tools", "Python", "Storage"]
    assert shown["url"] == project["url"] and shown["githubUrl"] == project["githubUrl"]
    assert "en" not in shown and "en" not in english


def test_admin_round_trip_legacy_clients_preserve_english_and_explicit_empty_clears(client: TestClient) -> None:
    """真实管理接口保存两套原文，旧客户端省略英文不会误删，显式清空仍可恢复中文回退。"""
    login(client)
    post = published_post(client, en={"title": " English title ", "tags": ["Practice", "", "Writing"]})
    project = repository.save_project(client.app.state.settings, ProjectInput(title="项目", en={"title": "Project"}))
    settings = repository.get_settings(client.app.state.settings)
    settings["en"] = {"author": "English author", "about": "# English about"}
    assert client.put("/api/admin/settings", json=settings).status_code == 200
    resources = [(f"/api/admin/posts/{post['id']}", post), (f"/api/admin/projects/{project['id']}", project), ("/api/admin/settings", settings)]
    for path, payload in resources:
        assert client.get(path, headers={"Accept-Language": "en"}).json()["data"]["en"] == payload["en"]
        omitted = {key: value for key, value in payload.items() if key != "en"}
        retained = client.put(path, json=omitted)
        assert retained.status_code == 200, retained.text
        assert retained.json()["data"]["en"] == payload["en"]
    with TestClient(create_app(client.app.state.settings)) as restarted:
        assert restarted.get("/api/posts/public-note", headers={"Accept-Language": "en"}).json()["data"]["title"] == "English title"
        assert restarted.get("/api/settings", headers={"Accept-Language": "en"}).json()["data"]["author"] == "English author"
    for path, payload in resources:
        cleared = client.put(path, json={**payload, "en": {}})
        assert cleared.status_code == 200 and cleared.json()["data"]["en"] == {}
    assert client.get("/api/posts/public-note", headers={"Accept-Language": "en"}).json()["data"]["title"] == post["title"]


def test_categories_use_stable_published_definition_and_source_filters(client: TestClient) -> None:
    """同分类英文名来自稳定公开定义，草稿与未来文章不能影响导航名称或计数。"""
    first = published_post(client, slug="first", en={"category": "Stable engineering"})
    second = published_post(client, slug="second", en={"category": "Conflicting name"})
    published_post(client, slug="no-definition", category="无英文分类", en={"category": "  "})
    published_post(client, slug="hidden", status="draft", category="秘密分类", en={"category": "Private category"})
    published_post(client, slug="future", publishedAt="2999-01-01T00:00:00Z", en={"category": "Future category"})
    with connection(client.app.state.settings) as conn:
        conn.execute("UPDATE posts SET id='a-stable' WHERE id=?", (first["id"],))
        conn.execute("UPDATE posts SET id='z-other' WHERE id=?", (second["id"],))
    expected = [{"name": "Stable engineering", "value": "工程实践", "count": 2}, {"name": "无英文分类", "value": "无英文分类", "count": 1}]
    assert client.get("/api/categories", headers={"Accept-Language": "en"}).json()["data"] == expected
    for _ in range(2):
        assert client.get("/api/categories", headers={"Accept-Language": "en"}).json()["data"] == expected
    chinese = client.get("/api/categories").json()["data"]
    assert chinese[0] == {"name": "工程实践", "value": "工程实践", "count": 2}
    assert client.get("/api/posts", params={"category": expected[0]["value"]}, headers={"Accept-Language": "en"}).json()["data"]["total"] == 2
    assert client.get("/api/posts", params={"category": expected[0]["name"]}).json()["data"]["total"] == 0
    assert client.get("/api/posts/hidden", headers={"Accept-Language": "en"}).status_code == 404


@pytest.mark.parametrize("language", ["en", "zh"])
def test_bilingual_search_unifies_source_manual_hits_counts_and_filters(client: TestClient, language: str) -> None:
    """中英文搜索共享匹配集合，先合并原文和手工英文命中，再统一筛选、计数和分页。"""
    posts = [published_post(client, slug="source", title="Needle 原文", en={"title": "Needle duplicated hit"}, featured=True)]
    for field in ("title", "excerpt", "content", "category", "tags"):
        value: Any = ["Needle tag", "", ""] if field == "tags" else "Needle " + field
        posts.append(published_post(client, slug="english-" + field, en={field: value}))
    published_post(client, slug="private", status="draft", en={"title": "Needle private"})
    published_post(client, slug="scheduled", publishedAt="2999-01-01T00:00:00Z", en={"content": "Needle future"})
    pages = [client.get("/api/posts", params={"query": "nEeDlE", "pageSize": 2, "page": page}, headers={"Accept-Language": language}).json()["data"] for page in range(1, 4)]
    assert all(page["total"] == 6 and page["totalPages"] == 3 for page in pages)
    assert {item["id"] for page in pages for item in page["items"]} == {post["id"] for post in posts}
    assert client.get("/api/posts", params={"query": "Needle", "featured": "true"}).json()["data"]["total"] == 1
    assert client.get("/api/posts", params={"query": "Needle", "category": "工程实践", "tag": "实践"}).json()["data"]["total"] == 6
    assert client.get("/api/posts", params={"query": "Needle", "category": "Needle category"}).json()["data"]["total"] == 0
    assert client.get("/api/posts", params={"query": "%"}).json()["data"]["total"] == 0
    assert client.get("/api/posts", params={"query": "正文"}).json()["data"]["total"] == 6
    changed = posts[1]
    repository.save_post(client.app.state.settings, PostInput(**{**changed, "en": {"title": "Replacement title"}}), changed["id"])
    assert client.get("/api/posts", params={"query": "Needle"}).json()["data"]["total"] == 5


def test_existing_database_migrates_idempotently_without_rewriting_user_content(tmp_path: Path) -> None:
    """从旧表真实升级并重复启动，确认只新增空英文列和移除机器缓存，用户内容及文件不变。"""
    config = Settings(data_dir=tmp_path, demo_seed=False)
    legacy_settings = {"title": "旧站点", "author": "原作者", "about": "必须保留的介绍"}
    post_values = ("legacy-post", "旧文章", "legacy", "旧摘要", "旧正文", "", "旧分类", '["原标签"]', "published", 1, "2020-01-01T00:00:00Z", "2020-01-01T00:00:00Z", "2020-01-01T00:00:00Z")
    project_values = ("legacy-project", "旧项目", "旧介绍", "", "", '["Python"]', "online", "", "2020-01-01T00:00:00Z", "2020-01-01T00:00:00Z")
    with sqlite3.connect(tmp_path / "blog.db") as conn:
        conn.executescript(SCHEMA.replace(", en TEXT NOT NULL DEFAULT '{}'", ""))
        conn.execute("INSERT INTO settings VALUES(1,?)", (json.dumps(legacy_settings, ensure_ascii=False),))
        conn.execute("INSERT INTO posts VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)", post_values)
        conn.execute("INSERT INTO projects VALUES(?,?,?,?,?,?,?,?,?,?)", project_values)
        conn.execute("INSERT INTO admins VALUES('owner','legacy@example.test','retain-hash')")
        conn.execute("CREATE TABLE translation_cache(content_hash TEXT, translated_text TEXT)")
        conn.execute("INSERT INTO translation_cache VALUES('machine','discarded machine text')")
    uploads = tmp_path / "uploads"
    uploads.mkdir()
    (uploads / "keep.webp").write_bytes(b"original-upload")
    initialize(config)
    initialize(config)
    with connection(config) as conn:
        assert tuple(conn.execute("SELECT * FROM posts").fetchone()) == (*post_values, "{}")
        assert tuple(conn.execute("SELECT * FROM projects").fetchone()) == (*project_values, "{}")
        assert json.loads(conn.execute("SELECT body FROM settings").fetchone()[0]) == legacy_settings
        assert conn.execute("SELECT password_hash FROM admins").fetchone()[0] == "retain-hash"
        assert conn.execute("SELECT name FROM sqlite_master WHERE name='translation_cache'").fetchone() is None
        assert conn.execute("SELECT COUNT(*) FROM schema_version WHERE version=2").fetchone()[0] == 1
    assert (uploads / "keep.webp").read_bytes() == b"original-upload"
    assert repository.get_settings(config)["en"] == {}


def test_demo_and_legacy_settings_do_not_invent_english(tmp_path: Path) -> None:
    """新的演示数据与旧资料均保持英文空白，切换语言时只能回退作者已有的中文内容。"""
    config = Settings(data_dir=tmp_path, demo_seed=True)
    with TestClient(create_app(config)) as client:
        assert all(post["en"] == {} for post in repository.list_admin_posts(config))
        assert all(project["en"] == {} for project in repository.list_projects(config))
        assert repository.get_settings(config)["en"] == {}
        assert client.get("/api/settings", headers={"Accept-Language": "en"}).json()["data"]["title"] == DEFAULT_SETTINGS["title"]
        english = client.get("/api/posts", headers={"Accept-Language": "en"}).json()["data"]
        chinese = client.get("/api/posts").json()["data"]
        assert english == chinese and english["total"] == 5


@pytest.mark.parametrize(("model", "data"), [(PostInput, {"title": "标题", "slug": "valid", "en": {"title": "x" * 161}}), (PostInput, {"title": "标题", "slug": "valid", "en": {"tags": ["x" * 31]}}), (PostInput, {"title": "标题", "slug": "valid", "en": {"tags": [""] * 13}}), (ProjectInput, {"title": "项目", "en": {"description": "x" * 1001}}), (ProjectInput, {"title": "项目", "en": {"stack": ["x" * 41]}}), (SiteSettings, {"title": "站点", "author": "作者", "en": {"about": "x" * 50001}}), (SiteSettings, {"title": "站点", "author": "作者", "en": {"skills": "x" * 1501}})])
def test_english_fields_share_source_limits(model: Any, data: dict[str, Any]) -> None:
    """可选英文不放宽既有内容长度限制，防止独立语言入口绕过原有输入约束。"""
    with pytest.raises(ValidationError):
        model(**data)


@pytest.mark.parametrize(("header", "expected"), [("", "zh"), ("en-US,en;q=0.8,zh;q=0.5", "en"), ("en;q=0.2,zh-CN;q=0.9", "zh"), ("de,fr", "zh"), ("en;q=0", "zh"), ("en;q=invalid,zh;q=0.8", "zh")])
def test_locale_respects_supported_language_priority(header: str, expected: str) -> None:
    """按浏览器语言权重选择作者版本，非法或不支持的语言继续使用中文。"""
    assert resolve_locale(header) == expected
