class ApiException(Exception):
    """携带明确业务码，避免将数据库和认证内部信息暴露给浏览器。"""

    def __init__(self, status: int, message: str, code: str) -> None:
        """保留展示文案与稳定错误码，让前端可以独立选择合适的提示。"""
        super().__init__(message)
        self.status = status
        self.message = message
        self.code = code
