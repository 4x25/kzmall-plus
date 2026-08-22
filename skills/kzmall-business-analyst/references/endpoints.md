# 端点参考

本文件是 `scripts/kz-endpoints.mjs` 注册表的人类可读版本，字段释义来自 kzmall-plus 仓库
`docs/api/` 的抓包取证。**注册表之外没有可调用的接口。**

不确定某个字段是什么意思、某个参数该传 id 还是 number 时，先查这里再取数。

## 目录

- [通用规则](#通用规则)
- [字段名陷阱对照表](#字段名陷阱对照表)
- [经营与利润](#经营与利润)：`day-report` `month-report` `profit-report`
- [销售](#销售)：`sales-detail` `sales-detail-cost` `sales-summary-by-goods` `sales-summary-by-customer` `sales-order-list` `sales-return-list` `sales-reconcile-detail`
- [大客户销售](#大客户销售)：`key-account-sales-list` `key-account-return-list` `key-account-sales-detail` `key-account-return-detail`
  —— **与"销售"是两套互不覆盖的单据体系**，经营报表也没有合并两者，问总额必须两侧相加
- [库存](#库存)：`inv-balance` `deliver-summary`
- [资金与应收应付](#资金与应收应付)：`receipt-list` `customer-balance` `bank-journal` `payable-detail`
- [主数据](#主数据)：`category-tree` `brand-list` `contact-home` `key-account-category` `warehouse-list` `store-list` `employee-list` `settle-account-list` `pay-method-list`
- [不可调用的能力](#不可调用的能力)

## 通用规则

- 所有请求都经 kzmall-plus 网关：`/api/<快准路径>`，带 `X-Credential` 头。会话由网关维护。
- **HTTP 200 不等于查询成功。** 每个端点的成功谓词写在下面，脚本逐端点判定，不满足即 fail closed。
- 金额字段混着 `number` 和数值字符串（个别带千分位逗号），一律交给 `kz-money.mjs` 解析。
- `nd` 是防缓存时间戳、`_search`/`sidx`/`sord` 是表格参数，都不是业务条件。
- 几个端点的真实请求带**重复的 `action` 键**（销售明细、现金银行、应付明细）。注册表用有序键值对保留，
  自己写请求时用普通对象会把前一个覆盖掉，后端行为随之改变。

## 字段名陷阱对照表

同名参数在不同报表里含义不同。传错不会报错，只会静默返回错误范围的数据——这是本技能最容易出的错。

下表的"实际要传什么"都是在生产账号上逐个试过的：**注册表只暴露实测生效的参数**，
被证明无效的位置已固定为空值，传了会报错并指向 `--describe`。

| 参数 | 在哪个端点 | 实际要传什么 | 来源 |
|---|---|---|---|
| `goodsNo` | `sales-detail`、`sales-detail-cost`、`sales-summary-by-goods` | 商品 **数字 id**，也就是行里的 `invId` | `sales-summary-by-goods` / `inv-balance` 行的 `invId` |
| `goods` | `inv-balance`、`deliver-summary` | 同上，同一个 `invId` | 同上 |
| `customerNo` | `sales-detail`、`sales-summary-by-customer` | 客户 **number** | `contact-home` → `data.contact[].number` |
| `customerNo` | `sales-summary-by-goods` | 客户 **id** | `contact-home` → `data.contact[].id` |
| `salesId` | `sales-order-list` | 员工 **id** | `employee-list` → `data.items[].id` |
| `salesId` | `sales-detail`、`sales-detail-cost` | 员工 **number** | `employee-list` → `data.items[].number` |
| `accountNo` | `bank-journal` | 结算账户 **number** | `settle-account-list` → `data.items[].number` |
| `accountNo` | `payable-detail` | 供应商 **id** | `contact-home` → `data.supplier[].id` |
| `brandId` | 全部业务报表 | 品牌 **id**（不是 code） | `brand-list` → `data.items[].id` |
| `kzCategoryIds` | `sales-detail`、`sales-detail-cost` | 叶节点 id 的 **JSON 数组字符串**，空值是 `[]` | `category-tree` → `data.tree` 递归 |
| `saleType` | `sales-detail`、`sales-detail-cost` | `-1` 全部（默认）、`0` 销售、`1` 铺货、`2` 微仓铺货 | 页面固定枚举 |
| `buId` | `sales-order-list`、`receipt-list`、`customer-balance` | 客户 **id** | `contact-home` |
| `storeId` | `profit-report`、`sales-order-list` | 门店 **id** | `store-list` → `data[].id` |
| `wayId` | `receipt-list` | 结算方式 **id** | `pay-method-list` → `data[].id` |

### 商品 id 怎么来

只有一个来源：**业务数据行自带的 `invId`**。没有独立的商品搜索接口（商品列表接口是加密的，见文末），
但这不影响按商品筛选：

```bash
node kz-fetch.mjs sales-summary-by-goods --date last-7-days --out data/goods.json
node kz-compute.mjs distinct data/goods.json --fields invId,number,name,brandName --measure qty,recAmount --top 30
```

拿到 `invId` 后可以精确窄化三个端点（都实测过，各返回 1 行）：
`sales-detail --param goodsNo=<invId>`、`inv-balance --param goods=<invId>`、
`deliver-summary --param goods=<invId>`。多个商品用逗号分隔：`goodsNo=10423925,11053`。

注意 `invId` ≠ `skuId`。`skuId` 是商品编码（`B102010539` 这种），
把它当 `goodsNo` 传给 `sales-detail`，**上游直接 HTTP 500，不是返回空**。

### 被证明无效、已固定留空的参数

传这些参数脚本会报错。它们不是"暂不支持"，而是实测证明加与不加响应逐字节相同——
留着比不留危险，因为一个不生效的筛选条件会让你以为看的是子集、实际看的是全表。

| 参数 | 端点 | 实测结果 |
|---|---|---|
| `storageNo` | `sales-detail`、`sales-summary-by-goods` | 不筛行。在按商品汇总里只是少了另一个仓库的 `count_` 列、行序不同，行集合完全一致 |
| `storageNo`、`storage` | `deliver-summary` | 完全不生效 |
| `goodsNo`、`storage` | `inv-balance` | 完全不生效 |
| `goodsNo` | `deliver-summary` | 完全不生效 |
| `cateoryTreeValue` | `sales-detail` | 三方类别老树，候选 id 只能从注册表之外的接口取，没有合法取值来源 |
| `catId`、`catName`、`area_name` | `inv-balance` | 线格式未闭环 |

**一处更正：`inv-balance` 的 `storageNo` 确实筛行**，这张表以前把它误列在上面。实测全量 8134 行、
`storageNo=KZ001` 得 7965 行、`storageNo=S001` 得 169 行；`allcost_1` 页脚 1028161.90 =
971975.02 + 56186.88，行数与金额都逐分构成精确划分。带上它响应会少一组仓库列（22 → 19），
`allcost_1`/`qty_1` 也随之变成**该仓库口径**而不是全仓合计。这条更正是取全量库存的唯一正确办法，
详见下面 `inv-balance` 一节。

要分仓库统计**销售**：取 `sales-summary-by-goods`，按行里的 `locationNo` / `location` 本地分组。

后端有几个历史拼写错误，注册表按真实线格式保留，不要"修正"：`cateoryTreeValue`（Category 拼错）、
`salepPofitRate`（Profit 拼错）、`delieverId`（Deliver 拼错）。

## 经营与利润

### `day-report` 经营报表-日报

`GET /report/getDayReport` · 成功谓词 `status === 200` · 行容器 `data.rows` · 页脚 `data.userdata`
· 单次 ≤ 31 天 · 无可靠分页（行数少，一天一行）

这是回答"某天/某段时间销售额、成本、毛利"的首选：后端已按经营口径算好，包含销退等调整。
但它是**普通客户口径**——大客户在 `big_sale_*` 系列字段里单列，问"含大客户的总额"要另外加，见下。

**日期字段是 `dw_billdate`**，不是 `date` 也不是 `billdate`。`--date-field` 写错脚本会报错并列出可用字段。

| 字段 | 含义 |
|---|---|
| `dw_billdate` | 日期 |
| `sale_fee` | 销售额 = **普通客户销售 + 调拨出库**，**不含大客户**（见下） |
| `dbck_fee` | 调拨出库金额 |
| `cost_fee` | 销售成本（同样只是普通侧口径） |
| `profit` | 销售毛利（同样只是普通侧口径） |
| `profit_rate` | 毛利率（百分比字符串，例如 `"23.45"`） |
| `big_sale_num` / `big_sale_fee` / `big_sale_cost` | 大客户销售单数 / 收入 / 成本（**非展示辅助字段**，`big_sale_cost` 是负号口径） |
| `big_return_num` / `big_return_fee` / `big_return_cost` | 大客户退货单数 / 金额 / 成本（同为负号口径） |
| `kzSaleFee` / `kzCostFee` / `kzProfit` / `kzProfitRate` | 快准商品部分的销售额/成本/毛利/毛利率 |
| `cash_fee` | 现金（即时收款）销售额 |
| `credit_fee` | 挂账（赊销）销售额 |
| `xt_fee` / `xtds` | 销退金额 / 销退单数 |
| `ckds` | 出库单数 |
| `hjsk_fee` / `hjfk_fee` | 合计收款 / 合计付款 |
| `hj_cg_fee` | 合计采购金额 |
| `qc_store_fee` / `store_fee` | 期初库存金额 / 期末库存金额 |
| `station_code` | 服务站编码 |

`data.userdata` 是同一批字段的服务端合计，用于和脚本行求和交叉核对。

**已核验的口径恒等式**（2026-08 逐日、2026-03..08 逐月都成立到分位）：

```
profit = (sale_fee − dbck_fee) − cost_fee
```

也就是后端的毛利是从**扣掉调拨出库之后的收入**里减成本。所以推导毛利时必须
`--revenue sale_fee --revenue-less dbck_fee --cost cost_fee --profit profit`，
少了 `--revenue-less` 会得到 `derived_matches_reported: false`，让人误以为哪边算错了。

回答时把两个数分开说：**"销售额"报 `sale_fee`**，**"毛利率的分母"是扣了调拨的 `net_revenue`**。

**`sale_fee` / `cost_fee` / `profit` 都不含大客户。** 2026-03..07 逐月逐分验证过：
`sale_fee − dbck_fee` 恰好等于 `sales-detail-cost` 的 `recAmount` 行求和，`cost_fee` 等于 `cost` 行求和，
`profit` 等于 `saleProfit` 行求和；大客户单独放在 `big_sale_fee` / `big_sale_cost`。
所以**这个报表不能当"含大客户的总销售额"用**——要总额得把
[`key-account-sales-list`](#大客户销售) 的结果加上去。
（2026-08 当月不吻合，差额来自数据新鲜度：月报比明细表少一天左右。）

**数据延迟 1～2 天。** 实测 2026-08-22 查本月，08-21 和 08-22 都还没有行。
所以"某天没有行"要说成"那天还没有数据"，绝不能说成"营业额 0 元"——看 `date_coverage.missing_buckets`。

### `month-report` 经营报表-月报

`GET /report/getMonthReport` · 成功谓词 **`success === true && status === "success"`**（与日报不同）
· 行容器 `data.rows` · 页脚 `data.userdata` · `beginDate`/`endDate` 必须是 `YYYY-MM-01`

字段与日报基本一致，日期字段为 `dw_month`；库存字段是 `avg_store_fee`（月均库存金额）而不是
日报的 `qc_store_fee`/`store_fee`。整月或跨月趋势用它比用日报再自己汇总更可靠。

`profit = (sale_fee − dbck_fee) − cost_fee` 在月报同样成立（实测 2026-03..2026-08 六个月逐分一致）。

**单次上限 12 个月**（超了报"单次最多查询 12 个月"），这个限制顺带让它成了"这个账号的数据
从哪个月开始"的探针：往前分段查，返回行数不足 12 就说明查到头了。实测
`2025-09..2026-08` 与 `2024-09..2025-08` 各返回 12 行，`2023-09..2024-08` 只返回 5 行、
其中 4 个月有销售——即本账号数据始于 2024-04、销售始于 2024-05，全部历史只有 27 个月。
回答"从来""一直""有史以来"这类无界问题之前先这样量一下历史长度，再决定是扫全量还是
只给下界，见 `guardrails.md` 的"无界断言"。

### `profit-report` 利润表

`GET /reports/ProfitReport/getProfitReport` · 成功谓词 `status === 200` · 数据在 `data`（数组）
· `startMonth`/`endMonth` 为 `YYYY-MM` · 跨度 ≤ 12 个月

口径比经营报表宽：含其他业务收支。数字和经营报表不相等是正常的，回答时要说明。

| 路径 | 含义 |
|---|---|
| `data[].month` | 月份 |
| `data[].coreBiz[].cust_type` | 客户类型（主营业务分项维度） |
| `data[].coreBiz[].sale_fee` / `.cost_fee` | 该类型的销售额 / 销售成本 |
| `data[].coreBiz[].zy_profit` / `.zy_profit_rate` | 主营毛利 / 毛利率 |
| `data[].coreProfit` / `.coreProfitRate` | 主营业务利润 / 利润率 |
| `data[].otherIncome[].sk_mode` / `.qtsr_fee` | 其他收入的收款方式 / 金额 |
| `data[].otherCost[].sk_mode` / `.qtzc_fee` | 其他支出的方式 / 金额 |
| `data[].otherProfit` | 其他业务利润 |
| `data[].totalProfit` | 合计利润 |

**金额都在嵌套数组里，直接 `--fields sale_fee` 会报错。** 先展开再挑口径：

```bash
node kz-compute.mjs summary data/profit.json --explode coreBiz --where cust_type=销售 \
     --revenue sale_fee --cost cost_fee --profit zy_profit
```

`--where cust_type=销售` 不是可选的。`coreBiz[]` 按客户类型拆成 **`销售` 和 `调拨` 两行**，
不加筛选展开求和等于把调拨也当成销售收入。想要两者合计时用 `coreProfit`
（实测 = 两行 `zy_profit` 之和），不要自己把两行加起来。

后端还会在顶层 `data[]` 末尾追加一行 `month="合计"` 的区间汇总行，与月度行相加会把整段区间算两遍。
取数阶段已按注册表的 `excludeRows` 自动剔除，剔了几行写在 `manifest.excluded_rows` 里——
落盘的行可以直接求和，但如果你绕过 `kz-fetch.mjs` 自己请求，这一行要自己处理。

**已核验的跨报表对应关系**（2026-03..2026-08 已结束的月份逐分一致）：

```
利润表 coreBiz[cust_type="销售"].sale_fee  = 经营报表 sale_fee − dbck_fee
利润表 coreBiz[cust_type="销售"].zy_profit = 经营报表 profit
利润表 coreProfit                          = coreBiz 各行 zy_profit 之和
利润表 totalProfit                         = coreProfit + otherProfit
```

所以这两张表**不该**得到相同的"销售额"，差的正是调拨出库。
把其他业务收支也算进来的利润是 `totalProfit`——**注意它不是净利润**，见下。
注意 `otherProfit` 经常是负数（授信本金、收款费等都记在 `otherCost[]`），
实测 2026-03 的 `totalProfit` 因此为 −350531.08，而同月主营是盈利的——
只报其中一个数会让用户得到相反的结论。

**但在还没结束的当月，上面前两条可能整整差一天，而两个数都是对的。** 2026-08-22 一天之内实测到两次：

- 上午：日报 `sale_fee − dbck_fee = 189715.20`、利润表 `销售.sale_fee = 178769.20`，差 10946.00；
  毛利差 2941.65。差额恰好等于 2026-08-21 一整天的净销售额与毛利——把日报只算到 08-20，两边逐分相等。
  同一时刻月报的 `sale_fee` 与日报本月合计逐分相同（194581.20），所以落后的是利润表。
- 下午：利润表已追到 189715.20，而 `sales-detail-cost` 行合计变成 195128.20 / 146085.63 / 49042.57。
  差额 5413.00 / 4224.60 / 1188.40 三个字段**同时**逐分等于 2026-08-22 这一天的行合计。
  落后的仍然是利润表，只是落后的那一天换了。

**数据新鲜度是逐端点的，不是全站统一的**，而且它在一天之内就会移动。

对不上时的正确诊断顺序：先按日期从新到旧逐日剔除日报，看差额是否正好等于被剔掉的那几天。
等于 → 新鲜度差异，两张表都没错，报较新的口径并说明另一张截至哪天；
不等于 → 才是真的口径或完整性问题，这时不要给结论。这个减法要写脚本算，不要目测。

响应里还有一个字面量键 `200`，那不是成功标志，别拿它做判定。

#### 快准算不出真正的净利润，`totalProfit` 也不是净利润

先划清系统边界：**房租、人工、水电、税费、差旅这些非经营性开支根本不在快准里。**
所以"扣完所有费用的净利润"这个数，这套接口无论怎么组合都算不出来。

由此有两条实用结论：

1. **商品销售场景里，用户口语说的"净利润""利润""赚了多少"默认就是毛利。** 直接按 `saleProfit`
   回答，不要先纠正用户的用词，也不要展开成一段免责声明——在口径行里写一句
   "毛利 = 折后收入 − 进货成本，未扣门店房租人工等费用"就够了。
2. **`totalProfit` 比毛利宽一点，但它同样不是净利润，不要用"净利润"这个词报它。**
   它比毛利多算的只有其他收入、授信本金、销售收款费、调出收款费这几项资金与收款费用。

三个口径由窄到宽，可拆分性依次递减：

| 口径 | 字段 | 能拆到什么维度 |
|---|---|---|
| 毛利 | 行级 `saleProfit`（= `recAmount − cost`） | 品类、品牌、商品、客户、仓库、员工，任意分组 |
| 主营利润 `coreProfit` | `coreBiz[]` 的 `zy_profit`（销售 + 调拨） | 只能分到"销售"与"调拨"两类，没有商品维度 |
| `totalProfit` | 主营 + 其他业务收支 | **只有整体数**，`otherIncome[]` / `otherCost[]` 没有任何维度字段 |

用户明确要"把其他收支也算进来"时，用这个桥接（脚本算，别口算）：

```
主营销售毛利 zy_profit(销售)  +  调拨毛利 zy_profit(调拨)  =  coreProfit
coreProfit  +  otherProfit（= otherIncome 合计 − otherCost 合计）  =  totalProfit
```

实测 2026-08（截至 08-21）：47854.17 + 212.51 = 48066.68；498.50 − 2702.50 = −2204.00；
`totalProfit` 45862.68，与接口返回值逐分相等。其中**无法归属到任何品类的是 −1991.49 元，
占销售毛利 −4.16%**——这就是各品类毛利之和与 `totalProfit` 的全部差额。

用户特意想知道"把其他收支摊进来会不会改变名次"时，可以把 `otherProfit` 按各品类毛利占比
等比例摊一次做敏感性检验（实测 2026-08 前五名完全不变）。这只是检验，**分摊结果不能当成
各品类的利润报出去**——真实费用不会正好按毛利比例发生。它不是默认动作，用户没问就别做。

## 销售

本节全部是**普通客户 / 门店零售**的单据，不含大客户业务——大客户在
[下一节](#大客户销售) 的另一套接口里。`saleType` 参数只区分 销售/铺货/微仓铺货，
它**不是**大客户与普通客户的分界。

### `sales-detail` 销售明细表

`GET /report/salesDetail_detail`（真实请求带两个 `action`：`detail` 和 `sales_detail`）
· 成功谓词 `status === 200` · 行容器 `data.rows` · 页脚 `data.userdata`
· **单次 ≤ 7 天**，且强烈建议至少一个窄化条件 · 无可靠分页（只取有界第一页）

| 参数 | 说明 |
|---|---|
| `beginDate` / `endDate` | 必填，`YYYY-MM-DD` |
| `customerNo` | 客户 **number**（`contact-home` 的 `number`，如 `55160001`）。给 `buId` 会返回 0 行 |
| `goodsNo` | 商品 **数字 id** = `invId`。给 `skuId` 这类编码上游直接 HTTP 500 |
| `brandId` | 品牌 id（实测 112 行 → 26 行） |
| `kzCategoryIds` | 叶节点 id 的 JSON 数组字符串，空为 `[]`（实测 `[110041346,110041347]` 只留轮胎行） |
| `saleType` | `-1` 全部（默认）、`0` 销售、`1` 铺货、`2` 微仓铺货，只用这四个值 |
| `salesId` | 员工 number |

`customerNo` / `goodsNo` / `salesId` / `brandId` 都支持逗号分隔多值
（实测 `goodsNo=10423925,11053` 返回 2 行 2 个 SKU），一次问几个商品不用取几次。

本端点**没有仓库筛选**（`storageNo` 实测不生效，已固定留空）。要分仓库看销售改用
`sales-summary-by-goods`，按行里的 `locationNo` 本地分组。

| 行字段 | 含义 |
|---|---|
| `date` / `billNo` / `billId` | 单据日期 / 单号 / 单据内部 id |
| `buName` / `buId` / `cCategoryName` | 客户名称 / 客户 id / 客户分类 |
| `skuId` | **商品编码，商品身份的首选分组键**；第三方仓商品这一列是 `null`，见下 |
| `number` | 型号（轮胎的规格花纹在这里，如 `205/55R16 91V EL316`） |
| `name` | 商品名称，实际是分类叶子名（"乘用车轮胎"）——**不足以标识商品** |
| `spec` / `unit` / `packSpec` / `minNum` | 规格 / 单位 / 包装规格 / 最小起订 |
| `productCode` | 厂商编码 |
| `brandName` | 品牌 |
| `firstCategoryName` / `secondCategoryName` / `categoryName` | 一级 / 二级 / 叶子分类 |
| `qty` | 数量 |
| `unitPrice` | 单价（**不是 `price`**） |
| `amount` | 金额（未减折让） |
| `disAmount` | 折让金额 |
| `recAmount` | **应收金额 = `amount` − `disAmount`**（实测逐行成立），算"销售额"用它 |
| `location` / `areaNo` | 发货仓库（**不是 `stoName`**）/ 库位 |
| `salesName` / `delieverName` | 业务员 / 配送员（常为 `null`） |
| `transTypeName` / `transType` / `billNoTypeStr` | 业务类型名 / 类型码 / 单据类型 |

**商品身份用 `--group skuId,number` 两个字段。** 两个原因，都实测过（2026-08 整月 2128 行）：

- `number` 是型号，蓄电池这类国标型号会被多个 SKU 共用：1178 个 `skuId` 只对应 1177 个 `number`，
  其中 13 个型号对应多个 SKU（`6-QW-80min(450)-C` 一个型号对应 5 个 `skuId`）。
  只按 `number` 分组会把不同商品并成一个。
- 反过来，**第三方仓（`location="第三方仓"`）商品的 `skuId` 是 `null`**：41 行、30 个商品、
  6824.00 元营业额。只按 `skuId` 分组，`rank` 会把这些行整批丢掉（它拒绝把空键的行合成一桶，
  否则 30 个不同商品会被并成一个假的"第一名"），`totals` 与服务端页脚差 6824.00。

两个字段一起给就都解决了：非空 `skuId` 与 `number` 是 1:1（实测 1177 个 skuId 无一对应多个 number），
所以复合键不会把同一商品拆开；第三方仓行则靠 `number` 各自成组。分组数 1177 → 1207，
`totals` 与页脚**逐分相等**（`integrity.all_match: true`）。

```bash
node kz-compute.mjs rank data/sales.json --group skuId,number --label name,spec,brandName \
     --fields qty,recAmount --by recAmount --top 5
```

`name` 不能做身份键——2128 行里只有 109 个不同值（它是分类叶子名，如"乘用车轮胎"）。

#### 第三方仓的行没有分类也没有品牌，而且这一处没有兜底字段

上面 `skuId` 为 `null` 只是第三方仓这批行的一个症状。同一批行（`location="第三方仓"`）还有更麻烦的一面：

- `firstCategoryName`、`secondCategoryName`、`brandName` **三列全为空**。实测 2026-08 整月
  2183 行里有 46 行，7864.00 元收入、1883.84 元毛利，占全月毛利 3.84%。
  `location` 恰好干净地二分这份数据：快准仓 2137 行全部有分类，第三方仓 46 行全部没有。
- `categoryName` 那一列**有值但不能用**——它是自由文本，混着分类名（"尾门""悬挂支臂""玻璃水"）、
  品牌名（"飞利浦"）和规格串（"1141/21W /B15AS 半脚/单丝/青光"）。它不是快准分类树里的节点，
  跟快准仓行的 `categoryName`（"空气滤清器"这种规范叶子名）不是同一个东西。

所以按品类或品牌分组时，**`--group firstCategoryName` / `--group brandName` 会触发
`dropped_rows_warning`，而这一次没有任何字段能做兜底**（`skuId` 那个坑可以靠 `number` 补，这个不行）。
两种处理都可以，但必须是显式的：

- 自己写脚本时，把空分类的行归进一个有名字的桶（例如"未分类（第三方仓）"），
  再核对分桶合计与全量合计逐分相等，确认没有行凭空消失；
- 用 `kz-compute.mjs rank` 时，读 `dropped_rows_warning` 里的行数和金额，
  在回答里把这部分单独说出来，并说明它既不能归品类也不能归品牌。

把它悄悄丢掉的后果不只是合计变小：它 1883.84 元的毛利在 2026-08 能排到第 9 名，
比 5 个真实品类都大，用户看到的排名会缺一块而毫无提示。

#### `cCategoryName` 是客户分类，不是商品分类

这一列名字里有 Category，看着像"第四层商品分类"，实际是客户档案上的分类：实测整月只有两个取值
（"默认" 1380 行、"默认分类" 803 行）。商品分类只有 `firstCategoryName` / `secondCategoryName` /
`categoryName` 这三层。拿 `cCategoryName` 去做品类分析会得到两个巨大的桶，而且不报错。

**明细里混着销退行，所以 `recAmount` 合计天然是净额。** 销退是 `transType=150602`
（`transTypeName` 为"销退"或"销售退款"），以负数行出现在同一个数组里，实测每月 92~115 行、
每月 1.1~1.7 万元。两个推论：

- 问"本月销售额"直接求和就对了，**不需要**再去 `sales-return-list` 减一次——那会把退货扣两遍。
  验证：`recAmount` 合计 = `month-report` 的 `sale_fee − dbck_fee`，实测 2026-03..07 逐月逐分相等。
- 需要"毛额销售 / 退货"分开时，按 `recAmount` 正负拆行，或用 `--where transType=150602`
  与 `--exclude transType=150602` 各算一次。
- **大客户侧不是这个规矩**（后端把退货分列，合计是毛额），别把这里的做法照搬过去，
  见[大客户销售](#大客户销售)。

跨度超 7 天用 `--split`；每个窗口独立满足预算，合并后再算。

### `sales-detail-cost` 销售明细表（含成本毛利）

`GET /report/salesDetail_detail_cost` · 其余与 `sales-detail` 完全同形 · **需 `--allow-cost`**

在每行追加 `unitCost`（单位成本）、`cost`（成本）、`saleProfit`（毛利）、`salepPofitRate`（毛利率）。
已验证 `saleProfit ≈ recAmount − cost`（允许分位舍入差）。响应里的 `data.profit` 与页脚 `saleProfit`
不相等且口径未确认，**不要使用 `data.profit`**。

只在用户明确要成本/毛利时调用；成本是敏感数据，最小必要原则。

### `sales-summary-by-goods` 销售汇总表-按商品

`GET /report/salesDetail_inv` · `status === 200` · 行容器 `data.rows` · 页脚 `data.userdata`
· ≤ 7 天 · 无可靠分页

一行一个商品（实测 539 行对应 539 个不同 `invId`，同区间销售明细 745 行，两边金额合计相同）。
按商品聚合，不需要逐笔时比 `sales-detail` 轻。它还是**取商品 id 的地方**：

| 行字段 | 含义 |
|---|---|
| `invId` | **商品数字 id**，各处商品筛选参数要的就是它 |
| `number` / `name` / `spec` / `skuId` | 型号 / 商品名 / 规格 / 商品编码（口径同销售明细） |
| `qty` / `amount` / `recAmount` / `disAmount` / `unitPrice` | 数量 / 金额 / 应收 / 折让 / 单价 |
| `locationNo` / `location` | 发货仓库编码 / 名称 |
| `storage` | **当前库存数量**（不是销量），等于下面各 `count_` 列之和 |
| `count_<locationId>` | 该仓库的**库存数量**（动态列，中文名在 `data.stoNames[]` 同位置） |
| `billId` / `billNo` / `date` / `buName` / `buId` | 只是**其中一张代表性单据**，不是全部（539 行只有 369 个不同 `billNo`）——不要拿它说"这个商品是哪天卖的" |

拿到 `invId` 后就能窄化 `sales-detail`（`goodsNo`）、`inv-balance`（`goods`）、
`deliver-summary`（`goods`）以及本端点自己的 `goodsNo`（实测 `10423925` 精确返回 1 行）。

两个与销售明细相反的地方：**本端点没有 `kzCategoryIds` 参数**（分类维度的问题只能走 `sales-detail`）；
`customerNo` 在这里提交客户 **id**。`storageNo` 不筛行，已固定留空——要分仓库统计就按 `locationNo` 本地分组。

成功的空查询可能直接返回 `data: []` 而不是 `data.rows: []`，脚本已兼容。
页脚金额带千分位逗号（`"64,952.44"`），解析层已统一处理。

#### 判断"某个商品到底卖过没有"要用它

行里还有 `transType` / `transTypeName` 与 `billType`。实测全历史 47679 行的 `billType`
全部是 `SALE`，`transTypeName` 只有 销售（22474+）/ 销退（534）/ 销售退款（2）三种，
**没有调拨混进来**——所以"在这个端点出现过 ⟺ 卖过"，这正是回答"从来没卖过什么"需要的量具。
对比 `day-report` 的 `sale_fee` 含调拨出库，它能回答"卖了多少钱"，但回答不了"这个商品卖过没有"。

跨端点连接商品时**用 `invId`，不要用 `skuId`**：第三方仓商品的 `skuId` 是 `null`，
按 `skuId` 连接会把那批行全判成"从没出现在销售里"。`invId` 在 `inv-balance`、本端点、
`key-account-sales-detail` 三边都有值，是唯一可靠的连接键。

大客户是另一套单据，不出现在这里，要"卖过没有"的完整判定就必须把
`key-account-sales-detail` 也扫一遍（实测全历史 619 行、379 个不同 `invId`）。

### `sales-summary-by-customer` 销售汇总表-按客户

`GET /report/salesDetail_customer` · `status === 200` · 行容器 **`data.list`** · 页脚 `data.total`（对象）
· ≤ 7 天 · `customerNo` 提交客户 number

**名字容易误导：它不是一行一个客户**，而是"客户 × 商品"的网格——实测 711 行对应 73 个客户、
539 个 `invId`。所以客户排名必须 `--group buId,buName`（`buId` 是身份，`buName` 给人看），
直接看行数会把它当成客户数。行里同时带商品字段（`invId` / `skuId` / `number` / `name` / `spec`）
和仓库字段（`locationNo` / `location`），需要"某客户买了什么"时不用再取一次销售明细。

页脚里的 `baseQty` 被后端塞成了字符串 `"SALE"`（脏字段），数量看 `qty`。
实测 711 行的 `qty` / `recAmount` 与页脚逐分相等（`integrity.all_match: true`）。

### `sales-order-list` 销售单管理列表

`GET /scm/invSa?action=getSalesOrderlist` · `status === 200` · 行容器 `data.rows`
· **有可靠分页**：`data.page` 当前页、`data.records` 总记录数、`data.total` **总页数**
· 单页 ≤ 200，脚本自动翻页 · ≤ 31 天

回答"开了多少单""某业务员开了哪些单"用它。`salesId`/`delieverId` 提交员工 **id**。
`billStatus` 默认 `all`。

### `sales-return-list` 销售退货单管理列表

`GET /scm/invSa?action=list&transType=150602` · **`success === true && status === "success"`**
· 行容器 `data.rows` · 有可靠分页 · ≤ 31 天

`amount` 是应收/退款口径金额，`totalAmount` 是关联的销售金额，两者不同义。
响应里的 `hxStateCode`：`0` 未退款、`1` 部分退款、`2` 全部退款——与筛选控件 `hxState` 的取值体系不同，不要混用。

### `sales-reconcile-detail` 销售对账明细表

`GET /Report/getSaleBalance?action=detail` · `status === 200` · 行容器 `data.rows` · 页脚 `data.total`
· ≤ 31 天 · 无分页参数

逐单的应收/已收/欠款。**收款列是动态的**：字段名在 `data.colIndex[]`，对应中文标题在
`data.colNames[]` 的同一下标。要按收款方式拆分时必须先读这两个数组，不能硬编码列名。
`payStatus`：`-1` 全部、`1` 全部收款、`2` 欠款。

## 大客户销售

**这是与上面"销售"完全独立的第二套单据体系，两边零重叠。** 快准后台里大客户业务走
`scm/invCu` 模块（`transType=180601` 出库 / `180602` 退货），门店零售与普通客户走
`report/salesDetail_*`。销售明细表里的 `saleType` 只区分 销售/铺货/微仓铺货，**没有大客户这个维度**，
所以：

- 问"大客户卖了多少"→ 只能用本节的端点。拿普通客户明细去按客户名单过滤，得到的是一个
  看起来合理但毫无意义的数——客户主数据里的"大客户"名单和大客户单据是两件事
  （详见 [`contact-home`](#主数据) 的说明）。
- 问"总销售额是多少"→ **必须两侧分别取数再由脚本相加。** 经营报表并没有替你合并：
  实测 2026-03..07 逐月逐分验证，`month-report` 的 `sale_fee` = 普通客户收入 + 调拨出库 `dbck_fee`，
  大客户单列在 `big_sale_fee`；`cost_fee` / `profit` 也只是普通侧口径
  （与 `sales-detail-cost` 的行求和逐分相等）。
  **只取一侧当总额是最容易犯、也最难被发现的错误**，因为单侧结果自己内部完全自洽，页脚也对得上。

| 想问什么 | 用哪个 |
|---|---|
| 大客户销售额 / 成本 / 毛利、开了多少单、哪个客户买得多 | `key-account-sales-list`（**出库口径，不扣退货**） |
| 大客户退了多少货 | `key-account-return-list` |
| 大客户买的是哪些商品（行级） | `key-account-sales-detail` |
| 大客户退的是哪些商品（行级） | `key-account-return-detail` |

**退货的处理两侧相反**，这是本节第二个容易静默出错的地方：普通侧的销售明细表把销退当负数行
混在同一数组里（所以合计天然是净额），大客户侧是后端分列（合计是出库毛额）。
详见 [`key-account-return-list`](#key-account-return-list-大客户销售退货单查询)。

### `totalCost` 是毛利，不是成本

四个端点共用同一套金额字段，其中一个字段名与含义相反，抓包与页面列名都已证实：

| 字段 | 真实含义 |
|---|---|
| `totalAmount` | 折前销售金额 |
| `disAmount` / `disRate` | 整单优惠金额 / 优惠率 |
| `amount` | **折后应收** ≈ `totalAmount` − `disAmount` |
| `totalPurPrice` | 成本 |
| `totalCost` | **毛利**（`≈ amount − totalPurPrice`），字段名像"总成本"，别当成本用 |

自洽的三元组是 (`amount`, `totalPurPrice`, `totalCost`)。**收入用 `amount`**，
它和普通客户明细的 `recAmount` 同为折后口径，两侧相加才是同一把尺子；
用 `totalAmount` 会把优惠算进收入，且与普通侧口径不一致。
（注意"同为折后"只说折扣这一维；退货维度两侧并不一致，见下面的退货口径说明。）
（本项目 `src/app/lib/sales-report-data.ts` 的销售报表页用的是 `totalAmount`，
所以本技能的数字和那个页面会有优惠额的差异——这不是 bug，是口径选择，需要时向用户说明。）

### `key-account-sales-list` 大客户销售出库单查询

`GET /scm/invCu?action=list&transType=180601` · **`success === true && status === "success"`**
· 行容器 `data.rows` · **有可靠分页**（`data.total` 总页数、`data.records` 总记录数，单页 ≤ 200）
· ≤ 31 天 · 一行一张单

| 参数 | 说明 |
|---|---|
| `beginDate` / `endDate` | 必填，`YYYY-MM-DD` |
| `matchCon` | 综合搜索：单号、客户名或厂家产品码 |
| `billStatus` | **空 = 全部（含草稿 `0` 和待审核 `1`）**、`3` 完成。见下面的口径提醒 |
| `customType` | 大客户分类 id，取自 `key-account-category` |
| `serviceType` | `0` 全部、`1` 普通业务、`2` 直采业务、`3` 临采业务 |
| `hxState` | `0` 全部、`1` 未付款、`2` 部分付款、`3` 全部付款 |
| `sourceType` | `0` 全部、`1` 自制订单、`2` 平台订单 |
| `salesId` / `delieverId` | 销售 / 送货员工 id（`0` 全部；注意后端拼写 `delieverId`） |
| `relationOrderNo` | 关联平台单号 |

| 行字段 | 含义 |
|---|---|
| `billDate` | 配送日期，按日/月分组用它（`kz-compute daily --date-field billDate`） |
| `billNo` / `id` | 单号 / 单据内部 id |
| `contactName` | 客户名称（**不是 `buName`**——这一列在当前样本是 `null`） |
| `billStatus` / `transTypeName` / `serviceTypeName` / `sourceType` | 状态 / 业务类别 / 业务类型 / 来源 |
| `saleName` / `delieverName` / `userName` | 销售 / 送货 / 制单人 |
| `rpAmount` | 已收核销金额 |
| 金额字段 | 见上面的 `totalCost` 对照表 |

**口径提醒：`billStatus` 留空会把草稿单和待审核单算进合计。** 后端把"全部"就是表达成空值，
页面默认也是空，所以本技能默认跟随页面。但如果用户问的是"确认的营业额"，
要么加 `--param billStatus=3`，要么在回答里说明合计包含未完成单据——
两个数会不一样，说不清就会变成对不上账。

**完整性靠分页元数据。** 本端点没有服务端页脚可对，所以不像销售明细那样有"行求和 = 页脚"
的取证。好在它的 `data.total` / `data.records` 是可靠的（脚本会自动翻页并校验）。

另有一个独立旁证：`month-report` / `day-report` 的非展示字段 `big_sale_fee` / `big_sale_cost`
就是后端自己算的大客户销售收入与成本。**实测 2026-03..08 六个月，本端点 `amount` 合计与
`big_sale_fee` 逐月逐分相等**——这是"端点选对了、收入字段也选对了"最硬的旁证。
但 `totalPurPrice` 合计与 `|big_sale_cost|` 有 0.50~202.80 元的月度差（成本口径不同，
不是丢数据），所以**成本不要拿 `big_sale_cost` 当校验基准**。注意 `big_sale_cost` 是负号口径。
这两个字段是非展示辅助字段，只当旁证，不要直接当正式财务口径报给用户。

**这条旁证成立的前提是"只算出库单、不扣退货"。** `big_sale_fee` 就是出库口径，退货单列在
`big_return_fee`。所以拿"出库 + 退货"的净额去比 `big_sale_fee`，有退货的月份必然对不上
（实测 2026-06 差 41.00）——这时很容易误判成"取数漏了单据"去反复重取，
其实是自己换了口径。详见下面 `key-account-return-list` 的退货口径说明。

成本和毛利字段是这个端点自带的，没有"无成本版"，所以不加 `--allow-cost` 门槛，
否则"大客户销售额多少"就没法回答了。但用户没问成本/毛利时不要主动报——最小必要原则。

### `key-account-return-list` 大客户销售退货单查询

`GET /scm/invCu?action=list&transType=180602` · 契约与出库单完全同形 · 证据等级 B（当前样本为空）

#### 用户问"大客户收入"时，报出库口径，不要扣退货

后端自己就是分列的：`big_sale_fee` 只等于出库单合计，退货单列在 `big_return_fee`，
后台界面也按这个口径显示。所以**"大客户收入/成本/毛利"= `key-account-sales-list` 的合计**。
扣掉退货得到的数会和用户在后台看到的对不上，而两个数都"算得对"，
所以这种错既不会报错、也无法靠完整性校验发现——只能靠口径选对。
实测 2026-06：出库 749.00、退货 −41.00，报 708.00 就是错的，应报 749.00。
要报净额时必须在回答里写明"已扣退货"。

#### 别照普通侧的做法处理退货：两侧默认口径相反

这是同一个问题在两套体系里的答案不同，照搬另一侧就会错：

| | 退货在哪 | `recAmount`/`amount` 合计是 | 实测量级 |
|---|---|---|---|
| 普通客户 | **混在销售明细同一个数组里**，`transType=150602`（`transTypeName` 为"销退"/"销售退款"），负数行 | **净额**（已含销退），等于 `sale_fee − dbck_fee` | 每月 92~115 行、1.1~1.7 万元 |
| 大客户 | **独立端点**，后端分列 | **毛额**（只有出库），等于 `big_sale_fee` | 6 个月共 2 张、41.00 元 |

所以"要不要扣退货"不存在统一答案：普通侧你**不用管**（报表已经扣了），
大客户侧你**不该扣**（后端口径是毛额）。两侧相加求"总销售额"时才需要统一——
那时把大客户侧先加上退货，再与普通侧相加，并说明这是净额口径。

#### 真要算净额时的符号陷阱

**退货单的金额本身是负数，所以净额 = 出库 + 退货，不是相减。** 实测 2026-06 的两张退货单
`amount` 分别是 `-26` 和 `-15`，`totalPurPrice` / `totalCost` 同样带负号，月报的 `big_return_fee`
也是负号口径。写成"出库 − 退货"会把退货按正向加回去，方向正好反了——而退货金额通常很小，
这个错不显眼，很容易一路带进结论。拿到非空退货数据时先 `--preview 3` 确认正负号。

退货常常是 0 单，这时后端返回下面说的空结果哨兵，脚本会明确告诉你"这段时间没有退货发生"。

### 空结果哨兵：`status="-1"` + `msg="没有数据"` + `data=[]`

两个列表端点在**查询成功但区间内没有单据**时，返回的信封与成功形态不同：顶层
`status === "-1"`、`msg === "没有数据"`、`data` 是长度 0 的**数组**（不是带 `rows` 的对象）。
成功谓词必然不满足。

脚本已按四项**同时**成立才归一为空列表，清单里会写 `empty_result_sentinel` 和
`pagination_complete: true`。这件事必须精确处理，因为放松任何一项都会让真正的查询失败
伪装成"没有业务"，而收紧到不识别又会把"这段时间没有业务"报成"查询失败"——
两者在回答里的说法正好相反。看到这个标记时说"这段时间没有相关业务发生"，
不要说"金额 0 元"，也不要说查询出错了。

### `key-account-sales-detail` 大客户销售配送明细

`GET /report/getInitCuSale_detail?transType=180601` · **`status === 200`** · 行容器 **`data.list`**
· **≤ 7 天** · 单次有界取数，无可靠分页

唯一的大客户**行级**数据源。要回答"大客户买的最多的是哪款轮胎"只能用它。

真实请求**重复发送两次 `transType`**，注册表用有序键值对保留。自己拼请求时用普通对象
会把前一个覆盖掉，后端行为随之改变。

| 参数 | 说明 |
|---|---|
| `beginDate` / `endDate` | 必填。跨度超 7 天用 `--split` |
| `customerId` | 客户 id，可取自 `contact-home` 的 `bigContact[].id` |
| `brandId` | 品牌 id |
| `status` | 空 全部、`1` 待审核、`2` 未通过审核、`3` 已完成 |
| `searchType` + `require` | `searchType` 决定 `require` 匹配哪个字段：`1` 大客户销售单号、`2` 物料名称、`3` 物料编码、`4` 产品码 |

| 行字段 | 含义 |
|---|---|
| `billDate` / `billNo` / `billStatus` | 单据日期 / 单号 / 状态 |
| `skuId` / `invNumber` / `goodsName` / `brandName` / `categoryName` / `invSpec` / `mainUnit` | 物料编码 / 厂商产品码 / 商品名 / 品牌 / 分类 / 规格 / 单位 |
| `qty` / `price` | 数量 / 单价 |
| `deduction` / `discountRate` | 行级折扣额 / 折扣率 |
| `amount` / `totalPurPrice` / `totalCost` | 行金额 / 行成本 / **行毛利** |

商品身份用 `--group skuId,invNumber`（同 `sales-detail` 的理由：编码可能缺失，型号可能共用）。

成功的空查询会返回 `data.list === null`，脚本归一为空数组；其它类型一律 fail closed。
页面用 `rows=1000000` 近似全量，**本技能不这么做**——小 `rows` 的分页语义未复核，
所以宁可靠 7 天窗口 + `--split` 保证完整，也不用一个语义不明的巨大 `rows`。

### `key-account-return-detail` 大客户销售退货明细

同上，两处 `transType` 都换成 `180602`。证据等级 B（当前样本为空），先 `--preview` 确认字段形态再算。

## 库存

### `inv-balance` 库存余额

`GET /report/invBalance?action=detail` · `status === 200` · 行容器 `data.rows` · 无日期条件

**字段名与销售明细不同**，别照搬：这里是 `invNo` / `invName`，不是 `number` / `name`。

| 字段 | 含义 |
|---|---|
| `invId` | 商品数字 id（`goods` / `goodsNo` 参数要的就是它） |
| `invNo` | **型号**（如 `165/70R14 81T EL316`），对应销售明细的 `number` |
| `invName` | 商品名称（分类叶子名），对应销售明细的 `name` |
| `skuId` / `spec` / `unit` / `simpleCode` | 商品编码 / 规格 / 单位 / 助记码 |
| `brandName` / `categoryName` | 品牌 / 分类 |
| `qty_1` / `qty_2` / `qty_3` | 库存数量：所有仓库 / 快准仓 / 三方仓 |
| `cost_1` / `cost_2` / `cost_3` | 对应的**单位成本** |
| `allcost_1` / `allcost_2` / `allcost_3` | 对应的**库存金额**——"库存压了多少钱"用 `allcost_1` |
| `in_time` / `out_time` | 最近入库 / 出库时间——见下面"`out_time` 是唯一的无界证据" |

响应还带 `data.userdata` 页脚（`qty_*` / `allcost_*` 的服务端合计），脚本会自动核对。
**页脚是按筛选后口径算的**：带 `storageNo` 时它是该仓库的合计，不是全仓合计。

四个可用的窄化条件：

- `goods` —— 商品数字 id（`invId`）。实测 `goods=10423925` 精确返回该商品 1 行、1095 字节。
- `brandId` —— 品牌 id，来自 `brand-list`。
- `storageNo` —— 仓库编码，来自 `warehouse-list`（实测 `KZ001` = 快准仓、`S001` = 第三方仓）。
- `zero` —— `true` 时含零库存商品。

`goodsNo`、`storage`、`catId`、`catName`、`area_name` 实测不生效，注册表固定留空。
`negative` 是个容易读反的开关：`true` 表示"**只**看负库存"（实测返回 0 行），
不是"把负库存也算进来"。所以默认的 `negative=false` 没有排除任何东西，
别在回答里写"口径不含负库存"——那是把参数名当结论了。

#### `out_time` 是唯一的无界证据

本技能里几乎所有销售端点都是有界窗口（≤ 7 天），而 `in_time` / `out_time` 记录的是
"最近一次"，与窗口无关。这让 `out_time` 成为回答"从来没卖过什么"的最快入口：
销售必然伴随出库，所以"最近销售时间 ≤ `out_time`"，于是

> `out_time` 为空 ⟹ 从未出库 ⟹ **必然**从未卖出

这条推理不需要任何日期区间，实测也经得起双向反证：全历史销售里 `out_time` 为空却卖过的
商品 0 个，卖过却 `out_time` 为空的商品 0 个。

**但它只成立一个方向。** `out_time` 非空不等于卖过——调拨等非销售出库也会写它。
所以这个判据给出的是下界：实测在库且 `out_time` 为空 2286 款 / 220090.45 元，
而全历史零销售记录的真值是 2524 款 / 251898.59 元，漏掉 238 款 / 31808.14 元
（占真值款数 9.43%、金额 12.63%），漏掉的正是"只调拨过、从没卖过"的那批。
下界可以快速给，但必须说明它是下界；要真值就扫全历史销售，配方见 `recipes.md`
的"从来没卖出过的商品"。

#### 取全量必须两步走，"按品牌循环"会漏掉整个第三方仓

不加窄化的全量实测 8134 行 / 3.75 MiB，超 2 MiB 预算取不动。自然的想法是按 `brandId` 遍历品牌
再合并——**这样会静默漏掉 169 行 / 56186.88 元（占全量 5.46%）**，因为第三方仓商品的
`brandName` 与 `skuId` 都是空的，不属于任何一个 `brandId`。

漏掉时不会有任何报错：每个品牌分片的页脚都对得上、`possibly_truncated` 是 `false`、
分组也没丢行——那些行从来没进过数据文件。带 `brandId` 取数时清单里会出现
`shard_coverage_warning` 提醒这件事（机制见 `guardrails.md` 的"分片丢行"）。

正确的两种取法：

1. **品牌循环 + 补一次 `--param storageNo=S001`**（后者只 65 KB），合并后由脚本相加。
2. **按仓库逐个取**：`storageNo=S001` 一次够；`storageNo=KZ001` 有 3.31 MiB 仍超预算，
   内部还要再按 `brandId` 切。

品牌循环不必一个品牌发一次请求：**`brandId` 接受逗号分隔的多个 id，而且是真并集。**
实测 `brandId=10` 得 5 行 / 406.50，`brandId=55` 得 5 行 / 265.00，
`brandId=10,55` 与 `brandId=55,10` 都得 10 行 / 671.50——行数与金额正好相加，与顺序无关。
所以 466 个品牌每批 25 个拼一次，19 次请求就覆盖全部品牌。批太大只会撞上 2 MiB 预算直接报错
（不会静默截断），调小批量重试是安全的。

实测三组数字互相印证：全量 8134 行 / 页脚 `allcost_1` 1028161.90，`KZ001` 7965 行 / 971975.02，
`S001` 169 行 / 56186.88——行数与金额都逐分构成精确划分。

想给全量总额找个独立旁证，用 `day-report` 最新一天的 `store_fee`（实测 1029704.23 vs
1028161.90，差 0.15%）核对量级；这是服务站级口径，只能说"量级一致"，不能说"逐分核对一致"。

只问某一个商品时直接用 `goods` 最省。注意 `cost_1`/`allcost_1` 偶尔是数字 `0` 而不是字符串
`"0.00"`，混合类型已在解析层处理。

### `deliver-summary` 商品收发汇总表

`GET /report/deliverSummary?action=detail` · `status === 200` · 行容器 `data.rows`
· **≤ 7 天且必须窄化**（默认全量响应接近 10 MB）· **无服务端页脚**

回答"某商品这段时间进了多少、出了多少、还剩多少"。它相对 `inv-balance` 的价值就在这里：
`inv-balance` 只有此刻的结存，收发汇总能告诉你期初多少、进了多少、出了多少。

商品字段与 `inv-balance` 同名（`invNo` 型号 / `invName` 商品名称 / `skuId` / `location` / `locationNo`），
但**行里没有 `invId`**——需要商品数字 id 时从 `sales-summary-by-goods` 或 `inv-balance` 取。
`invName` 是分类叶子名（实测 1172 行只有 33 个不同值），**商品身份用 `skuId,invNo`**。

#### 数量列的下标不是稳定契约，必须用 `flow` 现解

数量列是 `qty_0`…`qty_N`，每列配一个 `cost_N`（该项金额）。哪一列是"结存"取决于**该账号启用了哪些业务类型**：

| 来源 | 期初 | 入库合计 | 出库合计 | 结存 |
|---|---|---|---|---|
| 仓库文档 `docs/api/inventory.md` 抓包 | `qty_0` | `qty_8` | `qty_15` | `qty_16` |
| 生产账号实测（1172 行逐行成立） | `qty_0` | `qty_7` | `qty_13` | `qty_14` |

照抄任何一行去读数都可能把"还有 3 条库存"报成"结存 0"——数字看起来完全正常，错得无声无息。
按文档的 in=8/out=15/end=16 在生产账号 1172 行里只有 75 行满足收发恒等式。

所以列含义**每次从数据里解**，这就是 `flow` 命令存在的原因：

```bash
node kz-fetch.mjs deliver-summary --date last-7-days --param goods=10423925 --out data/flow.json
node kz-compute.mjs flow data/flow.json
```

它的判据是收发汇总天然成立的恒等式 **期初 + 入库合计 − 出库合计 = 结存**（逐行），
加上"这四组列从左到右就是 期初｜入库｜出库｜结存"的布局约束。实测 1172 行 / 1171 行的数据
只剩唯一一组下标；"合计 = 各分项之和"只用来给候选排序，不作为门槛
（实测有 1 行把一笔出库记在结存右边的尾列上，拿它当硬条件会为 1 行否掉 1170 行已核对的事实）。

输出里要看的：

- `totals`：`opening_qty/cost`、`inbound_qty/cost`、`outbound_qty/cost`、`closing_qty/cost`——直接引用
- `column_mapping`：这次解出来的列名，以及 `solutions_satisfying_identity`（候选越少列含义越确定）
- `column_mapping.ambiguity`：行太少解不唯一时出现。标了 `总合计一致: true` 的槽位仍可照 `totals` 回答
  （所有候选列算出来一样，数字确定、只是不知道在第几列）；`totals` 里为 `null` 的槽位不要给数字
- `no_flow: true`：所有列全是 0，即区间内没有任何收发。**这不等于"现在没有库存"**，当前库存看 `inv-balance`
- `identity_check.cost_columns_agree`：金额列没参与求解却满足同一条恒等式，是独立旁证

本端点没有页脚，`footer_reconciliation` 帮不上忙，那条恒等式就是"数据自洽、没丢行"的替代证据。
按商品排收发用 `--group skuId,invNo --by outbound_qty`（或 `outbound_cost`）。

**两个可用的窄化开关**：`goods`（商品数字 id = `invId`，实测 `goods=10423925` 只返回该商品 1 行、
2560 字节，比先取全表再本地筛便宜两个数量级）与 `brandId`。
`goodsNo` / `storage` / `storageNo` 实测完全不生效，已固定留空。

## 资金与应收应付

### `receipt-list` 收款单管理列表

`POST /scm/receipt/get_receipt_list_new`（urlencoded） · `success === true && status === "success"`
· 行容器 `data.list` · **有可靠分页** · ≤ 31 天

请求侧 `billStatus` 取值 `ALL` / `SUBMIT` / `CONFIRM` / `CANCEL`（默认 `SUBMIT`）；
响应侧同名字段是后端代码，两套值域不可混用。`amount` 是收款金额（数值字符串）。

### `customer-balance` 客户应收余额表

`GET /Report/getCustomerBalance?action=detail` · `status === 200` · 行容器 `data.rows` · 页脚 `data.total`
· ≤ 31 天

| 字段 | 含义 |
|---|---|
| `buName` / `cCategoryName` | 客户名称 / 客户分类 |
| `fPreAmount` | 期初应收 |
| `salesAmount` | 本期销售 |
| `preAmount` | 本期应收 |
| `reAmount` | 本期收款 |
| `lPreAmount` | **期末应收余额（即欠款）** |
| `diffAmount` | 差额 |
| `amount_<paymentMethodId>` | 按结算方式拆分的收款金额（动态列） |

动态列同样要读 `data.colIndex[]` / `data.colNames[]`。`payStatus=2` 只看欠款客户。

### `bank-journal` 现金银行报表

`GET /report/bankBalance_detail`（两个 `action`：`detail` 和 `cash_bank_journal_new`）
· `status === 200` · 行容器 **`data.list`** · 页脚 `data.total` · ≤ 7 天

**已证明 `rows=1` 仍返回多行**：这个端点不返回可靠分页元数据，绝不能请求第 2 页（会拿到重复数据）。
脚本会直接拒绝 `--page 2`。结果永远标 `pagination_complete: false`。

页脚 `data.total` 含 `income`（收入）、`expenditure`（支出）、`discount`（折让）、`balance`（余额）、
`cash`、`bank`。行字段 `income` / `expenditure` / `balance` 为该笔的收入/支出/结余。

### `payable-detail` 应付账款明细表

`GET /report/fundBalance_detailSupplier&type=10`（两个 `action=detailSupplier`）
· **`success === true && status === "success"`** · 行容器 `data.list` · 页脚 `data.total` · ≤ 7 天

`accountNo` 在这里是**供应商 id**（来自 `contact-home` 的 `data.supplier[].id`），
不是结算账户编号也不是供应商 number。金额为数值字符串。同样无可靠分页。

## 主数据

| 端点 | 请求 | 成功谓词 | 容器 | 取什么 |
|---|---|---|---|---|
| `category-tree` | `GET /basedata/Category/tree` | `success/status` | `data.tree` | 递归 `{id, code, name, child[]}`；`kzCategoryIds` 取**叶节点 id** |
| `brand-list` | `GET /basedata/assist/brand` | `success/status` | `data.items` | `brandId` 取 `id`；总数在 `data.totalsize` |
| `contact-home` | `GET /basedata/contact/getHomePageContact` | `success/status` | 整块 `data` | `data.contact[]` 普通客户、`data.bigContact[]` 大客户、`data.supplier[]` 供应商，条目均 `{id, number, name}` |
| `key-account-category` | `POST /scm/invCu/getCarType`（**零字节体、不带 Content-Type**） | `success/status` | `data` | `{id, name}`；大客户单据的 `customType` 取 `id` |
| `warehouse-list` | `GET /basedata/invlocation?action=list` | `success/status` | `data.rows` | `id` 给 `storage`，`locationNo` 给 `storageNo`；`data.total` 是**总页数** |
| `store-list` | `POST /basedata/Stores/getStoreIdName`（零字节表单体） | `status === 200` | `data` | `{id, name, isDefault}` |
| `employee-list` | `POST /basedata/employee?action=list`（零字节表单体） | `success/status` | `data.items` | `id`、`empId`、`number` 三者不可互换 |
| `settle-account-list` | `GET /basedata/settAcct?action=list` | `status === 200` | `data.items` | `bank-journal` 的 `accountNo` 取 `number` |
| `pay-method-list` | `GET /basedata/assist/getAssistList` | `success/status` | `data` | `wayId` 取 `id`（当前均为 `typeNumber=PayMethod`） |

零字节表单体的两个端点：请求体必须是**空字符串 + `Content-Type: application/x-www-form-urlencoded`**。
换成 JSON、省略头或改成 GET 都会改变后端行为。脚本已处理，自己写请求时要注意。
`key-account-category` 又不一样：抓包是零字节体且**不带** `Content-Type` 头，所以注册表两者都不给。

### `contact-home` 的 `bigContact[]` 不是大客户业务数据

这是**客户档案里的名单**，不是大客户单据的来源。它能回答"谁是大客户"，
不能回答"大客户买了多少"——后者只有 [`key-account-sales-list`](#大客户销售) 有。

拿 `bigContact[]` 的名单去过滤普通客户销售明细（按 `buId` 或客户名匹配），会得到一个
**看起来完全合理、实则毫无意义**的数字：普通客户明细里本来就没有大客户单据，
匹配到的那些行是同名/近名的零售客户。两个名单里确实存在这类近名重复档案，
例如 `苏州梅石路店[车享家]` 与 `梅石路车享家`。这种错误不会报错、页脚也对得上，
只能靠"知道这是两套体系"来避免。

`bigContact[].id` 唯一的正当用法是给 `key-account-sales-detail` 的 `customerId` 做客户窄化。


## 不可调用的能力

这些**不在**注册表里，原因不是遗漏：

- **快准商品列表 / 三方商品列表 / 商品选择器**：响应 `data` 是依赖页面会话密钥的 `kziv` 加密字符串，
  纯 HTTP 线路拿不到明文。后果是**无法按商品名搜出商品 id**——遇到"某个具体型号"的问题，
  让用户提供商品编码，或改用分类/品牌筛选后从 `rank` 结果里定位。
- **应收账款总表 / 明细表**：走 FineReport 会话化报表协议（`viewlet`、`parameters_d`、`page_content`），
  不是稳定的业务 REST。客户欠款请用 `customer-balance`。
- **一切写操作**：开单、保存、编辑、审核、删除、导入、导出、调拨、组装拆包、报价规则维护。
  凭证背后是生产账号，这些操作会改变真实业务数据。
- **登录 / 登出 / 凭证管理**（`/passport/login/*`、`/api/agent-credentials*`）：网关在 Agent 模式下直接拒绝。
  会话是自动维护的。
