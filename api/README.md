# 選佛譜正本 API

蕅益智旭《選佛譜》六卷（1653）**十五門・二百二十位・四六二〇格**全量正本，
連同**全書原文七萬六千字**與**逐層白話**，只讀 JSON 接口。

- 線上：`https://api.foyue.org`
- 底本：CBETA 大藏經補編第 24 冊 No.136（公版古籍）
- 無需鑑權，CORS 全開

## 一 · 這套接口出的是什麼

### 原文（譜主之文，逐字底本）

| 層 | 端點 | 來處 |
|---|---|---|
| 卷首卷末四篇 | `/v1/front` | `src/sfp-canon.js` |
| 十五門總說 | `/v1/doors/{no}` 之 `intro` | 同上（門1・2・15 原譜無，為空串） |
| 二百二十位位注 | `/v1/positions/{name}` 之 `canon` | `src/sfp-data.js` `SFP_POS.note` |
| 全書 692 塊 | `/v1/text` | `全文/corpus.json`（人工分塊，語義邊界） |

**位注原文分三段**（切點表 `src/sfp-canon-split.js`，220 位逐位人工核定）：

```json
"canon": {
  "full":       "十惡者。一殺生。…　那那。則邪見增盛。…",
  "exegesis":   "十惡者。…故是地獄因也。　",     // 義解段：這一位是什麼
  "practice":   "那那。則邪見增盛。…",            // 行法段：逐組輪相判語
  "postscript": null                              // 後論：不屬任何一相的通論或問答
}
```

- `practice` 為 `null` 者 **80 位**——原譜行法承前，位注只述義解（如〈四見地〉全文僅二十四字）。
- `postscript` 全譜僅 **6 位**有：〈見取〉〈戒取〉〈根本四禪〉〈四無色定〉〈意見參禪〉〈光音天〉。
  這六段不屬二十一相中任何一相，切不出來就會被誤算作末相的續文。

### 白話（本項目手譯，不冒「譜曰」）

| 層 | 端點 | 條數 |
|---|---|---|
| 卷首卷末四篇 | `/v1/front` 之 `vernacular` | 4 |
| 位下後論 | `/v1/positions/{name}` 之 `postscript_vernacular` | 6 |
| 門義 | `/v1/doors/{no}` 之 `vernacular` | 15 |
| 位注 | `/v1/positions/{name}` 之 `vernacular` | 220 |
| 逐組判詞 | `/v1/rules` 之 `plain` | 4620 |

白話層字段：`text` 正文・`rows` 明細行（`{k, v}`，`k` 限四字內）・`source` 出處・
`ext` 他經補注（須帶經號行號）・`self_authored` 本項目自撰導語・`partial` 尚未全覆譯・
`uncertain` 存疑留痕。

### 行法（每格五樣）

| 欄 | 是什麼 |
|---|---|
| `verdict` | 判定：行・不行・贈擲・無行法 |
| `to` / `to_door` / `direction` | 去處之位、所屬門、升降 |
| `bonus` | 贈擲數 |
| `plain` | 白話正本 |
| `cite` | 該格所繫譜曰逐字引文 |

**判定四種，「無行法」不是「不行」。** 不行是某一路不通、尚有別路可行；無行法專指第十五門
〈圓極果位門〉——該門原文不列輪相行法表，妙覺極果「圓滿菩提。歸無所得」，本無再擲之法。
母本保留二十一行只為維持 220 × 21 的矩形結構。

## 二 · 端點

| 端點 | 說明 |
|---|---|
| `GET /` | 自述索引（端點清單與統計） |
| `GET /v1/meta` | 譜之總說與統計 |
| `GET /v1/glyphs` | 六字定诠四層義（卷首〈輪相表法第一〉） |
| `GET /v1/combos` | 二十一輪相 |
| `GET /v1/doors` ・ `/v1/doors/{no}` | 十五門（單門帶總說原文＋門義白話＋諸位） |
| `GET /v1/positions` ・ `/v1/positions/{name}` | 二百二十位（單位帶原文三段＋白話＋二十一格） |
| `GET /v1/rules` ・ `/v1/rules/{position}/{combo}` | 四六二〇格 |
| `GET /v1/front` ・ `/v1/front/{title}` | 卷首卷末四篇（原文＋白話） |
| `GET /v1/text` ・ `/v1/text/{id}` | 全書原文 692 塊 |
| `GET /v1/search?q=` | 全文檢索 |
| `GET /v1/export` | 全量下載 |
| `GET /openapi.json` | OpenAPI 3.1 規格 |

**篩選**：`/v1/rules` 收 `?door=` `?position=` `?combo=` `?verdict=` `?to=`；
`/v1/text` 收 `?juan=` `?kind=` `?section=` `?position=`；
`/v1/search` 收 `?in=position|plain|cite|vernacular|text`。
**分頁**：`?page=` `?limit=`（上限 500）。

**位名**可用繁體、簡體、正式全名或序號 1–220；**輪相**可用繁體、簡體或序號 1–21。

### 例

```bash
curl https://api.foyue.org/v1/positions/上品十惡          # 原文三段＋白话＋廿一格
curl https://api.foyue.org/v1/front/輪相表法第一           # 全谱字义总纲，原文＋白话
curl 'https://api.foyue.org/v1/text?position=見取'         # 该位全文六块
curl 'https://api.foyue.org/v1/search?q=取相懺&in=vernacular'
curl 'https://api.foyue.org/v1/export?include=text'        # 全量含全书原文
```

## 三 · 二十一相之序

前十五為標準序，後六為相雜六相：

```
那那 那謨 謨謨 阿阿 阿彌 彌彌 阿陀 彌陀 陀陀 那佛 謨佛 阿佛 彌佛 陀佛 佛佛
那阿 謨阿 那彌 謨彌 那陀 謨陀
```

此序與 `agent/worker/src/canon-route.js`、`.claude/skills/sfp-baihua/check.mjs` 同，**不得改動**。

## 四 · 施工

```bash
node api/build.mjs                                    # 由七處正本生成 api/src/canon.js
node api/test.mjs                                     # 本地自檢（111 項）
node api/test.mjs https://api.foyue.org               # 線上自檢
npx wrangler deploy --config api/wrangler.jsonc       # 部署
```

或 `npm run api:build` / `api:test` / `api:deploy`（deploy 先跑自檢，不過即不部署）。

**任一層正本一改，須重跑 `api/build.mjs` 再部署**——`api/src/canon.js` 是生成物，勿手改。

### build 時的四道互校（任一不過即不出數據）

1. **四六二〇格**：格數、「‖」分隔、去處皆在位表之內。
2. **位注三段拼回**：`exegesis + practice + postscript` 須逐字等於 `full`。
3. **門總說兩本互校**：底本 `SFP_CANON_DOORS[n].intro` 去「譜曰。」領起後，
   須逐字等於結構化本 `SFP_DOORS[n].intro`。
   *門十五為唯一例外*——底本抽取把位名「佛」及其下六句標目掃進了 intro，
   而原譜本門無總說（同門1、門2）；六句標目另掛該位 `headings` 欄。
4. **位注兩本互校**：底本 `SFP_CANON_DOORS[n].positions[].text` 與結構化本
   `SFP_POS.note`，去空白、歸一異體字後，須逐字相同**或**底本為結構化本之子序列。
   非此二者即報錯。

> **兩本對 CBETA 夾注的處置不同**（19 位，非數據漂移）：底本把括號夾注連內容整條刪去，
> 結構化本去括號而留字。如〈八關齋戒〉「故功行稍勝也。(初八日。十四日…)」、
> 〈初發心住〉「亦是勝進接也。(從淨土來者。不行那那。下五位准知。)」，
> 以及十三處「(文)」引文完結標記。
> **API 取結構化本**：它字多而不少，且白話正本四六二〇格的引文皆繫於它。
> 另有二處異體字（〈彌勒內院〉迴／囘、〈八背捨觀〉脛／𨄔），比對前歸一。

### 自檢覆蓋

111 項，本地與線上兩路皆可跑。逐格比對正本源文（白話或引文一字出入即報錯）、
三段與切點表逐位相符、各層白話逐條對源、692 塊原文逐塊對 corpus、分頁不重不漏、
去處皆實有之位、贈數與判定相符。

## 五 · 數據與成本

- bundle 內建 626 KB（gzip 388 KB），無 KV／D1／DO 依賴，冷啟即答。
- **邊緣緩存走 Cache API 顯式存取**——Worker 生成的響應不會自動進 Cloudflare 緩存
  （Worker 站在緩存之前），光靠 `Cache-Control` 響應頭只管得住瀏覽器那一側。
  故入口處先 `caches.default.match`，命中即直接吐出。響應帶 `x-cache: HIT|MISS` 可自查。
- **未在碼中設限流。** 古籍公版內容本就任人取用；同一 URL 第二次起即由邊緣緩存應答，
  刷取成本落不到 Worker 上。若日後見異常，在 Cloudflare 儀表盤加一條 Rate Limiting
  規則即可，不必動碼。

## 六 · 已知缺口

全書 692 塊中有 **2 塊**母本錨句 `to` 為空，未取到正文：
`j4-g08-p01-def`（六妙門禪位注）、`j4-g08-p02-def`（十六特勝位注）。
接口如實出 `"text": "", "empty": true`，**不以位注全文冒充**——
該二位的位注原文另在 `/v1/positions/六妙門禪`、`/v1/positions/十六特勝` 完整可取。

## 七 · 與既有兩個 Worker 的關係

| Worker | 域 | 職責 |
|---|---|---|
| `xuanfopu-sumeru` | `game.foyue.org` | 遊戲站與聯機後端（Durable Object） |
| `xuanfopu-agent-v2` | `foyue.org/xuanfopu/ask/api` | 問答智能體（定本路由＋生成四路） |
| `xuanfopu-canon-api` | `api.foyue.org` | **本接口**——正本只讀數據 |

三者各自獨立部署，互不相干。本接口不改動前二者任何一行。
