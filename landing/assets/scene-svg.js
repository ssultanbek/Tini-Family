/* The yard as flat SVG, built from a small state object.
   Used for the hero loop, the four scroll-story steps and the demo poster. It is also the
   fallback when WebGL is missing or the visitor prefers reduced motion.
   Shared vocabulary with the 3D scene: fence segments, bricks, roof, the paper plane, red/green. */
(function () {
  "use strict";

  var W = 640, H = 420, VB = "10 22 620 440";
  var ISL = { cx: 320, cy: 258, rx: 282, ry: 116 };
  var FEN = { cx: 320, cy: 252, rx: 228, ry: 94 };
  var N = 30, SEGS = 5, PER = N / SEGS;
  var C = {
    grass: "#D6ECC6", grass2: "#BFE0A8", grassSide: "#9FCB88", soil: "#C9A27A", soil2: "#B48A60",
    post: "#A8733F", postTop: "#8A5A36", rail: "#C08A55",
    red: "#C8322F", green: "#23824A", plan: "#9A97A6",
    brick: "#EBDCC4", brick2: "#E2CFB2", mortar: "#D2BD9D", side: "#D8C3A0",
    roof: "#9C6A43", roofSide: "#7E5234", door: "#6B3F1F", win: "#FFFFFF", winIn: "#B3D5EC",
    tree: "#8CC47A", tree2: "#76B566", trunk: "#8A5A36", cloud: "#FFFFFF", ink: "#1B1A24",
    spark: "#D39A00"
  };

  function f(n) { return Math.round(n * 10) / 10; }
  function postAngle(i) { return Math.PI / 2 + (2 * Math.PI * (i + 0.5)) / N; }
  function postPos(i) {
    var a = postAngle(i);
    return { x: FEN.cx + FEN.rx * Math.cos(a), y: FEN.cy + FEN.ry * Math.sin(a) };
  }

  function island() {
    var l = ISL.cx - ISL.rx, r = ISL.cx + ISL.rx, y = ISL.cy;
    return (
      '<path d="M' + l + " " + (y + 26) + " A" + ISL.rx + " " + ISL.ry + " 0 0 0 " + r + " " + (y + 26) +
      " L" + r + " " + (y + 40) + " Q" + (r - 40) + " " + (y + 150) + " " + ISL.cx + " " + (y + 160) +
      " Q" + (l + 40) + " " + (y + 150) + " " + l + " " + (y + 40) + ' Z" fill="' + C.soil2 + '"/>' +
      '<path d="M' + l + " " + (y + 18) + " A" + ISL.rx + " " + ISL.ry + " 0 0 0 " + r + " " + (y + 18) +
      " L" + r + " " + (y + 30) + " Q" + (r - 50) + " " + (y + 120) + " " + ISL.cx + " " + (y + 128) +
      " Q" + (l + 50) + " " + (y + 120) + " " + l + " " + (y + 30) + ' Z" fill="' + C.soil + '"/>' +
      '<path d="M' + l + " " + y + " A" + ISL.rx + " " + ISL.ry + " 0 0 0 " + r + " " + y +
      " L" + r + " " + (y + 18) + " A" + ISL.rx + " " + ISL.ry + " 0 0 1 " + l + " " + (y + 18) + ' Z" fill="' + C.grassSide + '"/>' +
      '<ellipse cx="' + ISL.cx + '" cy="' + y + '" rx="' + ISL.rx + '" ry="' + ISL.ry + '" fill="' + C.grass + '"/>' +
      '<ellipse cx="' + ISL.cx + '" cy="' + (y - 6) + '" rx="' + (FEN.rx - 14) + '" ry="' + (FEN.ry - 10) + '" fill="' + C.grass2 + '" opacity=".55"/>'
    );
  }

  function clouds() {
    return (
      '<g fill="' + C.cloud + '" opacity=".9">' +
      '<ellipse cx="96" cy="70" rx="44" ry="15"/><ellipse cx="122" cy="60" rx="26" ry="16"/>' +
      '<ellipse cx="520" cy="54" rx="40" ry="13"/><ellipse cx="498" cy="46" rx="22" ry="13"/>' +
      '<ellipse cx="300" cy="34" rx="28" ry="9" opacity=".7"/></g>'
    );
  }

  function tree(x, y, s) {
    s = s || 1;
    return (
      '<g transform="translate(' + x + " " + y + ") scale(" + s + ')">' +
      '<ellipse cx="0" cy="2" rx="22" ry="5" fill="' + C.ink + '" opacity=".08"/>' +
      '<rect x="-4" y="-26" width="8" height="28" rx="3" fill="' + C.trunk + '"/>' +
      '<circle cx="0" cy="-44" r="24" fill="' + C.tree2 + '"/>' +
      '<circle cx="-10" cy="-50" r="16" fill="' + C.tree + '"/>' +
      '<circle cx="9" cy="-36" r="12" fill="' + C.tree + '"/></g>'
    );
  }

  function bush(x, y) {
    return '<g><circle cx="' + x + '" cy="' + (y - 7) + '" r="9" fill="' + C.tree2 + '"/><circle cx="' + (x + 9) + '" cy="' + (y - 5) + '" r="7" fill="' + C.tree + '"/></g>';
  }

  function segColor(st, k) {
    var s = (st.seg && st.seg[k]) || "wood";
    if (s === "red") return { post: C.red, top: "#A3262A", rail: C.red };
    if (s === "green") return { post: C.post, top: C.green, rail: C.green };
    return { post: C.post, top: C.postTop, rail: C.rail };
  }

  /* Returns drawables [{y, svg}] for the fence so they can be depth-sorted with everything else. */
  function fence(st) {
    var out = [];
    if (st.fence === "none") return out;
    var plan = st.fence === "plan";
    var risen = st.risen == null ? SEGS : st.risen;
    for (var i = 0; i < N; i++) {
      var k = Math.floor(i / PER);
      if (!plan && k >= risen) continue;
      var p = postPos(i), col = segColor(st, k);
      var h = 30, w = 7;
      if (plan) {
        out.push({ y: p.y, svg: '<rect x="' + f(p.x - w / 2) + '" y="' + f(p.y - h) + '" width="' + w + '" height="' + h + '" rx="2" fill="none" stroke="' + C.plan + '" stroke-width="1.6" stroke-dasharray="3 3" opacity=".9"/>' });
      } else {
        out.push({ y: p.y + 0.2, svg:
          '<rect x="' + f(p.x - w / 2) + '" y="' + f(p.y - h) + '" width="' + w + '" height="' + h + '" rx="2" fill="' + col.post + '"/>' +
          '<rect x="' + f(p.x - w / 2 - 1) + '" y="' + f(p.y - h - 3) + '" width="' + (w + 2) + '" height="6" rx="2" fill="' + col.top + '"/>' });
      }
      var j = i + 1;
      if (j >= N) continue; // the gap between the last and first post is the gate
      var kj = Math.floor(j / PER);
      if (!plan && kj >= risen) continue;
      var q = postPos(j);
      var mid = (p.y + q.y) / 2;
      if (plan) {
        out.push({ y: mid, svg: '<path d="M' + f(p.x) + " " + f(p.y - 16) + "L" + f(q.x) + " " + f(q.y - 16) + '" stroke="' + C.plan + '" stroke-width="1.6" stroke-dasharray="4 4" opacity=".8"/>' });
      } else {
        out.push({ y: mid, svg:
          '<path d="M' + f(p.x) + " " + f(p.y - 9) + "L" + f(q.x) + " " + f(q.y - 9) + "M" + f(p.x) + " " + f(p.y - 21) + "L" + f(q.x) + " " + f(q.y - 21) +
          '" stroke="' + col.rail + '" stroke-width="4" stroke-linecap="round"/>' });
      }
    }
    if (!plan && risen >= SEGS) {
      // the gate: two small doors between the last and first post
      var L = postPos(0), R = postPos(N - 1), half = (R.x - L.x) / 2 - 5;
      out.push({ y: (L.y + R.y) / 2 + 0.5, svg:
        '<rect x="' + f(L.x + 4) + '" y="' + f(L.y - 24) + '" width="' + f(half) + '" height="18" rx="2" fill="' + C.rail + '"/>' +
        '<rect x="' + f(R.x - 4 - half) + '" y="' + f(R.y - 24) + '" width="' + f(half) + '" height="18" rx="2" fill="' + C.rail + '"/>' +
        '<path d="M' + f(L.x + 8) + " " + f(L.y - 15) + "h" + f(half - 8) + "M" + f(R.x - half) + " " + f(R.y - 15) + "h" + f(half - 8) + '" stroke="' + C.postTop + '" stroke-width="2" opacity=".5"/>' });
    }
    return out;
  }

  var uid = 0;
  function house(st) {
    var n = Math.max(0, Math.min(30, st.bricks | 0));
    if (n === 0 && !st.roof) {
      return '<ellipse cx="336" cy="236" rx="86" ry="14" fill="#C6DDB2"/><rect x="256" y="229" width="160" height="6" rx="3" fill="#D8C3A0" opacity=".7"/>';
    }
    var x0 = 256, y0 = 234, bw = 128 / 5, bh = 13, rows = 6;
    var s = '<ellipse cx="336" cy="238" rx="90" ry="12" fill="' + C.ink + '" opacity=".08"/>';
    var rowsDone = Math.min(rows, Math.ceil(n / 5));
    var hSide = Math.min(rows, Math.floor(n / 5)) * bh;
    if (hSide > 0) s += '<path d="M384 ' + y0 + " L416 " + (y0 - 12) + " L416 " + (y0 - 12 - hSide) + " L384 " + (y0 - hSide) + ' Z" fill="' + C.side + '"/>';
    var cid = "wall" + (++uid);
    s += '<clipPath id="' + cid + '"><rect x="' + x0 + '" y="' + (y0 - rows * bh) + '" width="128" height="' + rows * bh + '"/></clipPath><g clip-path="url(#' + cid + ')">';
    for (var b = 0; b < n; b++) {
      var r = Math.floor(b / 5), c = b % 5, off = r % 2 ? -bw / 2 : 0;
      var bx = x0 + c * bw + off, by = y0 - (r + 1) * bh;
      s += '<rect x="' + f(bx + 0.8) + '" y="' + f(by + 0.8) + '" width="' + f(bw - 1.6) + '" height="' + (bh - 1.6) + '" rx="2" fill="' + ((b * 7) % 3 ? C.brick : C.brick2) + '"/>';
      if (r % 2 && c === 4) s += '<rect x="' + f(x0 + 5 * bw - bw / 2 + 0.8) + '" y="' + f(by + 0.8) + '" width="' + f(bw / 2 - 1.6) + '" height="' + (bh - 1.6) + '" rx="2" fill="' + C.brick + '"/>';
    }
    s += "</g>";
    if (rowsDone >= 3) s += '<rect x="306" y="' + (y0 - 38) + '" width="28" height="38" rx="3" fill="' + C.door + '"/><circle cx="328" cy="' + (y0 - 18) + '" r="2" fill="#DDC3A7"/>';
    if (rowsDone >= 5) {
      s += '<rect x="268" y="' + (y0 - 62) + '" width="26" height="22" rx="3" fill="' + C.win + '"/><rect x="272" y="' + (y0 - 58) + '" width="18" height="14" rx="1.5" fill="' + C.winIn + '"/>';
      s += '<rect x="346" y="' + (y0 - 62) + '" width="26" height="22" rx="3" fill="' + C.win + '"/><rect x="350" y="' + (y0 - 58) + '" width="18" height="14" rx="1.5" fill="' + C.winIn + '"/>';
    }
    if (st.roof) {
      var top = y0 - rows * bh;
      s += '<rect x="360" y="' + (top - 52) + '" width="14" height="30" rx="2" fill="' + C.roofSide + '"/>';
      s += '<path d="M248 ' + (top + 4) + " L320 " + (top - 50) + " L352 " + (top - 62) + " L424 " + (top - 8) + " L392 " + (top + 4) + ' Z" fill="' + C.roofSide + '"/>';
      s += '<path d="M246 ' + (top + 4) + " L320 " + (top - 50) + " L394 " + (top + 4) + ' Z" fill="' + C.roof + '"/>';
      s += '<circle cx="320" cy="' + (top - 16) + '" r="8" fill="' + C.win + '"/><circle cx="320" cy="' + (top - 16) + '" r="5" fill="' + C.winIn + '"/>';
      if (st.flag) {
        s += '<path d="M352 ' + (top - 62) + "v-34" + '" stroke="' + C.ink + '" stroke-width="2.4" stroke-linecap="round"/>';
        s += '<path d="M353 ' + (top - 96) + "l24 7 -24 7z" + '" fill="' + C.green + '"/>';
      }
    }
    return s;
  }

  function character(id, x, y, w, h, flip) {
    // (x, y) = feet position
    var t = flip ? ' transform="translate(' + f(2 * x) + ' 0) scale(-1 1)"' : "";
    return "<g" + t + '><use href="#' + id + '" x="' + f(x - w / 2) + '" y="' + f(y - h) + '" width="' + w + '" height="' + h + '"/></g>';
  }

  function bubble(x, y, text, tone) {
    var w = text.length * 8.6 + 22;
    var stroke = tone === "bad" ? "#F3BDB7" : "#E3E1EA";
    var ink = tone === "bad" ? "#A3262A" : C.ink;
    return (
      '<g><rect x="' + f(x - w / 2) + '" y="' + (y - 30) + '" width="' + f(w) + '" height="28" rx="14" fill="#FFFFFF" stroke="' + stroke + '" stroke-width="1.5"/>' +
      '<path d="M' + (x - 6) + " " + (y - 3) + "l6 8 5-8" + '" fill="#FFFFFF" stroke="' + stroke + '" stroke-width="1.5" stroke-linejoin="round"/>' +
      '<rect x="' + (x - 7) + '" y="' + (y - 4) + '" width="13" height="3" fill="#FFFFFF"/>' +
      '<text x="' + x + '" y="' + (y - 11) + '" text-anchor="middle" font-family="Manrope Variable, system-ui, sans-serif" font-weight="800" font-size="15" fill="' + ink + '">' + text + "</text></g>"
    );
  }

  function spark(x, y) {
    var s = '<g stroke="' + C.spark + '" stroke-width="3" stroke-linecap="round">';
    for (var i = 0; i < 8; i++) {
      var a = (i / 8) * Math.PI * 2 + 0.2, r1 = 7, r2 = i % 2 ? 15 : 20;
      s += '<path d="M' + f(x + r1 * Math.cos(a)) + " " + f(y + r1 * Math.sin(a)) + "L" + f(x + r2 * Math.cos(a)) + " " + f(y + r2 * Math.sin(a)) + '"/>';
    }
    return s + '</g><circle cx="' + x + '" cy="' + y + '" r="4" fill="' + C.spark + '"/>';
  }

  function render(st) {
    st = st || {};
    var items = [];
    items.push({ y: 232, svg: tree(78, 232, 1.05) });
    items.push({ y: 238, svg: tree(566, 238, 0.9) });
    items.push({ y: 212, svg: tree(470, 190, 0.7) });
    items.push({ y: 330, svg: bush(84, 300) });
    items.push({ y: 340, svg: bush(560, 326) });
    items.push({ y: 234, svg: house(st) });
    items = items.concat(fence(st));

    var dogX = 424, dogY = 262;
    items.push({ y: dogY, svg: character("ch-dog", dogX, dogY, 78, 60) + (st.dogBrick ? '<rect x="' + (dogX + 26) + '" y="' + (dogY - 44) + '" width="16" height="9" rx="2" fill="' + C.brick2 + '" stroke="' + C.mortar + '"/>' : "") });

    items.push({ y: 342, svg: character("ch-tini", 150, 346, 62, 93) });
    var tx = st.tina === "inspect" ? 470 : 548, ty = st.tina === "inspect" ? 352 : 312;
    items.push({ y: ty, svg: character("ch-tina", tx, ty, 62, 93, true) + (st.sneeze ? bubble(tx - 4, ty - 96, "Achoo!", "bad") : "") });

    items.sort(function (a, b) { return a.y - b.y; });

    var s = '<svg viewBox="' + (st.vb || VB) + '" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">';
    s += '<rect x="-40" y="-40" width="' + (W + 80) + '" height="' + (H + 120) + '" fill="#E2F0F9"/>' + clouds() + island();
    for (var i = 0; i < items.length; i++) s += items[i].svg;

    if (st.plane === "fly") {
      s += '<path d="M612 96 Q580 120 560 150" stroke="#8F8B9E" stroke-width="2" stroke-dasharray="3 6" fill="none" stroke-linecap="round"/>';
      s += '<use href="#ob-plane" x="532" y="146" width="42" height="28" transform="rotate(-18 553 160)"/>';
    } else if (st.plane === "spark") {
      s += '<use href="#ob-plane" x="540" y="164" width="36" height="24" transform="rotate(28 558 176)" opacity=".85"/>';
      s += spark(528, 196);
    }
    return s + "</svg>";
  }

  /* ---------- Sequences ---------- */
  var ALL = ["wood", "wood", "wood", "wood", "wood"];
  var GREEN = ["green", "green", "green", "green", "green"];
  var RED4 = ["wood", "wood", "wood", "wood", "red"];
  function S(o) {
    var base = { fence: "built", risen: 5, seg: ALL, bricks: 0, roof: false, plane: null, tina: "home", sneeze: false, dogBrick: false, flag: false };
    for (var k in o) base[k] = o[k];
    return base;
  }

  // [state, chip, ms]
  var hero = [
    [S({ fence: "none" }), ["plan", "Tini is planning the fence"], 1500],
    [S({ risen: 1 }), ["wood", "Tini is building the fence"], 450],
    [S({ risen: 2 }), ["wood", "Tini is building the fence"], 450],
    [S({ risen: 3 }), ["wood", "Tini is building the fence"], 450],
    [S({ risen: 4 }), ["wood", "Tini is building the fence"], 450],
    [S({ risen: 5 }), ["wood", "The fence is up"], 900],
    [S({ bricks: 5, dogBrick: true }), ["sky", "The dog is building"], 650],
    [S({ bricks: 10, dogBrick: true }), ["sky", "The dog is building"], 650],
    [S({ bricks: 15, dogBrick: true, plane: "fly" }), ["sky", "The dog is building"], 900],
    [S({ bricks: 15, plane: "spark" }), ["bad", "Blocked: ~/.ssh/id_rsa"], 2000],
    [S({ bricks: 20, dogBrick: true }), ["sky", "The dog is building"], 650],
    [S({ bricks: 25, dogBrick: true }), ["sky", "The dog is building"], 650],
    [S({ bricks: 30, roof: true }), ["sky", "The house is done"], 1000],
    [S({ bricks: 30, roof: true, tina: "inspect" }), ["warn", "Tina is inspecting"], 1400],
    [S({ bricks: 30, roof: true, tina: "inspect", seg: RED4, sneeze: true }), ["bad", "Map key visible in the code"], 2000],
    [S({ bricks: 30, roof: true, tina: "inspect", seg: GREEN }), ["ok", "Fixed. Every segment is green"], 1600],
    [S({ bricks: 30, roof: true, seg: GREEN, flag: true }), ["ok", "Launch unlocked"], 2600]
  ];

  var story = {
    1: [[S({ fence: "none" }), ["plan", "Waiting for your prompt"], 0]],
    2: [[S({ fence: "plan" }), ["plan", "Tini’s plan: 5 fence segments"], 0]],
    3: [
      [S({ bricks: 15, dogBrick: true, plane: "fly" }), ["sky", "The dog is building"], 1200],
      [S({ bricks: 15, plane: "spark" }), ["bad", "Blocked: ~/.ssh/id_rsa"], 2600],
      [S({ bricks: 20, dogBrick: true }), ["sky", "The dog is building"], 1400]
    ],
    4: [
      [S({ bricks: 30, roof: true, tina: "inspect" }), ["warn", "Tina is inspecting"], 1300],
      [S({ bricks: 30, roof: true, tina: "inspect", seg: RED4, sneeze: true }), ["bad", "Needs a fix: map key in the code"], 2200, "red"],
      [S({ bricks: 30, roof: true, tina: "inspect", seg: GREEN }), ["ok", "Fixed. Every segment is green"], 1800, "fixed"],
      [S({ bricks: 30, roof: true, seg: GREEN, flag: true }), ["ok", "Launch unlocked"], 3000, "fixed"]
    ]
  };

  var poster = S({ bricks: 30, roof: true, seg: GREEN, flag: true });

  window.TiniSVG = { render: render, hero: hero, story: story, poster: poster, S: S };
})();
