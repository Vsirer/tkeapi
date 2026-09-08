---
name: deploy-offline-release
description: TokensByte 开源与商业版通用「本机交叉编译 + 薄镜像打包 + 离线传输 + 服务器 Docker 零停机平滑更新」的标准部署 Skill 规范。支持自定义目标服务器 IP、SSH 凭据与部署路径。
---

# TokensByte 通用离线编译与服务器平滑部署 Skill 规范 (SOP)

本规范适用于在 Apple Silicon Mac (arm64) 或 Linux 开发机上，将 TokensByte (Rust + React/Vite) 服务编译并部署至任意 x86_64 Linux 生产服务器。

设计核心：**「本机增量交叉编译 + 薄镜像打包 + 离线断点续传 + 生产配置隔离」**，全过程不在服务器上跑 Rust/Node 编译，极大降低服务器 CPU/内存开销。

---

## 核心架构原则

1. **绝对禁止在服务器上运行 Rust 编译**：服务器内存资源受限，在容器内跑 Cargo 容易触发 OOM Kill。本地利用 `cargo-zigbuild` 快速交叉编译出 Linux x86_64 静态 ELF 二进制文件。
2. **生产 `.env` 配置文件隔离保护**：`rsync` 同步代码时必须指定 `--exclude ".env"`，防止本地开发测试配置（如数据库端口）覆盖线上生产环境配置。
3. **薄镜像与离线断点续传**：`backend/Dockerfile` 支持 `ARG USE_PREBUILT=1` 薄镜像构建。传输离线包 (~85MB) 必须使用 `rsync -avz --inplace -P`，自带校验且支持断点续传。

---

## 部署参数变量说明

在执行部署前，请确认或提示用户提供以下目标服务器参数：

| 变量名称 | 含义说明 | 示例值 |
| :--- | :--- | :--- |
| `<SERVER_IP>` | 目标服务器 IP 地址 | `1.2.3.4` |
| `<SSH_USER>` | SSH 登录用户名 | `root` |
| `<SSH_PORT>` | SSH 服务端口 | `22` |
| `<DEPLOY_DIR>` | 服务器上的部署根目录 | `/www/wwwroot/tokensbyte` |

---

## 通用 Standard Operating Procedure (SOP) 流程

### 步骤 1: 本机交叉编译后端二进制

在项目 `backend` 目录下执行交叉编译（确保已安装 `cargo-zigbuild`）：

```bash
cd ./backend
cargo zigbuild --release --target x86_64-unknown-linux-gnu --all-features
cp -f target/x86_64-unknown-linux-gnu/release/tokensbyte-server tokensbyte-server-bin
file tokensbyte-server-bin
```
> **提示**：必须附带 `--all-features` 参数，以激活 `Cargo.toml` 中 `openssl` 源码构建的 `vendored` 静态链接。

### 步骤 2: 本机构建前端与后端薄镜像

在项目根目录下，指定目标平台构建 Docker 镜像：

```bash
# 确保 Docker 命令在 PATH 中
export PATH=/Applications/Docker.app/Contents/Resources/bin:$PATH

# 构建前端镜像
docker build --platform linux/amd64 -t tokensbyte-ws-frontend:latest ./frontend

# 构建后端薄镜像（直接 COPY 步骤1编译好的二进制文件）
docker build --platform linux/amd64 --build-arg USE_PREBUILT=1 -t tokensbyte-ws-backend:latest ./backend
```

### 步骤 3: 导出离线压缩镜像包

根据当前项目名与统一时间戳后缀导出项目专属离线压缩包：

```bash
export PATH=/Applications/Docker.app/Contents/Resources/bin:$PATH
PROJECT_NAME=${PROJECT_NAME:-$(basename "$PWD")}
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

docker save ${PROJECT_NAME}-frontend:latest ${PROJECT_NAME}-backend:latest | gzip > /tmp/${PROJECT_NAME}-offline-${TIMESTAMP}.tar.gz
# 同步更新项目内 dockerimage 目录与软链接
mkdir -p ./dockerimage
cp -f /tmp/${PROJECT_NAME}-offline-${TIMESTAMP}.tar.gz ./dockerimage/${PROJECT_NAME}-offline-${TIMESTAMP}.tar.gz
(cd ./dockerimage && ln -sf "${PROJECT_NAME}-offline-${TIMESTAMP}.tar.gz" "${PROJECT_NAME}-offline.tar.gz" 2>/dev/null || true)
(cd ./dockerimage && ln -sf "${PROJECT_NAME}-offline-${TIMESTAMP}.tar.gz" "tokensbyte-offline.tar.gz" 2>/dev/null || true)
(cd /tmp && ln -sf "${PROJECT_NAME}-offline-${TIMESTAMP}.tar.gz" "${PROJECT_NAME}-offline.tar.gz" 2>/dev/null || true)

ls -lh /tmp/${PROJECT_NAME}-offline-${TIMESTAMP}.tar.gz ./dockerimage/${PROJECT_NAME}-offline-${TIMESTAMP}.tar.gz
```

### 4. 增量同步源码与上传离线安装包

> 提示：使用 `rsync` 传输，如需输入密码可结合 `expect` 或直接使用 SSH 密钥认证。

```bash
# 1) 同步项目代码与模版（务必 --exclude .env 保护生产配置）
rsync -avz -e "ssh -p <SSH_PORT> -o StrictHostKeyChecking=no" \
  --exclude ".git" \
  --exclude "target" \
  --exclude "node_modules" \
  --exclude ".env" \
  ./ <SSH_USER>@<SERVER_IP>:<DEPLOY_DIR>/

# 2) 传输离线安装包（使用 --inplace 和 -P 保证断点续传与校验，遵循项目名如 tkeapi-offline.tar.gz）
rsync -avz --inplace -P -e "ssh -p <SSH_PORT> -o StrictHostKeyChecking=no" \
  /tmp/${PROJECT_NAME:-tkeapi}-offline.tar.gz <SSH_USER>@<SERVER_IP>:<DEPLOY_DIR>/${PROJECT_NAME:-tkeapi}-offline.tar.gz
```

### 步骤 5: 服务器解压镜像与平滑重启服务

在目标服务器上执行容器载入与 Compose 服务重载：

```bash
ssh -p <SSH_PORT> -o StrictHostKeyChecking=no <SSH_USER>@<SERVER_IP> "
  cd <DEPLOY_DIR> && \
  docker load -i <DEPLOY_DIR>/${PROJECT_NAME:-tkeapi}-offline.tar.gz && \
  docker compose down && \
  docker compose up -d && \
  sleep 5 && \
  docker compose ps
"
```

### 步骤 6: Nginx 反向代理配置与健康检查

根据部署需求配置域名或 IP 访问反向代理：

#### IP 直连访问配置模版（`/etc/nginx/conf.d/default.conf` 或 Nginx 站点配置）:
```nginx
server {
    listen 80;
    server_name <SERVER_IP>;

    client_max_body_size 512m;

    location / {
        proxy_pass http://127.0.0.1:8080; # 或前端服务映射端口
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_connect_timeout 900s;
        proxy_send_timeout 900s;
        proxy_read_timeout 900s;
    }
}
```

#### 健康检查验证：
```bash
curl -I http://<SERVER_IP>/api/health
```

---

## 避坑与故障排查 (Troubleshooting)

| 异常现象 | 根因分析 | 解决方案 |
| :--- | :--- | :--- |
| `command not found: docker` | Mac 子 Shell 的 PATH 未包含 Docker 路径 | 显式添加 `export PATH=/Applications/Docker.app/Contents/Resources/bin:$PATH` |
| `Could not find openssl` | 交叉编译未启用 OpenSSL 源码静态构建 | `cargo zigbuild` 必须包含 `--all-features` 参数 |
| `Connection reset by peer` | SCP/Rsync 传输大文件被 SSH 中断 | 增加 `--inplace --bwlimit=5000` 限制速率，并使用 `rsync -P` |
| 线上数据库连不上 (`127.0.0.1:5433`) | `rsync` 覆盖了服务器端的 `.env` | 确认 `rsync` 命令包含 `--exclude ".env"` |
