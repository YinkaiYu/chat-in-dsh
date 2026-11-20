import assert from 'node:assert/strict'
import { Readable, Writable } from 'node:stream'
import test from 'node:test'
import { createWebview } from '../src/webview.js'

const mockModel = { provider: 'local-provider', model: 'local-model', reasoningEffort: 'high' }
const owner = { peer: { principal: { kind: 'owner' } } }

async function request(handle, url, { method = 'GET', admission = owner, body } = {}) {
  const req = Object.assign(Readable.from(body === undefined ? [] : [Buffer.from(JSON.stringify(body))]), {
    url, method, admission, headers: { 'content-type': 'application/json' },
  })
  const chunks = []
  const res = new Writable({
    write(chunk, _encoding, callback) {
      chunks.push(chunk)
      callback()
    },
  })
  res.writeHead = (status, headers) => Object.assign(res, { status, headers, headersSent: true })
  await handle(req, res)
  return { status: res.status, headers: res.headers, text: Buffer.concat(chunks).toString('utf8') }
}

test('模型选择使用 DSH 默认值，并通过 DSH 验证保存', async () => {
  let current = { provider: 'deepseek-account', model: 'deepseek-flash' }
  const services = {
    connection: { admit: req => req.admission },
    agentDefaultModel: {
      currentSelection: () => current,
      saveSelection: async value => { current = value },
    },
    llm: {
      listModels: async provider => provider === mockModel.provider ? [{ id: mockModel.model }] : [],
      resolveCallConfig: async value => { assert.deepEqual(value, mockModel) },
    },
  }
  const handler = createWebview({ get: name => services[name] }, {}, '.')
  const route = '/webchat/api/model/default'
  assert.equal((await request(handler, route, { method: 'PUT', body: mockModel, admission: { rejection: 401 } })).status, 401)
  assert.equal((await request(handler, route, { method: 'PUT', body: { ...mockModel, model: 'removed' } })).status, 400)
  assert.equal(current.provider, 'deepseek-account')
  assert.equal((await request(handler, route, { method: 'PUT', body: mockModel })).status, 200)
  assert.deepEqual(JSON.parse((await request(handler, route)).text), { current: mockModel })

  current = { provider: 'deepseek-account', model: 'deepseek-v4-pro' }
  assert.deepEqual(JSON.parse((await request(handler, route)).text), { current })
})

test('第三方 DSH 模型忽略 DeepSeek 搜索工具，转发原提示词并返回 SSE', async () => {
  const services = {
    connection: { admit: req => req.admission },
    agentDefaultModel: { currentSelection: () => mockModel },
    llm: {
      async *stream({ signal, ...options }) {
        assert.equal(signal.aborted, false)
        assert.deepEqual(options, {
          ...mockModel,
          system: '原始提示词',
          messages: [{ role: 'user', content: [{ type: 'text', text: '你好' }] }],
        })
        yield { type: 'block-start', blockType: 'reasoning', index: 0 }
        yield { type: 'reasoning-delta', index: 0, text: '思考' }
        yield { type: 'block-end', index: 0 }
        yield { type: 'block-start', blockType: 'text', index: 1 }
        yield { type: 'text-delta', index: 1, text: '回答' }
        yield { type: 'block-end', index: 1 }
        yield { type: 'finish', reason: { kind: 'stop' } }
      },
    },
  }
  const handler = createWebview({ get: name => services[name] }, {}, '.')
  const path = '/webchat/anthropic/v1/messages'
  const body = {
    system: '原始提示词',
    messages: [{ role: 'user', content: '你好' }],
    tools: [{ type: 'deepseek_web_search', name: 'deepseek_web_search' }],
  }
  const denied = await request(handler, path, { method: 'POST', body, admission: { rejection: 403 } })
  assert.equal(denied.status, 403)
  const result = await request(handler, path, { method: 'POST', body })
  assert.equal(result.status, 200)
  assert.match(result.headers['content-type'], /^text\/event-stream/u)
  assert.match(result.text, /"thinking_delta","thinking":"思考"/u)
  assert.match(result.text, /"text_delta","text":"回答"/u)
  assert.match(result.text, /event: message_stop/u)
})

test('DeepSeek 账号模型保留网页版的原生工具与附件请求', async (t) => {
  const selection = { provider: 'deepseek-account', model: 'deepseek-v4-pro', reasoningEffort: 'high' }
  const services = {
    agentDefaultModel: { currentSelection: () => selection },
    deepseekAccount: { resolveToken: async () => 'host-token' },
  }
  const handler = createWebview({ get: name => services[name] }, {}, '.')
  const body = {
    model: 'deepseek-flash', system: '原始提示词', stream: true, thinking: { type: 'enabled' },
    messages: [{ role: 'user', content: [{ type: 'image', source: { type: 'file', file_id: 'file-1' } }] }],
    tools: [{ type: 'deepseek_web_search', name: 'deepseek_web_search' }],
  }
  t.mock.method(globalThis, 'fetch', async (_url, init) => {
    assert.equal(init.headers['x-dsh-auth-token'], 'host-token')
    assert.deepEqual(JSON.parse(init.body), { ...body, model: selection.model, output_config: { effort: 'high' } })
    return new Response('event: message_stop\n\n', { headers: { 'content-type': 'text/event-stream' } })
  })
  const result = await request(handler, '/webchat/anthropic/v1/messages', { method: 'POST', body })
  assert.equal(result.status, 200)
  assert.match(result.text, /event: message_stop/u)
})

test('模型默认值接口先经过 DSH 登录校验', async () => {
  const connection = {
    requestRejection: () => 401,
    admit: () => assert.fail('登录校验拒绝后不应继续判断模型权限'),
  }
  const handler = createWebview({ get: name => name === 'connection' ? connection : undefined }, {}, '.')
  const result = await request(handler, '/webchat/api/model/default')
  assert.equal(result.status, 401)
  assert.equal(JSON.parse(result.text).error.message, '需要 DSH 登录')
})

test('自检在账号令牌缺失时使用 DeepSeek API Key', async (t) => {
  const services = {
    deepseekAccount: { resolveToken: async () => undefined },
    credentials: { resolve: async () => ({ value: 'test-api-key' }) },
  }
  const handler = createWebview({ get: name => services[name] }, {}, '.')
  t.mock.method(globalThis, 'fetch', async (_url, init) => {
    assert.equal(init.headers['x-api-key'], 'test-api-key')
    assert.equal(init.headers['x-dsh-auth-token'], undefined)
    assert.equal(JSON.parse(init.body).model, 'deepseek-chat')
    return new Response('event: message_stop\n\n', { headers: { 'content-type': 'text/event-stream' } })
  })
  const result = await request(handler, '/webchat/api/self-test')
  assert.equal(result.status, 200)
  const report = JSON.parse(result.text)
  assert.equal(report.ok, true, JSON.stringify(report.checks))
  assert.equal(report.checks.find(check => check.name === 'messages')?.ok, true)
})
