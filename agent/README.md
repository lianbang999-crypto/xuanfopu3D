# 選佛譜智能體（正本）

**此為正本。2026-08-04 由副本升格，發起人裁定：此後只維護此一版。**

原正本在 `选佛谱G版/agent/`，已凍結不再維護（彼處留有凍結標記）。
舊「單向同步：源 → 副本」之規矩**作廢**——語料工程已隨倉遷入，本倉自足，
改智能體、改承注規則、重建數據，一律在本倉做。

## 語料工程（隨倉，倉根目錄）

智能體的數據不是憑空來的，是三個人工工程逐層產出的，2026-08-04 已全數遷入本倉：

```
繁体版/            CBETA 補編 No.136《選佛譜》六卷底本（權威）
  ├─ 承注/         185 條規則 → expand.mjs → expanded.json 4620 格（含 審校本/、推演記.md）
  └─ 全文/         692 塊錨句（corpus.json，人工分塊，覆蓋率 100%）
xuanfopu-h5/data/  220 位人工核對底本（positions.json + aliases.json，crosscheck 所依）
名相/              名相映射（dfb-map.json，歷史工程存檔）
agent/智能体·设计书.md   設計書（前車之鑑六問題、五層底本、四路由、三道紀律、里程碑）
```

`canon.js`／`corpus.js`／`hub.json`／`src/sfp-chengzhu.js` 皆是產物，**勿手改**——
改底本或規則表後按下述鏈條重建。

## 重建鏈（改承注規則後依序跑，皆在本倉根目錄）

```bash
node 承注/expand.mjs            # 全十五門展開（不帶參數即全跑）
node agent/build-hub.mjs        # 位樞紐知識圖 → agent/index/hub.json
node agent/gen-worker-data.mjs  # Worker 定本數據 → agent/worker/src/canon.js
node agent/eval/canon-eval.mjs  # 全量回歸，四項須 100%
```

改全文分塊後：`node agent/gen-corpus.mjs`（→ `agent/worker/src/corpus.js`）。
改承注後前端側同步：`node agent/gen-chengzhu.mjs`（→ `src/sfp-chengzhu.js`），
再跑 `npm run check:evidence`。

**遷移驗證（2026-08-04）**：全鏈自本倉重跑一遍，五處產物與遷移前逐字一致
（僅 `builtAt` 日期戳之差）；canon-eval 4620 格四項 100%、intent-eval 地基 7/7、
crosscheck 220/220 去向零差、`check:evidence`／`build` 全綠。

## 評測

| 檔 | 何用 |
|---|---|
| `eval/canon-eval.mjs` | 定本全量回歸（4620 格命中・核驗・引文・去向四項須 100%）＋檢索＋旁路 |
| `eval/intent-eval.mjs` | 意圖層。甲組（無密鑰正則路）須全過；乙組加 `--model` 併測 |
| `eval/player-eval.mjs` | 真實玩家問法。**換 COMPOSE_MODEL 後必跑**，看 ttft 與丟句數 |
| `eval/guard-eval.mjs` | 生成閘（P1）：公網零生成・配額之數・快取回放，無密鑰無網絡全跑 |

四份可一併跑：倉根 `npm run test:agent`。

真問真核（經遊戲正門實打、對底本逐字核驗）之記錄見
[`eval/报告-20260804-真问真核.md`](eval/报告-20260804-真问真核.md)——
內含已修二事（簡體名相檢索失配、答語替整部譜下斷言）與待辦五條。

## 部署

```bash
cd agent/worker && npx wrangler deploy
```

Worker 名 `xuanfopu-agent-v2`，路由 `foyue.org/xuanfopu/ask/api`，
綁定 `WENKU_SERVICE → bojingtai`（佛樂問文庫）。詳見 `worker/README.md`。

遊戲側經 service binding 調用（`wrangler.jsonc` 之 `ASK_SERVICE`），不走公網。

## 體積

`agent/` 5.4 MB（`index/hub.json` 佔 4.2 MB，只評測與重建時用，部署不上傳——
`wrangler deploy` 只打包 `worker/src/`，gzip 348 KB）。語料工程五處合計約 5.4 MB。
