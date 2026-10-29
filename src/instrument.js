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
      /* 减少动态效果时把雨滴列数砍半，降低 canvas 每帧绘制量 */
      if (reduced) cols = Math.max(2, Math.floor(cols * 0.5))
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
    var lastPaint = 0
    function frame(now) {
      if (destroyed || !live) return
      raf = global.requestAnimationFrame(frame)
      /* 页面不可见时不画（浏览器已节流，这里直接跳过省电） */
      if (global.document && global.document.hidden) return
      /* 减少动态效果时限制到 30fps：视觉几乎无差别，功耗明显低 */
      if (reduced && now - lastPaint < 33) return
      lastPaint = now
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
