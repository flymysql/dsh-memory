# Publish Guide — dsh-memory

Everything needed to push `dsh-memory` to the DSH plugin community.

## 0. Verify locally

```bash
node --check lib/index.js
node --check lib/client.js
npm pack --dry-run   # inspect the tarball contents
```

## 1. Create the GitHub repository

1. Go to https://github.com/new
2. Repository name: **`dsh-memory`**
3. Description (pick one, bilingual is nicer):
   - EN: `Cross-session memory vault for DeepSeek Harness: remember / recall / forget tools, per-turn prompt injection, and a browser management page.`
   - ZH: `DeepSeek Harness 跨会话记忆库插件：remember/recall/forget 工具、每轮提示注入与浏览器管理页。`
4. **Add the topic `dsh-plugin`** (right sidebar → Topics). This is what the community index aggregates on.
   Optionally also: `deepseek-harness`, `plugin`, `memory`, `ai-agent`.
5. License: MIT. Do NOT add README/.gitignore from the UI (the repo already has them).

## 2. Push

```bash
cd dsh-memory
git init -b main
git add -A
git commit -m "feat: dsh-memory — cross-session memory vault for DeepSeek Harness

- memory_remember / memory_recall / memory_forget model tools
- per-turn system-prompt injection of recent entries
- durable storage domain (dsh_memory, json backend)
- settings page (记忆库 / Memory) over the webServer JSON route
- bilingual README, MIT license"
git branch -M main
git remote add origin https://github.com/flymysql/dsh-memory.git
git push -u origin main
```

## 3. Publish to npm

```bash
npm login          # npm account (or `npm publish --access public` with a token)
npm publish
```

Package naming follows the community convention (`dsh-memory-vault`, keywords include `dsh-plugin`).
> Note: the bare `dsh-memory` npm name was already taken (a SQLite-based memory plugin published 2026-08-13);
> this package ships as **`dsh-memory-vault`** — storage-domain persistence, no sidecar services.
Check the published page shows the **dsh-plugin** keyword so the npm search surfaces it.

## 4. Get listed in the community indexes

Open an issue/PR in each of these with the template below:

- https://github.com/awesome-dsh-plugin/awesome-dsh-plugin (en + zh README)
- https://github.com/Alex-Yanggg/awesome-DSH-plugin
- https://github.com/0xsline/awesome-deepseek-harness
- https://github.com/bruc3van/awesome-dsh-plugin
- https://github.com/AdamPlatin123/awesome-dsh-plugins
- https://github.com/Nagi-ovo/dsh-find-plugins (plugin finder)

### Submission template (issue or PR body)

```markdown
## dsh-memory-vault

Cross-session memory vault for DeepSeek Harness.

- **Repo**: https://github.com/flymysql/dsh-memory
- **npm**: https://www.npmjs.com/package/dsh-memory-vault
- **Topic**: dsh-plugin
- **Category**: productivity / memory

### What it does
Three model tools (`memory_remember`, `memory_recall`, `memory_forget`) give agents a
persistent second brain: facts, preferences, decisions, and project notes survive
across sessions. The most recent entries are injected into every system-prompt
assembly, so each session starts already aware of stored context. Records live in a
durable storage domain (`dsh_memory`, json backend). A Settings page (记忆库 / Memory)
lists, adds, and deletes entries through the harness webServer JSON route.

### Install
npm install dsh-memory-vault, then add `{ id: dsh-memory, name: dsh-memory-vault }` to cordis.yml.

### Why it matters
Every DSH session starts from zero; this closes the loop on cross-session context —
the highest-frequency pain point for agent users. No existing community plugin covers it.
```

## 5. Notes & known limitations

- Storage-domain unit names must match `UNIT_NAME_RE = /^[a-z][a-z0-9_]*$/`
  (snake_case, no hyphens) — hence the `dsh_memory` domain name.
- The browser page talks to the host through the `webServer` service
  (`GET/POST /dsh-memory/entries`, same-origin JSON). Routes are loopback-bound;
  if you deploy the harness on a non-loopback interface, consider adding an
  origin check inside the route handler.
- The dynamic-plugin prototype used the sandbox-only `harness.handle`/`host.call`
  RPC; the published package uses the public route so it works in any deployment.
