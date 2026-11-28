import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

// 回归：文档与图片使用不同上限；会话历史附件额度不能拦纯文本消息。
//
// 文档：官方 API 每个请求最多 20 个文档块。
// 图片：独立限制，官方 API 每个请求最多 600 张。
// send() 和 sendMessage() 都必须只在本条消息带附件时校验历史额度，
// 否则历史附件满了以后连纯文本也发不出去。
//
// 这里不构建前端。优先读已打补丁的 vendor 源码；CI 里没有 vendor，
// 就从补丁里还原/检查补丁后的内容。

const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const vendorChatInput = path.join(project, 'webview', 'vendor', 'chat-demo', 'src', 'components', 'chatInput', 'ChatInput.tsx')
const vendorStore = path.join(project, 'webview', 'vendor', 'chat-demo', 'src', 'services', 'chat', 'store.ts')
const vendorAttachments = path.join(project, 'webview', 'vendor', 'chat-demo', 'src', 'services', 'attachments.ts')
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

/** 取出补丁里某个文件的改动段，用于没有 vendor 的 CI。 */
function patchSection(file) {
  const text = readFileSync(patchFile, 'utf8').replace(/\r\n/g, '\n')
  const start = text.indexOf(`diff --git a/${file}`)
  assert.notEqual(start, -1, `补丁里没有 ${file} 的改动`)
  const end = text.indexOf('diff --git ', start + 1)
  return end === -1 ? text.slice(start) : text.slice(start, end)
}

test('发送额度校验：纯文本消息不受会话历史附件累计限制', () => {
  const source = existsSync(vendorChatInput) ? readFileSync(vendorChatInput, 'utf8') : chatInputFromPatch()
  const body = functionBody(source, 'const send = () => {')
  assert.match(body, /prepared\.files\.length\s*>\s*0/, '额度校验必须先确认本条消息带附件')
  assert.match(body, /countSessionFiles\(sessionId\)/, '额度校验应基于可见分支的已发送附件数')
  assert.match(body, /MAX_DOCUMENT_COUNT/, '发送时应校验文档上限')
  assert.match(body, /MAX_IMAGE_COUNT/, '发送时应校验图片上限')
  assert.match(body, /MAX_IMAGE_TOTAL_BYTES/, '发送时应校验图片总大小')
  assert.match(body, /uploadedImageBytes/, '图片总大小应使用实际上传字节数')
})

test('sendMessage 内部额度校验同样只拦带附件的消息', () => {
  if (existsSync(vendorStore)) {
    const source = readFileSync(vendorStore, 'utf8')
    const body = functionBody(source, 'export const sendMessage =')
    assert.match(body, /if\s*\(\s*files\.length\s*>\s*0\s*\)/, 'sendMessage() 只能在有附件时校验额度')
    assert.match(body, /countSessionFiles\(targetSessionId\)/, 'sendMessage() 应基于可见分支的已发送附件数')
    assert.match(body, /MAX_DOCUMENT_COUNT/, 'sendMessage() 应校验文档上限')
    assert.match(body, /MAX_IMAGE_COUNT/, 'sendMessage() 应校验图片上限')
    assert.match(body, /MAX_IMAGE_TOTAL_BYTES/, 'sendMessage() 应校验图片总大小')
    return
  }
  // CI 里没有 vendor；直接检查补丁中新增的守卫。
  const section = patchSection('src/services/chat/store.ts')
  assert.match(section, /^\+\s*if \(files\.length > 0\) \{/m, 'sendMessage() 的额度校验缺少 files.length > 0 前提')
  assert.match(section, /countSessionFiles\(targetSessionId\)/, 'sendMessage() 缺少会话附件计数')
  assert.match(section, /MAX_DOCUMENT_COUNT/, 'sendMessage() 缺少文档上限')
  assert.match(section, /MAX_IMAGE_COUNT/, 'sendMessage() 缺少图片上限')
  assert.match(section, /MAX_IMAGE_TOTAL_BYTES/, 'sendMessage() 缺少图片总大小上限')
})

test('附件额度：文档 20 个、图片 600 张，分别计数', () => {
  if (existsSync(vendorAttachments)) {
    const source = readFileSync(vendorAttachments, 'utf8')
    assert.match(source, /export const MAX_DOCUMENT_COUNT = 20\b/)
    assert.match(source, /export const MAX_IMAGE_COUNT = 600\b/)
    assert.match(source, /export const MAX_IMAGE_TOTAL_BYTES = 200 \* 1024 \* 1024\b/)
    assert.match(source, /documents: number/)
    assert.match(source, /images: number/)
    return
  }
  const section = patchSection('src/services/attachments.ts')
  assert.match(section, /^\+\s*export const MAX_DOCUMENT_COUNT = 20\b/m)
  assert.match(section, /^\+\s*export const MAX_IMAGE_COUNT = 600\b/m)
  assert.match(section, /^\+\s*export const MAX_IMAGE_TOTAL_BYTES = 200 \* 1024 \* 1024\b/m)
  assert.match(section, /^\+\s*documents: number/m)
  assert.match(section, /^\+\s*images: number/m)
})

test('历史附件只统计实际会进入请求的 serverId', () => {
  if (existsSync(vendorStore)) {
    const source = readFileSync(vendorStore, 'utf8')
    const start = source.indexOf('export const countSessionFiles =')
    assert.notEqual(start, -1, '找不到 countSessionFiles')
    const body = source.slice(start, start + 2000)
    assert.match(body, /getContextRounds\(getVisibleMessages\(session\)\)/, '只应统计实际进入上下文的完整轮次')
    assert.match(body, /serverId\s*!==\s*null/, 'countSessionFiles 应跳过没有 serverId 的导入附件')
    assert.match(body, /return \{ documents: 0, images: 0, imageBytes: 0 \}/, '空会话必须返回 imageBytes: 0')
    assert.match(source, /assertPreparedRequestLimits\(prepared\)/, '补传后必须按最终请求再校验')
    return
  }
  const section = patchSection('src/services/chat/store.ts')
  assert.match(section, /getContextRounds\(getVisibleMessages\(session\)\)/, '历史附件应只统计完整上下文轮次')
  assert.match(section, /\.filter\(\(file\) => file\.serverId !== null\)/, '补丁中的历史附件计数应过滤 serverId')
  assert.match(section, /assertPreparedRequestLimits\(prepared\)/, '补传后必须按最终请求再校验')
})

test('图片总量按实际上传字节计算，通用 MIME 按扩展名回退', () => {
  if (existsSync(vendorAttachments)) {
    const source = readFileSync(vendorAttachments, 'utf8')
    assert.match(source, /size_bytes/, '上传任务应记录服务端实际字节数')
    assert.match(source, /uploadedImageBytes/, '发送前应使用实际上传字节数')
    assert.match(source, /application\/octet-stream/, '通用 MIME 应回退到扩展名')
    assert.match(source, /jfif/, 'jfif 应按扩展名识别为图片')
    return
  }
  const section = patchSection('src/services/attachments.ts')
  assert.match(section, /size_bytes/)
  assert.match(section, /uploadedImageBytes/)
  assert.match(section, /application\/octet-stream/)
  assert.match(section, /VIEW_MIME_BY_EXT\[ext\]/, '通用 MIME 应回退到扩展名表（包含 jfif）')
})

test('上传大小兼容官方 bytes 与 size_bytes，缺失时用表单文件大小', () => {
  const vendorClient = path.join(project, 'webview', 'vendor', 'chat-demo', 'src', 'services', 'api', 'client.ts')
  if (existsSync(vendorClient)) {
    const source = readFileSync(vendorClient, 'utf8')
    assert.match(source, /uploaded\.size_bytes/, '应优先读取 size_bytes')
    assert.match(source, /uploaded\.bytes/, '应兼容官方 bytes 字段')
    assert.match(source, /uploadBody\.size/, '缺失大小字段时应使用表单文件大小')
    return
  }
  const section = patchSection('src/services/api/client.ts')
  assert.match(section, /uploaded\.size_bytes/)
  assert.match(section, /uploaded\.bytes/)
  assert.match(section, /uploadBody\.size/)
})
