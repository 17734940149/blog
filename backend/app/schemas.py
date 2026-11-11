import re
from datetime import datetime, timezone
from typing import Literal
from urllib.parse import urlsplit

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


def safe_url(value: str, allow_upload: bool = False) -> str:
    """只接受可访问的 HTTP 地址或本站图片，阻止管理内容注入脚本协议。"""
    value = value.strip()
    if not value:
        return value
    if any(ord(char) < 32 for char in value) or "\\" in value:
        raise ValueError("地址包含非法字符")
    if allow_upload and re.fullmatch(r"/api/uploads/[a-f0-9]{32}\.(png|jpg|webp)", value):
        return value
    parsed = urlsplit(value)
    if parsed.scheme not in {"https", "http"} or not parsed.netloc or parsed.username or parsed.password:
        raise ValueError("请输入完整的 http 或 https 地址")
    return value


class InputModel(BaseModel):
    model_config = ConfigDict(extra="ignore")


class PostEnglish(InputModel):
    title: str = Field(default="", max_length=160)
    excerpt: str = Field(default="", max_length=500)
    content: str = Field(default="", max_length=200_000)
    category: str = Field(default="", max_length=60)
    tags: list[str] = Field(default_factory=list, max_length=12)

    @field_validator("tags")
    @classmethod
    def validate_tags(cls, values: list[str]) -> list[str]:
        """英文标签保持原顺序并允许空项，才能按中文索引逐项回退而不错配标签。"""
        if any(len(value) > 30 for value in values):
            raise ValueError("英文标签不能超过 30 个字符")
        return values


class ProjectEnglish(InputModel):
    title: str = Field(default="", max_length=120)
    description: str = Field(default="", max_length=1000)
    stack: list[str] = Field(default_factory=list, max_length=16)

    @field_validator("stack")
    @classmethod
    def validate_stack(cls, values: list[str]) -> list[str]:
        """技术栈保留空项及品牌文本，使英文展示能精确对应原有技术标签。"""
        if any(len(value) > 40 for value in values):
            raise ValueError("英文技术栈标签不能超过 40 个字符")
        return values


class SettingsEnglish(InputModel):
    title: str = Field(default="", max_length=80)
    tagline: str = Field(default="", max_length=160)
    description: str = Field(default="", max_length=500)
    author: str = Field(default="", max_length=80)
    bio: str = Field(default="", max_length=500)
    location: str = Field(default="", max_length=80)
    about: str = Field(default="", max_length=50_000)
    currently: str = Field(default="", max_length=500)
    role: str = Field(default="", max_length=160)
    skills: str = Field(default="", max_length=1500)
    purpose: str = Field(default="", max_length=1000)


class PostInput(InputModel):
    title: str = Field(min_length=1, max_length=160)
    slug: str = Field(min_length=1, max_length=180, pattern=r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
    excerpt: str = Field(default="", max_length=500)
    content: str = Field(default="", max_length=200_000)
    cover: str = Field(default="", max_length=2048)
    category: str = Field(default="开发笔记", min_length=1, max_length=60)
    tags: list[str] = Field(default_factory=list, max_length=12)
    status: Literal["draft", "published"] = "draft"
    featured: bool = False
    publishedAt: str | None = None
    en: PostEnglish = Field(default_factory=PostEnglish)

    @model_validator(mode="after")
    def validate_publish_content(self) -> "PostInput":
        """发布必须有正文，使编辑器和列表快捷发布遵守同一服务端约束。"""
        if self.status == "published" and not self.content.strip():
            raise ValueError("发布前请填写正文")
        return self

    @field_validator("title", "category")
    @classmethod
    def trim_required(cls, value: str) -> str:
        """拒绝空白标题和分类，防止发布后页面出现无法辨认的内容。"""
        if not value.strip():
            raise ValueError("内容不能为空")
        return value.strip()

    @field_validator("cover")
    @classmethod
    def check_cover(cls, value: str) -> str:
        """封面限制到安全图片路径，避免保存危险协议。"""
        return safe_url(value, allow_upload=True)

    @field_validator("tags")
    @classmethod
    def normalize_tags(cls, values: list[str]) -> list[str]:
        """去重并限制标签长度，使搜索和前台标签布局保持一致。"""
        if any(not value.strip() or len(value.strip()) > 30 for value in values):
            raise ValueError("标签需为 1 至 30 个字符")
        return list(dict.fromkeys(value.strip() for value in values))

    @field_validator("publishedAt")
    @classmethod
    def normalize_date(cls, value: str | None) -> str | None:
        """统一使用 UTC 时间排序，避免客户端时区影响预约发布与草稿隔离。"""
        if not value:
            return None
        date = datetime.fromisoformat(value.replace("Z", "+00:00"))
        if date.tzinfo is None:
            raise ValueError("发布时间必须包含时区")
        return date.astimezone(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


class ProjectInput(InputModel):
    title: str = Field(min_length=1, max_length=120)
    description: str = Field(default="", max_length=1000)
    url: str = Field(default="", max_length=2048)
    githubUrl: str = Field(default="", max_length=2048)
    stack: list[str] = Field(default_factory=list, max_length=16)
    status: Literal["building", "online", "archived"] = "building"
    cover: str = Field(default="", max_length=2048)
    en: ProjectEnglish = Field(default_factory=ProjectEnglish)

    @field_validator("url", "githubUrl")
    @classmethod
    def check_link(cls, value: str) -> str:
        """项目链接只允许网页协议，公开按钮不能成为脚本执行入口。"""
        return safe_url(value)

    @field_validator("cover")
    @classmethod
    def check_cover(cls, value: str) -> str:
        """复用封面规则以保证文章与项目的上传资源使用相同约束。"""
        return safe_url(value, allow_upload=True)

    @field_validator("title")
    @classmethod
    def trim_title(cls, value: str) -> str:
        """项目标题不能为空白，避免后台创建无法识别的记录。"""
        if not value.strip():
            raise ValueError("项目名称不能为空")
        return value.strip()

    @field_validator("stack")
    @classmethod
    def trim_stack(cls, values: list[str]) -> list[str]:
        """统一技术标签格式，避免无意义空标签或超长标签撑开页面。"""
        if any(not value.strip() or len(value.strip()) > 40 for value in values):
            raise ValueError("技术栈标签需为 1 至 40 个字符")
        return list(dict.fromkeys(value.strip() for value in values))


class SiteSettings(InputModel):
    title: str = Field(min_length=1, max_length=80)
    tagline: str = Field(default="", max_length=160)
    description: str = Field(default="", max_length=500)
    author: str = Field(min_length=1, max_length=80)
    bio: str = Field(default="", max_length=500)
    email: str = Field(default="", max_length=254)
    github: str = Field(default="", max_length=2048)
    location: str = Field(default="", max_length=80)
    about: str = Field(default="", max_length=50_000)
    currently: str = Field(default="", max_length=500)
    role: str = Field(default="", max_length=160)
    avatar: str = Field(default="", max_length=2048)
    gitlab: str = Field(default="", max_length=2048)
    skills: str = Field(default="", max_length=1500)
    purpose: str = Field(default="", max_length=1000)
    en: SettingsEnglish = Field(default_factory=SettingsEnglish)

    @field_validator("github", "gitlab")
    @classmethod
    def check_profile_link(cls, value: str) -> str:
        """对个人外链执行同样的协议限制，保持全站内容安全。"""
        return safe_url(value)

    @field_validator("avatar")
    @classmethod
    def check_avatar(cls, value: str) -> str:
        """头像复用已有图片地址白名单，允许本站上传图片且拒绝脚本与任意本地路径。"""
        return safe_url(value, allow_upload=True)

    @field_validator("title", "author")
    @classmethod
    def trim_required(cls, value: str) -> str:
        """站点身份必填，避免清空后影响所有页面与搜索摘要。"""
        if not value.strip():
            raise ValueError("内容不能为空")
        return value.strip()

    @field_validator("email")
    @classmethod
    def check_email(cls, value: str) -> str:
        """仅校验基础邮箱结构，避免 mailto 链接被注入额外参数。"""
        if value and not re.fullmatch(r"[^\s@?#&\r\n]+@[^\s@?#&\r\n]+\.[^\s@?#&\r\n]+", value):
            raise ValueError("邮箱格式不正确")
        return value.strip()


class LoginInput(InputModel):
    account: str | None = Field(default=None, min_length=1, max_length=64)
    email: str | None = Field(default=None, min_length=3, max_length=254)
    password: str = Field(min_length=1, max_length=128)

    @model_validator(mode="after")
    def check_identifier(self) -> "LoginInput":
        """有账号字段时必须提供值，避免空值意外回退到旧邮箱登录。"""
        if "account" in self.model_fields_set:
            if self.account is None:
                raise ValueError("账号不能为空")
        elif self.email is None:
            raise ValueError("请提供账号")
        return self


class PasswordInput(InputModel):
    currentPassword: str = Field(min_length=1, max_length=128)
    newPassword: str = Field(min_length=12, max_length=128)
