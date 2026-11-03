/* ============================================================================
 * hdd-console-boot — 主题引擎
 * ----------------------------------------------------------------------------
 * 主题 = 一组配色 + 一张程序化生成的背景图（SVG，纯几何，全部原创）。
 *
 * 三个来源：
 *   1) 内置：本文件里的 BUILTIN_THEMES，代码生成，不依赖任何外部素材
 *   2) 用户导入：~/.dsh/hdd-themes/<id>/theme.json + background.svg
 *   3) 临时：设置页里选的 id，落到 dsh-hdd.json 的 theme 字段
 *
 * 为什么用 SVG 而不是位图：
 *   - 体积小（每张几 KB）
 *   - 任意分辨率不糊
 *   - 纯数学生成，不存在版权问题
 * ========================================================================== */

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const DSH_HOME = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
export const USER_THEME_DIR = path.join(DSH_HOME, 'hdd-themes')

/* ── SVG 生成小工具 ─────────────────────────────────────────────────────── */

const svgOpen = (w, h) =>
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + w + ' ' + h + '" preserveAspectRatio="xMidYMid slice">'

const lerp = (a, b, t) => a + (b - a) * t

/** 由字符串生成稳定的伪随机序列（同一主题每次生成的图案一致） */
function seeded(seed) {
  let s = 0
  for (let i = 0; i < seed.length; i++) s = (s * 31 + seed.charCodeAt(i)) >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 4294967296
  }
}

/* ── 内置主题 ───────────────────────────────────────────────────────────── */

const W = 1600
const H = 900

/* 1) 翡翠：斜向光带 + 细网格，冷绿 */
function jadeBg() {
  const rnd = seeded('jade')
  let bands = ''
  for (let i = 0; i < 7; i++) {
    const y = 80 + i * 120 + rnd() * 40
    const op = (0.03 + rnd() * 0.06).toFixed(3)
    bands += '<rect x="-200" y="' + y.toFixed(0) + '" width="' + (W + 400) + '" height="' + (10 + rnd() * 26).toFixed(0) +
      '" fill="url(#jade-grad)" opacity="' + op + '" transform="rotate(-14 800 450)"/>'
  }
  let grid = ''
  for (let x = 0; x <= W; x += 80) {
    grid += '<line x1="' + x + '" y1="0" x2="' + x + '" y2="' + H + '" stroke="#2f9e63" stroke-width="0.5" opacity="0.07"/>'
  }
  for (let y = 0; y <= H; y += 80) {
    grid += '<line x1="0" y1="' + y + '" x2="' + W + '" y2="' + y + '" stroke="#2f9e63" stroke-width="0.5" opacity="0.07"/>'
  }
  return svgOpen(W, H) +
    '<defs>' +
    '<radialGradient id="jade-base" cx="30%" cy="20%" r="90%">' +
    '<stop offset="0%" stop-color="#0b1a14"/><stop offset="60%" stop-color="#050c09"/><stop offset="100%" stop-color="#02050a"/>' +
    '</radialGradient>' +
    '<linearGradient id="jade-grad" x1="0" y1="0" x2="1" y2="0">' +
    '<stop offset="0%" stop-color="#2f9e63" stop-opacity="0"/><stop offset="45%" stop-color="#7fe3b0" stop-opacity="1"/>' +
    '<stop offset="55%" stop-color="#2f9e63" stop-opacity="1"/><stop offset="100%" stop-color="#2f9e63" stop-opacity="0"/>' +
    '</linearGradient>' +
    '</defs>' +
    '<rect width="' + W + '" height="' + H + '" fill="url(#jade-base)"/>' +
    bands + grid +
    '</svg>'
}

/* 2) 琥珀：同心弧 + 暖橙辉光 */
function amberBg() {
  let arcs = ''
  for (let i = 1; i <= 9; i++) {
    const r = i * 110
    arcs += '<circle cx="1180" cy="240" r="' + r + '" fill="none" stroke="#ffb45e" stroke-width="' + (1 + (9 - i) * 0.4).toFixed(1) +
      '" opacity="' + (0.16 - i * 0.014).toFixed(3) + '"/>'
  }
  return svgOpen(W, H) +
    '<defs>' +
    '<radialGradient id="amb-base" cx="72%" cy="18%" r="85%">' +
    '<stop offset="0%" stop-color="#2a1608"/><stop offset="45%" stop-color="#140b05"/><stop offset="100%" stop-color="#07040a"/>' +
    '</radialGradient>' +
    '<radialGradient id="amb-glow" cx="50%" cy="50%" r="50%">' +
    '<stop offset="0%" stop-color="#ff9a3c" stop-opacity="0.30"/><stop offset="100%" stop-color="#ff9a3c" stop-opacity="0"/>' +
    '</radialGradient>' +
    '</defs>' +
    '<rect width="' + W + '" height="' + H + '" fill="url(#amb-base)"/>' +
    '<circle cx="1180" cy="240" r="380" fill="url(#amb-glow)"/>' +
    arcs +
    '<rect x="0" y="' + (H - 3) + '" width="' + W + '" height="3" fill="#ff8a2b" opacity="0.55"/>' +
    '</svg>'
}

/* 3) 警戒：斜向警示条 + 暗红 */
function alarmBg() {
  let stripes = ''
  for (let i = -40; i < 40; i++) {
    const x = i * 64
    stripes += '<rect x="' + x + '" y="-100" width="26" height="' + (H + 200) + '" fill="#e5484d" opacity="' +
      (i % 2 === 0 ? '0.05' : '0.02') + '" transform="rotate(24 800 450)"/>'
  }
  return svgOpen(W, H) +
    '<defs>' +
    '<linearGradient id="al-base" x1="0" y1="0" x2="0" y2="1">' +
    '<stop offset="0%" stop-color="#1a0608"/><stop offset="55%" stop-color="#0c0407"/><stop offset="100%" stop-color="#05030a"/>' +
    '</linearGradient>' +
    '<radialGradient id="al-vig" cx="50%" cy="50%" r="70%">' +
    '<stop offset="55%" stop-color="#000" stop-opacity="0"/><stop offset="100%" stop-color="#000" stop-opacity="0.65"/>' +
    '</radialGradient>' +
    '</defs>' +
    '<rect width="' + W + '" height="' + H + '" fill="url(#al-base)"/>' +
    stripes +
    '<rect width="' + W + '" height="' + H + '" fill="url(#al-vig)"/>' +
    '<rect x="0" y="0" width="' + W + '" height="2" fill="#ff5a5f" opacity="0.5"/>' +
    '</svg>'
}

/* 4) 单色：极简 —— 只有一层渐变和一条地平线 */
function monoBg() {
  return svgOpen(W, H) +
    '<defs>' +
    '<linearGradient id="mo-base" x1="0" y1="0" x2="0" y2="1">' +
    '<stop offset="0%" stop-color="#111318"/><stop offset="70%" stop-color="#08090c"/><stop offset="100%" stop-color="#040507"/>' +
    '</linearGradient>' +
    '<linearGradient id="mo-line" x1="0" y1="0" x2="1" y2="0">' +
    '<stop offset="0%" stop-color="#8a8f9a" stop-opacity="0"/><stop offset="50%" stop-color="#dfe3ea" stop-opacity="0.5"/>' +
    '<stop offset="100%" stop-color="#8a8f9a" stop-opacity="0"/>' +
    '</linearGradient>' +
    '</defs>' +
    '<rect width="' + W + '" height="' + H + '" fill="url(#mo-base)"/>' +
    '<rect x="0" y="' + (H * 0.72) + '" width="' + W + '" height="1" fill="url(#mo-line)"/>' +
    '</svg>'
}

/* 5) 青：数据流 —— 纵向细线，浓淡随机分布 */
function cyanBg() {
  const rnd = seeded('cyan')
  let streams = ''
  for (let x = 0; x < W; x += 17) {
    const top = rnd() * H * 0.6
    const len = 60 + rnd() * 380
    const op = (0.05 + rnd() * 0.16).toFixed(3)
    streams += '<rect x="' + x + '" y="' + top.toFixed(0) + '" width="1.2" height="' + len.toFixed(0) +
      '" fill="#4fd6e0" opacity="' + op + '"/>'
  }
  return svgOpen(W, H) +
    '<defs>' +
    '<linearGradient id="cy-base" x1="0" y1="0" x2="1" y2="1">' +
    '<stop offset="0%" stop-color="#03141a"/><stop offset="50%" stop-color="#020b10"/><stop offset="100%" stop-color="#010508"/>' +
    '</linearGradient>' +
    '</defs>' +
    '<rect width="' + W + '" height="' + H + '" fill="url(#cy-base)"/>' +
    streams +
    '</svg>'
}

/* 6) 紫霞：大块柔和光斑，像雾 */
function violetBg() {
  const rnd = seeded('violet')
  let blobs = ''
  for (let i = 0; i < 5; i++) {
    const cx = 150 + rnd() * (W - 300)
    const cy = 120 + rnd() * (H - 240)
    const r = 260 + rnd() * 340
    const hue = ['#a06cff', '#6c7bff', '#c86cff', '#5f8cff'][i % 4]
    blobs += '<circle cx="' + cx.toFixed(0) + '" cy="' + cy.toFixed(0) + '" r="' + r.toFixed(0) +
      '" fill="' + hue + '" opacity="' + (0.05 + rnd() * 0.07).toFixed(3) + '" filter="url(#vi-blur)"/>'
  }
  return svgOpen(W, H) +
    '<defs>' +
    '<filter id="vi-blur" x="-40%" y="-40%" width="180%" height="180%">' +
    '<feGaussianBlur stdDeviation="60"/></filter>' +
    '<linearGradient id="vi-base" x1="0" y1="0" x2="0" y2="1">' +
    '<stop offset="0%" stop-color="#0d0a1c"/><stop offset="60%" stop-color="#080614"/><stop offset="100%" stop-color="#04030a"/>' +
    '</linearGradient>' +
    '</defs>' +
    '<rect width="' + W + '" height="' + H + '" fill="url(#vi-base)"/>' +
    blobs +
    '</svg>'
}

/* 7) 钢蓝：对角切面，硬边 */
function steelBg() {
  return svgOpen(W, H) +
    '<defs>' +
    '<linearGradient id="st-base" x1="0" y1="0" x2="1" y2="1">' +
    '<stop offset="0%" stop-color="#0a121c"/><stop offset="100%" stop-color="#04070c"/>' +
    '</linearGradient>' +
    '<linearGradient id="st-sheen" x1="0" y1="0" x2="1" y2="0">' +
    '<stop offset="0%" stop-color="#6fa8dc" stop-opacity="0"/><stop offset="50%" stop-color="#9fc9ea" stop-opacity="0.35"/>' +
    '<stop offset="100%" stop-color="#6fa8dc" stop-opacity="0"/>' +
    '</linearGradient>' +
    '</defs>' +
    '<rect width="' + W + '" height="' + H + '" fill="url(#st-base)"/>' +
    '<path d="M0 ' + (H * 0.62) + ' L' + W + ' ' + (H * 0.38) + ' L' + W + ' ' + H + ' L0 ' + H + ' Z" fill="#0d1b2a" opacity="0.85"/>' +
    '<path d="M0 ' + (H * 0.62) + ' L' + W + ' ' + (H * 0.38) + '" stroke="url(#st-sheen)" stroke-width="2"/>' +
    '<path d="M0 ' + (H * 0.78) + ' L' + W + ' ' + (H * 0.54) + ' L' + W + ' ' + H + ' L0 ' + H + ' Z" fill="#060c14" opacity="0.9"/>' +
    '</svg>'
}

/* 8) 落日：三层渐晕 + 一条地平线 */
function sunsetBg() {
  return svgOpen(W, H) +
    '<defs>' +
    '<linearGradient id="su-base" x1="0" y1="0" x2="0" y2="1">' +
    '<stop offset="0%" stop-color="#2a1230"/><stop offset="38%" stop-color="#5c2338"/>' +
    '<stop offset="62%" stop-color="#a34438"/><stop offset="100%" stop-color="#1a0c12"/>' +
    '</linearGradient>' +
    '<radialGradient id="su-sun" cx="50%" cy="62%" r="26%">' +
    '<stop offset="0%" stop-color="#ffd08a" stop-opacity="0.85"/><stop offset="60%" stop-color="#ff8a4c" stop-opacity="0.35"/>' +
    '<stop offset="100%" stop-color="#ff6a3c" stop-opacity="0"/>' +
    '</radialGradient>' +
    '</defs>' +
    '<rect width="' + W + '" height="' + H + '" fill="url(#su-base)"/>' +
    '<circle cx="800" cy="' + (H * 0.62) + '" r="330" fill="url(#su-sun)"/>' +
    '<rect x="0" y="' + (H * 0.62) + '" width="' + W + '" height="' + (H * 0.38) + '" fill="#12060c" opacity="0.55"/>' +
    '</svg>'
}

/** 内置主题：全部程序化生成，无任何外部素材 */
export const BUILTIN_THEMES = [
  {
    id: 'jade', name: '翡翠', desc: '冷绿光带 + 细网格，出厂默认',
    colors: { accent: '#2f9e63', fg: '#d8f0e4', dim: '#4a7a62', panel: 'rgba(6,20,14,0.72)' },
    bg: jadeBg
  },
  {
    id: 'amber', name: '琥珀', desc: '暖橙辉光 + 同心弧，复古终端味',
    colors: { accent: '#ff9a3c', fg: '#ffe6cc', dim: '#a8763f', panel: 'rgba(26,14,6,0.72)' },
    bg: amberBg
  },
  {
    id: 'alarm', name: '警戒', desc: '暗红警示条 + 强暗角，故障现场',
    colors: { accent: '#ff5a5f', fg: '#ffd9db', dim: '#9c4649', panel: 'rgba(26,6,8,0.75)' },
    bg: alarmBg
  },
  {
    id: 'mono', name: '单色', desc: '极简灰阶，只有一条地平线',
    colors: { accent: '#c9ced8', fg: '#eef1f5', dim: '#7a8290', panel: 'rgba(12,14,18,0.72)' },
    bg: monoBg
  },
  {
    id: 'cyan', name: '青', desc: '数据流细线，纵向浓淡',
    colors: { accent: '#4fd6e0', fg: '#d4f7fa', dim: '#3d8b91', panel: 'rgba(3,20,26,0.72)' },
    bg: cyanBg
  },
  {
    id: 'violet', name: '紫霞', desc: '柔和光斑，雾面渐变',
    colors: { accent: '#a06cff', fg: '#e8dcff', dim: '#6b5399', panel: 'rgba(13,10,28,0.72)' },
    bg: violetBg
  },
  {
    id: 'steel', name: '钢蓝', desc: '对角切面 + 冷光边',
    colors: { accent: '#6fa8dc', fg: '#d9e6f2', dim: '#557a9c', panel: 'rgba(10,18,28,0.74)' },
    bg: steelBg
  },
  {
    id: 'sunset', name: '落日', desc: '暖橙地平线，沉静收尾',
    colors: { accent: '#ff8a4c', fg: '#ffe4d0', dim: '#a3603c', panel: 'rgba(26,12,18,0.74)' },
    bg: sunsetBg
  }
]

/* ── 用户导入的主题 ─────────────────────────────────────────────────────── */

const ID_RE = /^[a-z0-9][a-z0-9._-]{0,40}$/i

/** 读一个用户主题目录：必须有 theme.json，background.svg 可选 */
export function readUserTheme(dir) {
  const metaPath = path.join(dir, 'theme.json')
  if (!fs.existsSync(metaPath)) return { ok: false, error: '缺 theme.json' }
  let meta
  try {
    meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'))
  } catch (err) {
    return { ok: false, error: 'theme.json 不是合法 JSON：' + err.message }
  }
  const id = String(meta.id || path.basename(dir))
  if (!ID_RE.test(id)) return { ok: false, error: 'id 不合法（只允许字母数字和 . _ -）：' + id }
  const colors = meta.colors && typeof meta.colors === 'object' ? meta.colors : {}
  const bgFile = String(meta.background || 'background.svg')
  const bgPath = path.join(dir, bgFile)
  let bg = ''
  if (fs.existsSync(bgPath)) {
    try {
      const text = fs.readFileSync(bgPath, 'utf8')
      if (!/^\s*<svg[\s>]/i.test(text)) return { ok: false, error: bgFile + ' 不是 SVG（必须 <svg 开头）' }
      bg = text
    } catch (err) {
      return { ok: false, error: '读 ' + bgFile + ' 失败：' + err.message }
    }
  }
  return {
    ok: true,
    theme: {
      id,
      name: String(meta.name || id),
      desc: String(meta.desc || '用户导入'),
      colors: {
        accent: String(colors.accent || '#2f9e63'),
        fg: String(colors.fg || '#d8f0e4'),
        dim: String(colors.dim || '#4a7a62'),
        panel: String(colors.panel || 'rgba(6,20,14,0.72)')
      },
      bg,
      user: true
    }
  }
}

/** 列出 ~/.dsh/hdd-themes 下的所有用户主题 */
export function listUserThemes() {
  if (!fs.existsSync(USER_THEME_DIR)) return []
  let names = []
  try { names = fs.readdirSync(USER_THEME_DIR) } catch (err) { return [] }
  const out = []
  for (const n of names) {
    const d = path.join(USER_THEME_DIR, n)
    try {
      if (!fs.statSync(d).isDirectory()) continue
    } catch (err) { continue }
    const r = readUserTheme(d)
    if (r.ok) out.push(r.theme)
    else out.push({ id: n, name: n, desc: '导入失败：' + r.error, colors: {}, bg: '', user: true, broken: true })
  }
  return out
}

/** 把某个目录导入成用户主题（复制到 ~/.dsh/hdd-themes/<id>） */
export function importThemeDir(srcDir) {
  const r = readUserTheme(srcDir)
  if (!r.ok) return r
  const dest = path.join(USER_THEME_DIR, r.theme.id)
  fs.mkdirSync(dest, { recursive: true })
  fs.copyFileSync(path.join(srcDir, 'theme.json'), path.join(dest, 'theme.json'))
  for (const f of ['background.svg', 'preview.svg', 'preview.png']) {
    const p = path.join(srcDir, f)
    if (fs.existsSync(p)) fs.copyFileSync(p, path.join(dest, f))
  }
  return { ok: true, id: r.theme.id, dir: dest }
}

/** 删掉一个用户主题 */
export function removeUserTheme(id) {
  const key = String(id || '')
  if (!ID_RE.test(key)) return { ok: false, error: 'id 不合法' }
  const d = path.join(USER_THEME_DIR, key)
  if (!fs.existsSync(d)) return { ok: false, error: '没有这个主题：' + key }
  try {
    fs.rmSync(d, { recursive: true, force: true })
  } catch (err) {
    return { ok: false, error: String(err && err.message ? err.message : err) }
  }
  return { ok: true }
}

/* ── 汇总 ───────────────────────────────────────────────────────────────── */

/** 全部主题（内置 + 用户），背景统一转成 SVG 字符串 */
export function allThemes() {
  const out = BUILTIN_THEMES.map((t) => ({
    id: t.id,
    name: t.name,
    desc: t.desc,
    colors: t.colors,
    user: false,
    bg: t.bg()
  }))
  for (const t of listUserThemes()) out.push(t)
  return out
}

/** 按 id 取一个主题；找不到就退回第一个内置 */
export function findTheme(id) {
  const all = allThemes()
  return all.find((t) => t.id === id) || all[0]
}

/** 主题 id 白名单（给 Host 的 normalize 用） */
export function themeIds() {
  return allThemes().map((t) => t.id)
}
