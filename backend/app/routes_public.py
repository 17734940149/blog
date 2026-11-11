from typing import Any

from fastapi import APIRouter, Query, Request
from fastapi.responses import FileResponse

from app import repository
from app.database import connection
from app.uploads import image_path
from app.localization import public_response

router = APIRouter(prefix="/api", tags=["公开内容"])


@router.get("/health")
def health(request: Request) -> dict[str, Any]:
    """健康检查真实读取数据库，便于容器判断依赖是否已经就绪。"""
    with connection(request.app.state.settings) as conn:
        conn.execute("SELECT version FROM schema_version").fetchone()
    return {"data": {"status": "ok", "database": "ok"}}


@router.get("/posts")
def posts(request: Request, query: str = Query(default="", max_length=120), q: str = Query(default="", max_length=120), category: str = Query(default="", max_length=60), tag: str = Query(default="", max_length=30), featured: bool | None = None, page: int = Query(default=1, ge=1, le=100_000), pageSize: int = Query(default=6, ge=1, le=100)) -> dict[str, Any]:
    """分页筛选始终交由公开仓储方法，所有组合都遵守相同可见性约束。"""
    config = request.app.state.settings
    language = request.headers.get("accept-language", "")
    data = repository.list_public_posts(config, query or q, category, tag, featured, page, pageSize)
    return public_response(data, "posts", language)


@router.get("/posts/{slug}")
def post_detail(slug: str, request: Request) -> dict[str, Any]:
    """文章详情通过稳定地址读取，未发布内容统一呈现不存在。"""
    config = request.app.state.settings
    return public_response(repository.get_public_post(config, slug), "post", request.headers.get("accept-language", ""))


@router.get("/categories")
def categories(request: Request) -> dict[str, Any]:
    """分类计数直接反映已发布内容，供首页和筛选导航共用。"""
    config = request.app.state.settings
    return public_response(repository.categories(config), "categories", request.headers.get("accept-language", ""))


@router.get("/projects")
def projects(request: Request) -> dict[str, Any]:
    """项目页读取真实项目数据，空外链由前端自然隐藏。"""
    config = request.app.state.settings
    return public_response(repository.list_projects(config), "projects", request.headers.get("accept-language", ""))


@router.get("/settings")
def settings(request: Request) -> dict[str, Any]:
    """只公开站点资料，管理员账户与运行配置不混入此接口。"""
    config = request.app.state.settings
    return public_response(repository.get_settings(config), "settings", request.headers.get("accept-language", ""))


@router.get("/uploads/{name}")
def uploaded_image(name: str, request: Request) -> FileResponse:
    """仅公开校验后的随机图片资源，使用不可变缓存减少重复传输。"""
    return FileResponse(image_path(request.app.state.settings, name), media_type="image/webp", headers={"Cache-Control": "public, max-age=31536000, immutable", "X-Content-Type-Options": "nosniff"})
