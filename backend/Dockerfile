# 使用 Docker 内置解析器，避免构建前额外下载语法镜像。
FROM python:3.14.8-slim-bookworm AS dependencies
ENV PIP_DISABLE_PIP_VERSION_CHECK=1
WORKDIR /build
COPY backend/requirements.txt ./requirements.txt
RUN python -m pip wheel --no-cache-dir --wheel-dir=/wheels -r requirements.txt

FROM python:3.14.8-slim-bookworm AS runner
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    ENVIRONMENT=production \
    DATA_DIR=/app/data \
    DEMO_SEED=false
WORKDIR /app
COPY --from=dependencies /wheels /wheels
COPY backend/requirements.txt ./requirements.txt
RUN python -m pip install --no-cache-dir --no-index --find-links=/wheels -r requirements.txt \
    && rm -rf /wheels \
    && groupadd --gid 1001 app \
    && useradd --uid 1001 --gid app --no-create-home app \
    && mkdir -p /app/data \
    && chown app:app /app/data
COPY --chown=app:app backend/app ./app
USER app
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/api/health', timeout=3)"
# SQLite 使用单进程写入并持久化登录限速；给在途请求保留平滑结束时间。
CMD ["python", "-m", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1", "--timeout-graceful-shutdown", "25"]
