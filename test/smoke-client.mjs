/* 设置面板冒烟：ModuleLoader 形状 / slot 注册 / 字段与 Host 对齐 / 无 JSX */
import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'

const ROOT = path.resolve(import.meta.dirname, '..')
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8')
const client = read('lib/client.js')
const host = read('lib/index.js')
const pkg = JSON.parse(read('package.json'))

let pass = 0
let fail = 0
function check(name, ok, detail) {
  if (ok) { pass++; console.log('  ok   ' + name) } else { fail++; console.log('  FAIL ' + name + (detail ? '  → ' + detail : '')) }
}

console.log('\n[1] bundle 形状')
check('用 __ModuleLoader__.load 包裹', client.includes('window.__ModuleLoader__.load({'))
const idm = client.match(/id:\s*'([^']+)'/)
check('loader id 等于包名', idm && idm[1] === pkg.name, idm && idm[1] + ' vs ' + pkg.name)
check('有 factory(require)', /factory:\s*\(require\)\s*=>/.test(client))
check('require("react")', client.includes("require('react')"))
check('没有 JSX（纯 createElement）', !/<[A-Z][A-Za-z]*[\s/>]/.test(client.replace(/<[^>]*svg[^>]*>/g, '')))
check('没有 import/export 语法', !/^\s*(import|export)\s/m.test(client))
check('有 module.exports', client.includes('module.exports'))
check('导出 apply / inject', client.includes('exports.apply = apply') && client.includes('exports.inject = inject'))
check('inject 含 slots', /var inject = \['slots'\]/.test(client))

console.log('\n[2] 样式与注册')
check('样式按 id 去重', client.includes('data-plugin-css') && client.includes('CSS_ID'))
check('CSS 用 __hb_ 前缀', client.includes('.__hb_root'))
check('注册 settings.section', client.includes("ctx.slots.inject('settings.section'"))
check('section id 合法', /id:\s*'hdd-console'/.test(client))
check('section label 为开机动画', /label:\s*'开机动画'/.test(client))
check('section order 是数字', /order:\s*\d+/.test(client))
check('读配置走 /hdd-console/config', client.includes("var API = '/hdd-console/config'"))
check('保存走 POST', client.includes("method: 'POST'"))
check('有恢复默认入口', client.includes('reset: true'))
check('有立即预览入口', client.includes('api.replay'))
check('有浮层提示（notice）', client.includes('__hb_notice'))
check('有加载失败重试', client.includes('重试'))

console.log('\n[3] 字段覆盖 Host 配置')
const keys = [
  ['enabled', /'enabled'/], ['mode', /'mode'/], ['speed', /'speed'/],
  ['requireGate', /'requireGate'/], ['allowSkip', /'allowSkip'/],
  ['sound', /'sound'/], ['volume', /'volume'/], ['colors.amber', /colors\.amber/], ['colors.paper', /colors\.paper/],
  ['identity', /'identity'/], ['station', /'station'/], ['build', /'build'/],
  ['title', /'title'/], ['subtitle', /'subtitle'/], ['footer', /'footer'/]
]
keys.forEach(([k, re]) => check('面板可改 ' + k, re.test(client)))

console.log('\n[4] 在假环境里执行 factory')
const registered = []
const fakeCtx = {
  slots: {
    inject(name, fn) { registered.push({ kind: 'inject', name }); fn(); },
    register(def, render) {
      registered.push({ kind: 'register', def })
      return () => {}
    }
  },
  effect(fn) { return fn() }
}
const appended = []
const sandbox = {
  console,
  window: {
    __ModuleLoader__: {
      load(options) {
        sandbox.__loaded = options
        const mod = options.factory((name) => {
          if (name === 'react') {
            return { createElement: (type, props, ...children) => ({ type, props, children }) }
          }
          throw new Error('unexpected require: ' + name)
        })
        sandbox.__mod = mod
      }
    }
  },
  document: {
    head: { appendChild: (n) => appended.push(n) },
    querySelector: () => null,
    createElement: () => ({ dataset: {}, textContent: '', parentNode: null })
  }
}
sandbox.globalThis = sandbox
vm.createContext(sandbox)
try {
  vm.runInContext(client, sandbox)
  check('factory 执行成功', !!sandbox.__mod)
  check('load 的 id 是包名', sandbox.__loaded && sandbox.__loaded.id === pkg.name)
  check('模块导出 apply', typeof (sandbox.__mod && sandbox.__mod.apply) === 'function')
  check('模块导出 inject', Array.isArray(sandbox.__mod && sandbox.__mod.inject))
  sandbox.__mod.apply(fakeCtx)
  check('apply 注册了 settings.section', registered.some((r) => r.kind === 'inject' && r.name === 'settings.section'))
  const reg = registered.find((r) => r.kind === 'register')
  check('register 收到 section 定义', !!reg && reg.def.name === 'settings.section' && reg.def.id === 'hdd-console')
  check('插入了一份样式表', appended.length === 1)
  check('样式表带 plugin-css 标记', appended[0] && appended[0].dataset.pluginCss === 'hdd-console-boot/main.css')
} catch (err) {
  check('factory 在假环境里跑通', false, String(err && err.stack ? err.stack.split('\n').slice(0, 3).join(' | ') : err))
}

console.log('\n[5] 与 Host 的版本/默认值对齐')
check('package.json 有 dsh.bundle.patch', !!(pkg.dsh && pkg.dsh.bundle && pkg.dsh.bundle.patch))
check('package.json 有 dsh.client.platform', !!(pkg.dsh && pkg.dsh.client && pkg.dsh.client.platform === 'web'))
check('cordis.patch.yml 存在且插入同 id', read('cordis.patch.yml').includes('id: hdd-console-boot'))
check('FALLBACK 版本与 package.json 一致', client.includes("var FALLBACK_VERSION = '" + pkg.version + "'"))

console.log('\n============================')
console.log(`  通过 ${pass} / 失败 ${fail}`)
console.log('============================')
process.exit(fail ? 1 : 0)
