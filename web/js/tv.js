import {
  login, roomRef, roomExists, sortQueue, randomScore,
  set, update, remove, onValue, onChildAdded, onDisconnect, serverTimestamp,
} from "./common.js";

// Màn hình TV: chỉ phát video + mã QR nhỏ. Mọi thao tác chọn bài làm trên điện thoại.
// Remote: OK / Play-Pause = dừng/tiếp, Next = bỏ qua, Back = thoát.

const $ = (s) => document.querySelector(s);
let code = null;
let player = null, playerReady = false;
let queue = [];
let knownKeys = null;
let nowPlaying = null;
let transitioning = false;
let fadeTimer;

init().catch((e) => toast("Lỗi khởi động: " + e.message, 10000));

async function init() {
  await login();
  code = await getOrCreateRoom();
  const joinUrl = `${location.origin}/?room=${code}`;
  const qr = (size) => `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&margin=0&data=${encodeURIComponent(joinUrl)}`;
  $("#qrBig").src = qr(400);
  $("#qrSmall").src = qr(200);
  $("#idleCode").textContent = code;
  $("#cornerCode").textContent = code;
  $("#idleUrl").textContent = location.host;

  await update(roomRef(code), { tvOnline: true, nowPlaying: null });
  onDisconnect(roomRef(code, "tvOnline")).set(false);

  onValue(roomRef(code, "queue"), (snap) => {
    queue = sortQueue(snap.val());
    if (knownKeys) {
      const added = queue.filter((q) => !knownKeys.has(q.key));
      if (added.length && nowPlaying) toast(`🎵 Vừa thêm: ${added[0].title}`, 4000);
    }
    knownKeys = new Set(queue.map((q) => q.key));
    renderNext();
    maybeAutoPlay();
  });

  await remove(roomRef(code, "commands"));
  onChildAdded(roomRef(code, "commands"), (snap) => {
    handleCommand(snap.val()?.cmd);
    remove(snap.ref);
  });

  loadYouTubeApi();
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

// ---------- YouTube ----------
function loadYouTubeApi() {
  window.onYouTubeIframeAPIReady = () => {
    player = new YT.Player("player", {
      width: "100%", height: "100%",
      playerVars: {
        autoplay: 1, controls: 0, rel: 0, modestbranding: 1, playsinline: 1,
        iv_load_policy: 3, fs: 0, disablekb: 1, cc_load_policy: 0, origin: location.origin,
      },
      events: {
        onReady: () => { playerReady = true; maybeAutoPlay(); },
        onStateChange: (e) => {
          if (e.data === YT.PlayerState.ENDED) finishSong(true);
          if (e.data === YT.PlayerState.PLAYING) hideCaptions();
          if (e.data === YT.PlayerState.PLAYING && nowPlaying && nowPlaying.title === "Video YouTube") {
            const t = player.getVideoData?.().title;
            if (t) { nowPlaying.title = t; $("#nowTitle").textContent = t; update(roomRef(code, "nowPlaying"), { title: t }); }
          }
          if (nowPlaying && (e.data === YT.PlayerState.PLAYING || e.data === YT.PlayerState.PAUSED)) {
            update(roomRef(code, "nowPlaying"), { paused: e.data === YT.PlayerState.PAUSED });
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

// Tắt phụ đề tự động của YouTube (gọi vài lần vì YouTube có thể bật lại sau khi tải xong)
function hideCaptions() {
  const off = () => {
    try {
      player.unloadModule("captions");
      player.unloadModule("cc");
      player.setOption("captions", "track", {});
    } catch (_) {}
  };
  off();
  [500, 1500, 3000].forEach((ms) => setTimeout(off, ms));
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
  // Lưu lịch sử "Đã hát gần đây" để điện thoại thêm lại không cần tìm
  set(roomRef(code, `history/${item.videoId}`), {
    videoId: item.videoId, title: item.title, channel: item.channel || "", thumb: item.thumb || "", ts: Date.now(),
  });
  $("#idle").classList.add("hidden");
  $("#corner").classList.remove("hidden");
  showNowBar(item);
  player.loadVideoById(item.videoId);
}

function showNowBar(item) {
  $("#nowTitle").textContent = item.title;
  $("#nowBy").textContent = item.by ? `– ${item.by}` : "";
  const bar = $("#nowBar");
  bar.classList.remove("hidden", "fade");
  clearTimeout(fadeTimer);
  fadeTimer = setTimeout(() => bar.classList.add("fade"), 8000);
}

function renderNext() {
  const n = queue[0];
  $("#next").classList.toggle("hidden", !n);
  if (n) $("#nextTitle").textContent = n.title + (queue.length > 1 ? `  (+${queue.length - 1} bài)` : "");
}

function showIdle() {
  nowPlaying = null;
  $("#idle").classList.remove("hidden");
  $("#corner").classList.add("hidden");
  $("#nowBar").classList.add("hidden");
  try { player?.stopVideo(); } catch (_) {}
}

function finishSong(withScore) {
  if (!nowPlaying || transitioning) return;
  const done = nowPlaying;
  transitioning = true;
  nowPlaying = null;
  set(roomRef(code, "nowPlaying"), null);
  let wait = 800;
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
    if (!nowPlaying) return;
    const playing = player.getPlayerState() === YT.PlayerState.PLAYING;
    playing ? player.pauseVideo() : player.playVideo();
    toast(playing ? "⏸ Tạm dừng" : "▶ Tiếp tục", 1500);
  } else if (cmd === "replay") {
    if (!nowPlaying) return;
    player.seekTo(0, true); player.playVideo();
  }
}

// ---------- Remote ----------
document.addEventListener("keydown", (e) => {
  const k = e.key;
  if (k === "Enter" || k === "MediaPlayPause" || k === "MediaPlay" || k === "MediaPause" || k === " ") {
    e.preventDefault(); handleCommand("toggle");
  } else if (k === "MediaTrackNext" || k === "MediaFastForward") {
    e.preventDefault(); handleCommand("skip");
  } else if (k === "ArrowUp" || k === "ArrowDown" || k === "ArrowLeft" || k === "ArrowRight") {
    e.preventDefault();
    if (nowPlaying) showNowBar(nowPlaying);
  }
});

// Nút Back (app Android gọi): đóng bảng điểm nếu đang hiện, nếu không thì thoát app
window.onTvBack = () => {
  if (!$("#scoreLayer").classList.contains("hidden")) { $("#scoreLayer").classList.add("hidden"); return true; }
  return false;
};

let toastTimer;
function toast(msg, ms = 3000) {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.remove("hidden");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.add("hidden"), ms);
}
