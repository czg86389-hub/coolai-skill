#!/usr/bin/env node
// COOL AI skill CLI — zero dependencies, Node.js 18+.
// Talks to https://www.coolai.mov with the member's own API key (ml_sk_...).
// Every command prints one JSON object on stdout; errors print {"ok":false,...} and exit 1.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'

const VERSION = '1.0.0'
const DEFAULT_BASE = 'https://www.coolai.mov'
const CONFIG_DIR = path.join(os.homedir(), '.coolai')
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json')
const DONE = new Set(['succeeded', 'failed', 'cancelled', 'canceled', 'partial_failed', 'rejected'])

const MIME = {
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.gif': 'image/gif',
  '.mp4': 'video/mp4', '.mov': 'video/quicktime', '.webm': 'video/webm', '.m4v': 'video/x-m4v',
  '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.m4a': 'audio/mp4', '.aac': 'audio/aac', '.ogg': 'audio/ogg',
}
const KIND_LABEL = { image: '图片', video: '视频', audio: '音频' }

class CliError extends Error {
  constructor(message, extra = {}) {
    super(message)
    this.extra = extra
  }
}

// ---------- args ----------
function parseArgs(argv) {
  const pos = []
  const opt = {}
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (!a.startsWith('--')) {
      pos.push(a)
      continue
    }
    let key = a.slice(2)
    let val
    const eq = key.indexOf('=')
    if (eq >= 0) {
      val = key.slice(eq + 1)
      key = key.slice(0, eq)
    } else if (i + 1 < argv.length && !argv[i + 1].startsWith('--')) {
      val = argv[++i]
    } else {
      val = true
    }
    if (key in opt) opt[key] = [].concat(opt[key], val)
    else opt[key] = val
  }
  return { pos, opt }
}
const list = (v) => (v == null || v === true ? [] : [].concat(v))
const str = (v, d = '') => (v == null || v === true ? d : String(v))
const num = (v, d) => {
  if (v == null || v === true) return d
  const n = Number(v)
  if (!Number.isFinite(n)) throw new CliError(`Not a number: ${v}`)
  return n
}

// ---------- config ----------
function loadConfig() {
  let cfg = {}
  try {
    cfg = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'))
  } catch {}
  return {
    api_key: process.env.COOLAI_API_KEY || cfg.api_key || '',
    base_url: (process.env.COOLAI_BASE_URL || cfg.base_url || DEFAULT_BASE).replace(/\/+$/, ''),
    from_env: !!process.env.COOLAI_API_KEY,
  }
}
function saveConfig(patch) {
  let cfg = {}
  try {
    cfg = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'))
  } catch {}
  fs.mkdirSync(CONFIG_DIR, { recursive: true })
  fs.writeFileSync(CONFIG_FILE, JSON.stringify({ ...cfg, ...patch }, null, 2), { mode: 0o600 })
  try {
    fs.chmodSync(CONFIG_FILE, 0o600)
  } catch {}
}
const maskKey = (k) => (k ? k.slice(0, 10) + '…' + k.slice(-4) : '')

// ---------- http ----------
const CFG = loadConfig()
function absUrl(u) {
  if (!u) return u
  return /^https?:\/\//i.test(u) ? u : CFG.base_url + (u.startsWith('/') ? u : '/' + u)
}
function errorMessage(status, data) {
  const d = data && typeof data === 'object' ? data.detail ?? data : null
  let msg = ''
  if (typeof d === 'string') msg = d
  else if (d && typeof d === 'object') msg = d.message || d.msg || (Array.isArray(d) && d[0] && d[0].msg) || ''
  if (!msg && typeof data === 'string') msg = data.slice(0, 200)
  if (status === 401) msg = (msg ? msg + ' — ' : '') + 'API key missing, wrong or revoked. Create one at ' + CFG.base_url + '/account/api-keys and run: coolai.mjs auth set <key>'
  if (status === 402) msg = (msg ? msg + ' — ' : '') + 'Not enough credits. Top up at ' + CFG.base_url
  return msg || 'HTTP ' + status
}
async function api(method, p, body, { auth = true, raw = false, headers = {}, timeout = 120000 } = {}) {
  const h = { 'User-Agent': `coolai-skill/${VERSION} (node ${process.versions.node}; ${process.platform})`, 'X-UI-Lang': 'zh', 'X-Client': 'coolai-skill', ...headers }
  if (auth) {
    if (!CFG.api_key) throw new CliError('No API key configured. Create one at ' + CFG.base_url + '/account/api-keys , then run: node coolai.mjs auth set <key>', { reason: 'no_api_key' })
    h.Authorization = 'Bearer ' + CFG.api_key
  } else if (CFG.api_key) {
    h.Authorization = 'Bearer ' + CFG.api_key
  }
  let payload
  if (body !== undefined && body !== null) {
    if (Buffer.isBuffer(body)) payload = body
    else {
      payload = JSON.stringify(body)
      h['Content-Type'] = 'application/json'
    }
  }
  let res
  for (let attempt = 0; ; attempt++) {
    try {
      res = await fetch(absUrl(p), { method, headers: h, body: payload, signal: AbortSignal.timeout(timeout) })
    } catch (e) {
      if (attempt < 2 && method === 'GET') {
        await sleep(1500 * (attempt + 1))
        continue
      }
      throw new CliError('Network error calling ' + p + ': ' + (e.cause?.code || e.message), { reason: 'network' })
    }
    if (res.status >= 502 && res.status <= 504 && attempt < 2 && method === 'GET') {
      await sleep(2000 * (attempt + 1))
      continue
    }
    break
  }
  if (raw) return res
  const text = await res.text()
  let data = null
  try {
    data = text ? JSON.parse(text) : null
  } catch {
    data = text
  }
  if (!res.ok) {
    const d = data && typeof data === 'object' ? data.detail ?? data : {}
    throw new CliError(errorMessage(res.status, data), { status: res.status, reason: (d && d.reason) || undefined })
  }
  return data
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const round2 = (n) => Math.round(Number(n) * 100) / 100
const pct = (p) => (p == null ? "" : Math.round(Number(p) <= 1 ? Number(p) * 100 : Number(p)) + "%")

// ---------- account ----------
async function me() {
  const u = await api('GET', '/api/v1/auth/me')
  const user = u.user || u
  const vip = user.member_level === 'vip'
  return {
    account: user.display_name || user.phone || user.email || user.id,
    member_level: vip ? 'vip' : 'member',
    member_level_label: vip ? '永久 VIP（全部功能按会员折扣价）' : '普通会员（按网站标准价）',
    discount_rate: Number(user.member_rate) > 0 ? Number(user.member_rate) : 1,
    credits: round2(user.credits ?? 0),
  }
}

// ---------- models / skills ----------
async function models(kind) {
  const d = await api('GET', '/api/v1/model-routes/public', null, { auth: false })
  const out = {}
  for (const k of kind ? [kind] : ['video', 'image']) {
    const arr = ((d[k] || {}).models || []).filter((m) => m.enabled !== false && !m.admin_only)
    out[k] = arr.map((m) => ({
      key: m.key,
      name: m.display_name,
      description: m.description || undefined,
      resolutions: m.resolutions || undefined,
      max_duration: m.max_duration || undefined,
    }))
  }
  return out
}
async function videoSkills() {
  const d = await api('GET', '/api/v1/video-creator/skills', null, { auth: false })
  const items = Array.isArray(d) ? d : d.items || []
  return items
    .filter((s) => !s.category || s.category.is_exposed !== false)
    .map((s) => ({ skill_key: s.skill_key, name: s.label, category: s.category && s.category.label, description: s.description }))
}

async function checkSkill(key) {
  if (!key) return
  const all = await videoSkills()
  if (!all.some((s) => s.skill_key === key)) throw new CliError(`Unknown video skill "${key}". Valid keys: ${all.map((s) => s.skill_key).join(', ')}`)
}

// ---------- upload ----------
async function upload(file) {
  const fp = path.resolve(file)
  if (!fs.existsSync(fp) || !fs.statSync(fp).isFile()) throw new CliError('File not found: ' + file)
  const ext = path.extname(fp).toLowerCase()
  const mime = MIME[ext]
  if (!mime) throw new CliError(`Unsupported file type "${ext}". Supported: ${Object.keys(MIME).join(' ')}`)
  const buf = fs.readFileSync(fp)
  const policy = await api('POST', '/api/v1/assets/upload-policy', { filename: path.basename(fp), mime, size: buf.length })
  if (policy.max_bytes && buf.length > policy.max_bytes) throw new CliError(`File is too large (${buf.length} bytes, limit ${policy.max_bytes})`)
  try {
    const res = await api(policy.method || 'PUT', policy.upload_url, buf, { raw: true, headers: { 'Content-Type': mime, ...(policy.headers || {}) }, timeout: Math.max(120000, Math.round(buf.length / 50)) })
    if (!res.ok) throw new CliError('Upload failed: HTTP ' + res.status)
  } catch (e) {
    api('DELETE', '/api/v1/assets/' + policy.asset_id).catch(() => {})
    throw e
  }
  const a = await api('POST', '/api/v1/assets/complete', { asset_id: policy.asset_id })
  return { asset_id: a.id || policy.asset_id, kind: a.kind || policy.kind || mime.split('/')[0], url: absUrl(a.url || '/media/uploads/' + policy.asset_id), filename: path.basename(fp) }
}
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
/** --ref values: a local file (uploaded now) or an asset id from an earlier `upload` */
async function resolveRefs(values) {
  const out = []
  const seq = { image: 0, video: 0, audio: 0 }
  for (const v of values) {
    let asset
    if (UUID.test(v)) {
      const a = await api('GET', '/api/v1/assets/' + v)
      asset = { asset_id: a.id, kind: a.kind, url: a.url }
    } else {
      asset = await upload(v)
    }
    const kind = ['image', 'video', 'audio'].includes(asset.kind) ? asset.kind : 'image'
    seq[kind] += 1
    out.push({ asset_id: asset.asset_id, media_type: kind, mention_label: KIND_LABEL[kind] + seq[kind], url: '/media/uploads/' + asset.asset_id })
  }
  return out
}

// ---------- quote / submit ----------
function readPrompt(opt) {
  let p = str(opt.prompt)
  if (opt['prompt-file']) p = fs.readFileSync(path.resolve(str(opt['prompt-file'])), 'utf8')
  p = p.trim()
  if (!p) throw new CliError('Missing --prompt "..." (or --prompt-file path)')
  return p
}
async function quote(payload) {
  const q = await api('POST', '/api/v1/credits/quote', payload)
  return {
    credits: round2(q.estimated_credits ?? q.credits ?? 0),
    list_credits: q.list_credits != null ? round2(q.list_credits) : undefined,
    vip_credits: q.vip_credits != null ? round2(q.vip_credits) : undefined,
    member_discount_rate: q.member_discount_rate ?? undefined,
    available_credits: q.available_credits != null ? round2(q.available_credits) : undefined,
    is_affordable: q.is_affordable,
  }
}
function quoteNote(q, accountLevel) {
  const parts = [`This will cost ${q.credits} credits`]
  if (q.available_credits != null) parts.push(`balance ${q.available_credits}`)
  if (accountLevel !== 'vip' && q.vip_credits != null && q.vip_credits < q.credits) parts.push(`Lifetime VIP would pay ${q.vip_credits}`)
  if (q.is_affordable === false) parts.push('NOT ENOUGH CREDITS — top up at ' + CFG.base_url)
  return parts.join(' · ')
}
async function defaultModel(kind) {
  const m = (await models(kind))[kind]
  if (!m.length) throw new CliError('No ' + kind + ' model is available right now')
  return m[0].key
}

async function buildVideo(opt) {
  const refs = await resolveRefs(list(opt.ref))
  const model = str(opt.model) || 'video.doubao_seedance_2_0_mini'
  const duration = num(opt.duration, 10)
  const payload = {
    type: 'video_generation',
    tool_slug: 'video-generation',
    model_key: model,
    logical_model_key: model,
    count: 1,
    generate_count: 1,
    prompt: readPrompt(opt),
    duration,
    duration_seconds: duration,
    resolution: str(opt.resolution, '480p'),
    aspect_ratio: str(opt.ratio, '9:16'),
    mode: 'text_to_video',
    generate_audio: !opt['no-audio'],
    reference_elements: refs,
  }
  if (opt.skill) {
    await checkSkill(str(opt.skill))
    payload.skill_key = str(opt.skill)
  }
  if (opt['portrait-consent']) payload.portrait_consent = true
  return payload
}
async function buildImage(opt) {
  const refs = await resolveRefs(list(opt.ref))
  const model = str(opt.model) || (await defaultModel('image'))
  const count = Math.min(4, Math.max(1, num(opt.count, 1)))
  return {
    type: 'image_generation',
    tool_slug: 'image-generation',
    model_key: model,
    logical_model_key: model,
    count,
    generate_count: count,
    prompt: readPrompt(opt),
    aspect_ratio: str(opt.ratio, 'auto'),
    resolution: str(opt.resolution, '1k'),
    quality: str(opt.quality, 'high'),
    output_format: 'png',
    reference_urls: refs.map((r) => r.url),
    reference_elements: refs.map((r) => ({ asset_id: r.asset_id, media_type: 'image', mention_label: r.mention_label })),
    reference_slots: [{ key: 'product', name: '图片', count: refs.length }],
  }
}
async function generate(kind, opt) {
  const payload = kind === 'video' ? await buildVideo(opt) : await buildImage(opt)
  const acct = await me()
  const q = await quote(payload)
  const summary = {
    kind,
    model: payload.model_key,
    ...(kind === 'video' ? { duration_seconds: payload.duration_seconds, resolution: payload.resolution, aspect_ratio: payload.aspect_ratio, audio: payload.generate_audio } : { count: payload.count, resolution: payload.resolution, aspect_ratio: payload.aspect_ratio, quality: payload.quality }),
    references: payload.reference_elements.map((r) => ({ label: r.mention_label, asset_id: r.asset_id })),
  }
  if (!opt.confirm) {
    return {
      ok: true,
      submitted: false,
      quote: q,
      account: acct,
      request: summary,
      next: quoteNote(q, acct.member_level) + '. Nothing was charged. Tell the user this cost and, once they agree, run the same command again with --confirm (reuse the asset ids above for --ref so files are not uploaded twice).',
    }
  }
  if (q.is_affordable === false) throw new CliError(quoteNote(q, acct.member_level), { reason: 'insufficient_credits', quote: q })
  const created = await api('POST', '/api/v1/batches', payload)
  const id = created.id || created.batch_id
  const base = { ok: true, submitted: true, task_id: id, charged_credits: created.credits_cost != null ? round2(created.credits_cost) : q.credits, request: summary }
  if (opt['no-wait']) return { ...base, status: created.status || 'pending', next: `Check later with: task ${id} --wait` }
  const done = await waitTask(id, opt)
  return { ...base, ...done }
}

// ---------- tasks ----------
function taskOut(b) {
  const res = b.result || b.result_json || {}
  const outputs = (Array.isArray(res.outputs) ? res.outputs : res.url ? [res.url] : []).filter((u) => typeof u === 'string' && u).map(absUrl)
  const params = b.params || b.params_json || {}
  return {
    task_id: b.id,
    type: b.type,
    status: b.status,
    progress: b.progress == null ? undefined : pct(b.progress),
    credits_cost: b.credits_cost != null ? round2(b.credits_cost) : undefined,
    outputs,
    error: b.status === 'failed' ? b.error_message || res.error || res.message || b.moderation_note || 'failed (credits for failed tasks are refunded automatically)' : undefined,
    prompt: typeof params.prompt === 'string' ? params.prompt.slice(0, 120) : undefined,
    created_at: b.created_at,
    web_url: CFG.base_url + (b.type === 'image_generation' ? '/toolbox/image-generation' : '/toolbox/video-generation'),
  }
}
async function download(urls, dir) {
  const out = []
  fs.mkdirSync(dir, { recursive: true })
  for (const u of urls) {
    const res = await api('GET', u, null, { raw: true, timeout: 600000 })
    if (!res.ok) throw new CliError('Download failed (HTTP ' + res.status + '): ' + u)
    const name = path.basename(new URL(u).pathname) || 'coolai-' + crypto.randomUUID()
    const fp = path.join(dir, name)
    fs.writeFileSync(fp, Buffer.from(await res.arrayBuffer()))
    out.push(fp)
  }
  return out
}
async function waitTask(id, opt) {
  const limit = num(opt.timeout, 1500) * 1000
  const start = Date.now()
  let b
  for (;;) {
    b = await api('GET', '/api/v1/batches/' + id)
    if (DONE.has(String(b.status))) break
    if (Date.now() - start > limit) {
      return { ...taskOut(b), timed_out: true, next: `Still running. Check again with: task ${id} --wait` }
    }
    process.stderr.write(`[coolai] ${b.status} ${pct(b.progress)} (${Math.round((Date.now() - start) / 1000)}s)
`)
    await sleep(b.type === 'image_generation' ? 4000 : 8000)
  }
  const out = taskOut(b)
  if (out.status === 'succeeded' && out.outputs.length && !opt['no-download']) {
    out.files = await download(out.outputs, path.resolve(str(opt.out, './coolai-output')))
  }
  return out
}

// ---------- AI director (超级编导) ----------
async function director(opt) {
  const skill = str(opt.skill)
  const brief = str(opt.brief) || str(opt.prompt)
  if (!brief) throw new CliError('Missing --brief "one sentence about the product / the video you want"')
  await checkSkill(skill)
  const refs = await resolveRefs(list(opt.ref))
  const duration = num(opt.duration, 15)
  const acct = await me()
  const cost = round2((refs.length ? 0.5 : 0.5) * acct.discount_rate)
  if (!opt.confirm) {
    return {
      ok: true,
      submitted: false,
      account: acct,
      request: { skill: skill || null, duration_seconds: duration, references: refs.map((r) => ({ label: r.mention_label, asset_id: r.asset_id })) },
      next: `Writing a storyboard script costs about ${cost} credits (balance ${acct.credits}). Nothing was charged. Tell the user, then run again with --confirm (reuse the asset ids above for --ref).`,
    }
  }
  const conv = await api('POST', '/api/v1/video-creator/conversations', { title: brief.slice(0, 30), skill_key: skill || undefined })
  const cid = (conv.conversation && conv.conversation.conversation_id) || conv.conversation_id
  let facts = null
  const img = refs.find((r) => r.media_type === 'image')
  if (img) {
    try {
      const v = await api('POST', '/api/v1/video-creator/vision', { asset_id: img.asset_id }, { timeout: 180000 })
      if (v && v.facts && Object.keys(v.facts).length) facts = v.facts
    } catch {}
  }
  const op = 'op_' + crypto.randomBytes(8).toString('hex')
  const body = {
    client_operation_id: op,
    message: brief,
    skill_key: skill || undefined,
    script_language: str(opt.lang, 'zh'),
    duration_seconds: duration,
    attachments: refs,
    reference_elements: refs,
    script_style: str(opt.style, 'explain'),
    visual_facts: facts,
  }
  const res = await api('POST', `/api/v1/video-creator/conversations/${cid}/script/stream`, body, { raw: true, headers: { 'X-Video-Director-Protocol': '3' }, timeout: 600000 })
  if (!res.ok) {
    let data = null
    try {
      data = await res.json()
    } catch {}
    throw new CliError(errorMessage(res.status, data), { status: res.status })
  }
  await res.text() // drain the event stream; the final script is read from the operation below
  let snap = null
  for (let i = 0; i < 60; i++) {
    snap = await api('GET', `/api/v1/video-creator/conversations/${cid}/script/operations/${op}`).catch(() => null)
    if (snap && (snap.is_terminal || snap.status === 'succeeded' || snap.status === 'failed')) break
    await sleep(3000)
  }
  if (!snap || snap.status !== 'succeeded' || !snap.content) throw new CliError('The AI director did not return a script' + (snap && snap.error ? ': ' + snap.error.message : '') + ' (credits for a failed script are refunded automatically)')
  const file = path.resolve(str(opt.out, './coolai-output'), `script-${cid.slice(0, 8)}.txt`)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, snap.content, 'utf8')
  return {
    ok: true,
    script: snap.content,
    script_file: file,
    charged_credits: round2(Number((snap.credit || {}).consumed_credits) || cost),
    references: refs.map((r) => ({ label: r.mention_label, asset_id: r.asset_id })),
    next: `Show the script to the user. To make the video: video --prompt-file "${file}" --duration ${duration}${skill ? ' --skill ' + skill : ''}${refs.map((r) => ' --ref ' + r.asset_id).join('')}`,
  }
}

// ---------- main ----------
const HELP = `COOL AI skill CLI ${VERSION}  (${DEFAULT_BASE})

  auth set <ml_sk_...>          save the member's API key (~/.coolai/config.json)
  auth status                   account, member level, credit balance
  models [video|image]          models that can be used
  skills                        video skills for the AI director (超级编导)
  upload <file>                 upload an image / video / audio, returns asset_id
  image  --prompt "..." [--model K] [--ratio auto|1:1|3:4|4:3|9:16|16:9] [--resolution 1k|2k|4k]
         [--quality low|medium|high] [--count 1-4] [--ref file|asset_id ...] [--confirm]
  video  --prompt "..."|--prompt-file F [--model K] [--duration 10] [--resolution 480p|720p|1080p]
         [--ratio 9:16|16:9|1:1|3:4|4:3] [--ref file|asset_id ...] [--skill KEY] [--no-audio]
         [--portrait-consent] [--confirm]
  script --brief "..." [--skill KEY] [--duration 15] [--ref ...] [--style explain|ugc] [--lang zh|en] [--confirm]
  task <id> [--wait]            status / result of one task
  tasks [--limit 10]            recent tasks

  Without --confirm, image / video / script only return the price — nothing is charged.
  Extra flags: --out DIR (download folder, default ./coolai-output)  --no-wait  --no-download  --timeout SEC
`

async function main() {
  const { pos, opt } = parseArgs(process.argv.slice(2))
  const cmd = pos[0]
  if (!cmd || cmd === 'help' || opt.help) {
    process.stdout.write(HELP)
    return
  }
  let out
  switch (cmd) {
    case 'auth': {
      if (pos[1] === 'set') {
        const key = pos[2] || str(opt.key)
        if (!/^ml_sk_[\w-]{20,}$/.test(key)) throw new CliError('That does not look like a COOL AI API key (it starts with ml_sk_). Create one at ' + CFG.base_url + '/account/api-keys')
        CFG.api_key = key
        const acct = await me()
        saveConfig({ api_key: key })
        out = { ok: true, saved: CONFIG_FILE, ...acct }
      } else if (pos[1] === 'clear') {
        saveConfig({ api_key: '' })
        out = { ok: true, cleared: true }
      } else {
        if (!CFG.api_key) out = { ok: true, configured: false, next: 'Ask the user to create an API key at ' + CFG.base_url + '/account/api-keys (register for free first if they have no account), then run: auth set <key>' }
        else out = { ok: true, configured: true, key: maskKey(CFG.api_key), source: CFG.from_env ? 'env COOLAI_API_KEY' : CONFIG_FILE, ...(await me()) }
      }
      break
    }
    case 'balance':
      out = { ok: true, ...(await me()) }
      break
    case 'models':
      out = { ok: true, ...(await models(pos[1])) }
      break
    case 'skills':
      out = { ok: true, skills: await videoSkills() }
      break
    case 'upload':
      if (!pos[1]) throw new CliError('Usage: upload <file>')
      out = { ok: true, ...(await upload(pos[1])) }
      break
    case 'image':
    case 'video':
      out = await generate(cmd, opt)
      break
    case 'script':
      out = await director(opt)
      break
    case 'task': {
      if (!pos[1]) throw new CliError('Usage: task <id> [--wait]')
      out = opt.wait ? { ok: true, ...(await waitTask(pos[1], opt)) } : { ok: true, ...taskOut(await api('GET', '/api/v1/batches/' + pos[1])) }
      break
    }
    case 'tasks': {
      const d = await api('GET', '/api/v1/batches?limit=' + Math.min(50, num(opt.limit, 10)))
      out = { ok: true, tasks: (d.items || d.data || []).map(taskOut) }
      break
    }
    case 'version':
      out = { ok: true, version: VERSION }
      break
    default:
      throw new CliError(`Unknown command "${cmd}". Run with no arguments for help.`)
  }
  process.stdout.write(JSON.stringify(out, null, 2) + '\n')
}

main().catch((e) => {
  const body = { ok: false, error: e instanceof CliError ? e.message : String((e && e.message) || e), ...(e instanceof CliError ? e.extra : {}) }
  process.stdout.write(JSON.stringify(body, null, 2) + '\n')
  process.exitCode = 1 // not process.exit(): on Windows that can crash Node while fetch sockets are closing
})
