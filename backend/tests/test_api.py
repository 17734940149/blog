import io
import json
import sqlite3
import time
import zipfile
from argparse import Namespace
from collections.abc import Iterator
from dataclasses import replace
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient
from PIL import Image

from app.cli import backup, setup
from app.config import Settings
from app.database import DEFAULT_SETTINGS, connection, initialize
from app.main import create_app
from app.security import COOKIE_NAME, create_admin
from app import security

EMAIL = "owner@example.test"
PASSWORD = "Test-only-password-2026"
ORIGIN = "http://localhost:3000"


@pytest.fixture
def client(tmp_path: Path) -> Iterator[TestClient]:
    """每个测试使用独立临时数据库，认证和破坏性操作绝不影响开发站点。"""
    config = Settings(data_dir=tmp_path, demo_seed=False)
    with TestClient(create_app(config)) as session:
        create_admin(config, EMAIL, PASSWORD)
        session.headers["Origin"] = ORIGIN
        yield session


def sign_in(client: TestClient) -> str:
    """通过真实登录端点获取 Cookie，避免测试绕过认证路径。"""
    response = client.post("/api/auth/login", json={"email": EMAIL, "password": PASSWORD})
    assert response.status_code == 200, response.text
    return client.cookies[COOKIE_NAME]


def article(**overrides: Any) -> dict[str, Any]:
    """只提供最小合法文章，单个测试可明确覆盖要验证的发布边界。"""
    return {"title": "可验证的工程笔记", "slug": "tested-note", "excerpt": "摘要", "content": "## 正文\n\n仅供测试的内容。", "cover": "", "category": "工程实践", "tags": ["特殊标签"], "status": "draft", "featured": False, "publishedAt": None, **overrides}


def test_auth_hash_expiry_logout_and_protected_routes(client: TestClient) -> None:
    """覆盖后台所有资源的认证与会话生命周期，确保 Cookie 存在不代表永久授权。"""
    for path in ["/api/admin/posts", "/api/admin/projects", "/api/admin/settings", "/api/admin/stats", "/api/auth/me"]:
        assert client.get(path).status_code == 401
    assert client.post("/api/admin/posts", json=article()).status_code == 401
    token = sign_in(client)
    assert client.get("/api/auth/me").json()["data"]["email"] == EMAIL
    with connection(client.app.state.settings) as conn:
        stored = conn.execute("SELECT password_hash FROM admins").fetchone()[0]
        stored_token = conn.execute("SELECT token_hash FROM sessions").fetchone()[0]
        assert PASSWORD not in stored and stored.startswith("scrypt$")
        assert token != stored_token
        conn.execute("UPDATE sessions SET expires_at=?", (int(time.time()) - 1,))
    assert client.get("/api/auth/me").status_code == 401
    sign_in(client)
    assert client.post("/api/auth/logout").status_code == 200
    assert client.get("/api/auth/me").status_code == 401


def test_csrf_requires_exact_configured_origin(client: TestClient) -> None:
    """登录和写操作均拒绝跨站来源，包括已经携带有效会话的请求。"""
    assert client.post("/api/auth/login", headers={"Origin": "https://evil.example"}, json={"email": EMAIL, "password": PASSWORD}).status_code == 403
    sign_in(client)
    assert client.post("/api/admin/posts", headers={"Origin": "http://localhost:3000.evil.example"}, json=article()).status_code == 403
    del client.headers["Origin"]
    assert client.post("/api/admin/posts", json=article()).status_code == 403
    assert client.get("/api/admin/posts").status_code == 200


def test_post_crud_drafts_future_dates_search_and_categories(client: TestClient) -> None:
    """通过实际 CRUD 验证草稿、预约文章和全文搜索的公开边界一致。"""
    sign_in(client)
    response = client.post("/api/admin/posts", json=article())
    assert response.status_code == 201, response.text
    post_id = response.json()["data"]["id"]
    assert client.get(f"/api/admin/posts/{post_id}").json()["data"]["content"].startswith("## 正文")
    assert client.get("/api/posts/tested-note").status_code == 404
    assert client.get("/api/posts?query=正文").json()["data"]["total"] == 0
    assert client.get("/api/categories").json()["data"] == []
    assert client.put(f"/api/admin/posts/{post_id}", json=article(status="published", publishedAt="2999-01-01T00:00:00Z")).status_code == 200
    assert client.get("/api/posts/tested-note").status_code == 404
    assert client.put(f"/api/admin/posts/{post_id}", json=article(status="published", featured=True)).status_code == 200
    assert client.get("/api/posts/tested-note").status_code == 200
    data = client.get("/api/posts?query=特殊标签&category=工程实践&featured=true&pageSize=1").json()["data"]
    assert data["total"] == 1 and data["totalPages"] == 1
    assert "content" not in data["items"][0]
    assert client.get("/api/posts?tag=特殊标签").json()["data"]["total"] == 1
    assert client.get("/api/posts?query=%25").json()["data"]["total"] == 0
    assert client.get("/api/posts?page=2&pageSize=1").json()["data"]["items"] == []
    assert client.get("/api/categories").json()["data"] == [{"name": "工程实践", "value": "工程实践", "count": 1}]
    assert client.post("/api/admin/posts", json=article()).status_code == 409
    assert client.delete(f"/api/admin/posts/{post_id}").status_code == 200
    assert client.get("/api/posts/tested-note").status_code == 404


def test_projects_settings_and_stats_persist(client: TestClient) -> None:
    """项目与站点资料写入后从新应用实例读取，确认不是仅存在内存中的演示。"""
    sign_in(client)
    project = {"title": "测试项目", "description": "可持久化", "stack": ["Python"], "status": "building", "url": "", "githubUrl": "", "cover": ""}
    response = client.post("/api/admin/projects", json=project)
    assert response.status_code == 201
    project_id = response.json()["data"]["id"]
    assert client.put(f"/api/admin/projects/{project_id}", json={**project, "status": "online"}).status_code == 200
    settings = client.get("/api/admin/settings").json()["data"]
    settings["author"] = "持久化作者"
    assert client.put("/api/admin/settings", json=settings).status_code == 200
    with TestClient(create_app(client.app.state.settings)) as restarted:
        assert restarted.get("/api/settings").json()["data"]["author"] == "持久化作者"
        assert restarted.get("/api/projects").json()["data"][0]["status"] == "online"
    assert client.get("/api/admin/stats").json()["data"]["totalProjects"] == 1
    assert client.delete(f"/api/admin/projects/{project_id}").status_code == 200
    assert client.get("/api/projects").json()["data"] == []


def test_password_change_revokes_all_sessions(client: TestClient) -> None:
    """修改密码后验证旧密码与其他设备会话同时失效，防止只清除当前 Cookie。"""
    first_token = sign_in(client)
    sign_in(client)
    new_password = "Changed-secure-password-2026"
    assert client.put("/api/auth/password", json={"currentPassword": "wrong", "newPassword": new_password}).status_code == 401
    assert client.put("/api/auth/password", json={"currentPassword": PASSWORD, "newPassword": new_password}).status_code == 200
    assert client.get("/api/auth/me", headers={"Cookie": f"{COOKIE_NAME}={first_token}"}).status_code == 401
    assert client.post("/api/auth/login", json={"email": EMAIL, "password": PASSWORD}).status_code == 401
    assert client.post("/api/auth/login", json={"email": EMAIL, "password": new_password}).status_code == 200


def test_login_limit_survives_application_restart(client: TestClient) -> None:
    """升级保留旧邮箱限速记录，新账号入口不能靠切换标识或来源绕开。"""
    for _ in range(5):
        assert client.post("/api/auth/login", json={"email": EMAIL, "password": "incorrect"}).status_code == 401
    with TestClient(create_app(client.app.state.settings), client=("192.0.2.2", 50000)) as restarted:
        response = restarted.post("/api/auth/login", headers={"Origin": ORIGIN}, json={"account": "guyueadmin", "password": PASSWORD})
        assert response.status_code == 429
        assert response.headers["Retry-After"] == "900"


def test_fixed_account_uses_legacy_record_without_accepting_other_accounts(client: TestClient) -> None:
    """固定账号复用旧记录，错误账号或空账号不能混用正确邮箱绕过。"""
    credentials = {"email": EMAIL, "password": PASSWORD}
    assert client.post("/api/auth/login", json={**credentials, "account": "other"}).status_code == 401
    assert client.post("/api/auth/login", json={**credentials, "account": None}).status_code == 422
    response = client.post("/api/auth/login", json={"account": "guyueadmin", "password": PASSWORD})
    assert response.status_code == 200
    assert response.json()["data"]["account"] == "guyueadmin"
    assert client.get("/api/auth/me").json()["data"] == response.json()["data"]
    assert response.json()["data"]["email"] == EMAIL


def test_upload_validates_real_image_and_private_paths(client: TestClient) -> None:
    """覆盖伪造 MIME、损坏签名、超限大小与图片读取，确保文件存储不成为任意上传入口。"""
    sign_in(client)
    assert client.post("/api/admin/uploads", files={"file": ("bad.png", b"<script>alert(1)</script>", "image/png")}).status_code == 422
    assert client.post("/api/admin/uploads", files={"file": ("bad.png", b"\x89PNG\r\n\x1a\ninvalid", "image/png")}).status_code == 422
    assert client.post("/api/admin/uploads", files={"file": ("large.png", b"x" * (5 * 1024 * 1024 + 1), "image/png")}).status_code == 413
    buffer = io.BytesIO()
    Image.new("RGB", (4, 4), color="teal").save(buffer, format="PNG")
    response = client.post("/api/admin/uploads", files={"file": ("../../private.png", buffer.getvalue(), "image/png")})
    assert response.status_code == 201, response.text
    url = response.json()["data"]["url"]
    assert url.startswith("/api/uploads/") and url.endswith(".webp")
    image = client.get(url)
    assert image.status_code == 200 and image.headers["content-type"] == "image/webp"
    assert image.content[8:12] == b"WEBP"
    assert client.get("/api/uploads/blog.db").status_code == 404
    assert client.get("/api/uploads/%2e%2e%2fblog.db").status_code == 404


def test_streaming_request_size_and_input_validation(client: TestClient) -> None:
    """无长度的分块请求也受总大小限制，并拒绝危险链接和非法分页。"""
    sign_in(client)
    chunks = iter([b"x" * (4 * 1024 * 1024), b"x" * (3 * 1024 * 1024)])
    assert client.post("/api/admin/posts", content=chunks, headers={"Content-Type": "application/json"}).status_code == 413
    assert client.post("/api/admin/posts", json=article(cover="javascript:alert(1)")).status_code == 422
    assert client.post("/api/admin/posts", json=article(slug="../private")).status_code == 422
    assert client.post("/api/admin/posts", json=article(title="   ")).status_code == 422
    assert client.post("/api/admin/posts", json=article(status="published", content="  \n ")).status_code == 422
    assert client.get("/api/posts?pageSize=10000").status_code == 422


def test_setup_required_and_demo_is_optional_idempotent(tmp_path: Path) -> None:
    """空站点没有默认密码；演示只在启用时初始化一次，删除后不会自动恢复。"""
    config = Settings(data_dir=tmp_path, demo_seed=False)
    with TestClient(create_app(config)) as client:
        assert client.get("/api/health").json()["data"]["status"] == "ok"
        assert client.get("/api/posts").json()["data"]["total"] == 0
        assert client.post("/api/auth/login", headers={"Origin": ORIGIN}, json={"email": EMAIL, "password": PASSWORD}).json()["code"] == "SETUP_REQUIRED"
    demo = replace(config, demo_seed=True)
    initialize(demo)
    initialize(demo)
    with connection(config) as conn:
        assert conn.execute("SELECT COUNT(*) FROM posts").fetchone()[0] == 5
        conn.execute("DELETE FROM posts")
    initialize(demo)
    with connection(config) as conn:
        assert conn.execute("SELECT COUNT(*) FROM posts").fetchone()[0] == 0


def test_backup_is_restorable_snapshot_with_uploads(client: TestClient, tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    """在线备份同时包含数据库和图片，解压后的数据库可以独立打开验证。"""
    sign_in(client)
    assert client.post("/api/admin/posts", json=article()).status_code == 201
    (tmp_path / "uploads" / ("a" * 32 + ".webp")).write_bytes(b"test-image")
    monkeypatch.setenv("DATA_DIR", str(tmp_path))
    monkeypatch.setenv("DEMO_SEED", "false")
    output = tmp_path / "snapshot.zip"
    backup(Namespace(output=str(output)))
    restored = tmp_path / "restored.db"
    with zipfile.ZipFile(output) as archive:
        restored.write_bytes(archive.read("blog.db"))
        assert archive.read("uploads/" + "a" * 32 + ".webp") == b"test-image"
        assert json.loads(archive.read("manifest.json"))["format"] == 1
    with sqlite3.connect(restored) as conn:
        assert conn.execute("SELECT COUNT(*) FROM posts").fetchone()[0] == 1


def test_cli_setup_reset_and_env_do_not_store_password(tmp_path: Path, monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]) -> None:
    """CLI 使用环境密码初始化并可撤销旧会话，配置文件和终端输出均不包含密码。"""
    monkeypatch.setenv("DATA_DIR", str(tmp_path / "data"))
    monkeypatch.setenv("APP_URL", ORIGIN)
    monkeypatch.setenv("ENVIRONMENT", "development")
    monkeypatch.setenv("DEMO_SEED", "false")
    monkeypatch.setenv("ADMIN_EMAIL", EMAIL)
    monkeypatch.setenv("ADMIN_PASSWORD", PASSWORD)
    monkeypatch.setattr("app.cli.BACKEND_DIR", tmp_path)
    args = Namespace(email=None, app_url=None, no_demo=True, reset_password=False)
    setup(args)
    assert PASSWORD not in (tmp_path / ".env").read_text(encoding="utf-8")
    assert PASSWORD not in capsys.readouterr().out
    with pytest.raises(ValueError, match="已存在"):
        setup(args)
    config = Settings.from_env()
    with TestClient(create_app(config)) as client:
        client.headers["Origin"] = ORIGIN
        token = sign_in(client)
        new_password = "CLI-reset-password-2026"
        monkeypatch.setenv("ADMIN_PASSWORD", new_password)
        monkeypatch.delenv("ADMIN_EMAIL")
        setup(Namespace(email=None, app_url=None, no_demo=True, reset_password=True))
        assert client.get("/api/auth/me", headers={"Cookie": f"{COOKIE_NAME}={token}"}).status_code == 401
        assert client.post("/api/auth/login", json={"account": "guyueadmin", "password": new_password}).status_code == 200
        assert client.post("/api/auth/login", json={"email": EMAIL, "password": new_password}).status_code == 200
        assert client.get("/api/posts").json()["data"]["total"] == 0
    initialize(replace(config, demo_seed=True))
    with connection(config) as conn:
        assert conn.execute("SELECT COUNT(*) FROM posts").fetchone()[0] == 0


def test_production_configuration_requires_https_and_disables_demo(monkeypatch: pytest.MonkeyPatch) -> None:
    """生产默认不插入示例，并要求公开域名使用 HTTPS，确保 Cookie 的 Secure 标记有效。"""
    monkeypatch.setenv("ENVIRONMENT", "production")
    monkeypatch.delenv("DEMO_SEED", raising=False)
    monkeypatch.setenv("APP_URL", "https://blog.example.com")
    config = Settings.from_env()
    assert config.secure_cookie is True and config.demo_seed is False
    monkeypatch.setenv("APP_URL", "http://blog.example.com")
    with pytest.raises(ValueError, match="HTTPS"):
        Settings.from_env()


def test_login_does_not_issue_old_password_session_after_reset(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    """模拟密码派生期间另一设备重置密码，验证旧凭据不能在撤销后重新生成有效会话。"""
    original_verify = security.verify_password

    def reset_during_verification(password: str, stored: str) -> bool:
        """在两个认证阶段之间改变账户密码，稳定复现并发重置而无需依赖时序概率。"""
        valid = original_verify(password, stored)
        if valid and password == PASSWORD:
            create_admin(client.app.state.settings, EMAIL, "Reset-during-login-2026", reset=True)
        return valid

    monkeypatch.setattr(security, "verify_password", reset_during_verification)
    response = client.post("/api/auth/login", json={"email": EMAIL, "password": PASSWORD})
    assert response.status_code == 401
    assert COOKIE_NAME not in client.cookies
    with connection(client.app.state.settings) as conn:
        assert conn.execute("SELECT COUNT(*) FROM sessions").fetchone()[0] == 0


def test_pending_password_change_cannot_overwrite_cli_reset(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    """旧会话改密派生期间发生 CLI 重置时，必须保留所有者刚设置的新密码。"""
    sign_in(client)
    original_hash = security.hash_password
    pending_password = "Pending-old-session-password-2026"
    owner_password = "Owner-CLI-reset-password-2026"

    def reset_during_hash(password: str) -> str:
        """在旧密码验证之后、最终写入之前插入重置，确定性复现凭据覆盖竞态。"""
        digest = original_hash(password)
        if password == pending_password:
            create_admin(client.app.state.settings, EMAIL, owner_password, reset=True)
        return digest

    monkeypatch.setattr(security, "hash_password", reset_during_hash)
    response = client.put("/api/auth/password", json={"currentPassword": PASSWORD, "newPassword": pending_password})
    assert response.status_code == 401
    assert response.json()["code"] == "INVALID_CREDENTIALS"
    assert client.get("/api/auth/me").status_code == 401
    with connection(client.app.state.settings) as conn:
        stored = conn.execute("SELECT password_hash FROM admins WHERE email=?", (EMAIL,)).fetchone()[0]
        assert security.verify_password(owner_password, stored)
        assert not security.verify_password(pending_password, stored)
        assert conn.execute("SELECT COUNT(*) FROM sessions").fetchone()[0] == 0
    assert client.post("/api/auth/login", json={"email": EMAIL, "password": owner_password}).status_code == 200


def test_legacy_profile_settings_get_defaults_without_rewriting_data(client: TestClient) -> None:
    """旧站点资料缺字段时只在读取结果中补齐，让升级无需迁移或覆盖用户数据。"""
    profile_fields = {"role", "avatar", "gitlab", "skills", "purpose"}
    legacy = {key: value for key, value in DEFAULT_SETTINGS.items() if key not in profile_fields | {"en"}}
    legacy.update({"author": "原有作者", "bio": "保留这段介绍", "currently": ""})
    with connection(client.app.state.settings) as conn:
        conn.execute("UPDATE settings SET body=? WHERE id=1", (json.dumps(legacy, ensure_ascii=False),))
    public_settings = client.get("/api/settings").json()["data"]
    assert all(public_settings[key] == value for key, value in legacy.items())
    assert {key: public_settings[key] for key in profile_fields} == {key: DEFAULT_SETTINGS[key] for key in profile_fields}
    sign_in(client)
    assert client.get("/api/admin/settings").json()["data"] == {**public_settings, "en": {}}
    with connection(client.app.state.settings) as conn:
        stored = json.loads(conn.execute("SELECT body FROM settings WHERE id=1").fetchone()[0])
    assert stored == legacy


@pytest.mark.parametrize("avatar,gitlab", [
    ("https://images.example.test/avatar.webp", "https://gitlab.example.test/profile"),
    ("/api/uploads/" + "a" * 32 + ".webp", "http://gitlab.example.test/profile"),
])
def test_profile_settings_round_trip_preserves_safe_urls_and_empty_fields(client: TestClient, avatar: str, gitlab: str) -> None:
    """个人名片资料完整保存后能公开读取，安全外链、上传头像及主动留空均保持原样。"""
    sign_in(client)
    payload = client.get("/api/admin/settings").json()["data"]
    payload.update({"role": "", "avatar": avatar, "gitlab": gitlab, "skills": "前端：TypeScript\n服务端：Python", "purpose": "记录自己的作品与学习。"})
    saved = client.put("/api/admin/settings", json=payload)
    assert saved.status_code == 200, saved.text
    assert saved.json()["data"] == payload
    assert client.get("/api/settings").json()["data"] == {key: value for key, value in payload.items() if key != "en"}
    assert client.get("/api/admin/settings").json()["data"] == payload


@pytest.mark.parametrize("field,value", [
    ("avatar", "javascript:alert(1)"),
    ("avatar", "data:image/svg+xml,<svg onload=alert(1)>"),
    ("avatar", "/api/uploads/../../.env"),
    ("gitlab", "javascript:alert(1)"),
    ("gitlab", "//gitlab.example.test/profile"),
    ("gitlab", "https://gitlab.example.test\\@evil.example/profile"),
])
def test_profile_settings_reject_dangerous_avatar_and_gitlab_urls(client: TestClient, field: str, value: str) -> None:
    """头像和 GitLab 入口必须绑定安全 URL 校验，不能通过新增字段绕过已有协议限制。"""
    sign_in(client)
    original = client.get("/api/admin/settings").json()["data"]
    response = client.put("/api/admin/settings", json={**original, field: value})
    assert response.status_code == 422
    assert response.json()["code"] == "VALIDATION_ERROR"
    assert client.get("/api/settings").json()["data"] == {key: value for key, value in original.items() if key != "en"}
