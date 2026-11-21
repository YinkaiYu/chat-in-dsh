#!/usr/bin/env node
/**
 * 真实 profile 端到端验证：跑在**正在运行的 DSH 进程**上，不是桩。
 *
 * 与 `test/live-e2e.mjs` 的区别：那个用最小适配的 ctx 在进程内起插件；这个要求
 * 一个真的 `dsh web` 实例（真实的 webServer、真实的 credentials/settings 服务、
 * 真实的 profile 配置），用页面登录令牌换 cookie，然后走浏览器会走的每一步：
 *
 *   1. GET  /                       DSH 自己的 Web UI 真的有响应（确认是真宿主）
 *   2. GET  /webchat/models         目录来自 profile 里配的 models
 *   3. GET  /webchat/settings       设置页能列出可选项
 *   4. POST /webchat/api/models     切到非 DeepSeek 官方模型
 *   5. POST /webchat/anthropic/v1/messages  真实一次对话（SSE）
 *   6. GET  /webchat/api/self-test  自检四项，第三项 detail 带当前模型
 *   7. 读 DSH_HOME 下的选择文件     落盘位置与内容
 *
 * 用法（令牌只从环境变量读，不进命令行、不进证据文件）：
 *   DSH_WEB_TOKEN=<dsh web 打印的 token> \
 *   node test/profile-e2e.mjs --base http://127.0.0.1:3199 --model glm-5.3-flash \
 *     --home /path/to/DSH_HOME --out docs/evidence/profile-e2e.json
 */
import fs from 'node:fs'
import path from 'node:path'

function parseArgs(argv) {
  const out = {}
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index]
    if (!token.startsWith('--')) continue
    const key = token.slice(2)
    const next = argv[index + 1]
    if (next === undefined || next.startsWith('--')) out[key] = true
    else {
      out[key] = next
      index += 1
    }
  }
  return out
}

const args = parseArgs(process.argv.slice(2))
const base = String(args.base ?? 'http://127.0.0.1:3199').replace(/\/+$/u, '')
const targetModel = String(args.model ?? 'glm-5.3-flash')
const token = process.env.DSH_WEB_TOKEN
const home = args.home === undefined ? undefined : String(args.home)
const outFile = args.out === undefined ? undefined : String(args.out)

if (token === undefined || token === '') {
  console.error('缺少 DSH_WEB_TOKEN：请把 dsh web 打印的 token 放环境变量')
  process.exit(2)
}

const evidence = {
  startedAt: new Date().toISOString(),
  host: { base, kind: 'dsh web (real profile)' },
  steps: [],
  answer: {},
}
const record = (name, ok, detail, extra) => {
  evidence.steps.push({ name, ok, detail, ...(extra === undefined ? {} : { extra }) })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}  ${detail}`)
}

/** 用页面令牌登录 127.0.0.1 上的 DSH Web：拿到会话 cookie。 */
async function login() {
  const response = await fetch(`${base}/?token=${encodeURIComponent(token)}`, { redirect: 'manual' })
  const cookies = typeof response.headers.getSetCookie === 'function' ? response.headers.getSetCookie() : []
  const pair = cookies.map(item => item.split(';')[0]).join('; ')
  return { status: response.status, cookie: pair }
}

const session = await login()
record('DSH 宿主可登录（/ 带 token）', [200, 302, 303].includes(session.status), `HTTP ${session.status}`)
if (session.cookie === '') {
  record('登录拿到会话 cookie', false, '没有 set-cookie，无法继续')
  finish()
  process.exit(1)
}
record('登录拿到会话 cookie', true, `${session.cookie.split(';').length} 个 cookie（值不入库）`)

const headers = { cookie: session.cookie }
const getJson = async (urlPath, init = {}) => {
  const response = await fetch(`${base}${urlPath}`, {
    ...init,
    headers: { ...headers, ...(init.headers ?? {}) },
  })
  const text = await response.text()
  let body
  try {
    body = JSON.parse(text)
  } catch {
    body = text
  }
  return { status: response.status, body, headers: response.headers }
}

// ---- 2. 目录 ----
const catalog = await getJson('/webchat/models')
const ids = Array.isArray(catalog.body?.data) ? catalog.body.data.map(item => item.id) : []
record(
  '目录来自 profile 配置（含默认官方项与自定义项）',
  catalog.status === 200 && ids.includes('deepseek-flash') && ids.includes(targetModel),
  `${catalog.status} ${JSON.stringify(ids)}`,
)

// ---- 3. 设置页 ----
const settings = await fetch(`${base}/webchat/settings`, { headers })
const settingsHtml = await settings.text()
const radios = [...settingsHtml.matchAll(/name="model" value="([^"]+)"/gu)].map(match => match[1])
record(
  '设置页列出可选模型',
  settings.status === 200 && ids.every(id => radios.includes(id)),
  `HTTP ${settings.status} radios=${JSON.stringify(radios)}`,
)

// ---- 4. 切换 ----
const switched = await getJson('/webchat/api/models', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ id: targetModel }),
})
record(
  '切换到自定义模型',
  switched.status === 200 && switched.body?.active === targetModel,
  JSON.stringify(switched.body),
)

// ---- 5. 真实对话 ----
const chatBody = {
  model: 'deepseek-flash',
  max_tokens: 256,
  stream: true,
  thinking: { type: 'enabled' },
  messages: [{
    role: 'user',
    content: [{ type: 'text', text: '只回答一句：你是哪个模型？谁训练的？' }],
  }],
}
const startedAt = Date.now()
const chat = await fetch(`${base}/webchat/anthropic/v1/messages`, {
  method: 'POST',
  headers: { ...headers, 'content-type': 'application/json', accept: 'text/event-stream' },
  body: JSON.stringify(chatBody),
})
const chatText = await chat.text()
const elapsedMs = Date.now() - startedAt
const events = []
for (const block of chatText.split('\n\n')) {
  const name = /^event: (.+)$/mu.exec(block)?.[1]
  if (name !== undefined) events.push(name)
}
let text = ''
let thinking = ''
for (const line of chatText.split('\n')) {
  const match = /^data: (.+)$/u.exec(line.trim())
  if (match === null) continue
  let payload
  try {
    payload = JSON.parse(match[1])
  } catch {
    continue
  }
  if (payload?.delta?.type === 'text_delta') text += payload.delta.text
  if (payload?.delta?.type === 'thinking_delta') thinking += payload.delta.thinking
}
record(
  '真实对话 HTTP 200（真上游，非打桩）',
  chat.status === 200,
  `status=${chat.status} ${elapsedMs}ms`,
)
record('收到真实模型回答', text.trim() !== '', `${JSON.stringify(text.trim().slice(0, 160))}（thinking ${thinking.length} 字符）`)
record(
  'Anthropic 事件序列完整',
  events[0] === 'message_start' && events.at(-1) === 'message_stop' && events.includes('content_block_delta'),
  `${events.length} 个事件：${events.slice(0, 3).join(' → ')} … ${events.at(-1)}`,
)

// ---- 6. 自检 ----
const selftest = await getJson('/webchat/api/self-test')
const modelCheck = Array.isArray(selftest.body?.checks)
  ? selftest.body.checks.find(item => item.name === 'model')
  : undefined
record(
  '自检四项全绿且第三项带当前模型',
  selftest.body?.ok === true && typeof modelCheck?.detail === 'string' && modelCheck.detail.includes(targetModel),
  JSON.stringify(selftest.body?.checks ?? selftest.body),
)

// ---- 7. 选择文件 ----
if (home !== undefined) {
  const stateFile = path.join(home, 'chat-in-dsh', 'model-state.json')
  let state
  try {
    state = JSON.parse(fs.readFileSync(stateFile, 'utf8'))
  } catch (error) {
    state = undefined
    record('选择落在 DSH_HOME', false, `${stateFile}: ${String(error?.message ?? error)}`)
  }
  if (state !== undefined) {
    record('选择落在 DSH_HOME', state.model === targetModel, `${stateFile} → ${JSON.stringify(state)}`)
  }
}

// ---- 8. 对照：切回默认官方项，同一条请求必须仍走官方端点（本机没有官方凭据，故 401） ----
const back = await getJson('/webchat/api/models', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ id: 'deepseek-flash' }),
})
const official = await fetch(`${base}/webchat/anthropic/v1/messages`, {
  method: 'POST',
  headers: { ...headers, 'content-type': 'application/json', accept: 'text/event-stream' },
  body: JSON.stringify(chatBody),
})
const officialBody = await official.text()
let officialMessage = officialBody
try {
  officialMessage = JSON.parse(officialBody)?.error?.message ?? officialBody
} catch {
  // 非 JSON 就用原文
}
record(
  '默认项仍走官方 DeepSeek 直通路径',
  back.body?.active === 'deepseek-flash' && [401, 403].includes(official.status),
  `active=${back.body?.active} status=${official.status} ${officialMessage.slice(0, 160)}`,
)
// 复位到自定义模型，方便连续复跑
await getJson('/webchat/api/models', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ id: targetModel }),
})


evidence.answer = { text: text.trim(), thinkingChars: thinking.length, elapsedMs, events: events.length }
evidence.ok = evidence.steps.every(step => step.ok)
evidence.finishedAt = new Date().toISOString()
finish()
process.exit(evidence.ok ? 0 : 1)

function finish() {
  console.log(evidence.ok ? 'PROFILE_E2E_OK' : 'PROFILE_E2E_FAIL')
  if (outFile !== undefined) {
    fs.mkdirSync(path.dirname(outFile), { recursive: true })
    fs.writeFileSync(outFile, `${JSON.stringify(evidence, null, 2)}\n`)
    console.log(`证据：${outFile}`)
  }
}
