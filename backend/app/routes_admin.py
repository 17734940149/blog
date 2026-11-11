from typing import Any

from fastapi import APIRouter, Depends, Request, UploadFile

from app import repository
from app.schemas import PostInput, ProjectInput, SiteSettings
from app.security import require_admin
from app.uploads import save_image

router = APIRouter(prefix="/api/admin", tags=["内容管理"], dependencies=[Depends(require_admin)])


@router.get("/stats")
def stats(request: Request) -> dict[str, Any]:
    """在统一认证路由下提供实际概览数据，未登录请求无法读取草稿统计。"""
    return {"data": repository.dashboard_stats(request.app.state.settings)}


@router.get("/posts")
def posts(request: Request) -> dict[str, Any]:
    """后台完整列表包含正文，支持文章管理和直接编辑现有草稿。"""
    return {"data": repository.list_admin_posts(request.app.state.settings)}


@router.post("/posts", status_code=201)
def create_post(payload: PostInput, request: Request) -> dict[str, Any]:
    """文章创建统一复用仓储保存规则，客户端不能指定内部 ID。"""
    return {"data": repository.save_post(request.app.state.settings, payload)}


@router.get("/posts/{post_id}")
def get_post(post_id: str, request: Request) -> dict[str, Any]:
    """编辑接口通过 ID 访问完整文章，公开 slug 路由仍保持发布隔离。"""
    return {"data": repository.get_admin_post(request.app.state.settings, post_id)}


@router.put("/posts/{post_id}")
def update_post(post_id: str, payload: PostInput, request: Request) -> dict[str, Any]:
    """完整替换可编辑字段，避免部分更新遗留旧发布状态。"""
    return {"data": repository.save_post(request.app.state.settings, payload, post_id)}


@router.delete("/posts/{post_id}")
def delete_post(post_id: str, request: Request) -> dict[str, Any]:
    """显式删除指定文章，数据库不存在时向管理页返回清楚的 404。"""
    repository.delete_record(request.app.state.settings, "posts", post_id)
    return {"data": {"ok": True}}


@router.get("/projects")
def projects(request: Request) -> dict[str, Any]:
    """项目管理与公开页面使用同一数据映射，减少保存后显示差异。"""
    return {"data": repository.list_projects(request.app.state.settings)}


@router.post("/projects", status_code=201)
def create_project(payload: ProjectInput, request: Request) -> dict[str, Any]:
    """创建项目保持外链可选，让尚未上线的项目也能被准确记录。"""
    return {"data": repository.save_project(request.app.state.settings, payload)}


@router.get("/projects/{project_id}")
def get_project(project_id: str, request: Request) -> dict[str, Any]:
    """项目编辑统一读取数据库当前状态，避免页面缓存覆盖新修改。"""
    return {"data": repository.get_project(request.app.state.settings, project_id)}


@router.put("/projects/{project_id}")
def update_project(project_id: str, payload: ProjectInput, request: Request) -> dict[str, Any]:
    """只保存校验后的完整项目输入，阻止任意字段写入。"""
    return {"data": repository.save_project(request.app.state.settings, payload, project_id)}


@router.delete("/projects/{project_id}")
def delete_project(project_id: str, request: Request) -> dict[str, Any]:
    """项目删除使用内部资源白名单，不能由外部参数选择任意数据表。"""
    repository.delete_record(request.app.state.settings, "projects", project_id)
    return {"data": {"ok": True}}


@router.get("/settings")
def settings(request: Request) -> dict[str, Any]:
    """后台配置与公开配置共用类型，让保存结果可直接预览。"""
    return {"data": repository.get_settings(request.app.state.settings)}


@router.put("/settings")
def update_settings(payload: SiteSettings, request: Request) -> dict[str, Any]:
    """站点设置单次原子保存，避免身份资料与关于页内容部分更新。"""
    return {"data": repository.save_settings(request.app.state.settings, payload)}


@router.post("/uploads", status_code=201)
def upload(request: Request, file: UploadFile) -> dict[str, Any]:
    """最多读取限制加一字节，分块代理请求也不能绕过图片大小限制。"""
    config = request.app.state.settings
    content = file.file.read(config.upload_limit + 1)
    try:
        url = save_image(config, content, file.content_type or "")
    finally:
        file.file.close()
    return {"data": {"url": url}}
