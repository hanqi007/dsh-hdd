/* HDD 控制台开机动画 — 运行时（由 build.mjs 从 src/ 汇总，请勿手改） */
/* ============================================================================
 * HDD 控制台 — 开机音（WebAudio 现场合成，零素材、零依赖）
 * ----------------------------------------------------------------------------
 * 浏览器要求先有一次用户手势才能出声，所以整段音频是"懒启动"的：
 * 首次 pointerdown / keydown / touchstart 时 unlock()，之后才开始发声。
 * 没解锁之前调用任何 play* 都只是 no-op，不会报错。
 *
 *   hum()    低频嗡鸣（55Hz + 82.5Hz 失谐叠加），整段常驻，音量随 stage 微调
 *   power()  上电：220Hz → 55Hz 的扫频 + 一记短促的电流咔
 *   seek(n)  磁头寻道：n 记带通噪声短脉冲，间隔随机
 *   tick()   打字机 / 界面确认的轻响
 *   beep()   告警双音（880 → 660 方波）
 *   sweep()  阶段推进的快速上扫
 *   lock()   核验通过的三音和声钟
 *   close()  逐幕收束时压低嗡鸣
 * ========================================================================== */
(function (global) {
  'use strict'

  function create(opts) {
    opts = opts || {}
    var volume = typeof opts.volume === 'number' ? opts.volume : 0.6
    var enabled = opts.enabled !== false
    var ac = null
    var master = null
    var humNodes = null
    var unlocked = false
    var dead = false

    function AudioCtor() {
      return global.AudioContext || global.webkitAudioContext
    }

    function ensure() {
      if (dead || !enabled) return null
      if (ac) return ac
      var Ctor = AudioCtor()
      if (!Ctor) { dead = true; return null }
      try {
        ac = new Ctor()
        master = ac.createGain()
        master.gain.value = 0
        master.connect(ac.destination)
      } catch (e) {
        dead = true
        ac = null
        return null
      }
      return ac
    }

    function now() { return ac ? ac.currentTime : 0 }

    function ramp(param, value, time, curve) {
      try {
        param.cancelScheduledValues(time)
        param.setValueAtTime(param.value, time)
        if (curve === 'exp') param.exponentialRampToValueAtTime(Math.max(0.0001, value), time)
        else param.linearRampToValueAtTime(value, time)
      } catch (e) { /* 某些实现会拒绝 0 值，忽略 */ }
    }

    /* ── 解锁与主音量 ─────────────────────────────────────────────────── */
    function unlock() {
      if (unlocked) return
      unlocked = true
      var ctx = ensure()
      if (!ctx) return
      try {
        if (ctx.state === 'suspended' && ctx.resume) {
          var resuming = ctx.resume()
          if (resuming && resuming.catch) resuming.catch(function () {})
        }
      } catch (e) { /* 老浏览器没有 resume */ }
      ramp(master.gain, volume, now() + 0.6)
      hum()
    }

    function setVolume(v) {
      volume = Math.max(0, Math.min(1, Number(v) || 0))
      if (master && unlocked) ramp(master.gain, volume, now() + 0.25)
    }

    function setEnabled(on) {
      enabled = !!on
      if (!enabled) {
        if (master) ramp(master.gain, 0, now() + 0.15)
        stopHum()
      } else if (unlocked) {
        if (master) ramp(master.gain, volume, now() + 0.3)
        hum()
      }
    }

    /* ── 常驻嗡鸣 ─────────────────────────────────────────────────────── */
    function hum() {
      var ctx = ensure()
      if (!ctx || !unlocked || humNodes || !enabled) return
      try {
        var g = ctx.createGain()
        g.gain.value = 0
        var lp = ctx.createBiquadFilter()
        lp.type = 'lowpass'
        lp.frequency.value = 320
        var o1 = ctx.createOscillator()
        o1.type = 'sine'
        o1.frequency.value = 55
        var o2 = ctx.createOscillator()
        o2.type = 'triangle'
        o2.frequency.value = 82.5
        var g2 = ctx.createGain()
        g2.gain.value = 0.28
        /* 极慢的颤音，让嗡鸣不"死" */
        var lfo = ctx.createOscillator()
        lfo.type = 'sine'
        lfo.frequency.value = 0.17
        var lfoG = ctx.createGain()
        lfoG.gain.value = 0.012

        o1.connect(g)
        o2.connect(g2)
        g2.connect(g)
        g.connect(lp)
        lp.connect(master)
        lfo.connect(lfoG)
        lfoG.connect(g.gain)
        o1.start()
        o2.start()
        lfo.start()
        ramp(g.gain, 0.06, now() + 1.6)
        humNodes = { g: g, lp: lp, o1: o1, o2: o2, lfo: lfo }
      } catch (e) { humNodes = null }
    }

    function stopHum() {
      if (!humNodes) return
      var h = humNodes
      humNodes = null
      try {
        var tEnd = now() + 0.35
        ramp(h.g.gain, 0, tEnd)
        setTimeout(function () {
          try { h.o1.stop(); h.o2.stop(); h.lfo.stop() } catch (e) {}
        }, 420)
      } catch (e) {}
    }

    /* 阶段推进时把嗡鸣压低一点，给提示音让路 */
    function duck(amount, holdMs) {
      if (!humNodes) return
      try {
        var g = humNodes.g.gain
        var t0 = now()
        var base = 0.06
        ramp(g, base * (1 - amount), t0 + 0.08)
        setTimeout(function () { if (humNodes) ramp(g, base, now() + 0.5) }, holdMs || 420)
      } catch (e) {}
    }

    /* ── 噪声源 ───────────────────────────────────────────────────────── */
    function noiseBuffer(seconds) {
      var len = Math.max(1, Math.floor(ac.sampleRate * seconds))
      var buf = ac.createBuffer(1, len, ac.sampleRate)
      var data = buf.getChannelData(0)
      for (var i = 0; i < len; i++) data[i] = Math.random() * 2 - 1
      return buf
    }

    /* ── 具体音效 ─────────────────────────────────────────────────────── */
    function power() {
      var ctx = ensure()
      if (!ctx || !unlocked || !enabled) return
      try {
        var t0 = now()
        var o = ctx.createOscillator()
        var g = ctx.createGain()
        o.type = 'sawtooth'
        o.frequency.setValueAtTime(210, t0)
        o.frequency.exponentialRampToValueAtTime(48, t0 + 0.7)
        var lp = ctx.createBiquadFilter()
        lp.type = 'lowpass'
        lp.frequency.setValueAtTime(1400, t0)
        lp.frequency.exponentialRampToValueAtTime(180, t0 + 0.7)
        g.gain.setValueAtTime(0.0001, t0)
        g.gain.exponentialRampToValueAtTime(0.22, t0 + 0.04)
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.85)
        o.connect(lp)
        lp.connect(g)
        g.connect(master)
        o.start(t0)
        o.stop(t0 + 0.9)
        /* 电流咔：极短的高频噪声 */
        var n = ctx.createBufferSource()
        n.buffer = noiseBuffer(0.05)
        var ng = ctx.createGain()
        var hp = ctx.createBiquadFilter()
        hp.type = 'highpass'
        hp.frequency.value = 2200
        ng.gain.setValueAtTime(0.12, t0)
        ng.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.05)
        n.connect(hp)
        hp.connect(ng)
        ng.connect(master)
        n.start(t0)
      } catch (e) {}
    }

    function seek(count) {
      var ctx = ensure()
      if (!ctx || !unlocked || !enabled) return
      var n = Math.max(1, Math.min(12, count || 4))
      var t0 = now() + 0.02
      try {
        for (var i = 0; i < n; i++) {
          var when = t0 + i * rand(0.035, 0.09)
          var src = ctx.createBufferSource()
          src.buffer = noiseBuffer(0.035)
          var bp = ctx.createBiquadFilter()
          bp.type = 'bandpass'
          bp.frequency.value = rand(900, 2600)
          bp.Q.value = rand(4, 9)
          var g = ctx.createGain()
          g.gain.setValueAtTime(0.0001, when)
          g.gain.linearRampToValueAtTime(rand(0.05, 0.12), when + 0.004)
          g.gain.exponentialRampToValueAtTime(0.0001, when + 0.05)
          src.connect(bp)
          bp.connect(g)
          g.connect(master)
          src.start(when)
          src.stop(when + 0.06)
        }
      } catch (e) {}
    }

    function tick(strong) {
      var ctx = ensure()
      if (!ctx || !unlocked || !enabled) return
      try {
        var t0 = now()
        var o = ctx.createOscillator()
        var g = ctx.createGain()
        o.type = 'square'
        o.frequency.value = strong ? 1180 : 1680
        g.gain.setValueAtTime(0.0001, t0)
        g.gain.linearRampToValueAtTime(strong ? 0.035 : 0.018, t0 + 0.002)
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + (strong ? 0.05 : 0.028))
        o.connect(g)
        g.connect(master)
        o.start(t0)
        o.stop(t0 + 0.06)
      } catch (e) {}
    }

    function beep() {
      var ctx = ensure()
      if (!ctx || !unlocked || !enabled) return
      try {
        var t0 = now()
        var pairs = [[880, 0], [660, 0.16]]
        for (var i = 0; i < pairs.length; i++) {
          var when = t0 + pairs[i][1]
          var o = ctx.createOscillator()
          var g = ctx.createGain()
          o.type = 'square'
          o.frequency.value = pairs[i][0]
          g.gain.setValueAtTime(0.0001, when)
          g.gain.linearRampToValueAtTime(0.075, when + 0.008)
          g.gain.exponentialRampToValueAtTime(0.0001, when + 0.14)
          o.connect(g)
          g.connect(master)
          o.start(when)
          o.stop(when + 0.16)
        }
      } catch (e) {}
    }

    function sweep() {
      var ctx = ensure()
      if (!ctx || !unlocked || !enabled) return
      try {
        var t0 = now()
        var o = ctx.createOscillator()
        var g = ctx.createGain()
        o.type = 'triangle'
        o.frequency.setValueAtTime(320, t0)
        o.frequency.exponentialRampToValueAtTime(2400, t0 + 0.26)
        g.gain.setValueAtTime(0.0001, t0)
        g.gain.linearRampToValueAtTime(0.05, t0 + 0.02)
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.3)
        o.connect(g)
        g.connect(master)
        o.start(t0)
        o.stop(t0 + 0.32)
      } catch (e) {}
    }

    function lock() {
      var ctx = ensure()
      if (!ctx || !unlocked || !enabled) return
      try {
        var t0 = now()
        /* 一个五度 + 八度的三音和声钟，尾音长，像机房门禁放行 */
        var notes = [[392, 0, 0.09], [587.33, 0.06, 0.075], [783.99, 0.12, 0.06]]
        for (var i = 0; i < notes.length; i++) {
          var f = notes[i][0], off = notes[i][1], amp = notes[i][2]
          var when = t0 + off
          var o = ctx.createOscillator()
          var g = ctx.createGain()
          o.type = 'sine'
          o.frequency.value = f
          g.gain.setValueAtTime(0.0001, when)
          g.gain.linearRampToValueAtTime(amp, when + 0.012)
          g.gain.exponentialRampToValueAtTime(0.0001, when + 1.15)
          o.connect(g)
          g.connect(master)
          o.start(when)
          o.stop(when + 1.2)
        }
      } catch (e) {}
    }

    function rand(a, b) { return a + Math.random() * (b - a) }

    function destroy() {
      dead = true
      stopHum()
      try {
        if (ac && ac.close) {
          var closing = ac.close()
          if (closing && closing.catch) closing.catch(function () {})
        }
      } catch (e) {}
      ac = null
      master = null
    }

    return {
      unlock: unlock,
      hum: hum,
      duck: duck,
      power: power,
      seek: seek,
      tick: tick,
      beep: beep,
      sweep: sweep,
      lock: lock,
      setVolume: setVolume,
      setEnabled: setEnabled,
      destroy: destroy,
      get ready() { return unlocked },
      get supported() { return !!AudioCtor() }
    }
  }

  global.HDD_AUDIO = { create: create }
})(window)

;
/* ============================================================================
 * HDD 控制台 — 中央仪表（canvas，零依赖）
 * ----------------------------------------------------------------------------
 * 一张 canvas 画五样东西，全部原创：
 *   1) 透视网格      地平线在画面下方 1/3，向上收束，像老式示波器的底噪
 *   2) 六边形环阵列  外环 72 段刻度 + 内环 2 段旋转弧 + 中心脉点
 *   3) 扫描扇区      一条随相位转动的亮扇区，扫过外环时把刻度逐段点亮
 *   4) 十六进制瀑布  底部三列十六进制短串向上漂移
 *   5) 立体声电平     左右各 9 格，随相位/告警跳
 *
 * 对外：window.HDD_INSTRUMENT.create(canvas, { accent, jade, alarm, paper })
 *       句柄 .set({ phase, alert, speed }), .start(), .stop(), .destroy()
 * 任何一步失败都静默降级（画不出来也不影响整段动画）。
 * ========================================================================== */
(function (global) {
  'use strict'

  var TAU = Math.PI * 2
  var DPR_MAX = 2
  var HEX = '0123456789ABCDEF'

  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v }
  function rand(a, b) { return a + Math.random() * (b - a) }

  function create(canvas, opts) {
    opts = opts || {}
    var ctx = canvas.getContext ? canvas.getContext('2d') : null
    if (!ctx) return null

    var C = {
      accent: opts.accent || '#f2a23c',
      jade: opts.jade || '#58d6b0',
      alarm: opts.alarm || '#e4483c',
      paper: opts.paper || '#e9e2d2',
      dim: 'rgba(233,226,210,0.10)',
      dimmer: 'rgba(233,226,210,0.05)'
    }
    var reduced = false
    try {
      reduced = !!(global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches)
    } catch (e) { reduced = false }

    var W = 1, H = 1, dpr = 1
    var raf = 0
    var live = false
    var destroyed = false
    var last = 0
    var t = 0
    var phase = 0
    var alert = 0
    var speed = 1
    var scanA = -Math.PI * 0.5
    var spinA = 0
    var spinB = 0
    var rain = []
    var rainWait = 0
    var resizeTimer = 0
    var shake = 0

    var onResize = function () {
      if (resizeTimer) clearTimeout(resizeTimer)
      resizeTimer = setTimeout(function () { resizeTimer = 0; size() }, 140)
    }
    global.addEventListener('resize', onResize)

    function size() {
      if (destroyed) return
      var rect = canvas.getBoundingClientRect()
      var nw = Math.max(40, Math.round(rect.width || canvas.clientWidth || 400))
      var nh = Math.max(40, Math.round(rect.height || canvas.clientHeight || 260))
      dpr = clamp(global.devicePixelRatio || 1, 1, DPR_MAX)
      W = nw; H = nh
      canvas.width = Math.round(nw * dpr)
      canvas.height = Math.round(nh * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      seedRain()
    }

    function seedRain() {
      rain = []
      var cols = Math.max(2, Math.floor(W / 96))
      for (var i = 0; i < cols; i++) {
        rain.push({
          x: (i + 0.5) * (W / cols) + rand(-6, 6),
          y: rand(0, H),
          v: rand(8, 18),
          rowH: rand(9, 11.5),
          alpha: rand(0.10, 0.22),
          fresh: 0
        })
      }
    }

    /* ── 网格 ─────────────────────────────────────────────────────────── */
    function grid() {
      var horizon = H * 0.62
      ctx.save()
      ctx.strokeStyle = C.dimmer
      ctx.lineWidth = 1
      /* 横线：越靠近地平线越密 */
      for (var i = 1; i <= 7; i++) {
        var y = horizon + Math.pow(i / 7, 1.75) * (H - horizon) * 1.06
        ctx.beginPath()
        ctx.moveTo(0, y)
        ctx.lineTo(W, y)
        ctx.stroke()
      }
      /* 竖线：从消失点（画面中心偏上）向下发散 */
      var vx = W / 2
      var vy = H * 0.18
      for (var j = -7; j <= 7; j++) {
        var x2 = W / 2 + j * W * 0.13
        ctx.beginPath()
        ctx.moveTo(vx, vy)
        ctx.lineTo(x2, H)
        ctx.stroke()
      }
      ctx.restore()
    }

    /* ── 六边形环阵列 ─────────────────────────────────────────────────── */
    function ringArray(cx, cy, R, time) {
      var seg = 72
      var lit = Math.floor(((scanA / TAU) % 1 + 1) % 1 * seg)
      ctx.save()

      /* 外环细线 */
      ctx.strokeStyle = C.dim
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.arc(cx, cy, R, 0, TAU)
      ctx.stroke()

      /* 72 段刻度：每 6 段一根长刻度 */
      for (var i = 0; i < seg; i++) {
        var a = (i / seg) * TAU - Math.PI / 2
        var major = i % 6 === 0
        var active = Math.abs(i - lit) <= 2
        var len = major ? 12 : 6
        var r0 = R - len
        var r1 = R + (major ? 2 : 0)
        var ca = Math.cos(a), sa = Math.sin(a)
        ctx.beginPath()
        ctx.moveTo(cx + ca * r0, cy + sa * r0)
        ctx.lineTo(cx + ca * r1, cy + sa * r1)
        if (active) {
          ctx.strokeStyle = C.accent
          ctx.globalAlpha = 0.85
          ctx.lineWidth = 2
        } else {
          ctx.strokeStyle = major ? 'rgba(233,226,210,0.28)' : C.dim
          ctx.globalAlpha = 1
          ctx.lineWidth = 1
        }
        ctx.stroke()
      }
      ctx.globalAlpha = 1

      /* 内环两段旋转弧（错速反向） */
      ctx.lineWidth = 2
      ctx.strokeStyle = C.paper
      ctx.globalAlpha = 0.55
      ctx.beginPath()
      ctx.arc(cx, cy, R * 0.74, spinA, spinA + Math.PI * 0.62)
      ctx.stroke()
      ctx.globalAlpha = 0.3
      ctx.beginPath()
      ctx.arc(cx, cy, R * 0.66, spinB, spinB + Math.PI * 0.3)
      ctx.stroke()

      /* 内圈虚线环 */
      ctx.globalAlpha = 0.22
      ctx.strokeStyle = C.paper
      ctx.lineWidth = 1
      ctx.setLineDash([2, 7])
      ctx.beginPath()
      ctx.arc(cx, cy, R * 0.5, 0, TAU)
      ctx.stroke()
      ctx.setLineDash([])

      /* 扫描扇区：一条从圆心射出的亮线 + 两侧渐隐 */
      var sweep = ctx.createLinearGradient(
        cx, cy,
        cx + Math.cos(scanA) * R, cy + Math.sin(scanA) * R
      )
      sweep.addColorStop(0, 'rgba(242,162,60,0)')
      sweep.addColorStop(1, alert ? 'rgba(228,72,60,0.75)' : 'rgba(242,162,60,0.7)')
      ctx.globalAlpha = 1
      ctx.strokeStyle = sweep
      ctx.lineWidth = 1.6
      ctx.beginPath()
      ctx.moveTo(cx, cy)
      ctx.lineTo(cx + Math.cos(scanA) * R * 0.98, cy + Math.sin(scanA) * R * 0.98)
      ctx.stroke()

      /* 扇区尾迹 */
      var trail = 0.5
      for (var k = 1; k <= 10; k++) {
        var ta = scanA - (k / 10) * trail
        ctx.globalAlpha = (1 - k / 10) * 0.16
        ctx.beginPath()
        ctx.moveTo(cx, cy)
        ctx.lineTo(cx + Math.cos(ta) * R * 0.96, cy + Math.sin(ta) * R * 0.96)
        ctx.stroke()
      }
      ctx.globalAlpha = 1

      /* 中心脉点：三相呼吸 */
      var beat = 0.5 + 0.5 * Math.sin(time * 3.1)
      var pr = 3 + beat * 2.6
      ctx.fillStyle = alert ? C.alarm : C.accent
      ctx.globalAlpha = 0.9
      ctx.beginPath()
      ctx.arc(cx, cy, pr, 0, TAU)
      ctx.fill()
      ctx.globalAlpha = 0.18 + beat * 0.16
      ctx.beginPath()
      ctx.arc(cx, cy, pr + 6 + beat * 8, 0, TAU)
      ctx.fill()

      /* 四角定位括号 */
      ctx.globalAlpha = 0.4
      ctx.strokeStyle = C.paper
      ctx.lineWidth = 1
      var b = R * 1.16
      var arm = 9
      var corners = [
        [-1, -1], [1, -1], [-1, 1], [1, 1]
      ]
      for (var q = 0; q < 4; q++) {
        var sx = cx + corners[q][0] * b
        var sy = cy + corners[q][1] * b
        ctx.beginPath()
        ctx.moveTo(sx, sy + corners[q][1] * arm)
        ctx.lineTo(sx, sy)
        ctx.lineTo(sx + corners[q][0] * arm, sy)
        ctx.stroke()
      }
      ctx.restore()
    }

    /* ── 十六进制瀑布 ─────────────────────────────────────────────────── */
    function hexrain(dt) {
      ctx.save()
      ctx.font = '9px "Cascadia Mono", Consolas, monospace'
      ctx.textAlign = 'center'
      for (var i = 0; i < rain.length; i++) {
        var c = rain[i]
        c.y -= c.v * dt * speed
        if (c.y < -c.rowH * 3) {
          c.y = H + c.rowH * rand(1, 3)
          c.alpha = rand(0.08, 0.2)
        }
        c.fresh -= dt * 2.4
        for (var r = 0; r < 3; r++) {
          var y = c.y + r * c.rowH
          if (y < -12 || y > H + 12) continue
          var a = c.alpha * (1 - r * 0.28) * (c.fresh > 0 ? 1.5 : 1)
          ctx.fillStyle = r === 0
            ? 'rgba(242,162,60,' + clamp(a * 1.5, 0, 0.5) + ')'
            : 'rgba(233,226,210,' + clamp(a, 0, 0.35) + ')'
          var s = ''
          for (var h = 0; h < 4; h++) s += HEX[(Math.random() * 16) | 0]
          ctx.fillText(s, c.x, y)
        }
      }
      ctx.restore()
    }

    /* ── 立体声电平 ───────────────────────────────────────────────────── */
    function meter(x, y, w, h, value, color, flip) {
      var rows = 9
      var gap = 2
      var cell = (h - gap * (rows - 1)) / rows
      var on = Math.round(value * rows)
      ctx.save()
      for (var i = 0; i < rows; i++) {
        var cy = flip ? y + i * (cell + gap) : y + h - (i + 1) * (cell + gap)
        var active = rows - i <= on
        ctx.fillStyle = active ? color : 'rgba(233,226,210,0.07)'
        ctx.globalAlpha = active ? (0.55 + 0.45 * (i / rows)) : 1
        ctx.fillRect(x, cy, w, cell)
      }
      ctx.restore()
    }

    /* ── 主循环 ───────────────────────────────────────────────────────── */
    function frame(now) {
      if (destroyed || !live) return
      raf = global.requestAnimationFrame(frame)
      if (!last) last = now
      var raw = Math.min(64, now - last)
      last = now
      var dt = (raw / 1000) * (reduced ? 0.35 : 1)
      t += dt

      var spin = dt * speed
      scanA += spin * (alert ? 2.4 : 1.05)
      spinA -= spin * 0.55
      spinB += spin * 0.9
      if (shake > 0) shake = Math.max(0, shake - dt * 3.6)

      ctx.clearRect(0, 0, W, H)
      ctx.save()
      if (shake > 0) {
        ctx.translate(rand(-1, 1) * shake * 5, rand(-1, 1) * shake * 5)
      }

      grid()
      hexrain(dt)

      var cx = W / 2
      var cy = H * 0.46
      var R = Math.min(W * 0.29, H * 0.36)
      ringArray(cx, cy, R, t)

      /* 左右电平：随相位改变底噪，告警时整体抬高 */
      var base = alert ? 0.62 : 0.26
      var lv = clamp(base + Math.sin(t * 2.3) * 0.12 + rand(-0.05, 0.05), 0.05, 1)
      var rv = clamp(base + Math.sin(t * 1.9 + 1.4) * 0.12 + rand(-0.05, 0.05), 0.05, 1)
      var mw = 5
      var mh = Math.min(70, H * 0.24)
      meter(cx - R * 1.36 - mw, cy - mh / 2, mw, mh, lv, alert ? C.alarm : C.jade, false)
      meter(cx + R * 1.36, cy - mh / 2, mw, mh, rv, alert ? C.alarm : C.jade, true)

      ctx.restore()
    }

    function start() {
      if (destroyed || live) return
      live = true
      size()
      last = 0
      raf = global.requestAnimationFrame(frame)
    }

    function stop() {
      live = false
      if (raf) global.cancelAnimationFrame(raf)
      raf = 0
    }

    function destroy() {
      destroyed = true
      stop()
      if (resizeTimer) { clearTimeout(resizeTimer); resizeTimer = 0 }
      global.removeEventListener('resize', onResize)
    }

    return {
      start: start,
      stop: stop,
      destroy: destroy,
      resize: size,
      set: function (next) {
        if (!next) return
        if (typeof next.phase === 'number') phase = next.phase
        if (typeof next.alert === 'boolean') {
          if (next.alert !== alert) shake = next.alert ? 1 : 0
          alert = next.alert
        }
        if (typeof next.speed === 'number') speed = clamp(next.speed, 0.2, 3)
        if (typeof next.accent === 'string') C.accent = next.accent
        if (next.jade) C.jade = next.jade
        if (next.alarm) C.alarm = next.alarm
        if (next.paper) C.paper = next.paper
      },
      /* 一次性冲击：故障时抖一下 */
      kick: function (power) { shake = clamp(power == null ? 1 : power, 0, 2) },
      state: function () { return { live: live, w: W, h: H, alert: alert, phase: phase } }
    }
  }

  global.HDD_INSTRUMENT = { create: create, version: '1.0.0' }
})(window)

;
/* ============================================================================
 * HDD 控制台 — 开机动画运行时（浏览器端，零依赖）
 * ----------------------------------------------------------------------------
 * 原创启动叙事（全部文案、图形、时序均由本文件定义）：
 *
 *   第一幕  电源接入   显像管从一条亮线展开，机箱标牌压印，阵列上电
 *   第二幕  阵列自检   72 段环刻度逐段点亮，磁头寻道的噪声脉冲
 *   第三幕  磁道寻道   扫描扇区加速，遥测爬升，十六进制瀑布加快
 *   第四幕  扇区校验   命中坏道，琥珀警示条 + 切片故障（可交互放行）
 *   第五幕  权限核验   身份卡读数，三音和声钟，指示灯全绿
 *   第六幕  数据贯通   多通道并行灌入，分段进度冲到 100%，白闪收束揭幕
 *
 * 交互：第 4 幕等待「放行 / Enter / 空格」；右上角可跳过，Esc 同理。
 * 对外：window.HDD_API = { replay, skip, finish, dispose, set, config }
 *
 * 保命设计（同上一版思路，但不复用其代码）：
 *   - 代际号：replay 后旧时间线立即失效，不会跟新实例抢 DOM
 *   - 停滞看门狗：任一幕卡住 15s 强制揭幕，绝不留黑屏
 *   - 9s 兜底：脚本压根没跑起来时，宿主注入的兜底会摘掉挂载点
 *   - 所有音频 / canvas 调用都包 try，失败静默降级
 * ========================================================================== */
(function () {
  'use strict'

  if (window.__HDD_BOOT_LOADED__) return
  window.__HDD_BOOT_LOADED__ = true

  var ROOT_ID = 'hdd-root'

  /* ── 桌面端标题栏同步（Windows · Windows Controls Overlay）─────────────────
     DeepSeek Harness Desktop 在 Windows 上用 titleBarOverlay 画最小化/最大化/
     关闭，底色跟随应用主题。于是启动动画播放时右上角会留一块与应用主题同色
     的方块：控制台是深色，那块却是白底黑图标，色差刺眼（见截图）。
     这里把 preload 用来测色的隐藏探针改成完全透明，逼它发出
     setTitleBarOverlay({ color: rgba(0,0,0,0), symbolColor: rgba(0,0,0,0) })：
     overlay 与按钮图标一起消失，启动界面直接透上来，任何一幕都天然无缝。
     探针的 var() 由最近一层声明解析，只改 <html> 上的 token 会被主题层遮蔽，
     所以主路径直改探针自身的内联样式，token 一并改当作双保险。
     揭幕 / 跳过 / 自举失败 / 9 秒兜底一律还原；浏览器与 macOS 下整段空转。 */
  var chromeSync = (function () {
    var CLEAR = 'rgba(0, 0, 0, 0)'
    var VARS = ['--dsw-specific-sidebar-fill', '--dsw-alias-label-primary']
    var MAX_HOLD_MS = 60000          /* 硬上限：万一动画卡住，别把按钮永久藏住 */
    var rootEl = document.documentElement
    var state = { applied: false, probe: null, settledHits: 0 }
    var savedVars = {}
    var retryTimers = []
    var keepAlive = null
    var holdTimer = null

    function isDesktopWin() {
      try {
        var nav = (typeof window !== 'undefined' && window.navigator) ||
          (typeof navigator !== 'undefined' ? navigator : null)
        if (!nav || !/Win/.test(nav.userAgent || '')) return false
        /* 判据不只认协议字符串：桌面端还会在文档上打 data-windows-titlebar
           标记，任一个命中即认为是 Windows 桌面端 */
        var loc = (typeof window !== 'undefined' && window.location) ||
          (typeof location !== 'undefined' ? location : null)
        if (loc && loc.protocol === 'dsh-app:') return true
        var de = document.documentElement
        return !!(de && de.hasAttribute && de.hasAttribute('data-windows-titlebar'))
      } catch (e) { return false }
    }

    /* preload 的探针是 span，内联 background-color 的声明值里带这个 token 名 */
    function findProbe() {
      try {
        if (!document.querySelector) return null
        var el = document.querySelector('span[style*="dsw-specific-sidebar-fill"]')
        if (el) return el
        if (!document.querySelectorAll) return null
        var spans = document.querySelectorAll('span')
        for (var i = 0; i < spans.length; i++) {
          var s = spans[i]
          if (!s.style || typeof s.style.getPropertyValue !== 'function') continue
          var bg = s.style.getPropertyValue('background-color')
          if (bg && bg.indexOf('--dsw-specific-sidebar-fill') !== -1) return s
        }
      } catch (e) { /* 兜底不再抛 */ }
      return null
    }

    /* preload 观察 head 的 childList 与 body 的 style；两条一起打，任一条生效即可 */
    function poke() {
      try {
        if (document.head) {
          var st = document.createElement('style')
          st.setAttribute('data-hdd-chrome-poke', '1')
          st.textContent = '/*hdd-poke*/'
          document.head.appendChild(st)
          if (st.parentNode) st.parentNode.removeChild(st)
        }
      } catch (e) { /* 兜底不再抛 */ }
      try {
        if (document.body && document.body.style) {
          document.body.style.setProperty('--hdd-chrome-poke', String(Date.now() % 1000000))
          document.body.style.removeProperty('--hdd-chrome-poke')
        }
      } catch (e) { /* 兜底不再抛 */ }
    }

    function settled() {
      try {
        var p = state.probe
        if (!p || p.isConnected === false) return false
        if (typeof getComputedStyle !== 'function') return false
        return getComputedStyle(p).backgroundColor === CLEAR
      } catch (e) { return false }
    }

    function apply() {
      try {
        /* 探针可能被应用重挂（主题切换 / 热重载）：缓存节点一旦脱离文档就重找 */
        var probe = state.probe
        if (!probe || probe.isConnected === false) probe = state.probe = findProbe()
        if (probe) {
          probe.style.setProperty('background-color', CLEAR)
          probe.style.setProperty('color', CLEAR)
        }
        if (rootEl) for (var j = 0; j < VARS.length; j++) rootEl.style.setProperty(VARS[j], CLEAR)
        poke()
      } catch (e) { /* 兜底不再抛 */ }
    }

    function stopTimers() {
      for (var r = 0; r < retryTimers.length; r++) clearTimeout(retryTimers[r])
      retryTimers = []
      if (keepAlive) { clearInterval(keepAlive); keepAlive = null }
      if (holdTimer) { clearTimeout(holdTimer); holdTimer = null }
    }

    function hide() {
      if (!isDesktopWin()) return
      try {
        if (!state.applied) {
          state.applied = true
          state.settledHits = 0
          for (var i = 0; i < VARS.length; i++) savedVars[VARS[i]] = rootEl.style.getPropertyValue(VARS[i])
          state.probe = findProbe()
          /* 万一动画卡住不揭幕，到点强制还原，绝不把三个按钮永久藏住 */
          holdTimer = setTimeout(show, MAX_HOLD_MS)
        }
        apply()
        /* defer 注入路径下 splash.js 可能早于 preload 装探针：补打几次 */
        for (var r = 0; r < retryTimers.length; r++) clearTimeout(retryTimers[r])
        retryTimers = []
        var delays = [140, 520, 1400]
        for (var d = 0; d < delays.length; d++) retryTimers.push(setTimeout(apply, delays[d]))
        if (!keepAlive) {
          keepAlive = setInterval(function () {
            if (!state.applied) return
            if (settled()) {
              if (++state.settledHits >= 2) { clearInterval(keepAlive); keepAlive = null }
              return
            }
            state.settledHits = 0
            apply()
          }, 600)
        }
      } catch (e) { /* 兜底不再抛 */ }
    }

    function show() {
      if (!state.applied) return
      state.applied = false
      try {
        stopTimers()
        var probe = state.probe
        if (probe) {
          probe.style.removeProperty('background-color')
          probe.style.removeProperty('color')
        }
        if (rootEl) {
          for (var k = 0; k < VARS.length; k++) {
            if (savedVars[VARS[k]]) rootEl.style.setProperty(VARS[k], savedVars[VARS[k]])
            else rootEl.style.removeProperty(VARS[k])
          }
        }
        poke()
        state.probe = null
        state.settledHits = 0
      } catch (e) { /* 兜底不再抛 */ }
    }

    /* 双保险：无论从哪条路退出（揭幕 / 跳过 / 自举失败 / 9 秒兜底），
       #hdd-root 一被移除就还原标题栏 */
    var observerInstalled = false
    function installObserver() {
      if (observerInstalled) return
      observerInstalled = true
      try {
        if (typeof MutationObserver !== 'function' || !document.body) return
        var mo = new MutationObserver(function (muts) {
          for (var m = 0; m < muts.length; m++) {
            var nodes = muts[m].removedNodes
            for (var n = 0; nodes && n < nodes.length; n++) {
              if (nodes[n] && nodes[n].nodeType === 1 && nodes[n].id === ROOT_ID) { show(); return }
            }
          }
        })
        mo.observe(document.body, { childList: true })
      } catch (e) { /* 兜底不再抛 */ }
    }
    if (document.body) installObserver()
    else if (document.addEventListener) document.addEventListener('DOMContentLoaded', installObserver)

    return { hide: hide, show: show, isDesktopWin: isDesktopWin }
  })()

  /* 排查 / 冒烟测试用的把手：只读开关，不改变插件行为 */
  try { window.__HDD_CHROME__ = chromeSync } catch (e) { /* noop */ }

  /* ── 默认配置 ─────────────────────────────────────────────────────────── */
  var DEFAULTS = {
    enabled: true,
    mode: 'session',            // always | session | daily
    speed: 1,
    requireGate: true,          // 第四幕是否停下等放行
    allowSkip: true,
    sound: true,
    volume: 0.6,
    accent: 'amber',            // amber | jade
    identity: '深度求索',
    station: 'STATION 07',
    build: '1.0.0',
    bootLine: '启动深空检索终端',
    bootLineEn: 'BOOTING DEEP-SPACE RETRIEVAL TERMINAL',
    title: 'HDD',
    subtitle: 'HARD DISK DRIVE CONTROL',
    footer: '深度求索 HARNESS · ORIGINAL BOOT SEQUENCE'
  }

  /* ── 六幕脚本（默认值；可被配置里的 steps 逐项覆盖）────────────────────── */
  var DEFAULT_STEPS = [
    {
      zh: '电源接入',
      en: 'POWER ON SELF TEST',
      sub: '机箱电压稳定 · 显像管预热',
      pct: 8,
      hold: 1150,
      tag: 'POST'
    },
    {
      zh: '阵列自检',
      en: 'DRIVE ARRAY CHECK',
      sub: '四组盘位逐个应答',
      pct: 24,
      hold: 1300,
      tag: 'ARRAY'
    },
    {
      zh: '磁道寻道',
      en: 'TRACK SEEK PROBE',
      sub: '磁头往复寻道，等待最低延迟',
      pct: 42,
      hold: 1300,
      tag: 'SEEK'
    },
    {
      zh: '扇区校验',
      en: 'SECTOR VERIFY',
      sub: '读到不可信扇区，需要人工放行',
      pct: 58,
      hold: 900,
      tag: 'SCAN',
      gate: true,
      alert: true
    },
    {
      zh: '权限核验',
      en: 'OPERATOR CLEARANCE',
      sub: '比对操作员凭据与等级',
      pct: 78,
      hold: 1250,
      tag: 'AUTH'
    },
    {
      zh: '数据贯通',
      en: 'DATA LINK ESTABLISHED',
      sub: '全通道灌入，索引重建完成',
      pct: 100,
      hold: 1150,
      tag: 'LINK'
    }
  ]

  /* 每幕的日志行：[tag, 文本, 语气] —— 语气决定收尾标记 ok / warn / bad */
  var DEFAULT_LOGS = [
    [
      ['POST', '机箱电源接入 · 12.0V / 5.02V 稳定'],
      ['POST', '显像管预热 1200ms · 偏压正常'],
      ['BIOS', '固件签名 4C1E…9A02 校验通过', 'ok'],
      ['BIOS', '内存 32768 KiB · 全量寻址通过', 'ok']
    ],
    [
      ['ARRAY', '盘位 01 应答 · 主轴 7200 RPM'],
      ['ARRAY', '盘位 02 应答 · 主轴 7200 RPM'],
      ['ARRAY', '盘位 03 应答 · 主轴 7200 RPM'],
      ['ARRAY', '盘位 04 应答 · 主轴 7200 RPM', 'ok'],
      ['ARRAY', '四组盘位就绪 · 冗余模式 MIRROR']
    ],
    [
      ['SEEK', '磁头归零 · 柱面 0000 道 00'],
      ['SEEK', '往复寻道 ×64 · 平均 8.2ms'],
      ['SEEK', '伺服校准 · 偏移 +0.03 刻'],
      ['SEEK', '预读缓存 512 KiB 已装填', 'ok']
    ],
    [
      ['SCAN', '顺序扫描 · 起始 LBA 0x00A4F2'],
      ['SCAN', '扇区 0x00A7C1 校验和不符', 'warn'],
      ['SCAN', '重试 3 次 · 仍不可信', 'bad'],
      ['SCAN', '挂起写入，等待人工放行', 'warn']
    ],
    [
      ['AUTH', '读取操作员凭据 · 指纹域'],
      ['AUTH', '比对等级 3 · 允许访问索引'],
      ['AUTH', '签发临时会话令牌 · 有效 900s', 'ok']
    ],
    [
      ['LINK', '建立 8 条并行通道'],
      ['LINK', '灌入索引 1 284 条 · 去重完成'],
      ['LINK', '控制器响应 0.7ms · 链路稳定', 'ok'],
      ['LINK', '控制台移交 · 准备进入主界面', 'ok']
    ]
  ]

  /* ── 配置归一化 ───────────────────────────────────────────────────────── */
  /* 单文件演示重播会重载页面：把用户刚调过的几项落在 sessionStorage 里，重播后不丢 */
  var TWEAK_KEY = 'hdd-boot:tweaks'
  function readTweaks() {
    try { return JSON.parse(sessionStorage.getItem(TWEAK_KEY) || '{}') || {} } catch (e) { return {} }
  }
  function writeTweaks(next) {
    try { sessionStorage.setItem(TWEAK_KEY, JSON.stringify(next)) } catch (e) {}
  }

  function readConfig() {
    var raw = (window.__HDD_CONFIG__ && typeof window.__HDD_CONFIG__ === 'object') ? window.__HDD_CONFIG__ : {}
    var tweaks = readTweaks()
    raw = Object.assign({}, raw, {
      speed: tweaks.speed != null ? tweaks.speed : raw.speed,
      accent: tweaks.accent != null ? tweaks.accent : raw.accent,
      sound: tweaks.sound != null ? tweaks.sound : raw.sound
    })
    var out = {}
    for (var k in DEFAULTS) if (Object.prototype.hasOwnProperty.call(DEFAULTS, k)) out[k] = DEFAULTS[k]
    for (var k2 in raw) {
      if (Object.prototype.hasOwnProperty.call(raw, k2) && raw[k2] !== undefined && raw[k2] !== null) out[k2] = raw[k2]
    }
    out.speed = Math.min(3, Math.max(0.35, Number(out.speed) || 1))
    out.volume = Math.min(1, Math.max(0, Number(out.volume)))
    if (!isFinite(out.volume)) out.volume = DEFAULTS.volume
    out.accent = out.accent === 'jade' ? 'jade' : 'amber'
    /* 文案统一 trim：全空白等于没填，回退默认值，避免左上角标牌变成一片空 */
    function text(v, fallback, max) {
      var s = String(v == null ? '' : v).trim()
      return (s || fallback).slice(0, max)
    }
    out.identity = text(out.identity, DEFAULTS.identity, 24)
    out.station = text(out.station, DEFAULTS.station, 24)
    out.bootLine = text(out.bootLine, DEFAULTS.bootLine, 40)
    out.bootLineEn = text(out.bootLineEn, DEFAULTS.bootLineEn, 64)
    out.title = text(out.title, DEFAULTS.title, 6)
    out.subtitle = text(out.subtitle, DEFAULTS.subtitle, 40)
    out.footer = text(out.footer, DEFAULTS.footer, 64)
    out.requireGate = out.requireGate !== false
    out.allowSkip = out.allowSkip !== false
    out.sound = out.sound !== false
    return out
  }

  var C = readConfig()

  /* ── 用户可改的六幕与日志 ───────────────────────────────────────────────
     下载的人可以在 studio.html 里改每一幕的中文/英文/副标题/进度/停留，
     以及每一幕的日志行。这里做白名单式的归一化：只认已知字段、裁长度、
     夹范围，改坏了也不会把时间线搞崩。gate / alert 属于交互结构，固定跟
     默认值走，不允许用户改——否则第四幕的放行会失配。 */
  function clampNum(v, lo, hi, fallback) {
    var n = Number(v)
    return isFinite(n) ? Math.min(hi, Math.max(lo, n)) : fallback
  }
  function cleanText(v, fallback, max) {
    var t = String(v == null ? '' : v).trim()
    return (t || fallback).slice(0, max)
  }

  function resolveSteps(base, custom) {
    if (!Array.isArray(custom) || !custom.length) return base
    return base.map(function (step, i) {
      var o = custom[i]
      if (!o || typeof o !== 'object') return step
      return {
        zh: cleanText(o.zh, step.zh, 10),
        en: cleanText(o.en, step.en, 40),
        sub: cleanText(o.sub, step.sub, 44),
        pct: clampNum(o.pct, 0, 100, step.pct),
        hold: clampNum(o.hold, 200, 4000, step.hold),
        tag: cleanText(o.tag, step.tag, 8).toUpperCase(),
        gate: !!step.gate,
        alert: !!step.alert
      }
    })
  }

  var TONES = { ok: 1, warn: 1, bad: 1 }
  function resolveLogs(base, custom) {
    if (!Array.isArray(custom) || !custom.length) return base
    return base.map(function (group, i) {
      var g = custom[i]
      if (!Array.isArray(g) || !g.length) return group
      var rows = []
      for (var j = 0; j < g.length && rows.length < 6; j++) {
        var line = g[j]
        if (Array.isArray(line)) {
          var tag = cleanText(line[0], 'LOG', 8)
          var txt = String(line[1] == null ? '' : line[1]).slice(0, 64)
          if (!txt) continue
          rows.push([tag, txt, TONES[line[2]] ? line[2] : undefined])
        } else if (typeof line === 'string' && line.trim()) {
          rows.push(['LOG', line.trim().slice(0, 64), undefined])
        }
      }
      return rows.length ? rows : group
    })
  }

  var STEPS = resolveSteps(DEFAULT_STEPS, C.steps)
  var LOGS = resolveLogs(DEFAULT_LOGS, C.logs)

  /* 自定义配色：只认 6 位十六进制，非法值一律忽略（保持默认主题） */
  var COLOR_VARS = { paper: '--paper', amber: '--amber', jade: '--jade', alarm: '--alarm' }
  function customColors(input) {
    var out = {}
    if (!input || typeof input !== 'object') return out
    Object.keys(COLOR_VARS).forEach(function (key) {
      var v = String(input[key] == null ? '' : input[key]).trim()
      if (/^#[0-9a-fA-F]{6}$/.test(v)) out[COLOR_VARS[key]] = v
    })
    return out
  }

  /* Host 侧的首屏兜底已经判定「这次不播」（未启用 / 本会话已播 / 今日已播）：
     这里不再建 DOM，但仍然暴露 API，方便设置页「立即预览」按需重播。 */
  if (window.__HDD_SKIP__ === true) {
    window.HDD_API = {
      replay: replay,
      skip: noop,
      finish: noop,
      dispose: noop,
      set: noop,
      config: C,
      state: { finished: true, skipped: true, pct: 0, meter: null }
    }
    return
  }

  /* ── 代际与看门狗 ─────────────────────────────────────────────────────── */
  var GEN = (window.__HDD_GEN__ = (window.__HDD_GEN__ || 0) + 1)
  function stale() { return window.__HDD_GEN__ !== GEN }
  function noop() {}

  var STALL_MS = 15000
  var stallTimer = null
  var finished = false
  var skipped = false
  function disarmStall() {
    if (stallTimer) { clearTimeout(stallTimer); stallTimer = null }
  }
  function armStall() {
    disarmStall()
    stallTimer = setTimeout(function () {
      if (finished || stale()) return
      window.__HDD_STALLED__ = true
      finish()
    }, STALL_MS)
  }

  /* ── 小工具 ───────────────────────────────────────────────────────────── */
  function el(tag, cls, text) {
    var n = document.createElement(tag)
    if (cls) n.className = cls
    if (text != null) n.textContent = text
    return n
  }
  function ms(base) { return Math.round(base / C.speed) }
  function wait(base) {
    return new Promise(function (res) {
      if (stale()) return res()
      setTimeout(res, ms(base))
    })
  }
  function pad2(n) { return (n < 10 ? '0' : '') + n }

  /* 打字机：逐字渐显，返回 Promise（打完即 resolve） */
  function typeIn(host, text, step, cls) {
    host.textContent = ''
    host.classList.remove('in')
    var frag = document.createDocumentFragment()
    var spans = []
    for (var i = 0; i < text.length; i++) {
      var s = document.createElement('span')
      s.className = 'ch' + (cls ? ' ' + cls : '')
      s.textContent = text[i]
      s.style.setProperty('--d', Math.round(i * step) + 'ms')
      spans.push(s)
      frag.appendChild(s)
    }
    host.appendChild(frag)
    void host.offsetWidth
    host.classList.add('in')
    return new Promise(function (res) {
      setTimeout(res, ms(Math.max(180, text.length * step + 240)))
    })
  }

  /* ── 音频 ─────────────────────────────────────────────────────────────── */
  var audio = window.HDD_AUDIO ? window.HDD_AUDIO.create({ volume: C.volume, enabled: C.sound }) : null
  function sfx(name) {
    if (!audio) return
    try { audio[name] && audio[name]() } catch (e) {}
  }

  /* ── DOM 搭建 ─────────────────────────────────────────────────────────── */
  var root = document.getElementById(ROOT_ID)
  if (!root) {
    root = el('div')
    root.id = ROOT_ID
    document.body.appendChild(root)
  }
  root.className = 'hdd-root'
  root.style.setProperty('--speed', String(C.speed))
  if (C.accent === 'jade') {
    root.style.setProperty('--amber', '#58d6b0')
    root.style.setProperty('--amber-soft', 'rgba(88,214,176,0.16)')
  }
  /* 自定义配色放在强调色之后：用户显式给的颜色优先 */
  ;(function applyPalette() {
    var palette = customColors(C.colors)
    Object.keys(palette).forEach(function (name) {
      root.style.setProperty(name, palette[name])
      if (name === '--amber') {
        /* 警示条与按钮底色用的是半透明琥珀，跟着主色一起换，否则会脏 */
        var hex = palette[name]
        var r = parseInt(hex.slice(1, 3), 16)
        var g = parseInt(hex.slice(3, 5), 16)
        var b = parseInt(hex.slice(5, 7), 16)
        root.style.setProperty('--amber-soft', 'rgba(' + r + ',' + g + ',' + b + ',0.16)')
      }
    })
  })()

  var MARK_SVG =
    '<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round">' +
      '<path d="M16 3.2 26.4 9v14L16 28.8 5.6 23V9z"/>' +
      '<path d="M16 9.4 21.6 12.7v6.6L16 22.6 10.4 19.3v-6.6z" stroke-opacity=".62"/>' +
      '<path d="M16 13.6v4.8M11.2 16h9.6" stroke-opacity=".9"/>' +
    '</svg>'

  /* DeepSeek 鲸鱼：圆润的身体 + 尾鳍 + 一只眼睛，32×32 线稿 */
  var DEEPSEEK_SVG =
    '<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">' +
      '<path d="M5.6 18.6c0-6.2 5-11.2 11.2-11.2 5.4 0 9.9 3.9 10.9 9l2.3 1.6-3 1.3c-1.2 4-4.9 6.9-9.2 6.9h-5.8c-3.5 0-6.4-2.9-6.4-6.4z"/>' +
      '<path d="M5.6 18.6c-1.6.4-2.9 1.6-3.4 3.2 1.9.3 3.7-.2 5.1-1.4" stroke-opacity=".75"/>' +
      '<circle cx="21.2" cy="14.4" r="1.15" fill="currentColor" stroke="none"/>' +
      '<path d="M9.4 22.4c1.6 1.2 3.6 1.9 5.7 1.9" stroke-opacity=".45"/>' +
    '</svg>'

  var slices = ''
  for (var si = 0; si < 12; si++) {
    slices += '<i style="top:' + (si * 8.3333).toFixed(3) + '%;animation-delay:' + (si * 17) + 'ms"></i>'
  }

  root.innerHTML = [
    '<div class="hdd-case">',
      '<div class="hdd-screen">',
        '<div class="hdd-ui">',
          '<div class="hdd-top">',
            '<div class="hdd-id">',
              '<div class="hdd-mark">' + MARK_SVG + '</div>',
              '<div class="hdd-ds" title="深度求索">' + DEEPSEEK_SVG + '</div>',
              '<div class="hdd-dsname">DeepSeek</div>',
              '<div class="hdd-idtext">',
                '<div class="hdd-idname"></div>',
                '<div class="hdd-idsub"></div>',
              '</div>',
            '</div>',
            '<div class="hdd-topright">',
              '<div class="hdd-leds">',
                '<div class="hdd-led" data-led="power"><i></i>PWR</div>',
                '<div class="hdd-led" data-led="array"><i></i>ARR</div>',
                '<div class="hdd-led warn" data-led="link"><i></i>LNK</div>',
              '</div>',
              '<div class="hdd-clock"><b></b><span></span></div>',
            '</div>',
          '</div>',
          '<div class="hdd-body">',
            '<div class="hdd-logpane">',
              '<div class="hdd-panetitle">BOOT LOG</div>',
              '<div class="hdd-log"></div>',
            '</div>',
            '<div class="hdd-stage">',
              '<div class="hdd-scope">',
                '<canvas></canvas>',
                '<div class="hdd-scope-ticks"></div>',
              '</div>',
              '<div class="hdd-readout">',
                '<div class="hdd-zh"></div>',
                '<div class="hdd-en"></div>',
              '</div>',
              '<div class="hdd-sub"></div>',
              '<div class="hdd-alert"><i></i>UNTRUSTED SECTOR · 需人工放行</div>',
              '<div class="hdd-action">',
                '<button class="hdd-btn" type="button"><span class="hdd-btn-zh"></span><span>▸</span></button>',
                '<div class="hdd-hint">按 Enter / 空格，或点击按钮放行</div>',
              '</div>',
            '</div>',
            '<div class="hdd-telemetry">',
              '<div class="hdd-panetitle">TELEMETRY</div>',
              '<div class="hdd-meter"><div class="hdd-meter-head"><span>THROUGHPUT</span><b data-read="thr">0 KB/s</b></div><div class="hdd-meter-bar"><i style="width:6%"></i></div></div>',
              '<div class="hdd-meter"><div class="hdd-meter-head"><span>HEAD TEMP</span><b data-read="tmp">--.-°C</b></div><div class="hdd-meter-bar amber"><i style="width:10%"></i></div></div>',
              '<div class="hdd-meter"><div class="hdd-meter-head"><span>SIGNAL</span><b data-read="sig">-- dB</b></div><div class="hdd-meter-bar"><i style="width:8%"></i></div></div>',
              '<div class="hdd-hex"></div>',
            '</div>',
          '</div>',
          '<div class="hdd-bottom">',
            '<div class="hdd-progress">',
              '<div class="hdd-segs"></div>',
              '<div class="hdd-pct"><b>000</b><span>%</span></div>',
            '</div>',
            '<div class="hdd-foot">',
              '<div class="l"><span data-foot="state">STANDBY</span><span data-foot="io">I/O 0.0 MB/s</span></div>',
              '<div class="r"><span data-foot="build"></span><span class="hdd-skip">SKIP ▸</span></div>',
            '</div>',
          '</div>',
        '</div>',
        '<div class="hdd-scanlines"></div>',
        '<div class="hdd-roll"></div>',
        '<div class="hdd-noise"></div>',
        '<div class="hdd-vignette"></div>',
        '<div class="hdd-curve"></div>',
        '<div class="hdd-glitch-slices">' + slices + '</div>',
        '<div class="hdd-outro"></div>',
      '</div>',
    '</div>'
  ].join('')

  var q = function (sel) { return root.querySelector(sel) }
  var qAll = function (sel) { return root.querySelectorAll(sel) }
  var ui = {
    name: q('.hdd-idname'),
    sub: q('.hdd-idsub'),
    clockB: q('.hdd-clock b'),
    clockS: q('.hdd-clock span'),
    leds: {
      power: q('[data-led="power"]'),
      array: q('[data-led="array"]'),
      link: q('[data-led="link"]')
    },
    log: q('.hdd-log'),
    scope: q('.hdd-scope canvas'),
    zh: q('.hdd-zh'),
    en: q('.hdd-en'),
    subline: q('.hdd-sub'),
    alert: q('.hdd-alert'),
    action: q('.hdd-action'),
    btn: q('.hdd-btn'),
    btnZh: q('.hdd-btn-zh'),
    segs: q('.hdd-segs'),
    pct: q('.hdd-pct b'),
    hex: q('.hdd-hex'),
    thr: q('[data-read="thr"]'),
    tmp: q('[data-read="tmp"]'),
    sig: q('[data-read="sig"]'),
    barThr: q('.hdd-meter-bar i'),
    barTmp: q('.hdd-meter-bar.amber i'),
    barSig: qAll('.hdd-meter-bar')[2] ? qAll('.hdd-meter-bar')[2].querySelector('i') : null,
    state: q('[data-foot="state"]'),
    io: q('[data-foot="io"]'),
    build: q('[data-foot="build"]'),
    skip: q('.hdd-skip')
  }

  /* 静态文案 */
  ui.name.textContent = C.identity
  ui.sub.textContent = C.title + ' · ' + C.subtitle
  ui.build.textContent = C.station + ' / BUILD ' + C.build
  ui.btnZh.textContent = '放行并继续'
  ui.btn.setAttribute('aria-label', '放行并继续')
  if (!C.allowSkip) ui.skip.hidden = true
  else ui.skip.hidden = false

  /* 进度分段 */
  var SEG_TOTAL = 56
  var segNodes = []
  for (var sgi = 0; sgi < SEG_TOTAL; sgi++) {
    var sg = document.createElement('i')
    ui.segs.appendChild(sg)
    segNodes.push(sg)
  }
  var pctNow = 0
  var pctTarget = 0
  var pctTimer = null
  function paintProgress() {
    var lit = Math.round((pctNow / 100) * SEG_TOTAL)
    for (var i = 0; i < SEG_TOTAL; i++) {
      var on = i < lit
      segNodes[i].classList.toggle('on', on)
      segNodes[i].classList.toggle('head', i === lit - 1 && lit > 0 && lit < SEG_TOTAL)
    }
    ui.pct.textContent = String(Math.round(pctNow)).padStart(3, '0')
  }
  function setPct(v) {
    pctTarget = Math.max(0, Math.min(100, v))
    if (pctTimer) return
    /* 进度不是跳变，而是每帧向目标追一点，读起来像真的在灌数据 */
    var tick = function () {
      var diff = pctTarget - pctNow
      if (Math.abs(diff) < 0.35) {
        pctNow = pctTarget
        paintProgress()
        pctTimer = null
        return
      }
      pctNow += diff * 0.16
      paintProgress()
      pctTimer = setTimeout(tick, 28)
    }
    tick()
  }

  /* 顶部时钟 */
  var clockTimer = null
  function loadDate() {
    var d = new Date()
    var t = pad2(d.getHours()) + ':' + pad2(d.getMinutes()) + ':' + pad2(d.getSeconds())
    ui.clockB.textContent = t
    ui.clockS.textContent = '· ' + pad2(d.getMonth() + 1) + '.' + pad2(d.getDate())
  }
  function startClock() {
    loadDate()
    if (clockTimer) clearInterval(clockTimer)
    clockTimer = setInterval(loadDate, 1000)
  }

  /* 遥测数值：轻微抖动，告警时整体抬高 */
  var telemetryTimer = null
  var telemetryBoost = 0
  function startTelemetry() {
    if (telemetryTimer) return
    telemetryTimer = setInterval(function () {
      var boost = telemetryBoost
      var thr = Math.round(1180 + Math.random() * 420 + boost * 3400)
      var tmp = (36.5 + Math.random() * 2.2 + boost * 7).toFixed(1)
      var sig = Math.round(22 + Math.random() * 6 - boost * 9)
      ui.thr.textContent = thr.toLocaleString('en-US') + ' KB/s'
      ui.tmp.textContent = tmp + '°C'
      ui.sig.textContent = sig + ' dB'
      ui.barThr.style.width = Math.min(100, 18 + (thr / 5200) * 82) + '%'
      ui.barTmp.style.width = Math.min(100, 22 + (Number(tmp) - 34) * 6) + '%'
      ui.barSig.style.width = Math.min(100, 14 + (sig / 30) * 80) + '%'
      ui.io.textContent = 'I/O ' + (thr / 1024).toFixed(1) + ' MB/s'
    }, 190)
  }

  /* 十六进制瀑布 */
  var hexTimer = null
  var HEX = '0123456789ABCDEF'
  function hexRow() {
    var out = ''
    for (var i = 0; i < 4; i++) {
      for (var j = 0; j < 4; j++) out += HEX[(Math.random() * 16) | 0]
      if (i < 3) out += ' '
    }
    return out
  }
  function startHex() {
    if (hexTimer) return
    var push = function () {
      var row = document.createElement('div')
      row.className = 'row fresh'
      var a = hexRow()
      var b = ((Math.random() * 0xffff) | 0).toString(16).toUpperCase()
      row.innerHTML = '<span>' + a + '</span><b>' + ('0000' + b).slice(-4) + '</b>'
      ui.hex.appendChild(row)
      if (ui.hex.children.length > 12) ui.hex.removeChild(ui.hex.firstChild)
      setTimeout(function () { row.classList.remove('fresh') }, 540)
      hexTimer = setTimeout(push, 240 + Math.random() * 180)
    }
    push()
  }

  /* ── 日志 ─────────────────────────────────────────────────────────────── */
  var bootSeconds = 0
  function stamp() {
    var base = 7 * 3600 + 12 * 60 + 44
    var t = base + Math.round(bootSeconds)
    bootSeconds += 0.42 + Math.random() * 0.5
    return pad2(Math.floor(t / 3600)) + ':' + pad2(Math.floor((t % 3600) / 60)) + ':' + pad2(t % 60)
  }

  /* 一条日志：打出正文，停顿后补状态点，返回 Promise */
  function logLine(tag, text, tone) {
    var row = el('div', 'hdd-logline' + (tone ? ' ' + tone : ''))
    var t = el('span', 't', stamp())
    var g = el('span', 'tag', tag)
    var x = el('span', 'x')
    row.appendChild(t); row.appendChild(g); row.appendChild(x)
    ui.log.appendChild(row)
    while (ui.log.children.length > 12) ui.log.removeChild(ui.log.firstChild)

    return new Promise(function (res) {
      var i = 0
      var tick = function () {
        if (stale()) return res()
        if (i >= text.length) {
          if (tone) {
            var dot = el('span', 'dot')
            row.insertBefore(dot, x)
          }
          setTimeout(res, ms(60))
          return
        }
        x.textContent = text.slice(0, ++i)
        if (audio && i % 3 === 0) { try { audio.tick(false) } catch (e) {} }
        setTimeout(tick, ms(8))
      }
      tick()
    })
  }

  /* 并行打多条日志，全部完成后 resolve */
  function logGroup(lines, gapMs) {
    var chain = Promise.resolve()
    lines.forEach(function (item) {
      chain = chain.then(function () {
        if (stale() || finished) return
        return logLine(item[0], item[1], item[2])
      }).then(function () {
        return gapMs ? wait(gapMs) : null
      })
    })
    return chain
  }

  /* ── 仪表 ─────────────────────────────────────────────────────────────── */
  var meter = window.HDD_INSTRUMENT ? window.HDD_INSTRUMENT.create(ui.scope, {
    /* 仪表里的扫描扇区/脉点要跟自定义主色一致，不能还用默认琥珀 */
    accent: customColors(C.colors)['--amber'] || (C.accent === 'jade' ? '#58d6b0' : '#f2a23c')
  }) : null

  /* ── 状态切换 ─────────────────────────────────────────────────────────── */
  function setReadout(step) {
    ui.subline.textContent = step.sub || ''
    var a = typeIn(ui.zh, step.zh, 90)
    var b = typeIn(ui.en, step.en, 26)
    ui.alert.classList.toggle('on', !!step.alert)
    if (meter) meter.set({ alert: !!step.alert, phase: STEPS.indexOf(step) })
    return Promise.all([a, b])
  }

  function setLed(name, on) {
    var n = ui.leds[name]
    if (n) n.classList.toggle('on', !!on)
  }

  function setState(text) {
    if (ui.state) ui.state.textContent = text
  }

  /* ── 交互 ─────────────────────────────────────────────────────────────── */
  var gateResolve = null
  var gateCleanup = null
  function openGate() {
    /* 等用户放行时把看门狗下弦：人可能正在读日志，不能 15 秒把人踢出去 */
    disarmStall()
    ui.action.classList.add('on')
    ui.btn.classList.remove('pulse')
    return new Promise(function (res) {
      gateResolve = function () {
        if (!gateResolve) return
        gateResolve = null
        ui.action.classList.remove('on')
        res()
      }
      var onKey = function (e) {
        if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') {
          e.preventDefault()
          done()
        }
      }
      var done = function () {
        document.removeEventListener('keydown', onKey, true)
        ui.btn.removeEventListener('click', done)
        gateCleanup = null
        if (gateResolve) gateResolve()
      }
      gateCleanup = done
      document.addEventListener('keydown', onKey, true)
      ui.btn.addEventListener('click', done)
    })
  }
  function releaseGate() {
    if (gateCleanup) { try { gateCleanup() } catch (e) {} }
    if (gateResolve) gateResolve()
  }

  /* ── 时间线 ───────────────────────────────────────────────────────────── */
  function run() {
    window.__HDD_RUNNING__ = true
    /* 第一幕就是深色：先把桌面端标题栏整层透明化，按钮与色块一并消失 */
    chromeSync.hide()
    armStall()
    startClock()
    startTelemetry()
    setPct(2)
    return Promise.resolve()
      /* 第一幕：上电 */
      .then(function () {
        root.classList.add('hdd-power')
        sfx('power')
        return wait(120)
      })
      .then(function () {
        if (audio) { try { audio.unlock() } catch (e) {} }
        setState('POWER ON')
        setReadout(STEPS[0])
        setPct(STEPS[0].pct)
        setLed('power', true)
        startHex()
        if (meter) meter.start()
        return logGroup(LOGS[0], 30)
      })
      .then(function () {
        setState('ARRAY CHECK')
        setReadout(STEPS[1])
        setPct(STEPS[1].pct)
        setLed('array', true)
        sfx('seek')
        if (audio) { try { audio.seek(5) } catch (e) {} }
        return logGroup(LOGS[1], 40)
      })
      /* 第三幕：寻道，日志与仪表同时加速 */
      .then(function () {
        setState('SEEK')
        setReadout(STEPS[2])
        setPct(STEPS[2].pct)
        sfx('sweep')
        if (audio) { try { audio.seek(8) } catch (e) {} }
        if (meter) meter.kick(0.5)
        return logGroup(LOGS[2], 50)
      })
      /* 第四幕：坏道 + 故障 + 放行 */
      .then(function () {
        setState('SECTOR ALERT')
        telemetryBoost = 1
        setReadout(STEPS[3])
        root.classList.add('hdd-glitch')
        sfx('beep')
        if (meter) meter.kick(1.6)
        return logGroup(LOGS[3], 60).then(function () {
          setTimeout(function () { root.classList.remove('hdd-glitch') }, ms(560))
          setState('AWAITING OPERATOR')
          /* 这一步等用户；关掉 requireGate 就自己往下走 */
          if (C.requireGate) return openGate()
          return wait(900)
        })
      })
      .then(function () {
        return releaseGate()
      })
      .then(function () {
        disarmStall()
        telemetryBoost = 0
        root.classList.remove('hdd-glitch')
        setState('CLEARANCE')
        setReadout(STEPS[4])
        setPct(STEPS[4].pct)
        sfx('lock')
        return logGroup(LOGS[4], 60).then(function () { return wait(700) })
      })
      .then(function () {
        setState('LINK UP')
        setReadout(STEPS[5])
        setPct(STEPS[5].pct)
        setLed('link', true)
        if (meter) { meter.kick(0.7); meter.set({ alert: false }) }
        sfx('sweep')
        return logGroup(LOGS[5], 70)
      })
      /* 让「数据贯通」这一拍多停一会儿：白闪和日志并行，日志打完再收束 */
      .then(function () {
        if (stale() || finished) return
        setState('HANDOFF')
        setPct(100)
        root.classList.add('hdd-outro-run')
        if (meter) meter.kick(1.2)
        return wait(520)
      })
      .then(function () {
        return wait(900)
      })
      .then(function () {
        if (stale() || finished) return
        root.classList.add('hdd-handoff')
        return wait(760)
      })
      .then(function () { finish() })
      .catch(function () { finish() })
  }

  /* ── 收尾 ─────────────────────────────────────────────────────────────── */
  function releaseLocks() {
    try {
      document.documentElement.classList.remove('hdd-lock')
      document.documentElement.style.overflow = ''
      if (document.body) document.body.style.overflow = ''
    } catch (e) {}
  }

  function finish() {
    if (finished) return
    finished = true
    window.__HDD_FINISHED__ = true
    disarmStall()
    /* 揭幕即还原桌面端标题栏（root 被移除时 MutationObserver 还会再兜一次） */
    chromeSync.show()
    releaseGate()
    if (pctTimer) { clearTimeout(pctTimer); pctTimer = null }
    if (clockTimer) { clearInterval(clockTimer); clockTimer = null }
    if (telemetryTimer) { clearInterval(telemetryTimer); telemetryTimer = null }
    if (hexTimer) { clearTimeout(hexTimer); hexTimer = null }
    if (meter) { try { meter.stop(); meter.destroy() } catch (e) {} }
    if (audio) {
      try { audio.setEnabled(false) } catch (e) {}
      var au = audio
      audio = null
      setTimeout(function () { try { au.destroy() } catch (e) {} }, 500)
    }
    releaseLocks()
    try {
      if (C.mode === 'session') window.sessionStorage.setItem('hdd-console:shown', '1')
      if (C.mode === 'daily') window.localStorage.setItem('hdd-console:day', new Date().toISOString().slice(0, 10))
    } catch (e) {}
    root.classList.remove('hdd-boot')
    root.classList.add('hdd-gone')
    setTimeout(function () {
      if (root && root.parentNode) root.parentNode.removeChild(root)
      try { window.dispatchEvent(new CustomEvent('hdd-boot:done')) } catch (e) {}
    }, ms(760))
  }

  function requestSkip() {
    if (skipped || finished) return
    skipped = true
    releaseGate()
    finish()
  }

  var escHandler = null
  if (C.allowSkip) {
    ui.skip.addEventListener('click', function (e) { e.stopPropagation(); requestSkip() })
    escHandler = function (e) { if (e.key === 'Escape') requestSkip() }
    document.addEventListener('keydown', escHandler)
  }

  /* ── 对外 API ─────────────────────────────────────────────────────────── */
  function dispose() {
    finished = true
    disarmStall()
    try { chromeSync.show() } catch (e) { /* noop */ }
    if (escHandler) document.removeEventListener('keydown', escHandler)
    releaseGate()
    if (pctTimer) { clearTimeout(pctTimer); pctTimer = null }
    if (clockTimer) { clearInterval(clockTimer); clockTimer = null }
    if (telemetryTimer) { clearInterval(telemetryTimer); telemetryTimer = null }
    if (hexTimer) { clearTimeout(hexTimer); hexTimer = null }
    if (meter) { try { meter.destroy() } catch (e) {} }
    if (audio) { try { audio.destroy() } catch (e) {} }
    releaseLocks()
    try {
      var r = document.getElementById(ROOT_ID)
      if (r && r.parentNode) r.parentNode.removeChild(r)
    } catch (e) {}
  }

  function replay() {
    var prev = window.HDD_API
    if (prev && prev.dispose && prev.dispose !== noop) {
      try { prev.dispose() } catch (e) {}
    }
    window.__HDD_BOOT_LOADED__ = false
    /* 手动重播要清掉 Host 的「这次不播」判定，否则重挂的脚本会立刻再退一次 */
    window.__HDD_SKIP__ = false
    window.__HDD_BOOT_OFF__ = null
    var old = document.getElementById(ROOT_ID)
    if (old && old.parentNode) old.parentNode.removeChild(old)
    try { sessionStorage.removeItem('hdd-console:shown') } catch (e) {}
    var src = window.__HDD_SCRIPT_URL__ || '/hdd-console/splash.js?t=' + Date.now()
    /* 单文件演示没有独立脚本可重挂，直接重载页面，观感一致 */
    if (src === 'about:blank#reload' || src === '#reload') { try { location.reload() } catch (e) {} return }
    var s = document.createElement('script')
    s.src = src
    document.head.appendChild(s)
  }

  window.HDD_API = {
    replay: replay,
    skip: requestSkip,
    finish: finish,
    dispose: dispose,
    set: function (next) {
      if (!next) return
      if (next.sound != null && audio) audio.setEnabled(!!next.sound)
      if (next.volume != null && audio) audio.setVolume(Number(next.volume))
      if (next.accent && next.accent !== C.accent) {
        C.accent = next.accent === 'jade' ? 'jade' : 'amber'
        var amber = C.accent === 'jade' ? '#58d6b0' : '#f2a23c'
        var soft = C.accent === 'jade' ? 'rgba(88,214,176,0.16)' : 'rgba(242,162,60,0.16)'
        root.style.setProperty('--amber', amber)
        root.style.setProperty('--amber-soft', soft)
        if (meter) meter.set({ accent: amber, jade: C.accent === 'jade' ? '#f2a23c' : '#58d6b0' })
      }
      if (next.speed != null) {
        C.speed = Math.min(3, Math.max(0.35, Number(next.speed) || 1))
        root.style.setProperty('--speed', String(C.speed))
      }
      writeTweaks({ speed: C.speed, accent: C.accent, sound: C.sound })
    },
    config: C,
    get state() {
      return { finished: finished, skipped: skipped, pct: pctNow, meter: meter ? meter.state() : null }
    }
  }

  /* 音频解锁：一次用户手势后整段都可发声 */
  var unlockOnce = function () {
    if (audio) { try { audio.unlock() } catch (e) {} }
    document.removeEventListener('pointerdown', unlockOnce, true)
    document.removeEventListener('keydown', unlockOnce, true)
  }
  document.addEventListener('pointerdown', unlockOnce, true)
  document.addEventListener('keydown', unlockOnce, true)

  /* 锁滚动 */
  document.documentElement.classList.add('hdd-lock')
  document.documentElement.style.overflow = 'hidden'
  if (document.body) document.body.style.overflow = 'hidden'
  root.classList.remove('hdd-boot')

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', run)
  } else {
    run()
  }
})()

