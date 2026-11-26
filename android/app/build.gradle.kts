plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

// Địa chỉ web đã deploy lên Firebase Hosting. GitHub Actions truyền vào qua -PWEB_URL=...
val webUrl: String = (project.findProperty("WEB_URL") as String?)
    ?.trim()?.trimEnd('/')?.takeIf { it.isNotEmpty() }
    ?: "https://karaok-c2030.web.app"

android {
    namespace = "vn.karaoke.tv"
    compileSdk = 34

    defaultConfig {
        applicationId = "vn.karaoke.tv"
        minSdk = 23
        targetSdk = 34
        versionCode = 1
        versionName = "1.0"
        resValue("string", "web_url", webUrl)
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            signingConfig = signingConfigs.getByName("debug")
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }
}
