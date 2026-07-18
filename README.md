# 选佛谱 · 十法界须弥山世界

> 蕅益大师《選佛譜》（1653）——掷「南無阿彌陀佛」二轮占察木轮，行须弥山十法界棋盘：
> 十五门二百二十位，从地狱直到成佛。支持**至多四人实时联机**与**在线聊天讨论**。

底本：《選佛譜》六卷 · 大藏經補編第 24 冊 No.136 · 依 CBETA 电子佛典结构化。
世界模型依《俱舍论》《起世经》《楞严经》等经论所述须弥山宇宙志构建，
逐节点经证见 [docs/世界模型·经证总表.md](docs/世界模型·经证总表.md)（102 条引文，自动生成、与游戏同源）。

## 玩法

- **掷轮**：依谱「置輪掌心，仰手旁擲」——长按掷轮钮默念一句「南无阿弥陀佛」，念毕松手旁掷。
- **行位**：两轮得字组合（那/謨表恶，阿/彌/陀/佛表善）决定从当前位升、降或安住；每掷出判词窗，交代去向与谱曰缘由（可读原谱原文）。
- **世界即棋盘**：须弥山、四洲、诸天、净土是可遨游的 3D 星图；行棋之余随时拖动观照，点门星展位次。
- **联机同修**：开房得四位房号，发给莲友即可入房（至多四人）；开局后按座次轮掷，轮到谁其名亮起；聊天随时可用；断线重连回原座、棋况保留。

## 本地开发

```bash
npm install
npm run dev        # 前端 http://localhost:5930（单机可玩）
npm run server     # 另开终端：联机后端 wrangler dev :8787（/api 已由 vite 代理转发）
```

## 校验

```bash
node scripts/simulate.mjs 500   # 无头整局模拟：数据闭环 + 整局可玩性（500 局全部圆满，中位约 24 掷）
node scripts/test-net.mjs       # 联机协议测试：四人房全流程 16 项（需先 npm run server）
npm run gen:docs                # 重新生成世界模型经证总表
```

## 部署（GitHub → Cloudflare）

一个 Worker 同时托管静态前端（`dist/`）与联机后端（Durable Objects），一条命令部署：

```bash
npm run deploy     # = vite build + wrangler deploy（首次会引导登录 Cloudflare）
```

绑定自有域名：Cloudflare Dashboard → Workers → xuanfopu-sumeru → Settings → Domains & Routes。

推上 GitHub 后如需自动部署，可在仓库加一个 Actions 工作流跑 `npm ci && npm run deploy`
（需在仓库 Secrets 配置 `CLOUDFLARE_API_TOKEN`）。

## 工程结构

```
index.html            入口
src/game.js           游戏本体（Three.js 须弥山世界 + 选佛谱行棋 + 联机接线）
src/net.js            联机客户端（房间/轮次/聊天/重连）
src/data.js           世界模型：55 节点 · 102 条经证（CBETA 结构化）
src/sfp-data.js       选佛谱：15 门 220 位 · 组合行位表（依原谱逐字结构化）
worker/index.js       Cloudflare Worker + RoomDO（房间制 WebSocket：名单/轮次/转发/留存）
scripts/              无头模拟 · 联机测试 · 文档生成
docs/                 世界模型经证总表 + 设计文档
wrangler.jsonc        Cloudflare 部署配置（静态资源 + Durable Objects）
```

## 联机架构

- 规则判定全部在客户端依原谱数据进行；服务端只做名单、轮次、转发与留存，**不改动任何谱义**。
- 每房一个 Durable Object（休眠式 WebSocket，空闲不计费）；房号即 DO 名。
- 消息协议：`join / start / move / end_turn / chat / sync / leave`，详见 `worker/index.js` 注释。

## 版权与依据

《選佛譜》为公版古籍；引用经文依 CBETA 通行本校写并标注出处。
音效采样来自 [Kenney Impact Sounds](https://kenney.nl/assets/impact-sounds)（CC0）。
本仓库代码与数据结构化成果归项目作者所有。
