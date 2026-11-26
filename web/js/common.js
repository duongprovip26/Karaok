import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, signInAnonymously } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getDatabase, ref, get, set, push, update, remove,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";
import { CONFIG } from "./config.js";

export const app = initializeApp(CONFIG.firebase);
export const db = getDatabase(app);
export * from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

export async function login() {
  const cred = await signInAnonymously(getAuth(app));
  return cred.user.uid;
}

export const roomRef = (code, path = "") => ref(db, `rooms/${code}${path ? "/" + path : ""}`);

export function escapeHtml(s = "") {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function decodeHtml(s = "") {
  const t = document.createElement("textarea");
  t.innerHTML = s;
  return t.value;
}

function cacheKey(q) {
  return q.toLowerCase().replace(/[.#$\[\]\/]/g, " ").replace(/\s+/g, " ").trim().slice(0, 200);
}

/** Tìm bài trên YouTube (có cache 7 ngày trong Firebase để tiết kiệm 100 lượt/ngày). */
export async function searchYouTube(text) {
  const q = text.trim();
  if (!q) return [];
  if (!CONFIG.youtubeApiKey) {
    throw new Error("Chưa bật tìm theo tên. Hãy mở app YouTube → Chia sẻ → chọn Karaoke, hoặc dán link YouTube trên điện thoại.");
  }
  const query = /karaoke|beat/i.test(q) ? q : q + " karaoke";
  const key = cacheKey(query);
  const cacheRef = ref(db, `searchCache/${key}`);
  try {
    const snap = await get(cacheRef);
    if (snap.exists() && Date.now() - snap.val().ts < 7 * 864e5) return snap.val().items || [];
  } catch (_) { /* bỏ qua lỗi cache */ }

  const url = new URL("https://www.googleapis.com/youtube/v3/search");
  url.search = new URLSearchParams({
    part: "snippet", type: "video", videoEmbeddable: "true", maxResults: "20",
    regionCode: "VN", relevanceLanguage: "vi", q: query, key: CONFIG.youtubeApiKey,
  });
  const res = await fetch(url);
  const data = await res.json();
  if (!res.ok) {
    const reason = data?.error?.errors?.[0]?.reason || "";
    if (/quota/i.test(reason)) throw new Error("Hết lượt tìm kiếm YouTube hôm nay. Hãy dán link YouTube để thêm bài.");
    throw new Error(data?.error?.message || "Lỗi tìm kiếm YouTube");
  }
  const items = (data.items || []).filter((it) => it.id?.videoId).map((it) => ({
    videoId: it.id.videoId,
    title: decodeHtml(it.snippet.title),
    channel: decodeHtml(it.snippet.channelTitle),
    thumb: it.snippet.thumbnails?.medium?.url || `https://i.ytimg.com/vi/${it.id.videoId}/mqdefault.jpg`,
  }));
  set(cacheRef, { ts: Date.now(), items }).catch(() => {});
  return items;
}

/** Lấy videoId từ link YouTube (youtu.be, watch?v=, shorts, embed). */
export function parseYouTubeId(text = "") {
  const m = text.match(/(?:youtu\.be\/|v=|\/shorts\/|\/embed\/|\/live\/)([A-Za-z0-9_-]{11})/);
  return m ? m[1] : null;
}

export async function itemFromLink(text) {
  const videoId = parseYouTubeId(text);
  if (!videoId) return null;
  let title = "Video YouTube", channel = "";
  const watch = encodeURIComponent("https://www.youtube.com/watch?v=" + videoId);
  for (const u of [`https://www.youtube.com/oembed?format=json&url=${watch}`, `https://noembed.com/embed?url=${watch}`]) {
    try {
      const r = await fetch(u);
      if (!r.ok) continue;
      const j = await r.json();
      if (j.title) { title = j.title; channel = j.author_name || ""; break; }
    } catch (_) {}
  }
  return { videoId, title, channel, thumb: `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg` };
}

export function sortQueue(val) {
  return Object.entries(val || {})
    .map(([key, v]) => ({ key, ...v }))
    .sort((a, b) => (a.order || 0) - (b.order || 0));
}

export function addToQueue(code, item, by) {
  return push(roomRef(code, "queue"), {
    videoId: item.videoId, title: item.title || "", channel: item.channel || "",
    thumb: item.thumb || "", by: by || "Khách", order: Date.now(),
  });
}

export async function prioritize(code, key) {
  const snap = await get(roomRef(code, "queue"));
  const list = sortQueue(snap.val());
  if (!list.length) return;
  await update(roomRef(code, `queue/${key}`), { order: (list[0].order || Date.now()) - 1 });
}

/** Đổi chỗ bài với bài liền trước (dir=-1) hoặc liền sau (dir=1). */
export async function moveInQueue(code, key, dir) {
  const snap = await get(roomRef(code, "queue"));
  const list = sortQueue(snap.val());
  const i = list.findIndex((x) => x.key === key);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= list.length) return;
  let a = list[i].order || 0, b = list[j].order || 0;
  if (a === b) b = a + dir; // tránh trùng thứ tự
  await update(roomRef(code, "queue"), { [`${list[i].key}/order`]: b, [`${list[j].key}/order`]: a });
}

export const removeFromQueue = (code, key) => remove(roomRef(code, `queue/${key}`));

export const sendCommand = (code, cmd) => push(roomRef(code, "commands"), { cmd, ts: Date.now() });

export function roomExists(code) {
  return get(roomRef(code, "createdAt")).then((s) => s.exists());
}

/** Điểm ngẫu nhiên 90–100 kèm lời khen. */
export function randomScore() {
  const score = 90 + Math.floor(Math.random() * 11);
  const comments = score === 100 ? ["Tuyệt đỉnh! Ca sĩ đây rồi 🎉", "Hoàn hảo! 💯"]
    : score >= 96 ? ["Xuất thần! 🌟", "Hát hay quá trời! 👏"]
    : score >= 93 ? ["Quá đỉnh luôn! 🎶", "Giọng ca vàng đây rồi! ✨"]
    : ["Hát hay lắm! 👍", "Rất tốt, bài sau còn hay hơn! 😄"];
  return { score, comment: comments[Math.floor(Math.random() * comments.length)] };
}
