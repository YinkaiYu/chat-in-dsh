import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import {
  DEFAULT_MODEL_ID,
  activeModelId,
  createModelRegistry,
  findModelEntry,
  modelCatalog,
  readSelection,
  resolveStateFile,
  writeSelection,
} from '../src/models.js'

const tempDir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'chat-in-dsh-models-'))

test('没配 models 时目录只有官方 DeepSeek，且标记为默认行为', () => {
  const catalog = modelCatalog({})
  assert.equal(catalog.isDefault, true)
  assert.equal(catalog.entries.length, 1)
  assert.equal(catalog.entries[0].id, DEFAULT_MODEL_ID)
  assert.equal(catalog.entries[0].api, 'anthropic')
  assert.equal(catalog.defaultId, DEFAULT_MODEL_ID)
})

test('配了 models 就不再是默认行为，且默认取第一项', () => {
  const catalog = modelCatalog({
    models: [
      { id: 'glm-5.3-flash', api: 'openai', baseURL: 'http://127.0.0.1:18088/openai/v1', apiKeyEnv: 'BIFROST_VIRTUAL_KEY', upstreamModel: 'agent2api/glm-5.3-flash' },
      { id: 'deepseek-flash' },
    ],
  })
  assert.equal(catalog.isDefault, false)
  assert.deepEqual(catalog.entries.map(entry => entry.id), ['glm-5.3-flash', 'deepseek-flash'])
  assert.equal(catalog.defaultId, 'glm-5.3-flash')
  assert.equal(catalog.entries[0].upstreamModel, 'agent2api/glm-5.3-flash')
  assert.equal(catalog.entries[0].apiKeyEnv, 'BIFROST_VIRTUAL_KEY')
  assert.equal(catalog.entries[1].api, 'anthropic')
  assert.equal(catalog.entries[1].baseURL, undefined)
})

test('defaultModel 指向目录里存在的项时用它', () => {
  const catalog = modelCatalog({
    models: [{ id: 'a' }, { id: 'b' }],
    defaultModel: 'b',
  })
  assert.equal(catalog.defaultId, 'b')
})

test('defaultModel 不在目录里时回退第一项', () => {
  const catalog = modelCatalog({ models: [{ id: 'a' }], defaultModel: 'nope' })
  assert.equal(catalog.defaultId, 'a')
})

test('坏目录项被丢弃：缺 id、协议不认识、baseURL 不是 URL', () => {
  const catalog = modelCatalog({
    models: [
      { api: 'openai' },
      { id: '' },
      { id: 'bad-api', api: 'grpc' },
      { id: 'bad-url', baseURL: 'not a url' },
      { id: 'ok' },
    ],
  })
  assert.deepEqual(catalog.entries.map(entry => entry.id), ['ok'])
})

test('重复 id 只保留第一项', () => {
  const catalog = modelCatalog({ models: [{ id: 'x', label: 'first' }, { id: 'x', label: 'second' }] })
  assert.equal(catalog.entries.length, 1)
  assert.equal(catalog.entries[0].label, 'first')
})

test('models 全是坏项时退回默认单项目录', () => {
  const catalog = modelCatalog({ models: [{ id: '' }] })
  assert.equal(catalog.isDefault, true)
  assert.equal(catalog.entries.length, 1)
})

test('选择状态文件可写入可读回，且文件权限收在 0600', () => {
  const dir = tempDir()
  const file = path.join(dir, 'chat-in-dsh', 'model-state.json')
  assert.equal(readSelection(file), undefined)
  writeSelection(file, 'glm-5.3-flash')
  assert.equal(readSelection(file), 'glm-5.3-flash')
  if (process.platform !== 'win32') {
    assert.equal(fs.statSync(file).mode & 0o777, 0o600)
  }
})

test('状态文件损坏时按未选择处理', () => {
  const dir = tempDir()
  const file = path.join(dir, 'broken.json')
  fs.writeFileSync(file, '{not json')
  assert.equal(readSelection(file), undefined)
})

test('activeModelId 跳过目录里不存在的选择', () => {
  const catalog = modelCatalog({ models: [{ id: 'a' }, { id: 'b' }] })
  assert.equal(activeModelId(catalog, 'b'), 'b')
  assert.equal(activeModelId(catalog, 'gone'), 'a')
  assert.equal(activeModelId(catalog, undefined), 'a')
})

test('stateFile 可用配置覆盖，默认落在 DSH_HOME 下', () => {
  assert.equal(resolveStateFile('/home/x', {}), path.join('/home/x', 'chat-in-dsh', 'model-state.json'))
  assert.equal(resolveStateFile('/home/x', { stateFile: '/tmp/s.json' }), '/tmp/s.json')
})

test('注册表切换模型后立刻生效，未知模型被拒', () => {
  const dir = tempDir()
  const config = { models: [{ id: 'a' }, { id: 'b' }], stateFile: path.join(dir, 'state.json') }
  const models = createModelRegistry(config, dir)
  assert.equal(models.active().id, 'a')
  assert.equal(models.select('b'), true)
  assert.equal(models.active().id, 'b')
  assert.equal(models.select('nope'), false)
  assert.equal(models.active().id, 'b')
})

test('注册表发现外部改写的状态文件', () => {
  const dir = tempDir()
  const stateFile = path.join(dir, 'state.json')
  const models = createModelRegistry({ models: [{ id: 'a' }, { id: 'b' }], stateFile }, dir)
  assert.equal(models.active().id, 'a')
  fs.writeFileSync(stateFile, JSON.stringify({ model: 'b' }))
  assert.equal(models.active().id, 'b')
})

test('注册表把选中项落到配置的目录项上', () => {
  const dir = tempDir()
  const config = {
    models: [
      { id: 'deepseek-flash' },
      { id: 'glm-5.3-flash', api: 'openai', baseURL: 'http://127.0.0.1:1/v1', upstreamModel: 'agent2api/glm-5.3-flash' },
    ],
    stateFile: path.join(dir, 'state.json'),
  }
  const models = createModelRegistry(config, dir)
  const entry = findModelEntry(models.catalog, 'glm-5.3-flash')
  assert.equal(entry.upstreamModel, 'agent2api/glm-5.3-flash')
  assert.equal(entry.api, 'openai')
})
