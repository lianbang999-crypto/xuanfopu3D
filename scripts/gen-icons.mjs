// 图标与开机屏派生 · 由一张 Logo 原图出全套（2026-08-17）
//
// 源：resources/app-logo-three-rabbits-v2-alpha.png（透明底，1254 见方）
// 出：
//   public/icons/*            PWA 与 iOS（含 maskable 一枚）
//   resources/icon-*.png      供 @capacitor/assets 出安卓启动图标
//   android/.../splash_icon   安卓开机屏居中图标（五密度，透明底）
//
// 三处尺度各有其律，不可混用：
//   · 安卓自适应图标：前景收进中心 72%——各家 ROM 圆裁方裁不一，满幅则削莲瓣
//   · 安卓开机屏图标：收进中心 66%——SplashScreen API 按此裁切与缩放
//   · PWA／iOS 含底图标：留 6% 余白即可，iOS 另会再切一道圆角
//
// 开机屏底色不在此出：它是 values/colors.xml 的一枚色值（splashBackground），
// 纯色由系统直出，不占一字节位图。铺满全屏的 splash.png 已停用（见 resources/_splash-src/）。
//
// 用法：node scripts/gen-icons.mjs        （改了 Logo 后跑，随后 npx cap sync android）
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const SRC = `${root}resources/app-logo-three-rabbits-v2-alpha.png`;
if (!existsSync(SRC)) {
  console.error(`未见 Logo 原图：${SRC}`);
  process.exit(1);
}

// 图像处理走 Python/PIL（本机已有；Node 侧无依赖不引 sharp，免为一次性派生装 native 包）
const PY = `
from PIL import Image
import os
SRC = ${JSON.stringify(SRC)}
ROOT = ${JSON.stringify(root)}
BG = (250, 241, 230)          # #faf1e6 与开机屏 splashBackground 同色

src = Image.open(SRC).convert('RGBA')
lotus = src.crop(src.getchannel('A').getbbox())
print('莲台边界 %s，占原幅 %.1f%%' % (src.getchannel('A').getbbox(), 100*lotus.width/src.width))

def place(size, ratio, bg=None):
    cv = Image.new('RGBA', (size, size), (*bg, 255) if bg else (0, 0, 0, 0))
    d = int(size * ratio)
    s = d / max(lotus.size)
    lo = lotus.resize((int(lotus.width*s), int(lotus.height*s)), Image.LANCZOS)
    cv.paste(lo, ((size-lo.width)//2, (size-lo.height)//2), lo)
    return cv

# 一、安卓自适应图标源（供 @capacitor/assets）：前景 72% 收进安全区，背景纯色一层
place(1024, 0.72).save(f'{ROOT}resources/icon-foreground.png')
Image.new('RGBA', (1024,1024), (*BG,255)).save(f'{ROOT}resources/icon-background.png')
place(1024, 0.88, BG).save(f'{ROOT}resources/icon-only.png')

# 二、PWA 与 iOS
ic = f'{ROOT}public/icons'
os.makedirs(ic, exist_ok=True)
place(512, 0.88, BG).save(f'{ic}/icon-512.png')
place(192, 0.88, BG).save(f'{ic}/icon-192.png')
place(180, 0.86, BG).save(f'{ic}/apple-touch-icon.png')
place(64,  0.94, BG).save(f'{ic}/favicon.png')
place(512, 0.66, BG).save(f'{ic}/icon-maskable-512.png')

# 三、安卓开机屏图标：透明底、收进 66%（SplashScreen API 之律）
for dens, px in [('mdpi',288),('hdpi',432),('xhdpi',576),('xxhdpi',864),('xxxhdpi',1152)]:
    d = f'{ROOT}android/app/src/main/res/drawable-{dens}'
    os.makedirs(d, exist_ok=True)
    place(px, 0.66).save(f'{d}/splash_icon.png', optimize=True)
print('全套已出：PWA 5 枚 · 自适应源 3 枚 · 开机屏图标 5 密度')
`;

execFileSync('python3', ['-c', PY], { stdio: 'inherit' });
console.log('接着跑：npx @capacitor/assets generate --android '
  + "--iconBackgroundColor '#faf1e6' --iconBackgroundColorDark '#faf1e6'");
console.log('然后：npx cap sync android');
