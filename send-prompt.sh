#!/usr/bin/env bash
# send-prompt.sh — 向 OpenClaw 发送 prompt（fire and forget）
#
# 用法:
#   ./send-prompt.sh "你好，帮我写一首诗"
#   ./send-prompt.sh --session agent:main:main "帮我写代码"
#   ./send-prompt.sh --port 4096 "hello"
#   ./send-prompt.sh --file /tmp/task.txt
#   ./send-prompt.sh --url http://192.168.1.10:4096 --token abc "hello"
#   echo "从stdin读取" | ./send-prompt.sh -
#
# 依赖: bash, curl, python3（均为系统内置，无需额外安装）
#
# 环境变量:
#   PROXY_URL    代理地址，默认读 server/.env 中 PROXY_PORT
#   PROXY_TOKEN  认证 token

set -euo pipefail

# ==================== 读取 server/.env ====================
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="$SCRIPT_DIR/server/.env"

load_env() {
  if [[ -f "$ENV_FILE" ]]; then
    while IFS='=' read -r key val; do
      [[ "$key" =~ ^[A-Z0-9_]+$ ]] || continue
      val="${val%\"}"; val="${val#\"}"; val="${val%\'}"; val="${val#\'}"
      eval "ENV_${key}='${val}'"
    done < <(grep -E '^[A-Z0-9_]+=' "$ENV_FILE")
  fi
}
load_env

# ==================== 默认配置 ====================
PROXY_PORT="${ENV_PROXY_PORT:-3210}"
URL="${PROXY_URL:-${ENV_PROXY_URL:-}}"
TOKEN="${PROXY_TOKEN:-${ENV_PROXY_TOKEN:-}}"
SESSION=""
FILE=""
VERBOSE=false
PROMPT=""

# ==================== 参数解析 ====================
usage() {
  cat <<EOF
用法: $(basename "$0") [选项] "<prompt>" | -

选项:
  --url <url>        代理地址 (默认: http://localhost:<port>)
  --port <port>      端口号 (默认: ${PROXY_PORT})
  --token <token>    认证 token
  --session <key>    指定 sessionKey (默认使用服务端 main session)
  --file <path>      从文件读取 prompt 内容
  --verbose / -v     显示调试信息
  -                  从 stdin 读取 prompt
  --help             显示帮助
EOF
  exit 0
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --url)     URL="$2";          shift 2 ;;
    --port)    PROXY_PORT="$2";   shift 2 ;;
    --token)   TOKEN="$2";        shift 2 ;;
    --session) SESSION="$2";      shift 2 ;;
    --file)    FILE="$2";         shift 2 ;;
    --verbose|-v) VERBOSE=true;   shift ;;
    --help|-h) usage ;;
    -) PROMPT="$(cat /dev/stdin)"; shift ;;
    --*) echo "未知选项: $1" >&2; exit 1 ;;
    *) PROMPT="${PROMPT:+${PROMPT}$'\n'}$1"; shift ;;
  esac
done

# --port 生效（--url 未指定时才用）
[[ -z "$URL" ]] && URL="http://localhost:${PROXY_PORT}"

dbg() { $VERBOSE && echo "[dbg] $*" >&2 || true; }

# ==================== 前置校验 ====================
# --file 优先
if [[ -n "$FILE" ]]; then
  [[ -f "$FILE" ]] || { echo "错误：文件不存在: $FILE" >&2; exit 1; }
  PROMPT="$(cat "$FILE")"
fi

# stdin 模式
if [[ -z "$PROMPT" && ! -t 0 ]]; then
  PROMPT="$(cat /dev/stdin)"
fi

if [[ -z "$PROMPT" ]]; then
  echo "错误：缺少 prompt。用法: $(basename "$0") \"你的问题\"" >&2
  exit 1
fi

if [[ -z "$TOKEN" ]]; then
  echo "错误：未设置 PROXY_TOKEN，请在 server/.env 中配置或用 --token 传入" >&2
  exit 1
fi

# ==================== 工具函数 ====================
json_post() {
  curl -sf -X POST "$1" \
    -H 'Content-Type: application/json' \
    --max-time 30 \
    -d "$2"
}

json_field() {
  python3 -c "
import sys, json
d = json.loads(sys.argv[1])
for k in sys.argv[2].split('.'):
    d = d[k]
print(d)
" "$1" "$2"
}

# ==================== 主流程 ====================

# 1. 建立会话
dbg "连接 $URL ..."
CONN=$(json_post "$URL/api/connect" "{\"token\":\"$TOKEN\"}") || {
  echo "连接失败：服务不可达 $URL" >&2; exit 1
}

if [[ "$(json_field "$CONN" "ok")" != "True" ]]; then
  echo "连接失败：$(json_field "$CONN" "error" 2>/dev/null || echo "未知错误")" >&2; exit 1
fi

SID=$(json_field "$CONN" "sid")
DEFAULT_SESSION=$(json_field "$CONN" "sessionKey")
SESSION_KEY="${SESSION:-$DEFAULT_SESSION}"
dbg "已连接 sid=$SID sessionKey=$SESSION_KEY"

# 断开会话（退出时清理）
trap 'json_post "$URL/api/disconnect" "{\"sid\":\"$SID\"}" >/dev/null 2>&1 || true' EXIT INT TERM

# 2. 发送 prompt
SEND_BODY=$(python3 -c "
import json, sys, uuid
print(json.dumps({
    'sid': sys.argv[1],
    'method': 'chat.send',
    'params': {
        'sessionKey': sys.argv[2],
        'message': sys.argv[3],
        'deliver': False,
        'idempotencyKey': str(uuid.uuid4()),
    }
}))
" "$SID" "$SESSION_KEY" "$PROMPT")

dbg "发送 prompt..."
SEND_RESP=$(json_post "$URL/api/send" "$SEND_BODY") || {
  echo "发送失败：请求出错" >&2; exit 1
}

if [[ "$(json_field "$SEND_RESP" "ok")" != "True" ]]; then
  echo "发送失败：$(json_field "$SEND_RESP" "error" 2>/dev/null || echo "未知错误")" >&2; exit 1
fi

echo "已发送"
dbg "chat.send ok，任务已提交，退出"
