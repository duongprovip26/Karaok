// ====== ĐIỀN THÔNG TIN CỦA BẠN VÀO ĐÂY ======
// Lấy ở Firebase Console > Project settings > Your apps > Web app (SDK setup and configuration)
export const CONFIG = {
  firebase: {
    apiKey: "DIEN_API_KEY_FIREBASE",
    authDomain: "karaok-c2030.firebaseapp.com",
    databaseURL: "https://karaok-c2030-default-rtdb.firebaseio.com",
    projectId: "karaok-c2030",
    appId: "DIEN_APP_ID",
  },
  // KHÔNG BẮT BUỘC. Để trống "" thì không tìm theo tên được, chỉ thêm bài bằng link/chia sẻ từ app YouTube.
  // Lấy ở Google Cloud Console > APIs & Services > Credentials > API key (đã bật YouTube Data API v3)
  youtubeApiKey: "",
};
