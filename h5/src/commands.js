const COMMAND_GROUPS = [
  {
    title: '模型管理',
    commands: [
      { cmd: '/model', desc: '切换模型（需补充参数）', fill: true },
      { cmd: '/model list', desc: '列出可用模型' },
      { cmd: '/model status', desc: '当前模型状态' },
    ],
  },
  {
    title: '会话管理',
    commands: [
      { cmd: '/new', desc: '新建会话' },
      { cmd: '/reset', desc: '重置当前会话' },
      { cmd: '/compact', desc: '压缩上下文' },
      { cmd: '/stop', desc: '停止当前任务' },
    ],
  },
  {
    title: '思考控制',
    commands: [
      { cmd: '/think off', desc: '关闭思考' },
      { cmd: '/think low', desc: '低强度思考' },
      { cmd: '/think medium', desc: '中等思考' },
      { cmd: '/think high', desc: '高强度思考' },
    ],
  },
  {
    title: '信息查询',
    commands: [
      { cmd: '/help', desc: '帮助信息' },
      { cmd: '/status', desc: '系统状态' },
      { cmd: '/whoami', desc: '当前身份' },
      { cmd: '/commands', desc: '所有指令' },
      { cmd: '/context', desc: '上下文信息' },
    ],
  },
  {
    title: '高级',
    commands: [
      { cmd: '/verbose on', desc: '开启详细输出' },
      { cmd: '/verbose off', desc: '关闭详细输出' },
      { cmd: '/reasoning on', desc: '开启推理' },
      { cmd: '/reasoning off', desc: '关闭推理' },
      { cmd: '/usage tokens', desc: 'Token 用量' },
      { cmd: '/usage cost', desc: '费用统计' },
    ],
  },
]

let _overlay = null
let _panel = null
let _onSelect = null

export function initCommands(onSelect) {
  _onSelect = onSelect
  _createPanel()
}

function _createPanel() {
  _overlay = document.createElement('div')
  _overlay.className = 'cmd-overlay'
  _overlay.onclick = () => hideCommands()

  _panel = document.createElement('div')
  _panel.className = 'cmd-panel'

  const header = document.createElement('div')
  header.className = 'cmd-panel-header'
  header.innerHTML = `
    <h3>快捷指令</h3>
    <button class="close-btn">×</button>
  `
  header.querySelector('.close-btn').onclick = () => hideCommands()

  const list = document.createElement('div')
  list.className = 'cmd-list'

  COMMAND_GROUPS.forEach(group => {
    const title = document.createElement('div')
    title.className = 'cmd-group-title'
    title.textContent = group.title
    list.appendChild(title)

    group.commands.forEach(({ cmd, desc, fill }) => {
      const item = document.createElement('div')
      item.className = 'cmd-item'
      item.innerHTML = `
        <span class="cmd-text">${cmd}</span>
        <span class="cmd-desc">${desc}</span>
      `
      item.onclick = () => {
        hideCommands()
        if (fill) {
          _onSelect?.(cmd + ' ', true)
        } else {
          _onSelect?.(cmd, false)
        }
      }
      list.appendChild(item)
    })
  })

  _panel.appendChild(header)
  _panel.appendChild(list)
  document.body.appendChild(_overlay)
  document.body.appendChild(_panel)
}

export function showCommands() {
  _overlay?.classList.add('visible')
  _panel?.classList.add('visible')
}

export function hideCommands() {
  _overlay?.classList.remove('visible')
  _panel?.classList.remove('visible')
}

export function isCommandsVisible() {
  return _panel?.classList.contains('visible') ?? false
}
