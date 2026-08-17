// 壳内原生转发与存图（2026-08-17 · 发起人报「APP 里邀请同修不能转发、海报存不下」）
//
// 病根：安卓 WebView 不是浏览器，网页上好用的两条路在壳内都是死的——
//   · navigator.share：Web Share API 是 Chrome 的，WebView 里根本没有（实测 undefined），
//     故 quickShare 一路落到「分享卡＋复制」，点转发像没反应；
//   · <a download> 存 blob：WebView 不支持 blob 下载，点了静默失败，海报存不下来。
// 正解是交给原生：@capacitor/share 唤系统分享面板，@capacitor/filesystem 落盘再分享。
//
// 本模块只在 IS_APP 时由 share.js 动态 import——网页用户永不下载这两个插件，
// 网页那两条路一字不动（那边 navigator.share 与 download 本来就好用）。
import { Share } from '@capacitor/share';
import { Directory, Filesystem } from '@capacitor/filesystem';

/** 转发文字与链接：唤系统分享面板。返回 false 则由调用处落回分享卡。 */
export async function nativeShareText({ title, text, url }) {
  try {
    await Share.share({ title, text, url, dialogTitle: title });
    return true;
  } catch (e) {
    // 用户自己取消也走这里（安卓不区分），一样算「已处理」，不该再弹分享卡扰人
    if (/cancel/i.test(String(e?.message || ''))) return true;
    return false;
  }
}

/** 存海报：canvas → 落 Cache 目录 → 唤系统分享面板（存相册／发微信皆由用户在面板里择） */
export async function nativeSharePoster(canvas, { title, fileName = 'sumeru-poster.jpg' } = {}) {
  try {
    const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
    const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
    // 落 Cache 而非 Documents：这是给分享用的中转件，系统会自行回收，不占用户存储、不需存储权限
    const w = await Filesystem.writeFile({ path: fileName, data: base64, directory: Directory.Cache });
    await Share.share({ title, files: [w.uri], dialogTitle: title });
    return true;
  } catch (e) {
    if (/cancel/i.test(String(e?.message || ''))) return true;
    return false;
  }
}
