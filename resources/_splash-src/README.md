# 开机屏源图（已停用铺满位图）

2026-08-17 二改：安卓开机屏改走 SplashScreen API 的正体——
**纯色底（values/colors.xml 的 splashBackground）＋ 居中图标（drawable-*/splash_icon.png）**，
不再用铺满全屏的 splash.png。

故这两张源图移出 resources/ 根：`@capacitor/assets generate` 见到根下的 splash.png
就会重新铺出 24 张各密度全屏位图（共 5.8MB），把 APK 顶过 Cloudflare 25MiB 硬限。
移到此处即不被扫到。

如需重出开机屏图标（改了 Logo 时）：
    python3 scripts/gen-splash-icon.mjs   # 见该脚本
