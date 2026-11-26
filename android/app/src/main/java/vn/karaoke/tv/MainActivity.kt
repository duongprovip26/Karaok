package vn.karaoke.tv

import android.app.Activity
import android.content.ActivityNotFoundException
import android.content.Intent
import android.graphics.Color
import android.os.Bundle
import android.speech.RecognizerIntent
import android.view.KeyEvent
import android.view.View
import android.view.WindowManager
import android.webkit.JavascriptInterface
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import org.json.JSONObject

/**
 * App TV chỉ là "vỏ": một WebView toàn màn hình mở trang tv.html trên Firebase Hosting.
 * Sửa giao diện/tính năng chỉ cần deploy lại web, không phải cài lại APK.
 * Phần native lo: giữ màn hình sáng, nhận giọng nói bằng Google, nút Back của remote.
 */
class MainActivity : Activity() {

    private lateinit var web: WebView
    private val tvUrl by lazy { getString(R.string.web_url) + "/tv.html" }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)

        web = WebView(this)
        web.setBackgroundColor(Color.BLACK)
        setContentView(web)

        web.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            mediaPlaybackRequiresUserGesture = false
            loadWithOverviewMode = true
            useWideViewPort = true
        }
        web.webChromeClient = WebChromeClient()
        web.webViewClient = object : WebViewClient() {
            override fun onReceivedError(view: WebView, request: WebResourceRequest, error: WebResourceError) {
                if (request.isForMainFrame) showOffline()
            }
        }
        web.addJavascriptInterface(Bridge(), "Android")
        web.isFocusable = true
        web.isFocusableInTouchMode = true
        web.requestFocus(View.FOCUS_DOWN)
        hideSystemUi()

        if (savedInstanceState == null) web.loadUrl(tvUrl) else web.restoreState(savedInstanceState)
    }

    private fun showOffline() {
        val html = """
            <html><body style="background:#0b0b14;color:#fff;font-family:sans-serif;display:flex;
            align-items:center;justify-content:center;height:100vh;margin:0;text-align:center">
            <div><h1>Không kết nối được</h1><p>Kiểm tra mạng rồi bấm OK để thử lại.</p>
            <button autofocus onclick="location.href='$tvUrl'" style="font-size:24px;padding:12px 32px">Thử lại</button>
            </div></body></html>
        """.trimIndent()
        web.loadDataWithBaseURL(null, html, "text/html", "utf-8", null)
    }

    @Suppress("DEPRECATION")
    private fun hideSystemUi() {
        window.decorView.systemUiVisibility = (View.SYSTEM_UI_FLAG_FULLSCREEN
            or View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
            or View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY)
    }

    inner class Bridge {
        @JavascriptInterface
        fun startVoice() {
            runOnUiThread { launchVoice() }
        }

        @JavascriptInterface
        fun isTv(): Boolean = true
    }

    @Suppress("DEPRECATION")
    private fun launchVoice() {
        val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
            putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
            putExtra(RecognizerIntent.EXTRA_LANGUAGE, "vi-VN")
            putExtra(RecognizerIntent.EXTRA_LANGUAGE_PREFERENCE, "vi-VN")
            putExtra(RecognizerIntent.EXTRA_PROMPT, "Nói tên bài hát…")
            putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1)
        }
        try {
            startActivityForResult(intent, REQ_VOICE)
        } catch (e: ActivityNotFoundException) {
            callJs("window.onVoiceError && window.onVoiceError(${JSONObject.quote("TV chưa có dịch vụ nhận giọng nói của Google")})")
        }
    }

    @Deprecated("Deprecated in Java")
    @Suppress("DEPRECATION")
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        if (requestCode != REQ_VOICE) return
        val text = data?.getStringArrayListExtra(RecognizerIntent.EXTRA_RESULTS)?.firstOrNull()
        if (resultCode == RESULT_OK && !text.isNullOrBlank()) {
            callJs("window.onVoiceResult && window.onVoiceResult(${JSONObject.quote(text)})")
        }
        web.requestFocus()
    }

    private fun callJs(js: String) = web.post { web.evaluateJavascript(js, null) }

    override fun onKeyDown(keyCode: Int, event: KeyEvent): Boolean {
        // Nút tìm kiếm / trợ lý trên remote (nếu hệ thống chuyển cho app) => tìm bằng giọng nói
        if (keyCode == KeyEvent.KEYCODE_SEARCH || keyCode == KeyEvent.KEYCODE_VOICE_ASSIST) {
            launchVoice()
            return true
        }
        return super.onKeyDown(keyCode, event)
    }

    @Deprecated("Deprecated in Java")
    @Suppress("DEPRECATION")
    override fun onBackPressed() {
        web.evaluateJavascript("(window.onTvBack && window.onTvBack()) ? 'yes' : 'no'") { result ->
            if (result == null || !result.contains("yes")) finish()
        }
    }

    override fun onResume() {
        super.onResume()
        web.onResume()
        hideSystemUi()
    }

    override fun onPause() {
        web.onPause()
        super.onPause()
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        web.saveState(outState)
    }

    override fun onDestroy() {
        web.destroy()
        super.onDestroy()
    }

    companion object {
        private const val REQ_VOICE = 1001
    }
}
