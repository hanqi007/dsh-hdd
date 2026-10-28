/* ============================================================================
 * 启动动画工坊 — 配置器逻辑
 * ----------------------------------------------------------------------------
 * 数据来自 build.mjs 注入的 window.STUDIO：
 *   defaults    默认配置（含六幕与日志）
 *   cssB64      动画样式（base64，避免 </style> 提前闭合）
 *   runtimeB64  动画运行时（base64，避免 </script> 提前闭合）
 *
 * 改任何一栏 → 防抖 600ms → 重建右侧 iframe（srcdoc，不依赖网络）
 * 导出 → 生成一份自带配置的单文件 HTML，双击就能播
 * ========================================================================== */
;(function () {
  'use strict'

  var S = window.STUDIO
  if (!S) return

  var clone = function (o) { return JSON.parse(JSON.stringify(o)) }
  var state = clone(S.defaults)
  var timer = 0
  var autoPreview = true

  /* ── 解码内联资源 ─────────────────────────────────────────────────────── */
  function b64utf8(b64) {
    var bin = atob(b64)
    var bytes = new Uint8Array(bin.length)
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
    return new TextDecoder('utf-8').decode(bytes)
  }
  var CSS_TEXT = b64utf8(S.cssB64)
  var RUNTIME_TEXT = b64utf8(S.runtimeB64)

  var $ = function (sel) { return document.querySelector(sel) }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
  }

  /* ── 路径读写：data-path="steps.0.zh" ─────────────────────────────────── */
  function setPath(obj, path, value) {
    var parts = path.split('.')
    var cur = obj
    for (var i = 0; i < parts.length - 1; i++) {
      var key = parts[i]
      if (cur[key] == null) cur[key] = /^\d+$/.test(parts[i + 1]) ? [] : {}
      cur = cur[key]
    }
    cur[parts[parts.length - 1]] = value
  }
  function getPath(obj, path) {
    var parts = path.split('.')
    var cur = obj
    for (var i = 0; i < parts.length; i++) {
      if (cur == null) return undefined
      cur = cur[parts[i]]
    }
    return cur
  }

  /* ── 表单渲染 ─────────────────────────────────────────────────────────── */
  function field(label, path, opts) {
    opts = opts || {}
    var value = getPath(state, path)
    var input
    if (opts.options) {
      input = '<select data-path="' + path + '">' + opts.options.map(function (o) {
        return '<option value="' + esc(o[0]) + '"' + (String(value) === String(o[0]) ? ' selected' : '') + '>' + esc(o[1]) + '</option>'
      }).join('') + '</select>'
    } else if (opts.textarea) {
      input = '<textarea data-path="' + path + '" rows="2">' + esc(value) + '</textarea>'
    } else if (opts.range) {
      input = '<input type="range" data-path="' + path + '" min="' + opts.min + '" max="' + opts.max +
        '" step="' + (opts.step || 0.05) + '" value="' + esc(value) + '">'
    } else if (opts.check) {
      return '<label class="check"><input type="checkbox" data-path="' + path + '"' +
        (value ? ' checked' : '') + '><span>' + esc(label) + '</span></label>'
    } else {
      input = '<input type="' + (opts.number ? 'number' : 'text') + '" data-path="' + path + '"' +
        ' value="' + esc(value) + '"' + (opts.max ? ' maxlength="' + opts.max + '"' : '') + '>'
    }
    return '<div class="field"><label>' + esc(label) + '</label>' + input +
      (opts.hint ? '<div class="hint">' + esc(opts.hint) + '</div>' : '') + '</div>'
  }

  function group(title, open, bodyHtml, badge) {
    return '<details class="group"' + (open ? ' open' : '') + '><summary>' + esc(title) +
      (badge ? '<b>' + esc(badge) + '</b>' : '') + '</summary><div class="body">' + bodyHtml + '</div></details>'
  }

  function renderIdentity() {
    return group('身份与标牌', true,
      field('操作员（左上角）', 'identity', { max: 24 }) +
      '<div class="row2">' +
        field('站点', 'station', { max: 24 }) +
        field('版本号', 'build', { max: 16 }) +
      '</div>' +
      '<div class="row2">' +
        field('设备代号', 'title', { max: 6, hint: '左上角大字，2–4 字最好看' }) +
        field('副标题', 'subtitle', { max: 40 }) +
      '</div>' +
      field('页脚', 'footer', { max: 64 })
    )
  }

  function renderSteps() {
    var html = ''
    state.steps.forEach(function (step, i) {
      html += '<div class="act">' +
        '<div class="act-head"><b>第 ' + (i + 1) + ' 幕</b>' +
          '<span class="tag">' + esc(step.tag) + '</span></div>' +
        '<div class="row2">' +
          '<div class="field"><label>中文主字</label><input type="text" data-path="steps.' + i + '.zh" value="' + esc(step.zh) + '" maxlength="10"></div>' +
          '<div class="field"><label>英文副行</label><input type="text" data-path="steps.' + i + '.en" value="' + esc(step.en) + '" maxlength="40"></div>' +
        '</div>' +
        '<div class="field"><label>副标题（画面下方一行小字）</label><input type="text" data-path="steps.' + i + '.sub" value="' + esc(step.sub) + '" maxlength="44"></div>' +
        '<div class="row2">' +
          '<div class="field"><label>进度 %</label><input type="number" data-path="steps.' + i + '.pct" value="' + esc(step.pct) + '" min="0" max="100"></div>' +
          '<div class="field"><label>停留 ms</label><input type="number" data-path="steps.' + i + '.hold" value="' + esc(step.hold) + '" min="200" max="4000" step="50"></div>' +
        '</div>' +
        '<div class="field"><label>日志标签</label><input type="text" data-path="steps.' + i + '.tag" value="' + esc(step.tag) + '" maxlength="8"></div>' +
        (i === 3 ? '<div class="hint">这一幕固定是「等放行」的一拍：会显示警示条与按钮，gate 不可关闭（可在右侧行为里关掉整个放行）。</div>' : '') +
      '</div>'
    })
    return group('六幕脚本', true, html, '6 幕')
  }

  function renderLogs() {
    var html = ''
    state.logs.forEach(function (lines, gi) {
      var rows = ''
      lines.forEach(function (line, li) {
        rows += '<div class="log-line">' +
          '<input type="text" data-path="logs.' + gi + '.' + li + '.0" value="' + esc(line[0]) + '" maxlength="8">' +
          '<input type="text" data-path="logs.' + gi + '.' + li + '.1" value="' + esc(line[1]) + '" maxlength="64">' +
          '<select data-path="logs.' + gi + '.' + li + '.2">' +
            '<option value=""' + (!line[2] ? ' selected' : '') + '>普通</option>' +
            '<option value="ok"' + (line[2] === 'ok' ? ' selected' : '') + '>成功</option>' +
            '<option value="warn"' + (line[2] === 'warn' ? ' selected' : '') + '>警告</option>' +
            '<option value="bad"' + (line[2] === 'bad' ? ' selected' : '') + '>失败</option>' +
          '</select>' +
          '<button type="button" data-remove="logs.' + gi + '.' + li + '" title="删掉这一行">×</button>' +
        '</div>'
      })
      html += '<div class="log-group">' +
        '<div class="lg-title">第 ' + (gi + 1) + ' 幕日志 <em>' + lines.length + ' 行</em></div>' +
        rows +
        '<button type="button" class="add-line" data-add="' + gi + '">+ 加一行</button>' +
      '</div>'
    })
    return group('启动日志', false, html, '6 组')
  }

  function renderColors() {
    var c = state.colors || {}
    var swatches = [
      ['默认·琥珀', '#f2a23c'], ['青绿', '#58d6b0'], ['冰蓝', '#62b8ff'],
      ['品红', '#ff3ea5'], ['旧金', '#d9b26a'], ['纸白', '#e9e2d2']
    ]
    return group('配色', true,
      '<div class="field"><label>纸色（主文字 / 标牌）</label>' +
        '<div class="color-row"><input type="text" class="mono" data-path="colors.paper" value="' + esc(c.paper || '#e9e2d2') + '" maxlength="7">' +
        '<input type="color" data-path="colors.paper" value="' + esc(c.paper || '#e9e2d2') + '"></div></div>' +
      '<div class="field"><label>强调色（进度 / 警示 / 光标）</label>' +
        '<div class="color-row"><input type="text" class="mono" data-path="colors.amber" value="' + esc(c.amber || '#f2a23c') + '" maxlength="7">' +
        '<input type="color" data-path="colors.amber" value="' + esc(c.amber || '#f2a23c') + '"></div>' +
        '<div class="swatches" style="margin-top:6px">' + swatches.map(function (s) {
          return '<button type="button" class="swatch" data-pick="amber" data-color="' + s[1] + '" style="background:' + s[1] + '" title="' + esc(s[0]) + '"></button>'
        }).join('') + '</div></div>' +
      '<div class="row2">' +
        '<div class="field"><label>链路色</label><div class="color-row" style="grid-template-columns:1fr 40px">' +
          '<input type="text" class="mono" data-path="colors.jade" value="' + esc(c.jade || '#58d6b0') + '" maxlength="7">' +
          '<input type="color" data-path="colors.jade" value="' + esc(c.jade || '#58d6b0') + '"></div></div>' +
        '<div class="field"><label>告警色</label><div class="color-row" style="grid-template-columns:1fr 40px">' +
          '<input type="text" class="mono" data-path="colors.alarm" value="' + esc(c.alarm || '#e4483c') + '" maxlength="7">' +
          '<input type="color" data-path="colors.alarm" value="' + esc(c.alarm || '#e4483c') + '"></div></div>' +
      '</div>' +
      '<div class="hint">颜色只接受 6 位十六进制（如 #f2a23c），非法值会被忽略、回退默认。</div>'
    )
  }

  function renderBehavior() {
    return group('声音与行为', true,
      field('速度倍率', 'speed', { range: true, min: 0.35, max: 3, step: 0.05 }) +
      field('音量', 'volume', { range: true, min: 0, max: 1, step: 0.05 }) +
      '<label class="check"><input type="checkbox" data-path="sound"' + (state.sound ? ' checked' : '') + '><span>开机音效</span></label>' +
      '<label class="check"><input type="checkbox" data-path="requireGate"' + (state.requireGate ? ' checked' : '') + '><span>第四幕要求人工放行</span></label>' +
      '<label class="check"><input type="checkbox" data-path="allowSkip"' + (state.allowSkip ? ' checked' : '') + '><span>允许跳过（SKIP / Esc）</span></label>'
    )
  }

  function renderPanel() {
    var html = renderIdentity() + renderSteps() + renderLogs() + renderColors() + renderBehavior()
    html += group('关于', false,
      '<div class="hint">这个页面把动画的每一幕、每一行日志、每一个颜色都交给你改。改完点右上角' +
      '「导出单文件」，会下载一个自带你的配置的 HTML——双击就能播，发给别人也能用，不需要装任何东西。</div>' +
      '<div class="hint">导出的文件里保留了「再播一次」按钮；不想要可以删掉文件末尾那段。</div>'
    )
    $('#panel').innerHTML = html
  }

  /* ── 生成单文件 ───────────────────────────────────────────────────────── */
  function exportConfig() {
    var cfg = clone(state)
    cfg.enabled = true
    cfg.mode = 'always'      // 独立页面没有会话概念，直接用 always
    return cfg
  }

  function pageHtml(preview) {
    var cfg = exportConfig()
    var json = JSON.stringify(cfg).replace(/</g, '\\u003c')
    var replayBar = preview ? '' : [
      '<div id="replayBar"><button type="button" onclick="location.reload()">↻ 再播一次</button></div>',
      '<style>',
      '#replayBar{position:fixed;right:14px;bottom:14px;z-index:2147483600;opacity:0;transform:translateY(6px);',
      'transition:opacity 360ms ease,transform 360ms ease;pointer-events:none}',
      '#replayBar.show{opacity:1;transform:none;pointer-events:auto}',
      '#replayBar button{font:12px "Microsoft YaHei",system-ui,sans-serif;color:#e9e2d2;',
      'background:rgba(12,14,16,.9);border:1px solid rgba(233,226,210,.2);border-radius:8px;',
      'padding:5px 10px;cursor:pointer;backdrop-filter:blur(6px)}',
      '#replayBar button:hover{border-color:#f2a23c}',
      '</style>',
      '<script>window.addEventListener("hdd-boot:done",function(){var b=document.getElementById("replayBar");if(b)b.className="show"})<' + '/script>'
    ].join('')

    return [
      '<!doctype html>',
      '<html lang="zh-CN">',
      '<head>',
      '<meta charset="utf-8">',
      '<meta name="viewport" content="width=device-width, initial-scale=1">',
      '<title>' + esc(cfg.title || 'BOOT') + ' · 启动动画</title>',
      '<style>' + CSS_TEXT + '</style>',
      '<style>#hdd-root.hdd-boot{position:fixed;inset:0;z-index:2147483000;background:#060708}',
      'html.hdd-lock,html.hdd-lock body{overflow:hidden!important}</style>',
      '</head>',
      '<body>',
      '<div id="hdd-root" class="hdd-root hdd-boot"></div>',
      '<script>window.__HDD_CONFIG__=' + json + ';window.__HDD_SCRIPT_URL__="' +
        (preview ? 'about:blank#noop' : '#reload') + '";</' + 'script>',
      '<script>' + RUNTIME_TEXT + '</' + 'script>',
      replayBar,
      '</body>',
      '</html>'
    ].join('\n')
  }

  var previewUrl = null

  function refreshPreview() {
    var frame = $('#frame')
    if (!frame) return
    var html = pageHtml(true)
    /* srcdoc 不依赖网络/同源，file:// 下也能跑 */
    frame.srcdoc = html
    var now = new Date()
    var meta = $('#previewMeta')
    if (meta) {
      meta.textContent = '预览已刷新 · ' + now.toLocaleTimeString('zh-CN', { hour12: false }) +
        ' · 单文件 ' + (Buffer2(html).toFixed(1)) + ' KB'
    }
  }

  function Buffer2(s) {
    var n = 0
    for (var i = 0; i < s.length; i++) {
      var c = s.charCodeAt(i)
      if (c < 0x80) n += 1
      else if (c < 0x800) n += 2
      else if (c >= 0xd800 && c <= 0xdbff) { n += 4; i++ }
      else n += 3
    }
    return n / 1024
  }

  function schedulePreview() {
    if (!autoPreview) return
    if (timer) clearTimeout(timer)
    timer = setTimeout(function () { timer = 0; refreshPreview() }, 600)
  }

  /* ── 导出 / 导入 ─────────────────────────────────────────────────────── */
  function download(name, text, mime) {
    var blob = new Blob([text], { type: mime || 'text/html;charset=utf-8' })
    var url = URL.createObjectURL(blob)
    var a = document.createElement('a')
    a.href = url
    a.download = name
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    setTimeout(function () { URL.revokeObjectURL(url) }, 4000)
  }

  function exportHtml() {
    download('my-boot-animation.html', pageHtml(false))
    $('#status').textContent = '已导出 my-boot-animation.html'
  }

  function exportJson() {
    download('boot-config.json', JSON.stringify(exportConfig(), null, 2), 'application/json')
    $('#status').textContent = '已导出 boot-config.json'
  }

  function importJson(text) {
    var data
    try { data = JSON.parse(text) } catch (e) {
      $('#status').textContent = '导入失败：不是合法 JSON'
      return
    }
    if (!data || typeof data !== 'object') {
      $('#status').textContent = '导入失败：内容不是配置对象'
      return
    }
    /* 与默认值深合并，缺字段不至于把面板打空 */
    var next = clone(S.defaults)
    Object.keys(data).forEach(function (k) {
      if (k === 'colors' && data.colors && typeof data.colors === 'object') {
        next.colors = Object.assign({}, next.colors, data.colors)
      } else if (k === 'steps' && Array.isArray(data.steps)) {
        next.steps = next.steps.map(function (s, i) {
          return Object.assign({}, s, data.steps[i] || {})
        })
      } else if (k === 'logs' && Array.isArray(data.logs)) {
        next.logs = next.logs.map(function (g, i) {
          return Array.isArray(data.logs[i]) && data.logs[i].length ? data.logs[i] : g
        })
      } else {
        next[k] = data[k]
      }
    })
    state = next
    renderPanel()
    refreshPreview()
    $('#status').textContent = '已导入配置'
  }

  /* ── 预设 ─────────────────────────────────────────────────────────────── */
  var PRESETS = {
    default: function () { return clone(S.defaults) },
    jade: function () {
      var s = clone(S.defaults)
      s.colors = { paper: '#e6f4ee', amber: '#58d6b0', jade: '#7fe3c4', alarm: '#e4a03c' }
      return s
    },
    ice: function () {
      var s = clone(S.defaults)
      s.colors = { paper: '#e8f2ff', amber: '#62b8ff', jade: '#8fd0ff', alarm: '#ff6b6b' }
      s.speed = 1.15
      return s
    },
    magenta: function () {
      var s = clone(S.defaults)
      s.colors = { paper: '#ffe8f6', amber: '#ff3ea5', jade: '#7ef0d0', alarm: '#ff3b30' }
      return s
    },
    minimal: function () {
      var s = clone(S.defaults)
      s.sound = false
      s.speed = 1.35
      s.steps = s.steps.map(function (step, i) {
        var copy = Object.assign({}, step)
        copy.sub = ''
        copy.hold = Math.max(300, Math.round(step.hold * 0.6))
        return copy
      })
      return s
    },
    cinematic: function () {
      var s = clone(S.defaults)
      s.speed = 0.7
      s.colors = { paper: '#f0e6d2', amber: '#e8a33d', jade: '#7fbf9e', alarm: '#c0392b' }
      s.steps = s.steps.map(function (step) {
        var copy = Object.assign({}, step)
        copy.hold = Math.round(step.hold * 1.3)
        return copy
      })
      return s
    }
  }

  function applyPreset(name) {
    var build = PRESETS[name]
    if (!build) return
    state = build()
    renderPanel()
    refreshPreview()
    $('#status').textContent = '已套用预设：' + name
  }

  /* ── 事件 ─────────────────────────────────────────────────────────────── */
  function bind() {
    var panel = $('#panel')

    panel.addEventListener('input', function (e) {
      var el = e.target
      var path = el.getAttribute('data-path')
      if (!path) return
      var value
      if (el.type === 'checkbox') value = el.checked
      else if (el.type === 'number' || el.type === 'range') value = Number(el.value)
      else value = el.value
      setPath(state, path, value)
      /* 即时反馈：颜色框/滑块旁边没有数值显示，这里只做预览调度 */
      schedulePreview()
    })

    panel.addEventListener('change', function (e) {
      var el = e.target
      var path = el.getAttribute('data-path')
      if (!path) return
      if (el.type === 'checkbox' || el.tagName === 'SELECT') {
        var value = el.type === 'checkbox' ? el.checked : el.value
        setPath(state, path, value)
        schedulePreview()
      }
    })

    panel.addEventListener('click', function (e) {
      var pick = e.target.closest('[data-pick]')
      if (pick) {
        setPath(state, 'colors.' + pick.getAttribute('data-pick'), pick.getAttribute('data-color'))
        renderPanel()
        schedulePreview()
        return
      }
      var add = e.target.closest('[data-add]')
      if (add) {
        var gi = Number(add.getAttribute('data-add'))
        if (state.logs[gi].length < 6) {
          state.logs[gi].push(['LOG', '', ''])
          renderPanel()
          schedulePreview()
        }
        return
      }
      var rm = e.target.closest('[data-remove]')
      if (rm) {
        var parts = rm.getAttribute('data-remove').split('.')
        var group = Number(parts[1])
        var line = Number(parts[2])
        if (state.logs[group].length > 1) {
          state.logs[group].splice(line, 1)
          renderPanel()
          schedulePreview()
        }
      }
    })

    $('#btnImport').addEventListener('click', function () { $('#fileImport').click() })
    $('#btnExportHtml').addEventListener('click', exportHtml)
    $('#btnExportJson').addEventListener('click', exportJson)
    $('#btnReplay').addEventListener('click', refreshPreview)

    $('#fileImport').addEventListener('change', function (e) {
      var file = e.target.files && e.target.files[0]
      if (!file) return
      var reader = new FileReader()
      reader.onload = function () { importJson(String(reader.result || '')) }
      reader.readAsText(file, 'utf-8')
      e.target.value = ''
    })

    $('#preset').addEventListener('change', function (e) {
      if (e.target.value) applyPreset(e.target.value)
      e.target.value = ''
    })

    $('#autoPreview').addEventListener('change', function (e) {
      autoPreview = e.target.checked
      if (autoPreview) refreshPreview()
    })
  }

  /* ── 启动 ─────────────────────────────────────────────────────────────── */
  bind()
  renderPanel()
  refreshPreview()

  /* 给控制台/自动化留的把手：能读当前配置、能拿到导出的完整 HTML */
  window.STUDIO_DEBUG = {
    get state() { return state },
    pageHtml: pageHtml,
    refresh: refreshPreview
  }
})()
