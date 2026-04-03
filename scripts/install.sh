#!/bin/bash
set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

REPO_URL="https://github.com/user/ultrawork.git"
INSTALL_DIR="/opt/ultrawork"
VERSION="latest"

print_banner() {
  echo -e "${BLUE}"
  echo "╔══════════════════════════════════════════════════════════╗"
  echo "║                                                          ║"
  echo "║           UltraWork AI - 安装程序                        ║"
  echo "║           AI Agent 自动化平台                             ║"
  echo "║                                                          ║"
  echo "╚══════════════════════════════════════════════════════════╝"
  echo -e "${NC}"
}

log_info() {
  echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
  echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
  echo -e "${RED}[ERROR]${NC} $1"
}

check_root() {
  if [ "$EUID" -ne 0 ]; then
    log_error "请使用 sudo 运行此脚本"
    exit 1
  fi
}

check_os() {
  if [ -f /etc/os-release ]; then
    . /etc/os-release
    OS=$NAME
    VER=$VERSION_ID
  elif type lsb_release >/dev/null 2>&1; then
    OS=$(lsb_release -si)
    VER=$(lsb_release -sr)
  else
    OS=$(uname -s)
    VER=$(uname -r)
  fi

  log_info "检测到操作系统: $OS $VER"
}

install_dependencies() {
  log_info "安装依赖..."

  if command -v apt-get &> /dev/null; then
    apt-get update -qq
    apt-get install -y -qq curl git docker.io docker-compose
  elif command -v yum &> /dev/null; then
    yum install -y curl git docker docker-compose
  elif command -v brew &> /dev/null; then
    brew install git docker docker-compose
  else
    log_warn "无法自动安装依赖，请手动安装: git, docker, docker-compose"
  fi
}

install_node() {
  if command -v node &> /dev/null; then
    NODE_VERSION=$(node --version)
    log_info "Node.js 已安装: $NODE_VERSION"
  else
    log_info "安装 Node.js 20.x..."
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt-get install -y nodejs
  fi
}

install_pm2() {
  if command -v pm2 &> /dev/null; then
    log_info "PM2 已安装"
  else
    log_info "安装 PM2..."
    npm install -g pm2
  fi
}

setup_project() {
  log_info "下载项目..."

  if [ -d "$INSTALL_DIR" ]; then
    log_warn "目录已存在，更新中..."
    cd "$INSTALL_DIR"
    git pull origin main
  else
    git clone "$REPO_URL" "$INSTALL_DIR"
    cd "$INSTALL_DIR"
  fi

  log_info "安装依赖..."
  npm ci --production

  log_info "创建必要目录..."
  mkdir -p "$INSTALL_DIR/data"
  mkdir -p "$INSTALL_DIR/logs"
  mkdir -p "$INSTALL_DIR/screenshots"
}

setup_environment() {
  log_info "配置环境..."

  ENV_FILE="$INSTALL_DIR/.env"

  if [ ! -f "$ENV_FILE" ]; then
    cat > "$ENV_FILE" << EOF
# UltraWork AI 配置
NODE_ENV=production
PORT=3000
API_KEY=$(openssl rand -hex 32)
JWT_SECRET=$(openssl rand -hex 32)
REDIS_URL=redis://localhost:6379
OLLAMA_HOST=http://localhost:11434
ALLOWED_ORIGINS=http://localhost:3000
EOF
    chmod 600 "$ENV_FILE"
    log_info "已创建 .env 文件 (权限: 600)"
  else
    log_warn ".env 文件已存在，跳过"
  fi
}

start_services() {
  log_info "启动服务..."

  cd "$INSTALL_DIR"

  pm2 start ecosystem.config.js --env production
  pm2 save

  log_info "设置开机自启..."
  pm2 startup systemd -u $(whoami) --hp $(eval echo ~$(whoami)) || true

  log_info "服务已启动"
  pm2 status
}

verify_installation() {
  log_info "验证安装..."

  sleep 3

  RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/health || echo "000")

  if [ "$RESPONSE" = "200" ]; then
    log_info "✓ 安装成功！服务运行正常"
  else
    log_warn "服务返回状态码: $RESPONSE，请检查日志"
    pm2 logs ultrawork --lines 20
  fi
}

print_summary() {
  echo ""
  echo -e "${GREEN}╔══════════════════════════════════════════════════════════╗${NC}"
  echo -e "${GREEN}║                 安装完成！                                ║${NC}"
  echo -e "${GREEN}╚══════════════════════════════════════════════════════════╝${NC}"
  echo ""
  echo "  服务地址: http://localhost:3000"
  echo "  健康检查: http://localhost:3000/health"
  echo "  指标端点: http://localhost:3000/metrics"
  echo ""
  echo "  常用命令:"
  echo "    查看状态: pm2 status"
  echo "    查看日志: pm2 logs ultrawork"
  echo "    重启服务: pm2 restart ultrawork"
  echo "    停止服务: pm2 stop ultrawork"
  echo ""
  echo "  配置文件: $INSTALL_DIR/.env"
  echo "  请修改 .env 中的 API_KEY 和 JWT_SECRET"
  echo ""
  echo "  文档: $INSTALL_DIR/docs/OPERATIONS.md"
  echo ""
}

main() {
  print_banner
  check_root
  check_os
  install_dependencies
  install_node
  install_pm2
  setup_project
  setup_environment
  start_services
  verify_installation
  print_summary
}

main "$@"
