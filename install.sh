#!/usr/bin/env bash
# ClawApp 一键部署脚本
# 用法: curl -fsSL https://raw.githubusercontent.com/qingchencloud/clawapp/main/install.sh | bash
# 或者: bash install.sh
set -e

# ========== 颜色 ==========
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

# ========== 工具函数 ==========
info()  { echo -e "${BLUE}[INFO]${NC} $1"; }
ok()    { echo -e "${GREEN}[✓]${NC} $1"; }
warn()  { echo -e "${YELLOW}[!]${NC} $1"; }
err()   { echo -e "${RED}[✗]${NC} $1"; }
ask()   { echo -en "${CYAN}[?]${NC} $1"; }

banner() {
  echo ""
  echo -e "${CYAN}╔══════════════════════════════════════╗${NC}"
  echo -e "${CYAN}║${NC}     🐾 ${GREEN}ClawApp 一键部署工具${NC}          ${CYAN}║${NC}"
  echo -e "${CYAN}║${NC}     OpenClaw AI 移动端客户端       ${CYAN}║${NC}"
  echo -e "${CYAN}╚══════════════════════════════════════╝${NC}"
  echo ""
}

# ========== 环境检测 ==========
INSTALL_DIR="${CLAWAPP_DIR:-$HOME/clawapp}"
OS="$(uname -s)"
ARCH="$(uname -m)"

detect_os() {
  case "$OS" in
    Darwin) OS_NAME="macOS" ;;
    Linux)  OS_NAME="Linux" ;;
    *)      err "不支持的操作系统: $OS"; exit 1 ;;
  esac
  info "系统: $OS_NAME ($ARCH)"
}

check_command() {
  command -v "$1" &>/dev/null
}

# ========== 检测 Node.js ==========
check_node() {
  if check_command node; then
    NODE_VER=$(node -v | sed 's/v//')
    NODE_MAJOR=$(echo "$NODE_VER" | cut -d. -f1)
    if [ "$NODE_MAJOR" -ge 18 ]; then
      ok "Node.js v$NODE_VER"
      return 0
    else
      warn "Node.js v$NODE_VER 版本过低，需要 18+"
      return 1
    fi
  else
    warn "未检测到 Node.js"
    return 1
  fi
}

install_node() {
  echo ""
  warn "ClawApp 需要 Node.js 18+ 才能运行"
  echo ""
  echo "  请选择安装方式:"
  echo ""
  echo "  1) 自动安装 (通过 nvm)"
  echo "  2) 我自己安装 (退出脚本)"
  echo ""
  ask "请选择 [1/2]: "
  read -r choice < /dev/tty
  echo ""

  case "$choice" in
    1)
      info "正在安装 nvm..."
      if ! check_command nvm; then
        curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
        export NVM_DIR="$HOME/.nvm"
        [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
      fi
      info "正在安装 Node.js 22..."
      nvm install 22
      nvm use 22
      ok "Node.js $(node -v) 安装完成"
      ;;
    *)
      echo ""
      info "请手动安装 Node.js 18+:"
      echo ""
      if [ "$OS_NAME" = "macOS" ]; then
        echo "  brew install node"
      else
        echo "  # Ubuntu/Debian"
        echo "  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -"
        echo "  sudo apt-get install -y nodejs"
        echo ""
        echo "  # 或使用 nvm"
        echo "  curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash"
        echo "  nvm install 22"
      fi
      echo ""
      exit 0
      ;;
  esac
}

# ========== 检测 Git ==========
check_git() {
  if check_command git; then
    ok "Git $(git --version | awk '{print $3}')"
    return 0
  else
    warn "未检测到 Git"
    return 1
  fi
}

install_git() {
  echo ""
  if [ "$OS_NAME" = "macOS" ]; then
    info "正在安装 Git (xcode-select)..."
    xcode-select --install 2>/dev/null || true
    warn "如果弹出安装窗口，请完成安装后重新运行此脚本"
    exit 0
  else
    info "正在安装 Git..."
    SUDO=""
    if [ "$(id -u)" -ne 0 ]; then SUDO="sudo"; fi
    if check_command apt-get; then
      $SUDO apt-get update -qq && $SUDO apt-get install -y -qq git
    elif check_command yum; then
      $SUDO yum install -y git
    elif check_command dnf; then
      $SUDO dnf install -y git
    elif check_command pacman; then
      $SUDO pacman -S --noconfirm git
    else
      err "无法自动安装 Git，请手动安装: https://git-scm.com/"
      exit 1
    fi
  fi
  if check_command git; then
    ok "Git 安装完成"
  else
    err "Git 安装失败，请手动安装后重新运行此脚本"
    exit 1
  fi
}

# ========== 检测 OpenClaw ==========
detect_openclaw() {
  GATEWAY_TOKEN=""
  GATEWAY_URL="ws://127.0.0.1:18789"

  # 尝试从配置文件读取 Token
  OPENCLAW_CONFIG="$HOME/.openclaw/openclaw.json"
  if [ -f "$OPENCLAW_CONFIG" ]; then
    ok "检测到本地 OpenClaw 安装"
    # 用 node 解析 JSON（比 python 更可靠，因为我们已经确认有 node）
    GATEWAY_TOKEN=$(node -e "
      try {
        const c = require('$OPENCLAW_CONFIG');
        if (c.gateway && c.gateway.auth && c.gateway.auth.token) {
          process.stdout.write(c.gateway.auth.token);
        }
      } catch(e) {}
    " 2>/dev/null || true)

    GATEWAY_PORT=$(node -e "
      try {
        const c = require('$OPENCLAW_CONFIG');
        if (c.gateway && c.gateway.port) {
          process.stdout.write(String(c.gateway.port));
        }
      } catch(e) {}
    " 2>/dev/null || true)

    if [ -n "$GATEWAY_PORT" ]; then
      GATEWAY_URL="ws://127.0.0.1:$GATEWAY_PORT"
    fi

    if [ -n "$GATEWAY_TOKEN" ]; then
      ok "已自动读取 Gateway Token"
    fi
  fi

  # 检测 Gateway 是否在运行
  if curl -s --connect-timeout 2 "http://127.0.0.1:${GATEWAY_PORT:-18789}" &>/dev/null; then
    ok "OpenClaw Gateway 正在运行 (端口 ${GATEWAY_PORT:-18789})"
    GATEWAY_RUNNING=true
  else
    warn "OpenClaw Gateway 未运行"
    GATEWAY_RUNNING=false
  fi
}

# ========== 安装 OpenClaw（可选）==========
offer_install_openclaw() {
  if [ "$GATEWAY_RUNNING" = true ]; then
    return 0
  fi

  if ! [ -f "$HOME/.openclaw/openclaw.json" ]; then
    echo ""
    warn "未检测到 OpenClaw，ClawApp 需要 OpenClaw Gateway 才能工作"
    echo ""
    echo "  1) 自动安装 OpenClaw (npm install -g openclaw)"
    echo "  2) 跳过，我稍后自己安装"
    echo ""
    ask "请选择 [1/2]: "
    read -r choice < /dev/tty
    echo ""

    if [ "$choice" = "1" ]; then
      info "正在安装 OpenClaw..."
      npm install -g openclaw
      ok "OpenClaw 安装完成，请运行 'openclaw' 启动后再使用 ClawApp"
    else
      warn "请确保 OpenClaw Gateway 运行后再使用 ClawApp"
      echo "  安装: npm install -g openclaw"
      echo "  启动: openclaw"
    fi
  fi
}

# ========== 克隆/更新仓库 ==========
setup_repo() {
  if [ -d "$INSTALL_DIR/.git" ]; then
    info "检测到已有安装，正在更新..."
    cd "$INSTALL_DIR"
    git pull --ff-only origin main 2>/dev/null || git pull origin main
    ok "代码已更新"
  else
    info "正在克隆 ClawApp..."
    git clone https://github.com/qingchencloud/clawapp.git "$INSTALL_DIR"
    cd "$INSTALL_DIR"
    ok "代码克隆完成"
  fi
}

# ========== 安装依赖 & 构建 ==========
build_app() {
  info "正在安装依赖..."
  npm install --silent 2>/dev/null || npm install
  cd h5 && npm install --silent 2>/dev/null || npm install
  cd ..
  ok "依赖安装完成"

  info "正在构建 H5 前端..."
  npm run build:h5
  ok "H5 构建完成"

  cd server
  npm install --silent 2>/dev/null || npm install
  cd ..
  ok "服务端依赖安装完成"
}

# ========== 配置 ==========
configure() {
  ENV_FILE="$INSTALL_DIR/server/.env"

  echo ""
  info "配置 ClawApp"
  echo ""

  # Proxy Token
  ask "设置客户端连接密码 (PROXY_TOKEN，直接回车生成随机密码): "
  read -r input_proxy_token < /dev/tty
  if [ -z "$input_proxy_token" ]; then
    PROXY_TOKEN=$(openssl rand -hex 16 2>/dev/null || node -e "process.stdout.write(require('crypto').randomBytes(16).toString('hex'))")
    info "已生成随机密码: $PROXY_TOKEN"
  else
    PROXY_TOKEN="$input_proxy_token"
  fi

  # Gateway Token
  if [ -n "$GATEWAY_TOKEN" ]; then
    ask "Gateway Token (已自动检测，直接回车使用，或输入新的): "
    read -r input_gw_token < /dev/tty
    if [ -n "$input_gw_token" ]; then
      GATEWAY_TOKEN="$input_gw_token"
    fi
  else
    ask "Gateway Token (在 ~/.openclaw/openclaw.json 中查找): "
    read -r GATEWAY_TOKEN < /dev/tty
    if [ -z "$GATEWAY_TOKEN" ]; then
      err "Gateway Token 不能为空"
      exit 1
    fi
  fi

  # Gateway URL
  ask "Gateway 地址 (直接回车使用 $GATEWAY_URL): "
  read -r input_gw_url < /dev/tty
  if [ -n "$input_gw_url" ]; then
    GATEWAY_URL="$input_gw_url"
  fi

  # 端口
  ask "服务端口 (直接回车使用 3210): "
  read -r input_port < /dev/tty
  PROXY_PORT="${input_port:-3210}"

  # 写入 .env
  cat > "$ENV_FILE" << EOF
PROXY_PORT=$PROXY_PORT
PROXY_TOKEN=$PROXY_TOKEN
OPENCLAW_GATEWAY_URL=$GATEWAY_URL
OPENCLAW_GATEWAY_TOKEN=$GATEWAY_TOKEN
EOF

  ok "配置已保存到 $ENV_FILE"
}

# ========== 启动 ==========
start_server() {
  echo ""
  echo "  启动方式:"
  echo ""
  echo "  1) 直接启动 (前台运行)"
  echo "  2) PM2 常驻运行 (推荐)"
  echo "  3) 不启动，稍后手动启动"
  echo ""
  ask "请选择 [1/2/3]: "
  read -r choice < /dev/tty
  echo ""

  case "$choice" in
    1)
      info "正在启动 ClawApp..."
      echo ""
      echo -e "  ${GREEN}按 Ctrl+C 停止服务${NC}"
      echo ""
      node server/index.js
      ;;
    2)
      if ! check_command pm2; then
        info "正在安装 PM2..."
        npm install -g pm2
      fi
      pm2 delete clawapp 2>/dev/null || true
      pm2 start server/index.js --name clawapp
      pm2 save
      ok "ClawApp 已通过 PM2 启动"
      echo ""
      echo "  常用命令:"
      echo "    pm2 logs clawapp    # 查看日志"
      echo "    pm2 restart clawapp # 重启"
      echo "    pm2 stop clawapp    # 停止"
      echo "    pm2 startup         # 开机自启"
      ;;
    *)
      info "稍后手动启动:"
      echo "    cd $INSTALL_DIR && node server/index.js"
      ;;
  esac
}

# ========== 完成提示 ==========
finish() {
  # 获取本机 IP
  if [ "$OS_NAME" = "macOS" ]; then
    LOCAL_IP=$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || echo "你的电脑IP")
  else
    LOCAL_IP=$(hostname -I 2>/dev/null | awk '{print $1}' || echo "你的电脑IP")
  fi

  echo ""
  echo -e "${GREEN}╔══════════════════════════════════════╗${NC}"
  echo -e "${GREEN}║${NC}     🎉 ${GREEN}ClawApp 部署完成！${NC}             ${GREEN}║${NC}"
  echo -e "${GREEN}╚══════════════════════════════════════╝${NC}"
  echo ""
  echo "  📂 安装目录: $INSTALL_DIR"
  echo "  🔑 连接密码: $PROXY_TOKEN"
  echo ""
  echo "  📱 手机访问: http://$LOCAL_IP:$PROXY_PORT"
  echo "  💻 本机访问: http://localhost:$PROXY_PORT"
  echo ""
  echo "  📖 文档: https://github.com/qingchencloud/clawapp"
  echo "  💬 社区: https://discord.com/invite/U9AttmsNHh"
  echo ""
}

# ========== 主流程 ==========
main() {
  banner
  detect_os

  echo ""
  info "检测环境..."
  echo ""

  # 检测 Git
  check_git || install_git

  # 检测 Node.js
  check_node || install_node

  # 检测 OpenClaw
  detect_openclaw

  # 可选安装 OpenClaw
  offer_install_openclaw

  echo ""
  info "安装目录: $INSTALL_DIR"
  ask "确认开始安装？[Y/n]: "
  read -r confirm < /dev/tty
  if [ "$confirm" = "n" ] || [ "$confirm" = "N" ]; then
    info "已取消"
    exit 0
  fi
  echo ""

  # 克隆/更新
  setup_repo

  # 安装 & 构建
  build_app

  # 配置
  configure

  # 完成提示
  finish

  # 启动
  start_server
}

main "$@"
