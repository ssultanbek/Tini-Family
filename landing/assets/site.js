/* Tini Family landing: scene players, scroll story, reveal-on-scroll, mobile menu.
   The 3D module (scene.js) swaps in its own renderer through window.TiniSite.useRenderer(). */
(function () {
  "use strict";

  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
  var SVG = window.TiniSVG;

  /* ---------- Chips over the stage ---------- */
  function setChip(el, chip) {
    if (!el) return;
    if (!chip) { el.innerHTML = ""; el.dataset.key = ""; return; }
    var key = chip[0] + "|" + chip[1];
    if (el.dataset.key === key) return;
    el.dataset.key = key;
    var span = document.createElement("span");
    span.className = "chip " + chip[0] + (reduce.matches ? "" : " enter");
    span.innerHTML = "<i></i>";
    span.appendChild(document.createTextNode(chip[1]));
    el.replaceChildren(span);
    if (!reduce.matches) requestAnimationFrame(function () { requestAnimationFrame(function () { span.classList.remove("enter"); }); });
  }

  /* ---------- SVG renderer (default, and the fallback) ---------- */
  function svgRenderer(el) {
    return {
      kind: "svg",
      set: function (state) {
        var old = el.querySelector(":scope > svg");
        var tmp = document.createElement("div");
        tmp.innerHTML = SVG.render(state);
        if (old) el.replaceChild(tmp.firstChild, old); else el.insertBefore(tmp.firstChild, el.firstChild);
      },
      setVisible: function () {},
      destroy: function () { var old = el.querySelector(":scope > svg"); if (old) old.remove(); }
    };
  }

  /* ---------- Player: steps through [state, chip, ms, flag] frames ---------- */
  function Player(name, artEl, chipEl) {
    this.name = name;
    this.art = artEl;
    this.chipEl = chipEl;
    this.renderer = svgRenderer(artEl);
    this.seq = null;
    this.i = 0;
    this.loop = true;
    this.timer = 0;
    this.visible = true;
    this.onFrame = null;
  }
  Player.prototype.play = function (seq, loop) {
    this.seq = seq;
    this.loop = loop !== false;
    this.i = 0;
    clearTimeout(this.timer);
    if (reduce.matches) { this.i = seq.length - 1; this.show(true); return; }
    this.show(false);
    this.schedule();
  };
  Player.prototype.show = function (instant) {
    var fr = this.seq[this.i];
    this.renderer.set(fr[0], instant);
    setChip(this.chipEl, fr[1]);
    if (this.onFrame) this.onFrame(fr, this.i);
  };
  Player.prototype.schedule = function () {
    var self = this;
    clearTimeout(this.timer);
    if (!this.visible || document.hidden || reduce.matches || !this.seq) return;
    var fr = this.seq[this.i];
    if (!fr[2]) return; // a single still frame
    this.timer = setTimeout(function () {
      if (self.i < self.seq.length - 1) self.i++;
      else if (self.loop) self.i = 0;
      else return;
      self.show(false);
      self.schedule();
    }, fr[2]);
  };
  Player.prototype.setVisible = function (v) {
    this.visible = v;
    this.renderer.setVisible(v && !document.hidden);
    if (v) this.schedule(); else clearTimeout(this.timer);
  };
  /* Swap renderers (SVG <-> 3D). A renderer with takeover() removes the old one itself,
     so the 3D canvas can fade in over the SVG instead of flashing. */
  Player.prototype.useRenderer = function (r) {
    var old = this.renderer;
    this.renderer = r;
    if (this.seq) this.renderer.set(this.seq[this.i][0], true);
    if (r.takeover) r.takeover(old); else old.destroy();
    this.renderer.setVisible(this.visible && !document.hidden);
  };

  var players = {};

  /* Hero */
  var heroArt = document.querySelector('[data-scene="hero"]');
  if (heroArt) {
    players.hero = new Player("hero", heroArt, document.querySelector('[data-chip="hero"]'));
    players.hero.play(SVG.hero, true);
  }

  /* Demo poster: one still frame, always SVG */
  var posterArt = document.querySelector('[data-scene="poster"]');
  if (posterArt) posterArt.innerHTML = SVG.render(SVG.poster);

  /* ---------- Scroll story ---------- */
  var storyArt = document.querySelector('[data-scene="story"]');
  var steps = Array.prototype.slice.call(document.querySelectorAll(".step"));
  var dots = Array.prototype.slice.call(document.querySelectorAll(".story-dots li"));
  var finding = document.querySelector(".mock.finding");
  var currentStep = 0;
  if (storyArt) {
    players.story = new Player("story", storyArt, document.querySelector('[data-chip="story"]'));
    players.story.onFrame = function (fr) {
      if (finding) finding.classList.toggle("fixed", fr[3] === "fixed");
    };
    setStep(1);
  }

  function setStep(n) {
    if (n === currentStep || !players.story) return;
    currentStep = n;
    steps.forEach(function (s) { s.classList.toggle("is-active", +s.dataset.step === n); });
    dots.forEach(function (d, i) { d.classList.toggle("on", i === n - 1); });
    var seq = SVG.story[n];
    players.story.play(seq, n === 3 || n === 4);
    if (players.story.renderer.step) players.story.renderer.step(n);
  }

  if ("IntersectionObserver" in window) {
    var stepIO = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) { if (e.isIntersecting) setStep(+e.target.dataset.step); });
    }, { rootMargin: "-48% 0px -48% 0px" });
    steps.forEach(function (s) { stepIO.observe(s); });

    /* Render only while visible */
    var visIO = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        var p = e.target === (heroArt && heroArt.parentNode) ? players.hero : players.story;
        if (p) p.setVisible(e.isIntersecting);
      });
    }, { rootMargin: "80px 0px" });
    if (heroArt) visIO.observe(heroArt.parentNode);
    if (storyArt) visIO.observe(storyArt.parentNode);

    /* Reveal on scroll */
    var revIO = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { e.target.classList.add("in"); revIO.unobserve(e.target); }
      });
    }, { rootMargin: "0px 0px -8% 0px" });
    document.querySelectorAll(".reveal").forEach(function (el) { revIO.observe(el); });
  } else {
    document.querySelectorAll(".reveal").forEach(function (el) { el.classList.add("in"); });
  }

  /* Pause in background tabs */
  document.addEventListener("visibilitychange", function () {
    Object.keys(players).forEach(function (k) { players[k].setVisible(players[k].visible); });
  });

  /* Reduced-motion changes at runtime: restart into the still frame */
  if (reduce.addEventListener) reduce.addEventListener("change", function () {
    if (players.hero) players.hero.play(SVG.hero, true);
    if (players.story) { var n = currentStep; currentStep = 0; setStep(n || 1); }
  });

  /* Mobile menu: close after picking a link or pressing Escape */
  var menu = document.querySelector(".navmenu");
  if (menu) {
    menu.addEventListener("click", function (e) { if (e.target.closest("a")) menu.open = false; });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape" && menu.open) { menu.open = false; menu.querySelector("summary").focus(); } });
    document.addEventListener("click", function (e) { if (menu.open && !menu.contains(e.target)) menu.open = false; });
  }

  window.TiniSite = { players: players, reduce: reduce, setChip: setChip, svgRenderer: svgRenderer, currentStep: function () { return currentStep; } };
})();
