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
