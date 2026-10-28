/* 配置器产物冒烟：studio.html 自包含、默认配置完整、解码可用 */
import fs from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve(import.meta.dirname, '..')
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8')

let pass = 0
let fail = 0
function check(name, ok, detail) {
  if (ok) { pass++; console.log('  ok   ' + name) } else { fail++; console.log('  FAIL ' + name + (detail ? '  → ' + detail : '')) }
}

console.log('\n[1] 产物存在')
const exists = (p) => fs.existsSync(path.join(ROOT, p))
check('studio.html 已生成', exists('studio.html'))
check('src/studio.js 存在', exists('src/studio.js'))
check('src/studio.css 存在', exists('src/studio.css'))
const html = read('studio.html')

console.log('\n[2] 自包含')
const external = [...html.matchAll(/(?:src|href)="(?!data:|#)([^"]+)"/g)].map((x) => x[1])
check('没有外部资源引用', external.length === 0, external.join(','))
check('内联了配置器样式', html.includes('#studio') && html.includes('.studio-panel'))
check('内联了配置器脚本', html.includes('STUDIO_DEBUG'))

console.log('\n[3] 注入的默认配置')
const m = html.match(/window\.STUDIO = (\{[\s\S]*?\});\n<\/script>/)
check('能截到 window.STUDIO', !!m)
let studio = null
try { studio = new Function('return (' + m[1] + ')')() } catch (e) { /* ignore */ }
check('STUDIO 对象可解析', !!studio)
if (studio) {
  check('有 defaults', !!studio.defaults)
  check('六幕完整', Array.isArray(studio.defaults.steps) && studio.defaults.steps.length === 6, String(studio.defaults.steps && studio.defaults.steps.length))
  check('六组日志', Array.isArray(studio.defaults.logs) && studio.defaults.logs.length === 6, String(studio.defaults.logs && studio.defaults.logs.length))
  check('有配色', !!studio.defaults.colors && !!studio.defaults.colors.amber)
  check('有身份字段', typeof studio.defaults.identity === 'string' && studio.defaults.identity.length > 0)
  check('cssB64 可解码', (() => {
    try { return Buffer.from(studio.cssB64, 'base64').toString('utf8').includes('.hdd-screen') } catch (e) { return false }
  })())
  check('runtimeB64 可解码', (() => {
    try { return Buffer.from(studio.runtimeB64, 'base64').toString('utf8').includes('window.HDD_API') } catch (e) { return false }
  })())
  check('base64 里不含裸标签', !/<\/script/i.test(studio.runtimeB64) && !/<\/style/i.test(studio.cssB64))
  check('第一幕文案来自源码', studio.defaults.steps[0].zh === '电源接入', studio.defaults.steps[0].zh)
  check('默认日志首行来自源码', studio.defaults.logs[0][0][1].includes('机箱电源接入'), studio.defaults.logs[0][0][1])
}

console.log('\n[4] 配置器界面骨架')
;['id="panel"', 'id="frame"', 'id="btnExportHtml"', 'id="btnExportJson"', 'id="btnImport"', 'id="preset"', 'id="autoPreview"'].forEach((needle) => {
  check('有 ' + needle, html.includes(needle))
})
check('有实时预览说明', html.includes('实时预览'))
check('导出按钮是主按钮', /id="btnExportHtml"[^>]*class="primary"|class="primary"[^>]*id="btnExportHtml"/.test(html))

console.log('\n[5] 运行时支持配置覆盖')
const boot = read('lib/splash.js')
check('运行时读 steps 覆盖', boot.includes('resolveSteps(DEFAULT_STEPS, C.steps)'))
check('运行时读 logs 覆盖', boot.includes('resolveLogs(DEFAULT_LOGS, C.logs)'))
check('运行时读 colors 覆盖', boot.includes('customColors(C.colors)'))
check('gate/alert 不允许改', /gate: !!step\.gate,\s*\n\s*alert: !!step\.alert/.test(boot))
check('颜色只认 6 位十六进制', boot.includes("[0-9a-fA-F]{6}"))
check('宿主透传 steps/logs/colors', /Array\.isArray\(src\.steps\)/.test(read('lib/index.js')))

console.log('\n============================')
console.log(`  通过 ${pass} / 失败 ${fail}`)
console.log('============================')
process.exit(fail ? 1 : 0)
