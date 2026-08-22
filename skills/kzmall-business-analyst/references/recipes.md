# 取数与计算配方

按用户问题的类型组织。每个配方都是"取数 → 计算 → 回答要点"的完整链条。
所有数字都从脚本 stdout 来，配方里不出现任何需要你心算的步骤。

命令都在 `scripts/` 目录下执行，数据文件路径任选（示例统一用 `data/`）。

## 目录

- [销售额与毛利](#销售额与毛利)
- [排名与结构分析](#排名与结构分析)
- [趋势与对比](#趋势与对比)
- [客户与应收](#客户与应收)
- [库存](#库存)
- [资金与供应商](#资金与供应商)
- [自己写计算脚本](#自己写计算脚本)

## 销售额与毛利

### 某一天的经营情况

```bash
node kz-fetch.mjs day-report --date yesterday --out data/d.json
node kz-compute.mjs summary data/d.json \
     --revenue sale_fee --revenue-less dbck_fee --cost cost_fee --profit profit
```

一天只有一行，`summary` 的 `revenue`/`cost` 就是那一行的值，`gross_profit` 是脚本算的差，
`reported_profit` 是后端字段。

**`--revenue-less dbck_fee` 不要省。** 后端的 `profit` 是按 `(sale_fee − dbck_fee) − cost_fee` 算的，
`sale_fee` 里含调拨出库。省了这一项，遇到有调拨的日子 `derived_matches_reported` 就会是 `false`，
你会以为哪边算错了、去查一个并不存在的问题。加上之后两个毛利一致，口径对齐，可以直接引用。
报数时"销售额"用 `sale_fee`、"毛利率的分母"用已扣调拨的 `net_revenue`，差额就是调拨出库。

### 一段时间的销售额、成本、毛利

```bash
node kz-fetch.mjs day-report --date this-month --out data/m.json
node kz-compute.mjs summary data/m.json \
     --revenue sale_fee --revenue-less dbck_fee --cost cost_fee --profit profit
```

`day-report` 单次上限 31 天，正好覆盖一个自然月。跨月请改用 `month-report`。
取完先看 `date_coverage.missing_buckets`：当月今天通常还没有数据，区间要按实际有数据的那几天说。

### 已结束的整月 / 多个月

```bash
node kz-fetch.mjs month-report --date last-month --out data/lm.json
node kz-compute.mjs summary data/lm.json \
     --revenue sale_fee --revenue-less dbck_fee --cost cost_fee --profit profit

# 多月趋势（月报的日期会自动规整成 YYYY-MM-01）
node kz-fetch.mjs month-report --date 2026-01-01..2026-08-01 --out data/months.json
node kz-compute.mjs daily data/months.json --date-field dw_month --fields sale_fee,cost_fee,profit
```

### 含其他业务收支的利润（注意：不是净利润）

```bash
node kz-fetch.mjs profit-report --date last-month --out data/p.json
node kz-compute.mjs summary data/p.json --explode coreBiz --where cust_type=销售 \
     --revenue sale_fee --cost cost_fee --profit zy_profit
```

利润表的金额藏在嵌套数组里（`coreBiz[]` / `otherIncome[]` / `otherCost[]`），直接 `--fields sale_fee`
会报错，用 `--explode coreBiz` 先摊平。`--where cust_type=销售` 不是可选的：`coreBiz[]` 按客户类型
拆成 `销售` 和 `调拨` 两行，不筛就把调拨也当成销售收入了。两者合计要用后端的 `coreProfit`
（实测 = 两行 `zy_profit` 之和），不要自己把两行加起来。

`totalProfit`（= `coreProfit + otherProfit`）是含其他业务收支的口径。`otherProfit` 经常是负数，
只报主营会让用户高估——实测 2026-03 主营盈利、`totalProfit` 却是 −350531.08。

**但 `totalProfit` 不是净利润**：房租、人工、水电、税费、差旅都不在快准里，它比毛利多算的只有
其他收入、授信本金、销售收款费、调出收款费这几项资金与收款费用，所以报它时别用"净利润"这个词。
反过来，用户口语问"净利润/利润/赚了多少"时默认就是毛利，用 `sales-detail-cost` 的 `saleProfit`
直接答就行，不用绕到这里来（详见 `endpoints.md` 的"快准算不出真正的净利润"）。

回答时必须说明它与经营报表口径不同（含其他收支），否则用户会以为哪边算错了。
**还没结束的当月，两张表可能差一整天**：实测日报净销售额比利润表多 10946.00，
恰好等于最新一天。诊断办法见 `guardrails.md` 的"数据新鲜度是逐端点的"。

### 现金销售 vs 挂账销售

```bash
node kz-fetch.mjs day-report --date this-month --out data/m.json
node kz-compute.mjs sum data/m.json --fields sale_fee,cash_fee,credit_fee
```

`cash_fee` 即时收款、`credit_fee` 赊销。占比不要自己除——把两者和 `sale_fee` 一起交给
`sum`，然后用 `daily` 或自写脚本算比例，或直接用 `rank` 的 `*_share_percent`。

## 排名与结构分析

### 哪个品类 / 品牌最赚钱（含 TOP N 品类再分品牌）

用户口语说的"净利润""利润""赚了多少"在这里就是毛利，直接按 `saleProfit` 排，不用绕到利润表。

```bash
node kz-fetch.mjs sales-detail-cost --date this-month --split --allow-cost --out data/sdc.json

# 一级品类排名。加 --fields recAmount,cost 是为了同时给出毛利率，光有毛利容易误导
node kz-compute.mjs rank data/sdc.json --group firstCategoryName \
     --fields recAmount,cost,saleProfit --by saleProfit --top 10

# TOP N 品类各自再分品牌（把品类名换成上一步的第 1、2、3 名，逐个跑）
node kz-compute.mjs rank data/sdc.json --where firstCategoryName=过滤系统 \
     --group brandName --fields recAmount,cost,saleProfit --by saleProfit --top 10
```

**先读 `dropped_rows_warning`，再看排名。** 第三方仓的行 `firstCategoryName` 和 `brandName`
都是空的（实测 2026-08 有 46 行、1883.84 元毛利），`rank` 会把它们丢出分组并警告。
这不是可以忽略的零头：那 1883.84 元在当月能排到第 9 名，比 5 个真实品类都大。
两种处理都行——在回答里把它作为"未分类（第三方仓）"单列出来，或者自己写脚本给空值一个具名桶
并核对分桶合计与全量合计逐分相等。**不能默默让它消失**，那样用户看到的排名会缺一块而毫无提示。

**毛利率要一起给，因为"卖得多"和"赚得多"经常不是同一个品类。** 实测 2026-08：供电系统收入
47163.00 元全场最高，毛利只排第 3（毛利率 13.37%）；过滤系统收入 21459.00 元却是毛利第一
（44.29%）。同样的倒挂在品牌层再出现一次：启发点火里 NGK 收入 9902.00 高于费奇 7840.00，
毛利 1404.99 却远低于费奇的 3553.51。只报毛利排名，用户会漏掉这条最有价值的信息。

**问"整个店哪个品牌最赚钱"时把 `--where` 去掉、`--group brandName` 直接跑全量**，
不要拿几个品类的品牌榜自己加起来——同一个品牌常常横跨多个品类（巨江在过滤系统和供电系统都是第一）。

大客户是另一套单据（`key-account-sales-detail`），它的分类只有叶子级 `categoryName`，
没有一级分类。要并进来就先拿同区间的 `sales-detail` 反查叶子→一级的映射，反查不到就如实标注；
实测 2026-08 大客户毛利只有 57.50 元，并进来不改变 TOP3 名次，但要说明做了这一步。

### 某分类下卖得最好的商品（例：轮胎）

```bash
node kz-fetch.mjs category-tree --out data/cat.json
# 写一次性脚本从 data/cat.json 的 rows（即 data.tree）递归取"轮胎"子树的叶节点 id
node kz-fetch.mjs sales-detail --date this-month --split \
     --param kzCategoryIds='[110041346,110041347]' --out data/tyre.json
node kz-compute.mjs rank data/tyre.json --group skuId,number --label name,spec,brandName \
     --fields qty,recAmount --by recAmount --top 5
node kz-compute.mjs rank data/tyre.json --group skuId,number --label name,spec,brandName \
     --fields qty,recAmount --by qty --top 5
```

按金额和按数量的第一名经常不同，两个都算再让用户选口径。

**分组键固定写 `skuId,number` 两个字段。** `skuId` 是商品编码、最可靠的身份，但第三方仓商品的
`skuId` 是 `null`（实测 2128 行里 41 行、30 个商品、6824 元），只按它分组这些行会被整批丢掉；
`number` 是型号，蓄电池这类国标型号被多个 SKU 共用，只按它分组会把不同商品并成一个。
两个一起给，分组数 1177 → 1207，`totals` 与服务端页脚逐分相等。
`name` 不能做身份键——它是分类叶子名（"乘用车轮胎"），2128 行里只有 109 个不同值，
它的位置是 `--label`。看到 `dropped_rows_warning` 就说明分组键还不够。

也可以本地筛而不传 `kzCategoryIds`：`--where secondCategoryName=轮胎`。这样能看见筛选的两个方向，
但**两个都得看**：`local_filter.matched_values` 是往多了看（分类树里有个"轮胎清洗剂"叶子，
`--where categoryName~轮胎` 会把它算进轮胎销量）；`local_filter.blank_field_rows` 是往少了看——
第三方仓的行二级分类为空，会被这条 `--where` 在分组之前静默滤掉，`dropped_rows_warning` 不会响。
实测本月就有一条这样的轮胎（`categoryName="轮胎"`、`location="第三方仓"`、500.00 元）被漏掉，
`blank_field_rows.secondCategoryName.also_matched_in` 会直接指出"关键词在 categoryName 上命中了 1 行"。
遇到这种提示，就把那部分单独算一遍加回去，并在回答里说明这些行的分类字段是空的。

### 某品牌卖得怎么样

```bash
node kz-fetch.mjs brand-list --out data/brand.json   # 找到品牌 id
node kz-fetch.mjs sales-detail --date this-month --split --param brandId=123 --out data/b.json
node kz-compute.mjs sum data/b.json --fields qty,recAmount
node kz-compute.mjs rank data/b.json --group skuId,number --label name,spec --fields qty,recAmount --by recAmount --top 10
```

要和"全部品牌"比占比，再取一份不带 `brandId` 的同区间数据（注意仍需 `--split`，
且不加窄化条件时容易触达 2 MiB 上限），或者用 `day-report` 的 `sale_fee` 做分母并说明两者口径差异。

### 商品维度汇总（不需要逐笔）

```bash
node kz-fetch.mjs sales-summary-by-goods --date last-week --out data/g.json
node kz-compute.mjs rank data/g.json --group skuId,number --label name,spec,brandName \
     --fields qty,recAmount --by recAmount --top 10
```

比 `sales-detail` 轻（一行一个商品），但**没有分类筛选**，只能按客户/商品/仓库/品牌窄化。
它还是取商品数字 id 的地方——行里的 `invId` 就是各处商品筛选参数要的值：

```bash
node kz-compute.mjs distinct data/g.json --fields invId,number,name,brandName --measure qty,recAmount --top 30
```

分仓库看销售就按行里的 `locationNo` / `location` 本地分组（`storageNo` 参数实测不筛行）。

### 客户贡献排名

```bash
node kz-fetch.mjs sales-summary-by-customer --date last-week --out data/c.json
node kz-compute.mjs rank data/c.json --group buId,buName --label cCategoryName \
     --fields qty,recAmount --by recAmount --top 10
```

**这个端点不是一行一个客户**：实测 711 行对应 73 个客户 × 539 个商品，它是"客户 × 商品"的网格。
不分组直接求和会得到全部客户的合计（那是对的），但"客户排名"必须按 `buId,buName` 分组
（`buId` 是身份、`buName` 给人看）。实测 `integrity.all_match: true`，分组不丢行。

### 业务员业绩

```bash
node kz-fetch.mjs sales-detail --date last-week --param salesId=<员工 number> --out data/s.json
node kz-compute.mjs sum data/s.json --fields qty,recAmount
```

要全员对比就不带 `salesId` 取整周数据，然后 `rank --group salesName --fields recAmount --by recAmount`。

## 趋势与对比

### 环比 / 同比

```bash
node kz-fetch.mjs day-report --date this-month --out data/cur.json
node kz-fetch.mjs day-report --date last-month --out data/prev.json
node kz-compute.mjs compare data/cur.json data/prev.json --fields sale_fee,cost_fee,profit --labels 本月,上月
```

**本月通常还没结束**，和上月整月直接比会显得下滑。要么明确说明"本月 1–22 日 vs 上月整月"，
要么取上月同期（`--date 2026-07-01..2026-07-22`）做同口径对比。这一点必须在回答里讲清楚。

### 找出异常的日子

```bash
node kz-fetch.mjs day-report --date this-month --out data/m.json
node kz-compute.mjs daily data/m.json --date-field dw_billdate --fields sale_fee,profit
```

`stats` 里有 `average_per_bucket`、`max`、`min`，用它们定位高低点，不要自己扫一遍行去挑。

### "怎么样"类问题

用户问"昨天销售额怎么样"时，单个数字没有信息量。标准做法：取昨天 + 最近 7 天，
用 `daily` 的日均给昨天定位，再看毛利率是否偏离。参照区间是脚本算的，不是你估的。

## 客户与应收

### 谁欠钱、欠多少

```bash
node kz-fetch.mjs customer-balance --date this-month --param payStatus=2 --out data/ar.json
node kz-compute.mjs rank data/ar.json --group buName --fields lPreAmount,salesAmount --by lPreAmount --top 20
node kz-compute.mjs sum data/ar.json --fields fPreAmount,salesAmount,reAmount,lPreAmount
```

`lPreAmount` 是期末应收余额（欠款）。`payStatus=2` 只返回欠款客户。

### 收款情况 / 回款率

```bash
node kz-fetch.mjs receipt-list --date this-month --out data/rc.json
node kz-compute.mjs sum data/rc.json --fields amount
node kz-compute.mjs rank data/rc.json --group buName --fields amount --by amount --top 10
```

回款率需要"收款 ÷ 销售"，两个数来自不同端点，**不要口算**——写个一次性脚本读两个数据文件，
用 `kz-money.mjs` 的 `percent()` 算。并在回答里说明分子分母的口径（收款单含往期欠款回款，
不是本期销售的对应回款）。

### 逐单对账

```bash
node kz-fetch.mjs sales-reconcile-detail --date last-week --out data/rec.json
```

收款列是动态的，字段名在 `data.colIndex[]`、中文标题在 `data.colNames[]` 的同一下标。
要按收款方式拆分必须先读这两个数组（在数据文件的 `windows[0].raw` 里没有——它们在原始响应中，
需要时用 `--preview` 确认列名，或直接按 `colNames` 说明而不拆列）。

## 库存

### 还有多少库存

```bash
node kz-fetch.mjs inv-balance --param brandId=19 --out data/inv.json
node kz-compute.mjs sum data/inv.json --fields qty_1,qty_2,qty_3,allcost_1
node kz-compute.mjs rank data/inv.json --group skuId,invNo --label invName,brandName \
     --fields qty_1,allcost_1 --by allcost_1 --top 20
```

`qty_1` 全部仓、`qty_2` 快准仓、`qty_3` 三方仓；`allcost_1` 是库存金额（"压了多少钱"用它，
`cost_1` 是单位成本，不要求和）。字段名和销售明细不同：这里是 `invNo`（型号）/ `invName`（商品名），
而 `invName` 同样是分类叶子名，所以分组键用 `skuId,invNo`。

不带筛选的全量取不动（实测 8134 行 / 3.75 MiB，超 2 MiB 预算），所以只看一个品牌用
`--param brandId=`、只看一个商品用 `--param goods=<invId>`。**但"按品牌循环拼全量"是错的**——
见下一节，它会静默漏掉整个第三方仓。

### 全仓库存一共压了多少钱

要全量就走"分品牌 + 单独补第三方仓"两步，不能只做第一步：

```bash
# 1) 遍历品牌。brandId 接受逗号分隔的多个 id 且是真并集（实测 10 得 5 行/406.50、55 得 5 行/265.00、
#    10,55 得 10 行/671.50，与顺序无关），所以 466 个品牌每批 25 个拼一次、19 次请求就够
node kz-fetch.mjs inv-balance --param brandId=1,2,3,...,25 --out data/inv-batch00.json
# ... 其余批次同理。批太大只会撞 2 MiB 预算直接报错，调小重试是安全的

# 2) 必须补这一次：brandName 为空的行不属于任何 brandId，循环碰不到它们
node kz-fetch.mjs inv-balance --param storageNo=S001 --out data/inv-s001.json

# 3) 合并后一次算总额（自己写脚本读多个文件，或逐文件 sum 后由脚本相加）
node kz-compute.mjs sum data/inv-batch00.json --fields qty_1,allcost_1
```

第 2 步实测 169 行 / 65 KB / `allcost_1` 56186.88 元，占全量 5.46%。漏掉它的后果不只是总额少
5%：库存里真正的滞销大户就在这批行里，而"第三方仓库存 0 元"这个结论与事实正好相反。
带 `brandId` 取数时清单里会出现 `shard_coverage_warning` 提醒这件事，原理见
`guardrails.md` 的"分片丢行"。

也可以直接按仓库取（`warehouse-list` 给编码，实测 `KZ001` = 快准仓、`S001` = 第三方仓）：
`storageNo=S001` 一次就够，`storageNo=KZ001` 有 3.31 MiB 仍超预算、内部还得再按 `brandId` 切。
注意带 `storageNo` 时响应少一组仓库列（22 → 19），`allcost_1`/`qty_1` 变成**该仓库口径**
而不是全仓合计——两个仓库分别取再相加是对的，但别把带 `storageNo` 的 `allcost_1` 说成全仓。

每次响应都带 `data.userdata` 页脚，脚本会自动核对（`footer_reconciliation`）。它只能证明
"这个分片没丢行"，证明不了"分片集合覆盖了全表"。要给全量总额找独立旁证，用 `day-report`
最新一天的 `store_fee`（实测 1029704.23 vs 全量页脚 1028161.90，差 0.15%）核对量级。

还有一个别把参数名当结论的地方：`negative=true` 是"**只**看负库存"，不是"把负库存也算进来"，
实测返回 0 行。所以默认的 `negative=false` 并没有排除任何东西，别在回答里写"口径不含负库存"。

### 某商品这段时间进出多少

```bash
# goods 要的是商品数字 id（invId），从 sales-summary-by-goods 或 inv-balance 的行里取；
# 给商品编码（skuId）这类非数字值上游会直接 HTTP 500
node kz-fetch.mjs deliver-summary --date last-week --param goods=10423925 --out data/mv.json
node kz-compute.mjs flow data/mv.json
```

`deliver-summary` **必须窄化**（默认全量接近 10 MB），且单次 ≤ 7 天，两个开关：`goods` 与 `brandId`。

**不要自己挑 `qty_N` 列求和。** 那些下标由账号启用的业务类型决定，不是稳定契约——
同一个"结存"在仓库文档抓包里是 `qty_16`、在生产账号是 `qty_14`，照文档读会把
"还有 3 条"报成"结存 0"。`flow` 每次从数据里解列含义（判据是逐行成立的
"期初 + 入库合计 − 出库合计 = 结存"），并给出 `column_mapping` 说明这次解到了哪几列。

看整个品牌的收发、按商品排出库最多的：

```bash
node kz-fetch.mjs deliver-summary --date last-week --param brandId=19 --out data/mv19.json
node kz-compute.mjs flow data/mv19.json --group skuId,invNo --label invName,brandName --by outbound_qty --top 10
```

三种输出要分清楚：`no_flow: true` 是"这段时间没有任何收发"（**不等于没有库存**，当前库存看
`inv-balance`）；`column_mapping.ambiguity` 是行太少、列名没钉死，标了 `总合计一致: true` 的槽位
仍可照 `totals` 回答；`identity_check.matches: false` 才是真的不要给结论。

### 从来没卖出过的商品（"从来"是无界的，两种答法都要会）

用户问"有库存但从来没卖出过的商品"时，判定域是账号的全部历史，而销售端点单次只有 7 天。
有两种答法，成本和结论强度都不同——先想清楚要哪一种，别把下界当全部报出去。

**答法一：只用库存表，几十秒出下界。** 一笔销售必然是一次出库，所以
"最近销售时间 ≤ `out_time`"，于是 `out_time` 为空 ⟹ 从未出库 ⟹ **必然**从未卖出。

```bash
# 取全仓库存（两步走，见上一节，别只按 brandId 循环）
node kz-fetch.mjs inv-balance --param brandId=1,2,...,25 --out data/inv-batch00.json
node kz-fetch.mjs inv-balance --param storageNo=S001 --out data/inv-s001.json
# out_time 为空这一半可以直接用 --where（空值写成 字段= ，实测能正确挑出空行）
node kz-compute.mjs rank data/inv-batch00.json --where out_time= --group skuId,invNo \
     --label invName,brandName --fields qty_1,allcost_1 --by allcost_1 --top 20
```

"`qty_1 > 0`"这一半 `--where` 表达不了（只有 `=` `~` `!=` `!~`，没有数值比较），
所以要合并多个文件、或者库存里可能有零/负库存行时，就写一次性脚本把两个条件一起判。
实测这个账号 8134 行的 `qty_1` 全部大于 0，所以两种写法结果相同——但这是数据碰巧如此，
不是可以省掉的一步，`inv-balance` 的 `zero` 参数一变就不成立了。

这个名单里的每一个都确实从未卖出，可以直说。但它是**下界**：`out_time` 非空只说明出过库，
出库还包括调拨等非销售动作。实测下界 2286 款 / 220090.45 元，真值 2524 款 / 251898.59 元，
漏掉 238 款 / 31808.14 元（占真值金额 12.63%），漏掉的正是"只调拨过、从没卖过"的那批。
所以报这个数时要写明"这是可直接验证的部分，实际名单只会更大"。

**答法二：扫完全历史，给真值。** 先量历史有多长，再决定扫不扫——多数账号扫得动。

```bash
# 1) 探数据起点。月报单次上限 12 个月，所以分段查，找第一个 sale_fee > 0 的月份
node kz-fetch.mjs month-report --date 2025-09-01..2026-08-01 --out data/m-y1.json
node kz-fetch.mjs month-report --date 2024-09-01..2025-08-01 --out data/m-y2.json
node kz-fetch.mjs month-report --date 2023-09-01..2024-08-01 --out data/m-y3.json   # 返回不足 12 行就到头了

# 2) 从起点扫到今天。sales-summary-by-goods 一行一个商品，比销售明细轻得多；
#    大客户是另一套单据，必须单独扫一遍
node kz-fetch.mjs sales-summary-by-goods --date 2024-04-01..2026-08-22 --split \
     --max-requests 200 --out data/sold-goods.json
node kz-fetch.mjs key-account-sales-detail --date 2024-04-01..2026-08-22 --split \
     --max-requests 200 --out data/sold-ka.json
```

然后写脚本求差集：**连接键用 `invId`，不要用 `skuId`**——第三方仓商品的 `skuId` 是 `null`，
按它连接会把那批行全判成"没卖过"。`invId` 在 `inv-balance`、`sales-summary-by-goods`、
`key-account-sales-detail` 三边都有值。

`sales-summary-by-goods` 正是干这件事的量具：实测全历史 47679 行的 `billType` 全是 `SALE`、
`transTypeName` 只有 销售 / 销退 / 销售退款 三种，**没有调拨混进来**，所以"出现过 ⟺ 卖过"。
（对比 `day-report` 的 `sale_fee` 是含调拨的，不能用来判断某个商品卖过没有。）

实测成本：27 个月 = 126 个 7 天窗口 × 2 个端点，几分钟、约 25 MB。扫完记得核对
每个窗口的 `footer_reconciliation.all_match`——0 行的空窗口没有页脚，那是正常的
（实测 2024 年 4 月那 5 个窗口就是账号还没开始卖），别把它当成核对失败。

两种答法都要在回答里说明判定区间："从 2024-04（账号最早有数据的月份）到今天从未售出"
比"从来没卖过"更准确，也让用户知道这个结论建立在什么之上。

### 服务站级的库存金额（与单品口径的区别）

`inv-balance` 的 `allcost_1` 是**按商品行**汇总出来的库存金额，上面那一节讲的就是它。
另有一个服务站级的口径来自经营报表：`day-report` 的 `qc_store_fee`（期初）/ `store_fee`（期末）、
`month-report` 的 `avg_store_fee`（月均）。它是后端自己算的单个数字，不能拆到商品。

两者量级相符但不会逐分相等（实测差 0.15%），所以：要"哪些商品压了钱"用 `inv-balance` 分组；
要"库存金额趋势"用经营报表；把其中一个当作另一个的校验时说"量级一致"，不要说"已核对一致"。
`inv-balance` 的成本明细变体不在注册表里，不要去猜它的路径。

## 资金与供应商

### 现金银行流水

```bash
node kz-fetch.mjs settle-account-list --out data/acct.json    # 拿 number
node kz-fetch.mjs bank-journal --date last-week --param accountNo=<账户 number> --out data/bj.json
node kz-compute.mjs sum data/bj.json --fields income,expenditure
```

≤ 7 天，无可靠分页，**不要请求第 2 页**。结果永远标 `pagination_complete: false`，
回答时要带上"该报表不返回分页信息，结果为有界结果"这类说明。

### 欠供应商多少

```bash
node kz-fetch.mjs contact-home --out data/contact.json        # data.supplier[].id
node kz-fetch.mjs payable-detail --date last-week --param accountNo=<供应商 id> --out data/ap.json
node kz-compute.mjs sum data/ap.json --fields amount
```

注意 `accountNo` 在这个端点是**供应商 id**，和 `bank-journal` 的含义完全不同。

## 自己写计算脚本

`kz-compute.mjs` 覆盖不到的算法（加权平均、ABC 分类、跨端点比率、拟合）自己写，模板：

```js
// analyze.mjs —— 和 kz-*.mjs 放在一起，或用相对路径 import
import { readFileSync } from 'node:fs'
import { parseAmount, format, percent, sumField } from './kz-money.mjs'

const doc = JSON.parse(readFileSync(process.argv[2], 'utf8'))
if (doc.manifest.possibly_truncated) {
  console.error(JSON.stringify({ error: '数据可能被截断，拒绝计算' }))
  process.exit(1)
}

const rev = sumField(doc.rows, 'recAmount').total   // BigInt，已放大 1e6
const qty = sumField(doc.rows, 'qty').total
console.log(JSON.stringify({
  source: { file: process.argv[2], endpoint: doc.manifest.endpoint, rows: doc.rows.length },
  revenue: format(rev, 2),
  avg_price: qty === 0n ? null : format((rev * 1000000n) / qty, 2),
}, null, 2))
```

三个要点：

1. **先检查 `manifest.possibly_truncated`**，截断数据上的合计是错的，宁可拒绝计算。
2. **金额用 `kz-money.mjs`**，不要 `Number()` + `+`——几千行浮点累加会产生用户看得见的差额。
3. **输出带 `source`**，说明数字来自哪个文件、哪个端点、多少行，这样结论可以被复查。
