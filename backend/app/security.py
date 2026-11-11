import hashlib
import hmac
import re
import secrets
import time
from typing import Any
from uuid import uuid4

from fastapi import Request

from app.config import Settings
from app.database import connection
from app.errors import ApiException

COOKIE_NAME = "stacknote_session"
ADMIN_ACCOUNT = "guyueadmin"
RATE_WINDOW = 15 * 60
RATE_LIMIT = 5


def hash_password(password: str) -> str:
    """使用随机盐和高成本 scrypt 保存密码，数据库泄露后也不能直接读取明文。"""
    salt = secrets.token_bytes(16)
    digest = hashlib.scrypt(password.encode(), salt=salt, n=32768, r=8, p=1, maxmem=64 * 1024 * 1024)
    return f"scrypt${salt.hex()}${digest.hex()}"


def verify_password(password: str, stored: str) -> bool:
    """恒时比较密码摘要，错误账户也执行相同派生以减少登录枚举时差。"""
    try:
        algorithm, salt, expected = stored.split("$")
        if algorithm != "scrypt":
            return False
        actual = hashlib.scrypt(password.encode(), salt=bytes.fromhex(salt), n=32768, r=8, p=1, maxmem=64 * 1024 * 1024)
        return hmac.compare_digest(actual.hex(), expected)
    except (ValueError, TypeError):
        return False


def token_hash(token: str) -> str:
    """数据库仅保存会话令牌摘要，备份文件中的令牌不能直接用于登录。"""
    return hashlib.sha256(token.encode()).hexdigest()


def create_admin(settings: Settings, email: str | None, password: str, reset: bool = False) -> dict[str, str]:
    """只允许本地 CLI 创建或重置管理员，公开 API 不提供注册入口。"""
    if email is not None:
        email = email.strip().lower()
        if not re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]+", email) or len(email) > 254:
            raise ValueError("请输入有效邮箱")
    if not 12 <= len(password) <= 128:
        raise ValueError("管理员密码必须为 12 至 128 个字符")
    password_hash = hash_password(password)
    with connection(settings) as conn:
        # 固定账号只对应一条管理员记录，并发初始化时也不能创建第二条。
        conn.execute("BEGIN IMMEDIATE")
        if reset and email is None:
            admins = conn.execute("SELECT email FROM admins LIMIT 2").fetchall()
            if len(admins) != 1:
                raise ValueError("无法确定唯一管理员，请先初始化或使用 --email 指定原邮箱")
            email = admins[0]["email"]
        email = email or f"{ADMIN_ACCOUNT}@blog.local"
        existing = conn.execute("SELECT id FROM admins WHERE email=?", (email,)).fetchone()
        if existing:
            if not reset:
                raise ValueError("此管理员已存在；如需修改密码请使用 --reset-password")
            admin_id = existing["id"]
            conn.execute("UPDATE admins SET password_hash=? WHERE id=?", (password_hash, admin_id))
            conn.execute("DELETE FROM sessions WHERE admin_id=?", (admin_id,))
        else:
            if reset:
                raise ValueError("指定管理员不存在，无法重置密码")
            if conn.execute("SELECT 1 FROM admins LIMIT 1").fetchone():
                raise ValueError("系统已初始化管理员；请使用原邮箱和 --reset-password")
            admin_id = uuid4().hex
            conn.execute("INSERT INTO admins VALUES(?,?,?)", (admin_id, email, password_hash))
    return {"id": admin_id, "email": email}


def login(settings: Settings, email: str | None, password: str, client_ip: str, *, account: str | None = None) -> tuple[dict[str, str], str]:
    """持久化登录节流并签发随机会话，进程重启不能清空暴力尝试计数。"""
    now = int(time.time())
    identifier = account if account is not None else (email or "").strip().lower()
    with connection(settings) as conn:
        conn.execute("BEGIN IMMEDIATE")
        admins = conn.execute("SELECT id,email,password_hash FROM admins LIMIT 2").fetchall()
        if not admins:
            raise ApiException(503, "请先运行初始化命令创建管理员", "SETUP_REQUIRED")
        if account is not None:
            row = admins[0] if account == ADMIN_ACCOUNT and len(admins) == 1 else None
        else:
            row = conn.execute("SELECT id,email,password_hash FROM admins WHERE email=?", (identifier,)).fetchone()
        # 新账号和旧邮箱复用同一条管理员限速键，已有计数在升级后继续生效。
        rate_key = f"email:{row['email']}" if row is not None else f"{'account' if account is not None else 'email'}:{identifier}"
        keys = [token_hash(f"ip:{client_ip}"), token_hash(rate_key)]
        conn.execute("DELETE FROM login_attempts WHERE reset_at<=?", (now,))
        for key in keys:
            attempt = conn.execute("SELECT attempts FROM login_attempts WHERE key=?", (key,)).fetchone()
            if attempt and attempt[0] >= RATE_LIMIT:
                raise ApiException(429, "登录尝试过于频繁，请 15 分钟后再试", "RATE_LIMITED")
        for key in keys:
            conn.execute("INSERT INTO login_attempts VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET attempts=attempts+1", (key, now + RATE_WINDOW))
    fake_hash = f"scrypt${'00' * 16}${'00' * 64}"
    valid = verify_password(password, row["password_hash"] if row else fake_hash)
    if not valid or row is None:
        raise ApiException(401, "账号或密码不正确", "INVALID_CREDENTIALS")
    token = secrets.token_hex(32)
    with connection(settings) as conn:
        conn.execute("BEGIN IMMEDIATE")
        latest = conn.execute("SELECT password_hash FROM admins WHERE id=?", (row["id"],)).fetchone()
        # 派生密码期间可能发生重置；再次确认后再签发，避免旧密码绕过会话撤销。
        if latest is None or not hmac.compare_digest(latest[0], row["password_hash"]):
            raise ApiException(401, "登录凭据已更新，请重新登录", "INVALID_CREDENTIALS")
        conn.executemany("DELETE FROM login_attempts WHERE key=?", [(key,) for key in keys])
        conn.execute("DELETE FROM sessions WHERE expires_at<=?", (now,))
        conn.execute("INSERT INTO sessions VALUES(?,?,?)", (token_hash(token), row["id"], now + settings.session_days * 86400))
    return {"id": row["id"], "email": row["email"], "account": ADMIN_ACCOUNT}, token


def current_admin(settings: Settings, token: str | None) -> dict[str, str]:
    """每次后台读取都检查会话和期限，不能仅凭 Cookie 存在就放行。"""
    if not token or not re.fullmatch(r"[a-f0-9]{64}", token):
        raise ApiException(401, "请先登录管理后台", "UNAUTHORIZED")
    with connection(settings) as conn:
        row = conn.execute("SELECT admins.id,admins.email FROM sessions JOIN admins ON admins.id=sessions.admin_id WHERE token_hash=? AND expires_at>?", (token_hash(token), int(time.time()))).fetchone()
    if row is None:
        raise ApiException(401, "登录已过期，请重新登录", "UNAUTHORIZED")
    return {**dict(row), "account": ADMIN_ACCOUNT}


def require_admin(request: Request) -> dict[str, str]:
    """后台路由统一依赖认证，新增接口不必重复处理 Cookie 解析。"""
    return current_admin(request.app.state.settings, request.cookies.get(COOKIE_NAME))


def logout(settings: Settings, token: str | None) -> None:
    """注销时立即删除数据库会话，即使旧 Cookie 被复制也无法继续使用。"""
    if token:
        with connection(settings) as conn:
            conn.execute("DELETE FROM sessions WHERE token_hash=?", (token_hash(token),))


def change_password(settings: Settings, admin: dict[str, Any], current: str, new: str) -> None:
    """修改密码必须验证原密码，并撤销该账户全部会话以阻断旧设备继续访问。"""
    with connection(settings) as conn:
        row = conn.execute("SELECT password_hash FROM admins WHERE id=?", (admin["id"],)).fetchone()
    if row is None or not verify_password(current, row[0]):
        raise ApiException(401, "当前密码不正确", "INVALID_CREDENTIALS")
    digest = hash_password(new)
    with connection(settings) as conn:
        conn.execute("BEGIN IMMEDIATE")
        latest = conn.execute("SELECT password_hash FROM admins WHERE id=?", (admin["id"],)).fetchone()
        # 密码派生期间可能已由其他设备或 CLI 重置；锁定后复核，防止旧会话覆盖新凭据。
        if latest is None or not hmac.compare_digest(latest[0], row[0]):
            raise ApiException(401, "登录凭据已更新，请重新登录", "INVALID_CREDENTIALS")
        conn.execute("UPDATE admins SET password_hash=? WHERE id=?", (digest, admin["id"]))
        conn.execute("DELETE FROM sessions WHERE admin_id=?", (admin["id"],))
