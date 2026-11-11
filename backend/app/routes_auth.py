from typing import Annotated, Any

from fastapi import APIRouter, Depends, Request, Response

from app import security
from app.schemas import LoginInput, PasswordInput

router = APIRouter(prefix="/api/auth", tags=["管理员认证"])
Admin = Annotated[dict[str, str], Depends(security.require_admin)]


@router.post("/login")
def login(payload: LoginInput, request: Request, response: Response) -> dict[str, Any]:
    """登录签发同域 HttpOnly 会话，密码和会话令牌都不暴露给 JavaScript。"""
    config = request.app.state.settings
    ip = request.client.host if request.client else "unknown"
    user, token = security.login(config, payload.email, payload.password, ip, account=payload.account)
    security.logout(config, request.cookies.get(security.COOKIE_NAME))
    response.set_cookie(security.COOKIE_NAME, token, max_age=config.session_days * 86400, httponly=True, secure=config.secure_cookie, samesite="strict", path="/")
    return {"data": user}


@router.get("/me")
def me(admin: Admin) -> dict[str, Any]:
    """通过真实会话确认登录状态，前端无需存储任何认证凭据。"""
    return {"data": admin}


@router.post("/logout")
def logout(request: Request, response: Response) -> dict[str, Any]:
    """清除服务端会话与浏览器 Cookie，使退出在当前请求后立即生效。"""
    config = request.app.state.settings
    security.logout(config, request.cookies.get(security.COOKIE_NAME))
    response.delete_cookie(security.COOKIE_NAME, httponly=True, secure=config.secure_cookie, samesite="strict", path="/")
    return {"data": {"ok": True}}


@router.put("/password")
def change_password(payload: PasswordInput, request: Request, response: Response, admin: Admin) -> dict[str, Any]:
    """密码更新撤销所有旧会话，修改完成后要求每台设备重新登录。"""
    config = request.app.state.settings
    security.change_password(config, admin, payload.currentPassword, payload.newPassword)
    response.delete_cookie(security.COOKIE_NAME, httponly=True, secure=config.secure_cookie, samesite="strict", path="/")
    return {"data": {"ok": True}}
