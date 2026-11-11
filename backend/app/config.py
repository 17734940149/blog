import os
from dataclasses import dataclass
from pathlib import Path
from urllib.parse import urlsplit

from dotenv import load_dotenv

BACKEND_DIR = Path(__file__).resolve().parents[1]
load_dotenv(BACKEND_DIR / ".env")


@dataclass(frozen=True)
class Settings:
    data_dir: Path
    app_url: str = "http://localhost:3000"
    production: bool = False
    demo_seed: bool = True
    session_days: int = 7
    upload_limit: int = 5 * 1024 * 1024

    @property
    def secure_cookie(self) -> bool:
        """根据公开站点协议设置 Cookie，避免反向代理的内部 HTTP 降低安全级别。"""
        return self.app_url.startswith("https://")

    @classmethod
    def from_env(cls) -> "Settings":
        """集中读取环境并验证公开域名，使错误部署在启动时即可发现。"""
        production = os.getenv("ENVIRONMENT", "development") == "production"
        url = os.getenv("APP_URL", "http://localhost:3000").rstrip("/")
        parsed = urlsplit(url)
        if parsed.scheme not in {"http", "https"} or not parsed.netloc or parsed.path or parsed.query or parsed.fragment or parsed.username:
            raise ValueError("APP_URL 必须是完整站点地址，例如 https://blog.example.com")
        if production and parsed.scheme != "https" and parsed.hostname not in {"localhost", "127.0.0.1"}:
            raise ValueError("生产环境 APP_URL 必须使用 HTTPS")
        return cls(
            data_dir=Path(os.getenv("DATA_DIR", str(BACKEND_DIR / "data"))).resolve(),
            app_url=url,
            production=production,
            demo_seed=os.getenv("DEMO_SEED", "false" if production else "true").lower() == "true",
        )
