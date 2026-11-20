// Lyrics constellation: word-by-word stars, audio-clock synced.
(() => {
  const audio = document.getElementById("audio");
  const playBtn = document.getElementById("playBtn");
  const edgesSvg = document.getElementById("edges");

  const LRC_URL = "Ed Sheeran - Photograph (Official Lyric Video) [KKQl-pIRQMY].en.lrc";

  // ---- tweak these ----
  const MAX_FULL = 7;                 // nodes at full brightness
  const FADE_STEPS = [0.55, 0.3, 0.12]; // older nodes dim gradually, then vanish
  const MAX_ALIVE = MAX_FULL + FADE_STEPS.length;
  const LEAD = 0.05;                  // seconds early, for sync feel
  const MIN_DIST = 110;
  const EDGE_DRAW = "0.3s";
  // ---------------------

  function parseLRC(text) {
    const cues = [];
    const re = /\[(\d{2}):(\d{2})\.(\d{2,3})\]\s*(.*)/;
    text.split(/\r?\n/).forEach((line) => {
      const m = line.match(re);
      if (!m) return;
      const mm = parseInt(m[1], 10);
      const ss = parseInt(m[2], 10);
      const ms = parseInt(m[3].padEnd(3, "0"), 10);
      const time = mm * 60 + ss + ms / 1000;
      const txt = m[4].trim();
      if (!txt || txt === "[Music]" || txt === "[Laughter]") return;
      cues.push({ t: time, text: txt });
    });
    const out = [];
    cues.forEach((c) => {
      if (!out.length || out[out.length - 1].text !== c.text || Math.abs(out[out.length - 1].t - c.t) > 0.3) {
        out.push(c);
      }
    });
    return out;
  }

  // LRC is line-level, so spread each line's words across the line duration.
  function buildEvents(cues) {
    const ev = [];
    cues.forEach((c, i) => {
      const words = c.text.split(/\s+/).filter(Boolean);
      const next = cues[i + 1] ? cues[i + 1].t : c.t + 4;
      const span = Math.min(Math.max(next - c.t, 0.8) * 0.85, 6);
      words.forEach((w, j) => ev.push({ t: c.t + (j / words.length) * span, text: w }));
    });
    return ev.sort((a, b) => a.t - b.t);
  }

  const live = [];
  let heading = Math.random() * Math.PI * 2;

  function inBounds(x, y) {
    const W = window.innerWidth, H = window.innerHeight;
    return x > 90 && x < W - 170 && y > 80 && y < H - 80;
  }
  function free(x, y) {
    return !live.some((n) => Math.hypot(n.x - x, n.y - y) < MIN_DIST);
  }

  function nextPos() {
    const W = window.innerWidth, H = window.innerHeight;
    const last = live[live.length - 1];
    if (!last) return { x: W * 0.3 + Math.random() * W * 0.4, y: H * 0.3 + Math.random() * H * 0.4 };
    for (let i = 0; i < 20; i++) {
      const a = heading + (Math.random() - 0.5) * 2.2;
      const d = 120 + Math.random() * 120;
      const x = last.x + Math.cos(a) * d;
      const y = last.y + Math.sin(a) * d;
      if (inBounds(x, y) && free(x, y)) { heading = a; return { x, y }; }
    }
    // stuck: steer back toward the center
    heading = Math.atan2(H / 2 - last.y, W / 2 - last.x);
    for (let i = 0; i < 40; i++) {
      const x = 90 + Math.random() * (W - 260);
      const y = 80 + Math.random() * (H - 160);
      if (free(x, y)) return { x, y };
    }
    return { x: 90 + Math.random() * (W - 260), y: 80 + Math.random() * (H - 160) };
  }

  function createNode(text, pos) {
    const node = document.createElement("div");
    node.className = "node";
    const star = document.createElement("div");
    star.className = "star";
    const label = document.createElement("p");
    label.className = "label";
    label.textContent = text;
    node.append(star, label);
    node.style.left = pos.x + "px";
    node.style.top = pos.y + "px";
    document.body.appendChild(node);
    return node;
  }

  function connect(prev, curr) {
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", `M ${prev.x} ${prev.y} L ${curr.x} ${curr.y}`);
    path.setAttribute("fill", "none");
    edgesSvg.appendChild(path);
    const len = path.getTotalLength();
    path.style.stroke = "rgba(255, 215, 235, 0.75)";
    path.style.strokeWidth = "1.2";
    path.style.strokeLinecap = "round";
    path.style.opacity = "1";
    path.style.strokeDasharray = len;
    path.style.strokeDashoffset = len;
    path.style.transition = `stroke-dashoffset ${EDGE_DRAW} ease-out, opacity 1.2s ease`;
    path.style.filter = "drop-shadow(0 0 4px rgba(236,72,153,0.7))";
    requestAnimationFrame(() => { path.style.strokeDashoffset = "0"; });
    return path;
  }

  function opacityFor(rank) {
    if (rank < MAX_FULL) return 1;
    return FADE_STEPS[rank - MAX_FULL] ?? 0;
  }

  function applyRanks() {
    live.forEach((n, i) => {
      const rank = live.length - 1 - i;
      n.el.style.opacity = opacityFor(rank);
      n.el.classList.toggle("current", rank === 0);
      // edge to the previous node fades with the older endpoint
      if (n.edge) n.edge.style.opacity = opacityFor(rank + 1);
    });
  }

  function spawn(ev) {
    const pos = nextPos();
    const el = createNode(ev.text, pos);
    const node = { el, x: pos.x, y: pos.y, edge: null };
    const prev = live[live.length - 1];
    if (prev) node.edge = connect(prev, node);
    live.push(node);
    applyRanks();
    if (live.length > MAX_ALIVE) {
      const old = live.shift();
      setTimeout(() => {
        old.el.remove();
        if (old.edge) old.edge.remove();
      }, 1500);
      // the next node's edge pointed at the removed one; it is already at 0 opacity
      const first = live[0];
      if (first && first.edge) {
        const e = first.edge;
        first.edge = null;
        setTimeout(() => e.remove(), 1500);
      }
    }
  }

  let events = [];
  let idx = 0;
  function tick() {
    const t = audio.currentTime + LEAD;
    while (idx < events.length && events[idx].t <= t) {
      spawn(events[idx]);
      idx++;
    }
    requestAnimationFrame(tick);
  }

  playBtn.addEventListener("click", async () => {
    playBtn.style.display = "none";
    try {
      const res = await fetch(LRC_URL);
      events = buildEvents(parseLRC(await res.text()));
    } catch (e) {
      console.error("LRC load failed", e);
    }
    const fogBtn = document.getElementById("btn");
    // fog comes
    fogBtn.click();
    // after breath, wipe
    setTimeout(() => { fogBtn.click(); }, 3000);
    // after wipe completes, hide fog and start song + lyric sync
    setTimeout(() => {
      const fa = document.getElementById("fogA");
      const fb = document.getElementById("fogB");
      if (fa) fa.style.display = "none";
      if (fb) fb.style.display = "none";
      if (events.length) audio.currentTime = Math.max(0, events[0].t - 0.1);
      audio.play();
      requestAnimationFrame(tick);
    }, 5000);
  });
})();
