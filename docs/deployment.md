# 部署与维护

## 运行结构

```text
访客 → Caddy（生产 HTTPS）→ Next.js web:3000 → FastAPI api:8000
                                                   └─ /app/data 命名卷
                                                      ├─ blog.db
                                                      └─ uploads/
```

Next.js 生产镜像使用 standalone 产物，已一并复制静态资源，遵循 [Next.js 官方部署说明](https://nextjs.org/docs/app/api-reference/config/next-config-js/output)。Python 服务使用单个 Uvicorn worker，数据库采用 SQLite；应用启动时执行已实现的结构迁移，初始化不会自动创建管理员。

应用、API 与 HTTPS 代理均以非 root 用户运行。Compose 设置健康检查、内存和 CPU 上限、日志轮转、只读根文件系统与停止宽限期。`/api/health` 同时验证 Python 服务与数据库就绪状态；Next.js 容器从该路由检查到后端的连接。

SQLite 适合此版本的单机博客。保持一个 API 实例，不要使用多 worker、多副本或共享网络文件系统。持久卷、异地备份和可恢复性演练应随站点一起维护。

## 配置

| 变量 | 用途 | 本地示例 |
| --- | --- | --- |
| `APP_URL` | 公开站点地址、同源检查、Cookie 安全标记和 SEO 链接 | `http://localhost:3000` |
| `API_INTERNAL_URL` | Next.js 服务端访问 Python 的内部地址 | `http://127.0.0.1:8000` |
| `DATA_DIR` | Python 数据库和图片所在目录 | `./data` |
| `ENVIRONMENT` | 开发或生产模式；Compose 固定为 `production` | `development` |
| `DEMO_SEED` | 首次空库是否填充示例文章与项目 | 本地 `true`，生产 `false` |
| `DOMAIN` | Caddy 管理的公开主机名 | `blog.example.com` |
| `ACME_EMAIL` | 证书联系邮箱 | 自己的邮箱 |
| `IMAGE_TAG` | 本次镜像版本；升级时使用新值 | `v1.0.0` |
| `DATA_VOLUME` | Docker 数据卷名；恢复时切换到新卷 | `stacknote-data` |

本地 Next.js 从根目录 `.env` 读取，Python 从 `backend/.env` 读取；进程已有的环境变量优先于文件。两个文件中的 `APP_URL` 应一致。本地从 `backend` 目录启动时，`DATA_DIR=./data` 指向 `backend/data`。Compose 不会打包或读取这两个配置文件来获取管理员密码，而是在启动时明确传入所需变量。

生产 `.env` 只包含部署配置，没有默认管理员密码。将文件权限限制为运维账户可读，例如在 Linux 执行 `chmod 600 .env`。不要将管理员密码长期保存在 `.env` 或命令历史中；优先使用交互式初始化。

若设置 `APP_URL=https://…`，管理员 Cookie 会标记为 Secure；访问 HTTP 地址时浏览器不会发送该 Cookie。登录后立即退出通常说明访问域名、协议或 `APP_URL` 不一致。

## Linux / macOS 本地开发

在项目根目录执行：

```bash
cp .env.example .env
cp .env.example backend/.env
npm ci
python3 -m venv backend/.venv
backend/.venv/bin/python -m pip install -r backend/requirements.txt
cd backend
.venv/bin/python -m app.cli setup
.venv/bin/python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

另开一个终端，在项目根目录运行 `npm run dev`。本地调试 API 可访问 `http://127.0.0.1:8000/api/health`，浏览器端页面使用 `http://localhost:3000`。首次试运行前，将 Python 与 Next.js 两边的 `APP_URL` 配成同一地址。

## 首次正式部署

1. 在服务器安装 Docker Engine 与 Compose 插件，使用 Linux 容器，确认 Docker 服务启动。固定版本的构建镜像已写入 Dockerfile。
2. 将完整源码与锁文件放在服务器，复制根 `.env.example` 为 `.env`。配置真实的 HTTPS `APP_URL`、`DOMAIN` 和 `ACME_EMAIL`，关闭 `DEMO_SEED`，给 `IMAGE_TAG` 设置一个唯一版本。
3. 将域名 A / AAAA 记录指向服务器；如果没有可用 IPv6，请不要保留错误的 AAAA 记录。让 80 / 443 TCP 可从公网到达，并允许容器访问证书服务。已有 Nginx / 宝塔占用端口时，应统一由已有代理终结 HTTPS，或调整占用关系。
4. 在项目根目录运行：

```bash
docker compose -f compose.yaml -f compose.production.yaml config --quiet
docker compose -f compose.yaml -f compose.production.yaml up -d --build --wait
docker compose exec api python -m app.cli setup
docker compose -f compose.yaml -f compose.production.yaml ps
```

`setup` 按提示创建管理员。它不会覆盖已有管理员；需要重置某个管理员密码时执行：

```bash
docker compose exec api python -m app.cli setup --reset-password
```

按提示输入原管理员邮箱与新密码。重置保留文章、项目与设置，同时撤销该管理员现有会话。初始化和重置都应从有服务器访问权限的终端执行。

生产代理读取 [Caddyfile](../Caddyfile)。Caddy 的证书与配置分别持久化到独立卷；不要随意删除，避免重复签发触发证书服务限制。证书申请条件、自动续期和 HTTP 跳转见 [Caddy 官方文档](https://caddyserver.com/docs/automatic-https)。

容器内部监听 8080 / 8443，再由 Compose 映射到公开的 80 / 443；这些内部端口不会出现在自动 HTTPS 跳转地址中，符合 [Caddy 端口选项说明](https://caddyserver.com/docs/caddyfile/options#https-port)。已用官方 Caddy 2.11.7 二进制核验当前文件能通过配置校验，并在关闭证书签发的本地副本中验证 HTTP 返回 308、保留路径和查询参数、跳转地址不包含 `:8443`。公网证书申请仍须在真实域名与服务器上验收。

## 上线验收

- `docker compose -f compose.yaml -f compose.production.yaml ps` 中 `api` 与 `web` 为 healthy，Caddy 正常运行。
- `https://你的域名/api/health` 返回成功，首页、文章、项目、关于与移动端导航均可访问。
- HTTP 自动跳转到 HTTPS，浏览器证书有效；`/feed.xml` 与 `/sitemap.xml` 中链接使用真实域名。
- `/admin` 不能在未登录时写入数据；使用自己创建的管理员登录，新建一篇草稿，确认公开列表不显示草稿；发布后能阅读，再撤下或删除测试文章。
- 上传一张封面图，确认浏览器正常显示；重启服务后，文章与图片仍存在。
- 创建一次备份并在新的数据卷上恢复，确认恢复后的管理员、文章和图片可用。

本地构建与测试无法替代这些服务器上的实际验收。仅在验收通过后将站点视为正式完成上线。

## 日常查看与重启

```bash
docker compose -f compose.yaml -f compose.production.yaml logs --tail=100 -f
docker compose -f compose.yaml -f compose.production.yaml restart
```

只需查看 API 时使用 `docker compose logs --tail=100 api`。日志按服务限制大小；不要通过开启调试模式将密码、Cookie 或上传内容写入日志。

基础配置只开放宿主机回环地址 `127.0.0.1:3000`。如果服务器已使用自己的 HTTPS 代理，可仅运行基础 Compose，将现有代理指向这个地址，同时仍将 `APP_URL` 配置为最终 HTTPS 域名。不需要向公网映射 8000 端口。

## 备份

数据库使用 SQLite WAL，运行时不要只复制 `blog.db`：已提交内容可能仍在 WAL 文件中。项目提供的 `backup` 命令使用 SQLite 在线备份接口生成一致快照，再把快照、`uploads/` 和 `manifest.json` 一起压缩为 ZIP。不要直接打包正在使用的整个数据库目录。

为了让数据库与图片处于同一业务时间点，备份时暂停对外写入。下面示例短暂停止前端，保留 API 进程执行备份；API 没有公开端口，后台页面也因此无法继续写入：

```bash
mkdir -p backups
docker compose -f compose.yaml -f compose.production.yaml stop web
docker compose exec api python -m app.cli backup --output /app/data/backups/pre-upgrade.zip
docker compose cp api:/app/data/backups/pre-upgrade.zip ./backups/pre-upgrade.zip
docker compose -f compose.yaml -f compose.production.yaml up -d --wait
```

为每次备份使用不同文件名，并确认命令成功后再进行升级。将 ZIP 复制到服务器外的独立存储，按所需保留周期轮换。仅在原服务器命名卷里留一份副本，不能防止服务器磁盘故障。备份包含管理员账户和会话数据，按敏感文件保护，不要放入仓库或公开目录。

本地非 Docker 环境从 `backend` 目录执行 `.venv/bin/python -m app.cli backup --output ./backups/manual.zip`；Windows 使用 `.venv/Scripts/python.exe`。

## 恢复到新数据卷

采用新的数据卷可保留旧站点数据，便于验证失败后切回。先确认备份文件由本站生成且来源可信，并将待恢复文件置于项目的 `backups/restore.zip`。

1. 停止站点，记录原 `DATA_VOLUME` 和 `IMAGE_TAG`：

```bash
docker compose -f compose.yaml -f compose.production.yaml down
```

2. 将 `.env` 中 `DATA_VOLUME` 改为一个尚未使用的新值，例如 `stacknote-restored-20261019`。保持 `DEMO_SEED=false`。此时不要启动 API。
3. 解压到新卷：

```bash
docker compose run --rm --no-deps -v "$PWD/backups:/restore:ro" api python -m zipfile -e /restore/restore.zip /app/data
docker compose -f compose.yaml -f compose.production.yaml up -d --wait
```

4. 检查健康接口、登录、文章和封面图片，确认数据完整后恢复流量。若发现问题，停止服务，将 `.env` 的 `DATA_VOLUME` 改回原卷名，再启动服务。全程无需删除旧卷。

恢复会重新启用备份时有效的会话；有安全事件时，恢复后为管理员重置密码，以撤销旧会话。

## 升级与回滚

1. 先完成上述备份，记录当前代码版本、`IMAGE_TAG` 与 `DATA_VOLUME`，保留旧镜像。
2. 更新源码和锁文件，将 `.env` 的 `IMAGE_TAG` 改为新版本。
3. 先运行本地或 CI 检查，再构建并启动：

```bash
docker compose -f compose.yaml -f compose.production.yaml build
docker compose -f compose.yaml -f compose.production.yaml up -d --no-build --wait
```

4. 完成上线验收。当前启动迁移是向前执行的；未来修改数据库结构时，需在变更说明中记录旧代码是否兼容新数据库。

若需回滚且数据库结构与旧代码兼容，将 `IMAGE_TAG` 改回原版本，并运行 `up -d --no-build --wait`。如果旧镜像已不在本地，先检出对应旧代码，再重新构建该版本。

若数据库也需要回滚，先停止服务，使用原版本镜像，并按“恢复到新数据卷”步骤恢复升级前的 ZIP；不要仅切换旧代码去访问不兼容的新结构。恢复会丢失备份时间之后的新写入，因此升级前的停写备份和验证窗口应尽量短。

不要执行 `docker compose down --volumes` 或清理被保留的旧数据卷，直到新版本验收和备份保留周期均满足要求。

## 排错

| 现象 | 处理 |
| --- | --- |
| Docker 连接失败 | 启动 Docker Engine / Docker Desktop，确认使用 Linux 容器 |
| 前端 503 / unhealthy | 检查 `api` 日志、Python 依赖和磁盘可写性；确认内部地址为 `http://api:8000` |
| HTTPS 证书失败 | 检查域名 A / AAAA、端口占用、防火墙、CDN 代理和出站网络；查看 Caddy 日志 |
| 后台登录失败或会话无法保存 | 检查浏览器地址与 `APP_URL` 的协议、主机和端口是否一致；重置密码后重新登录 |
| 数据库只读 | 命名卷由 UID / GID 1001 写入；若改为宿主机目录挂载，先正确设置目录所有者 |
| 数据库锁等待 | 确认仅一个 API worker；排除多个实例同时挂载同一卷及长时间手工事务 |
| 重启后内容消失 | 确认使用原 `DATA_VOLUME`、没有删除卷，且 Python 的 `DATA_DIR` 未改变 |

## 验证范围

提交前需要分别确认：前端类型检查、前端测试、生产构建、生产依赖检查、Python API 测试、两个 Compose 配置解析。Docker 守护进程可用时还需执行镜像构建、健康检查、初始化管理员、登录发布、上传及恢复演练。没有运行过的检查不应视为通过。

CI 配置会执行前端与 Python 检查，并在独立 Linux runner 上构建和启动容器，验证代理健康接口与数据卷重启持久化。它不包含真实域名证书申请，也不会替你部署到生产账户。
