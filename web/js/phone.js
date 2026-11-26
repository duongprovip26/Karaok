import {
  login, roomRef, roomExists, sortQueue, addToQueue, prioritize, moveInQueue, removeFromQueue,
  searchYouTube, itemFromLink, parseYouTubeId, sendCommand, escapeHtml, onValue,
} from "./common.js";

const $ = (s) => document.querySelector(s);
let code = null;
const name = ""; // không cần nhập tên
let results = [];
let unsub = [];
let firstScore = true;

// Link được chia sẻ từ app YouTube (PWA share target) hoặc mở kèm ?v=
const params = new URLSearchParams(location.search);
let pendingShare = [params.get("url"), params.get("text"), params.get("title"), params.get("v")]
  .filter(Boolean).join(" ");
if (!parseYouTubeId(pendingShare)) pendingShare = "";

if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});

boot();

async function boot() {
  try { await login(); } catch (e) { return toast("Không kết nối được máy chủ: " + e.message, 8000); }
  const urlRoom = params.get("room");
  const saved = localStorage.getItem("room");
  const c = urlRoom || saved;
  if (c) $("#jCode").value = c;
  if (c && (await roomExists(c))) enterRoom(c);
  else showJoin();
}

function showJoin() {
  $("#main").classList.add("hidden");
  $("#join").classList.remove("hidden");
  $("#jCode").focus();
}

$("#jGo").onclick = async () => {
  const c = $("#jCode").value.trim();
  $("#jErr").textContent = "";
  if (!/^\d{6}$/.test(c)) return ($("#jErr").textContent = "Mã phòng gồm 6 chữ số");
  if (!(await roomExists(c))) return ($("#jErr").textContent = "Không tìm thấy phòng. Kiểm tra lại mã trên TV.");
  enterRoom(c);
};

function enterRoom(c) {
  code = c;
  localStorage.setItem("room", c);
  history.replaceState(null, "", `?room=${c}`);
  $("#join").classList.add("hidden");
  $("#main").classList.remove("hidden");
  $("#hCode").textContent = c;
  unsub.forEach((u) => u());
  firstScore = true;
  unsub = [
    onValue(roomRef(c, "queue"), (s) => renderQueue(sortQueue(s.val()))),
    onValue(roomRef(c, "nowPlaying"), (s) => renderNow(s.val())),
    onValue(roomRef(c, "history"), (s) => renderHistory(s.val())),
    onValue(roomRef(c, "lastScore"), (s) => {
      if (firstScore) { firstScore = false; return; } // bỏ qua điểm cũ khi mới vào
      const v = s.val();
      if (v) showScore(v);
    }),
  ];
  if (pendingShare) addShared(pendingShare);
}

async function addShared(text) {
  pendingShare = "";
  const item = await itemFromLink(text);
  if (!item) return;
  await addToQueue(code, item, name);
  toast("Đã thêm: " + item.title, 3500);
}

$("#hLeave").onclick = () => {
  unsub.forEach((u) => u());
  unsub = [];
  localStorage.removeItem("room");
  history.replaceState(null, "", location.pathname);
  showJoin();
};

// ---------- Tabs ----------
document.querySelectorAll(".tabs button").forEach((b) => b.onclick = () => {
  document.querySelectorAll(".tabs button").forEach((x) => x.classList.toggle("active", x === b));
  document.querySelectorAll(".tab").forEach((t) => t.classList.toggle("hidden", t.id !== "tab-" + b.dataset.tab));
});

// ---------- Tìm & thêm bài ----------
async function doSearch() {
  const text = $("#q").value.trim();
  if (!text) return;
  $("#q").blur();
  if (parseYouTubeId(text)) {
    const item = await itemFromLink(text);
    await addToQueue(code, item, name);
    $("#q").value = "";
    return toast("Đã thêm: " + item.title);
  }
  $("#sStatus").textContent = "Đang tìm…";
  $("#results").innerHTML = "";
  try {
    results = await searchYouTube(text);
    $("#sStatus").textContent = results.length ? "" : "Không tìm thấy bài nào";
    $("#results").innerHTML = results.map((r, i) => `
      <div class="item">
        <img src="${escapeHtml(r.thumb)}" alt="" loading="lazy">
        <div class="info"><div class="t">${escapeHtml(r.title)}</div><div class="small">${escapeHtml(r.channel)}</div></div>
        <div class="acts"><button class="primary" data-i="${i}">＋</button></div>
      </div>`).join("");
    $("#results").querySelectorAll("button[data-i]").forEach((b) => b.onclick = async () => {
      const r = results[+b.dataset.i];
      await addToQueue(code, r, name);
      b.textContent = "✓";
      b.classList.remove("primary");
      b.classList.add("added");
      toast("Đã thêm vào hàng chờ");
    });
  } catch (e) {
    $("#sStatus").textContent = e.message;
  }
}
$("#qGo").onclick = doSearch;
$("#q").addEventListener("keydown", (e) => { if (e.key === "Enter") doSearch(); });

// Tìm bằng giọng nói (Chrome Android, Safari iOS mới)
$("#qVoice").onclick = () => {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) return toast("Trình duyệt này chưa hỗ trợ giọng nói, hãy dùng mic trên bàn phím");
  const r = new SR();
  r.lang = "vi-VN";
  r.interimResults = false;
  r.onresult = (e) => { $("#q").value = e.results[0][0].transcript; doSearch(); };
  r.onerror = () => toast("Không nghe rõ, thử lại nhé");
  r.start();
  toast("Đang nghe… hãy nói tên bài hát");
};

// ---------- Hàng chờ ----------
function renderQueue(list) {
  $("#qCount").textContent = list.length;
  const ol = $("#queue");
  if (!list.length) { ol.innerHTML = `<li class="empty">Hàng chờ trống – tìm bài để thêm nhé!</li>`; return; }
  ol.innerHTML = list.map((it, i) => `
    <li class="item">
      <img src="${escapeHtml(it.thumb)}" alt="" loading="lazy">
      <div class="info"><div class="t">${i + 1}. ${escapeHtml(it.title)}</div><div class="small">${escapeHtml(it.by || "")}</div></div>
      <div class="acts">
        <button data-up="${it.key}" title="Lên" ${i === 0 ? "disabled" : ""}>▲</button>
        <button data-down="${it.key}" title="Xuống" ${i === list.length - 1 ? "disabled" : ""}>▼</button>
        ${i > 1 ? `<button data-top="${it.key}" title="Lên đầu">⤒</button>` : ""}
        <button data-del="${it.key}" title="Xóa">✕</button>
      </div>
    </li>`).join("");
  ol.querySelectorAll("[data-up]").forEach((b) => b.onclick = () => moveInQueue(code, b.dataset.up, -1));
  ol.querySelectorAll("[data-down]").forEach((b) => b.onclick = () => moveInQueue(code, b.dataset.down, 1));
  ol.querySelectorAll("[data-top]").forEach((b) => b.onclick = () => prioritize(code, b.dataset.top).then(() => toast("Đã ưu tiên lên đầu")));
  ol.querySelectorAll("[data-del]").forEach((b) => b.onclick = () => {
    if (confirm("Xóa bài này khỏi hàng chờ?")) removeFromQueue(code, b.dataset.del);
  });
}

let historyList = [];
function renderHistory(val) {
  historyList = Object.values(val || {}).sort((a, b) => (b.ts || 0) - (a.ts || 0)).slice(0, 100);
  const box = $("#history");
  if (!historyList.length) { box.innerHTML = `<div class="empty">Chưa có bài nào được hát</div>`; return; }
  box.innerHTML = historyList.map((it, i) => `
    <div class="item">
      <img src="${escapeHtml(it.thumb)}" alt="" loading="lazy">
      <div class="info"><div class="t">${escapeHtml(it.title)}</div><div class="small">${escapeHtml(it.channel || "")}</div></div>
      <div class="acts"><button class="primary" data-h="${i}">＋</button></div>
    </div>`).join("");
  box.querySelectorAll("button[data-h]").forEach((b) => b.onclick = async () => {
    await addToQueue(code, historyList[+b.dataset.h], name);
    b.textContent = "✓";
    b.classList.remove("primary");
    b.classList.add("added");
    toast("Đã thêm vào hàng chờ");
  });
}

function renderNow(np) {
  if (!np) return $("#now").classList.add("hidden");
  $("#now").classList.remove("hidden");
  $("#nowThumb").src = np.thumb || `https://i.ytimg.com/vi/${np.videoId}/mqdefault.jpg`;
  $("#nowTitle").textContent = (np.paused ? "⏸ " : "") + np.title;
  $("#nowBy").textContent = np.by ? "Người hát: " + np.by : "";
}

// ---------- Điều khiển ----------
document.querySelectorAll("[data-cmd]").forEach((b) => b.onclick = () => {
  if (b.dataset.cmd === "skip" && !confirm("Bỏ qua bài đang hát?")) return;
  sendCommand(code, b.dataset.cmd);
});

function showScore(v) {
  const p = $("#scorePop");
  p.innerHTML = `<div class="small">${escapeHtml(v.title)}</div><div class="num">${v.score}</div><div class="cmt">${escapeHtml(v.comment)}</div><div class="small">${escapeHtml(v.by || "")}</div>`;
  p.classList.remove("hidden");
  p.onclick = () => p.classList.add("hidden");
  setTimeout(() => p.classList.add("hidden"), 6000);
}

let toastTimer;
function toast(msg, ms = 2500) {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.remove("hidden");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.add("hidden"), ms);
}
