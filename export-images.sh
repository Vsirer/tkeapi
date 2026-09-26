#!/bin/bash
# tkeapi (tokensbyte) opensource
# © 2026 tkeapi.com
# @copyright      Copyright netbcloud/wstianxia 
# @license        MIT (https://www.tkeapi.com/)


# TokensByte Docker 镜像导出脚本
# 在本地构建并导出镜像，用于上传到云服务器

if ! command -v docker >/dev/null 2>&1 || ! docker --version >/dev/null 2>&1; then
    if [ -d "/Applications/Docker.app/Contents/Resources/bin" ]; then
        export PATH="/Applications/Docker.app/Contents/Resources/bin:${PATH}"
    fi
fi

OUTPUT_DIR="${OUTPUT_DIR:-./dockerimage}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
PROJECT_NAME=${PROJECT_NAME:-$(basename "$PWD")}

echo "========================================="
echo "  TokensByte Docker 镜像导出脚本"
echo "========================================="
echo ""

if ! command -v docker >/dev/null 2>&1; then
    echo "❌ 错误: 未找到 Docker，请先安装 Docker"
    exit 1
fi

echo "✅ Docker 版本: $(docker --version)"
echo ""

# Mac：zigbuild → tokensbyte-server-bin → USE_PREBUILT=1（不抽公共文件）
export DOCKER_BUILDKIT=1 COMPOSE_DOCKER_CLI_BUILD=1 USE_PREBUILT=0
export ENABLE_CARGO_CACHE="${ENABLE_CARGO_CACHE:-1}"
if [ -z "${CARGO_BUILD_JOBS:-}" ]; then
    if [ "${EXPORT_FAST:-0}" = "1" ]; then export CARGO_BUILD_JOBS=2
    elif [ "$(uname -s)" = "Darwin" ]; then export CARGO_BUILD_JOBS=1
    else export CARGO_BUILD_JOBS=2; fi
fi
case "$(uname -m)" in arm64|aarch64) _host_arch=arm64 ;; x86_64|amd64) _host_arch=amd64 ;; *) _host_arch=unknown ;; esac
case "$(uname -s)" in
    Darwin)
        if [ -z "${DOCKER_DEFAULT_PLATFORM:-}" ]; then
            echo "🍎 Mac（${_host_arch}）：选目标架构（后端宿主机 zigbuild）"
            if [ "${_host_arch}" = "arm64" ]; then
                echo "   [1] linux/amd64  [2] linux/arm64（默认）"; read -r -p "请输入 [1/2] (默认 2): " _c; _c=${_c:-2}
            else
                echo "   [1] linux/amd64（默认）  [2] linux/arm64"; read -r -p "请输入 [1/2] (默认 1): " _c; _c=${_c:-1}
            fi
            [ "${_c}" = "2" ] && export DOCKER_DEFAULT_PLATFORM=linux/arm64 || export DOCKER_DEFAULT_PLATFORM=linux/amd64
        fi ;;
    MINGW*|MSYS*|CYGWIN*) export DOCKER_DEFAULT_PLATFORM="${DOCKER_DEFAULT_PLATFORM:-linux/amd64}" ;;
esac
case "${DOCKER_DEFAULT_PLATFORM:-}" in
    *amd64*) _target_arch=amd64; _zig_target=x86_64-unknown-linux-gnu ;;
    *arm64*|*aarch64*) _target_arch=arm64; _zig_target=aarch64-unknown-linux-gnu ;;
    "") _target_arch="${_host_arch}"; _zig_target="" ;;
    *) _target_arch=unknown; _zig_target="" ;;
esac
_prebuilt_ok() {
    [ -f tokensbyte-server-bin ] || return 1
    _info=$(file -b tokensbyte-server-bin 2>/dev/null) || return 1
    echo "$_info" | grep -q ELF || return 1
    case "${_target_arch}" in amd64) echo "$_info" | grep -Eq 'x86-64|x86_64' ;; arm64) echo "$_info" | grep -Eq 'aarch64|ARM aarch64' ;; *) return 1 ;; esac
}
# 架构 + HEAD + backend 工作区（含已刷新的 git_log）；编译后写入 stamp
_prebuilt_src_id() {
    { printf '%s\n' "${_target_arch}"; git rev-parse HEAD; git --no-pager diff HEAD -- backend; } | shasum -a 256 | awk '{print $1}'
}
_refresh_git_log() {
    _out=$(git log -10 --format='%H%x1F%h%x1F%an%x1F%cd%x1F%s' --date=format:'%Y-%m-%d %H:%M:%S %z' 2>/dev/null) || true
    [ -n "${_out}" ] && printf '%s\n' "${_out}" > backend/git_log.txt && echo "✅ 已刷新 backend/git_log.txt"
}
_do_zigbuild() {
    [ -z "${_zig_target}" ] && return 1
    if [ "${FORCE_ZIGBUILD:-0}" != "1" ] && _prebuilt_ok && [ -f tokensbyte-server-bin.stamp ] \
        && [ "$(_prebuilt_src_id)" = "$(cat tokensbyte-server-bin.stamp)" ]; then
        export USE_PREBUILT=1; echo "✅ 复用 tokensbyte-server-bin"; return 0
    fi
    [ "${SKIP_ZIGBUILD:-0}" = "1" ] && return 1
    [ "$(uname -s)" = "Darwin" ] || return 1
    command -v zig >/dev/null || { echo "❌ 缺 zig：brew install zig"; return 1; }
    command -v cargo >/dev/null || { echo "❌ 缺 cargo"; return 1; }
    [ -x "${CARGO_HOME:-$HOME/.cargo}/bin/cargo-zigbuild" ] || cargo zigbuild --help >/dev/null 2>&1 \
        || { echo "❌ 缺 cargo-zigbuild：cargo install cargo-zigbuild"; return 1; }
    case "$(pwd)" in /Volumes/*)
        if [ -z "${CARGO_TARGET_DIR:-}" ]; then
            export CARGO_TARGET_DIR="${HOME}/Library/Caches/tokensbyte-dev/zigbuild-${_zig_target}"
            mkdir -p "${CARGO_TARGET_DIR}"; echo "ℹ️  外置盘 → CARGO_TARGET_DIR=${CARGO_TARGET_DIR}"
        fi ;;
    esac
    echo "🚀 cargo zigbuild --target ${_zig_target} --features cross_compile"
    rustup target add "${_zig_target}" >/dev/null 2>&1 || true
    _n=$(sysctl -n hw.ncpu 2>/dev/null || echo 4); _zj=${_n}; [ "${_zj}" -gt 4 ] && _zj=4
    (cd backend && cargo zigbuild --release --target "${_zig_target}" --features cross_compile -j "${_zj}") || return 1
    _out="backend/target/${_zig_target}/release/tokensbyte-server"
    [ -n "${CARGO_TARGET_DIR:-}" ] && _out="${CARGO_TARGET_DIR}/${_zig_target}/release/tokensbyte-server"
    [ -f "${_out}" ] || { echo "❌ 未找到 ${_out}"; return 1; }
    cp -f "${_out}" tokensbyte-server-bin && chmod +x tokensbyte-server-bin
    _prebuilt_ok || return 1
    _prebuilt_src_id > tokensbyte-server-bin.stamp
    export USE_PREBUILT=1; echo "✅ tokensbyte-server-bin → USE_PREBUILT=1"
}
if [ "${SKIP_BUILD:-0}" != "1" ]; then
    _refresh_git_log
fi
if [ "$(uname -s)" = "Darwin" ] && [ "${SKIP_BUILD:-0}" != "1" ]; then
    if ! _do_zigbuild; then
        if [ "${ALLOW_DOCKER_CARGO:-0}" = "1" ]; then
            echo "⚠️  ALLOW_DOCKER_CARGO=1"; export USE_PREBUILT=0 CARGO_BUILD_JOBS=1
            [ "${_host_arch}" != "${_target_arch}" ] && export ENABLE_CARGO_CACHE=0
        else
            echo "❌ Mac 须 zigbuild（brew install zig && cargo install cargo-zigbuild）；调试：ALLOW_DOCKER_CARGO=1"; exit 1
        fi
    fi
elif _prebuilt_ok; then export USE_PREBUILT=1; echo "✅ 检测到 tokensbyte-server-bin"
elif [ "${_host_arch}" != "${_target_arch}" ] && [ "${_host_arch}" != "unknown" ] && [ "${_target_arch}" != "unknown" ]; then
    export ENABLE_CARGO_CACHE=0 CARGO_BUILD_JOBS=1; echo "⚠️  交叉 ${_host_arch}→${_target_arch}：JOBS=1"
fi
export USE_PREBUILT="${USE_PREBUILT:-0}"
echo "✅ 平台=${DOCKER_DEFAULT_PLATFORM:-宿主} JOBS=${CARGO_BUILD_JOBS} CACHE=${ENABLE_CARGO_CACHE} PREBUILT=${USE_PREBUILT}"

if [ -d "$OUTPUT_DIR" ]; then
    echo "🧹 清空 $OUTPUT_DIR 文件夹中的旧内容，确保产物全为最新..."
    rm -rf "$OUTPUT_DIR"/*
else
    mkdir -p "$OUTPUT_DIR"
fi

export PROJECT_NAME
if [ "${SKIP_BUILD:-0}" = "1" ]; then
    echo "⏭️  SKIP_BUILD=1：跳过构建，导出本地已有镜像"
else
    _ba=(--build-arg "USE_PREBUILT=${USE_PREBUILT}" --build-arg "CARGO_BUILD_JOBS=${CARGO_BUILD_JOBS}" --build-arg "ENABLE_CARGO_CACHE=${ENABLE_CARGO_CACHE}")
    if [ -d "frontend" ] && [ "${SKIP_FRONTEND_BUILD:-0}" != "1" ]; then
        echo "⚡ 正在在宿主机编译前端 (frontend/dist)..."
        (cd frontend && npm install --no-fund --no-audit && npm run build) || { echo "❌ 前端构建失败"; exit 1; }
    fi
    if [ "${USE_PREBUILT}" = "1" ]; then
        echo "📦 docker compose build frontend+backend..."
        docker compose build "${_ba[@]}" frontend backend || {
            if [ -z "${DOCKER_IMAGE_PREFIX}" ]; then
                echo "⚠️  直连 Docker Hub 失败，自动切换为国内镜像源 (docker.m.daocloud.io/)..."
                export DOCKER_IMAGE_PREFIX="docker.m.daocloud.io/"
                docker compose build "${_ba[@]}" frontend backend || { echo "❌ 构建失败"; exit 1; }
            else
                echo "❌ 构建失败"; exit 1;
            fi
        }
    else
        echo "📦 docker compose build frontend → backend..."
        docker compose build frontend || {
            if [ -z "${DOCKER_IMAGE_PREFIX}" ]; then
                echo "⚠️  直连 Docker Hub 失败，自动切换为国内镜像源 (docker.m.daocloud.io/)..."
                export DOCKER_IMAGE_PREFIX="docker.m.daocloud.io/"
                docker compose build frontend || { echo "❌ frontend 失败"; exit 1; }
            else
                echo "❌ frontend 失败"; exit 1;
            fi
        }
        docker compose build "${_ba[@]}" backend || { echo "❌ backend 失败"; exit 1; }
    fi
    echo ""; echo "✅ 镜像构建完成！"; echo ""
fi

# 获取镜像信息
echo "📋 镜像信息:"
docker compose images || docker images | grep tokensbyte || true

# 使用动态镜像名
BACKEND_IMAGE="${PROJECT_NAME}-backend:latest"
FRONTEND_IMAGE="${PROJECT_NAME}-frontend:latest"

# 验证镜像是否存在
if ! docker images -q "$BACKEND_IMAGE" | grep -q .; then
    echo "❌ 后端镜像未找到: $BACKEND_IMAGE"
    exit 1
fi
if ! docker images -q "$FRONTEND_IMAGE" | grep -q .; then
    echo "❌ 前端镜像未找到: $FRONTEND_IMAGE"
    exit 1
fi

echo ""

# 导出镜像
echo "📤 开始导出镜像..."
echo ""

# 导出后端镜像
BACKEND_FILE="$OUTPUT_DIR/${PROJECT_NAME}-backend-${TIMESTAMP}.tar"
echo "  → 导出后端镜像到: $BACKEND_FILE"
docker save -o "$BACKEND_FILE" "$BACKEND_IMAGE"
BACKEND_SIZE=$(du -h "$BACKEND_FILE" | cut -f1)
echo "    大小: $BACKEND_SIZE"

# 导出前端镜像
FRONTEND_FILE="$OUTPUT_DIR/${PROJECT_NAME}-frontend-${TIMESTAMP}.tar"
echo "  → 导出前端镜像到: $FRONTEND_FILE"
docker save -o "$FRONTEND_FILE" "$FRONTEND_IMAGE"
FRONTEND_SIZE=$(du -h "$FRONTEND_FILE" | cut -f1)
echo "    大小: $FRONTEND_SIZE"

echo "📋 正在同步 docker-compose.yml 与 .env 配置文件..."
if [ -f "docker-compose.yml" ]; then
    cp -f docker-compose.yml "$OUTPUT_DIR/docker-compose.yml"
    echo "  → 已复制 docker-compose.yml 到 $OUTPUT_DIR/"
fi
if [ -f ".env" ]; then
    cp -f .env "$OUTPUT_DIR/.env"
    echo "  → 已复制 .env 到 $OUTPUT_DIR/"
fi
if [ -f ".env.example" ]; then
    cp -f .env.example "$OUTPUT_DIR/.env.example"
    echo "  → 已复制 .env.example 到 $OUTPUT_DIR/"
fi

# 同步确保根目录下也始终保留一份最新备份
if [ -f "$OUTPUT_DIR/docker-compose.yml" ]; then
    cp -f "$OUTPUT_DIR/docker-compose.yml" ./docker-compose.yml
fi
if [ -f "$OUTPUT_DIR/.env" ]; then
    cp -f "$OUTPUT_DIR/.env" ./.env
fi

echo ""
echo "💡 提示: PostgreSQL 是官方镜像，服务器部署时会自动从 Docker Hub 拉取"

echo ""
echo "========================================="
echo "  导出完成！"
echo "========================================="
echo ""
echo "📁 导出文件列表:"
ls -lh "$OUTPUT_DIR"/*${TIMESTAMP}.tar
echo ""

# 计算总大小
TOTAL_SIZE=$(du -sh "$OUTPUT_DIR" | cut -f1)
echo "📊 总大小: $TOTAL_SIZE"
echo ""

# 生成导入脚本 (Linux/Mac)
cat > "$OUTPUT_DIR/import-images.sh" << 'EOF'
#!/bin/bash

# Docker 镜像导入脚本 (Linux/Mac)
# 在云服务器上运行此脚本导入镜像

set -e

# 项目名称配置：优先使用环境变量PROJECT_NAME，否则读取当前目录名
PROJECT_NAME=${PROJECT_NAME:-$(basename "$PWD")}

echo "========================================="
echo "  Docker 镜像导入脚本"
echo "========================================="
echo ""

# 检查 Docker 是否安装
if ! command -v docker &> /dev/null; then
    echo "❌ 错误: 未找到 Docker，请先安装 Docker"
    exit 1
fi

echo "✅ Docker 版本: $(docker --version)"
echo ""

# 查找所有 tar 文件
tar_files=$(ls *.tar 2>/dev/null || true)

if [ -z "$tar_files" ]; then
    echo "❌ 错误: 当前目录未找到 .tar 镜像文件"
    echo "   请将导出的镜像文件上传到此目录"
    exit 1
fi

echo "📥 开始导入镜像..."
echo ""

# 导入每个镜像文件
for tar_file in *.tar; do
    if [ -f "$tar_file" ]; then
        echo "  → 导入: $tar_file"
        docker load -i "$tar_file"
        echo ""
    fi
done

echo "✅ 所有镜像导入完成！"
echo ""
echo "💡 提示: PostgreSQL 镜像将在启动时自动从 Docker Hub 拉取"
echo ""

echo "========================================="
echo "  后续步骤"
echo "========================================="
echo ""
echo "1. 上传 docker-compose.yml 到服务器"
echo "2. 创建 .env 配置文件 (运行 deploy.sh 会自动引导配置)"
echo "3. 启动服务:"
echo "   docker compose up -d"
echo ""
echo "或者直接使用部署脚本:"
echo "   chmod +x deploy.sh"
echo "   ./deploy.sh"
echo ""
EOF

chmod +x "$OUTPUT_DIR/import-images.sh"
echo "✅ 已生成 Linux/Mac 导入脚本: $OUTPUT_DIR/import-images.sh"
echo ""

# 生成传输说明
cat > "$OUTPUT_DIR/UPLOAD-GUIDE.txt" << EOF
========================================
  TokensByte 镜像上传指南
========================================

📦 导出时间: $(date '+%Y-%m-%d %H:%M:%S')

📁 需要上传的文件:
$(ls -1 "$OUTPUT_DIR"/*${TIMESTAMP}.tar | xargs -n 1 basename)
- import-images.sh (导入脚本)
- docker-compose.yml (部署配置)
- .env.example (环境变量模板)

📊 总大小: $TOTAL_SIZE

========================================
  上传方法
========================================

方法一: 使用 scp (推荐)
----------------------
# 在本地终端执行 (不是在此目录)
scp $OUTPUT_DIR/*.tar your-user@your-server:/path/to/deploy/
scp $OUTPUT_DIR/import-images.sh your-user@your-server:/path/to/deploy/
scp docker-compose.yml your-user@your-server:/path/to/deploy/
scp .env.example your-user@your-server:/path/to/deploy/

示例:
scp docker-images/*.tar root@192.168.1.100:/opt/tokensbyte/
scp docker-images/import-images.sh root@192.168.1.100:/opt/tokensbyte/
scp docker-compose.yml root@192.168.1.100:/opt/tokensbyte/
scp .env.example root@192.168.1.100:/opt/tokensbyte/


方法二: 使用 rsync
----------------------
rsync -avz $OUTPUT_DIR/ your-user@your-server:/path/to/deploy/

示例:
rsync -avz docker-images/ root@192.168.1.100:/opt/tokensbyte/


方法三: 使用 SFTP
----------------------
sftp your-user@your-server
cd /path/to/deploy
put docker-images/*.tar
put docker-images/import-images.sh
put docker-compose.yml
put .env.example


方法四: 使用云存储 (大文件推荐)
----------------------
1. 压缩文件:
   cd docker-images
   tar -czf tokensbyte-images-${TIMESTAMP}.tar.gz *.tar import-images.sh

2. 上传到 OSS/S3/网盘

3. 在服务器下载并解压:
   wget <download-url>
   tar -xzf tokensbyte-images-${TIMESTAMP}.tar.gz

========================================
  服务器部署步骤
========================================

1. SSH 登录到服务器:
   ssh your-user@your-server

2. 进入部署目录:
   cd /path/to/deploy

3. 导入镜像:
   chmod +x import-images.sh
   ./import-images.sh

4. 创建环境变量文件:
   cp .env.example .env
   nano .env  # 编辑配置

5. 启动服务:
   docker compose up -d

6. 查看状态:
   docker compose ps
   docker compose logs -f

========================================
  使用外部数据库
========================================

如需使用外部 PostgreSQL (RDS/云数据库):
1. 修改 .env 中的 DATABASE_URL 指向外部数据库
   例: DATABASE_URL=postgres://user:pass@db.example.com:5432/tokensbyte
2. 注释掉 docker-compose.yml 中的 postgres 服务
3. 删除 backend 的 depends_on: postgres
4. 启动: docker compose up -d

========================================
  注意事项
========================================

⚠️  确保服务器已安装 Docker 和 Docker Compose
⚠️  生产环境必须修改 .env 中的默认密码
⚠️  建议配置防火墙仅开放 80/443 端口
⚠️  定期备份数据库数据卷

========================================

EOF

echo "✅ 已生成上传指南: $OUTPUT_DIR/UPLOAD-GUIDE.txt"
echo ""

echo "========================================="
echo "  总结"
echo "========================================="
echo ""
echo "📦 导出文件:"
echo "   目录: $OUTPUT_DIR/"
echo "   文件数: $(ls "$OUTPUT_DIR"/*${TIMESTAMP}.tar 2>/dev/null | wc -l) 个镜像"
echo "   总大小: $TOTAL_SIZE"
echo ""
echo "📤 下一步:"
echo "   1. 查看上传指南: cat $OUTPUT_DIR/UPLOAD-GUIDE.txt"
echo "   2. 上传文件到服务器 (参考 UPLOAD-GUIDE.txt)"
echo "   3. 在服务器运行: ./import-images.sh"
echo "   4. 启动服务: docker compose up -d"
echo ""
echo "💡 提示: 可以使用压缩减小传输体积"
echo "   cd $OUTPUT_DIR"
echo "   tar -czf tokensbyte-images.tar.gz *.tar"
echo ""
