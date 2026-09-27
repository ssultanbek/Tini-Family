/* Small story animations: the survey stats, "what an agent can reach", the measured line,
   the safety attempt run and the "who sees what" matrix. Each starts when scrolled into view,
   loops only while visible, and shows its final state under reduced motion. */
(function () {
  "use strict";
  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  /* Count-up for [data-count] inside an element */
  function countUp(el) {
    $$("[data-count]", el).forEach(function (n) {
      var to = +n.dataset.count;
      if (reduce.matches) { n.textContent = to; return; }
      var t0 = performance.now(), dur = 1300;
      n.textContent = "0";
      (function tick(now) {
        var p = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - p, 3);
        n.textContent = Math.round(to * e);
        if (p < 1) requestAnimationFrame(tick);
      })(t0);
    });
  }

  /* Run fn once when el is first seen */
  function once(el, fn) {
    if (!el) return;
    if (!("IntersectionObserver" in window)) { fn(); return; }
    var io = new IntersectionObserver(function (es) {
      if (es[0].isIntersecting) { io.disconnect(); fn(); }
    }, { rootMargin: "0px 0px -15% 0px" });
    io.observe(el);
  }

  /* A timeline that loops while the element is visible and the tab is shown */
  function looper(el, steps, finalState) {
    var i = 0, timer = 0, visible = false;
    function run() {
      clearTimeout(timer);
      if (!visible || document.hidden || reduce.matches) return;
      var s = steps[i];
      s[0]();
      i = (i + 1) % steps.length;
      timer = setTimeout(run, s[1]);
    }
    function start() { if (reduce.matches) { finalState(); return; } run(); }
    if ("IntersectionObserver" in window) {
      new IntersectionObserver(function (es) {
        var was = visible;
        visible = es[0].isIntersecting;
        if (visible && !was) start(); else if (!visible) clearTimeout(timer);
      }, { rootMargin: "0px 0px -10% 0px" }).observe(el);
    } else { visible = true; start(); }
    document.addEventListener("visibilitychange", function () { if (!document.hidden && visible) run(); else clearTimeout(timer); });
    reduce.addEventListener && reduce.addEventListener("change", function () { clearTimeout(timer); if (reduce.matches) finalState(); else run(); });
    if (reduce.matches) finalState();
  }

  /* ---------- A: stats ---------- */
  var stats = $('[data-anim="stats"]');
  once(stats, function () { stats.classList.add("is-playing"); countUp(stats); });

  /* ---------- D: measured line ---------- */
  var measure = $('[data-anim="measure"]');
  once(measure, function () { countUp(measure); });

  /* ---------- B: what an agent can reach ---------- */
  var reach = $('[data-anim="reach"]');
  if (reach) {
    var screen = $(".screen", reach), cursor = $(".agent-cursor", reach);
    var job = $("li.job", reach), hot = $$("li.hot", reach);
    function moveTo(li) {
      var sr = screen.getBoundingClientRect(), r = li.getBoundingClientRect();
      var x = r.left - sr.left + Math.min(r.width - 40, 150), y = r.top - sr.top + r.height / 2 - 6;
      cursor.style.transform = "translate(" + x + "px," + y + "px)";
    }
    var steps = [[function () { hot.forEach(function (li) { li.classList.remove("lit"); }); cursor.style.opacity = "1"; moveTo(job); }, 1400]];
    hot.forEach(function (li) {
      steps.push([function () { moveTo(li); }, 750]);
      steps.push([function () { li.classList.add("lit"); }, 650]);
    });
    steps.push([function () { moveTo(job); }, 2600]);
    looper(reach, steps, function () { hot.forEach(function (li) { li.classList.add("lit"); }); cursor.style.opacity = "0"; });
    window.addEventListener("resize", function () { moveTo(job); });
  }

  /* ---------- Safety: the attempt run ---------- */
  var at = $('[data-anim="attempt"]');
  if (at) {
    var t1 = $(".t1", at), t2 = $(".t2", at), t3 = $(".t3", at);
    var rows = $$(".lrow");
    var hoverRing = 0;
    // points in % of the 360 box: centre, photo in ring 1, stop at ring 2, stop at ring 3
    var C = [50, 50], PHOTO = [37.5, 45.5], R2 = [72.4, 71.5], R3 = [82.6, 81.4];
    function place(t, p, show) { t.style.left = p[0] + "%"; t.style.top = p[1] + "%"; if (show != null) t.style.opacity = show ? "1" : "0"; }
    function ring(n) {
      at.classList.remove("on-1", "on-2", "on-3");
      var k = hoverRing || n;
      if (k) at.classList.add("on-" + k);
      rows.forEach(function (r) { r.classList.toggle("is-on", +r.dataset.ring === k); });
    }
    function reset() {
      [t1, t2, t3].forEach(function (t) { t.style.transition = "none"; place(t, C, false); t.classList.remove("done"); t.offsetWidth; t.style.transition = ""; });
      at.classList.remove("spark-on", "tested", "pass-2"); ring(0);
    }
    var steps = [
      [reset, 400],
      [function () { t1.style.opacity = "1"; }, 60],
      [function () { place(t1, PHOTO); }, 950],
      [function () { t1.classList.add("done"); ring(1); }, 1500],
      [function () { t1.style.opacity = "0"; ring(0); t2.style.opacity = "1"; }, 60],
      [function () { place(t2, R2); }, 950],
      [function () { t2.classList.add("done"); at.classList.add("spark-on"); ring(2); }, 1700],
      [function () { t2.style.opacity = "0"; at.classList.remove("spark-on"); ring(0); t3.style.opacity = "1"; }, 60],
      [function () { place(t3, R2); }, 800],
      [function () { at.classList.add("pass-2"); place(t3, R3); }, 800],
      [function () { at.classList.remove("pass-2"); t3.classList.add("done"); at.classList.add("tested"); ring(3); }, 2600],
      [function () { t3.style.opacity = "0"; at.classList.remove("tested"); ring(0); }, 700],
    ];
    function finalState() {
      [t1, t2, t3].forEach(function (t) { t.style.transition = "none"; t.classList.add("done"); t.style.opacity = "1"; });
      place(t1, PHOTO); place(t2, R2); place(t3, R3);
      at.classList.add("spark-on", "tested");
      ring(0);
    }
    looper(at, steps, finalState);
    rows.forEach(function (r) {
      function on() { hoverRing = +r.dataset.ring; ring(0); }
      function off() { hoverRing = 0; ring(0); }
      r.addEventListener("mouseenter", on); r.addEventListener("mouseleave", off);
      r.addEventListener("focus", on); r.addEventListener("blur", off);
    });
  }

  /* ---------- Privacy matrix ---------- */
  var mx = $('[data-anim="matrix"]');
  if (mx) {
    $$(".cellv", mx).forEach(function (c, i) {
      c.style.transitionDelay = reduce.matches ? "0ms" : (i * 140) + "ms";
      $$(".draw", c).forEach(function (d) { d.setAttribute("pathLength", "1"); d.style.transitionDelay = (i * 140 + 150) + "ms"; });
    });
    once(mx, function () { mx.classList.add("is-playing"); });
  }
})();
