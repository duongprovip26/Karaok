// ====== ĐIỀN THÔNG TIN CỦA BẠN VÀO ĐÂY ======
// Lấy ở Firebase Console > Project settings > Your apps > Web app (SDK setup and configuration)
export const CONFIG = {
  firebase: {
    apiKey: "AIzaSyD16HO8ebZszv0slu-1gK3M36qNsKTLg7Y",
    authDomain: "karaok-c2030.firebaseapp.com",
    databaseURL: "https://karaok-c2030-default-rtdb.firebaseio.com",
    projectId: "karaok-c2030",
    appId: "1:803479141006:web:4c102a1fcdc6f8c6c3a7df",
    storageBucket: "karaok-c2030.firebasestorage.app",
    messagingSenderId: "803479141006",
  },
  // KHÔNG BẮT BUỘC. Để trống "" thì không tìm theo tên được, chỉ thêm bài bằng link/chia sẻ từ app YouTube.
  // Lấy ở Google Cloud Console > APIs & Services > Credentials > API key (đã bật YouTube Data API v3)
  youtubeApiKey: "",
};
