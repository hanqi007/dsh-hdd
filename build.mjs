/* ============================================================================
 * HDD 控制台开机动画 — 构建脚本（零依赖，Node >= 20）
 * ----------------------------------------------------------------------------
 * 一份源码 → 三个产物：
 *   preview/index.html   调试用：相对路径引入 src/，改源码刷新即见
 *   demo.html            单文件：CSS/JS 全内联，双击就能看（发给别人也不用装环境）
 *   lib/splash.css + lib/splash.js   插件用：Host 路由下发的最终产物
 *
 * 用法：node build.mjs
 * ========================================================================== */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const SRC = path.join(HERE, 'src')
const LIB = path.join(HERE, 'lib')
const PREVIEW = path.join(HERE, 'preview')

const read = (p) => fs.readFileSync(path.join(SRC, p), 'utf8').replace(/\r\n/g, '\n')
const css = read('boot.css')
const instrument = read('instrument.js')
const audio = read('audio.js')
const boot = read('boot.js')

/* 内联进 <script>/<style> 时，源码里不能出现提前闭合的标签 */
const safeJs = (s) => s.replace(/<\/script/gi, '<\\/script')
const safeCss = (s) => s.replace(/<\/style/gi, '<\\/style')

/* 运行时三件套：audio → instrument → boot（boot 依赖前两个的全局） */
const runtime = [audio, instrument, boot].map(safeJs).join('\n;\n')

/* 首屏兜底：脚本没跑起来也要先盖住 */
const CRITICAL_CSS = `#hdd-root.hdd-boot{position:fixed;inset:0;z-index:2147483000;background:#060708}`

/* 演示 / 预览共用的假主场，让揭幕那一刻有东西可看 */
const MOCK_APP = `<div id="mockApp">
  <div class="side">
    <div class="brand"><b></b>DEEPSEEK HARNESS</div>
    <div class="item on">新会话</div>
    <div class="item">工作区</div>
    <div class="item">插件</div>
    <div class="item">设置</div>
  </div>
  <div class="main">
    <div class="top">主界面 · 启动动画已结束</div>
    <div class="body">
      <p>控制台已经移交。这一页是假主场，只为让「揭幕」那一秒有东西可看。</p>
      <p>点击右下角<span class="kbd">重播</span>可以再看一遍；也可以打开控制条调速度、音效、强调色。</p>
    </div>
  </div>
</div>`

const BASE_CSS = `html,body{margin:0;height:100%;overflow:hidden;background:#060708}
html.hdd-lock,html.hdd-lock body{overflow:hidden!important}
#mockApp{position:fixed;inset:0;z-index:1;display:flex;background:#f6f5f1;font-family:"Microsoft YaHei","Segoe UI",system-ui,sans-serif}
#mockApp .side{width:246px;background:#efefec;border-right:1px solid #e2e1dc;padding:14px 12px}
#mockApp .brand{display:flex;align-items:center;gap:8px;font-weight:700;color:#2b2b2b;font-size:13px;margin-bottom:8px;letter-spacing:.04em}
#mockApp .brand b{width:18px;height:18px;border-radius:5px;background:#4d6bfe;display:inline-block}
#mockApp .item{font-size:13px;color:#55565a;padding:7px 9px;border-radius:8px}
#mockApp .item.on{background:#fff;color:#1d1d1f;box-shadow:0 1px 2px rgba(0,0,0,.06)}
#mockApp .main{flex:1;display:flex;flex-direction:column}
#mockApp .top{height:46px;border-bottom:1px solid #e6e6e2;display:flex;align-items:center;padding:0 18px;font-size:13px;color:#6a6b6f}
#mockApp .body{flex:1;padding:28px 34px;font-size:13.5px;line-height:1.9;color:#2c2d31}
#mockApp .body p{margin:0 0 10px}
#mockApp .kbd{display:inline-block;padding:1px 6px;border:1px solid #d8d7d2;border-bottom-width:2px;border-radius:4px;font-size:12px;color:#4a4b50;margin:0 3px;background:#fff}
/* 演示控制条 */
#bar{position:fixed;left:50%;bottom:18px;transform:translateX(-50%);z-index:2147483600;display:flex;align-items:center;gap:8px;flex-wrap:wrap;justify-content:center;max-width:calc(100vw - 20px);padding:9px 12px;border-radius:12px;background:rgba(12,14,16,.94);border:1px solid rgba(233,226,210,.16);box-shadow:0 16px 46px rgba(0,0,0,.5);backdrop-filter:blur(8px);font:12.5px/1.2 "Microsoft YaHei","Segoe UI",system-ui,sans-serif;color:#e9e2d2;transition:opacity 220ms ease,transform 220ms ease}
#bar.hide{opacity:0;pointer-events:none;transform:translate(-50%,12px)}
#bar button,#bar select{font:inherit;color:#f0ece2;background:rgba(255,255,255,.06);border:1px solid rgba(233,226,210,.22);border-radius:8px;padding:6px 11px;cursor:pointer}
#bar button:hover{border-color:#f2a23c}
#bar button.primary{background:#f2a23c;border-color:#f2a23c;color:#141414;font-weight:600}
#bar label{display:flex;align-items:center;gap:6px;color:#c9c4b6}
#bar input[type=range]{width:88px;accent-color:#f2a23c}
#bar .sep{width:1px;height:18px;background:rgba(233,226,210,.16)}
#bar .tip{color:#8b877c;font-size:11px}
#showbar{position:fixed;right:14px;bottom:14px;z-index:2147483601}
#showbar button{font:12px "Microsoft YaHei",system-ui,sans-serif;color:#e9e2d2;background:rgba(12,14,16,.9);border:1px solid rgba(233,226,210,.18);border-radius:8px;padding:5px 10px;cursor:pointer}
@media (max-width:760px){#bar{font-size:11px;gap:6px}#bar .tip{display:none}}`

const BAR = `<div id="bar">
  <button class="primary" id="barReplay" type="button">↻ 重播</button>
  <button id="barSkip" type="button">跳过</button>
  <div class="sep"></div>
  <label>速度 <input type="range" id="barSpeed" min="0.35" max="2.5" step="0.05" value="1"><b id="barSpeedV">1.00×</b></label>
  <label>强调色
    <select id="barAccent">
      <option value="amber" selected>琥珀橙</option>
      <option value="jade">青绿</option>
    </select>
  </label>
  <label><input type="checkbox" id="barSound" checked> 音效</label>
  <div class="sep"></div>
  <button id="barHide" type="button">收起</button>
  <span class="tip">颜色即时生效 · 速度影响后续步骤</span>
</div>
<div id="showbar" hidden><button id="barShow" type="button">显示控制条</button></div>`

const BAR_JS = `<script>
;(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var bar = $('bar');

  function cfg() { return window.__HDD_CONFIG__; }
  function api() { return window.HDD_API; }

  function live() {
    var c = cfg();
    var v = Number($('barSpeed').value);
    $('barSpeedV').textContent = v.toFixed(2) + '×';
    c.speed = v;
    c.accent = $('barAccent').value;
    c.sound = $('barSound').checked;
    if (api()) {
      api().set({ speed: v, accent: c.accent, sound: c.sound, volume: 0.6 });
    }
  }

  function syncBar() {
    var c = cfg();
    barSpeed.value = c.speed;
    barSpeedV.textContent = Number(c.speed).toFixed(2) + '×';
    barAccent.value = c.accent === 'jade' ? 'jade' : 'amber';
    barSound.checked = c.sound !== false;
  }

  function replay() {
    var c = cfg();
    c.speed = Number($('barSpeed').value);
    c.accent = $('barAccent').value;
    c.sound = $('barSound').checked;
    if (api() && api().replay) api().replay();
  }

  $('barReplay').addEventListener('click', replay);
  $('barSkip').addEventListener('click', function () { if (api()) api().skip(); });
  $('barSpeed').addEventListener('input', live);
  $('barAccent').addEventListener('change', replay);
  $('barSound').addEventListener('change', live);
  $('barHide').addEventListener('click', function () { bar.classList.add('hide'); $('showbar').hidden = false; });
  $('barShow').addEventListener('click', function () { bar.classList.remove('hide'); $('showbar').hidden = true; });
  bar.addEventListener('keydown', function (e) { e.stopPropagation(); });
  syncBar();
  setTimeout(syncBar, 400);

  window.addEventListener('hdd-boot:done', function () {
    bar.classList.remove('hide');
    $('showbar').hidden = true;
  });
})();
</script>`

function configScript(extra) {
  return `<script>
  window.__HDD_CONFIG__ = {
    enabled: true,
    mode: 'always',
    speed: 1,
    requireGate: ${extra && extra.requireGate === false ? 'false' : 'true'},
    allowSkip: true,
    sound: ${extra && extra.sound === false ? 'false' : 'true'},
    volume: 0.6,
    accent: 'amber',
    identity: 'HANLIN',
    station: 'STATION 07',
    build: '1.0.0',
    bootLine: '启动深空检索终端',
    bootLineEn: 'BOOTING DEEP-SPACE RETRIEVAL TERMINAL',
    title: 'HDD',
    subtitle: 'HARD DISK DRIVE CONTROL',
    footer: 'DEEPSEEK HARNESS · ORIGINAL BOOT SEQUENCE'
  };
  document.documentElement.classList.add('hdd-lock');
</script>`
}

/* ── preview/index.html：相对路径引入 src，方便边改边看 ─────────────────── */
const previewHtml = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>HDD 控制台开机动画 · 源码预览</title>
<style>${safeCss(BASE_CSS)}</style>
<link rel="stylesheet" href="../src/boot.css">
<style>${CRITICAL_CSS}</style>
</head>
<body>
${MOCK_APP}
<div id="hdd-root" class="hdd-root hdd-boot"></div>
${configScript({})}
<script>window.__HDD_SCRIPT_URL__ = '../src/replay.js'</script>
<script src="../src/audio.js"></script>
<script src="../src/instrument.js"></script>
<script src="../src/boot.js"></script>
${BAR}
${BAR_JS}
</body>
</html>
`

/* ── demo.html：单文件，全部内联 ────────────────────────────────────────── */
const demoHtml = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>HDD 控制台开机动画 · 单文件演示</title>
<style>${safeCss(BASE_CSS)}</style>
<style>${safeCss(css)}</style>
<style>${CRITICAL_CSS}</style>
</head>
<body>
${MOCK_APP}
<div id="hdd-root" class="hdd-root hdd-boot"></div>
${configScript({})}
<script>
/* 单文件里没有独立脚本可重挂：replay 直接重载本页，观感一致 */
window.__HDD_SCRIPT_URL__ = '#reload';
</script>
<script>${runtime}</script>
${BAR}
${BAR_JS}
</body>
</html>
`

/* ── studio.html：可视化配置器（下载的人自己改）──────────────────────────
   配置器需要“生成单文件”，所以它自己得先内联一份运行时与样式。
   用 base64 传：源码里任何 </script> / </style> 都不会提前闭合外层文档。 */
const studioCss = read('studio.css')
const studioJs = read('studio.js')

/** 从源码里截一段平衡的数组/对象字面量并求值（只用于 build 时读默认值）。 */
function extractLiteral(source, startPattern) {
  const start = source.search(startPattern)
  if (start < 0) throw new Error('build: 找不到 ' + startPattern)
  const from = source.indexOf('[', start) >= 0 && source.indexOf('[', start) < source.indexOf('{', start)
    ? source.indexOf('[', start)
    : source.indexOf('{', start)
  const open = source[from]
  const close = open === '[' ? ']' : '}'
  let depth = 0
  for (let i = from; i < source.length; i++) {
    const ch = source[i]
    if (ch === open) depth++
    else if (ch === close) {
      depth--
      if (depth === 0) return new Function('return (' + source.slice(from, i + 1) + ')')()
    }
  }
  throw new Error('build: 字面量不闭合 ' + startPattern)
}

const defaultSteps = extractLiteral(boot, /var DEFAULT_STEPS = \[/)
const defaultLogs = extractLiteral(boot, /var DEFAULT_LOGS = \[/)
const defaultCfg = extractLiteral(boot, /var DEFAULTS = \{/)

const studioDefaults = {
  ...defaultCfg,
  enabled: true,
  mode: 'always',
  colors: { paper: '#e9e2d2', amber: '#f2a23c', jade: '#58d6b0', alarm: '#e4483c' },
  steps: defaultSteps,
  logs: defaultLogs
}

const studioHtml = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>启动动画工坊 · 自己改一套</title>
<style>${safeCss(studioCss)}</style>
</head>
<body>
<div id="studio">
  <header class="studio-top">
    <div class="studio-brand"><i></i>启动动画工坊<span>改完导出单文件就能用</span></div>
    <div class="studio-spacer"></div>
    <input type="file" id="fileImport" accept=".json,application/json" hidden>
    <button id="btnImport" type="button">导入 JSON</button>
    <select id="preset" title="套用预设">
      <option value="">套用预设…</option>
      <option value="default">默认 · 琥珀</option>
      <option value="jade">青绿</option>
      <option value="ice">冰蓝</option>
      <option value="magenta">品红</option>
      <option value="minimal">极简 · 少字快放</option>
      <option value="cinematic">电影 · 慢放</option>
    </select>
    <label style="display:flex;align-items:center;gap:6px;font-size:11.5px;color:#8a857a;white-space:nowrap">
      <input type="checkbox" id="autoPreview" checked> 自动预览
    </label>
    <button id="btnReplay" type="button">↻ 重播</button>
    <button id="btnExportJson" type="button">导出 JSON</button>
    <button id="btnExportHtml" class="primary" type="button">导出单文件</button>
  </header>
  <aside class="studio-panel" id="panel"></aside>
  <section class="studio-preview">
    <div class="bar">
      <b>实时预览</b>
      <span id="previewMeta"></span>
      <span class="spacer"></span>
      <span id="status"></span>
    </div>
    <iframe id="frame" title="启动动画预览"></iframe>
    <div class="studio-foot">
      <span>改文案 / 颜色 / 时序 → 600ms 后自动重播预览</span>
      <span>导出的单文件自带这份配置，双击即可播放</span>
    </div>
  </section>
</div>
<script>
window.STUDIO = {
  defaults: ${JSON.stringify(studioDefaults).replace(/</g, '\\u003c')},
  cssB64: ${JSON.stringify(Buffer.from(css, 'utf8').toString('base64'))},
  runtimeB64: ${JSON.stringify(Buffer.from(runtime, 'utf8').toString('base64'))}
};
</script>
<script>${safeJs(studioJs)}</script>
</body>
</html>
`

/* ── 设置面板：把默认六幕/日志注入 client.js ─────────────────────────────
   面板要在没有配置的新装机器上也能渲染出六幕，所以内置一份默认值。
   这里从 boot.js 注入，避免 client.js 再手抄一份（三处漂移）。 */
const clientSrc = read('client.js')
const clientJs = clientSrc
  .split('__HDD_DEFAULT_STEPS__').join(JSON.stringify(defaultSteps, null, 2))
  .split('__HDD_DEFAULT_LOGS__').join(JSON.stringify(defaultLogs, null, 2))

/* ── 插件产物：lib/splash.css + lib/splash.js ───────────────────────────── */
/* splash.js 由三段运行时按序内联；replay 由 Host 路由重新拉本文件 */
const splashJs = `/* HDD 控制台开机动画 — 运行时（由 build.mjs 从 src/ 汇总，请勿手改） */
${runtime}
`

fs.mkdirSync(PREVIEW, { recursive: true })
fs.mkdirSync(LIB, { recursive: true })
fs.writeFileSync(path.join(PREVIEW, 'index.html'), previewHtml, 'utf8')
fs.writeFileSync(path.join(HERE, 'demo.html'), demoHtml, 'utf8')
fs.writeFileSync(path.join(HERE, 'studio.html'), studioHtml, 'utf8')
fs.writeFileSync(path.join(LIB, 'splash.css'), css, 'utf8')
fs.writeFileSync(path.join(LIB, 'client.js'), clientJs, 'utf8')
fs.writeFileSync(path.join(LIB, 'splash.js'), splashJs, 'utf8')

const kb = (s) => (Buffer.byteLength(s) / 1024).toFixed(1) + ' KB'
console.log('preview/index.html ', kb(previewHtml))
console.log('demo.html          ', kb(demoHtml))
console.log('studio.html        ', kb(studioHtml))
console.log('lib/splash.css     ', kb(css))
console.log('lib/splash.js      ', kb(splashJs))
console.log('lib/client.js      ', kb(clientJs))
