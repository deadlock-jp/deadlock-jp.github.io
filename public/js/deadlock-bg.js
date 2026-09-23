/*!
 * deadlock-bg.js — DEADLOCK-JP DB 背景演出 "Halftone Press"
 * 依存ライブラリなし / Canvas 2D のみ / 約 8KB
 *
 *   <div id="dlbg" class="dlbg"></div>
 *   <script src="/js/deadlock-bg.js"></script>
 *   <script>DeadlockBG.mount(document.getElementById('dlbg'));</script>
 *
 * mount(el, options) -> { destroy(), setOptions(partial) }
 *   glow    0–1.6  発光の強さ (既定 0.5)
 *   accent  CSS色  発光・窓明かりの色 (既定 #5fe0a8)
 *   motion  bool   アニメーション (既定 true / OS の「視差を減らす」設定で自動 false)
 */
(function (root) {
  "use strict";

  var DEFAULTS = { glow: 0.5, accent: "#5fe0a8", motion: true };

  function makeSkyline(W, cfg, seed) {
    var s = seed;
    function rnd() { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; }
    var blocks = [], x = -240;
    while (x < W + 420) {
      var bw = cfg.w[0] + rnd() * (cfg.w[1] - cfg.w[0]);
      var bh = cfg.h * (0.42 + rnd() * 0.8);
      blocks.push({ x: x, w: bw, h: bh, spire: rnd() > 0.7, step: rnd() > 0.45, cap: rnd() > 0.8 });
      x += bw + 3 + rnd() * 14;
    }
    return { blocks: blocks, span: x + 240, cfg: cfg };
  }

  function drawSkyline(ctx, L, W, color) {
    ctx.fillStyle = color;
    for (var i = 0; i < L.blocks.length; i++) {
      var b = L.blocks[i], x = b.x;
      if (x > W + 220 || x < -300) continue;
      ctx.fillRect(x, L.cfg.y - b.h, b.w, b.h + 60);
      if (b.step) ctx.fillRect(x + b.w * 0.16, L.cfg.y - b.h - 18, b.w * 0.68, 20);
      if (b.cap) ctx.fillRect(x + b.w * 0.33, L.cfg.y - b.h - 34, b.w * 0.34, 36);
      if (b.spire) ctx.fillRect(x + b.w / 2 - 2.5, L.cfg.y - b.h - 74, 5, 76);
    }
  }

  function grainTile(size) {
    var cv = document.createElement("canvas");
    cv.width = cv.height = size;
    var ctx = cv.getContext("2d"), img = ctx.createImageData(size, size);
    for (var i = 0; i < img.data.length; i += 4) {
      var v = 110 + Math.random() * 90;
      img.data[i] = v; img.data[i + 1] = v; img.data[i + 2] = v; img.data[i + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    return cv;
  }

  function mount(el, options) {
    if (!el) throw new Error("DeadlockBG.mount: element required");
    var opts = {};
    for (var k in DEFAULTS) opts[k] = DEFAULTS[k];
    for (var k2 in (options || {})) opts[k2] = options[k2];

    var reduce = root.matchMedia && root.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) opts.motion = false;

    var canvas = document.createElement("canvas");
    canvas.setAttribute("aria-hidden", "true");
    canvas.style.cssText = "position:absolute;inset:0;width:100%;height:100%;display:block";
    var grain = document.createElement("canvas");
    grain.setAttribute("aria-hidden", "true");
    grain.style.cssText = "position:absolute;inset:0;width:100%;height:100%;opacity:.24;" +
      "mix-blend-mode:overlay;pointer-events:none;image-rendering:pixelated";
    el.appendChild(canvas);
    el.appendChild(grain);

    var gctx = grain.getContext("2d");

    var ctx = canvas.getContext("2d");
    var W = 0, H = 0, dpr = 1, far = null, near = null, base = null, baseKey = "", t = 0, raf = 0;

    function layout() {
      dpr = Math.min(root.devicePixelRatio || 1, 2);
      W = el.clientWidth || 1280;
      H = el.clientHeight || 720;
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      far = makeSkyline(W, { y: H * 0.68, h: H * 0.3, w: [42, 100] }, 5051);
      near = makeSkyline(W, { y: H * 1.02, h: H * 0.49, w: [76, 180] }, 1223);
      baseKey = "";

      // グレインは固定300x300を画面いっぱいに引き伸ばすと、縦長のスマホ画面で
      // 特に縦方向が強く伸びて粗く見える。タイルを実ピクセル解像度で敷き詰めて
      // ドットの見かけサイズを画面サイズに関わらず一定に保つ。
      grain.width = Math.round(W * dpr);
      grain.height = Math.round(H * dpr);
      var tileSize = Math.round(48 * dpr);
      var pattern = gctx.createPattern(grainTile(tileSize), "repeat");
      gctx.fillStyle = pattern;
      gctx.fillRect(0, 0, grain.width, grain.height);
    }

    function buildBase() {
      var g = Math.max(0.08, opts.glow), accent = opts.accent;
      var off = document.createElement("canvas");
      off.width = Math.max(1, Math.round(W)); off.height = Math.max(1, Math.round(H));
      var c = off.getContext("2d");

      var bg = c.createLinearGradient(0, 0, 0, H);
      bg.addColorStop(0, "#0a141c");
      bg.addColorStop(0.6, "#08131a");
      bg.addColorStop(1, "#050d12");
      c.fillStyle = bg; c.fillRect(0, 0, W, H);

      // 網点の空：屋根線直上が最も明るく、上へ向かって減衰。屋根線より下には打たない
      var horizon = far.cfg.y, cx = W * 0.5, step = 9;
      c.fillStyle = accent;
      for (var y = 4; y < horizon; y += step) {
        var up = (horizon - y) / (H * 0.62);
        var band = Math.max(0, 1 - up * up * 1.15);
        for (var x = 4; x < W; x += step) {
          var dx = Math.abs(x - cx) / (W * 0.95);
          var v = band * (1 - dx * dx * 0.55);
          v += Math.sin(x * 0.012) * 0.05 + Math.sin(y * 0.018) * 0.04;
          if (v <= 0.02) continue;
          var r = Math.min(step * 0.5, v * v * step * 0.9);
          c.globalAlpha = Math.min(1, 0.28 + v * 1.0) * g;
          c.beginPath(); c.arc(x, y, r, 0, 6.2832); c.fill();
        }
      }
      c.globalAlpha = 1;

      // 見出し背後のみを落とすスクリム（本文可読性の確保：周囲の空の緑は残す）
      var scrim = c.createRadialGradient(W * 0.5, H * 0.24, 0, W * 0.5, H * 0.24, W * 0.36);
      scrim.addColorStop(0, "rgba(5,11,16,.9)");
      scrim.addColorStop(0.55, "rgba(5,11,16,.64)");
      scrim.addColorStop(1, "rgba(5,11,16,0)");
      c.fillStyle = scrim; c.fillRect(0, 0, W, H * 0.62);

      drawSkyline(c, far, W, "#06121a");
      drawSkyline(c, near, W, "#01070a");
      base = off;
      baseKey = W + "x" + H + ":" + opts.glow + ":" + opts.accent;
    }

    function frame() {
      var g = opts.glow, accent = opts.accent;
      var key = W + "x" + H + ":" + opts.glow + ":" + opts.accent;
      if (key !== baseKey) buildBase();
      if (opts.motion) t += 1;

      ctx.clearRect(0, 0, W, H);
      ctx.drawImage(base, 0, 0, W, H);

      // 横切るサーチライト
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      var bx = ((t * 0.55) % (W + 700)) - 350;
      var beam = ctx.createLinearGradient(bx - 150, 0, bx + 150, 0);
      beam.addColorStop(0, "rgba(126,224,180,0)");
      beam.addColorStop(0.5, "rgba(150,236,196," + (0.12 * g).toFixed(3) + ")");
      beam.addColorStop(1, "rgba(126,224,180,0)");
      ctx.fillStyle = beam;
      ctx.translate(bx, 0); ctx.transform(1, 0, -0.22, 1, 0, 0); ctx.translate(-bx, 0);
      ctx.fillRect(bx - 160, -60, 320, H + 120);
      ctx.restore();

      // 奥のビルの窓明かり（波打つ点滅）
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      for (var bi = 0; bi < far.blocks.length; bi++) {
        var b = far.blocks[bi];
        if (b.x > W + 20 || b.x < -200) continue;
        for (var wy = far.cfg.y - b.h + 16; wy < far.cfg.y - 10; wy += 16) {
          for (var wx = b.x + 9; wx < b.x + b.w - 9; wx += 14) {
            var k = Math.sin(wx * 9.1234 + wy * 3.771 + bi * 5.5);
            if (k < 0.3) continue;
            ctx.globalAlpha = (0.25 + 0.55 * (0.5 + 0.5 * Math.sin(t / 40 + wx * 0.04))) * Math.max(0.3, g);
            ctx.fillStyle = k > 0.95 ? "rgba(236,206,150,1)" : accent;
            ctx.fillRect(wx, wy, 4, 6);
          }
        }
      }
      ctx.restore();

      var vg = ctx.createRadialGradient(W / 2, H * 0.45, H * 0.6, W / 2, H * 0.5, H * 1.15);
      vg.addColorStop(0, "rgba(0,0,0,0)");
      vg.addColorStop(1, "rgba(3,7,10,.5)");
      ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);

      raf = root.requestAnimationFrame(frame);
    }

    var ro = null, onResize = null;
    if (root.ResizeObserver) {
      ro = new root.ResizeObserver(function () {
        if (el.clientWidth !== W || el.clientHeight !== H) layout();
      });
      ro.observe(el);
    } else {
      onResize = function () { layout(); };
      root.addEventListener("resize", onResize);
    }

    layout();
    frame();

    return {
      setOptions: function (partial) { for (var n in (partial || {})) opts[n] = partial[n]; },
      destroy: function () {
        root.cancelAnimationFrame(raf);
        if (ro) ro.disconnect();
        if (onResize) root.removeEventListener("resize", onResize);
        if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
        if (grain.parentNode) grain.parentNode.removeChild(grain);
      }
    };
  }

  root.DeadlockBG = { mount: mount, defaults: DEFAULTS };
})(window);
