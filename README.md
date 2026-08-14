# dsh-memory-vault

Cross-session memory vault for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (DSH).

Every DSH session starts from zero. `dsh-memory` gives your agents a persistent second brain: facts, preferences, decisions, and project notes survive across sessions and are recalled automatically.

- **3 model tools** — `memory_remember` / `memory_recall` / `memory_forget`
- **Per-turn prompt injection** — the most recent entries are injected into every system-prompt assembly, so the agent starts each turn already aware of stored context
- **Durable storage** — records live in a [storage domain](https://github.com/deepseek-ai/deepseek-harness) (`dsh_memory` unit, json backend by default; unit names are snake_case per `UNIT_NAME_RE`)
- **Browser management page** — a "记忆库 / Memory" page in Settings to browse, add, and delete entries

## Install

```bash
npm install dsh-memory-vault
```

Add a row to your profile `cordis.yml` (or `cordis.patch.yml`):

```yaml
- id: dsh-memory
  name: dsh-memory
```

## Usage

Tell your agent to remember things, or do it yourself:

> "记住：这个项目的部署目标是 Windows，测试命令是 `pnpm test`。"

The agent calls `memory_remember` with optional tags:

```
memory_remember(content="User prefers Windows deployment; test command is `pnpm test`", tags=["project:demo", "user"])
```

When context from an earlier session matters, the agent calls `memory_recall(query="Windows deploy")` — entries are scored by tag matches (×2) and content matches, newest first. Wrong or obsolete facts are removed with `memory_forget(id="m-...")` or `memory_forget(tag="project:demo")`.

### Configuration

| Key | Type | Default | Meaning |
| --- | --- | --- | --- |
| `injectLimit` | int | 8 | Max entries injected per system-prompt assembly |
| `recallLimit` | int | 10 | Max entries returned by `memory_recall` |

```yaml
- id: dsh-memory
  name: dsh-memory
  config:
    injectLimit: 12
    recallLimit: 20
```

## Browser page

Settings → 记忆库 (Memory). Lists all entries newest-first with tags and timestamps; quick-add and delete buttons.

The page talks to the host half through the harness `webServer` service — same-origin JSON endpoints (`GET/POST /dsh-memory/entries`). The dynamic-plugin prototype used the sandbox-only `harness.handle`/`host.call` package RPC; the published package uses the public route so it works in any deployment.

## Development

The plugin is one cordis package:

- `lib/index.js` — host half: domain, tools, prompt injection, RPC handlers
- `lib/client.js` — web half: settings page

## License

MIT
