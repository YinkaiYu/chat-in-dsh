import { randomUUID } from 'node:crypto'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'

export const ACCOUNT_PROVIDER = 'deepseek-account'

export function currentModel(ctx) {
  return ctx.get('agentDefaultModel')?.currentSelection() ?? null
}

export async function saveDefaultModel(ctx, value) {
  const defaults = ctx.get('agentDefaultModel')
  const llm = ctx.get('llm')
  if (!defaults || !llm) throw new Error('DSH 模型服务不可用')
  const { provider, model, reasoningEffort } = value ?? {}
  if (typeof provider !== 'string' || typeof model !== 'string'
      || (reasoningEffort !== undefined && typeof reasoningEffort !== 'string')) {
    throw new Error('模型选择无效')
  }
  const models = await llm.listModels(provider)
  if (!models.some(entry => entry.id === model)) throw new Error('该模型已不在 DSH 模型目录中')
  const selection = { provider, model, ...(reasoningEffort === undefined ? {} : { reasoningEffort }) }
  await llm.resolveCallConfig(selection)
  await defaults.saveSelection(selection)
  return selection
}

export function accountMessageBody(body, selection) {
  if (selection === null) return body
  const request = JSON.parse(body)
  request.model = selection.model
  if (selection.reasoningEffort === 'off') {
    request.thinking = { type: 'disabled' }
  } else if (request.thinking?.type === 'enabled' && selection.reasoningEffort !== undefined) {
    request.output_config = { ...request.output_config, effort: selection.reasoningEffort }
  }
  return JSON.stringify(request)
}

/** Translate the webview's existing prompt and message history for a DSH adapter. */
export function toLlmRequest(selection, request) {
  if (request.tools?.some(tool => tool.type === 'deepseek_web_search')) {
    throw new Error('网页版智能搜索需要 DeepSeek 账号模型，请关闭智能搜索或切换模型')
  }
  const messages = []
  let reminder
  for (const { role, content } of request.messages) {
    if (role === 'latest_reminder') {
      reminder = content
      continue
    }
    if (role !== 'user' && role !== 'assistant') continue
    const blocks = typeof content === 'string' ? [{ type: 'text', text: content }] : content
    if (blocks.some(block => block.type === 'image' || block.type === 'document')) {
      throw new Error('网页版的 DeepSeek 文件附件需要 DeepSeek 账号模型')
    }
    const text = blocks.filter(block => block.type === 'text')
      .map(block => ({ type: 'text', text: block.text }))
    if (role === 'user' && reminder !== undefined) {
      text.unshift({ type: 'text', text: `${reminder}\n\n` })
      reminder = undefined
    }
    if (text.length === 0) continue
    messages.push(role === 'user' ? { role, content: text } : {
      role,
      id: randomUUID(),
      source: { kind: 'model', provider: selection.provider, model: selection.model },
      content: text,
    })
  }
  return { ...selection, system: request.system, messages }
}

export async function llmRequest(ctx, selection, request) {
  const llm = ctx.get('llm')
  if (!llm) throw new Error('DSH 模型服务不可用')
  const options = toLlmRequest(selection, request)
  if (request.thinking?.type === 'disabled' && selection.reasoningEffort !== 'off') {
    const info = await llm.resolveModelInfo(selection.provider, selection.model)
    if (info.reasoning?.efforts.some(effort => effort.id === 'off')) options.reasoningEffort = 'off'
  }
  return options
}

const sse = data => `event: ${data.type}\ndata: ${JSON.stringify(data)}\n\n`

/** Project provider-neutral chunks onto the SSE events understood by chat-demo. */
export async function* webviewEvents(chunks, model) {
  let usage
  const blocks = new Set()
  yield sse({ type: 'message_start', message: { id: randomUUID(), model } })
  for await (const chunk of chunks) {
    const { type, index } = chunk
    if (type === 'block-start') {
      const block = chunk.blockType === 'reasoning' ? { type: 'thinking', thinking: '' }
        : chunk.blockType === 'text' ? { type: 'text', text: '' }
        : undefined
      if (block === undefined) continue
      blocks.add(index)
      yield sse({ type: 'content_block_start', index, content_block: block })
    } else if (type === 'text-delta' && blocks.has(index)) {
      yield sse({ type: 'content_block_delta', index, delta: { type: 'text_delta', text: chunk.text } })
    } else if (type === 'reasoning-delta' && blocks.has(index)) {
      yield sse({ type: 'content_block_delta', index, delta: { type: 'thinking_delta', thinking: chunk.text } })
    } else if (type === 'block-end' && blocks.delete(index)) {
      yield sse({ type: 'content_block_stop', index })
    } else if (type === 'usage') {
      usage = {
        input_tokens: chunk.usage.inputTokens,
        output_tokens: chunk.usage.outputTokens,
        cache_creation_input_tokens: chunk.usage.cacheWriteTokens ?? 0,
        cache_read_input_tokens: chunk.usage.cacheReadTokens ?? 0,
      }
    } else if (type === 'finish') {
      const reason = chunk.reason
      if (reason.kind === 'error' || reason.kind === 'aborted') {
        yield sse({ type: 'error', error: { message: reason.failure.message } })
        return
      }
      for (const open of blocks) yield sse({ type: 'content_block_stop', index: open })
      const stopReason = { 'max-tokens': 'max_tokens', 'tool-calls': 'tool_use' }[reason.kind] ?? 'end_turn'
      yield sse({ type: 'message_delta', delta: { stop_reason: stopReason, stop_sequence: null }, usage })
      yield sse({ type: 'message_stop' })
      return
    }
  }
}

export async function streamConfiguredModel(ctx, options, res) {
  const controller = new AbortController()
  res.once('close', () => {
    if (!res.writableEnded) controller.abort()
  })
  const chunks = ctx.get('llm').stream({ ...options, signal: controller.signal })
  res.writeHead(200, {
    'content-type': 'text/event-stream; charset=utf-8',
    'cache-control': 'no-cache',
  })
  await pipeline(Readable.from(webviewEvents(chunks, options.model)), res)
}
