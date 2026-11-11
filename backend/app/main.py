import logging
import sqlite3
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import Any

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from app.config import Settings
from app.database import initialize
from app.errors import ApiException
from app.routes_admin import router as admin_router
from app.routes_auth import router as auth_router
from app.routes_public import router as public_router

logger = logging.getLogger("stacknote")


class BodyLimitMiddleware:
    """先限制传入字节数，再交给表单解析器，避免无 Content-Length 请求耗尽磁盘。"""

    def __init__(self, app: ASGIApp, maximum: int) -> None:
        """为上传保留少量 multipart 开销，同时为 JSON 接口设置统一硬上限。"""
        self.app = app
        self.maximum = maximum

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        """缓冲受限请求体后重放给应用，确保分块传输与普通上传有相同边界。"""
        if scope["type"] != "http" or scope["method"] not in {"POST", "PUT", "PATCH"}:
            await self.app(scope, receive, send)
            return
        body = bytearray()
        while True:
            message = await receive()
            if message["type"] == "http.disconnect":
                return
            body.extend(message.get("body", b""))
            if len(body) > self.maximum:
                response = JSONResponse({"error": "请求内容过大", "code": "PAYLOAD_TOO_LARGE"}, status_code=413)
                await response(scope, receive, send)
                return
            if not message.get("more_body", False):
                break
        delivered = False

        async def bounded_receive() -> Message:
            """仅重放一次已校验请求体，其余消息保留断连语义以兼容流式响应。"""
            nonlocal delivered
            if not delivered:
                delivered = True
                return {"type": "http.request", "body": bytes(body), "more_body": False}
            return await receive()

        await self.app(scope, bounded_receive, send)


def create_app(config: Settings | None = None) -> FastAPI:
    """应用工厂允许测试使用临时数据库，生产服务不会读取测试数据或测试账号。"""
    settings = config or Settings.from_env()

    @asynccontextmanager
    async def lifespan(application: FastAPI) -> AsyncIterator[None]:
        """在接收请求前完成迁移，避免首个访问触发数据库结构竞争。"""
        initialize(settings)
        yield

    application = FastAPI(title="栈间博客 API", version="1.0.0", lifespan=lifespan, docs_url=None if settings.production else "/api/docs", redoc_url=None, openapi_url=None if settings.production else "/api/openapi.json")
    application.state.settings = settings
    application.add_middleware(BodyLimitMiddleware, maximum=settings.upload_limit + 1024 * 1024)

    @application.middleware("http")
    async def secure_request(request: Request, call_next: Any) -> Any:
        """写请求必须来自配置域名，防止携带 Cookie 的跨站请求修改后台数据。"""
        if request.method in {"POST", "PUT", "PATCH", "DELETE"} and request.headers.get("origin") != settings.app_url:
            return JSONResponse({"error": "请求来源验证失败，请从本站重新操作", "code": "FORBIDDEN"}, status_code=403)
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        if not request.url.path.startswith("/api/uploads/"):
            response.headers["Cache-Control"] = "no-store"
        return response

    @application.exception_handler(ApiException)
    async def business_error(request: Request, error: ApiException) -> JSONResponse:
        """统一业务错误格式，客户端根据稳定代码选择提示与登录跳转。"""
        headers = {"Retry-After": "900"} if error.status == 429 else None
        return JSONResponse({"error": error.message, "code": error.code}, status_code=error.status, headers=headers)

    @application.exception_handler(RequestValidationError)
    async def validation_error(request: Request, error: RequestValidationError) -> JSONResponse:
        """拒绝不合法输入且不回显请求值，避免错误日志或响应泄露密码。"""
        return JSONResponse({"error": "提交内容不符合要求，请检查必填项、长度和格式", "code": "VALIDATION_ERROR"}, status_code=422)

    @application.exception_handler(sqlite3.IntegrityError)
    async def conflict_error(request: Request, error: sqlite3.IntegrityError) -> JSONResponse:
        """数据库唯一约束转为可操作提示，不向外暴露表名或 SQL。"""
        return JSONResponse({"error": "内容已存在，请检查文章地址是否重复", "code": "CONFLICT"}, status_code=409)

    @application.exception_handler(HTTPException)
    async def http_error(request: Request, error: HTTPException) -> JSONResponse:
        """框架产生的 404 等错误也遵循统一契约，避免客户端解析分支。"""
        return JSONResponse({"error": "请求的内容不存在" if error.status_code == 404 else "请求无法处理", "code": "NOT_FOUND" if error.status_code == 404 else "REQUEST_ERROR"}, status_code=error.status_code)

    @application.exception_handler(Exception)
    async def unexpected_error(request: Request, error: Exception) -> JSONResponse:
        """服务端记录异常供定位，对外保留通用错误以防泄露运行路径。"""
        logger.error("API 处理失败: %s", request.url.path, exc_info=error)
        return JSONResponse({"error": "服务暂时不可用，请稍后重试", "code": "INTERNAL_ERROR"}, status_code=500)

    application.include_router(public_router)
    application.include_router(auth_router)
    application.include_router(admin_router)
    return application


app = create_app()
