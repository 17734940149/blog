# Stacknote 博客

一个兼顾个人名片、作品展示与写作的博客系统。首页先展示身份、能力、博客初衷，以及已上架和开发中的作品总览，再按统一的轻量列表展开项目和逐篇标注年月的文章标题；采用柔和雾蓝与灰紫、圆角分区和本地加载的 Noto Sans SC 可变字体，默认浅色并支持夜间主题。包含真实 Python 后端、数据库和管理后台，不包含相册与收藏。

## 已提供的能力

- 公开站点：首页、文章列表与详情、分类与标签筛选、关键词搜索、分页、项目展示、关于页面。
- 写作后台：管理员登录、文章草稿与发布、Markdown 编辑与预览、封面图片上传、分类与标签、精选文章、项目管理、站点资料设置，以及首页身份、头像、能力、博客初衷、GitHub 主页和公开邮箱编辑。
- 阅读体验：响应式布局、明暗主题、代码展示、文章目录、阅读时间、空态与错误页。
- 站点基础：服务端渲染、文章元数据、RSS、动态 Sitemap、robots.txt。
- 运行维护：SQLite 持久化、数据库初始化、独立管理员创建命令、备份命令、健康检查、Docker Compose、HTTPS 代理与 CI。
- 中英文界面切换；后台可分别填写个人资料、项目和文章的中英文内容，英文未填写的字段回退显示对应中文。

后端使用 Python / FastAPI，前端使用 Next.js / React / TypeScript。浏览器通过同域 `/api` 访问 Python 服务，生产环境无需向公网开放 Python 端口。

## 本地运行（Windows PowerShell）

安装 Node.js 22.22 或更新的受支持版本、Python 3.12 或更新版本。生产镜像固定使用 Node.js 24.22.0 和 Python 3.14.8。建议本机也使用这两个版本。

在项目根目录执行：

```powershell
Copy-Item .env.example .env
Copy-Item .env.example backend/.env
npm ci
python -m venv backend/.venv
backend/.venv/Scripts/python.exe -m pip install -r backend/requirements.txt
Set-Location backend
.venv/Scripts/python.exe -m app.cli setup
.venv/Scripts/python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

`setup` 会交互创建你自己的管理员，没有预设账号或默认密码。按命令提示设置邮箱和强密码；密码不会作为 Docker 镜像或源码的一部分保存。首次空库可生成原创示例文章和项目，正式使用前请将它们替换为自己的内容。如果需要全新空站，先将 `backend/.env` 中的 `DEMO_SEED` 改为 `false`，再执行初始化。

保持 Python 服务运行，打开第二个终端，在项目根目录执行：

```powershell
npm run dev
```

如果 Windows 启动 Python 服务时提示 `WinError 10013`，先检查端口是否被系统保留。本次工作区的本地预览使用 **18000** 端口，根目录 `.env.local` 已配置 `API_INTERNAL_URL=http://127.0.0.1:18000`；启动 Python 时使用下面的命令，并重新启动前端。Docker 内部端口不受此本机配置影响。

```powershell
# 在 backend 目录执行
.venv/Scripts/python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 18000
```

访问：

| 入口 | 地址 |
| --- | --- |
| 博客 | <http://localhost:3000> |
| 管理后台 | <http://localhost:3000/admin> |
| 前后端健康检查 | <http://localhost:3000/api/health> |
| RSS | <http://localhost:3000/feed.xml> |

已有锁文件时使用 `npm ci` 可重现依赖；开发中修改依赖后使用 `npm install` 并提交更新后的 `package-lock.json`。不要提交 `.env`、数据库、上传文件或管理员密码。

本地生产模式仍需保持 Python 服务运行，在前端根目录依次执行：

```powershell
npm run build
npm run start
```

Linux / macOS 操作、配置说明以及日常运维详见 [部署与维护说明](docs/deployment.md)。

在后台填写中文内容及可选的英文内容，访客点击 EN 后显示手动填写的英文；英文空白时，逐字段使用中文，列表项目也可分别回退。无需额外服务或模型。填写范围和展示规则见 [国际化说明](docs/internationalization.md)。

## Docker 快速运行

安装并启动 Docker Engine 或 Docker Desktop（Linux 容器模式），以及 Docker Compose v2 插件。在根目录复制配置：

```powershell
Copy-Item .env.example .env
```

本地预览可以保留 `APP_URL=http://localhost:3000`。将 `.env` 中 `DEMO_SEED` 设置为 `false` 可从空站开始，然后执行：

```powershell
docker compose up -d --build --wait
docker compose exec api python -m app.cli setup
```

访问 <http://localhost:3000> 和 <http://localhost:3000/admin>。默认只将前端绑定到本机 `127.0.0.1:3000`。中英文内容、数据库和上传图片持久化在 `stacknote-data` 命名卷中，Python 后端仅在容器网络内提供服务。

停止服务可执行 `docker compose down`；它会保留数据卷。`down --volumes` 会删除数据库与上传图片，正式站点不要执行。

## 使用域名正式上线

准备一台有持久磁盘的 Linux 服务器，建议至少 2 核 / 2 GB 内存。将域名解析到服务器，并开放 80 / 443 TCP；需要 HTTP/3 时开放 443 UDP。

将源码放到服务器后复制 `.env.example` 为 `.env`，修改：

```dotenv
APP_URL=https://blog.example.com
DOMAIN=blog.example.com
ACME_EMAIL=你的证书联系邮箱
DEMO_SEED=false
IMAGE_TAG=v1.0.0
DATA_VOLUME=stacknote-data
```

`APP_URL` 必须与浏览器实际访问地址完全对应。`DOMAIN` 仅填写主机名，不带协议和路径。之后运行：

```bash
docker compose -f compose.yaml -f compose.production.yaml config --quiet
docker compose -f compose.yaml -f compose.production.yaml up -d --build --wait
docker compose exec api python -m app.cli setup
```

Caddy 在域名解析与端口可达的情况下自动申请并续期 HTTPS 证书。到 `https://你的域名/admin` 登录，更新作者资料、站点信息，发布第一篇文章。完整的上线验收、代理排错、升级与恢复步骤见 [部署与维护说明](docs/deployment.md)。自动 HTTPS 的前置条件见 [Caddy 官方说明](https://caddyserver.com/docs/automatic-https)。

## 验证与持续集成

```powershell
npm run typecheck
npm test
npm run build
npm audit --omit=dev --audit-level=high
backend/.venv/Scripts/python.exe -m pip install -r backend/requirements-dev.txt
Set-Location backend
.venv/Scripts/python.exe -m pytest -q --basetemp=.pytest-tmp
```

GitHub Actions 分别检查前端类型、前端测试、生产依赖高危漏洞、前端构建、Python API 测试以及容器启动和数据卷持久化。CI 不会自动发布到任何服务器。

构建成功不等于域名、证书和服务器磁盘已经配置完成。首次上线请按文档完成真实环境验收；容器构建与运行的结果以你本机或 CI 的实际执行输出为准。

本次实际完成的检查及环境限制见 [验收记录](docs/verification.md)。

## 目录

```text
src/app/                 公开站点、管理后台和 API 同源代理
src/components/          公共界面组件
src/lang/                中英文语言包
src/lib/                 共享类型、格式化与服务端数据访问
backend/app/             FastAPI、业务服务、SQLite 与命令行工具
backend/tests/           Python API 测试
tests/                   前端测试
Dockerfile               Next.js standalone 生产镜像
backend/Dockerfile       Python API 生产镜像
compose.yaml             本机预览与基础服务配置
compose.production.yaml  域名 HTTPS 配置
docs/deployment.md       初始化、发布、备份、恢复和回滚
```

此版本面向单机、单实例个人博客。SQLite 数据库和上传目录需要持久磁盘；不要直接部署到不保证本地文件持久化的 Serverless 平台，也不要将同一 SQLite 数据卷挂载给多个 API 实例。后续确有多实例需求时，再迁移至 PostgreSQL 和对象存储。
