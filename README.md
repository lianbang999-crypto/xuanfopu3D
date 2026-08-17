# 十法界须弥山世界（附选佛谱）

> **依经立象的须弥山十法界教学模型**：三界二十八天、四大部洲、从地狱到佛，
> 皆按《俱舍论》《长阿含·世记经》《起世经》等经论定位，逐节点注明经据；
> 内置「导览模式」自动巡游十七站（须弥总览→三涂→人天→四圣→极乐），站站可读经证、可出海报分享。
>
> 附：蕅益大师《選佛譜》（1653）修行对局——掷「南無阿彌陀佛」二轮占察木轮，
> 行十五门二百二十位棋盘，从地狱直到成佛。支持**至多四人实时联机**与**在线聊天讨论**。

底本：《選佛譜》六卷 · 大藏經補編第 24 冊 No.136 · 依 CBETA 电子佛典结构化。
世界模型依《俱舍论》《起世经》《楞严经》等经论所述须弥山宇宙志构建，
逐节点经证见 [docs/世界模型·经证总表.md](docs/世界模型·经证总表.md)（102 条引文，自动生成、与游戏同源）。

## 玩法

- **掷轮**：依谱「置輪掌心，仰手旁擲」——长按掷轮钮默念一句「南无阿弥陀佛」，念毕松手旁掷。
- **行位**：两轮得字组合（那/謨表恶，阿/彌/陀/佛表善）决定从当前位升、降或安住；每掷出判词窗，交代去向与谱曰缘由（可读原谱原文）。
- **世界即棋盘**：须弥山、四洲、诸天、净土是可遨游的 3D 星图；行棋之余随时拖动观照，点门星展位次。
- **真人共修**：2–4 位真人入座准备后共同开局；按座次轮掷，轮相与棋况由服务器裁定；聊天随时可用，断线重连回原座。
- **贈掷施与同席**：掷得「贈N掷」者不自留，择一位同席莲友受之，受赠者在自身所在之位续掷；无人可受（含一人行谱）则此贈作废。此为本项目**定稿操作规则**（`data/grant-ontology-v1.json`，操作层裁定，非原谱逐字规定）。

## 本地开发

```bash
npm install
npm run dev        # 前端 http://localhost:5930（单机可玩）
npm run server     # 另开终端：联机后端 wrangler dev :8787（/api 已由 vite 代理转发）
```

## 校验

```bash
node scripts/simulate.mjs 500   # 无头整局模拟：数据闭环 + 整局可玩性（500 局全部圆满，中位约 24 掷）
npm run test:engine             # 浏览器/服务端共用的纯规则引擎
npm run test:room               # 开局、赠掷续手、补齐本轮与共同结算
npm run test:net                # 真人共同对局协议（需先 npm run server）
UI_ARTIFACT_DIR=/tmp/xuanfopu-ui npm run test:ui  # 真人前台交互（需同时启动 server 与 dev）
UI_ARTIFACT_DIR=/tmp/xuanfopu-v90 npm run test:v90 # V90 内容校正及场景、光影、左侧档位、须弥山环缝回归（需先 npm run dev）
NET_BASE=http://127.0.0.1:8787 npm run test:plaza
npm run gen:docs                # 重新生成世界模型经证总表
```

## 部署（GitHub → Cloudflare）

一个 Worker 同时托管静态前端（`dist/`）与联机后端（Durable Objects），一条命令部署：

```bash
npm run deploy     # = vite build + npx wrangler deploy（首次会引导登录 Cloudflare）
```

绑定自有域名：Cloudflare Dashboard → Workers → xuanfopu-sumeru → Settings → Domains & Routes。

## 安卓 App（Capacitor · 2026-08-17）

网站与 App 同一份构建，运行时以 `window.Capacitor` 分辨（`src/app-env.js`）；壳内 API 指向
`game.foyue.org`，静态资源全内置（离线可玩单机与六卷阅读）。热更新自托管：`npm run deploy`
产出的 `app-manifest.json`（逐文件 sha256）即热更清单，App 启动静默比对、增量下载
（字体/材质等未变者不重下）、下次启动生效；出问题「我的」页有「回到内置版」自救，
`notifyAppReady` 未报则插件 10 秒自动回滚。

```bash
npm run build && npm run gen:app-manifest && npx cap sync android   # 构建并同步进壳
cd android && JAVA_HOME=$(/usr/libexec/java_home -v 21) ./gradlew assembleRelease
cd .. && npm run stage:apk        # APK 归位 public/download/ 并出 release.json
npm run deploy                    # 站点与安装包一并上线
```

**下载地址**：<https://game.foyue.org/app.html>（下载页：二维码＋安装引导＋校验码）
安装包直链 <https://game.foyue.org/download/sumeru.apk>（固定短名，二维码与外发链接永不变；
存盘名由 worker 的 `Content-Disposition` 给中文带版本）。两条路径已列入 `wrangler.jsonc` 的
`run_worker_first`——命中静态资源的路径默认不进 worker，不列则自定义响应头是白附的。

APK 与 `release.json` 不入库（`.gitignore`），故换机或重新 clone 后须先跑一遍
`gradlew assembleRelease` 与 `npm run stage:apk` 再 deploy，否则下载页会显示「安装包尚未发布」。
安装包**不入热更清单**（`gen-app-manifest.mjs` 排除 `download/`），否则 App 每次热更会把自己
那 22MB 的 APK 一并拉下来。

> ⚠️ Cloudflare 静态资源单文件硬上限 **25 MiB**，当前 APK 22.75 MiB 余量不足 2.3 MiB。
> `stage:apk` 过 23 MiB 会告警；真超限则 deploy 被拒，须改走 R2 或 GitHub Releases。

签名密钥在 `android/keystore/`（**不入库，务必自行备份**——丢失即无法给已装用户升级）。
版本源唯一在 `package.json`（`0.403.0` ↔ v403），发版时同步递增 `android/app/build.gradle`
的 `versionCode`。工具链：JDK 21（`~/Library/Java/JavaVirtualMachines/`）与
Android SDK（`~/Library/Android/sdk/`），皆 headless 装妥，无需 Android Studio。

推上 GitHub 后如需自动部署，可在仓库加一个 Actions 工作流跑 `npm ci && npm run deploy`
（需在仓库 Secrets 配置 `CLOUDFLARE_API_TOKEN`）。

## 问义加速架构

- 浏览器只请求同域 `/api/ask`，由游戏 Worker 通过 Cloudflare Service Binding 直连 `xuanfopu-evidence-agent`，不暴露模型密钥。
- 问义 Worker 使用 D1 保存 30 天全局答案缓存；相同问题首次生成，之后跨设备直接复用经据核验后的完整回答。
- 每日 100 次限制由服务端按匿名哈希标识执行，只计算真正生成；本机缓存和 D1 缓存命中都不消耗生成次数。

## 工程结构

```
index.html            入口
src/game.js           游戏本体（Three.js 须弥山世界 + 选佛谱行棋 + 联机接线）
src/net.js            真人联机客户端（准备/轮次/结算/聊天/重连）
src/data.js           世界模型：55 节点 · 102 条经证（CBETA 结构化）
src/sfp-data.js       选佛谱：15 门 220 位 · 组合行位表（依原谱逐字结构化）
src/sfp-engine.js     单机与服务端共用的纯行棋规则引擎
worker/index.js       Cloudflare Worker + RoomDO（服务器权威对局 + 问义同域代理）
scripts/              无头模拟 · 联机测试 · 文档生成
docs/                 世界模型经证总表 + 设计文档
wrangler.jsonc        Cloudflare 部署配置（静态资源 + Durable Objects + 问义 Service Binding）
```

## 联机架构

- 浏览器与 Worker 共用 `src/sfp-engine.js`；服务器生成轮相并提交权威棋况，客户端只负责动画与经据呈现。
- 共同生命周期：`waiting → playing(waiting_toss/resolving/choosing_grant) → finished → 再准备`；个人不能重开或覆盖他人棋况。
- 每条掷轮命令携带 `requestId`，重复发送只返回原结果；非当前操作者和旧版 `move` 上报均被拒绝。
- 贈掷走服务器施受队列：掷得者在 `choosing_grant` 相位择人（三十秒未择即按座次自动施与），受赠者续掷至队列用尽才轮转下一位；`p.bonus` 一律由队列重算，前台只镜像不另记账。
- 本手限时：在线一分钟、断线三十秒、判词兜底一分钟、择人三十秒，均随 `room.turnDeadline` 下发，前台在掷轮钮与判词卡上呈现剩余秒数。连续两手未掷即「暂离」，可随时点掷轮钮或面板上的「我回来了」归队。
- 每房一个 Durable Object（休眠式 WebSocket，空闲不计费）；房号即 DO 名。
- 消息协议：`join / ready_set / start_match / toss_request / turn_done / grant_choose / wake / chat / sync / leave`，详见 `worker/index.js`。

## 版权与依据

《選佛譜》为公版古籍；引用经文依 CBETA 通行本校写并标注出处。
音效采样来自 [Kenney Impact Sounds](https://kenney.nl/assets/impact-sounds)（CC0）。
本仓库代码与数据结构化成果归项目作者所有。
