# 選佛譜正本 API

蕅益智旭《選佛譜》六卷（1653）**十五門・二百二十位・四六二〇格**全量正本，只讀 JSON 接口。

- 線上：`https://api.foyue.org`
- 底本：CBETA 大藏經補編第 24 冊 No.136（公版古籍）
- 白話正本：`正本/门01.js`…`门15.js`，2026-08-09 规程逐门校审
- 無需鑑權，CORS 全開

## 一 · 這套接口出的是什麼

每一格（位 × 輪相）出五樣東西：

| 欄 | 是什麼 | 來處 |
|---|---|---|
| `verdict` | 判定：行・不行・贈擲・無行法 | `src/sfp-data.js` 之 `SFP_POS.moves` |
| `to` / `to_door` / `direction` | 去處之位、所屬門、升降 | 同上（`direction` 由門號比得） |
| `bonus` | 贈擲數 | 同上 |
| `plain` | **白話正本**——本項目所撰，非原文 | `正本/门NN.js` 之「‖」前段 |
| `cite` | 該格所繫**譜曰逐字引文** | `正本/门NN.js` 之「‖」後段 |

位另帶 `definition`（本位定诠，即譜曰定义段）與 `anchor`（須彌山十法界世界地圖錨點）。

**判定四種，「無行法」不是「不行」。** 不行是某一路不通、尚有別路可行；無行法專指第十五門
〈圓極果位門〉——該門原文不列輪相行法表，妙覺極果「圓滿菩提。歸無所得」，本無再擲之法。
母本保留二十一行只為維持 220 × 21 的矩形結構。文案上須分判，不得混作「不行」。

## 二 · 端點

| 端點 | 說明 |
|---|---|
| `GET /` | 自述索引（端點清單與統計） |
| `GET /v1/meta` | 譜之總說（六字輪相、大師自敘）與統計 |
| `GET /v1/glyphs` | 六字定诠四層義（卷首〈輪相表法第一〉） |
| `GET /v1/combos` | 二十一輪相 |
| `GET /v1/doors` | 十五門 |
| `GET /v1/doors/{no}` | 單門（門首語＋所轄諸位） |
| `GET /v1/positions` | 二百二十位（`?door=` 篩選・分頁） |
| `GET /v1/positions/{name}` | 單位（本位定诠＋二十一格全） |
| `GET /v1/rules` | 四六二〇格（`?door=` `?position=` `?combo=` `?verdict=` `?to=` 篩選・分頁） |
| `GET /v1/rules/{position}/{combo}` | 單格 |
| `GET /v1/search?q=` | 全文檢索（位名・定诠・白話・引文；`?in=position\|plain\|cite`） |
| `GET /v1/export` | 全量下載（約 1.6 MB） |
| `GET /openapi.json` | OpenAPI 3.1 規格 |

**位名**可用繁體、簡體、正式全名或序號 1–220；**輪相**可用繁體、簡體或序號 1–21。
分頁 `?page=` `?limit=`（上限 500）。

### 例

```bash
curl https://api.foyue.org/v1/rules/上品十惡/那那
curl 'https://api.foyue.org/v1/rules?door=2&verdict=贈擲'
curl 'https://api.foyue.org/v1/search?q=取相懺&in=cite'
curl https://api.foyue.org/v1/positions/1
```

單格響應：

```json
{
  "door": 1, "door_title": "發始因地門",
  "position_no": 1, "position": "上品十惡",
  "combo_no": 1, "combo": "那那", "first": "那", "second": "那",
  "verdict": "行",
  "to": "阿鼻地獄", "to_no": 30, "to_door": 3, "direction": "升",
  "bonus": 0,
  "plain": "兩輪都是「那」……",
  "cite": "譜曰：那那。則邪見增盛。撥無因果。……"
}
```

> `direction` 只按門號先後比得——門次是譜主所定的次第，非果報高下。
> 「升」謂去處在後門，如上品十惡（門一）往阿鼻地獄（門三）；讀時須看去處本身是什麼。

## 三 · 二十一相之序

前十五為標準序，後六為相雜六相：

```
那那 那謨 謨謨 阿阿 阿彌 彌彌 阿陀 彌陀 陀陀 那佛 謨佛 阿佛 彌佛 陀佛 佛佛
那阿 謨阿 那彌 謨彌 那陀 謨陀
```

此序與 `agent/worker/src/canon-route.js`、`.claude/skills/sfp-baihua/check.mjs` 同，**不得改動**。

## 四 · 施工

```bash
node api/build.mjs                                    # 由正本生成 api/src/canon.js
node api/test.mjs                                     # 本地自檢（60 項）
node api/test.mjs https://api.foyue.org               # 線上自檢
npx wrangler deploy --config api/wrangler.jsonc       # 部署
```

或用 npm 腳本：`npm run api:build` / `npm run api:test` / `npm run api:deploy`。

**正本一改，須重跑 `api/build.mjs` 再部署**——`api/src/canon.js` 是生成物，勿手改。
自檢第四節逐格比對正本源文，白話或引文有一字出入即報錯。

## 五 · 數據與成本

- bundle 內建 360 KB（gzip 229 KB），無 KV／D1／DO 依賴，冷啟即答。
- **邊緣緩存走 Cache API 顯式存取**——Worker 生成的響應不會自動進 Cloudflare 緩存
  （Worker 站在緩存之前），光靠 `Cache-Control` 響應頭只管得住瀏覽器那一側。
  故入口處先 `caches.default.match`，命中即直接吐出。響應帶 `x-cache: HIT|MISS` 可自查。
- **未在碼中設限流。** 古籍公版內容本就任人取用；同一 URL 第二次起即由邊緣緩存應答，
  刷取成本落不到 Worker 上。若日後見異常，在 Cloudflare 儀表盤加一條 Rate Limiting
  規則即可，不必動碼。

## 六 · 與既有兩個 Worker 的關係

| Worker | 域 | 職責 |
|---|---|---|
| `xuanfopu-sumeru` | `game.foyue.org` | 遊戲站與聯機後端（Durable Object） |
| `xuanfopu-agent-v2` | `foyue.org/xuanfopu/ask/api` | 問答智能體（定本路由＋生成四路） |
| `xuanfopu-canon-api` | `api.foyue.org` | **本接口**——正本只讀數據 |

三者各自獨立部署，互不相干。本接口不改動前二者任何一行。
