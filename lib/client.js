// dsh-memory — cross-session memory vault for DeepSeek Harness (Client half).
//
// Registers a "记忆库 / Memory" page in the settings section. The page lists,
// adds, and deletes vault entries through the host half's webServer JSON route
// (GET/POST /dsh-memory/entries).
//
// Client entries must be classic scripts that register via
// window.__ModuleLoader__.load({ id, factory }); the factory receives a
// synchronous `require` and returns the module exports.
window.__ModuleLoader__.load({
  id: 'dsh-memory-vault',
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports
    Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' })

    const React = require('react')

    const name = 'dsh-memory'

    async function api(method, payload) {
      const opts = { method, headers: {} }
      if (payload) {
        opts.headers['Content-Type'] = 'application/json'
        opts.body = JSON.stringify(payload)
      }
      const res = await fetch('/dsh-memory/entries', opts)
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error((data && data.error) || 'HTTP ' + res.status)
      return data
    }

    function MemoryPage() {
      const [entries, setEntries] = React.useState([])
      const [error, setError] = React.useState('')
      const [draft, setDraft] = React.useState('')
      const [busy, setBusy] = React.useState(false)

      const refresh = () => {
        api('GET')
          .then((res) => setEntries(res && Array.isArray(res.entries) ? res.entries : []))
          .catch((err) => setError(String((err && err.message) || err)))
      }

      React.useEffect(() => {
        refresh()
      }, [])

      const remove = (id) => {
        api('POST', { action: 'delete', id })
          .then(() => refresh())
          .catch((err) => setError(String((err && err.message) || err)))
      }

      const add = () => {
        const content = draft.trim()
        if (!content || busy) return
        setBusy(true)
        api('POST', { action: 'add', content, tags: [] })
          .then(() => {
            setDraft('')
            refresh()
          })
          .catch((err) => setError(String((err && err.message) || err)))
          .then(() => setBusy(false))
      }

      const rows = entries.map((e) =>
        React.createElement(
          'div',
          {
            key: e.id,
            style: {
              display: 'flex',
              alignItems: 'flex-start',
              justifyContent: 'space-between',
              gap: '10px',
              padding: '10px 12px',
              border: '1px solid rgba(128,128,128,0.35)',
              borderRadius: '8px',
            },
          },
          React.createElement(
            'div',
            { style: { display: 'flex', flexDirection: 'column', gap: '4px', minWidth: 0 } },
            React.createElement('div', null, e.content),
            React.createElement(
              'div',
              { style: { fontSize: '12px', opacity: 0.7 } },
              (Array.isArray(e.tags) && e.tags.length ? '#' + e.tags.join(' #') + ' · ' : '') +
                String(e.createdAt || '').slice(0, 16),
            ),
          ),
          React.createElement('button', { onClick: () => remove(e.id), style: { flexShrink: 0 } }, '删除'),
        ),
      )

      return React.createElement(
        'div',
        { style: { padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' } },
        React.createElement('div', { style: { fontWeight: 600 } }, '记忆库（dsh-memory 跨会话记忆）'),
        React.createElement(
          'div',
          { style: { display: 'flex', gap: '8px' } },
          React.createElement('input', {
            value: draft,
            onChange: (ev) => setDraft(ev.target.value),
            placeholder: '快速记一条…',
            style: { flex: 1 },
          }),
          React.createElement('button', { onClick: add, disabled: busy }, '添加'),
        ),
        error ? React.createElement('div', { style: { color: '#e06c75' } }, error) : null,
        entries.length === 0
          ? React.createElement('div', { style: { opacity: 0.6 } }, '暂无记忆。让 Agent 用 memory_remember 记录、memory_recall 回忆。')
          : rows,
      )
    }

    function apply(ctx) {
      const slots = ctx.get('slots')
      if (slots === undefined) return

      slots.inject('settings.section', () =>
        slots.register(
          { name: 'settings.section', id: 'dsh-memory', order: 30, label: () => '记忆库' },
          () => React.createElement(MemoryPage, null),
        ),
      )
    }

    exports.name = name
    exports.apply = apply
    return module.exports
  },
})
