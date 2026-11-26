# 🎤 Karaoke TV

App karaoke cho TV Xiaomi (Google TV), gồm hai phần:
- **App TV (APK):** mở trang `tv.html`, phát bài YouTube theo hàng chờ, tìm bài bằng giọng nói qua remote, hiện điểm từ 90 đến 100 sau mỗi bài.
- **Web điện thoại (`index.html`):** quét mã QR hoặc nhập **mã phòng 6 số** để tìm bài (gõ chữ, nói, hoặc dán link YouTube), thêm bài vào hàng chờ, ưu tiên hoặc xóa bài, và dừng/tiếp, hát lại, bỏ qua.
- Dữ liệu dùng chung lưu trên **Firebase Realtime Database**, gói miễn phí. Trang web được host trên **Firebase Hosting**, cũng miễn phí.

```
web/                 ← trang TV + trang điện thoại (deploy lên Firebase Hosting)
  js/config.js       ← ★ ĐIỀN KEY CỦA BẠN VÀO ĐÂY
android/             ← app TV: WebView toàn màn hình + giọng nói + nút Back
database.rules.json  ← quy tắc bảo mật database
.github/workflows/   ← tự build APK + deploy web
```

---

## Bước 1 – Thiết lập Firebase (dự án `karaok-c2030`)
1. Dự án đã có sẵn, `config.js` đã điền `authDomain`, `databaseURL`, `projectId`.
2. Vào **Build → Authentication → Get started → Sign-in method**, bật **Anonymous**.
3. Vào **Build → Realtime Database** (database đã tạo sẵn):
   - Mở tab **Rules**, dán nội dung file `database.rules.json` vào và bấm **Publish**.
4. Vào **Project settings (⚙) → General → Your apps**, bấm nút **</>** (Web) để đăng ký app web.
   - Copy 2 giá trị còn thiếu là `apiKey` và `appId` vào `web/js/config.js`.

## Bước 2 – (Không bắt buộc) API key YouTube để tìm theo tên
1. Vào https://console.cloud.google.com và chọn **đúng project Firebase** vừa tạo.
2. Vào **APIs & Services → Library**, tìm **YouTube Data API v3** rồi bấm **Enable**.
3. Vào **APIs & Services → Credentials → Create credentials → API key**.
4. Bấm vào key vừa tạo để giới hạn quyền (nên làm):
   - **Application restrictions → Websites**, thêm `https://karaok-c2030.web.app/*` và `https://karaok-c2030.firebaseapp.com/*`.
   - **API restrictions** → chỉ chọn YouTube Data API v3.
5. Dán key vào `youtubeApiKey` trong `web/js/config.js`.

> **Không có key app vẫn chạy:** phát video không cần key. Chỉ có ô tìm theo tên (và nói tên bài trên TV) là cần key. Không có key thì thêm bài bằng cách **chia sẻ từ app YouTube** hoặc **dán link** trên điện thoại.
>
> Gói miễn phí có khoảng **100 lượt tìm kiếm mỗi ngày**. Kết quả tìm được lưu lại 7 ngày, nên tìm lại bài cũ không tốn lượt. Khi hết lượt, vẫn thêm bài được bằng cách **dán link YouTube** trên điện thoại.

## Bước 3 – Đưa code lên GitHub
1. Code đã nằm trong repo `duongprovip26/Karaok`.
2. Vào repo → **Settings → Secrets and variables → Actions**.
   - (Biến `WEB_URL`, `FIREBASE_PROJECT_ID` đã đặt mặc định là `karaok-c2030`, không cần thêm.)
   - Tab **Secrets**, thêm `FIREBASE_SERVICE_ACCOUNT` (secret này để tự deploy web):
     - Trong Firebase, vào **Project settings → Service accounts → Generate new private key**.
     - Mở file JSON tải về, copy **toàn bộ nội dung** và dán vào secret.
     - Vào https://console.cloud.google.com/iam-admin/iam, sửa tài khoản `firebase-adminsdk-…`, thêm 2 role **Firebase Admin** và **Service Usage Consumer**.
3. Mỗi lần push lên nhánh `main`, GitHub Actions sẽ:
   - deploy web và rules lên Firebase,
   - build file **KaraokeTV.apk**. Lấy file này ở tab **Actions → lần chạy mới nhất → Artifacts**.

> **Cách deploy web khác (từ máy tính, cần Node.js):**
> `npx firebase-tools login` rồi `npx firebase-tools deploy --only hosting,database --project karaok-c2030`

Kiểm tra trước trên máy tính: mở `https://karaok-c2030.web.app/tv.html`, rồi dùng điện thoại vào `https://karaok-c2030.web.app`.

## Bước 4 – Cài lên TV Xiaomi
1. Trên TV, vào **Cài đặt → Quyền riêng tư (Privacy) → Bảo mật & hạn chế → Không rõ nguồn gốc (Unknown sources)**. Cho phép app quản lý file hoặc app nhận file được cài APK.
2. Chép `KaraokeTV.apk` sang TV bằng một trong hai cách:
   - **USB**: chép vào USB, cắm vào TV, mở bằng app quản lý file.
   - App **Send Files to TV** (có trên Google Play của cả điện thoại lẫn TV).
3. Mở file APK để cài. Biểu tượng **Karaoke TV** sẽ hiện ở hàng Ứng dụng trên màn hình chính.

## Cách dùng
- **Trên TV:** dùng các phím mũi tên và OK trên remote.
  - **🎤 Nói tên bài:** mở hộp nhận giọng nói của Google.
  - **🔍 Tìm bài:** gõ tên bài bằng bàn phím ảo.
  - Chọn một bài trong hàng chờ để **ưu tiên** hoặc **xóa**.
  - Nút **Back** đóng cửa sổ đang mở. Nút **⛶** chuyển sang toàn màn hình, bấm phím bất kỳ để hiện lại menu.
- **Trên điện thoại:** quét QR trên TV, nhập tên, rồi thêm bài theo một trong các cách sau:
  - **Chia sẻ từ app YouTube (Android):** trên trang Karaoke, bấm **📲 Cài đặt Karaoke lên điện thoại** một lần. Sau đó trong app YouTube, mở bài muốn hát → **Chia sẻ** → chọn **Karaoke**, bài sẽ tự vào hàng chờ.
  - **Dán link (mọi điện thoại, kể cả iPhone):** trong YouTube chọn **Chia sẻ → Sao chép đường liên kết**, rồi dán vào ô tìm và bấm Tìm.
  - **Tìm theo tên:** cần API key YouTube (Bước 2).
- Hát xong mỗi bài, TV hiện điểm ngẫu nhiên từ 90 đến 100. Điện thoại cũng hiện điểm này.
- Sửa giao diện chỉ cần push lại code web, **không phải cài lại APK**. App TV luôn tải bản web mới nhất.

## Lưu ý
- Video YouTube vẫn có quảng cáo. Đây là điều kiện bắt buộc khi phát YouTube theo cách chính thức.
- Một số video karaoke bị chủ kênh chặn nhúng. App đã lọc sẵn khi tìm; nếu vẫn gặp, app sẽ tự chuyển sang bài kế.
- Mã phòng của TV giữ cố định qua các lần mở app. Muốn đổi mã, xóa dữ liệu app trên TV.
