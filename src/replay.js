/* 源码预览页的重播桩：boot.js 的 replay() 会往 head 里重挂 __HDD_SCRIPT_URL__，
   预览页把该地址指到这里；真正的工作是重新加载同级目录下的三个运行时脚本。
   这样改 src/ 之后点「重播」就能看到新代码，而不必手动刷新。 */
;(function () {
  'use strict'
  /* 相对路径以本脚本所在目录为基准会算错，这里显式写 ../src/ */
  var srcs = ['../src/audio.js', '../src/instrument.js', '../src/boot.js']
  var i = 0
  function next() {
    if (i >= srcs.length) return
    var s = document.createElement('script')
    s.src = srcs[i++] + '?t=' + Date.now()
    s.onload = next
    s.onerror = next
    document.head.appendChild(s)
  }
  next()
})()