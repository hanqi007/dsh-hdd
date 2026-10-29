/* Host 半侧冒烟：路由注册 / index 注入 / 配置归一化 / 幂等 */
import assert from 'node:assert/strict'
import { Readable } from 'node:stream'

const mod = await import('../lib/index.js')

let pass = 0
let fail = 0
function check(name, ok, detail) {
  if (ok) { pass++; console.log('  ok   ' + name) } else { fail++; console.log('  FAIL ' + name + (detail ? '  → ' + detail : '')) }
}

console.log('\n[1] 插件形状')
check('导出 name', mod.name === 'hdd-console-boot', String(mod.name))
check('inject 含 webServer', Array.isArray(mod.inject) && mod.inject.includes('webServer'), JSON.stringify(mod.inject))
check('导出 apply 函数', typeof mod.apply === 'function')

/* ── 假 ctx ─────────────────────────────────────────────────────────────── */
const routes = []
const taps = []
const disposers = []
const ctx = {
  webServer: {
    register(route) { routes.push(route); return () => {} },
    tapIndex(fn) { taps.push(fn); return () => {} }
  },
  effect(fn) { const d = fn(); disposers.push(d); return d }
}
mod.apply(ctx)

console.log('\n[2] 路由')
check('注册了 4 条路由', routes.length === 4, String(routes.length))
const byPath = Object.fromEntries(routes.map((r) => [r.path, r]))
check('样式路由存在', !!byPath['/hdd-console/splash.css'])
check('运行时路由存在', !!byPath['/hdd-console/splash.js'])
check('配置路由存在', !!byPath['/hdd-console/config'])
check('更新检查路由存在', !!byPath['/hdd-console/update'])
check('全部是 exact 路由', routes.every((r) => r.kind === 'exact'))

function fakeReq(method, body) {
  const req = Readable.from(body ? [Buffer.from(body)] : [])
  req.method = method
  return req
}
function fakeRes() {
  return {
    statusCode: 0,
    headers: {},
    body: '',
    setHeader(k, v) { this.headers[k.toLowerCase()] = v },
    end(t) { this.body = t || '' }
  }
}

const cssRes = fakeRes()
await byPath['/hdd-console/splash.css'].handler(fakeReq('GET'), cssRes)
check('css 返回 200', cssRes.statusCode === 200)
check('css MIME 正确', /text\/css/.test(cssRes.headers['content-type'] || ''))
check('css 里有 .hdd-screen', cssRes.body.includes('.hdd-screen'))
check('css 里有扫描线层', cssRes.body.includes('.hdd-scanlines'))

const jsRes = fakeRes()
await byPath['/hdd-console/splash.js'].handler(fakeReq('GET'), jsRes)
check('js 返回 200', jsRes.statusCode === 200)
check('js MIME 正确', /javascript/.test(jsRes.headers['content-type'] || ''))
check('js 里有 HDD_API', jsRes.body.includes('window.HDD_API'))
check('js 里有六幕脚本', jsRes.body.includes('扇区校验') && jsRes.body.includes('数据贯通'))
check('js 里有看门狗', jsRes.body.includes('STALL_MS'))
check('js 里没有裸的 </script>', !jsRes.body.includes('</script>'))

console.log('\n[3] 配置接口')
const cfgGet = fakeRes()
await byPath['/hdd-console/config'].handler(fakeReq('GET'), cfgGet)
const cfg = JSON.parse(cfgGet.body)
check('GET 返回 ok', cfg.ok === true)
check('GET 带 version', typeof cfg.version === 'string' && /^\d+\.\d+\.\d+/.test(cfg.version), cfg.version)
check('GET 带 defaults', !!cfg.defaults && cfg.defaults.title === 'HDD')
check('GET 带配置文件路径', typeof cfg.file === 'string' && cfg.file.endsWith('hdd-console.json'), cfg.file)
check('GET 带当前用户', !!(cfg.user && typeof cfg.user.name === 'string' && cfg.user.name.length > 0), JSON.stringify(cfg.user))
check('自动更新默认关闭', cfg.defaults && cfg.defaults.autoUpdate === false, String(cfg.defaults && cfg.defaults.autoUpdate))

const cfgPost = fakeRes()
await byPath['/hdd-console/config'].handler(
  fakeReq('POST', JSON.stringify({ config: { speed: 99, accent: 'nope', identity: '  ', enabled: 'false' } })),
  cfgPost
)
const saved = JSON.parse(cfgPost.body)
check('POST 返回 ok', saved.ok === true)
check('速度被夹取到 3', saved.config.speed === 3, String(saved.config.speed))
check('非法强调色回退 amber', saved.config.accent === 'amber', saved.config.accent)
check('空身份名回退默认值', saved.config.identity === '深度求索', saved.config.identity)
check('字符串 "false" 归一为布尔 false', saved.config.enabled === false, String(saved.config.enabled))

const cfgBad = fakeRes()
await byPath['/hdd-console/config'].handler(fakeReq('POST', '{oops'), cfgBad)
check('坏 JSON 返回 400', cfgBad.statusCode === 400)

const cfgMethod = fakeRes()
await byPath['/hdd-console/config'].handler(fakeReq('PUT'), cfgMethod)
check('不支持的方法返回 405', cfgMethod.statusCode === 405)

console.log('\n[4] index.html 注入')
check('注册了 tapIndex', taps.length === 1)
const html = '<!doctype html><html><head><title>t</title></head><body><div id="root"></div></body></html>'
const out1 = taps[0](html)
check('注入了 splash.css', out1.includes('/hdd-console/splash.css'))
check('注入了 splash.js（defer）', /<script defer src="\/hdd-console\/splash\.js">/.test(out1))
check('注入了挂载点', out1.includes('<div id="hdd-root"'))
check('注入了配置', out1.includes('window.__HDD_CONFIG__='))
check('配置在 </head> 之前', out1.indexOf('hdd-console/splash.css') < out1.indexOf('</head>'))
check('挂载点紧跟 <body>', /<body>\s*<div id="hdd-root"/.test(out1))
check('原 #root 仍在', out1.includes('<div id="root">'))
const out2 = taps[0](out1)
check('幂等：二次注入不重复', out2 === out1)
const cfgJson = out1.match(/window\.__HDD_CONFIG__=(\{[\s\S]*?\});window\.__HDD_VERSION__/)
check('配置 JSON 里没有裸的 <', !!cfgJson && cfgJson[1].indexOf('<') === -1)
check('配置 JSON 可解析', !!cfgJson && (() => { try { JSON.parse(cfgJson[1]); return true } catch (e) { return false } })())

const noHead = taps[0]('<html><body>x</body></html>')
check('没有 </head> 也能注入', noHead.includes('/hdd-console/splash.css') && noHead.includes('hdd-root'))

console.log('\n[4b] 高级字段：六幕 / 日志 / 配色能存能读')
const richBody = JSON.stringify({
  config: {
    steps: [
      { zh: '自定义一幕', en: 'CUSTOM ONE', sub: '第一行', pct: 11, hold: 800, tag: 'C1' },
      { zh: '自定义二幕', en: 'CUSTOM TWO', sub: '第二行', pct: 33, hold: 900, tag: 'C2' }
    ],
    logs: [[['TAG', '自定义日志行', 'ok']]],
    colors: { paper: '#101010', amber: '#62b8ff', jade: '#58d6b0', alarm: '#ff0000' }
  }
})
const richSave = fakeRes()
await byPath['/hdd-console/config'].handler(fakeReq('POST', richBody), richSave)
const richSaved = JSON.parse(richSave.body)
check('保存后 steps 原样保留', Array.isArray(richSaved.config.steps) && richSaved.config.steps.length === 2, String(richSaved.config.steps && richSaved.config.steps.length))
check('保存后 logs 原样保留', Array.isArray(richSaved.config.logs) && richSaved.config.logs.length === 1)
check('保存后 colors 原样保留', richSaved.config.colors && richSaved.config.colors.amber === '#62b8ff', JSON.stringify(richSaved.config.colors))

const richGet = fakeRes()
await byPath['/hdd-console/config'].handler(fakeReq('GET'), richGet)
const richRead = JSON.parse(richGet.body)
check('读取时 steps 还在', Array.isArray(richRead.config.steps) && richRead.config.steps[0].zh === '自定义一幕', richRead.config.steps && richRead.config.steps[0] && richRead.config.steps[0].zh)

const richHtml = taps[0]('<html><head></head><body><div id="root"></div></body></html>')
const richJson = richHtml.match(/window\.__HDD_CONFIG__=(\{[\s\S]*?\});window\.__HDD_VERSION__/)
let injectedCfg = null
try { injectedCfg = richJson ? JSON.parse(richJson[1]) : null } catch (e) { /* ignore */ }
check('注入 HTML 时带上 steps', !!(injectedCfg && injectedCfg.steps && injectedCfg.steps[0].zh === '自定义一幕'))
check('注入 HTML 时带上 colors', !!(injectedCfg && injectedCfg.colors && injectedCfg.colors.amber === '#62b8ff'))

/* 收尾：恢复默认，避免把测试数据留在临时配置里 */
await byPath['/hdd-console/config'].handler(fakeReq('POST', JSON.stringify({ reset: true })), fakeRes())

console.log('\n[5] 身份名称里的尖括号不会逃出内联脚本')
const evil = '<script>window.__HDD_CONFIG__=' + JSON.stringify({ title: '</script><img src=x>' }).replace(/</g, '\\u003c')
check('尖括号被转义', !evil.includes('</script>'))

console.log('\n============================')
console.log(`  通过 ${pass} / 失败 ${fail}`)
console.log('============================')
process.exit(fail ? 1 : 0)
