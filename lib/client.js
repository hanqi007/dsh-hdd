/**
 * hdd-console-boot — HDD 控制台开机动画
 * Copyright 2026 hanlin (hanqi007)
 *
 * Licensed under the Apache License, Version 2.0, with additional terms:
 *   - Apache 2.0 full text .... LICENSE
 *   - Additional restrictions . LICENSE-CUSTOM.md
 *
 * 允许免费使用与分发；不得以本软件为收费主体，
 * 也不得在自身不是收费主体的前提下进行收费分发。
 * Free to use and distribute, but you may not charge for the software
 * itself, nor charge for distributing it.
 */
/* ============================================================================
 * hdd-console-boot — 浏览器半侧（设置页「开机动画」）
 * ----------------------------------------------------------------------------
 * 以 dsh.client bundle 格式加载（手写 ModuleLoader bundle，无需构建）。
 * 在 DSH 设置里注册一个 settings.section：播放、身份、六幕、日志、配色、声音
 * 全部能改，不用再单独打开 studio.html。
 *
 * 配置走 Host 半侧自带的 HTTP API（GET/POST /hdd-console/config）。
 * 「立即预览」会先拉一次最新配置写进 window.__HDD_CONFIG__，再让运行时重播，
 * 所以保存后不必刷新页面。
 *
 * 本文件由 build.mjs 在 DEFAULT_STEPS / DEFAULT_LOGS 两处注入默认六幕与日志，
 * 真相源是 src/boot.js，避免三处各维护一份。
 * ========================================================================== */
window.__ModuleLoader__.load({
  id: 'hdd-console-boot',
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports
    Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' })

    var react = require('react')
    var h = react.createElement

    var API = '/hdd-console/config'

    /* ── 样式（全部挂 __hb_ 前缀，避免和别的插件撞名）─────────────────── */
    var CSS = [
      '.__hb_root{max-width:680px;display:flex;flex-direction:column;gap:14px;font-size:13px;color:var(--dsw-alias-label-primary)}',
      '.__hb_version{font-family:ui-monospace,Consolas,monospace;font-size:12px;letter-spacing:.04em;color:var(--dsw-alias-label-tertiary)}',
      '.__hb_group{border:1px solid var(--dsw-alias-border-l2);border-radius:10px;padding:12px 14px;display:flex;flex-direction:column;gap:11px}',
      '.__hb_groupTitle{font-size:11px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:var(--dsw-alias-label-tertiary)}',
      '.__hb_field{display:flex;flex-direction:column;gap:5px}',
      '.__hb_label{font-size:12px;font-weight:600;color:var(--dsw-alias-label-primary)}',
      '.__hb_hint{font-size:11px;line-height:1.55;color:var(--dsw-alias-label-tertiary)}',
      '.__hb_row{display:flex;align-items:center;gap:10px;flex-wrap:wrap}',
      '.__hb_two{display:grid;grid-template-columns:1fr 1fr;gap:10px}',
      '.__hb_input{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-3);font:inherit;color:var(--dsw-alias-label-primary);border-radius:8px;padding:6px 10px;font-size:13px;box-sizing:border-box;width:100%;outline:none}',
      '.__hb_input:focus{border-color:var(--dsw-alias-state-business-primary)}',
      '.__hb_inputMono{font-family:ui-monospace,Consolas,monospace}',
      '.__hb_select{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-3);font:inherit;color:var(--dsw-alias-label-primary);border-radius:8px;padding:6px 10px;font-size:13px;box-sizing:border-box;width:100%;outline:none}',
      '.__hb_check{display:flex;align-items:flex-start;gap:9px;cursor:pointer}',
      '.__hb_check input{margin-top:2px;accent-color:var(--dsw-alias-state-business-primary)}',
      '.__hb_checkText{display:flex;flex-direction:column;gap:2px;font-size:12.5px}',
      '.__hb_status{font-family:ui-monospace,Consolas,monospace;font-size:12px;color:var(--dsw-alias-label-tertiary);white-space:nowrap}',
      '.__hb_swatch{width:38px;height:28px;border:1px solid var(--dsw-alias-border-l2);border-radius:6px;background:transparent;padding:0;cursor:pointer}',
      '.__hb_btn{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-3);color:var(--dsw-alias-label-primary);border-radius:8px;padding:7px 14px;font:inherit;font-size:12.5px;cursor:pointer}',
      '.__hb_btn:hover{border-color:var(--dsw-alias-state-business-primary)}',
      '.__hb_btnPrimary{background:var(--dsw-alias-state-business-primary);border-color:var(--dsw-alias-state-business-primary);color:var(--dsw-alias-label-inverse,#fff);font-weight:600}',
      '.__hb_actions{display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding-top:2px}',
      '.__hb_notice{font-size:12px;color:var(--dsw-alias-label-tertiary)}',
      '.__hb_preview{display:flex;align-items:center;justify-content:space-between;gap:12px;border:1px dashed var(--dsw-alias-border-l2);border-radius:10px;padding:10px 12px}',
      '.__hb_previewText{font-size:11.5px;line-height:1.6;color:var(--dsw-alias-label-tertiary)}',
      '.__hb_lead{font-size:12px;line-height:1.7;color:var(--dsw-alias-label-tertiary)}',
      '.__hb_user{display:flex;align-items:baseline;gap:6px;font-size:12px;color:var(--dsw-alias-label-tertiary)}',
      '.__hb_user b{color:var(--dsw-alias-label-primary);font-weight:600;letter-spacing:.02em}',
      '.__hb_user span{color:var(--dsw-alias-label-tertiary)}',
      '.__hb_act{border:1px solid var(--dsw-alias-border-l2);border-radius:10px;padding:10px 12px;display:flex;flex-direction:column;gap:9px}',
      '.__hb_actHead{display:flex;align-items:center;gap:8px;font-size:12px;font-weight:600;color:var(--dsw-alias-label-secondary)}',
      '.__hb_actTag{margin-left:auto;font-family:ui-monospace,Consolas,monospace;font-size:10.5px;color:var(--dsw-alias-label-tertiary);border:1px solid var(--dsw-alias-border-l2);border-radius:4px;padding:1px 5px;font-weight:400}',
      '.__hb_logGroup{border:1px solid var(--dsw-alias-border-l2);border-radius:10px;overflow:hidden;background:transparent}',
      '.__hb_logHead{display:flex;align-items:center;gap:8px;font-size:12px;font-weight:600;color:var(--dsw-alias-label-secondary);padding:9px 12px;cursor:pointer;list-style:none}',
      '.__hb_logHead::-webkit-details-marker{display:none}',
      '.__hb_logHead::before{content:"▸";color:var(--dsw-alias-label-tertiary);font-size:10px;transition:transform 150ms ease}',
      '.__hb_logGroup[open] .__hb_logHead::before{transform:rotate(90deg)}',
      '.__hb_logGroup[open] .__hb_logHead{border-bottom:1px solid var(--dsw-alias-border-l2)}',
      '.__hb_logHead .__hb_status{margin-left:auto}',
      '.__hb_logBody{padding:10px 12px;display:flex;flex-direction:column;gap:7px}',
      '.__hb_logLine{display:grid;grid-template-columns:58px 1fr 80px 26px;gap:6px;align-items:center}',
      '.__hb_logLine .__hb_input,.__hb_logLine .__hb_select{padding:4px 7px;font-size:12px}',
      '.__hb_mini{padding:2px 8px;font-size:11px;line-height:1.4}',
      '.__hb_colorRow{display:grid;grid-template-columns:1fr 44px;gap:8px;align-items:center}',
      '.__hb_presets{display:flex;gap:6px;flex-wrap:wrap}',
      '.__hb_swatches{display:flex;gap:8px;flex-wrap:wrap}',
      '.__hb_swatchBtn{width:34px;height:26px;border-radius:6px;border:2px solid transparent;cursor:pointer;padding:0}',
      '.__hb_swatchBtn.on{border-color:var(--dsw-alias-label-primary)}',
      '@media (max-width:560px){.__hb_two{grid-template-columns:1fr}.__hb_logLine{grid-template-columns:50px 1fr 70px 24px}}'
    ].join('\n')

    /* ── 默认值 ──────────────────────────────────────────────────────────── */
    /* 旧 Host 没有这些字段时，面板也要能正常显示，不出现 undefined */
    var FALLBACK = {
      enabled: true, mode: 'session', speed: 1, requireGate: true, allowSkip: true,
      sound: true, volume: 0.6, accent: 'amber', autoUpdate: false,
      identity: 'HANLIN', station: 'STATION 07', build: '1.0.0',
      title: 'HDD', subtitle: 'HARD DISK DRIVE CONTROL',
      bootLine: '启动深空检索终端',
      bootLineEn: 'BOOTING DEEP-SPACE RETRIEVAL TERMINAL',
      footer: 'DEEPSEEK HARNESS · ORIGINAL BOOT SEQUENCE'
    }
    var FALLBACK_VERSION = '1.4.1'

    /* 由 build.mjs 从 src/boot.js 注入，三处共用一份真相源 */
    var DEFAULT_STEPS = [
  {
    "zh": "电源接入",
    "en": "POWER ON SELF TEST",
    "sub": "机箱电压稳定 · 显像管预热",
    "pct": 8,
    "hold": 1150,
    "tag": "POST"
  },
  {
    "zh": "阵列自检",
    "en": "DRIVE ARRAY CHECK",
    "sub": "四组盘位逐个应答",
    "pct": 24,
    "hold": 1300,
    "tag": "ARRAY"
  },
  {
    "zh": "磁道寻道",
    "en": "TRACK SEEK PROBE",
    "sub": "磁头往复寻道，等待最低延迟",
    "pct": 42,
    "hold": 1300,
    "tag": "SEEK"
  },
  {
    "zh": "扇区校验",
    "en": "SECTOR VERIFY",
    "sub": "读到不可信扇区，需要人工放行",
    "pct": 58,
    "hold": 900,
    "tag": "SCAN",
    "gate": true,
    "alert": true
  },
  {
    "zh": "权限核验",
    "en": "OPERATOR CLEARANCE",
    "sub": "比对操作员凭据与等级",
    "pct": 78,
    "hold": 1250,
    "tag": "AUTH"
  },
  {
    "zh": "数据贯通",
    "en": "DATA LINK ESTABLISHED",
    "sub": "全通道灌入，索引重建完成",
    "pct": 100,
    "hold": 1150,
    "tag": "LINK"
  }
]
    var DEFAULT_LOGS = [
  [
    [
      "POST",
      "机箱电源接入 · 12.0V / 5.02V 稳定"
    ],
    [
      "POST",
      "显像管预热 1200ms · 偏压正常"
    ],
    [
      "BIOS",
      "固件签名 4C1E…9A02 校验通过",
      "ok"
    ],
    [
      "BIOS",
      "内存 32768 KiB · 全量寻址通过",
      "ok"
    ]
  ],
  [
    [
      "ARRAY",
      "盘位 01 应答 · 主轴 7200 RPM"
    ],
    [
      "ARRAY",
      "盘位 02 应答 · 主轴 7200 RPM"
    ],
    [
      "ARRAY",
      "盘位 03 应答 · 主轴 7200 RPM"
    ],
    [
      "ARRAY",
      "盘位 04 应答 · 主轴 7200 RPM",
      "ok"
    ],
    [
      "ARRAY",
      "四组盘位就绪 · 冗余模式 MIRROR"
    ]
  ],
  [
    [
      "SEEK",
      "磁头归零 · 柱面 0000 道 00"
    ],
    [
      "SEEK",
      "往复寻道 ×64 · 平均 8.2ms"
    ],
    [
      "SEEK",
      "伺服校准 · 偏移 +0.03 刻"
    ],
    [
      "SEEK",
      "预读缓存 512 KiB 已装填",
      "ok"
    ]
  ],
  [
    [
      "SCAN",
      "顺序扫描 · 起始 LBA 0x00A4F2"
    ],
    [
      "SCAN",
      "扇区 0x00A7C1 校验和不符",
      "warn"
    ],
    [
      "SCAN",
      "重试 3 次 · 仍不可信",
      "bad"
    ],
    [
      "SCAN",
      "挂起写入，等待人工放行",
      "warn"
    ]
  ],
  [
    [
      "AUTH",
      "读取操作员凭据 · 指纹域"
    ],
    [
      "AUTH",
      "比对等级 3 · 允许访问索引"
    ],
    [
      "AUTH",
      "签发临时会话令牌 · 有效 900s",
      "ok"
    ]
  ],
  [
    [
      "LINK",
      "建立 8 条并行通道"
    ],
    [
      "LINK",
      "灌入索引 1 284 条 · 去重完成"
    ],
    [
      "LINK",
      "控制器响应 0.7ms · 链路稳定",
      "ok"
    ],
    [
      "LINK",
      "控制台移交 · 准备进入主界面",
      "ok"
    ]
  ]
]
    var DEFAULT_COLORS = { paper: '#e9e2d2', amber: '#f2a23c', jade: '#58d6b0', alarm: '#e4483c' }

    var TONES = [['', '普通'], ['ok', '成功'], ['warn', '警告'], ['bad', '失败']]

    function clone(o) { return JSON.parse(JSON.stringify(o)) }

    /* 把任意配置补成完整形状：缺 steps/logs/colors 就用默认值 */
    function withDefaults(cfg) {
      var out = Object.assign({}, FALLBACK, cfg || {})
      out.steps = Array.isArray(out.steps) && out.steps.length === DEFAULT_STEPS.length
        ? out.steps
        : clone(DEFAULT_STEPS)
      out.logs = Array.isArray(out.logs) && out.logs.length === DEFAULT_LOGS.length
        ? out.logs
        : clone(DEFAULT_LOGS)
      out.colors = Object.assign({}, DEFAULT_COLORS, out.colors || {})
      return out
    }

    /* ── 预设：只改配色/速度/音效，六幕文案保持用户自己的 ─────────────────── */
    var PRESETS = {
      default: function () {
        return { colors: clone(DEFAULT_COLORS), speed: 1, sound: true }
      },
      jade: function () {
        return { colors: { paper: '#e6f4ee', amber: '#58d6b0', jade: '#7fe3c4', alarm: '#e4a03c' } }
      },
      ice: function () {
        return { colors: { paper: '#e8f2ff', amber: '#62b8ff', jade: '#8fd0ff', alarm: '#ff6b6b' }, speed: 1.15 }
      },
      magenta: function () {
        return { colors: { paper: '#ffe8f6', amber: '#ff3ea5', jade: '#7ef0d0', alarm: '#ff3b30' } }
      },
      warm: function () {
        return { colors: { paper: '#f0e6d2', amber: '#e8a33d', jade: '#7fbf9e', alarm: '#c0392b' }, speed: 0.7 }
      }
    }

    /* ── 表单原子 ────────────────────────────────────────────────────────── */
    function Field(props) {
      return h('div', { className: '__hb_field' },
        h('label', { className: '__hb_label' }, props.label),
        props.children,
        props.hint ? h('div', { className: '__hb_hint' }, props.hint) : null
      )
    }
    function TextInput(props) {
      return h('input', {
        className: '__hb_input' + (props.mono ? ' __hb_inputMono' : ''),
        type: 'text',
        value: props.value == null ? '' : String(props.value),
        placeholder: props.placeholder || '',
        maxLength: props.maxLength || 64,
        spellCheck: false,
        onChange: (e) => props.onChange(e.target.value)
      })
    }
    function Select(props) {
      return h('select', {
        className: '__hb_select',
        value: props.value,
        onChange: (e) => props.onChange(e.target.value)
      }, props.options.map((o) => h('option', { key: o[0], value: o[0] }, o[1])))
    }
    function Check(props) {
      return h('label', { className: '__hb_check' },
        h('input', { type: 'checkbox', checked: !!props.checked, onChange: (e) => props.onChange(e.target.checked) }),
        h('span', { className: '__hb_checkText' },
          h('span', null, props.label),
          props.hint ? h('span', { className: '__hb_hint' }, props.hint) : null
        )
      )
    }
    function Range(props) {
      return h('div', { className: '__hb_row' },
        h('input', {
          type: 'range', min: props.min, max: props.max, step: props.step || 0.05,
          value: props.value, style: { flex: '1 1 200px' },
          onChange: (e) => props.onChange(Number(e.target.value))
        }),
        h('span', { className: '__hb_status' }, props.display)
      )
    }
    function ColorField(props) {
      return h(Field, { label: props.label },
        h('div', { className: '__hb_colorRow' },
          h('input', {
            className: '__hb_input __hb_inputMono',
            type: 'text',
            value: props.value,
            maxLength: 7,
            onChange: (e) => props.onChange(e.target.value)
          }),
          h('input', {
            className: '__hb_swatch',
            type: 'color',
            value: /^#[0-9a-fA-F]{6}$/.test(props.value) ? props.value : '#000000',
            onChange: (e) => props.onChange(e.target.value)
          })
        )
      )
    }

    /* ── 六幕卡片 ────────────────────────────────────────────────────────── */
    function ActCard(props) {
      var step = props.step
      var i = props.index
      return h('div', { className: '__hb_act' },
        h('div', { className: '__hb_actHead' },
          '第 ' + (i + 1) + ' 幕',
          h('span', { className: '__hb_actTag' }, step.tag || 'LOG')
        ),
        h('div', { className: '__hb_two' },
          h(Field, { label: '中文主字' },
            h(TextInput, { value: step.zh, maxLength: 10, onChange: (v) => props.onChange('zh', v) })),
          h(Field, { label: '英文副行' },
            h(TextInput, { value: step.en, maxLength: 40, onChange: (v) => props.onChange('en', v) }))
        ),
        h(Field, { label: '副标题' },
          h(TextInput, { value: step.sub, maxLength: 44, onChange: (v) => props.onChange('sub', v) })),
        h('div', { className: '__hb_two' },
          h(Field, { label: '进度 %' },
            h('input', {
              className: '__hb_input', type: 'number', min: 0, max: 100, value: step.pct,
              onChange: (e) => props.onChange('pct', Number(e.target.value))
            })),
          h(Field, { label: '停留 ms' },
            h('input', {
              className: '__hb_input', type: 'number', min: 200, max: 4000, step: 50, value: step.hold,
              onChange: (e) => props.onChange('hold', Number(e.target.value))
            }))
        ),
        h(Field, { label: '日志标签' },
          h(TextInput, { value: step.tag, maxLength: 8, mono: true, onChange: (v) => props.onChange('tag', v) })),
        step.gate ? h('div', { className: '__hb_hint' },
          '这一幕固定是「等放行」的一拍：会显示警示条与按钮。想整段自动播，去「基础」里关掉「要求人工放行」。'
        ) : null
      )
    }

    /* ── 日志组 ──────────────────────────────────────────────────────────── */
    /* 用 details 折叠：单页滚动时分组长了会盖住别的设置，收起更接近旧版那种
       一屏能扫完的分组卡片。 */
    function LogGroup(props) {
      var lines = props.lines
      var gi = props.index
      return h('details', { className: '__hb_logGroup' },
        h('summary', { className: '__hb_logHead' },
          '第 ' + (gi + 1) + ' 幕日志',
          h('span', { className: '__hb_status' }, lines.length + ' 行')
        ),
        h('div', { className: '__hb_logBody' },
          lines.map(function (line, li) {
            return h('div', { className: '__hb_logLine', key: 'l' + li },
              h('input', {
                className: '__hb_input __hb_inputMono', type: 'text', maxLength: 8,
                value: line[0], placeholder: 'TAG',
                onChange: (e) => props.onChange(gi, li, 0, e.target.value)
              }),
              h('input', {
                className: '__hb_input', type: 'text', maxLength: 64,
                value: line[1], placeholder: '这一行要说的话',
                onChange: (e) => props.onChange(gi, li, 1, e.target.value)
              }),
              h('select', {
                className: '__hb_select',
                value: line[2] || '',
                onChange: (e) => props.onChange(gi, li, 2, e.target.value || undefined)
              }, TONES.map((t) => h('option', { key: t[0], value: t[0] }, t[1]))),
              h('button', {
                type: 'button',
                className: '__hb_btn __hb_mini',
                title: '删掉这一行',
                disabled: lines.length <= 1,
                onClick: () => props.onRemove(gi, li)
              }, '×')
            )
          }),
          lines.length < 6 ? h('button', {
            type: 'button',
            className: '__hb_btn __hb_mini',
            style: { alignSelf: 'flex-start' },
            onClick: () => props.onAdd(gi)
          }, '+ 加一行') : null
        )
      )
    }

    /* ── 面板 ────────────────────────────────────────────────────────────── */
    function Panel() {
      var [draft, setDraft] = react.useState(null)
      var [defaults, setDefaults] = react.useState(null)
      var [file, setFile] = react.useState('')
      var [version, setVersion] = react.useState('')
      var [error, setError] = react.useState(null)
      var [notice, setNotice] = react.useState(null)
      var [busy, setBusy] = react.useState(false)
      var [user, setUser] = react.useState(null)
      var [update, setUpdate] = react.useState(null)

      function load() {
        setError(null)
        return fetch(API, { headers: { Accept: 'application/json' } })
          .then((r) => r.json())
          .then((j) => {
            if (!j || j.ok !== true) throw new Error((j && j.error) || '读取失败')
            setDraft(withDefaults(j.config))
            setDefaults(withDefaults(j.defaults))
            setFile(j.file || '')
            setUser(j.user || null)
            maybeAutoCheck(j.config && j.config.autoUpdate === true)
            if (j.version) setVersion(String(j.version))
          })
          .catch((e) => setError('读取配置失败：' + String(e && e.message ? e.message : e)))
      }

      react.useEffect(function () { load() }, [])

      function checkUpdates() {
        setUpdate({ checking: true })
        fetch('/hdd-console/update?force=1', { headers: { Accept: 'application/json' } })
          .then(function (r) { return r.json() })
          .then(function (j) { setUpdate(Object.assign({ checking: false }, j || {})) })
          .catch(function (e) {
            setUpdate({ checking: false, ok: false, error: String(e && e.message ? e.message : e) })
          })
      }

      /* 自动检查：默认关；开了也最多 24 小时一次，且只提示不安装 */
      function maybeAutoCheck(enabled) {
        if (enabled !== true) return
        var key = 'hdd-console:update-checked'
        var last = 0
        try { last = Number(localStorage.getItem(key) || 0) } catch (e) { last = 0 }
        if (Date.now() - last < 24 * 3600 * 1000) return
        try { localStorage.setItem(key, String(Date.now())) } catch (e) { /* 隐私模式 */ }
        checkUpdates()
      }

      function updateLine() {
        if (!update) return null
        if (update.checking) return h('span', { className: '__hb_notice' }, '检查中…')
        if (update.ok === false) {
          return h('span', { className: '__hb_notice' }, '检查失败：' + (update.error || '网络不可达'))
        }
        if (update.hasUpdate) {
          return h('span', { className: '__hb_notice' },
            '发现新版本 v' + update.latest + '（当前 v' + update.current + '）· ',
            h('a', {
              href: update.url || 'https://github.com/hanqi007/dsh-hdd',
              target: '_blank',
              rel: 'noreferrer',
              style: { color: 'var(--dsw-alias-state-business-primary)' }
            }, '去 GitHub 下载')
          )
        }
        return h('span', { className: '__hb_notice' }, '已是最新（v' + (update.current || version) + '）')
      }

      function set(key, value) {
        setNotice(null)
        setDraft(function (d) { return Object.assign({}, d, { [key]: value }) })
      }

      function setStep(index, key, value) {
        setNotice(null)
        setDraft(function (d) {
          var steps = d.steps.map(function (s, i) {
            if (i !== index) return s
            var next = Object.assign({}, s)
            next[key] = value
            return next
          })
          return Object.assign({}, d, { steps: steps })
        })
      }

      function setLog(gi, li, ci, value) {
        setNotice(null)
        setDraft(function (d) {
          var logs = d.logs.map(function (group, i) {
            if (i !== gi) return group
            return group.map(function (line, j) {
              if (j !== li) return line
              var next = line.slice()
              next[ci] = value
              return next
            })
          })
          return Object.assign({}, d, { logs: logs })
        })
      }

      function addLog(gi) {
        setDraft(function (d) {
          if (d.logs[gi].length >= 6) return d
          var logs = d.logs.slice()
          logs[gi] = logs[gi].concat([['LOG', '', '']])
          return Object.assign({}, d, { logs: logs })
        })
        setNotice(null)
      }

      function removeLog(gi, li) {
        setDraft(function (d) {
          if (d.logs[gi].length <= 1) return d
          var logs = d.logs.slice()
          logs[gi] = logs[gi].filter(function (_, j) { return j !== li })
          return Object.assign({}, d, { logs: logs })
        })
        setNotice(null)
      }

      function setColor(key, value) {
        setNotice(null)
        setDraft(function (d) {
          return Object.assign({}, d, { colors: Object.assign({}, d.colors, { [key]: value }) })
        })
      }

      function applyPreset(name) {
        var build = PRESETS[name]
        if (!build) return
        setDraft(function (d) { return Object.assign({}, d, build()) })
        setNotice('已套用预设：' + name + '（未保存）')
      }

      function save() {
        if (!draft) return
        setBusy(true)
        setNotice(null)
        fetch(API, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ config: draft })
        })
          .then((r) => r.json())
          .then((j) => {
            if (!j || j.ok !== true) throw new Error((j && j.error) || '保存失败')
            setDraft(withDefaults(j.config))
            setNotice('已保存 · 点「立即预览」即可看效果')
          })
          .catch((e) => setNotice('保存失败：' + String(e && e.message ? e.message : e)))
          .then(function () { setBusy(false) })
      }

      function reset() {
        setBusy(true)
        fetch(API, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ reset: true })
        })
          .then((r) => r.json())
          .then((j) => {
            if (!j || j.ok !== true) throw new Error((j && j.error) || '恢复失败')
            setDraft(withDefaults(j.config))
            setNotice('已恢复默认 · 点「立即预览」即可看效果')
          })
          .catch((e) => setNotice('恢复失败：' + String(e && e.message ? e.message : e)))
          .then(function () { setBusy(false) })
      }

      /* 先拉最新配置塞回页面，再让运行时重播——保存后不用刷新 */
      function preview() {
        setNotice('正在读取最新配置…')
        fetch(API, { headers: { Accept: 'application/json' } })
          .then((r) => r.json())
          .then((j) => {
            if (!j || j.ok !== true) throw new Error((j && j.error) || '读取失败')
            window.__HDD_CONFIG__ = Object.assign({}, window.__HDD_CONFIG__, j.config)
            setNotice('已按保存的配置重播')
            var api = window.HDD_API
            if (api && api.replay) { api.replay(); return }
            window.location.reload()
          })
          .catch((e) => setNotice('预览失败：' + String(e && e.message ? e.message : e)))
      }

      function exportJson() {
        if (!draft) return
        try {
          var blob = new Blob([JSON.stringify(draft, null, 2)], { type: 'application/json' })
          var url = URL.createObjectURL(blob)
          var a = document.createElement('a')
          a.href = url
          a.download = 'hdd-boot-config.json'
          document.body.appendChild(a)
          a.click()
          document.body.removeChild(a)
          setTimeout(function () { URL.revokeObjectURL(url) }, 3000)
          setNotice('已导出 hdd-boot-config.json')
        } catch (e) {
          setNotice('导出失败：' + String(e && e.message ? e.message : e))
        }
      }

      function importJson() {
        var input = document.createElement('input')
        input.type = 'file'
        input.accept = '.json,application/json'
        input.onchange = function () {
          var f = input.files && input.files[0]
          if (!f) return
          var reader = new FileReader()
          reader.onload = function () {
            try {
              var data = JSON.parse(String(reader.result || '{}'))
              if (!data || typeof data !== 'object') throw new Error('内容不是配置对象')
              setDraft(withDefaults(Object.assign({}, draft, data)))
              setNotice('已导入 · 记得保存')
            } catch (e) {
              setNotice('导入失败：' + String(e && e.message ? e.message : e))
            }
          }
          reader.readAsText(f, 'utf-8')
        }
        input.click()
      }

      if (!draft) {
        return h('div', { className: '__hb_root' },
          h('div', { className: '__hb_version' }, '版本 v' + (version || FALLBACK_VERSION)),
        user && user.name ? h('div', { className: '__hb_user' },
          '当前用户',
          h('b', null, user.name),
          user.host ? h('span', null, '· ' + user.host) : null
        ) : null,
          h('div', { className: '__hb_notice' }, error || '读取配置中…'),
          error ? h('div', { className: '__hb_actions' },
            h('button', { className: '__hb_btn', onClick: load }, '重试')
          ) : null
        )
      }

      var modeOptions = [
        ['session', '每个浏览器会话一次'],
        ['daily', '每天一次'],
        ['always', '每次打开都播放']
      ]

      /* ── 基础 ── */
      var basicPane = [
        h('div', { className: '__hb_group', key: 'play' },
          h('div', { className: '__hb_groupTitle' }, '播放'),
          h(Check, {
            label: '启用开机动画',
            hint: '关掉后直接进主界面，不再显示控制台。',
            checked: draft.enabled,
            onChange: (v) => set('enabled', v)
          }),
          h(Field, { label: '播放时机' },
            h(Select, { value: draft.mode, options: modeOptions, onChange: (v) => set('mode', v) })
          ),
          h(Field, { label: '速度倍率', hint: '0.35 慢放 · 1 原速 · 3 快放。默认整段约 16 秒（含一次人工放行）。' },
            h(Range, {
              min: 0.35, max: 3, step: 0.05,
              value: draft.speed,
              display: Number(draft.speed).toFixed(2) + '×',
              onChange: (v) => set('speed', v)
            })
          ),
          h(Check, {
            label: '要求人工放行',
            hint: '第四幕读到不可信扇区时停下来，等你点「放行并继续」/ Enter / 空格。关掉则整段自动播放。',
            checked: draft.requireGate,
            onChange: (v) => set('requireGate', v)
          }),
          h(Check, {
            label: '允许跳过',
            hint: '右上角显示 SKIP，按 Esc 也能直接进主界面。',
            checked: draft.allowSkip,
            onChange: (v) => set('allowSkip', v)
          })
        ),
        h('div', { className: '__hb_group', key: 'id' },
          h('div', { className: '__hb_groupTitle' }, '身份与标牌'),
          h('div', { className: '__hb_two' },
            h(Field, { label: '操作员', hint: '显示在左上角标牌上。' },
              h(TextInput, { value: draft.identity, onChange: (v) => set('identity', v) })),
            h(Field, { label: '站点', hint: '页脚左侧的机位编号。' },
              h(TextInput, { value: draft.station, mono: true, onChange: (v) => set('station', v) }))
          ),
          h('div', { className: '__hb_two' },
            h(Field, { label: '设备代号', hint: '左上角大字，建议 2–4 个字符。' },
              h(TextInput, { value: draft.title, maxLength: 6, onChange: (v) => set('title', v) })),
            h(Field, { label: '版本号', hint: '显示在页脚 STATION 后面。' },
              h(TextInput, { value: draft.build, mono: true, maxLength: 16, onChange: (v) => set('build', v) }))
          ),
          h(Field, { label: '设备副标题' },
            h(TextInput, { value: draft.subtitle, maxLength: 40, onChange: (v) => set('subtitle', v) })),
          h(Field, { label: '页脚' },
            h(TextInput, { value: draft.footer, maxLength: 64, onChange: (v) => set('footer', v) }))
        ),
        h('div', { className: '__hb_group', key: 'sound' },
          h('div', { className: '__hb_groupTitle' }, '声音'),
          h(Check, {
            label: '开机音效',
            hint: '嗡鸣、寻道噪声、告警双音、核验和声钟，全部由 WebAudio 现场合成，不依赖音频素材。',
            checked: draft.sound,
            onChange: (v) => set('sound', v)
          }),
          draft.sound === false ? null : h(Field, { label: '音量' },
            h(Range, {
              min: 0, max: 1, step: 0.05,
              value: draft.volume,
              display: Math.round(Number(draft.volume) * 100) + '%',
              onChange: (v) => set('volume', v)
            })
          )
        )
      ]

      /* ── 六幕 ── */
      var actsPane = [
        h('div', { className: '__hb_group', key: 'acts' },
          h('div', { className: '__hb_groupTitle' }, '六幕脚本'),
          h('div', { className: '__hb_hint' },
            '改的是每一幕的中文主字、英文副行、副标题与节奏。进度决定分段条停在哪，停留决定这一幕演多久。'),
          draft.steps.map(function (step, i) {
            return h(ActCard, { key: 's' + i, step: step, index: i, onChange: (k, v) => setStep(i, k, v) })
          })
        )
      ]

      /* ── 日志 ── */
      var logsPane = [
        h('div', { className: '__hb_group', key: 'logs' },
          h('div', { className: '__hb_groupTitle' }, '启动日志'),
          h('div', { className: '__hb_hint' },
            '每幕左侧那段逐字打出来的日志。标签是行首的短代号，语气决定行尾是否点亮标记（成功 / 警告 / 失败）。'),
          draft.logs.map(function (lines, i) {
            return h(LogGroup, {
              key: 'g' + i,
              index: i,
              lines: lines,
              onChange: setLog,
              onAdd: addLog,
              onRemove: removeLog
            })
          })
        )
      ]

      /* ── 更新 ── */
      var updatePane = h('div', { className: '__hb_group', key: 'update' },
        h('div', { className: '__hb_groupTitle' }, '更新'),
        h(Check, {
          label: '自动检查更新',
          hint: '默认关闭。开启后打开设置页会向 GitHub 查一次版本（24 小时最多一次），只提示「有新版本」，不会自动下载或替换插件。',
          checked: draft.autoUpdate === true,
          onChange: (v) => set('autoUpdate', v)
        }),
        h('div', { className: '__hb_row' },
          h('button', {
            type: 'button',
            className: '__hb_btn',
            disabled: !!(update && update.checking),
            onClick: checkUpdates
          }, update && update.checking ? '检查中…' : '检查更新'),
          updateLine(),
          h('span', { className: '__hb_status' }, '当前 v' + (version || FALLBACK_VERSION))
        ),
        h('div', { className: '__hb_hint' },
          '插件不会在运行时替换自己的文件——检测到新版本后仍然用 dsh plugin add 安装，装完重启生效。')
      )

      /* ── 配色 ── */
      var colorsPane = [
        h('div', { className: '__hb_group', key: 'colors' },
          h('div', { className: '__hb_groupTitle' }, '配色'),
          h('div', { className: '__hb_hint' },
            '只接受 6 位十六进制（如 #f2a23c）；非法值运行时会忽略并回退默认。'),
          h('div', { className: '__hb_presets' },
            h('span', { className: '__hb_hint', style: { alignSelf: 'center' } }, '预设：'),
            Object.keys(PRESETS).map(function (name) {
              var label = { default: '默认琥珀', jade: '青绿', ice: '冰蓝', magenta: '品红', warm: '旧金 · 慢放' }[name] || name
              return h('button', {
                key: name,
                type: 'button',
                className: '__hb_btn __hb_mini',
                onClick: () => applyPreset(name)
              }, label)
            })
          ),
          h(ColorField, {
            label: '纸色 · 主文字 / 标牌',
            value: draft.colors.paper,
            onChange: (v) => setColor('paper', v)
          }),
          h(ColorField, {
            label: '强调色 · 进度 / 警示 / 光标',
            value: draft.colors.amber,
            onChange: (v) => setColor('amber', v)
          }),
          h('div', { className: '__hb_two' },
            h(ColorField, {
              label: '链路色',
              value: draft.colors.jade,
              onChange: (v) => setColor('jade', v)
            }),
            h(ColorField, {
              label: '告警色',
              value: draft.colors.alarm,
              onChange: (v) => setColor('alarm', v)
            })
          )
        )
      ]

      /* 与旧版一致：单页滚动、分组卡片，不做标签页。
         顺序按“先调行为、再调内容、最后调外观”排。 */
      var panes = [basicPane[0], basicPane[1]]
        .concat(actsPane)
        .concat(logsPane)
        .concat(colorsPane)
        .concat([basicPane[2]])
        .concat([updatePane])

      return h('div', { className: '__hb_root' },
        h('div', { className: '__hb_version' }, '版本 v' + (version || FALLBACK_VERSION)),
        user && user.name ? h('div', { className: '__hb_user' },
          '当前用户',
          h('b', null, user.name),
          user.host ? h('span', null, '· ' + user.host) : null
        ) : null,
        h('div', { className: '__hb_lead' },
          'HDD 控制台开机动画。下面把六幕文案、启动日志、配色与时序都交给你改，',
          '保存后点「立即预览」当场看效果，不用刷新页面。'
        ),
        panes,

        /* 预览与操作 */
        h('div', { className: '__hb_preview' },
          h('div', { className: '__hb_previewText' },
            '预览会先读取已保存的配置，再重播一次；改完记得先保存。',
            file ? h('div', { style: { marginTop: '4px', opacity: 0.75 } }, '配置文件：' + file) : null
          ),
          h('button', { className: '__hb_btn', onClick: preview }, '立即预览')
        ),
        h('div', { className: '__hb_actions' },
          h('button', {
            className: '__hb_btn __hb_btnPrimary',
            disabled: busy,
            onClick: save
          }, busy ? '保存中…' : '保存'),
          h('button', { className: '__hb_btn', disabled: busy, onClick: reset }, '恢复默认'),
          h('button', { className: '__hb_btn', disabled: busy, onClick: load }, '放弃修改'),
          h('button', { className: '__hb_btn', disabled: busy, onClick: importJson }, '导入 JSON'),
          h('button', { className: '__hb_btn', disabled: busy, onClick: exportJson }, '导出 JSON'),
          notice ? h('span', { className: '__hb_notice' }, notice) : null
        ),
        defaults ? h('div', { className: '__hb_hint' },
          '默认：速度 ' + Number(defaults.speed).toFixed(2) + '× · ' +
          (defaults.requireGate ? '需要放行' : '自动播放') + ' · ' +
          (defaults.sound ? '开音效' : '静音')
        ) : null
      )
    }

    /* ── 插件 ────────────────────────────────────────────────────────────── */
    var inject = ['slots']

    /* 样式表手动插：按 id 去重，热重载时不会叠一堆 */
    var CSS_ID = 'hdd-console-boot/main.css'
    function ensureStyle() {
      if (typeof document === 'undefined' || !document.head) return function () {}
      if (document.querySelector('style[data-plugin-css="' + CSS_ID + '"]')) return function () {}
      var tag = document.createElement('style')
      tag.dataset.pluginCss = CSS_ID
      tag.textContent = CSS
      document.head.appendChild(tag)
      return function () {
        try { if (tag.parentNode) tag.parentNode.removeChild(tag) } catch (e) {}
      }
    }

    /* ── 桌面端自举 ────────────────────────────────────────────────────────
       Host 半侧靠 ctx.webServer.tapIndex 往 index.html 里注入启动界面。
       web profile 一定走这条路；但桌面端的前端由 Electron 直接下发
       （file:// + IPC 或绕过 tapIndex 的 index），注入整条不生效。
       于是浏览器半侧自己兜一层：没被 Host 接管时，自己建根节点、拉样式与
       运行时、按 mode 判定要不要播。判定全在 window 上，不猜宿主类型：
         __HDD_CONFIG__     Host 注入过配置（说明已接管）
         __HDD_SKIP__       Host 兜底已判定"这次不播"
         __HDD_BOOT__       本侧已经自举过
         __HDD_BOOT_FAILED__ 自举失败过，别再扑一次
       任何一步失败都放开页面，绝不留黑屏。 */
    var BOOT_ROUTE = '/hdd-console'
    var ROOT_ID = 'hdd-root'

    function readFlag(store, key) {
      try {
        var s = window[store]
        return s ? s.getItem(key) : null
      } catch (e) { return null }
    }
    function writeFlag(store, key, value) {
      try {
        var s = window[store]
        if (s) s.setItem(key, value)
      } catch (e) { /* 隐私模式下不可写 */ }
    }

    function loadScript(src, done) {
      var s = document.createElement('script')
      s.src = src
      s.async = false
      s.addEventListener('load', function () { done(null) })
      s.addEventListener('error', function () { done(new Error('script load failed: ' + src)) })
      ;(document.head || document.documentElement).appendChild(s)
    }
    function loadCss(href, done) {
      var link = document.createElement('link')
      link.rel = 'stylesheet'
      link.href = href
      link.addEventListener('load', function () { done(null) })
      link.addEventListener('error', function () { done(new Error('css load failed: ' + href)) })
      ;(document.head || document.documentElement).appendChild(link)
    }

    /** 自举失败时把页面还回去：摘根节点、解滚动锁、留失败标记。 */
    function release(ok) {
      if (ok) return
      try {
        var r = document.getElementById(ROOT_ID)
        if (r && r.parentNode) r.parentNode.removeChild(r)
        document.documentElement.classList.remove('hdd-lock')
        if (document.body && document.body.style) document.body.style.overflow = ''
        restoreTitlebarEarly()
        window.__HDD_BOOT_FAILED__ = true
      } catch (e) { /* 兜底不再抛 */ }
    }

    /* 桌面端标题栏的“第一瞬间”：
       自举路径下，root 的黑底先出现，splash.js 才被下载/执行，等它里面的
       chromeSync.hide() 生效，中间有几百毫秒——那期间右上角还挂着主题色的
       白块（用户截图看到的“开机那一瞬间”）。
       所以在这里、建 root **之前**先把 preload 的测色探针改成透明。
       只动探针、不动 html 上的 token：splash.js 的 chromeSync 会在 hide()
       时记录变量原值，这里若也改掉，show() 就会还原成透明、按钮永久消失。 */
    function earlyHideTitlebar() {
      try {
        var CLEAR = 'rgba(0, 0, 0, 0)'
        var el = document.querySelector('span[style*="dsw-specific-sidebar-fill"]')
        if (!el) return
        el.style.setProperty('background-color', CLEAR)
        el.style.setProperty('color', CLEAR)
        if (document.head) {
          var st = document.createElement('style')
          st.setAttribute('data-hdd-chrome-poke', '1')
          st.textContent = '/*hdd-poke*/'
          document.head.appendChild(st)
          if (st.parentNode) st.parentNode.removeChild(st)
        }
      } catch (e) { /* 兜底不再抛 */ }
    }

    function injectRoot(cfg, onReady) {
      earlyHideTitlebar()
      var root = document.getElementById(ROOT_ID)
      if (!root) {
        root = document.createElement('div')
        root.id = ROOT_ID
        document.body.appendChild(root)
      }
      root.className = 'hdd-root hdd-boot'
      document.documentElement.classList.add('hdd-lock')
      if (document.body && document.body.style) document.body.style.overflow = 'hidden'

      var failed = false
      var cssReady = false
      var scriptReady = false
      var readyCalled = false
      function guard(err) {
        if (err) {
          if (!failed && typeof console !== 'undefined' && console.warn) {
            console.warn('[hdd-console-boot] 桌面端自举失败，已放开页面：', err.message)
          }
          failed = true
          release(false)
          return
        }
        if (cssReady && scriptReady && !readyCalled) {
          readyCalled = true
          release(true)
          if (typeof onReady === 'function') {
            try { onReady() } catch (e) { /* 记标记失败不影响播放 */ }
          }
        }
      }

      loadCss(BOOT_ROUTE + '/splash.css', function (err) {
        if (err) { guard(err); return }
        cssReady = true
        guard(null)
      })

      /* 配置先落 window：splash.js 载入时直接读它 */
      window.__HDD_CONFIG__ = cfg || {}
      try { delete window.__HDD_BOOT_LOADED__ } catch (e) { window.__HDD_BOOT_LOADED__ = undefined }
      loadScript(BOOT_ROUTE + '/splash.js?t=' + Date.now(), function (err) {
        if (err) { guard(err); return }
        scriptReady = true
        guard(null)
      })

      /* 自愈：样式与脚本都到了、root 还挂着 hdd-boot，说明运行时没接管 */
      setTimeout(function () {
        try {
          var r = document.getElementById(ROOT_ID)
          if (r && r.className && r.className.indexOf('hdd-boot') !== -1) release(false)
        } catch (e) { /* 兜底不再抛 */ }
      }, 9000)
    }

    /* 决定“这次不播”时，把提前隐藏的标题栏还回去 */
    function restoreTitlebarEarly() {
      try {
        var el = document.querySelector('span[style*="dsw-specific-sidebar-fill"]')
        if (el) {
          el.style.removeProperty('background-color')
          el.style.removeProperty('color')
        }
        if (document.head) {
          var st = document.createElement('style')
          st.setAttribute('data-hdd-chrome-poke', '1')
          st.textContent = '/*hdd-poke*/'
          document.head.appendChild(st)
          if (st.parentNode) st.parentNode.removeChild(st)
        }
      } catch (e) { /* 兜底不再抛 */ }
    }

    function selfBoot() {
      try {
        if (typeof window === 'undefined' || typeof document === 'undefined') return
        if (!document.body) return
        if (window.__HDD_CONFIG__) return        /* Host 已注入配置 */
        if (window.__HDD_SKIP__ === true) return /* Host 判定这次不播 */
        if (window.__HDD_BOOT__) return          /* 本侧已自举 */
        if (document.getElementById(ROOT_ID)) return
        if (window.__HDD_BOOT_FAILED__ === true) return
        window.__HDD_BOOT__ = 'client'

        /* fetch 之前就藏标题栏：这一段最慢（网络 + 解析），也是白块最刺眼的时候 */
        earlyHideTitlebar()

        fetch(API, { headers: { Accept: 'application/json' } })
          .then(function (r) { return r.json() })
          .then(function (j) { return j && j.ok === true ? j.config : null })
          .catch(function () { return null })
          .then(function (cfg) {
            cfg = cfg || { enabled: true, mode: 'session', speed: 1 }
            if (cfg.enabled === false) { restoreTitlebarEarly(); return }
            var today = new Date().toISOString().slice(0, 10)
            if (cfg.mode === 'session' && readFlag('sessionStorage', 'hdd-console:shown') === '1') {
              restoreTitlebarEarly()
              return
            }
            if (cfg.mode === 'daily' && readFlag('localStorage', 'hdd-console:day') === today) {
              restoreTitlebarEarly()
              return
            }
            return injectRoot(cfg, function () {
              /* 与 Host bootstrap 的语义保持一致：挂上了才算播过 */
              if (cfg.mode === 'session') writeFlag('sessionStorage', 'hdd-console:shown', '1')
              if (cfg.mode === 'daily') writeFlag('localStorage', 'hdd-console:day', today)
            })
          })
          .catch(function () { restoreTitlebarEarly() })
      } catch (e) { /* 自举是兜底，绝不许把宿主带崩 */ }
    }

    function apply(ctx) {
      /* 桌面端兜底：Host 的 index 注入不生效时，由这里自举启动界面 */
      selfBoot()
      var removeStyle = ensureStyle()
      ctx.effect(function () { return removeStyle })
      ctx.slots.inject('settings.section', function () {
        return ctx.slots.register(
          { name: 'settings.section', id: 'hdd-console', order: 27, label: '开机动画' },
          function () { return h(Panel, {}) }
        )
      })
    }

    exports.apply = apply
    exports.inject = inject
    return module.exports
  }
})
