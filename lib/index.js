// dsh-memory — cross-session memory vault for DeepSeek Harness (Host half).
//
// Registry-ready cordis plugin: exports { name, apply, inject, Config } per the
// @deepseek-ai/dsh-* convention. Persists memory records in a storage domain
// (json backend by default), exposes three model tools, injects the recent
// entries into every system-prompt assembly, and serves the browser management
// page through package-private RPC methods.
//
// Naming note: storage-domain unit names must match UNIT_NAME_RE
// (/^[a-z][a-z0-9_]*$/ — snake_case, no hyphens), so the domain is
// 'dsh_memory' while the npm package is 'dsh-memory'.
// Config must be a schemastery schema: the harness plugin loader validates
// plugin Config with @deepseek-ai/schemastery (zod schemas fail with
// "invalid config: expected object, received undefined"). The storage-domain
// TABLE valueSchema, by contrast, must be a zod schema (dsh-storage-domain
// calls `.parse(record)` on it; schemastery has no `.parse`).
// schemastery exposes only a default export (alias z below).
import z from '@deepseek-ai/schemastery'
import { z as zod } from 'zod'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { defineDomain } from '@deepseek-ai/dsh-storage-domain'

export const name = 'dsh-memory'

// The storage domain is a hard dependency: without it the vault cannot exist.
export const inject = ['storageDomain']

/** Optional deployment tuning. */
export const Config = z.object({
  /** Maximum entries injected into each system-prompt assembly. */
  injectLimit: z.number().step(1).min(0).max(30).default(8),
  /** Maximum entries returned by memory_recall. */
  recallLimit: z.number().step(1).min(1).max(50).default(10),
})

const recordSchema = zod.object({
  content: zod.string(),
  tags: zod.array(zod.string()).default([]),
  createdAt: zod.string(),
  updatedAt: zod.string(),
  source: zod.string().default('tool'),
})

const spec = defineDomain({
  name: 'dsh_memory',
  version: 1,
  tables: {
    entries: { valueSchema: recordSchema },
  },
})

const nowIso = () => new Date().toISOString()
const makeId = () =>
  'm-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8)

export async function apply(ctx, config) {
  const domain = await ctx.storageDomain.open(spec)
  ctx.effect(
    () => async () => {
      await domain.close()
    },
    'dsh-memory.domainClose',
  )
  const table = domain.table('entries')

  /** Snapshot every record as plain JSON. */
  const allEntries = () => {
    const out = []
    for (const [key, value] of table.entries()) {
      out.push({
        id: key,
        content: String(value.content),
        tags: Array.isArray(value.tags) ? value.tags.map(String) : [],
        createdAt: String(value.createdAt || ''),
        updatedAt: String(value.updatedAt || ''),
        source: String(value.source || 'tool'),
      })
    }
    return out
  }

  /** Relevance score: tag matches weigh double, content matches single. */
  const scoreEntry = (entry, terms) => {
    let score = 0
    const content = entry.content.toLowerCase()
    const tags = entry.tags.map((t) => t.toLowerCase())
    for (const term of terms) {
      if (tags.some((t) => t.indexOf(term) !== -1)) score += 2
      if (content.indexOf(term) !== -1) score += 1
    }
    return score
  }

  // ── model tools ──────────────────────────────────────────────────────────

  const rememberTool = defineTool({
    name: 'memory_remember',
    description:
      'Persist one fact, user preference, decision, convention, or project note to the cross-session memory vault so future sessions can recall it. Use for stable facts the user stated, decisions made, or anything worth remembering beyond this session. Tags improve retrieval.',
    parameters: {
      content: {
        type: 'string',
        required: true,
        description: 'The fact or note to remember, written as a standalone sentence.',
      },
      tags: {
        type: 'array',
        items: { type: 'string' },
        description: 'Optional retrieval tags, e.g. ["project:foo", "user"].',
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          id: { type: 'string', required: true },
          count: { type: 'integer', required: true },
        },
      },
      render: (_args, value) => [
        {
          type: 'text',
          text: `Remembered (id ${value.id}); vault now holds ${value.count} entries.`,
        },
      ],
    },
    async execute(args) {
      const content = String(args.content || '').trim()
      if (!content) throw new Error('memory_remember: content must be a non-empty string')
      const id = makeId()
      await table.put(id, {
        content,
        tags: Array.isArray(args.tags) ? args.tags.map(String) : [],
        createdAt: nowIso(),
        updatedAt: nowIso(),
        source: 'tool',
      })
      return { id, count: table.size }
    },
  })

  const recallTool = defineTool({
    name: 'memory_recall',
    description:
      'Search the cross-session memory vault and return matching entries (facts, preferences, decisions, notes). Call this when the user references earlier work, stated preferences, or decisions that may predate this session. Entries are ordered by relevance.',
    parameters: {
      query: {
        type: 'string',
        required: true,
        description: 'What to look for: keywords or a phrase.',
      },
      limit: {
        type: 'integer',
        description: 'Maximum entries to return (default from deployment config).',
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          entries: {
            type: 'array',
            required: true,
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                id: { type: 'string', required: true },
                content: { type: 'string', required: true },
                tags: { type: 'array', items: { type: 'string' } },
                createdAt: { type: 'string', required: true },
              },
            },
          },
          count: { type: 'integer', required: true },
        },
      },
      render: (_args, value) =>
        value.entries.length
          ? [
              {
                type: 'text',
                text: value.entries
                  .map(
                    (e) =>
                      '- ' +
                      (e.tags && e.tags.length ? `[${e.tags.join(', ')}] ` : '') +
                      e.content,
                  )
                  .join('\n'),
              },
            ]
          : [{ type: 'text', text: 'No matching memory entries.' }],
    },
    async execute(args) {
      const query = String(args.query || '').trim()
      const limit = Math.min(
        Math.max(Number(args.limit) || config.recallLimit, 1),
        config.recallLimit,
      )
      if (!query) throw new Error('memory_recall: query must be a non-empty string')
      const terms = query.toLowerCase().split(/\s+/).filter(Boolean)
      const scored = allEntries().map((e) => ({ e, s: scoreEntry(e, terms) }))
      scored.sort((a, b) => b.s - a.s || String(b.e.updatedAt).localeCompare(String(a.e.updatedAt)))
      const top = scored.filter((x) => x.s > 0).slice(0, limit).map((x) => x.e)
      return {
        entries: top.map((e) => ({
          id: e.id,
          content: e.content,
          tags: e.tags,
          createdAt: e.createdAt,
        })),
        count: top.length,
      }
    },
  })

  const forgetTool = defineTool({
    name: 'memory_forget',
    description:
      'Delete entries from the cross-session memory vault by exact id, or every entry carrying a given tag. Use when the user says a stored fact is wrong, obsolete, or should not be remembered.',
    parameters: {
      id: { type: 'string', description: 'Exact entry id to delete (returned by memory_recall).' },
      tag: { type: 'string', description: 'Delete every entry carrying this tag.' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: { deleted: { type: 'integer', required: true } },
      },
      render: (_args, value) => [
        { type: 'text', text: `Deleted ${value.deleted} memory entr${value.deleted === 1 ? 'y' : 'ies'}.` },
      ],
    },
    async execute(args) {
      let deleted = 0
      if (typeof args.id === 'string' && args.id) {
        if (await table.delete(args.id)) deleted = 1
      } else if (typeof args.tag === 'string' && args.tag) {
        const tag = args.tag
        for (const [key, value] of Array.from(table.entries())) {
          if (Array.isArray(value.tags) && value.tags.some((t) => String(t) === tag)) {
            if (await table.delete(key)) deleted++
          }
        }
      } else {
        throw new Error('memory_forget: provide either id or tag')
      }
      return { deleted }
    },
  })

  ctx.tools.register(rememberTool)
  ctx.tools.register(recallTool)
  ctx.tools.register(forgetTool)

  // ── per-turn prompt injection ────────────────────────────────────────────

  ctx.systemPrompt.section({
    name: 'dsh-memory',
    order: 90,
    text: () => {
      const entries = allEntries()
      if (!entries.length) return ''
      const recent = entries
        .slice()
        .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))
        .slice(0, config.injectLimit)
      const lines = recent.map(
        (e) => '- ' + (e.tags.length ? `[${e.tags.join(', ')}] ` : '') + e.content,
      )
      return (
        '## Persistent memory\n' +
        'Recent facts, preferences and decisions stored across sessions. ' +
        'Use memory_recall for details; update with memory_remember / memory_forget.\n' +
        lines.join('\n')
      )
    },
  })

  // ── browser management page (HTTP JSON over the harness web server) ──────
  // The dynamic prototype reached the host through the sandbox-only
  // `harness.handle` / `host.call` package RPC, which a published repository
  // plugin's client half cannot use. The page therefore talks to this host
  // half through the official `webServer` service instead: same-origin JSON
  // endpoints on the loopback server.
  const webServer = ctx.get('webServer')
  if (webServer !== undefined) {
    const sortedEntries = () =>
      allEntries().sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))

    const sendJson = (res, status, body) => {
      res.statusCode = status
      res.setHeader('Content-Type', 'application/json; charset=utf-8')
      res.end(JSON.stringify(body))
    }

    const readBody = (req) =>
      new Promise((resolve, reject) => {
        const chunks = []
        req.on('data', (chunk) => chunks.push(chunk))
        req.on('end', () => resolve(chunks.map((c) => (typeof c === 'string' ? c : String(c))).join('')))
        req.on('error', reject)
      })

    const route = {
      kind: 'exact',
      path: '/dsh-memory/entries',
      handler: async (req, res) => {
        try {
          if (req.method === 'GET') {
            sendJson(res, 200, { entries: sortedEntries() })
            return
          }
          if (req.method === 'POST') {
            const raw = await readBody(req)
            let payload = {}
            try {
              payload = raw ? JSON.parse(raw) : {}
            } catch {
              sendJson(res, 400, { error: 'invalid JSON body' })
              return
            }
            if (payload.action === 'delete') {
              const id = typeof payload.id === 'string' ? payload.id : ''
              sendJson(res, 200, { deleted: id ? await table.delete(id) : false })
              return
            }
            if (payload.action === 'add') {
              const text = typeof payload.content === 'string' ? payload.content.trim() : ''
              if (!text) {
                sendJson(res, 400, { added: false, error: 'content required' })
                return
              }
              const id = makeId()
              await table.put(id, {
                content: text,
                tags: Array.isArray(payload.tags) ? payload.tags.map(String) : [],
                createdAt: nowIso(),
                updatedAt: nowIso(),
                source: 'ui',
              })
              sendJson(res, 200, { added: true, id, count: table.size })
              return
            }
            sendJson(res, 400, { error: 'unknown action' })
            return
          }
          sendJson(res, 405, { error: 'method not allowed' })
        } catch (err) {
          sendJson(res, 500, { error: String((err && err.message) || err) })
        }
      },
    }
    // The route is not fiber-bound by the web server: retain the disposer and
    // unwind it with the plugin so stop/update never leaves a stale route.
    const disposeRoute = webServer.register(route)
    ctx.effect(() => disposeRoute, 'dsh-memory.routeDispose')
  }
}
