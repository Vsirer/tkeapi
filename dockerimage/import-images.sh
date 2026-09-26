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
