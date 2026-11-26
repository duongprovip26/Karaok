import {
  login, roomRef, roomExists, sortQueue, addToQueue, prioritize, removeFromQueue,
  searchYouTube, escapeHtml, randomScore,
  get, set, update, remove, onValue, onChildAdded, onDisconnect, serverTimestamp,
} from "./common.js";

const $ = (s) => document.querySelector(s);
let code = null;
let player = null, playerReady = false;
let queue = [];
let nowPlaying = null;
let transitioning = false;
let menuItem = null;
let lastFocus = null;

// ---------- Khởi động ----------
init().catch((e) => toast("Lỗi khởi động: " + e.message, 8000));

async function init() {
  await login();
  code = await getOrCreateRoom();
  const joinUrl = `${location.origin}/?room=${code}`;
  $("#roomCode").textContent = code;
  $("#idleCode").textContent = code;
  $("#roomUrl").textContent = location.host;
  $("#idleUrl").textContent = location.host;
  $("#qr").src = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&margin=0&data=${encodeURIComponent(joinUrl)}`;

  await update(roomRef(code), { tvOnline: true, nowPlaying: null });
  onDisconnect(roomRef(code, "tvOnline")).set(false);

  onValue(roomRef(code, "queue"), (snap) => {
    queue = sortQueue(snap.val());
    renderQueue();
    maybeAutoPlay();
  });

  // Lệnh điều khiển từ điện thoại: xóa lệnh cũ rồi lắng nghe lệnh mới
  await remove(roomRef(code, "commands"));
  onChildAdded(roomRef(code, "commands"), (snap) => {
    handleCommand(snap.val()?.cmd);
    remove(snap.ref);
  });

  loadYouTubeApi();
  focusDefault();
}

async function getOrCreateRoom() {
  let c = localStorage.getItem("roomCode");
  if (c && (await roomExists(c))) return c;
  for (let i = 0; i < 20; i++) {
    c = String(Math.floor(100000 + Math.random() * 900000));
    if (!(await roomExists(c))) break;
  }
  await set(roomRef(c), { createdAt: serverTimestamp() });
  localStorage.setItem("roomCode", c);
  return c;
}

// ---------- YouTube player ----------
function loadYouTubeApi() {
  window.onYouTubeIframeAPIReady = () => {
    player = new YT.Player("player", {
      width: "100%", height: "100%",
      playerVars: {
        autoplay: 1, controls: 0, rel: 0, modestbranding: 1, playsinline: 1,
        iv_load_policy: 3, fs: 0, disablekb: 1, origin: location.origin,
      },
      events: {
        onReady: () => { playerReady = true; maybeAutoPlay(); },
        onStateChange: (e) => {
          if (e.data === YT.PlayerState.ENDED) finishSong(true);
          if (e.data === YT.PlayerState.PLAYING && nowPlaying && nowPlaying.title === "Video YouTube") {
            const t = player.getVideoData?.().title; // lấy tên thật khi bài thêm bằng link
            if (t) { nowPlaying.title = t; $("#nowTitle").textContent = t; update(roomRef(code, "nowPlaying"), { title: t }); }
          }
          if (e.data === YT.PlayerState.PLAYING || e.data === YT.PlayerState.PAUSED) {
            if (nowPlaying) update(roomRef(code, "nowPlaying"), { paused: e.data === YT.PlayerState.PAUSED });
          }
        },
        onError: () => {
          toast("Video này không phát được, chuyển bài khác");
          finishSong(false);
        },
      },
    });
  };
  const s = document.createElement("script");
  s.src = "https://www.youtube.com/iframe_api";
  document.head.appendChild(s);
}

function maybeAutoPlay() {
  if (playerReady && !nowPlaying && !transitioning && queue.length) playNext();
}

async function playNext() {
  const item = queue[0];
  if (!item) return showIdle();
  nowPlaying = item;
  await remove(roomRef(code, `queue/${item.key}`));
  await set(roomRef(code, "nowPlaying"), {
    key: item.key, videoId: item.videoId, title: item.title, by: item.by || "", thumb: item.thumb || "",
    paused: false, startedAt: serverTimestamp(),
  });
  $("#idle").classList.add("hidden");
  $("#nowBar").classList.remove("hidden");
  $("#nowTitle").textContent = item.title;
  $("#nowBy").textContent = item.by ? `– ${item.by}` : "";
  player.loadVideoById(item.videoId);
  setTimeout(restoreFocus, 800); // iframe có thể giật focus
}

function showIdle() {
  nowPlaying = null;
  $("#idle").classList.remove("hidden");
  $("#nowBar").classList.add("hidden");
  try { player?.stopVideo(); } catch (_) {}
}

async function finishSong(withScore) {
  if (!nowPlaying || transitioning) return;
  const done = nowPlaying;
  transitioning = true;
  nowPlaying = null;
  set(roomRef(code, "nowPlaying"), null);
  let wait = 1000;
  if (withScore) {
    const { score, comment } = randomScore();
    set(roomRef(code, "lastScore"), { score, comment, title: done.title, by: done.by || "", ts: Date.now() });
    showScore(score, comment, done);
    wait = 7000;
  }
  setTimeout(() => {
    transitioning = false;
    $("#scoreLayer").classList.add("hidden");
    if (queue.length) playNext(); else showIdle();
  }, wait);
}

function showScore(score, comment, song) {
  $("#scSong").textContent = song.title;
  $("#scCmt").textContent = comment;
  $("#scBy").textContent = song.by ? `Người hát: ${song.by}` : "";
  $("#scoreLayer").classList.remove("hidden");
  const el = $("#scNum");
  const t0 = performance.now();
  const tick = (t) => {
    const p = Math.min(1, (t - t0) / 1500);
    el.textContent = Math.round(score * (1 - Math.pow(1 - p, 3)));
    if (p < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

function handleCommand(cmd) {
  if (!player || !playerReady) return;
  if (cmd === "skip") {
    if (nowPlaying) finishSong(false); else maybeAutoPlay();
  } else if (cmd === "toggle") {
    const st = player.getPlayerState();
    st === YT.PlayerState.PLAYING ? player.pauseVideo() : player.playVideo();
  } else if (cmd === "replay") {
    player.seekTo(0, true); player.playVideo();
  }
}

// ---------- Hàng chờ ----------
function renderQueue() {
  $("#queueCount").textContent = queue.length;
  const ol = $("#queue");
  if (!queue.length) {
    ol.innerHTML = `<li class="empty">Chưa có bài nào. Dùng điện thoại hoặc nút 🔍 để thêm.</li>`;
    return;
  }
  ol.innerHTML = queue.map((it, i) => `
    <li class="focusable" tabindex="0" data-key="${it.key}">
      <img src="${escapeHtml(it.thumb)}" alt="">
      <div><div class="t">${i + 1}. ${escapeHtml(it.title)}</div><div class="by">${escapeHtml(it.by || "")}</div></div>
    </li>`).join("");
  ol.querySelectorAll("li[data-key]").forEach((li) => li.addEventListener("click", () => openMenu(li.dataset.key)));
}

function openMenu(key) {
  menuItem = queue.find((q) => q.key === key);
  if (!menuItem) return;
  lastFocus = document.activeElement;
  $("#menuTitle").textContent = menuItem.title;
  $("#menuLayer").classList.remove("hidden");
  $("#mTop").focus();
}
function closeMenu() {
  $("#menuLayer").classList.add("hidden");
  restoreFocus();
}
$("#mTop").onclick = async () => { await prioritize(code, menuItem.key); toast("Đã ưu tiên lên đầu"); closeMenu(); };
$("#mDel").onclick = async () => { await removeFromQueue(code, menuItem.key); toast("Đã xóa"); lastFocus = null; closeMenu(); };
$("#mClose").onclick = closeMenu;

// ---------- Tìm kiếm ----------
let results = [];
function openSearch(text) {
  $("#searchLayer").classList.remove("hidden");
  if (text !== undefined) $("#q").value = text;
  $("#sGo").focus();
}
function closeSearch() {
  $("#searchLayer").classList.add("hidden");
  restoreFocus();
}
async function doSearch() {
  const text = $("#q").value.trim();
  if (!text) return $("#q").focus();
  $("#sStatus").textContent = `Đang tìm "${text}"…`;
  $("#results").innerHTML = "";
  try {
    results = await searchYouTube(text);
    $("#sStatus").textContent = results.length ? `Kết quả cho "${text}" – bấm OK để thêm vào hàng chờ` : "Không tìm thấy bài nào";
    $("#results").innerHTML = results.map((r, i) => `
      <div class="card focusable" tabindex="0" data-i="${i}">
        <img src="${escapeHtml(r.thumb)}" alt="">
        <div class="t">${escapeHtml(r.title)}</div><div class="c">${escapeHtml(r.channel)}</div>
      </div>`).join("");
    $("#results").querySelectorAll(".card").forEach((c) => c.addEventListener("click", async () => {
      const r = results[+c.dataset.i];
      await addToQueue(code, r, "TV");
      toast("Đã thêm: " + r.title);
    }));
    $("#results .card")?.focus();
  } catch (e) {
    $("#sStatus").textContent = e.message;
  }
}
$("#btnSearch").onclick = () => openSearch();
$("#sGo").onclick = doSearch;
$("#sClose").onclick = closeSearch;
$("#q").addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); doSearch(); } });

// ---------- Giọng nói ----------
function startVoice() {
  lastFocus = lastFocus || document.activeElement;
  if (window.Android?.startVoice) return window.Android.startVoice();
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) return toast("Thiết bị không hỗ trợ tìm bằng giọng nói");
  const r = new SR();
  r.lang = "vi-VN";
  r.onresult = (e) => window.onVoiceResult(e.results[0][0].transcript);
  r.onerror = () => toast("Không nghe rõ, thử lại nhé");
  r.start();
  toast("Đang nghe… hãy nói tên bài hát");
}
window.onVoiceResult = (text) => { openSearch(text); doSearch(); };
window.onVoiceError = (msg) => toast(msg || "Không dùng được giọng nói");
$("#btnVoice").onclick = startVoice;
$("#sVoice").onclick = startVoice;

// ---------- Nút điều khiển ----------
$("#btnPause").onclick = () => handleCommand("toggle");
$("#btnSkip").onclick = () => handleCommand("skip");
$("#btnReplay").onclick = () => handleCommand("replay");
$("#btnFull").onclick = () => { document.body.classList.add("full"); toast("Bấm phím bất kỳ để hiện lại menu"); };

// ---------- Điều hướng bằng remote (D-pad) ----------
function activeLayer() {
  if (!$("#menuLayer").classList.contains("hidden")) return $("#menuLayer");
  if (!$("#searchLayer").classList.contains("hidden")) return $("#searchLayer");
  return $("#app");
}
function focusables() {
  return [...activeLayer().querySelectorAll(".focusable")].filter((el) => el.offsetParent !== null);
}
function focusDefault() { $("#btnSearch").focus(); }
function restoreFocus() {
  const layer = activeLayer();
  if (lastFocus && document.contains(lastFocus) && layer.contains(lastFocus) && lastFocus.offsetParent) lastFocus.focus();
  else if (layer === $("#app")) focusDefault();
  else focusables()[0]?.focus();
  if (layer === $("#app")) lastFocus = null;
}

function moveFocus(dir) {
  const cur = document.activeElement;
  const list = focusables();
  if (!list.includes(cur)) return list[0]?.focus();
  const a = cur.getBoundingClientRect();
  const ac = { x: a.left + a.width / 2, y: a.top + a.height / 2 };
  let best = null, bestD = Infinity;
  for (const el of list) {
    if (el === cur) continue;
    const b = el.getBoundingClientRect();
    const bc = { x: b.left + b.width / 2, y: b.top + b.height / 2 };
    const dx = bc.x - ac.x, dy = bc.y - ac.y;
    let main, cross;
    if (dir === "left") { if (b.right > a.left + 4) continue; main = -dx; cross = Math.abs(dy); }
    if (dir === "right") { if (b.left < a.right - 4) continue; main = dx; cross = Math.abs(dy); }
    if (dir === "up") { if (b.bottom > a.top + 4) continue; main = -dy; cross = Math.abs(dx); }
    if (dir === "down") { if (b.top < a.bottom - 4) continue; main = dy; cross = Math.abs(dx); }
    const d = main + cross * 2;
    if (d < bestD) { bestD = d; best = el; }
  }
  if (best) { best.focus(); best.scrollIntoView({ block: "nearest", inline: "nearest" }); }
}

document.addEventListener("keydown", (e) => {
  const k = e.key;
  if (document.body.classList.contains("full") && !k.startsWith("Media")) {
    document.body.classList.remove("full");
    e.preventDefault();
    return restoreFocus();
  }
  if (k === "MediaPlayPause" || k === "MediaPlay" || k === "MediaPause") { e.preventDefault(); return handleCommand("toggle"); }
  if (k === "MediaTrackNext" || k === "MediaFastForward") { e.preventDefault(); return handleCommand("skip"); }
  const dirs = { ArrowLeft: "left", ArrowRight: "right", ArrowUp: "up", ArrowDown: "down" };
  if (dirs[k]) {
    const inInput = document.activeElement?.tagName === "INPUT";
    if (inInput && (k === "ArrowLeft" || k === "ArrowRight")) {
      const inp = document.activeElement;
      const atEdge = k === "ArrowRight" ? inp.selectionStart >= inp.value.length : inp.selectionStart <= 0;
      if (!atEdge) return;
    }
    e.preventDefault();
    return moveFocus(dirs[k]);
  }
  if (k === "Enter" && document.activeElement?.tagName !== "INPUT" && document.activeElement?.tagName !== "BUTTON") {
    e.preventDefault();
    document.activeElement?.click();
  }
});

// Nút Back trên remote (app Android gọi hàm này; trả về true nếu đã xử lý)
window.onTvBack = () => {
  if (!$("#scoreLayer").classList.contains("hidden")) { $("#scoreLayer").classList.add("hidden"); return true; }
  if (!$("#menuLayer").classList.contains("hidden")) { closeMenu(); return true; }
  if (!$("#searchLayer").classList.contains("hidden")) { closeSearch(); return true; }
  if (document.body.classList.contains("full")) { document.body.classList.remove("full"); restoreFocus(); return true; }
  return false;
};
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" || e.key === "GoBack" || e.key === "BrowserBack") { if (window.onTvBack()) e.preventDefault(); }
});

// ---------- Tiện ích ----------
let toastTimer;
function toast(msg, ms = 3000) {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.remove("hidden");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.add("hidden"), ms);
}
