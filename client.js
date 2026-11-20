/**
 * 浏览器半边。
 *
 * 一个入口：左侧面板列表里的「网页版」。
 * 另外在会话的右键菜单里加一行「导入到网页版」——一次性复制，复制完两边各管各的。
 */
window.__ModuleLoader__.load({
  id: 'chat-in-dsh',
  factory(require) {
    const React = require('react')
    const { createPortal } = require('react-dom')
    const h = React.createElement

    // 官方字标（小鲸鱼）内联为 data URI：侧栏图标不依赖任何额外请求。
    const PANEL_ICON = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNyIgaGVpZ2h0PSIyMCIgdmlld0JveD0iMC4xNjMgMS43NSAyNi42MzQgMTkuNiIgZmlsbD0ibm9uZSIgcm9sZT0iaW1nIiBhcmlhLWxhYmVsPSJEZWVwU2VlayI+CiAgPHBhdGggZD0iTTI2LjUxNzQgMy4zOTQ3MUMyNi4yMzUgMy4yNTY3IDI2LjExMzcgMy41MjAwNiAyNS45NDg3IDMuNjUzNDZDMjUuODkyMyAzLjY5NjU5IDI1Ljg0NDYgMy43NTI5NCAyNS43OTY5IDMuODA0NjlDMjUuMzg0NiA0LjI0NTE2IDI0LjkwMjcgNC41MzQzOSAyNC4yNzM3IDQuNDk5ODlDMjMuMzUzNiA0LjQ0ODE0IDIyLjU2ODIgNC43MzczNyAyMS44NzM1IDUuNDQxMTlDMjEuNzI1OCA0LjU3MzQ5IDIxLjIzNTMgNC4wNTU0IDIwLjQ4ODkgMy43MjMwNEMyMC4wOTg1IDMuNTUwNTQgMTkuNzAzNCAzLjM3NzQ2IDE5LjQyOTcgMy4wMDE5N0MxOS4yMzg4IDIuNzM0NTkgMTkuMTg2NSAyLjQzNjczIDE5LjA5MSAyLjE0Mjg5QzE5LjAzMDEgMS45NjU3OSAxOC45Njk3IDEuNzg0NjYgMTguNzY1NiAxLjc1NDE4QzE4LjU0NDIgMS43MTk2OCAxOC40NTc0IDEuOTA1NDEgMTguMzcwNSAyLjA2MDY3QzE4LjAyMzIgMi42OTU0OSAxNy44ODg3IDMuMzk0NzEgMTcuOTAxOSA0LjEwMzEzQzE3LjkzMjQgNS42OTY1IDE4LjYwNTEgNi45NjU1NiAxOS45NDIxIDcuODY4MzRDMjAuMDkzOSA3Ljk3MTg0IDIwLjEzMyA4LjA3NTM1IDIwLjA4NTIgOC4yMjY1OEMxOS45OTM4IDguNTM3NjYgMTkuODg1NyA4LjgzOTU1IDE5Ljc5MDMgOS4xNTA2M0MxOS43MjkzIDkuMzQ5MDEgMTkuNjM4NCA5LjM5MjcxIDE5LjQyNTcgOS4zMDU4OEMxOC42OTIgOC45OTk0IDE4LjA1ODMgOC41NDU3MSAxNy40OTgyIDcuOTk3NzJDMTYuNTQ3NyA3LjA3ODI3IDE1LjY4ODEgNi4wNjMzNiAxNC42MTYyIDUuMjY4NjlDMTQuMzY0NCA1LjA4Mjk2IDE0LjExMjUgNC45MTA0NSAxMy44NTIxIDQuNzQ2QzEyLjc1ODQgMy42ODM5NCAxMy45OTUyIDIuODExNjQgMTQuMjgxNiAyLjcwODE0QzE0LjU4MTIgMi42MDAwMyAxNC4zODU3IDIuMjI4NTcgMTMuNDE3OSAyLjIzMzE3QzEyLjQ1MDIgMi4yMzcyIDExLjU2NDYgMi41NjE1MSAxMC40MzU5IDIuOTkzMzVDMTAuMjcwOCAzLjA1ODMyIDEwLjA5NzIgMy4xMDU0NyA5LjkxOTUxIDMuMTQ0NTdDOC44OTU0IDIuOTUwMjIgNy44MzE2MiAyLjkwNzA5IDYuNzIwNjkgMy4wMzI0NUM0LjYyODc3IDMuMjY1MzMgMi45NTc3NyA0LjI1NDM2IDEuNzI5NTQgNS45NDI2MUMwLjI1NDA0MyA3Ljk3MTg0IC0wLjA5MzI2NzggMTAuMjc3NyAwLjMzMTY3IDEyLjY4MjRDMC43Nzg0NTggMTUuMjE3MSAyLjA3MjI1IDE3LjMxNTMgNC4wNjAwOCAxOC45NTU4QzYuMTIxNTIgMjAuNjU2NyA4LjQ5NTc3IDIxLjQ5MDUgMTEuMjA0NyAyMS4zMzA2QzEyLjg0OTggMjEuMjM1OCAxNC42ODEyIDIxLjAxNTUgMTYuNzQ3MyAxOS4yNjY5QzE3LjI2ODIgMTkuNTI2MiAxNy44MTUxIDE5LjYyOTcgMTguNzIxOSAxOS43MDc0QzE5LjQyMDUgMTkuNzcyMyAyMC4wOTMzIDE5LjY3MjkgMjAuNjE0MyAxOS41NjQ4QzIxLjQzMDIgMTkuMzkyMyAyMS4zNzM5IDE4LjYzNjcgMjEuMDc4OSAxOC40OTgxQzE4LjY4NzQgMTcuMzg0MyAxOS4yMTI0IDE3LjgzNzQgMTguNzM1MSAxNy40NzA2QzE5Ljk1MDEgMTYuMDMzIDIxLjgwNjMgMTMuNDc3NiAyMi4zNzkgOS45OTgyMUMyMi40MzUzIDkuNjE0MDkgMjIuNTA3MiA5LjA3MyAyMi40OTg2IDguNzYxOTJDMjIuNDk0IDguNTcyMTYgMjIuNTM3NyA4LjQ5ODU2IDIyLjc1NDUgOC40NzY3MUMyMy4zNTM2IDguNDA3NzEgMjMuOTM1IDguMjQzODMgMjQuNDY5MiA3Ljk0OTk5QzI2LjAxODggNy4xMDM1NyAyNi42NDM5IDUuNzEzMTggMjYuNzkxMSA0LjA0Njc4QzI2LjgxMjkgMy43OTIwNCAyNi43ODY1IDMuNTI4NjkgMjYuNTE3NCAzLjM5NDcxWk0xMy4wMTQzIDE4LjM5NDZDMTAuNjk2NCAxNi41NzI0IDkuNTcyMiAxNS45NzI2IDkuMTA4MTYgMTUuOTk4NUM4LjY3NDAyIDE2LjAyNDQgOC43NTIyMiAxNi41MjEyIDguODQ3NjggMTYuODQ0OUM4Ljk0NzczIDE3LjE2NDYgOS4wNzc2OCAxNy4zODQ5IDkuMjU5OTYgMTcuNjY1NUM5LjM4NTg5IDE3Ljg1MTIgOS40NzI3MiAxOC4xMjcyIDkuMTM0MDQgMTguMzM0OEM4LjM4NzY2IDE4Ljc5NjUgNy4wODk4NSAxOC4xNzk2IDcuMDI4OSAxOC4xNDkxQzUuNTE4MzMgMTcuMjU5NSA0LjI1NTU5IDE2LjA4NTMgMy4zNjU0NiAxNC40NzkzQzIuNTA1ODEgMTIuOTMzNyAyLjAwNjcgMTEuMjc1MyAxLjkyNDQ3IDkuNTA1NDJDMS45MDI2MiA5LjA3ODE4IDIuMDI4NTUgOC45MjY5NSAyLjQ1NDA2IDguODQ5MzJDMy4wMTQxMyA4Ljc0NTgyIDMuNTkxNDQgOC43MjM5NyA0LjE1MDkzIDguODA2MTlDNi41MTY1NiA5LjE1MTc4IDguNTMwMjcgMTAuMjA5MiAxMC4yMTg1IDExLjg4NDhDMTEuMTgyMiAxMi44Mzg4IDExLjkxMTQgMTMuOTc5IDEyLjY2MjMgMTUuMDkyOUMxMy40NjEgMTYuMjc1NyAxNC4zMjAxIDE3LjQwMjcgMTUuNDE0NCAxOC4zMjY4QzE1LjgwMDggMTguNjUwNSAxNi4xMDkgMTguODk2NiAxNi40MDQgMTkuMDc4M0MxNS41MTQ0IDE5LjE3NzggMTQuMDI5NyAxOS4xOTkxIDEzLjAxNDMgMTguMzk1OFYxOC4zOTQ2Wk0xNC4xMjUyIDExLjI0ODlDMTQuMTI1MiAxMS4wNTkxIDE0LjI3NyAxMC45MDc5IDE0LjQ2NzkgMTAuOTA3OUMxNC41MTEgMTAuOTA3OSAxNC41NTAxIDEwLjkxNjUgMTQuNTg1MiAxMC45MjkyQzE0LjYzMjkgMTAuOTQ2NCAxNC42NzY2IDEwLjk3MjMgMTQuNzExMSAxMS4wMTE0QzE0Ljc3MjEgMTEuMDcxOCAxNC44MDY2IDExLjE1OCAxNC44MDY2IDExLjI0ODlDMTQuODA2NiAxMS40Mzg2IDE0LjY1NDggMTEuNTg5OSAxNC40NjM5IDExLjU4OTlDMTQuMjczIDExLjU4OTkgMTQuMTI1MiAxMS40Mzg2IDE0LjEyNTIgMTEuMjQ4OVpNMTcuNTc1OSAxMy4wMTg4QzE3LjM1NDUgMTMuMTA5NiAxNy4xMzMxIDEzLjE4NzMgMTYuOTIwMyAxMy4xOTU5QzE2LjU5MDMgMTMuMjEzMSAxNi4yMzAzIDEzLjA3OTEgMTYuMDM0OCAxMi45MTUzQzE1LjczMTIgMTIuNjYwNSAxNS41MTM5IDEyLjUxNzkgMTUuNDIzIDEyLjA3MzRDMTUuMzgzOSAxMS44ODM3IDE1LjQwNTcgMTEuNTg5OSAxNS40NDAyIDExLjQyMTRDMTUuNTE4NSAxMS4wNTg1IDE1LjQzMTYgMTAuODI1NyAxNS4xNzU3IDEwLjYxNEMxNC45Njc2IDEwLjQ0MTUgMTQuNzAyNSAxMC4zOTM4IDE0LjQxMTUgMTAuMzkzOEMxNC4zMDI5IDEwLjM5MzggMTQuMjAzNCAxMC4zNDYxIDE0LjEyOTIgMTAuMzA3NkMxNC4wMDc5IDEwLjI0NzIgMTMuOTA3OCAxMC4wOTYgMTQuMDAzMyA5LjkxMDIzQzE0LjAzMzggOS44NDk4NSAxNC4xODE1IDkuNzAzMjIgMTQuMjE2IDkuNjc3MzRDMTQuNjExMSA5LjQ1MjUxIDE1LjA2NjUgOS41MjYxMiAxNS40ODggOS42OTQ2QzE1Ljg3ODQgOS44NTQ0NSAxNi4xNzQgMTAuMTQ3NyAxNi41OTg5IDEwLjU2MjNDMTcuMDMzIDExLjA2MzEgMTcuMTExMiAxMS4yMDExIDE3LjM1ODUgMTEuNTc3MkMxNy41NTQgMTEuODcxIDE3LjczMTcgMTIuMTcyOSAxNy44NTM2IDEyLjUxODVDMTcuOTI3MiAxMi43MzQxIDE3LjgzMTcgMTIuOTEwNyAxNy41NzU5IDEzLjAxODhaIiBmaWxsPSIjMzk2NEZFIi8+Cjwvc3ZnPgo='

    // DSH 桌面的麦克风权限只授予主框架（iframe 一律拒绝），
    // 所以录音放在宿主主框架做，面板 iframe 通过同源 window.top 取音频流。
    const installMicBridge = () => {
      try {
        window.__dshPanelMic = {
          async getStream() {
            if (!navigator.mediaDevices?.getUserMedia) throw new Error('麦克风不可用')
            return navigator.mediaDevices.getUserMedia({
              audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
            })
          },
        }
      } catch (_error) {
        // 非浏览器环境或跨源限制：面板会回退到自身 getUserMedia。
      }
    }
    // DSH 网页版的账号头像由 shell 自己渲染，没有暴露成 Slot。这里按位置找：
    // 侧栏左下角、16~64px 的 img，把 src 写进同源 localStorage，面板搜索结果的用户行直接读。
    const publishUserAvatar = () => {
      try {
        const findAvatar = () => {
          let found = null
          for (const img of document.querySelectorAll('img')) {
            const rect = img.getBoundingClientRect()
            if (rect.width < 16 || rect.width > 64 || rect.height < 16 || rect.height > 64) continue
            if (rect.left > 320 || rect.top < window.innerHeight - 160) continue
            const src = img.currentSrc || img.src
            if (src) found = src
          }
          return found
        }
        const apply = () => {
          const src = findAvatar()
          if (src !== null && window.localStorage.getItem('dsh:user-avatar') !== src) {
            window.localStorage.setItem('dsh:user-avatar', src)
          }
        }
        apply()
        if (typeof MutationObserver !== 'function') return undefined
        let scheduled = false
        const observer = new MutationObserver(() => {
          if (scheduled) return
          scheduled = true
          setTimeout(() => {
            scheduled = false
            apply()
          }, 200)
        })
        observer.observe(document.body, { childList: true, subtree: true })
        return () => observer.disconnect()
      } catch (_error) {
        return undefined
      }
    }
    // 导入完成后让面板重新加载一次，好让新会话出现在列表里。
    const importBus = { token: 0, listeners: new Set() }
    const notifyImported = () => {
      importBus.token += 1
      for (const listener of importBus.listeners) listener(importBus.token)
    }

    const modelSeat = 'conversation.input.model'
    const modelDefault = '/webchat/api/model/default'

    /** Supply the native selector with the profile default in place of a session directory. */
    function defaultModelDirectory(ctx) {
      let state = { current: null, groups: [], failures: [], status: 'idle', pending: null, error: null }
      let loading
      let saves = 0
      const listeners = new Set()
      const update = (next) => {
        state = { ...state, ...next }
        for (const listener of listeners) listener()
      }
      const store = {
        getSnapshot: () => state,
        subscribe(listener) {
          listeners.add(listener)
          return () => listeners.delete(listener)
        },
      }
      const read = async () => {
        const revision = saves
        try {
          const response = await fetch(modelDefault)
          if (!response.ok) return
          const { current } = await response.json()
          if (saves === revision && state.pending === null && JSON.stringify(current) !== JSON.stringify(state.current)) {
            update({ current })
          }
        } catch {
          // Retry on the next refresh.
        }
      }
      const load = () => {
        if (loading) return loading
        update({ status: 'loading', error: null })
        loading = Promise.resolve().then(async () => {
          try {
            const result = await ctx.get('remote').session.modelCatalog()
            if (!result.ok) throw new Error(result.error.message)
            update({ groups: result.value.groups, failures: result.value.failures, status: 'ready' })
            await read()
          } catch (error) {
            update({ status: 'error', error: String(error?.message ?? error) })
          } finally {
            loading = undefined
          }
        })
        return loading
      }
      const select = async (pending) => {
        saves += 1
        update({ pending, error: null })
        try {
          const response = await fetch(modelDefault, {
            method: 'PUT',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(pending),
          })
          const body = await response.json()
          if (!response.ok) throw new Error(body.error?.message ?? String(response.status))
          update({ current: body.current })
          return { ok: true, value: body.current }
        } catch (error) {
          return { ok: false, error: { code: 'webchat/model', message: String(error?.message ?? error) } }
        } finally {
          update({ pending: null })
        }
      }
      return { store, load, read, select }
    }

    /** Keep the native button and its drop-down in the host document for CSS anchoring. */
    function ModelPicker({ ctx, iframe }) {
      const slot = React.useSyncExternalStore(
        (fn) => ctx.slots.subscribe(modelSeat, fn),
        () => ctx.slots.entries(modelSeat).find(entry => entry.locale === 'model'),
      )
      const NativePicker = slot?.component
      const [position, setPosition] = React.useState(null)
      const directory = React.useMemo(() => defaultModelDirectory(ctx), [ctx])
      React.useEffect(() => {
        if (!NativePicker) return
        void directory.load()
        const timer = setInterval(directory.read, 1000)
        return () => clearInterval(timer)
      }, [NativePicker, directory])

      React.useEffect(() => {
        if (!iframe || !NativePicker) return
        let doc
        let tick = 0
        let anchor
        const readPosition = () => {
          tick = 0
          const next = doc?.querySelector('[data-dsh-model-picker]')
          if (next !== anchor) {
            if (anchor) resize.unobserve(anchor)
            anchor = next
            if (anchor) resize.observe(anchor)
          }
          const viewport = iframe.getBoundingClientRect()
          if (!anchor || viewport.width === 0) {
            setPosition(null)
            return
          }
          const compact = viewport.width < 480
          const width = compact ? 30 : Math.min(225, Math.round(viewport.width / 4))
          anchor.hidden = false
          if (anchor.style.width !== `${width}px`) anchor.style.width = `${width}px`
          const { left, top, height } = anchor.getBoundingClientRect()
          if (!height || top < 0 || top + height > viewport.height) {
            setPosition(null)
            return
          }
          const x = viewport.left + left
          const y = viewport.top + top
          setPosition(old => old?.x === x && old?.y === y && old?.width === width ? old : { x, y, width, compact })
        }
        const schedule = () => {
          if (tick === 0) tick = requestAnimationFrame(readPosition)
        }
        const closeFromFrame = () => document.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
        const resize = new ResizeObserver(schedule)
        const mutations = new MutationObserver(schedule)
        const detachDocument = () => {
          mutations.disconnect()
          doc?.removeEventListener('scroll', schedule, true)
          doc?.removeEventListener('mousedown', closeFromFrame, true)
        }
        const attachDocument = () => {
          detachDocument()
          doc = iframe.contentDocument
          if (!doc?.body) return
          mutations.observe(doc.body, { childList: true, subtree: true })
          doc.addEventListener('scroll', schedule, true)
          doc.addEventListener('mousedown', closeFromFrame, true)
          schedule()
        }
        resize.observe(iframe)
        iframe.addEventListener('load', attachDocument)
        window.addEventListener('resize', schedule)
        window.addEventListener('scroll', schedule, true)
        attachDocument()
        return () => {
          if (tick !== 0) cancelAnimationFrame(tick)
          resize.disconnect()
          detachDocument()
          iframe.removeEventListener('load', attachDocument)
          window.removeEventListener('resize', schedule)
          window.removeEventListener('scroll', schedule, true)
          if (anchor) anchor.hidden = true
        }
      }, [iframe, NativePicker])

      if (!NativePicker || !position) return null
      const locale = ctx.get('locale')
      return createPortal(h('div', {
        'data-composer-card': '',
        'data-chat-in-dsh-model': '',
        style: {
          position: 'fixed', left: position.x, top: position.y,
          maxWidth: position.width, zIndex: 3,
          ...(position.compact ? {
            '--dsh-composer-model-icon-display': 'inline-flex',
            '--dsh-composer-model-text-display': 'none',
          } : {}),
        },
      }, h(NativePicker, {
        locked: false, available: true, directory: directory.store,
        load: directory.load, select: directory.select,
        resolveText: text => locale.resolveText(text), t: locale.bind('model'),
        renderSlot: (_key, _owner, options) => options?.fallback ?? null,
      })), document.body)
    }

    const frame = (key, src, title, ref) => h('iframe', {
      key,
      src,
      title,
      ref,
      allow: 'clipboard-write; microphone',
      style: { width: '100%', height: '100%', border: 'none', display: 'block', background: '#fff' },
    })

    /** 左侧面板：完整的网页版，带它自己的会话列表。 */
    function Panel({ context }) {
      const [token, setToken] = React.useState(importBus.token)
      const [iframe, setIframe] = React.useState(null)
      React.useEffect(() => {
        const listener = (value) => setToken(value)
        importBus.listeners.add(listener)
        return () => importBus.listeners.delete(listener)
      }, [])
      return h('div', { style: { height: '100%', minHeight: 320, display: 'flex' } },
        h('div', { style: { flex: 1, minWidth: 0 } }, frame(token, '/webchat/', 'DeepSeek 网页版', setIframe)),
        h(ModelPicker, { ctx: context, iframe }))
    }

    /** 会话菜单里的图标：一个"导入到托盘"的线性图标，风格对齐宿主其它条目。 */
    function ImportIcon() {
      return h('svg', {
        viewBox: '0 0 16 16',
        width: 16,
        height: 16,
        fill: 'none',
        stroke: 'currentColor',
        strokeWidth: 1.4,
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
        'aria-hidden': true,
      },
        h('path', { d: 'M8 2.5v6.2' }),
        h('path', { d: 'M5.4 6.3 8 8.9l2.6-2.6' }),
        h('path', { d: 'M3 10.4v1.8c0 .8.6 1.4 1.4 1.4h7.2c.8 0 1.4-.6 1.4-1.4v-1.8' }))
    }
    /** 侧栏图标；size 由侧栏按宽窄状态给出。 */
    function PanelIcon(props) {
      const size = typeof props?.size === 'number' ? props.size : 16
      return h('img', {
        src: PANEL_ICON,
        alt: 'DeepSeek',
        style: { height: size, width: size, objectFit: 'contain', display: 'block' },
      })
    }

    return {
      inject: ['slots', 'layout', 'contextMenus', 'locale', 'remote', 'remote.session'],
      apply(ctx) {
        installMicBridge()
        const stopAvatar = publishUserAvatar()

        ctx.effect(() => ctx.slots.inject('main', () => ctx.slots.register({
          name: 'main',
          key: 'chat-in-dsh',
        }, () => h(Panel, { context: ctx }))), 'webchat.panel')

        ctx.effect(() => ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
          name: 'sidebar.panellist',
          id: 'chat-in-dsh',
          order: 20,
          label: '网页版',
        }, PanelIcon)), 'webchat.panellist')

        ctx.effect(() => ctx.slots.inject('contextMenu.icon', () => ctx.slots.register({
          name: 'contextMenu.icon',
          key: 'chat-in-dsh',
        }, ImportIcon)), 'webchat.import-icon')
        // 会话菜单：注册成正规条目，样式、键盘操作、选中后收起都交给宿主。
        ctx.effect(() => ctx.contextMenus.register({
          id: 'chat-in-dsh',
          target: 'session',
          order: 10,
          resolve: (target) => [{
            id: 'chat-in-dsh:import',
            label: '导入到网页版',
            icon: { key: 'chat-in-dsh' },
            afterContent: true,
            run: async () => {
              const response = await fetch('/webchat/api/import/stage', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ sessionId: String(target.sessionId) }),
              })
              if (!response.ok) throw new Error(`stage failed: ${response.status}`)
              notifyImported()
              ctx.layout.selectPanel('chat-in-dsh')
              ctx.contextMenus.notify('已导入到网页版', true)
            },
            failureLabel: '导入失败',
          }],
        }), 'webchat.import')

        ctx.effect(() => () => {
          if (window.__dshPanelMic !== undefined) delete window.__dshPanelMic
        }, 'webchat.mic-bridge')

        ctx.effect(() => () => {
          stopAvatar?.()
        }, 'webchat.avatar')
      },
    }
  },
})


