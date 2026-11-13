#!/usr/bin/env node
// COOL AI skill CLI — zero dependencies, Node.js 18+.
// Talks to https://www.coolai.mov with the member's own API key (ca_sk_...).
// Every command prints one JSON object on stdout; errors print {"ok":false,...} and exit 1.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'

const VERSION = '1.1.1'
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
  let pack = null
  if (opt.pack) {
    if (SET_PACKS[str(opt.pack)]) throw new CliError(`"${opt.pack}" makes a whole set of images. Use: imageset --pack ${opt.pack} --slot product=<file>`)
    pack = await findPack(str(opt.pack))
  }
  let refs
  let slots = [{ key: 'product', name: '图片', count: 0 }]
  if (pack) {
    const r = await resolveSlots(opt, packSlots(pack))
    refs = r.refs
    slots = r.reference_slots
  } else {
    if (list(opt.slot).length) throw new CliError('--slot needs --pack. Without a pack use --ref')
    refs = await resolveRefs(list(opt.ref))
    slots[0].count = refs.length
  }
  const model = str(opt.model) || (await defaultModel('image'))
  const count = Math.min(4, Math.max(1, num(opt.count, 1)))
  const hasPrompt = !!(opt.prompt || opt['prompt-file'])
  return {
    ...(pack ? { skill_pack_id: pack.skill_pack_id } : await styleOpts(opt)),
    type: 'image_generation',
    tool_slug: 'image-generation',
    model_key: model,
    logical_model_key: model,
    count,
    generate_count: count,
    // with a skill pack the prompt is optional (the pack carries its own instructions)
    prompt: pack && !hasPrompt ? undefined : readPrompt(opt),
    aspect_ratio: str(opt.ratio, 'auto'),
    resolution: str(opt.resolution, '1k'),
    quality: str(opt.quality, 'high'),
    output_format: 'png',
    reference_urls: refs.map((r) => r.url),
    reference_elements: refs.map((r) => ({ asset_id: r.asset_id, media_type: 'image', mention_label: r.mention_label })),
    reference_slots: slots,
  }
}
async function generate(kind, opt) {
  const payload = kind === 'video' ? await buildVideo(opt) : kind === 'replica' ? await buildReplica(opt) : await buildImage(opt)
  const acct = await me()
  const q = await quote(payload)
  const summary = {
    kind,
    model: payload.model_key,
    ...(payload.skill_pack_id ? { pack: payload.skill_pack_id } : {}),
    ...(kind === 'replica' ? { duration_seconds: payload.duration_seconds, resolution: payload.resolution, aspect_ratio: payload.aspect_ratio, sound: payload.keep_source_audio ? 'original' : payload.generate_audio ? 'ai' : 'mute' } : kind === 'video' ? { duration_seconds: payload.duration_seconds, resolution: payload.resolution, aspect_ratio: payload.aspect_ratio, audio: payload.generate_audio } : { count: payload.count, resolution: payload.resolution, aspect_ratio: payload.aspect_ratio, quality: payload.quality }),
    references: payload.reference_elements.map((r) => ({ label: r.mention_label, asset_id: r.asset_id })),
  }
  if (kind === 'replica') payload.confirmed_estimated_credits = q.credits
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

// ---------- image skill packs (技能包) ----------
// The three "set" packs make a whole set of images from one product photo: the service first writes a
// plan (free), the user reviews it, then the images are generated. Module tables mirror the website.
const SET_PACKS = {
  'ecommerce-image-set': {
    set_kind: undefined,
    title: undefined,
    slots: [
      { key: 'product', name: '商品', required: true, max_count: 8 },
      { key: 'person', name: '人物', required: false, max_count: 2 },
      { key: 'background', name: '背景', required: false, max_count: 3 },
    ],
    defaults: { hero: 1, scene: 2, selling_point: 1, detail: 1 },
    modules: [
      ['hero', '首图 / 主视觉', 'Hero image: first impression of the product'],
      ['scene', '场景图 / 使用', 'Scene: the product in real use'],
      ['pain_point', '痛点图 / 解决', 'Pain point and how the product solves it'],
      ['selling_point', '卖点图 / 功效', 'Key selling points and benefits'],
      ['detail', '细节图 / 材质', 'Close-up of material and craftsmanship'],
      ['usage', '用法图 / 多用途', 'How to use it, step by step'],
      ['package', '包装图 / 到手', 'Packaging and unboxing'],
      ['cta', '收尾图 / CTA', 'Closing image with a call to action'],
      ['ingredient', '成分图 / 配料', 'Ingredients'],
      ['structure', '结构图 / 功能', 'Structure breakdown and functions'],
      ['comparison', '对比图 / 同行对比', 'Comparison with ordinary products'],
      ['size', '尺码图 / 规格', 'Size chart (put the size data in --prompt)'],
    ],
  },
  'social-image-set': {
    set_kind: 'social',
    title: '种草图文',
    slots: [{ key: 'product', name: '商品', required: true, max_count: 4 }],
    defaults: { cover: 1, annotate: 1, compare: 1, steps: 1, comic: 1, quote: 1 },
    modules: [
      ['cover', '封面 / 大标题', 'Cover with a big headline'],
      ['annotate', '卖点标注图', 'Product with arrows pointing at each selling point'],
      ['compare', '对比图 / 普通款 vs 这一款', 'Side-by-side comparison'],
      ['steps', '步骤教程图', 'Step-by-step tutorial'],
      ['surround', '要点环绕卡', 'Product in the middle, key points around it'],
      ['tips', '选购要点卡', 'Buying tips, numbered'],
      ['comic', '四格漫画', 'Four-panel comic'],
      ['quote', '金句大字卡', 'Big-text quote card'],
      ['lifestyle', '种草场景图', 'Lifestyle scene without text'],
      ['micro', '微缩创意图', 'Miniature people interacting with the product'],
    ],
  },
  'ip-mascot-set': {
    set_kind: 'ip',
    title: '品牌 IP 形象',
    slots: [{ key: 'product', name: '参考图', required: false, max_count: 3 }],
    defaults: { mascot: 1, turnaround: 1, expressions: 1, poses: 1, merch: 1, poster: 1 },
    modules: [
      ['mascot', '主形象卡', 'Main character card (always first; the rest follow it)'],
      ['turnaround', '三视图', 'Front / side / back turnaround'],
      ['expressions', '表情卡', 'Four expressions'],
      ['poses', '动作卡', 'Three signature poses'],
      ['profile', '角色档案卡', 'Character profile'],
      ['palette', '配色卡', 'Colour palette and materials'],
      ['merch', '周边应用卡', 'Merchandise mock-ups'],
      ['stickers', '表情包', 'Six stickers with text'],
      ['poster', '品牌海报', 'Brand poster with the mascot'],
      ['world', '世界观场景', 'The world the mascot lives in'],
    ],
  },
}
const COPY_LANGS = ['无文案', '中文', '英文', '泰语', '马来语', '巴西葡萄牙语', '不限']

async function rawPacks() {
  const d = await api('GET', '/api/v1/tools/image-generation/skill-packs', null, { auth: false })
  return (d.skill_packs || []).filter((p) => !p.is_default_profile && p.skill_pack_id !== 'default')
}
function packSlots(p) {
  if (SET_PACKS[p.skill_pack_id]) return SET_PACKS[p.skill_pack_id].slots
  return (((p.reference_solt_config || {}).solts || []).filter((t) => t && t.key)).map((t) => ({ key: t.key, name: t.name, required: !!t.required, max_count: t.max_count || 1 }))
}
async function imagePacks() {
  return (await rawPacks()).map((p) => {
    const set = SET_PACKS[p.skill_pack_id]
    return {
      pack: p.skill_pack_id,
      name: p.label,
      category: p.category && p.category.label,
      description: p.description,
      command: set ? 'imageset' : 'image --pack',
      slots: packSlots(p).map((t) => ({ slot: t.key, name: t.name, required: !!t.required, max: t.max_count || 1 })),
      ...(set ? { modules: set.modules.map(([key, zh, en]) => ({ key, name: zh, about: en })), default_modules: set.defaults } : {}),
    }
  })
}
async function findPack(id) {
  const all = await rawPacks()
  const p = all.find((x) => x.skill_pack_id === id)
  if (!p) throw new CliError(`Unknown image skill pack "${id}". Valid: ${all.map((x) => x.skill_pack_id).join(', ')}`)
  return p
}
/** --slot key=file|asset_id (repeatable) and --ref (goes to the first slot) → references in slot order */
async function resolveSlots(opt, slots) {
  const bySlot = Object.fromEntries(slots.map((t) => [t.key, []]))
  for (const v of list(opt.slot)) {
    const i = String(v).indexOf('=')
    if (i < 1) throw new CliError(`--slot must look like ${slots[0] ? slots[0].key : 'product'}=<file or asset_id>`)
    const key = String(v).slice(0, i)
    if (!bySlot[key]) throw new CliError(`This pack has no slot "${key}". Its slots: ${slots.map((t) => t.key + ' (' + t.name + ')').join(', ')}`)
    bySlot[key].push(String(v).slice(i + 1))
  }
  if (list(opt.ref).length) {
    if (!slots.length) throw new CliError('This pack takes no reference images')
    bySlot[slots[0].key].push(...list(opt.ref))
  }
  for (const t of slots) {
    const n = bySlot[t.key].length
    if (t.required && !n) throw new CliError(`Missing required image for slot "${t.key}" (${t.name}). Add: --slot ${t.key}=<file>`)
    if (n > (t.max_count || 1)) throw new CliError(`Slot "${t.key}" (${t.name}) takes at most ${t.max_count || 1} image(s)`)
  }
  const order = []
  for (const t of slots) for (const v of bySlot[t.key]) order.push([t.key, v])
  const refs = await resolveRefs(order.map((x) => x[1]))
  if (refs.some((r) => r.media_type !== 'image')) throw new CliError('Image skill packs only take image files')
  refs.forEach((r, i) => (r.slot = order[i][0]))
  return { refs, reference_slots: slots.map((t) => ({ key: t.key, name: t.name, count: bySlot[t.key].length })) }
}
async function styleLibrary() {
  const d = await api('GET', '/api/v1/public/style-library', null, { auth: false })
  const cats = Object.fromEntries((d.cats || []).map((c) => [c.key, c.zh]))
  return {
    styles: (d.styles || []).map((s) => ({ id: s.id, name: s.zh, name_en: s.en, category: cats[s.cat] || s.cat })),
    colors: (d.colors || []).map((c) => ({ id: c.id, name: c.zh, name_en: c.en, hex: c.hex })),
  }
}
async function styleOpts(opt) {
  const out = {}
  if (!opt.style && !opt.color) return out
  const lib = await styleLibrary()
  if (opt.style) {
    if (!lib.styles.some((s) => s.id === str(opt.style))) throw new CliError(`Unknown style "${opt.style}". Run: styles`)
    out.style_id = str(opt.style)
  }
  if (opt.color) {
    if (!lib.colors.some((c) => c.id === str(opt.color))) throw new CliError(`Unknown colour "${opt.color}". Run: styles`)
    out.color_id = str(opt.color)
  }
  return out
}

function setRowsOut(detail) {
  return (detail.items || []).map((it, i) => {
    const o = it.output || it.output_json || {}
    const row = o.row || {}
    return {
      row: i + 1,
      module: row.module_purpose || row.module_label || row.module_key,
      status: it.status,
      uses: row.referenced_images || undefined,
      prompt: row.final_prompt || undefined,
      url: o.url ? absUrl(o.url) : undefined,
      error: it.status === 'failed' ? o.error || it.error || 'failed' : undefined,
    }
  })
}
async function setQuote(id, acct) {
  const q = await api('POST', `/api/v1/batches/${id}/ecommerce-image-set/row-quote`, {})
  return {
    credits: round2(q.credits ?? q.estimated_credits ?? 0),
    count: q.count,
    per_image: q.unit != null ? round2(q.unit) : undefined,
    available_credits: q.available_credits != null ? round2(q.available_credits) : acct.credits,
    is_affordable: q.available_credits != null ? Number(q.available_credits) >= Number(q.credits ?? 0) : undefined,
  }
}
/** imageset: step 1 — upload, ask the service for a plan (free). */
async function imageSetPlan(opt) {
  const id = str(opt.pack, 'ecommerce-image-set')
  const def = SET_PACKS[id]
  if (!def) throw new CliError(`"${id}" is not a set pack. Set packs: ${Object.keys(SET_PACKS).join(', ')}. For other packs use: image --pack ${id}`)
  await findPack(id)
  let counts = def.defaults
  if (opt.modules) {
    counts = {}
    for (const part of str(opt.modules).split(/[,，\s]+/).filter(Boolean)) {
      const [k, n] = part.split('=')
      if (!def.modules.some((m) => m[0] === k)) throw new CliError(`Unknown module "${k}" for ${id}. Valid: ${def.modules.map((m) => m[0]).join(', ')}`)
      counts[k] = Math.max(0, Math.round(num(n === undefined ? 1 : n, 1)))
    }
  }
  const rows = []
  for (const [key, full] of def.modules) for (let i = 0; i < (counts[key] || 0); i++) rows.push({ module_key: key, module_label: full, index: i })
  if (!rows.length) throw new CliError('Choose at least one module, e.g. --modules hero=1,scene=2')
  if (rows.length > 16) throw new CliError('A set can have at most 16 images')
  const lang = str(opt.lang, '中文')
  if (!COPY_LANGS.includes(lang)) throw new CliError(`--lang must be one of: ${COPY_LANGS.join(' / ')}`)
  const { refs, reference_slots } = await resolveSlots(opt, def.slots)
  const model = str(opt.model) || (await defaultModel('image'))
  const prompt = opt.prompt || opt['prompt-file'] ? readPrompt(opt) : undefined
  const body = {
    type: 'ecommerce_image_set',
    tool_slug: 'ecommerce-image-set',
    skill_pack_id: id,
    set_kind: def.set_kind,
    title: def.title,
    ...(await styleOpts(opt)),
    model_key: model,
    logical_model_key: model,
    rows,
    count: rows.length,
    aspect_ratio: str(opt.ratio, '3:4'),
    resolution: '1k',
    quality: str(opt.quality, 'high'),
    output_format: 'png',
    copy_language: lang,
    prompt,
    reference_elements: refs.map((r) => ({ asset_id: r.asset_id, media_type: 'image', mention_label: r.mention_label, ref_role: r.slot })),
    reference_slots,
    analysis_only: true,
  }
  const acct = await me()
  const created = await api('POST', '/api/v1/batches', body)
  const bid = created.id || created.batch_id
  const limit = num(opt.timeout, 600) * 1000
  const start = Date.now()
  let d
  for (;;) {
    d = await api('GET', '/api/v1/batches/' + bid)
    if (DONE.has(String(d.status))) break
    if (Date.now() - start > limit) throw new CliError(`The plan is still being written. Check later with: imageset-generate ${bid}`, { set_id: bid })
    process.stderr.write(`[coolai] planning ${pct(d.progress)} (${Math.round((Date.now() - start) / 1000)}s)\n`)
    await sleep(5000)
  }
  if (d.status !== 'succeeded') throw new CliError('Planning failed: ' + ((d.result || {}).error || d.status))
  const q = await setQuote(bid, acct)
  return {
    ok: true,
    submitted: false,
    set_id: bid,
    pack: id,
    model,
    images: rows.length,
    plan: setRowsOut(d),
    quote: q,
    account: acct,
    web_url: CFG.base_url + '/toolbox/image-generation',
    next: `The plan is ready and nothing was charged. Show the user each row (module + what it will show), and that generating all ${rows.length} images costs ${q.credits} credits (balance ${q.available_credits}). To change one image first: imageset-edit ${bid} --row N --prompt "...". When the user agrees: imageset-generate ${bid} --confirm`,
  }
}
/** imageset-edit: change one row's prompt before generating (free). */
async function imageSetEdit(id, opt) {
  const row = Math.round(num(opt.row, 0))
  if (!row) throw new CliError('Usage: imageset-edit <set_id> --row N --prompt "..." (or --prompt-file F)')
  await api('PATCH', `/api/v1/batches/${id}/ecommerce-image-set/analysis-row`, { row_index: row, final_prompt: readPrompt(opt) })
  const d = await api('GET', '/api/v1/batches/' + id)
  return { ok: true, set_id: id, plan: setRowsOut(d), next: `Row ${row} updated. When the user agrees: imageset-generate ${id} --confirm` }
}
/** imageset-generate: step 2 — quote, then (with --confirm) generate the pending rows and download. */
async function imageSetGenerate(id, opt) {
  const acct = await me()
  let d = await api('GET', '/api/v1/batches/' + id)
  if (d.type !== 'ecommerce_image_set') throw new CliError('That task is not an image set')
  const pending = (d.items || []).filter((it) => it.status === 'pending').length
  const running = (d.items || []).some((it) => it.status === 'running')
  if (pending && !running) {
    const q = await setQuote(id, acct)
    if (!opt.confirm) {
      return { ok: true, submitted: false, set_id: id, plan: setRowsOut(d), quote: q, account: acct, next: `Generating ${q.count} image(s) costs ${q.credits} credits (balance ${q.available_credits}). Nothing was charged. After the user agrees, run again with --confirm.` }
    }
    if (q.is_affordable === false) throw new CliError(`Not enough credits: needs ${q.credits}, balance ${q.available_credits}. Top up at ${CFG.base_url}`, { reason: 'insufficient_credits' })
    await api('POST', `/api/v1/batches/${id}/ecommerce-image-set/row-generations`, {})
  } else if (!pending && !running && !opt.confirm) {
    // nothing left to generate: just report (and download below)
  }
  if (opt['no-wait']) return { ok: true, submitted: true, set_id: id, next: `Check later with: imageset-generate ${id}` }
  const limit = num(opt.timeout, 1800) * 1000
  const start = Date.now()
  for (;;) {
    d = await api('GET', '/api/v1/batches/' + id)
    const busy = (d.items || []).some((it) => it.status === 'running') || d.status === 'running' || d.status === 'pending' || d.status === 'queued'
    if (!busy) break
    if (Date.now() - start > limit) return { ok: true, set_id: id, timed_out: true, rows: setRowsOut(d), next: `Still generating. Check again with: imageset-generate ${id}` }
    const done = (d.items || []).filter((it) => it.status === 'succeeded').length
    process.stderr.write(`[coolai] ${done}/${(d.items || []).length} images done (${Math.round((Date.now() - start) / 1000)}s)\n`)
    await sleep(6000)
  }
  const rows = setRowsOut(d).map(({ prompt, uses, ...r }) => r)
  const urls = rows.filter((r) => r.url).map((r) => r.url)
  const out = { ok: true, submitted: true, set_id: id, status: d.status, credits_cost: d.credits_cost != null ? round2(d.credits_cost) : undefined, rows, outputs: urls, web_url: CFG.base_url + '/toolbox/image-generation' }
  if (urls.length && !opt['no-download']) out.files = await download(urls, path.resolve(str(opt.out, './coolai-output')))
  const failed = rows.filter((r) => r.status === 'failed').length
  if (failed) out.next = `${failed} image(s) failed and were refunded automatically.`
  return out
}

// ---------- more video tools ----------
async function simpleBatch(body, timeoutSec) {
  const created = await api('POST', '/api/v1/batches', body)
  const id = created.id || (created.batch && created.batch.id) || created.batch_id
  const start = Date.now()
  let d
  for (;;) {
    d = await api('GET', '/api/v1/batches/' + id)
    if (DONE.has(String(d.status))) break
    if (Date.now() - start > timeoutSec * 1000) throw new CliError(`"${body.title || body.type}" is taking too long. Task id: ${id}`)
    process.stderr.write(`[coolai] ${body.title || body.type}: ${d.status} ${pct(d.progress)} (${Math.round((Date.now() - start) / 1000)}s)\n`)
    await sleep(6000)
  }
  if (d.status !== 'succeeded') throw new CliError(`"${body.title || body.type}" failed: ${(d.result || {}).error || d.status} (credits are refunded automatically)`)
  return { id, result: d.result || {}, credits_cost: Number(d.credits_cost) || 0 }
}
const opId = (p) => p + '_' + crypto.randomBytes(8).toString('hex')
const SCENES = ['commerce', 'local', 'home_service', 'education']
/** viral: 超越爆款 — break down a hit video, then write a better script for the user's own product. */
async function viral(opt) {
  if (!opt.video) throw new CliError('Usage: viral --video <reference video file or asset_id> [--ref product images ...] [--duration 30] [--scene commerce|local|home_service|education] [--lang zh|en] [--note "..."]')
  const scene = str(opt.scene, 'commerce')
  if (!SCENES.includes(scene)) throw new CliError('--scene must be one of: ' + SCENES.join(' / '))
  const duration = Math.max(4, Math.min(60, Math.round(num(opt.duration, 30))))
  const [video] = await resolveRefs([str(opt.video)])
  if (video.media_type !== 'video') throw new CliError('--video must be a video file (mp4 / mov / webm, up to 60 seconds)')
  const images = await resolveRefs(list(opt.ref))
  if (images.some((r) => r.media_type !== 'image')) throw new CliError('--ref takes product images here')
  const acct = await me()
  const qb = (type) => api('POST', '/api/v1/credits/quote', { type, tool_slug: 'prompt-generator' }).then((q) => Number(q.estimated_credits ?? q.credits ?? 0)).catch(() => 0)
  const [qa, qbd, qs] = await Promise.all([images.length ? qb('write_material_analysis') : 0, qb('video_script_breakdown'), qb('write_script_generate')])
  const total = round2(qa + qbd + qs)
  const reuse = ` --video ${video.asset_id}${images.map((r) => ' --ref ' + r.asset_id).join('')}`
  if (!opt.confirm) {
    return {
      ok: true,
      submitted: false,
      quote: { credits: total, analyze_images: round2(qa), break_down_video: round2(qbd), write_script: round2(qs), available_credits: acct.credits },
      account: acct,
      request: { video: video.asset_id, images: images.map((r) => ({ label: r.mention_label, asset_id: r.asset_id })), duration_seconds: duration, scene },
      next: `Breaking down the reference video and writing a new script costs about ${total} credits (balance ${acct.credits}). Nothing was charged. After the user agrees run: viral${reuse} --duration ${duration} --scene ${scene} --confirm`,
    }
  }
  if (acct.credits < total) throw new CliError(`Not enough credits: needs about ${total}, balance ${acct.credits}`, { reason: 'insufficient_credits' })
  const imgRefs = images.map((r) => ({ asset_id: r.asset_id, media_type: 'image', mention_label: r.mention_label }))
  let analyses = []
  let spent = 0
  if (images.length) {
    const a = await simpleBatch({ type: 'write_material_analysis', tool_slug: 'prompt-generator', title: '超越爆款：分析素材', reference_elements: imgRefs, client_operation_id: opId('an') }, 300)
    analyses = (a.result.items || []).map((x) => ({ label: x.label, description: x.description }))
    spent += a.credits_cost
  }
  const bd = await simpleBatch({ type: 'video_script_breakdown', tool_slug: 'prompt-generator', title: '超越爆款：拆解参考视频', reference_elements: [{ asset_id: video.asset_id, media_type: 'video', mention_label: '视频1' }], client_operation_id: opId('bd') }, 480)
  spent += bd.credits_cost
  const sc = await simpleBatch({
    type: 'write_script_generate',
    tool_slug: 'prompt-generator',
    title: '超越爆款：生成视频脚本',
    reference_elements: imgRefs,
    analyses,
    characters: [],
    business_scene: scene,
    script_language: str(opt.lang, 'zh'),
    duration_seconds: duration,
    mode: 'reference',
    breakdown_batch_id: bd.id,
    extra_instruction: str(opt.note) || undefined,
    client_operation_id: opId('sc'),
  }, 420)
  spent += sc.credits_cost
  const dir = path.resolve(str(opt.out, './coolai-output'))
  fs.mkdirSync(dir, { recursive: true })
  const scriptFile = path.join(dir, `viral-script-${sc.id.slice(0, 8)}.txt`)
  const bdFile = path.join(dir, `viral-breakdown-${bd.id.slice(0, 8)}.md`)
  fs.writeFileSync(scriptFile, sc.result.markdown || '', 'utf8')
  fs.writeFileSync(bdFile, bd.result.markdown || '', 'utf8')
  return {
    ok: true,
    script: sc.result.markdown || '',
    script_file: scriptFile,
    breakdown_file: bdFile,
    charged_credits: round2(spent),
    next: `Show the script to the user (the breakdown of the reference video is in breakdown_file). To make the video: video --prompt-file "${scriptFile}" --duration ${Math.min(duration, 15)} --skill beyond-viral${images.map((r) => ' --ref ' + r.asset_id).join('')}  (check the model's max duration with: models video)`,
  }
}
/** replica: 深度复刻 — copy the moves, camera and pacing of a reference video with your own product / person / background. */
async function buildReplica(opt) {
  if (!opt.video) throw new CliError('Usage: replica --video <reference video file or asset_id> [--product img ...] [--person img ...] [--background img ...] [--voice audio] [--prompt "what to change"] [--sound original|ai|mute]')
  const [video] = await resolveRefs([str(opt.video)])
  if (video.media_type !== 'video') throw new CliError('--video must be a video file')
  const els = [{ asset_id: video.asset_id, media_type: 'video', mention_label: '视频1', url: video.url }]
  let images = 0
  for (const [flag, prefix, role, kind] of [['product', '商品', 'product', 'image'], ['person', '人物', 'person', 'image'], ['background', '背景', 'background', 'image'], ['voice', '声音', 'voice', 'audio']]) {
    const vals = list(opt[flag])
    if (!vals.length) continue
    const refs = await resolveRefs(vals)
    refs.forEach((r, i) => {
      if (r.media_type !== kind) throw new CliError(`--${flag} must be ${kind === 'audio' ? 'an audio file' : 'image files'}`)
      if (kind === 'image') images += 1
      els.push({ asset_id: r.asset_id, media_type: kind, mention_label: prefix + (i + 1), ...(kind !== 'audio' ? { ref_role: role } : {}), url: r.url })
    })
  }
  if (images > 8) throw new CliError('Deep Replica takes at most 8 images in total')
  if (list(opt.voice).length > 1) throw new CliError('Only one --voice file')
  const sound = str(opt.sound, 'original')
  if (!['original', 'ai', 'mute'].includes(sound)) throw new CliError('--sound must be original / ai / mute')
  const model = str(opt.model) || 'video.doubao_seedance_2_0_mini'
  const payload = {
    type: 'depth_video_clone',
    tool_slug: 'depth-video-clone',
    model_key: model,
    logical_model_key: model,
    prompt: opt.prompt || opt['prompt-file'] ? readPrompt(opt) : '',
    aspect_ratio: str(opt.ratio, '9:16'),
    resolution: str(opt.resolution, '480p'),
    duration_seconds: Math.max(4, Math.min(60, Math.round(num(opt.duration, 10)))),
    generate_count: 1,
    generate_audio: sound === 'ai',
    keep_source_audio: sound === 'original',
    reference_elements: els,
    client_operation_id: opId('dr'),
  }
  if (opt['portrait-consent']) payload.portrait_consent = true
  return payload
}

// ---------- main ----------
const HELP = `COOL AI skill CLI ${VERSION}  (${DEFAULT_BASE})

  auth set <ca_sk_...>          save the member's API key (~/.coolai/config.json)
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

  packs                         image skill packs (技能包): slots and, for set packs, modules
  styles                        art styles and theme colours (ids for --style / --color)
  image  --pack ID --slot KEY=file|asset_id ... [--prompt "..."]      one image with a skill pack
  imageset --pack ecommerce-image-set|social-image-set|ip-mascot-set --slot product=file ...
         [--modules hero=1,scene=2,...] [--lang 中文|英文|无文案|...] [--ratio 3:4] [--style ID] [--color ID]
         [--prompt "product facts"]             writes the plan for a whole set (free), returns set_id
  imageset-edit <set_id> --row N --prompt "..."  change one image's prompt before generating (free)
  imageset-generate <set_id> [--confirm]         price, then generate and download the set

  viral  --video file|asset_id [--ref product images ...] [--duration 30] [--scene commerce|local|home_service|education]
         [--lang zh|en] [--note "..."] [--confirm]      超越爆款: break down a hit video, write a better script
  replica --video file|asset_id [--product img ...] [--person img ...] [--background img ...] [--voice audio]
         [--prompt "what to change"] [--sound original|ai|mute] [--duration 10] [--model K] [--resolution 480p]
         [--portrait-consent] [--confirm]               深度复刻: same moves and shots, your product / person
  task <id> [--wait]            status / result of one task
  tasks [--limit 10]            recent tasks

  Without --confirm, image / video / script / viral / replica / imageset-generate only return the price —
  nothing is charged. imageset (the plan) is free.
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
        if (!/^[a-z]{2}_sk_[\w-]{20,}$/.test(key)) throw new CliError('That does not look like a COOL AI API key (it starts with ca_sk_). Create one at ' + CFG.base_url + '/account/api-keys')
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
    case 'packs':
      out = { ok: true, packs: await imagePacks(), copy_languages: COPY_LANGS }
      break
    case 'styles':
      out = { ok: true, ...(await styleLibrary()) }
      break
    case 'imageset':
      out = await imageSetPlan(opt)
      break
    case 'imageset-edit':
      if (!pos[1]) throw new CliError('Usage: imageset-edit <set_id> --row N --prompt "..."')
      out = await imageSetEdit(pos[1], opt)
      break
    case 'imageset-generate':
      if (!pos[1]) throw new CliError('Usage: imageset-generate <set_id> [--confirm]')
      out = await imageSetGenerate(pos[1], opt)
      break
    case 'viral':
      out = await viral(opt)
      break
    case 'replica':
      out = await generate('replica', opt)
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
