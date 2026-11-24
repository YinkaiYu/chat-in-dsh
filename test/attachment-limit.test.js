import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

// 回归：会话历史附件累计达到上限后，纯文本消息仍必须能发送。
//
// 背景：webview 的 send() 和 store 的 sendMessage() 都会以
// 「会话可见分支已发送附件数 + 本条附件数 > MAX_COUNT」拦截发送。
// 若缺少「本条消息确有附件」这个前提，纯文本消息也会被拦下，
// 导致历史累计满额后整个会话永久发不出任何消息。
//
// 这里不构建前端。优先读已打补丁的 vendor 源码（本地跑过 build-webview.ps1 时才有），
// 否则从补丁里还原/检查补丁后的内容：CI 里没有 vendor，同样要能守住这个行为。

const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const vendorChatInput = path.join(project, 'webview', 'vendor', 'chat-demo', 'src', 'components', 'chatInput', 'ChatInput.tsx')
const vendorStore = path.join(project, 'webview', 'vendor', 'chat-demo', 'src', 'services', 'chat', 'store.ts')
const patchFile = path.join(project, 'webview', 'patches', '0001-dsh-integration.patch')

/** 取出某个函数/箭头函数起始位置后的函数体（按花括号配对）。 */
function functionBody(source, marker) {
  const start = source.indexOf(marker)
  assert.notEqual(start, -1, `找不到 ${marker}`)
  const open = source.indexOf('{', start)
  let depth = 0
  for (let index = open; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1
    else if (source[index] === '}') {
      depth -= 1
      if (depth === 0) return source.slice(open, index + 1)
    }
  }
  assert.fail(`${marker} 函数体没有闭合`)
}

/** 从补丁里还原 ChatInput.tsx 打补丁后的内容：保留上下文行与新增行。 */
function chatInputFromPatch() {
  const lines = readFileSync(patchFile, 'utf8').replace(/\r\n/g, '\n').split('\n')
  const start = lines.findIndex(line => line.startsWith('diff --git a/src/components/chatInput/ChatInput.tsx'))
  assert.notEqual(start, -1, '补丁里没有 ChatInput.tsx 的改动')
  const kept = []
  let inHunk = false
  for (let index = start + 1; index < lines.length; index += 1) {
    const line = lines[index]
    if (line.startsWith('diff --git ')) break
    if (line.startsWith('@@')) { inHunk = true; continue }
    if (!inHunk) continue
    if (line.startsWith('\\')) continue
    if (line.startsWith('-')) continue
    // 新增行取 "+" 之后，上下文行取原样（含行首空格）
    kept.push(line.startsWith('+') ? line.slice(1) : line)
  }
  return kept.join('\n')
}

/** 取出补丁里 store.ts 的改动段，用于没有 vendor 的 CI。 */
function storePatchSection() {
  const text = readFileSync(patchFile, 'utf8').replace(/\r\n/g, '\n')
  const start = text.indexOf('diff --git a/src/services/chat/store.ts')
  assert.notEqual(start, -1, '补丁里没有 store.ts 的改动')
  const end = text.indexOf('diff --git ', start + 1)
  return end === -1 ? text.slice(start) : text.slice(start, end)
}

test('发送额度校验：纯文本消息不受会话历史附件累计限制', () => {
  const source = existsSync(vendorChatInput) ? readFileSync(vendorChatInput, 'utf8') : chatInputFromPatch()
  const body = functionBody(source, 'const send = () => {')
  const limit = /if\s*\(([\s\S]*?)showToast\(\{\s*key:\s*'fileCountLimitExceededToast'/.exec(body)
  assert.notEqual(limit, null, 'send() 里找不到文件数量上限校验')
  const condition = limit[1]
  assert.match(
    condition,
    /prepared\.files\.length\s*>\s*0/,
    '额度校验必须先确认本条消息带附件，否则历史满了就连纯文本也发不出去'
  )
  assert.match(condition, /countSessionFiles\(sessionId\)/, '额度校验应基于可见分支的已发送附件数')
})

test('sendMessage 内部额度校验同样只拦带附件的消息', () => {
  if (existsSync(vendorStore)) {
    const source = readFileSync(vendorStore, 'utf8')
    const body = functionBody(source, 'export const sendMessage =')
    assert.match(
      body,
      /if\s*\(\s*files\.length\s*>\s*0\s*&&[\s\S]*?countSessionFiles\(targetSessionId\)[\s\S]*?\)\s*\{\s*return false/,
      'sendMessage() 必须在 files.length > 0 时才校验历史累计'
    )
    return
  }
  // CI 里没有 vendor；直接检查补丁中新增的那条守卫。
  const section = storePatchSection()
  assert.match(
    section,
    /^\+\s*if \(files\.length > 0 && \(targetSessionId === null \? 0 : countSessionFiles\(targetSessionId\)\) \+ files\.length > MAX_COUNT\) \{/m,
    'sendMessage() 的累计额度校验缺少 files.length > 0 前提'
  )
})

test('附件额度常量保持官方 20 个文档块', () => {
  const text = readFileSync(patchFile, 'utf8').replace(/\r\n/g, '\n')
  // 官方限制是「每个请求最多 20 个文档块」，不能借这个修复悄悄放宽。
  assert.match(text, /\+export const MAX_COUNT = 20\b/, '补丁应把 MAX_COUNT 设为 20')
})
