# 栈间从零部署与运维手册

适用于阿里云轻量应用服务器、Ubuntu 24.04 LTS、Docker Compose v2。以下步骤使用示例域名和目录。2026-11-04 上线时的真实配置、优化和安全验收列在文末。

访问链路为访客 → Caddy → Next.js → FastAPI → SQLite。前端预览绑定宿主机 `127.0.0.1:3000`，API 的 `8000` 留在容器网络。

## 1. 服务器、DNS 与备案

1. 创建 Ubuntu 24.04 LTS 实例，从阿里云轻量服务器控制台进入 **远程连接 → Workbench 一键连接**。本次实例位于上海，2 vCPU、2 GB 套餐内存、40 GB 盘。
2. 在域名的权威 DNS 控制台添加 `@ / A / 默认线路 / 服务器公网 IPv4`。本次在 DNSPod 将 `huxiaodong.cn` 指向 `106.14.201.105`。如另启用 `www`，也要为该名称配置解析、证书和跳转。AAAA 应指向真实可达的 IPv6。 [DNSPod 解析说明](https://cloud.tencent.com/document/product/302/3446/)
3. 在云防火墙核对 TCP 80、443，外部 SSH 使用 TCP 22，按运维来源管理。应用的 3000、8000 无需公网规则。 [阿里云防火墙](https://help.aliyun.com/zh/simple-application-server/user-guide/manage-the-firewall-of-a-server)
4. 中国内地服务器先完成 ICP 备案，再执行公网启动。审核期间可以准备镜像、恢复内容并内部预览。 [阿里云个人网站备案指南](https://help.aliyun.com/zh/icp-filing/basic-icp-service/getting-started/quick-start-for-icp-filing-for-personal-websites)

## 2. 在服务器安装 Docker

~~~bash
lsb_release -ds
uname -m
free -h
df -h /
swapon --show
sudo ss -lntp

sudo apt update
sudo apt install -y docker.io docker-compose-v2 docker-buildx ca-certificates curl
sudo systemctl enable --now docker
sudo docker version
sudo docker compose version
sudo docker buildx version
~~~

本次从 Ubuntu 软件仓库安装，后续用 `sudo docker`。 [Ubuntu 软件包](https://packages.ubuntu.com/search?keywords=docker&searchon=names&suite=noble)

磁盘空间充足、尚无活动 Swap 的小内存机器可以增加 2 GiB Swap。本次执行了这一步。已有活动 Swap 或同名文件时，下列命令会退出。

~~~bash
sudo bash <<'SWAP'
set -e
umask 077
swap_file=/swapfile-stacknote
if [[ -n "$(swapon --show=NAME --noheadings)" ]]; then
    echo '已启用 Swap'
    exit 0
fi
if [[ -e "$swap_file" || -L "$swap_file" ]]; then
    echo '交换文件路径已存在，请先核对。' >&2
    exit 1
fi
dd if=/dev/zero of="$swap_file" bs=1M count=2048 conv=excl status=progress
chmod 600 "$swap_file"
mkswap "$swap_file"
swapon "$swap_file"
if ! grep -Fq "$swap_file " /etc/fstab; then
    printf '%s none swap sw 0 0\n' "$swap_file" >> /etc/fstab
fi
swapon --show
SWAP
~~~

## 3. 本机打包与上传

在 **Windows PowerShell** 从项目根目录执行。已有当前源码包可以跳过打包。以下清单排除了本机环境文件、数据库和依赖目录。

~~~powershell
$stacknoteRoot = (Get-Location).Path
$stacknoteRelease = Join-Path $stacknoteRoot 'output\deployment\reusable'
New-Item -ItemType Directory -Force -Path $stacknoteRelease | Out-Null
$stacknoteSource = Join-Path $stacknoteRelease 'stacknote-source.tar.gz'
$stacknoteFiles = @(
    'compose.yaml', 'compose.production.yaml', 'Caddyfile', 'Dockerfile',
    '.dockerignore', '.env.example', 'package.json', 'package-lock.json',
    'next.config.ts', 'next-env.d.ts', 'tsconfig.json', 'src',
    'docs/Dockerfile.caddy', 'backend/Dockerfile', 'backend/requirements.txt', 'backend/app'
)
if (Test-Path -LiteralPath (Join-Path $stacknoteRoot 'public')) {
    $stacknoteFiles += 'public'
}
& tar.exe -czf $stacknoteSource --exclude='__pycache__' --exclude='*.pyc' -C $stacknoteRoot @stacknoteFiles
if ($LASTEXITCODE -ne 0) { throw '源码打包失败' }
Get-FileHash -Algorithm SHA256 -LiteralPath $stacknoteSource
~~~

如要迁移原有文章和图片，用第 7 节从运行中的容器导出数据 ZIP。若原站是本机开发环境，暂停内容修改，使用原 Python 环境导出。

~~~powershell
$stacknoteBackup = Join-Path $stacknoteRelease 'stacknote-data.zip'
Push-Location (Join-Path $stacknoteRoot 'backend')
try {
    & .\.venv\Scripts\python.exe -m app.cli backup --output $stacknoteBackup
    if ($LASTEXITCODE -ne 0) { throw '数据备份失败' }
} finally {
    Pop-Location
}
Get-FileHash -Algorithm SHA256 -LiteralPath $stacknoteBackup
~~~

Workbench 左侧 **文件管理 → home → admin → 上传文件**。把源码包和可选的数据 ZIP 放到 `/home/admin`，等上传完成。终端中的 `cd` 只切换终端目录，上传目标由文件管理面板选择。 [Workbench 上传指南](https://help.aliyun.com/zh/simple-application-server/user-guide/upload-and-download-files/)

~~~bash
cd /home/admin
ls -lh stacknote-source.tar.gz
sha256sum stacknote-source.tar.gz
# 如上传了备份，另核对 sha256sum stacknote-data.zip
# 旧的外层部署包解开后若包含 SHA256SUMS，可运行 sha256sum -c SHA256SUMS
~~~

与本机哈希一致后解压到新目录。当前服务器的实际路径见第 9 节。下列 `mkdir` 遇到已有目标目录会失败，避免覆盖旧发布。

~~~bash
(
    set -e
    stacknote_app=/home/admin/stacknote/app
    install -d -m 700 /home/admin/stacknote
    mkdir -m 700 "$stacknote_app"
    tar --no-same-owner -xzf /home/admin/stacknote-source.tar.gz -C "$stacknote_app"
    chmod 644 "$stacknote_app/Caddyfile"
)
~~~

本次首次发布时，Caddy 的 UID 1001 无法读取挂载的 `Caddyfile`，将该单个文件设为 `0644` 后通过。它在容器内仍是只读挂载。环境文件、数据 ZIP 保持私有权限。

## 4. 设置预览参数并构建

以下 Bash 示例使用同一 Workbench 终端。重新连接时，先回到项目目录并重新声明命令数组。给新部署选定新的标签和数据卷。

~~~bash
cd /home/admin/stacknote/app
umask 077
cat > .env <<'ENV'
APP_URL=http://localhost:3000
DEMO_SEED=false
IMAGE_TAG=v1
DATA_VOLUME=stacknote-data-v1
ENV
chmod 600 .env
preview=(sudo docker compose --env-file .env -f compose.yaml)
"${preview[@]}" config --quiet
~~~

默认使用 Dockerfile 原有基础镜像。若 Docker Hub 超时，可在服务器构建副本切换到 Docker 官方镜像的 ECR Public 路径。旧包首行若有 `# syntax=...`，下面也会移除它并使用内置解析器。这两类下载阻塞在本次部署中都遇到过。 [Docker 官方 ECR Public 说明](https://www.docker.com/blog/news-from-aws-reinvent-docker-official-images-on-amazon-ecr-public/)

~~~bash
sed -i -e '1{/^#[[:space:]]*syntax[[:space:]]*=/d;}' \
    -e 's@^FROM python:@FROM public.ecr.aws/docker/library/python:@' backend/Dockerfile
sed -i -e '1{/^#[[:space:]]*syntax[[:space:]]*=/d;}' \
    -e 's@^FROM node:@FROM public.ecr.aws/docker/library/node:@' Dockerfile
sed -i 's@^FROM caddy:@FROM public.ecr.aws/docker/library/caddy:@' docs/Dockerfile.caddy
sudo docker pull public.ecr.aws/docker/library/python:3.14.8-slim-bookworm
sudo docker pull public.ecr.aws/docker/library/node:24.22.0-bookworm-slim
sudo docker pull public.ecr.aws/docker/library/caddy:2.11.7-alpine
~~~

若 `pip wheel` 下载长时间无进展，可以用清华 PyPI HTTPS 镜像。本次用了这个办法，包版本保持锁定。 [清华 PyPI 镜像](https://mirrors.tuna.tsinghua.edu.cn/help/pypi/)

~~~bash
sed -i 's@python -m pip wheel --no-cache-dir@python -m pip wheel --index-url https://pypi.tuna.tsinghua.edu.cn/simple --no-cache-dir@' backend/Dockerfile
~~~

后端、前端依次构建，以减少峰值内存竞争。

~~~bash
"${preview[@]}" --progress plain build api &&
"${preview[@]}" --progress plain build web &&
sudo docker images
~~~

## 5. 初始化或迁移数据，启动内部预览

空站直接交互创建管理员。输入的密码不会回显。

~~~bash
"${preview[@]}" run --rm --no-deps --pull never api python -m app.cli setup --no-demo
~~~

迁移已有内容时，先确认 `.env` 指向一个新数据卷，并在 API 启动前执行恢复。ZIP 通过标准输入交给容器，文件权限保持 `0600`。大于 4 MiB 的临时缓存会写入数据卷，需留出解压空间。只恢复项目自身生成且已核对哈希的 ZIP。

~~~bash
chmod 600 /home/admin/stacknote-data.zip
"${preview[@]}" run --rm -T --no-deps --pull never api python -c '
import re, shutil, sqlite3, sys, tempfile, zipfile
from pathlib import Path

root = Path("/app/data")
if any(root.iterdir()):
    raise SystemExit("数据卷已有文件，停止恢复。")

with tempfile.SpooledTemporaryFile(max_size=4 * 1024 * 1024, dir=root) as data:
    shutil.copyfileobj(sys.stdin.buffer, data)
    data.seek(0)
    with zipfile.ZipFile(data) as archive:
        names = archive.namelist()
        allowed = r"(blog\.db|manifest\.json|uploads/[a-f0-9]{32}\.webp)"
        if "blog.db" not in names or any(not re.fullmatch(allowed, name) for name in names):
            raise SystemExit("备份目录结构不符合项目格式。")
        if archive.testzip() is not None:
            raise SystemExit("备份校验失败。")
        archive.extractall(root)

db = sqlite3.connect("file:/app/data/blog.db?mode=ro", uri=True)
try:
    if db.execute("PRAGMA integrity_check").fetchall() != [("ok",)]:
        raise SystemExit("数据库校验失败。")
    for table in ("posts", "projects", "admins"):
        print(table, db.execute("SELECT COUNT(*) FROM " + table).fetchone()[0])
finally:
    db.close()
' < /home/admin/stacknote-data.zip
~~~

备份含管理员时，用原邮箱重设密码，撤销旧会话。备份无管理员时用空站创建命令。

~~~bash
"${preview[@]}" run --rm --no-deps --pull never api python -m app.cli setup --reset-password
~~~

启动内部预览。健康接口应返回 `status=ok` 与 `database=ok`。

~~~bash
"${preview[@]}" up -d --no-build --pull never --wait --wait-timeout 180
"${preview[@]}" ps
curl -fsS http://127.0.0.1:3000/api/health
~~~

### 可选：从自己的电脑看内部预览

已有授权 SSH 密钥时直接转发。若要复用本次临时密钥做法，先在本机 PowerShell 创建专用密钥。公钥用于登记，私钥保存在电脑上。

~~~powershell
$stacknoteKey = Join-Path $env:USERPROFILE '.ssh\stacknote-preview'
New-Item -ItemType Directory -Force -Path (Split-Path $stacknoteKey) | Out-Null
ssh-keygen -t ed25519 -f $stacknoteKey -C stacknote-preview
Get-Content -LiteralPath "$stacknoteKey.pub"
~~~

在服务器 Workbench 的 `admin` 终端执行下列命令，按提示粘贴公钥。单独预览授权的有效期为 7 天，禁止执行服务器命令，TCP 转发限于回环 3000。相同公钥已登记时，检查现有记录后再决定是否换新密钥。这里的转发限制针对 TCP。 [OpenSSH 授权密钥选项](https://manpages.ubuntu.com/manpages/noble/man8/sshd.8.html)

~~~bash
(
    set -e
    umask 077
    install -d -m 700 /home/admin/.ssh
    touch /home/admin/.ssh/authorized_keys
    chmod 600 /home/admin/.ssh/authorized_keys
    read -r -p '粘贴 ssh-ed25519 公钥：' preview_public_key
    if [[ ! "$preview_public_key" =~ ^ssh-ed25519[[:space:]][A-Za-z0-9+/=]+([[:space:]].*)?$ ]]; then
        echo '公钥格式不符。' >&2
        exit 1
    fi
    read -r preview_key_type preview_key_body preview_key_comment <<< "$preview_public_key"
    if grep -Fq -- "$preview_key_body" /home/admin/.ssh/authorized_keys; then
        echo '该公钥已登记，请核对现有选项。' >&2
        exit 1
    fi
    preview_expiry=$(date -u -d '+7 days' +%Y%m%d%H%M%SZ)
    printf '\nrestrict,port-forwarding,permitopen="127.0.0.1:3000",permitlisten="127.0.0.1:3000",command="/bin/false",expiry-time="%s" %s\n' \
        "$preview_expiry" "$preview_public_key" >> /home/admin/.ssh/authorized_keys
    ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub
)
~~~

把示例 IP 换成服务器公网 IP，首次连接时将终端提示的服务器指纹与 Workbench 输出核对。保持下列 SSH 命令运行，在电脑上访问 `http://localhost:3000/`。后台访问地址应与预览 `APP_URL` 匹配。

~~~powershell
ssh -N -T -o HostKeyAlgorithms=ssh-ed25519 -o ExitOnForwardFailure=yes -L 127.0.0.1:3000:127.0.0.1:3000 -i "$env:USERPROFILE\.ssh\stacknote-preview" admin@203.0.113.10
~~~

本次 Windows 客户端还使用了 `-o KexAlgorithms=curve25519-sha256`。遇到密钥交换算法协商问题时，可以加入该选项后重试。

## 6. 配置并启动正式 HTTPS

确认备案已通过，域名解析指向服务器，TCP 80、443 可用。把下面的域名、证书邮箱、备案号换成实际值。首次部署沿用第 4 节的镜像标签和现有数据卷。证书邮箱是 ACME 联系信息，管理员密码仍由 CLI 交互设置。 [Caddy 自动 HTTPS](https://caddyserver.com/docs/automatic-https)

~~~bash
cd /home/admin/stacknote/app
umask 077
cat > .env.production <<'ENV'
APP_URL=https://blog.example.com
DOMAIN=blog.example.com
ACME_EMAIL=ops@example.com
ICP_FILING_NUMBER=替换为实际备案号
DEMO_SEED=false
IMAGE_TAG=v1
DATA_VOLUME=stacknote-data-v1
ENV
chmod 600 .env.production
chmod 644 Caddyfile

preview=(sudo docker compose --env-file .env -f compose.yaml)
prod=(sudo docker compose --env-file .env.production -f compose.yaml -f compose.production.yaml)
"${prod[@]}" config --quiet
getent ahostsv4 blog.example.com
sudo ss -lntp '( sport = :80 or sport = :443 )'

"${prod[@]}" --progress plain build caddy
"${prod[@]}" run --rm -T --no-deps --pull never --entrypoint /bin/sh caddy -ec \
    'test -w /data/caddy; test -w /config/caddy; caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile'
~~~

用以下命令确认现有 API 的数据卷。如果旧预览源码没有备案页脚，需要从当前源码重建 Web。本次给原 API 镜像加了新发布标签，另构建 Web 和 Caddy。首次部署用同一个标签构建三张镜像即可。

~~~bash
api_id=$("${preview[@]}" ps -q api)
sudo docker inspect --format \
    '{{range .Mounts}}{{if eq .Destination "/app/data"}}{{.Name}}{{end}}{{end}}' "$api_id"
~~~

对已有数据的实例，先按第 7 节备份，将其中的 `stack` 设置为 `preview` 命令数组。备份与切换期间暂停后台写入。确认数据卷、镜像和备份后，再启动正式服务。

~~~bash
"${prod[@]}" up -d --no-build --pull never --wait --wait-timeout 180
"${prod[@]}" ps
"${prod[@]}" logs --tail=40 caddy
~~~

容器启动和证书签发分开检查。下面在服务器上通过回环地址访问 Caddy，同时按实际域名验证证书。替换示例域名。

~~~bash
stacknote_domain=blog.example.com
curl -fsS --connect-timeout 5 --max-time 15 \
    --retry 12 --retry-all-errors --retry-delay 5 \
    --resolve "$stacknote_domain:443:127.0.0.1" \
    "https://$stacknote_domain/api/health"
~~~

再从公网用普通域名验收。以下是 Bash 命令，电脑或手机也可以打开相应页面。

~~~bash
curl -sS -D - -o /dev/null http://blog.example.com/
curl -fsS https://blog.example.com/api/health
curl -fsS https://blog.example.com/ | grep -o 'href="https://beian.miit.gov.cn/"[^<]*'
curl -sS -D - -o /dev/null https://blog.example.com/admin
curl -sS -D - -o /dev/null https://blog.example.com/api/admin/settings
~~~

应看到 HTTP 308 跳 HTTPS、健康接口正常、首页备案号链接、未登录后台跳转 307、管理 API 拒绝 401。管理员用正式 HTTPS 地址验证登录。应用启动失败可按第 8 节回滚，签发失败先检查 Caddy 日志、DNS 和端口。网站开通后 30 日内办理公安联网备案。 [阿里云备案后处理](https://help.aliyun.com/zh/icp-filing/basic-icp-service/user-guide/icp-filing-application-overview)

## 7. 导出备份与恢复演练

先选正在运行的 Compose 配置。正式环境用下例，预览备份把 `stack` 那一行改为 `stack=("${preview[@]}")`。短暂停止 Web，使数据库和图片能在同一业务时间点导出。子 shell 结束时尝试恢复 Web。

~~~bash
cd /home/admin/stacknote/app
stack=(sudo docker compose --env-file .env.production -f compose.yaml -f compose.production.yaml)
(
    set -euo pipefail
    umask 077
    backup_name="stacknote-$(date -u +%Y%m%dT%H%M%SZ).zip"
    container_path="/app/data/backups/$backup_name"
    backup_dir=/home/admin/stacknote-backups
    install -d -m 700 "$backup_dir"
    trap '"${stack[@]}" up -d --no-build --pull never --wait --wait-timeout 180 web || exit 1' EXIT
    "${stack[@]}" stop web
    "${stack[@]}" exec -T api python -m app.cli backup --output "$container_path"
    "${stack[@]}" exec -T api cat "$container_path" > "$backup_dir/$backup_name"
    python3 -c 'import sys,zipfile; sys.exit(zipfile.ZipFile(sys.argv[1]).testzip())' "$backup_dir/$backup_name"
    sha256sum "$backup_dir/$backup_name"
)
~~~

ZIP 包含 SQLite 一致快照、WebP 图片、清单、管理员密码摘要和会话记录。备份从私有目录下载到受保护的独立存储。迁移到新服务器时可将该 ZIP 以 `stacknote-data.zip` 上传到 `/home/admin`，核对哈希后按第 5 节导入空卷。运行中的 WAL 数据库通过项目备份命令导出。

恢复演练使用独立实例，或使用独立 Compose 项目、数据卷和空闲端口。导入后重设管理员密码，验证登录、文章与图片。ZIP 校验通过和实际恢复演练是两个检查点。

## 8. 更新、回滚与排障

### 日常更新

完成第 7 节备份，保留与旧镜像配套的 Compose、Caddyfile 和环境文件，再替换源码。下例在当前项目目录执行，给本次发布选择一个全新标签。保持原 `DATA_VOLUME`。

~~~bash
umask 077
stacknote_stamp=$(date -u +%Y%m%dT%H%M%SZ)
stacknote_rollback_env=".env.production.before-$stacknote_stamp"
cp -p .env.production "$stacknote_rollback_env"
stacknote_new_tag=v2
sed "s/^IMAGE_TAG=.*/IMAGE_TAG=$stacknote_new_tag/" .env.production > .env.production.next

next=(sudo docker compose --env-file .env.production.next -f compose.yaml -f compose.production.yaml)
"${next[@]}" config --quiet &&
"${next[@]}" --progress plain build api &&
"${next[@]}" --progress plain build web &&
"${next[@]}" --progress plain build caddy
~~~

构建全部成功后切换。公网验收通过后，将新环境文件设为日常使用的正式环境文件。保留上面的备份环境文件和原镜像。

~~~bash
"${next[@]}" up -d --no-build --pull never --wait --wait-timeout 180
"${next[@]}" ps
# 按第 6 节验证公网访问成功后执行
mv -- .env.production.next .env.production
~~~

### 两种回滚

**日常生产升级回退**：确认数据库结构与旧应用版本兼容，使用旧版 Compose、Caddyfile 和上面保留的正式环境文件。该文件仍使用原域名和数据卷。

~~~bash
previous=(sudo docker compose --env-file "$stacknote_rollback_env" -f compose.yaml -f compose.production.yaml)
"${previous[@]}" up -d --no-build --pull never --wait --wait-timeout 180
"${previous[@]}" ps
# 验收回退成功后，让日常运维继续使用旧版参数。
cp -p "$stacknote_rollback_env" .env.production
~~~

**首次公网切换退回内部预览**：使用最初的 `.env`，停止 Caddy 后启动预览。这会撤下公网入口。

~~~bash
"${prod[@]}" stop caddy
"${preview[@]}" up -d --no-build --pull never --wait --wait-timeout 180
curl -fsS http://127.0.0.1:3000/api/health
~~~

`docker compose down --volumes` 会删除关联卷。日常重启保留数据库及证书卷。修改环境文件后用 `up -d` 让相应容器读取新配置。

### 查看运行状态

~~~bash
"${prod[@]}" ps
"${prod[@]}" logs --tail=80 api web caddy
sudo docker stats --no-stream
free -h
df -h /
swapon --show
~~~

| 现象 | 检查办法 |
| --- | --- |
| `tar: No such file or directory` | 在 Workbench 文件树上传到 `/home/admin`，等待完成，用 `ls -lh` 确认文件存在。 |
| 拉取 `docker/dockerfile:1` 或基础镜像超时 | 移除旧 syntax 声明，按第 4 节切换 ECR Public。 |
| `pip wheel` 下载长时间无进展 | 检查构建日志，按第 4 节选用可达的 HTTPS PyPI 源。 |
| Caddy 读配置 `permission denied` | 对实际挂载的单个 `Caddyfile` 执行 `chmod 644 Caddyfile`，重跑校验。 |
| 证书暂未签发 | 核对公网 A/AAAA、TCP 80/443 及 Caddy 日志。历史 `publish` 脚本若在 HTTPS 验收处失败，代理仍可能在运行，先查日志再决定是否回滚。 |
| 后台登录后回到登录页 | 从正式 HTTPS 域名登录，核对前后端 `APP_URL` 和浏览器 Cookie。 |
| 升级后看不到原文章 | 核对 API 的 `/app/data` 挂载卷，保留原卷并按回滚或恢复流程处理。 |

## 9. 本次实际完成的配置

| 类别 | 已实施或已验收 |
| --- | --- |
| 主机与域名 | 上海轻量服务器，Ubuntu 24.04 LTS、Docker、Compose v2、Buildx。主域名指向公网 IP。2 GiB Swap 写入 `/etc/fstab`。 |
| 构建优化 | 依次构建 API、Web、Caddy，使用固定版本基础镜像、多阶段构建、Next.js standalone、`npm ci` 和锁定的 Python 依赖。ECR Public 解决镜像拉取，清华 PyPI 解决 Python 下载慢。正式上线复用原 API 镜像。 |
| 运行与存储 | API 使用单个 Uvicorn worker，SQLite 使用 WAL 与独立数据卷。API、Web 有健康检查，启动依赖为 API → Web → Caddy，容器退出后按重启策略恢复。 |
| 资源限制 | API/Web/Caddy 内存上限分别是 512/768/128 MiB，CPU 限额 1/1/0.5 核，进程上限各 100，JSON 日志轮转 10 MB × 3。这些是运行限制，构建阶段另有内存峰值。 |
| 网络与 HTTPS | 外网实测 Let's Encrypt 证书有效、HTTP 308 跳 HTTPS。3000 只绑定回环，8000 留在容器网络。Caddy 启用 HSTS、Gzip/Zstandard、12 MB 代理请求体上限，证书及代理配置各有持久卷。 |
| 容器安全 | 服务以 UID 1001 运行，根文件系统只读，移除 Linux 能力并开启 `no-new-privileges`。Caddy 管理接口关闭，`Caddyfile` 只读挂载。 |
| 账号与会话 | 公共页面移除了后台入口，后台页面和 API 验证真实会话。管理员由 CLI 创建，密码使用带随机盐的 scrypt，数据库只存会话令牌摘要。正式 Cookie 启用 `Secure`、`HttpOnly`、`SameSite=Strict`，有效期 7 天。写请求校验 `Origin`。 |
| 登录与上传 | 登录限速写入 SQLite，15 分钟窗口最多 5 次，按连接来源与邮箱分别限制。内部代理可能共享来源配额。图片限 5 MiB，验证真实格式、尺寸和帧数，重编码 WebP、随机命名。站点有 CSP、禁止嵌入和 MIME 嗅探等响应头。 |
| 预览接入 | SSH 隧道访问回环 3000，核对服务器指纹。另登记了带到期时间、禁止执行命令、限制 TCP 转发范围的专用预览密钥。 |
| 备份与迁移 | 源码与数据分包、SHA256 校验。恢复后重设管理员密码，撤销旧会话。切换前暂停 Web，生成并校验 SQLite 和图片 ZIP，沿用原数据卷并保留预览环境。 |
| 公网验收 | 首页显示 `晋ICP备2026017418号-1` 并链接工信部。首页、文章、项目、健康接口、登录页和未登录 307/401 都通过公网检查。证书准备阶段的 TLS 重试和外网偶发超时随后复测通过。 |

### 当前实例的路径和历史命令

- 项目目录 `/home/admin/stacknote-deploy-20261103/app`。预览配置为 `.env`，正式配置为 `.env.production`。
- 正式镜像标签 `production-20261104`，数据卷 `stacknote-data-20261103`。公网地址 [huxiaodong.cn](https://huxiaodong.cn/)。
- 历史发布脚本位于 `/home/admin/stacknote-launch-20261104/launch.sh`，包含 `prepare`、`publish`、`rollback`。它针对当时的域名、目录和预览镜像；`rollback` 恢复内部预览。上线备份 ZIP 位于同一发布目录，容器的数据卷也留有快照。
- 当前实例的正式运维可以直接从下面的命令开始。

~~~bash
cd /home/admin/stacknote-deploy-20261103/app
prod=(sudo docker compose --env-file .env.production -f compose.yaml -f compose.production.yaml)
"${prod[@]}" ps
~~~

### 尚未确认或尚未实施

- **运维保障**：定时异地备份、公网故障告警和独立生产恢复演练暂无完成记录。Caddy 已配置证书续期，实际续期周期尚未验收。
- **主机安全**：SSH 来源白名单、关闭密码登录、自动安全更新和云防火墙完整规则尚未核验。临时预览授权的安全范围见第 5 节。
- **HTTP/3**：公网响应曾宣告容器内部端口 `8443`，公网 HTTPS 入口为 `443`。标准 HTTPS 和跳转已验收，HTTP/3 仍待核对。
- **合规后续**：已展示 ICP 备案号，公安联网备案暂无完成记录。

项目通用架构与部署参考见 [部署与维护](deployment.md)。



