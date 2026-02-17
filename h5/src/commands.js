/**
 * 快捷指令面板 - 支持 i18n
 */

import { t } from './i18n.js'

function getCommandGroups() {
  return [
    {
      titleKey: 'cmd.model',
      commands: [
        { cmd: '/model', descKey: 'cmd.model.switch', fill: true },
        { cmd: '/model list', descKey: 'cmd.model.list' },
        { cmd: '/model status', descKey: 'cmd.model.status' },
      ],
    },
    {
      titleKey: 'cmd.session',
      commands: [
        { cmd: '/new', descKey: 'cmd.session.new' },
        { cmd: '/reset', descKey: 'cmd.session.reset' },
        { cmd: '/compact', descKey: 'cmd.session.compact' },
        { cmd: '/stop', descKey: 'cmd.session.stop' },
      ],
    },
    {
      titleKey: 'cmd.think',
      commands: [
        { cmd: '/think off', descKey: 'cmd.think.off' },
        { cmd: '/think low', descKey: 'cmd.think.low' },
        { cmd: '/think medium', descKey: 'cmd.think.medium' },
        { cmd: '/think high', descKey: 'cmd.think.high' },
      ],
    },
    {
      titleKey: 'cmd.info',
      commands: [
        { cmd: '/help', descKey: 'cmd.info.help' },
        { cmd: '/status', descKey: 'cmd.info.status' },
        { cmd: '/whoami', descKey: 'cmd.info.whoami' },
        { cmd: '/commands', descKey: 'cmd.info.commands' },
        { cmd: '/context', descKey: 'cmd.info.context' },
      ],
    },
    {
      titleKey: 'cmd.skill',
      commands: [
        { cmd: '/skill ', descKey: 'cmd.skill.run', fill: true },
      ],
    },
    {
      titleKey: 'cmd.advanced',
      commands: [
        { cmd: '/verbose on', descKey: 'cmd.advanced.verbose.on' },
        { cmd: '/verbose off', descKey: 'cmd.advanced.verbose.off' },
        { cmd: '/compact ', descKey: 'cmd.advanced.compact', fill: true },
      ],
    },
  ]
}

let _overlay = null
let _panel = null
let _onSelect = null

export function initCommands(onSelect) {
  _onSelect = onSelect
}

function _buildPanel() {
  // 每次打开重建，确保语言最新
  _overlay?.remove()
  _panel?.remove()

  _overlay = document.createElement('div')
  _overlay.className = 'cmd-overlay'
  _overlay.onclick = () => hideCommands()

  _panel = document.createElement('div')
  _panel.className = 'cmd-panel'

  const header = document.createElement('div')
  header.className = 'cmd-panel-header'
  header.innerHTML = `
    <h3>${t('cmd.title')}</h3>
    <button class="close-btn">×</button>
  `
  header.querySelector('.close-btn').onclick = () => hideCommands()

  const list = document.createElement('div')
  list.className = 'cmd-list'

  getCommandGroups().forEach(group => {
    const title = document.createElement('div')
    title.className = 'cmd-group-title'
    title.textContent = t(group.titleKey)
    list.appendChild(title)

    group.commands.forEach(({ cmd, descKey, fill }) => {
      const item = document.createElement('div')
      item.className = 'cmd-item'
      item.innerHTML = `
        <span class="cmd-text">${cmd}</span>
        <span class="cmd-desc">${t(descKey)}</span>
      `
      item.onclick = () => {
        hideCommands()
        if (fill) _onSelect?.(cmd + ' ', true)
        else _onSelect?.(cmd, false)
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
  _buildPanel()
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
