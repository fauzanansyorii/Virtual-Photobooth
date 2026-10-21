/* ============ Core ============ */
const $ = (s) => document.querySelector(s),
  $$ = (s) => [...document.querySelectorAll(s)];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms)),
  uid = () => Math.random().toString(36).slice(2, 8);
const W = 620,
  H = 1738; // logical canvas size; screen size is CSS-scaled only
let peer,
  conn,
  local,
  isHost = false,
  running = false,
  editBackGuard = false,
  editUrl = "",
  cfg = { timer: 3 },
  canvas,
  strip,
  remote = false;
const show = (id) =>
  $$(".screen").forEach((s) => s.classList.toggle("on", s.id === id));
function guardEditBack() {
  if (editBackGuard) return;
  editUrl = location.href;
  history.pushState({ photoboothEditGuard: true }, "", editUrl);
  editBackGuard = true;
}
window.addEventListener("popstate", () => {
  if (!editBackGuard || !$("#edit").classList.contains("on")) return;
  history.pushState({ photoboothEditGuard: true }, "", editUrl);
  $("#backConfirm").hidden = false;
  $("#stayEditing").focus();
});
$("#stayEditing").onclick = () => {
  $("#backConfirm").hidden = true;
  $("#del").focus();
};
$("#leaveEdit").onclick = () => {
  $("#backConfirm").hidden = true;
  editBackGuard = false;
  history.replaceState(null, "", editUrl);
  show("lobby");
};
const send = (m) => {
  if (conn && conn.open) conn.send(m);
};
const toast = (t) => {
  const e = $("#toast");
  e.textContent = t;
  e.classList.add("on");
  setTimeout(() => e.classList.remove("on"), 2200);
};
const thr = (f, ms = 40) => {
  let l = 0;
  return (...a) => {
    const n = Date.now();
    if (n - l > ms) {
      l = n;
      f(...a);
    }
  };
};

/* ============ 1. Lobby + PeerJS ============ */
async function cam() {
  if (local) return;
  local = await navigator.mediaDevices.getUserMedia({
    video: {
      facingMode: "user",
      width: { ideal: 960 },
      height: { ideal: 720 },
    },
    audio: false,
  });
  await setVideoStream($("#lv"), local);
}
function waitForVideo(video, timeout = 15000) {
  if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && video.videoWidth)
    return Promise.resolve();

  return new Promise((resolve, reject) => {
    const cleanup = () => {
      clearTimeout(timer);
      ["loadeddata", "canplay", "playing", "resize"].forEach((event) =>
        video.removeEventListener(event, check),
      );
    };
    const check = () => {
      if (
        video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA &&
        video.videoWidth > 0
      ) {
        cleanup();
        resolve();
      }
    };
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error("Camera video did not become ready"));
    }, timeout);
    ["loadeddata", "canplay", "playing", "resize"].forEach((event) =>
      video.addEventListener(event, check),
    );
    check();
  });
}
async function setVideoStream(video, stream) {
  video.srcObject = stream;
  try {
    await video.play();
  } catch (e) {
    // Autoplay can reject before the stream's first frame; readiness is checked below.
  }
  await waitForVideo(video);
}
function wire() {
  conn.on("open", () => {
    document.body.classList.toggle("guest", !isHost);
    show("booth");
    if (isHost) send({ t: "cfg", ...cfg });
  });
  conn.on("data", onData);
  conn.on("close", () => {
    $("#st").textContent = "Partner left";
  });
}
$("#create").onclick = async () => {
  try {
    await cam();
  } catch (e) {
    return toast("Allow camera access to continue");
  }
  isHost = true;
  const id = "ldr" + uid();
  peer = new Peer(id);
  peer.on("open", () => {
    const inviteUrl = new URL(location.href);
    inviteUrl.hash = "";
    inviteUrl.searchParams.set("room", id);
    $("#link").value = inviteUrl.toString();
    $("#hostCode").textContent = id.slice(3).toUpperCase();
    $("#share").hidden = false;
    $("#create").hidden = true;
    $("#joinCodePanel").hidden = true;
  });
  peer.on("connection", (c) => {
    conn = c;
    wire();
  });
  peer.on("call", (c) => {
    c.answer(local);
    c.on("stream", (s) => {
      setVideoStream($("#rv"), s)
        .then(() => ($("#st").textContent = "Connected"))
        .catch(() => ($("#st").textContent = "Camera unavailable"));
    });
  });
  peer.on("error", (e) => toast("Connection error: " + e.type));
};
$("#copy").onclick = () => {
  const u = $("#link").value;
  navigator.share
    ? navigator.share({ url: u, title: "Join my photobooth" }).catch(() => {})
    : navigator.clipboard.writeText(u).then(() => toast("Link copied"));
};
const inviteId =
  new URLSearchParams(location.search).get("room") || location.hash.slice(1);
if (inviteId) {
  $("#create").hidden = true;
  $("#inv").hidden = false;
}
async function joinRoom(hid) {
  if (!/^ldr[a-z0-9]{6}$/i.test(hid))
    return toast("Enter a valid 6-character room code");
  try {
    await cam();
  } catch (e) {
    return toast("Allow camera access to continue");
  }
  $("#join").disabled = true;
  $("#joinByCode").disabled = true;
  peer = new Peer();
  peer.on("open", () => {
    conn = peer.connect(hid, { reliable: true });
    wire();
    peer.call(hid, local).on("stream", (s) => {
      setVideoStream($("#rv"), s)
        .then(() => ($("#st").textContent = "Connected"))
        .catch(() => ($("#st").textContent = "Camera unavailable"));
    });
  });
  peer.on("error", (e) => {
    toast("Connection error: " + e.type);
    $("#join").disabled = false;
    $("#joinByCode").disabled = false;
  });
}
$("#join").onclick = () => joinRoom(inviteId);
$("#joinByCode").onclick = () => {
  const code = $("#roomCode").value.trim().replace(/\s+/g, "");
  joinRoom("ldr" + code.toLowerCase());
};
$("#roomCode").onkeydown = (e) => {
  if (e.key === "Enter") $("#joinByCode").click();
};

/* ============ 2. Setup (synced) ============ */
$("#tmr").innerHTML = [3, 5, 10]
  .map(
    (n) =>
      `<button class="opt" data-k="${n}"><span class="tm">${n}</span>${n} sec</button>`,
  )
  .join("");
function setCfg(p, b) {
  Object.assign(cfg, p);
  $("#vstage").className = "side";
  $$("#tmr .opt").forEach((o) =>
    o.classList.toggle("on", +o.dataset.k === cfg.timer),
  );
  if (b) send({ t: "cfg", ...p });
}
$("#tmr").onclick = (e) => {
  const b = e.target.closest("[data-k]");
  b && !running && setCfg({ timer: +b.dataset.k }, 1);
};
setCfg({});

/* ============ 3. Shoot (host drives & stitches, guest follows) ============ */
$("#start").onclick = () => (isHost ? run() : send({ t: "req" }));
const tick = (n, i) => {
  $("#cd").textContent = n;
  $("#cnt").textContent = `Photo ${i + 1} of 4`;
};
const flash = () => {
  $("#cd").textContent = "";
  const f = $("#fl");
  f.classList.remove("go");
  void f.offsetWidth;
  f.classList.add("go");
};
function cover(x, v, dx, dy, w, h, m) {
  const sw = v.videoWidth || w,
    sh = v.videoHeight || h,
    s = Math.max(w / sw, h / sh),
    cw = w / s,
    ch = h / s;
  x.save();
  if (m) {
    x.translate(dx + w, dy);
    x.scale(-1, 1);
    x.drawImage(v, (sw - cw) / 2, (sh - ch) / 2, cw, ch, 0, 0, w, h);
  } else x.drawImage(v, (sw - cw) / 2, (sh - ch) / 2, cw, ch, dx, dy, w, h);
  x.restore();
}
function capture() {
  // host = left/top
  const c = document.createElement("canvas");
  c.width = 560;
  c.height = 400;
  const x = c.getContext("2d");
  x.fillStyle = "#e9dfd6";
  x.fillRect(0, 0, 560, 400);
  cover(x, $("#lv"), 0, 0, 280, 400, 1);
  cover(x, $("#rv"), 280, 0, 280, 400, 1);
  return c.toDataURL("image/jpeg", 0.9);
}
async function run() {
  if (running) return;
  running = true;
  $("#start").disabled = true;
  $("#st").textContent = "Waiting for cameras";
  try {
    await Promise.all([waitForVideo($("#lv")), waitForVideo($("#rv"))]);
  } catch (e) {
    running = false;
    $("#start").disabled = false;
    $("#st").textContent = "Camera not ready";
    return toast("Wait until both cameras are connected, then try again");
  }
  $("#st").textContent = "Connected";
  send({ t: "go" });
  const shots = [];
  for (let i = 0; i < 4; i++) {
    for (let n = cfg.timer; n > 0; n--) {
      tick(n, i);
      send({ t: "tick", n, i });
      await sleep(1000);
    }
    flash();
    send({ t: "flash" });
    shots.push(capture());
    await sleep(600);
  }
  send({ t: "photos", list: shots });
  $("#cnt").textContent = "";
  await startEdit(shots);
}

/* ============ 4. Collaborative editor ============ */
const F = fabric.Image.filters;
const FIL = {
  orig: { l: "Original", css: "none", f: () => [] },
  mono: { l: "Mono", css: "grayscale(1)", f: () => [new F.Grayscale()] },
  retro: {
    l: "Retro",
    css: "sepia(.6) contrast(1.1)",
    f: () => [new F.Sepia(), new F.Contrast({ contrast: 0.1 })],
  },
  cool: {
    l: "Cool",
    css: "hue-rotate(15deg) brightness(1.05) saturate(.9)",
    f: () => [
      new F.BlendColor({ color: "#7fb0ff", mode: "tint", alpha: 0.22 }),
    ],
  },
  warm: {
    l: "Warm",
    css: "sepia(.3) saturate(1.3)",
    f: () => [
      new F.BlendColor({ color: "#ffae6b", mode: "tint", alpha: 0.22 }),
    ],
  },
  film: {
    l: "Film",
    css: "contrast(1.15) saturate(.8) brightness(.95)",
    f: () => [
      new F.Saturation({ saturation: -0.2 }),
      new F.Contrast({ contrast: 0.15 }),
      new F.Noise({ noise: 28 }),
    ],
  },
};
const FR = {
  beige: { l: "Beige", c: "#efe4d3", css: "#efe4d3" },
  white: { l: "White", c: "#ffffff", css: "#fff" },
  sage: { l: "Sage", c: "#c5d1bb", css: "#c5d1bb" },
  blush: { l: "Blush", c: "#f4d8dc", css: "#f4d8dc" },
  lavender: { l: "Lavender", c: "#e5dcf2", css: "#e5dcf2" },
  butter: { l: "Butter", c: "#f5e8b8", css: "#f5e8b8" },
  sky: { l: "Sky", c: "#d9eaf2", css: "#d9eaf2" },
  check: {
    l: "Check",
    p: "check",
    css: "conic-gradient(#f3d6da 25%,#fff 0 50%,#f3d6da 0 75%,#fff 0) 0 0/16px 16px",
  },
  gingham: {
    l: "Gingham",
    p: "gingham",
    css: "conic-gradient(#d9eaf2 25%,#fff 0 50%,#d9eaf2 0 75%,#fff 0) 0 0/16px 16px",
  },
  hearts: {
    l: "Hearts",
    p: "hearts",
    css: "radial-gradient(circle at 50% 60%,#dba5ad 28%,transparent 30%) 0 0/16px 16px,#fff6f5",
    t: "♡",
  },
  stars: {
    l: "Stars",
    p: "stars",
    css: "radial-gradient(circle,#d4ad54 1.5px,transparent 2px) 0 0/12px 12px,#fffaf0",
    t: "✦",
  },
  doodle: { l: "Doodle", p: "doodle", css: "#fbf3ea", t: "♡✦" },
};
function tile(k) {
  const t = document.createElement("canvas"),
    x = t.getContext("2d");
  if (k === "check" || k === "gingham") {
    t.width = t.height = 48;
    x.fillStyle = "#fff";
    x.fillRect(0, 0, 48, 48);
    x.fillStyle = k === "check" ? "#f3d6da" : "#d9eaf2";
    x.fillRect(0, 0, 24, 24);
    x.fillRect(24, 24, 24, 24);
  } else if (k === "hearts" || k === "stars") {
    t.width = t.height = 96;
    x.fillStyle = k === "hearts" ? "#fff6f5" : "#fffaf0";
    x.fillRect(0, 0, 96, 96);
    x.fillStyle = k === "hearts" ? "#dba5ad" : "#d4ad54";
    x.font = "24px serif";
    x.fillText(k === "hearts" ? "♡" : "✦", 8, 30);
    x.fillText(k === "hearts" ? "♡" : "✦", 54, 72);
    x.font = "16px serif";
    x.fillText(k === "hearts" ? "♡" : "✦", 60, 22);
    x.fillText(k === "hearts" ? "♡" : "✦", 22, 84);
  } else {
    t.width = t.height = 96;
    x.fillStyle = "#fbf3ea";
    x.fillRect(0, 0, 96, 96);
    x.fillStyle = "#dba5ad";
    x.font = "22px serif";
    x.fillText("♡", 10, 30);
    x.fillText("✦", 58, 24);
    x.fillText("☁", 16, 82);
    x.fillText("✿", 62, 78);
  }
  return t;
}
function setFrame(k, b) {
  const f = FR[k];
  canvas.backgroundColor =
    f.c || new fabric.Pattern({ source: tile(f.p), repeat: "repeat" });
  canvas.requestRenderAll();
  curFr = k;
  renderPanel();
  if (b) send({ t: "frame", k });
}
function setFilter(k, b) {
  strip.filters = FIL[k].f();
  strip.applyFilters();
  canvas.requestRenderAll();
  curFl = k;
  renderPanel();
  if (b) send({ t: "filter", k });
}
let curFr = "beige",
  curFl = "orig",
  tab = "frame",
  sub = "text",
  font = 0,
  color = "#4a3b3b",
  bw = 5;
const FONTS = ["Cormorant Garamond", "Dancing Script", "Inter"],
  COLORS = [
    "#4a3b3b",
    "#ffffff",
    "#e8a0ac",
    "#c98b94",
    "#9fb48f",
    "#8fb3d9",
    "#f2c879",
  ];
const EMO = [
  "💗",
  "✨",
  "🌸",
  "🎀",
  "⭐",
  "🍓",
  "🧸",
  "🌙",
  "🦋",
  "💌",
  "🐰",
  "☁️",
  "🍒",
  "🫶",
  "💍",
  "🎞️",
];

async function startEdit(list) {
  const imgs = await Promise.all(
    list.map(
      (s) =>
        new Promise((r) => {
          const i = new Image();
          i.onload = () => r(i);
          i.src = s;
        }),
    ),
  );
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const x = c.getContext("2d");
  imgs.forEach((im, i) => x.drawImage(im, 30, 30 + i * 416));
  x.fillStyle = "#6b5b5b";
  x.textAlign = "center";
  x.font = 'italic 34px "Cormorant Garamond",serif';
  x.fillText("♡ " + new Date().toLocaleDateString() + " ♡", W / 2, H - 24);
  show("edit");
  guardEditBack();
  fabric.Object.prototype.set({
    transparentCorners: false,
    cornerColor: "#c98b94",
    borderColor: "#c98b94",
    cornerStyle: "circle",
    cornerSize: 18,
    touchCornerSize: 46,
    padding: 6,
  });
  canvas = new fabric.Canvas("c", {
    width: W,
    height: H,
    preserveObjectStacking: true,
    selection: false,
  });
  strip = new fabric.Image(c, {
    left: 0,
    top: 0,
    selectable: false,
    evented: false,
    id: "strip",
    objectCaching: false,
  });
  remote = true;
  canvas.add(strip);
  remote = false;
  bindSync();
  fit();
  setFrame("beige");
  addEventListener("resize", fit);
}
function fit() {
  // CSS-only scaling keeps logical coordinates identical on every device
  const s =
    Math.min($("#stage").clientWidth / W, $("#stage").clientHeight / H) * 0.98;
  canvas.setDimensions(
    { width: W * s + "px", height: H * s + "px" },
    { cssOnly: true },
  );
  canvas.calcOffset();
}

/* ---- Fabric <-> PeerJS sync ---- */
const find = (id) => canvas.getObjects().find((o) => o.id === id);
function bindSync() {
  canvas.on("object:added", (e) => {
    const o = e.target;
    if (remote || o.id === "strip") return;
    o.id = o.id || uid();
    send({ t: "add", o: o.toObject(["id"]) });
  });
  canvas.on("object:removed", (e) => {
    const o = e.target;
    if (!remote && o.id) send({ t: "del", id: o.id });
  });
  const mod = (o) => {
    if (!o || !o.id) return;
    const p = {
      left: o.left,
      top: o.top,
      scaleX: o.scaleX,
      scaleY: o.scaleY,
      angle: o.angle,
    };
    if (/text/.test(o.type)) {
      p.text = o.text;
      p.fill = o.fill;
    }
    send({ t: "mod", id: o.id, p });
  };
  const live = thr((e) => mod(e.target));
  ["moving", "scaling", "rotating"].forEach((n) =>
    canvas.on("object:" + n, live),
  );
  canvas.on("object:modified", (e) => mod(e.target));
  canvas.on("text:changed", (e) => mod(e.target));
}
function onRemote(m) {
  if (m.t === "add")
    fabric.util.enlivenObjects([m.o], (a) => {
      const o = a[0];
      o.id = m.o.id;
      remote = true;
      canvas.add(o);
      remote = false;
      canvas.requestRenderAll();
    });
  else if (m.t === "mod") {
    const o = find(m.id);
    if (o) {
      o.set(m.p);
      o.setCoords();
      canvas.requestRenderAll();
    }
  } else if (m.t === "del") {
    const o = find(m.id);
    if (o) {
      remote = true;
      canvas.remove(o);
      remote = false;
    }
  } else if (m.t === "frame") setFrame(m.k);
  else if (m.t === "filter") setFilter(m.k);
}
function onData(m) {
  if (m.t === "cfg") setCfg(m);
  else if (m.t === "req" && isHost) run();
  else if (m.t === "go") {
    running = true;
    $("#start").disabled = true;
  } else if (m.t === "tick") tick(m.n, m.i);
  else if (m.t === "flash") flash();
  else if (m.t === "photos") {
    $("#cnt").textContent = "";
    startEdit(m.list);
  } else if (canvas) onRemote(m);
}

/* ---- Tools UI ---- */
function renderPanel() {
  let h = "";
  if (tab === "frame")
    h =
      '<div class="row" data-g="frame">' +
      Object.entries(FR)
        .map(
          ([k, f]) =>
            `<button class="opt ${k === curFr ? "on" : ""}" data-v="${k}"><span class="sw" style="background:${f.css}">${f.t || ""}</span>${f.l}</button>`,
        )
        .join("") +
      "</div>";
  if (tab === "filter")
    h =
      '<div class="row" data-g="filter">' +
      Object.entries(FIL)
        .map(
          ([k, f]) =>
            `<button class="opt ${k === curFl ? "on" : ""}" data-v="${k}"><span class="th" style="filter:${f.css}"></span>${f.l}</button>`,
        )
        .join("") +
      "</div>";
  if (tab === "deco") {
    const cols =
      '<div class="row" data-g="color">' +
      COLORS.map(
        (c) =>
          `<span class="dot ${c === color ? "on" : ""}" data-v="${c}" style="background:${c}"></span>`,
      ).join("") +
      "</div>";
    h =
      '<div class="row" data-g="sub">' +
      [
        ["text", "Aa Text"],
        ["sticker", "♡ Stickers"],
        ["draw", "✎ Draw"],
      ]
        .map(
          ([k, l]) =>
            `<button class="chip ${k === sub ? "on" : ""}" data-v="${k}">${l}</button>`,
        )
        .join("") +
      "</div>";
    if (sub === "text")
      h +=
        '<div class="row" data-g="font">' +
        FONTS.map(
          (f, i) =>
            `<button class="chip ${i === font ? "on" : ""}" data-v="${i}" style="font-family:'${f}';font-style:${i ? "normal" : "italic"}">Aa</button>`,
        ).join("") +
        '<button class="chip" data-g="addtext" data-v="1">+ Add text</button></div>' +
        cols;
    if (sub === "sticker")
      h +=
        '<div class="row" data-g="emoji">' +
        EMO.map((e) => `<button class="em" data-v="${e}">${e}</button>`).join(
          "",
        ) +
        "</div>";
    if (sub === "draw")
      h +=
        '<div class="row" data-g="size">' +
        [3, 8, 16]
          .map(
            (s) =>
              `<button class="opt ${s === bw ? "on" : ""}" data-v="${s}" style="min-width:48px;padding:6px"><span style="width:${s + 6}px;height:${s + 6}px;border-radius:50%;background:${color}"></span></button>`,
          )
          .join("") +
        "</div>" +
        cols;
  }
  $("#panel").innerHTML = h;
  canvas.isDrawingMode = tab === "deco" && sub === "draw";
  if (canvas.isDrawingMode) {
    canvas.freeDrawingBrush = new fabric.PencilBrush(canvas);
    canvas.freeDrawingBrush.color = color;
    canvas.freeDrawingBrush.width = bw;
  }
}
const put = (o) => {
  o.set({ left: W / 2, top: H / 2, originX: "center", originY: "center" });
  canvas.add(o);
  canvas.setActiveObject(o);
};
$("#panel").onclick = async (e) => {
  const b = e.target.closest("[data-v]");
  if (!b) return;
  const g = b.closest("[data-g]").dataset.g,
    v = b.dataset.v;
  if (g === "frame") setFrame(v, 1);
  else if (g === "filter") setFilter(v, 1);
  else if (g === "sub") {
    sub = v;
    renderPanel();
  } else if (g === "font") {
    font = +v;
    renderPanel();
  } else if (g === "color") {
    color = v;
    const a = canvas.getActiveObject();
    if (a && /text/.test(a.type)) {
      a.set("fill", v);
      canvas.requestRenderAll();
      send({ t: "mod", id: a.id, p: { fill: v, text: a.text } });
    }
    renderPanel();
  } else if (g === "size") {
    bw = +v;
    renderPanel();
  } else if (g === "emoji") put(new fabric.Text(v, { fontSize: 96 }));
  else if (g === "addtext") {
    await document.fonts.load(`40px "${FONTS[font]}"`);
    put(
      new fabric.IText("our day ♡", {
        fontFamily: FONTS[font],
        fontStyle: font ? "normal" : "italic",
        fontSize: 68,
        fill: color,
      }),
    );
  }
};
$$("nav button").forEach(
  (b) =>
    (b.onclick = () => {
      tab = b.dataset.tab;
      $$("nav button").forEach((x) => x.classList.toggle("on", x === b));
      renderPanel();
    }),
);
$("#del").onclick = () => {
  const a = canvas.getActiveObject();
  if (a) {
    canvas.remove(a);
    canvas.discardActiveObject();
    canvas.requestRenderAll();
  } else toast("Tap an item first");
};

/* ============ 5. Export ============ */
$("#dl").onclick = () => {
  canvas.discardActiveObject();
  canvas.requestRenderAll();
  const a = document.createElement("a");
  a.download = "photostrip-" + Date.now() + ".png";
  a.href = canvas.toDataURL({ format: "png", multiplier: 2 });
  a.click();
};
