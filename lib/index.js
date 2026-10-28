/* ============================================================================
 * hdd-console-boot — Host 半侧
 * ----------------------------------------------------------------------------
 * 三件事：
 *   1) 往 index.html 注入首屏兜底黑屏 + 关键样式 + 配置 + 运行时脚本
 *   2) 提供 /hdd-console/splash.css · splash.js · config 三个路由
 *   3) 把配置持久化到 ~/.dsh/hdd-console.json（设置面板经 /hdd-console/config 读写）
 *
 * 直接往 HTML 里插，不走 settings 命名空间：插件自带的设置面板读写自己的
 * JSON，少受 dsh-settings 版本变化影响。
 * ========================================================================== */

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const PACKAGE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const DSH_HOME = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
const CONFIG_FILE = path.join(DSH_HOME, 'hdd-console.json')

const NS = 'hdd-console-boot'
const ROUTE_BASE = '/hdd-console'

/** 版本号读自己的 package.json，避免源码与版本两处各写一份。 */
const PLUGIN_VERSION = (() => {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(PACKAGE_ROOT, 'package.json'), 'utf8'))
    const v = String(pkg.version || '').trim()
    return v || '0.0.0'
  } catch (err) {
    return '0.0.0'
  }
})()

/** 默认配置：字段与 lib/splash.js 的 DEFAULTS 一一对应。 */
const DEFAULTS = {
  enabled: true,
  mode: 'session',          // always | session | daily
  speed: 1,                 // 0.35 – 3
  requireGate: true,        // 第四幕是否停下等「放行」
  allowSkip: true,
  /* 自动更新：默认关闭。开了也只是后台查一次新版本并提示，不会偷偷替换插件 */
  autoUpdate: false,
  sound: true,
  volume: 0.6,              // 0 – 1
  accent: 'amber',          // amber | jade
  identity: 'HANLIN',
  station: 'STATION 07',
  build: '1.0.0',
  title: 'HDD',
  subtitle: 'HARD DISK DRIVE CONTROL',
  bootLine: '启动深空检索终端',
  bootLineEn: 'BOOTING DEEP-SPACE RETRIEVAL TERMINAL',
  footer: 'DEEPSEEK HARNESS · ORIGINAL BOOT SEQUENCE'
}

const TEXT_KEYS = [
  'identity', 'station', 'build', 'title', 'subtitle',
  'bootLine', 'bootLineEn', 'footer'
]
const ENUMS = {
  mode: ['always', 'session', 'daily'],
  accent: ['amber', 'jade']
}
const BOOL_KEYS = ['enabled', 'requireGate', 'allowSkip', 'sound', 'autoUpdate']
const RANGES = {
  speed: [0.35, 3],
  volume: [0, 1]
}

function normalize(input) {
  const out = { ...DEFAULTS }
  const src = input && typeof input === 'object' ? input : {}
  for (const key of Object.keys(DEFAULTS)) {
    if (!(key in src) || src[key] === undefined || src[key] === null) continue
    const value = src[key]
    if (BOOL_KEYS.includes(key)) {
      out[key] = value === true || value === 'true' || value === 1 || value === '1'
    } else if (ENUMS[key]) {
      out[key] = ENUMS[key].includes(value) ? value : DEFAULTS[key]
    } else if (RANGES[key]) {
      const [lo, hi] = RANGES[key]
      const n = Number(value)
      out[key] = Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : DEFAULTS[key]
    } else if (TEXT_KEYS.includes(key)) {
      out[key] = String(value).slice(0, 64)
    } else {
      out[key] = value
    }
  }
  if (!String(out.identity).trim()) out.identity = DEFAULTS.identity
  if (!String(out.title).trim()) out.title = DEFAULTS.title
  /* 高级字段：六幕脚本 / 日志 / 配色。结构由运行时自己归一化，这里原样透传，
     只挡掉明显不是数组/对象的值，避免脏数据把配置文件写坏。 */
  if (Array.isArray(src.steps)) out.steps = src.steps
  if (Array.isArray(src.logs)) out.logs = src.logs
  if (src.colors && typeof src.colors === 'object' && !Array.isArray(src.colors)) out.colors = src.colors
  return out
}

/* ── 自动更新检查 ──────────────────────────────────────────────────────────
   只查 GitHub 上的 package.json 版本号，查到新版本就告诉面板「有新版本」，
   不下载、不替换、不重启。真正的安装仍然走 dsh plugin add —— 插件在运行时
   替换自己的文件风险太高。
   网络不通（github.com 常被墙）时只看 api.github.com；两次都失败就返回错误，
   面板会显示「检查失败」，不影响动画本身。 */
const UPDATE_REPO = 'hanqi007/dsh-hdd'
const UPDATE_TTL = 10 * 60 * 1000
let updateCache = { at: 0, value: null }

function cmpVersion(a, b) {
  const pa = String(a || '').split('.').map((n) => parseInt(n, 10) || 0)
  const pb = String(b || '').split('.').map((n) => parseInt(n, 10) || 0)
  for (let i = 0; i < 3; i++) {
    const x = pa[i] || 0
    const y = pb[i] || 0
    if (x !== y) return x > y ? 1 : -1
  }
  return 0
}

async function checkUpdate(force) {
  const now = Date.now()
  if (!force && updateCache.value && now - updateCache.at < UPDATE_TTL) return updateCache.value
  if (typeof fetch !== 'function') throw new Error('当前 Node 没有全局 fetch，无法检查更新')
  const url = 'https://api.github.com/repos/' + UPDATE_REPO + '/contents/package.json'
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 8000)
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: {
        'User-Agent': 'dsh-hdd-console-boot',
        Accept: 'application/vnd.github.raw'
      }
    })
    if (!res.ok) throw new Error('GitHub API ' + res.status)
    const pkg = JSON.parse(await res.text())
    const latest = String(pkg.version || '').trim()
    const value = {
      ok: true,
      current: PLUGIN_VERSION,
      latest,
      hasUpdate: !!latest && cmpVersion(latest, PLUGIN_VERSION) > 0,
      repo: UPDATE_REPO,
      url: 'https://github.com/' + UPDATE_REPO,
      checkedAt: new Date().toISOString()
    }
    updateCache = { at: now, value }
    return value
  } finally {
    clearTimeout(timer)
  }
}

/** 当前用户：取系统账户名，供设置面板顶部显示。读不到就返回空串，面板不显示。 */

function currentUser() {
  try {
    const info = os.userInfo()
    let host = ''
    try { host = String(os.hostname() || '').trim() } catch (err) { host = '' }
    return { name: String(info.username || '').trim(), host }
  } catch (err) {
    return { name: '', host: '' }
  }
}

function readConfig() {
  try {
    const raw = fs.readFileSync(CONFIG_FILE, 'utf8')
    return normalize(JSON.parse(raw))
  } catch (err) {
    return { ...DEFAULTS }
  }
}

function writeConfig(next) {
  const cfg = normalize(next)
  fs.mkdirSync(path.dirname(CONFIG_FILE), { recursive: true })
  const tmp = CONFIG_FILE + '.tmp'
  fs.writeFileSync(tmp, JSON.stringify(cfg, null, 2), 'utf8')
  fs.renameSync(tmp, CONFIG_FILE)
  return cfg
}

/** 静态文件按 mtime 缓存：改完插件刷新页面即生效，不用重启。 */
function makeReader(rel) {
  let cache = null
  return function read() {
    const file = path.join(PACKAGE_ROOT, rel)
    try {
      const st = fs.statSync(file)
      if (!cache || cache.mtimeMs !== st.mtimeMs) {
        cache = { mtimeMs: st.mtimeMs, text: fs.readFileSync(file, 'utf8') }
      }
      return cache.text
    } catch (err) {
      return ''
    }
  }
}

const readSplashCss = makeReader('lib/splash.css')
const readSplashJs = makeReader('lib/splash.js')

/** 内联脚本里绝对不能出现 `</script>`。 */
function safeJson(value) {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029')
}

/** 首屏兜底：脚本没跑起来也先糊住整屏，避免闪出应用本体。 */
const CRITICAL_CSS =
  '#hdd-root.hdd-boot{position:fixed;inset:0;z-index:2147483000;background:#060708}' +
  'html.hdd-lock,html.hdd-lock body{overflow:hidden!important}'

const BOOTSTRAP_JS = `
(function(){
  var c=window.__HDD_CONFIG__||{};
  function off(reason){window.__HDD_SKIP__=true;window.__HDD_BOOT_OFF__=reason;try{var r=document.getElementById('hdd-root');if(r&&r.parentNode)r.parentNode.removeChild(r)}catch(e){}document.documentElement.classList.remove('hdd-lock');document.documentElement.style.overflow='';if(document.body)document.body.style.overflow=''}
  if(c.enabled===false){off('disabled');return}
  if(c.mode==='session'){
    try{if(sessionStorage.getItem('hdd-console:shown')==='1'){off('session');return}}catch(e){}
  }
  if(c.mode==='daily'){
    try{if(localStorage.getItem('hdd-console:day')===new Date().toISOString().slice(0,10)){off('daily');return}}catch(e){}
  }
  document.documentElement.classList.add('hdd-lock');
  /* 9 秒兜底：运行时压根没跑起来（404 / 语法错 / 被拦）时放行，绝不留黑屏。
     判据是「时间线有没有开始跑」，而不是类名 —— 脚本在 run() 之前就摘掉了
     hdd-boot，按类名判等于永不生效。 */
  setTimeout(function(){
    try{
      if(window.__HDD_RUNNING__===true)return;
      var r=document.getElementById('hdd-root');
      if(r&&r.parentNode)r.parentNode.removeChild(r);
      document.documentElement.classList.remove('hdd-lock');
      document.documentElement.style.overflow='';
      if(document.body)document.body.style.overflow='';
      window.__HDD_BOOT_FAILED__=true;
    }catch(e){}
  },9000);
})();`.replace(/\n/g, '')

/** 往 index.html 里注入启动界面。幂等：重复调用不会插两遍。 */
function injectIndex(html, cfg) {
  if (!html || html.includes(ROUTE_BASE + '/splash.js')) return html
  const head = [
    '<link rel="stylesheet" href="' + ROUTE_BASE + '/splash.css">',
    '<style id="hdd-boot-critical">' + CRITICAL_CSS + '</style>'
  ].join('')
  const body = [
    '<div id="hdd-root" class="hdd-root hdd-boot"></div>',
    '<script>window.__HDD_CONFIG__=' + safeJson(cfg) +
      ';window.__HDD_VERSION__=' + safeJson(PLUGIN_VERSION) + ';' + BOOTSTRAP_JS + '</script>',
    '<script defer src="' + ROUTE_BASE + '/splash.js"></script>'
  ].join('')

  let out = html
  if (out.includes('</head>')) out = out.replace('</head>', head + '</head>')
  else out = head + out
  const bodyMatch = out.match(/<body([^>]*)>/i)
  if (bodyMatch) {
    const at = bodyMatch.index + bodyMatch[0].length
    out = out.slice(0, at) + body + out.slice(at)
  } else {
    out = out + body
  }
  return out
}

/* ── HTTP 小工具 ─────────────────────────────────────────────────────────── */
function sendText(res, type, text, status) {
  try {
    res.statusCode = status || 200
    res.setHeader('Content-Type', type + '; charset=utf-8')
    res.setHeader('Cache-Control', 'no-store')
    res.end(text)
  } catch (err) { /* 客户端已断开 */ }
}
function sendJson(res, status, value) {
  sendText(res, 'application/json', JSON.stringify(value), status)
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0
    const chunks = []
    req.on('data', (chunk) => {
      size += chunk.length
      if (size > 256 * 1024) { reject(new Error('payload too large')); req.destroy(); return }
      chunks.push(chunk)
    })
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

/* ── 插件本体 ────────────────────────────────────────────────────────────── */
export const name = NS
export const inject = ['webServer']

export function apply(ctx) {
  /* 三个路由：样式 / 运行时 / 配置读写 */
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: ROUTE_BASE + '/splash.css',
    handler: (req, res) => sendText(res, 'text/css', readSplashCss())
  }))

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: ROUTE_BASE + '/splash.js',
    handler: (req, res) => sendText(res, 'application/javascript', readSplashJs())
  }))

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: ROUTE_BASE + '/config',
    handler: async (req, res) => {
      try {
        if ((req.method || 'GET').toUpperCase() === 'GET') {
          sendJson(res, 200, {
            ok: true,
            version: PLUGIN_VERSION,
            config: readConfig(),
            defaults: DEFAULTS,
            user: currentUser(),
            file: CONFIG_FILE
          })
          return
        }
        if ((req.method || 'GET').toUpperCase() === 'POST') {
          const raw = await readBody(req)
          let parsed = null
          try { parsed = JSON.parse(raw || '{}') } catch (err) {
            sendJson(res, 400, { ok: false, error: 'JSON 解析失败' })
            return
          }
          /* 只接受配置对象；reset:true 时恢复默认 */
          if (parsed && parsed.reset === true) {
            const cfg = writeConfig(DEFAULTS)
            sendJson(res, 200, { ok: true, version: PLUGIN_VERSION, config: cfg, defaults: DEFAULTS })
            return
          }
          const patch = parsed && parsed.config && typeof parsed.config === 'object' ? parsed.config : parsed
          const merged = { ...readConfig(), ...(patch || {}) }
          const cfg = writeConfig(merged)
          sendJson(res, 200, { ok: true, version: PLUGIN_VERSION, config: cfg, defaults: DEFAULTS })
          return
        }
        sendJson(res, 405, { ok: false, error: '只支持 GET / POST' })
      } catch (err) {
        sendJson(res, 500, { ok: false, error: String(err && err.message ? err.message : err) })
      }
    }
  }))

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: ROUTE_BASE + '/update',
    handler: async (req, res) => {
      try {
        const force = /[?&]force=1/.test(req.url || '')
        sendJson(res, 200, await checkUpdate(force))
      } catch (err) {
        sendJson(res, 200, {
          ok: false,
          current: PLUGIN_VERSION,
          error: String(err && err.message ? err.message : err),
          repo: UPDATE_REPO,
          url: 'https://github.com/' + UPDATE_REPO
        })
      }
    }
  }))

  /* index.html 注入：每次渲染都读一次配置，设置面板保存后刷新即生效 */
  ctx.effect(() => ctx.webServer.tapIndex((html) => injectIndex(html, readConfig())))
}

export default { name, inject, apply }
