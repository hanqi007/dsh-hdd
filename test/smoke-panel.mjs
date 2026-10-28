/* 设置面板渲染冒烟：用极简 React shim 真正跑一遍 Panel。
   版式按旧版思路：单页滚动 + 分组卡片，不再有标签页。
   这能抓到「面板一打开就白屏」这类问题，而不只是字符串有没有出现。 */
import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'

const ROOT = path.resolve(import.meta.dirname, '..')
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8')

let pass = 0
let fail = 0
function check(name, ok, detail) {
  if (ok) { pass++; console.log('  ok   ' + name) } else { fail++; console.log('  FAIL ' + name + (detail ? '  → ' + detail : '')) }
}

/* ── 极简 React ───────────────────────────────────────────────────────────── */
let hookIndex = 0
let presets = []
function createElement(type, props) {
  var children = Array.prototype.slice.call(arguments, 2)
  return { type, props: props || {}, children }
}
function useState(init) {
  var i = hookIndex++
  var value = i < presets.length ? presets[i] : (typeof init === 'function' ? init() : init)
  return [value, function () {}]
}
function useEffect() { hookIndex++ }
const reactShim = { createElement, useState, useEffect }

/* ── 载入 bundle ─────────────────────────────────────────────────────────── */
const source = read('lib/client.js')
let factory = null
const sandbox = {
  console,
  JSON, Object, Array, String, Number, Boolean, Math, Date, RegExp, Error,
  Blob: function () {}, URL: { createObjectURL: () => 'blob:x', revokeObjectURL: () => {} },
  FileReader: function () {},
  setTimeout,
  window: { __ModuleLoader__: { load(options) { factory = options.factory } } },
  document: {
    head: { appendChild: () => {} },
    querySelector: () => null,
    createElement: () => ({ dataset: {}, textContent: '', parentNode: null, click: () => {} }),
    body: { appendChild: () => {}, removeChild: () => {} }
  }
}
sandbox.globalThis = sandbox
vm.createContext(sandbox)
vm.runInContext(source, sandbox)
check('bundle 被 ModuleLoader 接收', !!factory)

let mod = null
try {
  mod = factory((name) => {
    if (name === 'react') return reactShim
    throw new Error('unexpected require: ' + name)
  })
} catch (e) {
  check('factory 可执行', false, String(e).slice(0, 160))
}
check('导出 apply', !!(mod && typeof mod.apply === 'function'))

let registered = null
const ctx = {
  slots: {
    inject(name, fn) { fn() },
    register(def, render) { registered = { def, render }; return () => {} }
  },
  effect(fn) { return fn() }
}
try {
  mod.apply(ctx)
} catch (e) {
  check('apply 可执行', false, String(e).slice(0, 160))
}
check('注册了 settings.section', !!registered && registered.def.name === 'settings.section')
check('注册 id 是 hdd-console', !!registered && registered.def.id === 'hdd-console')
check('section 标签是「开机动画」', !!registered && registered.def.label === '开机动画')

/* ── 构造配置并渲染 ───────────────────────────────────────────────────────── */
const steps = Array.from({ length: 6 }, (_, i) => ({
  zh: '第' + (i + 1) + '幕', en: 'ACT ' + (i + 1), sub: '副标题 ' + (i + 1),
  pct: i * 20, hold: 1000, tag: 'T' + i, gate: i === 3, alert: i === 3
}))
const logs = Array.from({ length: 6 }, (_, i) => ([
  ['TAG', '第 ' + (i + 1) + ' 幕第一行', 'ok'],
  ['TAG', '第 ' + (i + 1) + ' 幕第二行']
]))
const colors = { paper: '#e9e2d2', amber: '#f2a23c', jade: '#58d6b0', alarm: '#e4483c' }
const cfg = {
  enabled: true, mode: 'session', speed: 1, requireGate: true, allowSkip: true,
  sound: true, volume: 0.6, accent: 'amber',
  identity: 'HANLIN', station: 'STATION 07', build: '1.0.0',
  title: 'HDD', subtitle: 'HARD DISK CONTROL', footer: 'POWERED BY DEEPSEEK',
  steps, logs, colors
}

function walk(node, out) {
  if (node == null || node === false) return
  if (Array.isArray(node)) { node.forEach((n) => walk(n, out)); return }
  if (typeof node !== 'object') return
  if (typeof node.type === 'function') {
    let rendered = null
    try {
      rendered = node.type(Object.assign({}, node.props, { children: node.children }))
    } catch (e) {
      out.push({ cls: '__render_error', text: String(e && e.message ? e.message : e) })
      return
    }
    walk(rendered, out)
    return
  }
  if (node.props && typeof node.props.className === 'string') {
    out.push({ cls: node.props.className, text: textOf(node), tag: node.type })
  }
  ;(node.children || []).forEach((c) => walk(c, out))
}
function textOf(node) {
  let s = ''
  ;(node.children || []).forEach((c) => {
    if (typeof c === 'string' || typeof c === 'number') s += String(c)
    else if (Array.isArray(c)) c.forEach((x) => { if (typeof x === 'string') s += x })
    else if (c && typeof c === 'object') s += textOf(c)
  })
  return s
}

function renderPanel(draft) {
  hookIndex = 0
  presets = [draft || cfg, cfg, '/tmp/hdd-console.json', '1.0.1', null, null, false, { name: 'hanlin', host: 'TESTHOST' }]
  const el = registered.render()
  const out = []
  walk(el, out)
  return out
}

let view = []
try { view = renderPanel() } catch (e) {
  check('渲染不抛错', false, String(e && e.stack ? e.stack.split('\n')[0] : e))
}
check('渲染不抛错', view.length > 0)
check('没有渲染错误', !view.some((n) => n.cls === '__render_error'), (view.find((n) => n.cls === '__render_error') || {}).text)

/* ── 单页分组：旧版那种滚动卡片 ───────────────────────────────────────────── */
const groupTitles = view.filter((n) => n.cls === '__hb_groupTitle').map((n) => n.text)
check('没有标签页按钮', !view.some((n) => n.cls.indexOf('__hb_tab') === 0))
check('有 6 个分组', groupTitles.length === 6, groupTitles.join('|'))
;['播放', '身份与标牌', '六幕脚本', '启动日志', '配色', '声音'].forEach((t) => {
  check('分组「' + t + '」', groupTitles.some((x) => x.indexOf(t) >= 0), groupTitles.join('|'))
})

check('6 张幕卡', view.filter((n) => n.cls === '__hb_act').length === 6, String(view.filter((n) => n.cls === '__hb_act').length))
check('幕卡里有输入框', view.filter((n) => n.cls === '__hb_input').length >= 24, String(view.filter((n) => n.cls === '__hb_input').length))
check('第四幕有放行提示', view.some((n) => n.text.indexOf('等放行') >= 0))

check('6 组日志（details 折叠）', view.filter((n) => n.cls === '__hb_logGroup' && n.tag === 'details').length === 6, String(view.filter((n) => n.cls === '__hb_logGroup').length))
check('12 行日志', view.filter((n) => n.cls === '__hb_logLine').length === 12, String(view.filter((n) => n.cls === '__hb_logLine').length))
check('有「+ 加一行」', view.some((n) => n.text.indexOf('加一行') >= 0))

check('4 个颜色行', view.filter((n) => n.cls === '__hb_colorRow').length === 4, String(view.filter((n) => n.cls === '__hb_colorRow').length))
check('5 个配色预设', ['默认琥珀', '青绿', '冰蓝', '品红', '旧金'].every((label) => view.some((n) => n.text.indexOf(label) >= 0)))

check('顶部显示当前用户', view.some((n) => n.cls === '__hb_user' && n.text.indexOf('hanlin') >= 0), (view.find((n) => n.cls === '__hb_user') || {}).text)
check('有「立即预览」', view.some((n) => n.text.indexOf('立即预览') >= 0))
check('有保存 / 恢复默认 / 导入 / 导出', ['保存', '恢复默认', '导入 JSON', '导出 JSON'].every((t) => view.some((n) => n.text === t)))

/* ── 缺配置时也不白屏 ─────────────────────────────────────────────────────── */
let minimalView = []
try {
  minimalView = renderPanel(Object.assign({}, cfg, { steps: [], logs: [], colors: {} }))
} catch (e) { /* ignore */ }
check('缺 steps/logs 时不抛错', minimalView.length > 0 && !minimalView.some((n) => n.cls === '__render_error'))

/* ── 桌面端自举代码存在（这是上一轮踩过的坑）──────────────────────────────── */
const clientSrc = read('lib/client.js')
check('有 selfBoot 兜底', clientSrc.includes('function selfBoot'))
check('自举会拉 splash.css 与 splash.js', clientSrc.includes("BOOT_ROUTE + '/splash.css'") && clientSrc.includes("BOOT_ROUTE + '/splash.js?t='"))
check('自举失败会放开页面', clientSrc.includes('window.__HDD_BOOT_FAILED__ = true'))
check('Host 注入过就不再自举', clientSrc.includes('if (window.__HDD_CONFIG__) return'))
check('建 root 之前就先藏标题栏', /function injectRoot\(cfg, onReady\) \{\s*\n\s*earlyHideTitlebar\(\)/.test(clientSrc))
check('fetch 之前就藏（覆盖最慢的一段）', /earlyHideTitlebar\(\)\s*\n\s*\n?\s*fetch\(API/.test(clientSrc))
check('决定不播时还原标题栏', clientSrc.includes('restoreTitlebarEarly()'))
check('自举失败时也还原', /restoreTitlebarEarly\(\)\s*\n\s*window\.__HDD_BOOT_FAILED__ = true/.test(clientSrc))
check('只动探针、不动 html token', !/earlyHideTitlebar[\s\S]{0,600}rootEl\.style\.setProperty/.test(clientSrc))

console.log('\n============================')
console.log(`  通过 ${pass} / 失败 ${fail}`)
console.log('============================')
process.exit(fail ? 1 : 0)
