# 選佛譜智能體 · Worker

`xuanfopu-agent-v2`。**M5 版**：模型自輸入端（intent 吐結構）進至輸出端（compose 據文組織成話）。

M3 只開定本①與拒答④，無密鑰、零生成。那一版守得住準確，卻守成了一部檢索工具——
實測 52 個真實玩家問法，拒答 57.7%，檢得者又直吐文言原文（玩家看見的是「譜曰。五停心者…」）。
M5 補生成三路，拒答降至 **25.0%**，而定本 4620 格仍**零生成**、仍逐格回歸 100%。

## 路由 —— 兩層，非八條並列（M5.1，發起人 2026-08-04 定「學 NotebookLM，拒答率做到零」）

對外只一件事：**問 → 帶引文的答 → 點引文看原文**。對內兩層：

**① 定本層**（查表直出，ttft 0.6ms，**零生成**）

| | |
|---|---|
| canon | 位×相精確命中 → 直出答語與逐字引文 |
| position | 「某位是什麼」→ 位義白話＋本位譜曰 |
| table | 「某位擲各相如何走」→ 二十一相逐條列 |

三者同源：皆是承注庫逐格審定、canon-eval 逐格回歸的確定事實。模型重述只會令硬指標
失去意義，且 ttft 從 0.6ms 變 2s。玩家要深入，走 expand。

**② 據文層**（檢索譜內 692 塊 → 模型據文組織成話，逐句掛角標）

| | |
|---|---|
| corpus | 名相義理。原文降為引文卡 |
| rules | 玩法與局面。材料為規則綱要＋當下實局＋行法表 |
| expand | `ask:'expand'`，定本首答之下「再講開一點」。材料限該格引文與本位譜曰 |
| personal | 個人決斷。**決定不替他做，而譜內相關次第照給** |
| wenku | 指名他家、或譜內無著落之淨土修學問 → 轉佛樂（署「大安法師講記」） |

### 拒答不再是一條路

從前尾段有三重閾值（強命中 ≥40／worthWenku／弱命中 ≥24），不中者答「此事《選佛譜》未載」。
實測 52 問拒答 26.9%，而逐條核對底本，**九條是譜裡明明有卻檢索評分不足**——
拿檢索的短處去做「譜中有無」的判詞，本就錯位。

今一律據文作答。答不了，模型依鐵律三直說「这几段谱文讲的是…，你问的这一点这里没有说到」，
不說「我答不了」。拒答只餘一種：**檢索全零命中**，據實說沒找著，請其換個說法。

**三處分寸不是拒答**（實質一步未讓，只是不再空手）：

- 個人決斷 → 決定不替他做（2026-08-02 之裁定不動），門七戒學十三位次第照給
- 占卜吉凶 → 明白回絕，並掛《敘》「皆本教乘非出臆見」為據（`boundary`）
- 身份之問 → 據實自陳，別立 `identity`，**不計入拒答**（問的不是譜，答的正是所問）

**降級亦不空手**（`streamGrounded`）：無鑰／額滿／上游故障時，譜文照引、行法表照列、
分寸話照說。從前降級即落「此事未載」——上游忙不等於譜裡沒有。降級路拒答率亦為 0.0%。
降級之由見 `meta.degradedReason`（`nokey`／`quota`／`upstream:<碼>`／`fetch:*`／`nomaterial`）。

### 問法橋（`search.js`）

玩家說白話，書是文言，bigram 對不上：「这是谁写的」檢索 **0 命中**，而卷首明明署
「古吳蕅益道人述」。故立十一條問法橋，把玩家的話翻成書裡的話——零延遲、可逐條審，
**每條皆出自實測失敗問句**。收效：人道是第幾門 6.6→120.6、成佛是哪一位 6.0→104.4。

## 生成三路之護欄

模型吐話，校不得欄，故逐句回查——`compose.gate()` 按句緩衝，每句過 `verifyAnswer` 方放行。
問文鈔那邊只能作事後遙測（「流式吐完才檢出，來不及」），我們 passages 在手且是有限集，故做得成。

分級處置：角標越界者剝角標仍吐；直引對不上・憑空位名・門號錯・憑空數字 → **丟句**。
丟句過半即標 `ungrounded`。無密鑰／上游故障一律降級回 M3 行為——地基不依賴模型可用性。

## 生成閘（`guard.js`，2026-08-04 P1）

生成四路（corpus／rules／expand／wenku）每問皆是真金白銀，而 workers.dev 與
foyue.org 路由公網可直打——故立閘。三件事：

1. **來源分級**。信任判據＝service binding 獨有的 `ask.internal` 主機名（公網按 Host 路由，
   偽造不了；跨帳號建不了 binding）。公網直訪**密鑰不入 env**，意圖層與生成層自然降級，
   行為即 M3：定本／位本／行法表照答（零成本，直訪備路留得住），生成路原文直出。
   前車之鑑第五條（換 UA 重置配額）就此堵死——直訪根本沒有配額可談。
2. **日配額**。遊戲內轉按 `x-ask-client`（遊戲側 sha256(IP+UA)，不含原始 IP）計，
   `ASK_GEN_DAILY` 默認 60。額滿降級 M3，不拒答。定本三路零成本不限。KV 缺綁放行（評測與 dev）。
3. **答案快取**。corpus／expand 已過閘之答存 KV 七日（鍵含模型名＋數據版次 builtAt，
   換模型或重建數據自然失效）；命中零成本不扣額，且**前置於意圖層**——
   實測復問 ttft 由 4.3s（意圖層 V4-Pro 一調）降至 2–4ms。rules 路材料含活局面，不快取。

`done` 隨之兌現契約欄位：生成路帶 `remaining`（當日餘額）與 `cacheStatus`（hit／miss）。
評測 `eval/guard-eval.mjs` 十五項釘死此三事，無密鑰無網絡全跑。

## 模型

`wrangler.toml` 之 `[vars] COMPOSE_MODEL` 一行即切；意圖層另有 `INTENT_MODEL`
（2026-08-04 發起人定：兩層統一硅基流動 V4-Pro。意圖層非流式 200 token，實測一調約 3–4s，
故快取前置探取先於意圖層跑——復問不付此帳）。**實測 2026-08-04**（同問句、流式、關思考）：

| 模型 | ttft |
|---|---|
| **V4-Pro（現用）** | **1.6s** |
| V3.2 | 4.1s |
| V4-Flash | 97.1s / 92.3s / 34.2s |

名為 Flash 者反最慢二十至六十倍——新模型容量未跟上，隊列最擠；而前端 abort 為 45s，
三次有二次逕超時。**換模型後須重跑 `player-eval --model`**，ttft 與丟句數都要看。

關思考用 `enable_thinking: false`（實測 `reasoning_tokens` 歸零方為生效；
`chat_template_kwargs` 那式無效，仍思考四百餘 token）。另於解析處棄 `reasoning_content` 作二重保險。

## 協議

ndjson 流式，欄位名對齊問文鈔 `ai-core.js`，前端可複用那套內核。

```
{"type":"meta","passages":[…],"sources":[…],"facts":{…},"basis":{"mode":"canon"},"timing":{"ttft":9}}
{"type":"delta","text":"…"}
{"type":"done","verify":{"ok":true,…},"evidenceStatus":"grounded"}
```

`facts` 只帶前端渲去向按鈕之所需；核驗用的 `ansDests` 另走 `toVerifyFacts()`，不發往前端。

## 數據

`src/canon.js` 由 `agent/gen-worker-data.mjs` 從 `agent/index/hub.json` 生成（**勿手改**）。
`src/corpus.js` 由 `agent/gen-corpus.mjs` 生成，內含簡→繁歸一表 2295 條——
其中 1380 條係**書中實有名相**逐條轉簡反建（2026-08-04 補：通用表不收「舍→捨」，
玩家打「八背舍」對不上書中「八背捨」，評分 9.6 卡在生成閾值下，遂被誤判「未載」；
拿書中真有之詞反查，鍵長皆 ≥2，零歧義。詳 `eval/报告-20260804-真问真核.md`）。

全 bundle 2141 KB，gzip 後 **381 KB**，Workers 免費版 1 MB 上限內。

改承注規則表後，須依序重跑：

```bash
node 承注/expand.mjs          # 全十五門展開（不帶參數即全跑）
node agent/build-hub.mjs      # 位樞紐圖
node agent/gen-worker-data.mjs # Worker 定本數據
node agent/eval/canon-eval.mjs # 全量回歸，四項須 100%
```

## 本機起

```bash
node agent/worker/src/index.js   # 非直接可跑，見 scratchpad/serve-agent.mjs 之 node 包裝
npx wrangler dev --config agent/worker/wrangler.toml --port 8788
```

遊戲側 `vite.config.js` 已把 `/api/ask` 代理到 8788（開發用）。

## 部署

```bash
npx wrangler deploy --config agent/worker/wrangler.toml
```

部署後改遊戲 `wrangler.jsonc` 之 service binding 一行即可切換：

```jsonc
"services": [{ "binding": "ASK_SERVICE", "service": "xuanfopu-agent-v2" }]
```

舊 binding 保留可回退。**舊 worker `xuanfopu-evidence-agent` 刪除前須先存檔至 `agent/_legacy/`**
——它是那份源碼的唯一存在（本機已佚），系統提示詞、檢索配置、`evidenceStatus` 實際算法皆在其中，
是設計書「前車之鑑六問題」的一手材料。
