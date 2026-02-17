const KEYWORDS = new Set([
  'const','let','var','function','return','if','else','for','while','do',
  'switch','case','break','continue','new','this','class','extends','import',
  'export','from','default','try','catch','finally','throw','async','await',
  'yield','of','in','typeof','instanceof','void','delete','true','false',
  'null','undefined','static','get','set','super','with','debugger',
  'def','print','self','elif','lambda','pass','raise','except','None','True','False',
  'fn','pub','mut','impl','struct','enum','match','use','mod','crate','trait',
  'int','string','bool','float','double','char','byte','long','short','unsigned',
  'package','main','fmt','go','chan','defer','select','type','interface','map','range',
])

function highlightCode(code, lang) {
  const escaped = escapeHtml(code)

  return escaped
    .replace(/\b(\d+\.?\d*)\b/g, '<span class="hl-number">$1</span>')
    .replace(/(\/\/.*$|#.*$)/gm, '<span class="hl-comment">$1</span>')
    .replace(/(\/\*[\s\S]*?\*\/)/g, '<span class="hl-comment">$1</span>')
    .replace(/(&quot;(?:[^&]|&(?!quot;))*?&quot;|&#x27;(?:[^&]|&(?!#x27;))*?&#x27;|`[^`]*`)/g,
      '<span class="hl-string">$1</span>')
    .replace(/\b([A-Z][a-zA-Z0-9_]*)\b/g, (m, w) =>
      KEYWORDS.has(w) ? m : `<span class="hl-type">${w}</span>`)
    .replace(/\b(\w+)(?=\s*\()/g, (m, w) =>
      KEYWORDS.has(w) ? m : `<span class="hl-func">${w}</span>`)
    .replace(/\b(\w+)\b/g, (m, w) =>
      KEYWORDS.has(w) ? `<span class="hl-keyword">${w}</span>` : m)
}

function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
}

export function renderMarkdown(text) {
  if (!text) return ''

  let html = text

  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) => {
    const highlighted = highlightCode(code.trimEnd(), lang)
    const langLabel = lang ? `<span class="code-lang">${escapeHtml(lang)}</span>` : ''
    return `<pre data-lang="${escapeHtml(lang)}">${langLabel}<button class="code-copy-btn" onclick="window.__copyCode(this)">Copy</button><code>${highlighted}</code></pre>`
  })

  html = html.replace(/`([^`\n]+)`/g, (_, code) =>
    `<code>${escapeHtml(code)}</code>`)

  const lines = html.split('\n')
  const result = []
  let inList = false
  let listType = ''

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i]

    if (line.startsWith('<pre')) {
      result.push(line)
      while (i < lines.length - 1 && !lines[i].includes('</pre>')) {
        i++
        result.push(lines[i])
      }
      continue
    }

    const headingMatch = line.match(/^(#{1,3})\s+(.+)$/)
    if (headingMatch) {
      if (inList) { result.push(`</${listType}>`); inList = false }
      const level = headingMatch[1].length
      result.push(`<h${level}>${inlineFormat(headingMatch[2])}</h${level}>`)
      continue
    }

    const ulMatch = line.match(/^[\s]*[-*]\s+(.+)$/)
    if (ulMatch) {
      if (!inList || listType !== 'ul') {
        if (inList) result.push(`</${listType}>`)
        result.push('<ul>')
        inList = true
        listType = 'ul'
      }
      result.push(`<li>${inlineFormat(ulMatch[1])}</li>`)
      continue
    }

    const olMatch = line.match(/^[\s]*\d+\.\s+(.+)$/)
    if (olMatch) {
      if (!inList || listType !== 'ol') {
        if (inList) result.push(`</${listType}>`)
        result.push('<ol>')
        inList = true
        listType = 'ol'
      }
      result.push(`<li>${inlineFormat(olMatch[1])}</li>`)
      continue
    }

    if (inList) {
      result.push(`</${listType}>`)
      inList = false
    }

    if (line.trim() === '') {
      result.push('')
      continue
    }

    if (!line.startsWith('<')) {
      result.push(`<p>${inlineFormat(line)}</p>`)
    } else {
      result.push(line)
    }
  }

  if (inList) result.push(`</${listType}>`)

  return result.join('\n')
}

function inlineFormat(text) {
  return text
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/__(.+?)__/g, '<strong>$1</strong>')
    .replace(/_(.+?)_/g, '<em>$1</em>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
    .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1" class="msg-img" />')
}

window.__copyCode = function(btn) {
  const pre = btn.closest('pre')
  const code = pre.querySelector('code')
  const text = code.innerText
  navigator.clipboard.writeText(text).then(() => {
    btn.textContent = '✓'
    setTimeout(() => { btn.textContent = 'Copy' }, 1500)
  }).catch(() => {
    btn.textContent = '✗'
    setTimeout(() => { btn.textContent = 'Copy' }, 1500)
  })
}
