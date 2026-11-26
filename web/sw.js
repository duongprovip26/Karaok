// Service worker tối thiểu để Chrome cho phép "Cài đặt ứng dụng" (cần cho mục Chia sẻ từ YouTube)
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
self.addEventListener("fetch", () => {}); // luôn lấy bản mới từ mạng
