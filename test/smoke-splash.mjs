/* 运行时冒烟：静态接线检查 + 配置归一化行为 */
import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'

const ROOT = path.resolve(import.meta.dirname, '..')
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8')

const splash = read('lib/splash.js')
const css = read('lib/splash.css')
const audio = read('src/audio.js')
const instrument = read('src/instrument.js')
const host = read('lib/index.js')

let pass = 0
let fail = 0
function check(name, ok, detail) {
  if (ok) { pass++; console.log('  ok   ' + name) } else { fail++; console.log('  FAIL ' + name + (detail ? '  → ' + detail : '')) }
}

console.log('\n[1] 六幕脚本')
const acts = ['电源接入', '阵列自检', '磁道寻道', '扇区校验', '权限核验', '数据贯通']
acts.forEach((zh) => check('有这一幕：' + zh, splash.includes("zh: '" + zh + "'")))
const ens = ['POWER ON SELF TEST', 'DRIVE ARRAY CHECK', 'TRACK SEEK PROBE', 'SECTOR VERIFY', 'OPERATOR CLEARANCE', 'DATA LINK ESTABLISHED']
ens.forEach((en) => check('英文副行：' + en, splash.includes("en: '" + en + "'")))
check('每幕都有进度百分比', (splash.match(/pct: \d+,\s*\n\s*hold:/g) || []).length === 6, String((splash.match(/pct: \d+,\s*\n\s*hold:/g) || []).length))
check('第四幕是放行幕', /gate: true/.test(splash) && /alert: true/.test(splash))

console.log('\n[2] DOM 结构')
;['hdd-case', 'hdd-screen', 'hdd-top', 'hdd-log', 'hdd-scope', 'hdd-readout', 'hdd-hex', 'hdd-segs', 'hdd-alert', 'hdd-action', 'hdd-skip'].forEach((cls) => {
  check('有 .' + cls, splash.includes('hdd ' + cls) || splash.includes('"' + cls + '"') || splash.includes('hdd ' + cls) || splash.includes(cls))
})
check('显像管开机类', splash.includes('hdd-power'))
check('故障切片层', splash.includes('hdd-glitch-slices'))
check('揭幕白闪层', splash.includes('hdd-outro-run'))
check('手写 SVG 标牌（非外链图片）', splash.includes('MARK_SVG') && splash.includes('<svg viewBox="0 0 32 32"'))
check('没有引用任何外部图片/字体', !/https?:\/\//.test(splash))

console.log('\n[3] 时间线与保命机制')
check('有代际号', splash.includes('__HDD_GEN__'))
check('有停滞看门狗', splash.includes('STALL_MS') && splash.includes('armStall'))
check('有 9 秒兜底（Host 侧）', host.includes('9000'))
check('有完成事件', splash.includes("'hdd-boot:done'"))
check('run() 里按序推进六幕', /STEPS\[0\]/.test(splash) && /STEPS\[5\]/.test(splash))
check('放行用 Promise 等键盘/按钮', splash.includes('openGate') && splash.includes('gateResolve'))
check('关掉 requireGate 会自动过', splash.includes('if (C.requireGate) return openGate()'))
check('finish 幂等', /if \(finished\) return/.test(splash))
check('dispose 清定时器', splash.includes('function dispose()') && splash.includes('clearInterval(telemetryTimer)'))
check('replay 会先 dispose', splash.includes('prev.dispose') || splash.includes('dispose()'))
check('单文件演示走 reload', splash.includes("src === 'about:blank#reload'") || splash.includes("src === '#reload'"))

console.log('\n[4] 交互与 API')
check('Esc 跳过', splash.includes("e.key === 'Escape'"))
check('Enter / 空格放行', splash.includes("'Enter'") && splash.includes("' '"))
check('暴露 HDD_API', splash.includes('window.HDD_API ='))
check('API 有 replay/skip/finish/dispose/set', /replay: replay/.test(splash) && /skip: requestSkip/.test(splash) && /finish: finish/.test(splash) && /dispose: dispose/.test(splash) && /set: function/.test(splash))
check('API 暴露状态', splash.includes('get state()'))
check('锁滚动', splash.includes("classList.add('hdd-lock')") && splash.includes("overflow = 'hidden'"))

console.log('\n[4c] 桌面端标题栏')
check('有 chromeSync 探针同步', splash.includes('var chromeSync = (function'))
check('播放时隐藏标题栏', /function run\(\)[\s\S]{0,240}chromeSync\.hide\(\)/.test(splash))
check('揭幕时还原标题栏', /function finish\(\)[\s\S]{0,240}chromeSync\.show\(\)/.test(splash))
check('dispose 也还原', /function dispose\(\)[\s\S]{0,200}chromeSync\.show\(\)/.test(splash))
check('root 被移除时兜底还原', splash.includes('nodes[n].id === ROOT_ID'))
check('有 60 秒硬上限', splash.includes('MAX_HOLD_MS = 60000'))
check('探针按 token 名查找', splash.includes('dsw-specific-sidebar-fill'))
check('时钟与日期有分隔符', splash.includes("'· ' + pad2(d.getMonth() + 1)"))

console.log('\n[4b] 已知回归点')
/* Host 侧用这两个键判断「这一会话/今天播过」，运行时必须写同一组键，否则 session/daily 模式永不生效 */
const shown = splash.match(/setItem\('(hdd-[a-z]+):shown'/)
const day = splash.match(/setItem\('(hdd-[a-z]+):day'/)
check('session 标记键与 Host 一致', !!shown && shown[1] === 'hdd-console' && host.includes("getItem('hdd-console:shown')"), shown && shown[1])
check('daily 标记键与 Host 一致', !!day && day[1] === 'hdd-console' && host.includes("getItem('hdd-console:day')"), day && day[1])
check('replay 清的是同一个 session 键', splash.includes("removeItem('hdd-console:shown')"))
check('等放行前先把看门狗下弦', /function openGate\(\)\s*\{[\s\S]{0,200}disarmStall\(\)/.test(splash))
check('source 预览的重播桩走 ../src/', read('src/replay.js').includes("'../src/audio.js'"))
/* replay 重挂脚本的默认路径必须与 Host 路由前缀一致，否则会拿回 HTML 并报语法错 */
check('replay 默认脚本路径与 Host 路由一致', splash.includes("/hdd-console/splash.js?t=") && host.includes("ROUTE_BASE + '/splash.js'"), (splash.match(/'(\/hdd-[a-z-]+)\/splash\.js\?t='/g) || []).join(','))
check('没有残留的 /hdd-boot/ 路径', !splash.includes("'/hdd-boot/"))
/* Host 判定「不播」时要给运行时留标记，运行时据此不建 DOM */
check('Host 跳过时设置 __HDD_SKIP__', host.includes('window.__HDD_SKIP__=true'))
check('运行时识别 __HDD_SKIP__', splash.includes('window.__HDD_SKIP__ === true'))
check('skip 分支仍暴露 API', /__HDD_SKIP__ === true\)\s*\{[\s\S]{0,400}window\.HDD_API = \{/.test(splash))
check('手动重播会清掉跳过标记', /function replay\(\)[\s\S]{0,600}window\.__HDD_SKIP__ = false/.test(splash))

console.log('\n[5] 视觉系统')
check('CSS 变量有墨/纸/琥珀/青绿/告警', ['.--ink', '--paper', '--amber', '--jade', '--alarm'].every((v) => css.includes(v)) || ['--ink', '--paper', '--amber', '--jade', '--alarm'].every((v) => css.includes(v)))
check('CRT 扫描线', css.includes('.hdd-scanlines') && css.includes('repeating-linear-gradient'))
check('滚动亮带', css.includes('.hdd-roll') && css.includes('@keyframes hdd-roll'))
check('噪点层', css.includes('.hdd-noise') && css.includes('feTurbulence'))
check('暗角/曲面', css.includes('.hdd-curve') && css.includes('.hdd-vignette'))
check('故障切片动画', css.includes('@keyframes hdd-slice'))
check('警告斜纹', css.includes('repeating-linear-gradient(135deg'))
check('窄屏适配', css.includes('@media (max-width: 900px)'))
check('减少动态适配', css.includes('prefers-reduced-motion') || splash.includes('prefers-reduced-motion'))

console.log('\n[6] 仪表与音频模块')
check('仪表模块挂全局', instrument.includes('global.HDD_INSTRUMENT'))
check('画六边形环阵列', instrument.includes('function ringArray'))
check('画十六进制瀑布', instrument.includes('function hexrain'))
check('画立体声电平', instrument.includes('function meter'))
check('DPR 封顶', instrument.includes('DPR_MAX = 2'))
check('尊重 reduced-motion', instrument.includes('prefers-reduced-motion'))
check('音频模块挂全局', audio.includes('global.HDD_AUDIO'))
;['power', 'seek', 'tick', 'beep', 'sweep', 'lock'].forEach((fn) => {
  check('有音效 ' + fn + '()', new RegExp('function ' + fn + '\\(').test(audio))
})
check('音频懒启动（手势解锁）', audio.includes('function unlock') && audio.includes('unlocked'))
check('音频销毁容错', audio.includes('closing.catch'))
check('音频不依赖外部素材', !/\.mp3|\.wav|\.ogg/.test(audio))

console.log('\n[7] 配置一致性')
function grabDefaults(src, startPattern, endPattern) {
  const start = src.search(startPattern)
  if (start < 0) return null
  const end = src.indexOf(endPattern, start)
  if (end < 0) return null
  const body = src.slice(start, end)
  const out = {}
  body.split('\n').forEach((line) => {
    const mm = line.match(/^\s*([A-Za-z][A-Za-z0-9]*):\s*(.+?),?\s*(?:\/\/.*)?$/)
    if (mm) out[mm[1]] = mm[2].replace(/,\s*$/, '').trim()
  })
  return out
}
const hostDefaults = grabDefaults(host, /const DEFAULTS = \{/, '\n}\n')
const splashDefaults = grabDefaults(splash, /var DEFAULTS = \{/, '\n  }\n')
const shared = ['enabled', 'mode', 'speed', 'requireGate', 'allowSkip', 'sound', 'volume', 'accent', 'identity', 'station', 'build', 'title', 'subtitle', 'footer']
shared.forEach((key) => {
  const a = hostDefaults && hostDefaults[key]
  const b = splashDefaults && splashDefaults[key]
  check('默认值一致：' + key, a != null && b != null && a === b, 'host=' + a + ' splash=' + b)
})

console.log('\n[8] 配置归一化行为（在 vm 里跑 readConfig）')
const startMarker = '  /* ── 配置归一化 ─'
const endMarker = '  var C = readConfig()'
const s = splash.indexOf(startMarker)
const e = splash.indexOf(endMarker)
check('能截出配置段', s > 0 && e > s)
if (s > 0 && e > s) {
  const snippet = splash.slice(s, e)
  const sandbox = {
    window: { __HDD_CONFIG__: { speed: 99, volume: -3, accent: 'pink', title: '', identity: '  ' } },
    sessionStorage: { getItem: () => null, setItem: () => {} },
    JSON, Number, String, Math, isFinite, Object, console
  }
  vm.createContext(sandbox)
  try {
    vm.runInContext('var DEFAULTS = ' + JSON.stringify({
      enabled: true, mode: 'session', speed: 1, requireGate: true, allowSkip: true, sound: true,
      volume: 0.6, accent: 'amber', identity: 'HANLIN', station: 'STATION 07', build: '1.0.0',
      title: 'HDD', subtitle: 'HARD DISK DRIVE CONTROL',
      bootLine: '启动深空检索终端', bootLineEn: 'BOOTING DEEP-SPACE RETRIEVAL TERMINAL',
      footer: 'DEEPSEEK HARNESS · ORIGINAL BOOT SEQUENCE'
    }) + ';' + snippet + '; var __C = readConfig();', sandbox)
    check('速度被夹取到 3', sandbox.__C.speed === 3, String(sandbox.__C.speed))
    check('音量被夹取到 0', sandbox.__C.volume === 0, String(sandbox.__C.volume))
    check('非法强调色回退 amber', sandbox.__C.accent === 'amber', sandbox.__C.accent)
    check('空标题回退 HDD', sandbox.__C.title === 'HDD', sandbox.__C.title)
    check('空身份名回退默认', sandbox.__C.identity === 'HANLIN', sandbox.__C.identity)
    check('未知字段不污染配置', !('hacked' in sandbox.__C))
  } catch (err) {
    check('归一化代码可独立执行', false, String(err).slice(0, 120))
  }
}

console.log('\n============================')
console.log(`  通过 ${pass} / 失败 ${fail}`)
console.log('============================')
process.exit(fail ? 1 : 0)
