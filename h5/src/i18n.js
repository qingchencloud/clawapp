/**
 * 国际化模块 - 中英文切换
 */

const LANG_KEY = 'openclaw-lang'

const messages = {
  'zh-CN': {
    // 连接页
    'app.title': 'OpenClaw Mobile',
    'app.subtitle': '连接到你的 OpenClaw 智能体',
    'setup.host': '服务器地址',
    'setup.host.placeholder': '例如: 192.168.1.100:3210',
    'setup.token': 'Token',
    'setup.token.placeholder': '输入访问令牌',
    'setup.connect': '连接',
    'setup.connecting': '连接中...',
    'setup.error.host': '请输入服务器地址',
    'setup.error.token': '请输入 Token',
    'setup.error.timeout': '连接超时，请检查地址和网络',
    // 聊天页
    'chat.input.placeholder': '输入消息...',
    'chat.send': '发送',
    'chat.abort': '停止',
    'chat.no.messages': '暂无消息',
    'chat.load.error': '加载历史失败',
    'chat.send.error': '发送失败',
    'chat.reconnecting': '连接中断，正在重连...',
    'chat.aborted': '已中止',
    // 会话管理
    'session.title': '会话管理',
    'session.new': '新建会话',
    'session.new.name': '会话名称',
    'session.new.name.placeholder': '例如: debug、research',
    'session.new.hint': '会话 Key 格式: agent:main:<名称>',
    'session.new.create': '创建',
    'session.delete': '删除会话',
    'session.delete.confirm': '确定删除「{name}」？',
    'session.delete.warning': '此操作不可撤销。',
    'session.delete.btn': '删除',
    'session.delete.fail': '删除失败',
    'session.created': '已创建新会话: {name}',
    'session.loading': '加载中...',
    'session.empty': '没有找到会话',
    'session.load.error': '加载失败',
    'session.main': '主会话',
    // 快捷指令
    'cmd.title': '快捷指令',
    'cmd.model': '模型管理',
    'cmd.session': '会话管理',
    'cmd.think': '思考控制',
    'cmd.info': '信息查询',
    'cmd.skill': '技能',
    'cmd.advanced': '高级',
    // 工具状态
    'tool.running': '执行中...',
    'tool.done': '已完成',
    'tool.error': '失败',
    // 时间
    'time.just': '刚刚',
    'time.min': '{n}分钟前',
    'time.hour': '{n}小时前',
    'time.day': '{n}天前',
    // 设置
    'settings.title': '设置',
    'settings.theme': '主题',
    'settings.theme.light': '浅色',
    'settings.theme.dark': '深色',
    'settings.theme.auto': '跟随系统',
    'settings.lang': '语言',
    'settings.disconnect': '断开连接',
    // 通用
    'cancel': '取消',
    'confirm': '确认',
    'copy': '复制',
    'copied': '已复制',
    'copy.fail': '失败',
  },
  'en': {
    'app.title': 'OpenClaw Mobile',
    'app.subtitle': 'Connect to your OpenClaw agent',
    'setup.host': 'Server Address',
    'setup.host.placeholder': 'e.g. 192.168.1.100:3210',
    'setup.token': 'Token',
    'setup.token.placeholder': 'Enter access token',
    'setup.connect': 'Connect',
    'setup.connecting': 'Connecting...',
    'setup.error.host': 'Please enter server address',
    'setup.error.token': 'Please enter token',
    'setup.error.timeout': 'Connection timeout, check address and network',
    'chat.input.placeholder': 'Type a message...',
    'chat.send': 'Send',
    'chat.abort': 'Stop',
    'chat.no.messages': 'No messages yet',
    'chat.load.error': 'Failed to load history',
    'chat.send.error': 'Send failed',
    'chat.reconnecting': 'Disconnected, reconnecting...',
    'chat.aborted': 'Aborted',
    'session.title': 'Sessions',
    'session.new': 'New Session',
    'session.new.name': 'Session Name',
    'session.new.name.placeholder': 'e.g. debug, research',
    'session.new.hint': 'Session key format: agent:main:<name>',
    'session.new.create': 'Create',
    'session.delete': 'Delete Session',
    'session.delete.confirm': 'Delete "{name}"?',
    'session.delete.warning': 'This cannot be undone.',
    'session.delete.btn': 'Delete',
    'session.delete.fail': 'Delete failed',
    'session.created': 'Created new session: {name}',
    'session.loading': 'Loading...',
    'session.empty': 'No sessions found',
    'session.load.error': 'Load failed',
    'session.main': 'Main Session',
    'cmd.title': 'Commands',
    'cmd.model': 'Model',
    'cmd.session': 'Session',
    'cmd.think': 'Thinking',
    'cmd.info': 'Info',
    'cmd.skill': 'Skills',
    'cmd.advanced': 'Advanced',
    'tool.running': 'Running...',
    'tool.done': 'Done',
    'tool.error': 'Failed',
    'time.just': 'just now',
    'time.min': '{n}m ago',
    'time.hour': '{n}h ago',
    'time.day': '{n}d ago',
    'settings.title': 'Settings',
    'settings.theme': 'Theme',
    'settings.theme.light': 'Light',
    'settings.theme.dark': 'Dark',
    'settings.theme.auto': 'System',
    'settings.lang': 'Language',
    'settings.disconnect': 'Disconnect',
    'cancel': 'Cancel',
    'confirm': 'OK',
    'copy': 'Copy',
    'copied': 'Copied',
    'copy.fail': 'Failed',
  }
}

let _currentLang = 'zh-CN'
let _onLangChange = []

/** 检测浏览器语言 */
function detectLang() {
  const saved = localStorage.getItem(LANG_KEY)
  if (saved && messages[saved]) return saved
  const nav = navigator.language || navigator.userLanguage || 'zh-CN'
  return nav.startsWith('zh') ? 'zh-CN' : 'en'
}

/** 初始化 */
export function initI18n() {
  _currentLang = detectLang()
}

/** 获取当前语言 */
export function getLang() {
  return _currentLang
}

/** 切换语言 */
export function setLang(lang) {
  if (!messages[lang]) return
  _currentLang = lang
  localStorage.setItem(LANG_KEY, lang)
  _onLangChange.forEach(fn => { try { fn(lang) } catch (e) { console.error(e) } })
}

/** 翻译 */
export function t(key, params) {
  let text = messages[_currentLang]?.[key] || messages['zh-CN']?.[key] || key
  if (params) {
    Object.entries(params).forEach(([k, v]) => {
      text = text.replace(`{${k}}`, v)
    })
  }
  return text
}

/** 监听语言变化 */
export function onLangChange(fn) {
  _onLangChange.push(fn)
  return () => { _onLangChange = _onLangChange.filter(cb => cb !== fn) }
}

/** 格式化相对时间 */
export function formatRelativeTime(dateStr) {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  const now = new Date()
  const diffMin = Math.floor((now - d) / 60000)
  if (diffMin < 1) return t('time.just')
  if (diffMin < 60) return t('time.min', { n: diffMin })
  if (diffMin < 1440) return t('time.hour', { n: Math.floor(diffMin / 60) })
  return t('time.day', { n: Math.floor(diffMin / 1440) })
}
