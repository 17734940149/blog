import argparse
import getpass
import json
import os
import sys
import tempfile
import zipfile
from dataclasses import replace
from pathlib import Path

from dotenv import set_key

from app.config import BACKEND_DIR, Settings
from app.database import backup_database, connection, initialize, utc_now
from app.security import ADMIN_ACCOUNT, create_admin


def setup(args: argparse.Namespace) -> None:
    """通过本机终端初始化账户，密码用隐藏输入或环境变量提供且不写入配置。"""
    config = Settings.from_env()
    if args.app_url:
        os.environ["APP_URL"] = args.app_url
        config = Settings.from_env()
    if args.no_demo:
        config = replace(config, demo_seed=False)
    email = args.email or os.getenv("ADMIN_EMAIL")
    password = os.getenv("ADMIN_PASSWORD")
    if password is None:
        password = getpass.getpass("管理员密码（12 至 128 个字符）：")
        confirmation = getpass.getpass("再次输入密码：")
        if password != confirmation:
            raise ValueError("两次输入的密码不一致")
    initialize(config)
    create_admin(config, email, password, reset=args.reset_password)
    if args.no_demo:
        # 显式选择空站后持久记录决定，下一次启动不能因默认开关恢复示例。
        with connection(config) as conn:
            conn.execute("INSERT OR IGNORE INTO metadata VALUES('demo_seeded','disabled_by_setup')")
    env_path = BACKEND_DIR / ".env"
    if not env_path.exists() and not config.production:
        env_path.write_text(f"APP_URL={config.app_url}\nDEMO_SEED={'true' if config.demo_seed else 'false'}\n# DATA_DIR 默认为 backend/data\n", encoding="utf-8")
    elif env_path.exists() and not config.production:
        if args.app_url:
            set_key(env_path, "APP_URL", config.app_url, quote_mode="never")
        if args.no_demo:
            set_key(env_path, "DEMO_SEED", "false", quote_mode="never")
    action = "密码已重置，旧登录已撤销" if args.reset_password else "管理员已创建"
    print(f"{action}：{ADMIN_ACCOUNT}\n数据目录：{config.data_dir}")
    print("请妥善保存密码。正式上线前将 APP_URL 配置为实际 HTTPS 域名。")


def backup(args: argparse.Namespace) -> None:
    """打包一致数据库快照与全部图片，恢复时只需解压到一个新的数据目录。"""
    config = replace(Settings.from_env(), demo_seed=False)
    initialize(config)
    output = Path(args.output).resolve()
    if output.exists():
        raise ValueError("备份目标已存在，请换一个文件名，避免覆盖历史备份")
    if output.suffix.lower() != ".zip":
        raise ValueError("备份输出必须为 .zip 文件")
    output.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="stacknote-backup-", dir=config.data_dir) as temporary:
        snapshot = Path(temporary) / "blog.db"
        backup_database(config, snapshot)
        with zipfile.ZipFile(output, mode="x", compression=zipfile.ZIP_DEFLATED) as archive:
            archive.write(snapshot, "blog.db")
            for image in sorted((config.data_dir / "uploads").glob("*.webp")):
                archive.write(image, f"uploads/{image.name}")
            archive.writestr("manifest.json", json.dumps({"format": 1, "createdAt": utc_now(), "application": "Stacknote", "restore": "Stop the API, extract blog.db and uploads into DATA_DIR, then start the API."}, indent=2))
    output.chmod(0o600)
    print(f"备份已生成：{output}\n包含管理员密码摘要与会话，请将文件保存在私有位置。")


def main() -> None:
    """保持命令入口集中，让本地与容器运行相同的初始化和备份流程。"""
    parser = argparse.ArgumentParser(description="栈间博客数据管理")
    commands = parser.add_subparsers(dest="command", required=True)
    setup_parser = commands.add_parser("setup", help="创建管理员或重置密码")
    setup_parser.add_argument("--email", help="兼容旧管理员记录的内部邮箱；也可设置 ADMIN_EMAIL")
    setup_parser.add_argument("--app-url", help="公开站点完整地址")
    setup_parser.add_argument("--no-demo", action="store_true", help="不插入演示内容")
    setup_parser.add_argument("--reset-password", action="store_true", help="重置现有管理员密码并撤销旧会话")
    setup_parser.set_defaults(handler=setup)
    backup_parser = commands.add_parser("backup", help="备份数据库与图片")
    backup_parser.add_argument("--output", required=True, help="新的 .zip 备份文件路径")
    backup_parser.set_defaults(handler=backup)
    args = parser.parse_args()
    try:
        args.handler(args)
    except (ValueError, OSError) as error:
        print(f"操作未完成：{error}", file=sys.stderr)
        raise SystemExit(1) from error


if __name__ == "__main__":
    main()
