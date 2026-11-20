(() => {
  const fogA = document.getElementById("fogA");
  const fogB = document.getElementById("fogB");
  const btn = document.getElementById("btn");

  const BREATH = 2800; // ms, fog spreading
  const WIPE = 1500;   // ms, hand swipe

  const noise = (freq, oct, a, b) =>
    `url("data:image/svg+xml,${encodeURIComponent(
      `<svg xmlns='http://www.w3.org/2000/svg' width='300' height='300'>` +
      `<filter id='n'><feTurbulence type='fractalNoise' baseFrequency='${freq}' numOctaves='${oct}' stitchTiles='stitch'/>` +
      `<feColorMatrix values='0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 ${a} 0 0 0 ${b}'/></filter>` +
      `<rect width='100%' height='100%' filter='url(#n)'/></svg>`
    )}")`;
  const tex = noise(0.85, 2, 1.2, -0.52) + "," + noise(0.008, 3, 0.9, -0.3);
  [fogA, fogB].forEach((f) => {
    f.style.backgroundImage = tex;
    f.style.backgroundSize = "260px 260px, 1100px 1100px";
  });

  const rnd = (a, b) => a + Math.random() * (b - a);
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const ease = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);

  const makeBlobs = (n, spread, sMin, sMax) =>
    Array.from({ length: n }, () => ({
      ang: rnd(0, Math.PI * 2),
      off: Math.pow(Math.random(), 0.7) * spread,
      scale: rnd(sMin, sMax),
      delay: rnd(0, 0.25),
      ph: rnd(0, 6.28),
      wob: rnd(0.04, 0.09),
    }));

  const EMPTY = "linear-gradient(transparent, transparent)";

  // fog shape as a list of gradient layers
  function fogLayers(blobs, u, elapsed, hard) {
    const W = innerWidth, H = innerHeight;
    const diag = Math.hypot(W, H);
    const cx = W / 2, cy = H / 2;
    const layers = [];
    blobs.forEach((b) => {
      const p = clamp((u - b.delay) / 0.75, 0, 1);
      if (p <= 0) return;
      const e = 1 - Math.pow(1 - p, 3);
      const wob = 1 + b.wob * Math.sin(elapsed * 0.004 + b.ph) * (1 - e);
      const r = diag * b.scale * e * wob;
      if (r < 2) return;
      const x = cx + Math.cos(b.ang) * b.off * diag * e;
      const y = cy + Math.sin(b.ang) * b.off * diag * e;
      const mid = (hard + (1 - hard) * 0.5) * 100;
      layers.push(
        `radial-gradient(circle ${r}px at ${x}px ${y}px, #000 0%, #000 ${hard * 100}%, rgba(0,0,0,.45) ${mid}%, transparent 100%)`
      );
    });
    return layers;
  }

  // wipe layers are "not-wiped" areas, intersected with the fog
  function setMask(el, fog, wipe) {
    if (!fog.length) {
      el.style.maskImage = el.style.webkitMaskImage = EMPTY;
      el.style.maskComposite = "add";
      el.style.webkitMaskComposite = "source-over";
      return;
    }
    const img = [...wipe, ...fog].join(",");
    const std = [...wipe.map(() => "intersect"), ...fog.map(() => "add")].join(",");
    const leg = [...wipe.map(() => "source-in"), ...fog.map(() => "source-over")].join(",");
    el.style.maskImage = img;
    el.style.webkitMaskImage = img;
    el.style.maskComposite = std;
    el.style.webkitMaskComposite = leg;
  }

  // ---- hand wipe: travels top-right -> bottom-left, curved bumpy front ----
  const K = 0.7071;
  function makePlan() {
    const W = innerWidth, H = innerHeight;
    const L = (W + H) * K;
    const diag = Math.hypot(W, H);
    const R = diag * 0.1;
    const bulge = diag * 0.12;
    const tmin = -K * W, tmax = K * H;
    const n = Math.ceil((tmax - tmin) / (R * 1.1)) + 1;
    const circles = Array.from({ length: n }, (_, i) => {
      const tn = n === 1 ? 0.5 : i / (n - 1);
      const mid = 1 - Math.pow(2 * tn - 1, 2);
      return {
        t: tmin + tn * (tmax - tmin) + rnd(-R * 0.2, R * 0.2),
        r: R * rnd(0.85, 1.2),
        lead: bulge * (0.35 + 0.65 * mid) * rnd(0.8, 1.1),
      };
    });
    return { W, H, L, ext: bulge + R * 1.4 + 150, circles };
  }

  function wipeLayers(plan, p) {
    const S = -plan.ext + (plan.L + 2 * plan.ext) * p;
    const soft = 70;
    const out = [
      `linear-gradient(225deg, transparent -9999px, transparent ${S}px, #000 ${S + soft}px)`,
    ];
    plan.circles.forEach((c) => {
      const s = S + c.lead;
      const x = plan.W - K * s + K * c.t;
      const y = K * s + K * c.t;
      out.push(
        `radial-gradient(circle ${c.r}px at ${x}px ${y}px, transparent 0%, transparent 65%, #000 100%)`
      );
    });
    return out;
  }

  let state = "clear"; // clear | busy | fogged
  let blobsA, blobsB, raf = 0;
  const breathAudio = new Audio("trimmed_slower.mp3");

  function breathe() {
    state = "busy";
    btn.textContent = "...";
    cancelAnimationFrame(raf);
    breathAudio.play().catch(() => {}); // play fog breath sound on click
    blobsA = makeBlobs(14, 0.1, 1.15, 1.5);
    blobsB = makeBlobs(10, 0.08, 0.55, 0.85);
    setMask(fogA, [], []);
    setMask(fogB, [], []);
    const start = performance.now();
    const frame = (now) => {
      const elapsed = now - start;
      const u = elapsed / BREATH;
      setMask(fogA, fogLayers(blobsA, u, elapsed, 0.6), []);
      setMask(fogB, fogLayers(blobsB, u, elapsed, 0.35), []);
      if (u < 1.05) raf = requestAnimationFrame(frame);
      else { state = "fogged"; btn.textContent = "Wipe"; }
    };
    raf = requestAnimationFrame(frame);
  }

  function wipe() {
    state = "busy";
    btn.textContent = "...";
    cancelAnimationFrame(raf);
    breathAudio.play().catch(() => {}); // play fog breath sound on click
    const plan = makePlan();
    const baseA = fogLayers(blobsA, 1.3, 0, 0.6);
    const baseB = fogLayers(blobsB, 1.3, 0, 0.35);
    const start = performance.now();
    const frame = (now) => {
      const e = (now - start) / WIPE;
      const pB = ease(clamp(e, 0, 1));          // dense core clears first
      const pA = ease(clamp(e - 0.12, 0, 1));   // thin film lingers a moment
      setMask(fogB, baseB, wipeLayers(plan, pB));
      setMask(fogA, baseA, wipeLayers(plan, pA));
      if (e < 1.15) raf = requestAnimationFrame(frame);
      else {
        setMask(fogA, [], []);
        setMask(fogB, [], []);
        state = "clear";
        btn.textContent = "Breathe";
      }
    };
    raf = requestAnimationFrame(frame);
  }

  setMask(fogA, [], []);
  setMask(fogB, [], []);
  btn.addEventListener("click", () => {
    if (state === "clear") breathe();
    else if (state === "fogged") wipe();
  });
})();
