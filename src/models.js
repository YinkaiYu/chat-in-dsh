/**
 * 模型目录与当前选择。
 *
 * 网页版前端把 model 写死成 `deepseek-flash`（`webview/dist` 里的 ek 常量），
 * 所以"换模型"只能在宿主做：目录由插件配置给出，选择落在 DSH_HOME 下的一个
 * 小状态文件里；请求转发前用所选模型替换请求体里的 model。
 *
 * 不配置 `models` 时目录只有官方 DeepSeek 一项，行为与之前完全一致：
 * 请求体原样转发，不替换、不改写。
 */
import fs from 'node:fs'
import path from 'node:path'

/** 官方网页版使用的模型名；前端请求体里写死的就是它。 */
export const DEFAULT_MODEL_ID = 'deepseek-flash'

/** 支持的两种上游协议。 */
const APIS = new Set(['anthropic', 'openai'])

/** 未配置模型目录时的唯一一项。 */
function defaultEntry() {
  return {
    id: DEFAULT_MODEL_ID,
    label: 'DeepSeek 网页版',
    api: 'anthropic',
    baseURL: undefined,
    upstreamModel: undefined,
    apiKeyEnv: undefined,
  }
}

/** 把配置里的一项规范化；id 缺失或协议不认识时返回 undefined（整项丢弃）。 */
function normalizeEntry(raw) {
  if (raw === null || typeof raw !== 'object') return undefined
  const id = typeof raw.id === 'string' ? raw.id.trim() : ''
  if (id === '') return undefined
  const api = typeof raw.api === 'string' ? raw.api.trim().toLowerCase() : 'anthropic'
  if (!APIS.has(api)) return undefined
  let baseURL
  if (typeof raw.baseURL === 'string' && raw.baseURL.trim() !== '') {
    baseURL = raw.baseURL.trim()
    try {
      new URL(baseURL)
    } catch {
      return undefined
    }
  }
  const upstreamModel = typeof raw.upstreamModel === 'string' && raw.upstreamModel.trim() !== ''
    ? raw.upstreamModel.trim()
    : undefined
  const apiKeyEnv = typeof raw.apiKeyEnv === 'string' && raw.apiKeyEnv.trim() !== ''
    ? raw.apiKeyEnv.trim()
    : undefined
  const label = typeof raw.label === 'string' && raw.label.trim() !== '' ? raw.label.trim() : id
  return { id, label, api, baseURL, upstreamModel, apiKeyEnv }
}

/**
 * 解析插件配置里的模型目录。
 * @returns {{ entries: Array<object>, isDefault: boolean, defaultId: string }}
 *   `isDefault` 为 true 表示用户没配目录，此时不替换请求体里的 model。
 */
export function modelCatalog(config = {}) {
  const raw = Array.isArray(config?.models) ? config.models : []
  const entries = []
  const seen = new Set()
  for (const item of raw) {
    const entry = normalizeEntry(item)
    if (entry === undefined || seen.has(entry.id)) continue
    seen.add(entry.id)
    entries.push(entry)
  }
  if (entries.length === 0) {
    const only = defaultEntry()
    return { entries: [only], isDefault: true, defaultId: only.id }
  }
  const configuredDefault = typeof config?.defaultModel === 'string' ? config.defaultModel.trim() : ''
  const defaultId = seen.has(configuredDefault) ? configuredDefault : entries[0].id
  return { entries, isDefault: false, defaultId }
}

/** 按 id 找目录项。 */
export function findModelEntry(catalog, id) {
  if (typeof id !== 'string' || id === '') return undefined
  return catalog.entries.find(entry => entry.id === id)
}

/** 模型选择状态文件：默认 DSH_HOME/chat-in-dsh/model-state.json，可用 config.stateFile 覆盖。 */
export function resolveStateFile(home, config = {}) {
  if (typeof config?.stateFile === 'string' && config.stateFile.trim() !== '') return config.stateFile.trim()
  return path.join(home, 'chat-in-dsh', 'model-state.json')
}

/** 读选择；文件缺失或内容损坏时返回 undefined（回退默认模型）。 */
export function readSelection(file) {
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'))
    return typeof parsed?.model === 'string' && parsed.model !== '' ? parsed.model : undefined
  } catch {
    return undefined
  }
}

/** 写选择：先写同目录临时文件再改名，避免写到一半留下坏 JSON。 */
export function writeSelection(file, id) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const temporary = `${file}.${process.pid}.tmp`
  fs.writeFileSync(temporary, `${JSON.stringify({ model: id }, null, 2)}\n`, { mode: 0o600 })
  fs.renameSync(temporary, file)
}

/** 当前生效的模型 id：状态文件 → 配置默认 → 目录第一项。 */
export function activeModelId(catalog, selection) {
  if (findModelEntry(catalog, selection) !== undefined) return selection
  return catalog.defaultId
}

/**
 * 模型注册表：目录 + 选择文件。
 * 每次 active() 都重读状态文件，所以外部改文件（或用设置页切换）都能立刻生效。
 */
export function createModelRegistry(config, home) {
  const catalog = modelCatalog(config)
  const file = resolveStateFile(home, config)
  return {
    catalog,
    file,
    list() {
      return catalog.entries.map(entry => ({
        id: entry.id,
        label: entry.label,
        api: entry.api,
        default: entry.id === catalog.defaultId,
      }))
    },
    activeId() {
      return activeModelId(catalog, readSelection(file))
    },
    active() {
      const id = activeModelId(catalog, readSelection(file))
      return findModelEntry(catalog, id) ?? catalog.entries[0]
    },
    select(id) {
      if (findModelEntry(catalog, id) === undefined) return false
      writeSelection(file, id)
      return true
    },
  }
}
