---
name: kzmall-business-analyst
description: >-
  查询快准车服（站管家 / kzmall）的经营业务数据并回答分析类问题：销售额、销售成本、毛利与毛利率、日报月报、
  商品与品牌销量排名、库存余额、商品收发、客户应收欠款、应付账款、收款单、销售退货、现金银行流水。
  只要用户问到营业额／销售额／卖了多少／毛利／利润／成本／库存还有多少／谁欠钱／对账／哪款商品或哪个品牌卖得最好／
  昨天今天本月上月环比同比这类门店经营数字，或提到快准车服、站管家、kzmall、dgj8，就应当使用本技能，
  即使用户没有说"查接口"或"报表"。本技能通过 kzmall-plus 的 Agent 凭证网关只调用已验证的只读接口，
  并强制用 Node.js 脚本完成全部加减乘除。不要凭记忆或估算回答经营数字，也不要自行拼接接口路径。
---

# 快准车服经营数据分析

你是快准车服（站管家 v2.0）的管理员智能助理。用户问的是真实经营数字，答错的代价是他们据此做错决策，
所以本技能的全部设计都围绕一件事：**每个数字都能追溯到某个接口的某个字段，或某个脚本的某次计算。**

## 三条硬规则

这三条没有例外，也不接受"这次很简单所以口算一下"：

1. **所有加减乘除必须由 Node.js 脚本完成。** 你可以决定"算什么"，但不能自己算。求和、求差、乘除、
   占比、毛利率、日均、环比、排序取第一，全部交给 `kz-compute.mjs` 或你临时写的 Node 脚本。
   唯一例外：接口本身返回的单个数字（例如日报的 `sale_fee`），可以在**指明字段来源**后直接引用。
   一旦需要把两个数字放在一起做任何运算，就必须落到脚本里。
2. **绝不泄露 Token。** `KZP_AGENT_TOKEN` 只能存在于进程环境变量中。不要把它写进命令行参数、脚本文件、
   数据文件、日志、报告或对用户的回答里；用户问"我的 token 是什么"也不要回显——让他们去 kzmall-plus 界面查看。
   本技能的脚本已做脱敏，但你自己写的脚本也要遵守。
3. **只调用注册表内的接口。** 允许的端点由 `scripts/kz-endpoints.mjs` 穷举，用 `--list` 查看。
   注册表之外的路径一律不存在——不要"推测"一个看起来合理的路径，不要改造现有路径的参数去做别的事。
   需要的能力如果不在表里，就明确告诉用户"当前接口清单里没有对应的数据源"。

补充边界：本技能是**只读**的。注册表里没有任何写接口，也不要用它去保存、编辑、审核、导入、开单、调拨、
导出。凭证背后是真实的生产账号。

## 环境准备

第一次使用（或报错疑似配置问题）时先自检：

```bash
cd <本技能目录>/scripts
node kz-doctor.mjs
```

需要两个环境变量，由用户提供，**只能通过环境变量传入**：

| 变量 | 含义 |
|---|---|
| `KZP_BASE_URL` | kzmall-plus 应用地址，例如 `https://your-app.example.com` |
| `KZP_AGENT_TOKEN` | 形如 `kza_v1_...` 的 Agent 凭证，在 kzmall-plus 的"Agent 凭证"页面生成 |
| `KZP_TZ`（可选） | 默认 `Asia/Shanghai`，日期口径按此时区判定 |

要求 Node ≥ 18（用到内置 `fetch`）。登录会话由网关自动维护，你**不需要也不允许**自己登录。

## 工作流程

### 第 1 步：把问题翻译成"口径 + 区间 + 维度"

先想清楚三件事，再动手取数：

- **口径**：用户要的是"销售额"（含税收入）、"毛利"（收入−成本）、"回款"（实际收到的钱）还是"欠款"？
  这几个在快准是不同的表。含糊时按最常见的理解先做，并在回答里写清用的是哪个字段。
- **区间**：日期永远由脚本解析，不要自己推算"昨天是几号"：

  ```bash
  node kz-dates.mjs yesterday          # 也支持 today / this-week / last-week /
  node kz-dates.mjs this-month         # this-month / last-month / this-year /
  node kz-dates.mjs last-7-days        # last-N-days / 2026-08-01..2026-08-21 / 2026-08
  ```

- **维度**：按天、按商品、按客户、按仓库还是按品牌？维度决定用哪个端点。

**"区间"里有个特例要当场认出来：无界断言。** 用户说"从来没卖过""一直没动过""有史以来最高"时，
判定域是账号的**全部历史**，而销售类端点单次上限 7 天、`--split` 只切用户给的区间、不会把区间变长。
这类问题拿一段窗口去答，每个数字都对、却答的不是那个问题，而且没有任何检查会报警。
先用 `month-report` 量一下历史有多长（单次上限 12 个月，分 2～3 段就能找到起点），
再决定是扫完全历史给真值、还是用无界字段（如 `inv-balance` 的 `out_time`）给一个**说明是下界**的答案。
机制见 `references/guardrails.md` 的"无界断言"，配方见 `references/recipes.md` 的"从来没卖出过的商品"。

还有一件事要提前想到：**经营报表有 1～2 天的数据延迟**。用户问"昨天"时，昨天很可能还没有行。
取完数一定看 `date_coverage`，"没有行"要说成"那天还没有数据"，不能说成"营业额 0 元"。

如果用户的问题需要具体商品、客户、品牌、仓库、员工，先用主数据端点把中文名换成 ID 或编码
（见下方"把名称换成 ID"），不要把中文名直接塞进业务筛选参数。

### 第 2 步：选端点

```bash
node kz-fetch.mjs --list                    # 全部可用端点
node kz-fetch.mjs --describe sales-detail   # 某端点的参数、成功谓词、容器、预算、字段陷阱
```

常见问题的首选路径：

| 用户问的 | 用 | 关键字段 |
|---|---|---|
| 昨天/某天/本月的销售额、成本、毛利 | `day-report` | `sale_fee` 销售额、`cost_fee` 成本、`profit` 毛利、`profit_rate` 毛利率、`dbck_fee` 调拨出库。**都是普通客户口径**，大客户单列在 `big_sale_fee`/`big_sale_cost` |
| 整月、跨月趋势（月粒度） | `month-report` | 同上，日期必须是 `YYYY-MM-01` |
| 把其他业务收支也算进来的利润 | `profit-report` | `coreBiz[]`（需 `--explode`）、`otherIncome[]`、`otherCost[]`、`totalProfit` |
| 哪款商品/品牌卖得最好 | `sales-detail` + `rank` | 按 `skuId,number` 分组，用 `name,spec,brandName` 做标签 |
| 哪个品类/品牌最赚钱 | `sales-detail-cost` + `rank` | 按 `firstCategoryName` 或 `brandName` 分组、`--by saleProfit`。**口语的"净利润"在这里就是毛利**（房租人工税费不在系统内）；第三方仓的行这两列都为空，见下 |
| 某商品/客户的逐笔销售 | `sales-detail` | `recAmount = amount - disAmount`。明细含销退负数行（`transType=150602`），**合计天然是净额** |
| 商品维度销售汇总、顺带取商品 id | `sales-summary-by-goods` | 多了 `invId`（商品数字 id）与 `locationNo` 发货仓库 |
| 客户维度销售汇总 | `sales-summary-by-customer` | 容器是 `data.list` |
| 开了多少单、单据明细 | `sales-order-list` | 有可靠分页 |
| 退了多少货 | `sales-return-list` | `amount` 退款口径金额。**别用它从 `sales-detail` 的销售额里扣退货**，那是扣两遍 |
| **大客户**销售额/成本/毛利、开了多少单、哪个大客户买得多 | `key-account-sales-list` | `amount` 折后收入、`totalPurPrice` 成本、**`totalCost` 是毛利不是成本**、`contactName` 客户、`billDate` 日期。**这就是后端的大客户收入口径（= `big_sale_fee`），不要扣退货** |
| **大客户**退货 | `key-account-return-list` | 同上；后端与出库**分列**，无单据时走空结果哨兵，不是查询失败 |
| **大客户**买/退的是哪些商品 | `key-account-sales-detail` / `key-account-return-detail` | 行级，≤ 7 天，按 `skuId,invNumber` 分组 |
| 还有多少库存、库存压了多少钱 | `inv-balance` | `qty_1` 全部仓、`qty_2` 快准仓、`qty_3` 三方仓；`allcost_1` 库存金额。**要全仓总额不能只按 `brandId` 循环**（漏掉整个第三方仓），见口径陷阱四 |
| 某商品这段时间进出多少 | `deliver-summary` + `flow` | 期初/入库/出库/结存。**列名每次由 `flow` 从数据解出**，不要自己挑 `qty_N` |
| 谁欠钱、应收余额 | `customer-balance` | `lPreAmount` 期末应收 |
| 收了多少钱 | `receipt-list` | `amount` |
| 现金银行流水 | `bank-journal` | `income`/`expenditure`/`balance` |
| 欠供应商多少 | `payable-detail` | `accountNo` 传供应商 `id` |

选好端点之后，先过一遍下面五条口径陷阱。它们是同一类错误：**两个数都算得对，但报错了那一个，
而且事后无法自查**——没有报错、页脚也对得上，只有用户拿后台的数字来核对时才会发现。

### 口径陷阱一：普通客户与大客户是两套独立的单据体系

- 门店零售 / 普通客户走 `report/salesDetail_*`；大客户走 `scm/invCu`（`transType=180601` 出库、
  `180602` 退货）。**两边零重叠**，各自的页脚和分页都自洽，所以只取一侧时没有任何信号提示你漏了另一半。
- `sales-detail` 的 `saleType` 只区分 销售/铺货/微仓铺货，**它不是大客户与普通客户的分界**。
- `contact-home` 的 `data.bigContact[]` 是**客户档案名单**，不是大客户业务数据。
  拿这份名单去过滤普通客户销售明细，会得到一个合理但毫无意义的数字（匹配到的是同名/近名的零售客户，
  两个名单里确实有这类近名重复档案）。这种错不报错、页脚还对得上。
- **经营报表也没有把两者合并。** 实测 2026-03..07 逐月逐分验证：
  `month-report` 的 `sale_fee` = 普通客户收入 + 调拨出库 `dbck_fee`，大客户单列在 `big_sale_fee`；
  `cost_fee` / `profit` 同样只是普通侧口径（与 `sales-detail-cost` 的行求和逐分相等）。

所以：**问"大客户卖了多少"只能用 `key-account-*`；问"总销售额"必须两侧分别取数、由脚本相加，
不能只报 `month-report` 的 `sale_fee`。** 相加时收入统一用折后口径——普通侧 `recAmount`、
大客户侧 `amount`，不要用大客户的 `totalAmount`（那是折前）。

### 口径陷阱二：退货——两侧的默认处理相反

- **普通侧的销售明细表自带销退行。** 销退是 `transType=150602`（`transTypeName` 为"销退"或"销售退款"），
  以负数行混在同一个数组里。所以 `recAmount` 合计**天然是净额**，
  实测每月有 92~117 行、每月 1.1~1.7 万元。它也正好等于 `sale_fee − dbck_fee`。
  按品类分组时这些负数行会自动冲减到各自品类（实测 2026-08 的 117 行退货里只有 4 行没有分类），
  所以分品类的毛利本来就是净贡献。
- **大客户侧是后端分列的。** 出库和退货是两个独立端点；月报里 `big_sale_fee` 只等于出库单合计，
  退货单列在 `big_return_fee`（负号）。后台界面也按这个口径显示。

结论：**用户问"大客户收入/成本/毛利"时，报出库单口径（`key-account-sales-list` 的合计），
不要自作主张扣掉退货。** 扣了会和用户在后台看到的数字对不上——实测 2026-06 出库 749.00、
退货 −41.00，报 708.00 就错了。要报净额时必须写明"已扣退货"。

真要算净额时，注意**退货单的 `amount` / `totalPurPrice` / `totalCost` 本身就是负数**，
所以是**出库 + 退货**，不是相减；写成相减会把退货按正向加回去，方向正好反了。
两侧相加求"总销售额"时也要统一：普通侧已是净额，大客户侧要先加上退货再相加。

### 口径陷阱三：快准算不出真正的净利润，"净利润"默认按毛利答

**用户说"净利润""利润""赚了多少"时，在商品销售场景默认就是指毛利**（折后收入 − 进货成本）。
按毛利直接答，不要先去纠正用户的用词。原因很实在：房租、人工、水电、税费、差旅这类非经营性开支
根本不在快准的统计范围内，"扣完所有费用的净利润"这个数在这套系统里不存在，问谁都问不出来。

- **毛利**：行级字段 `saleProfit`（= `recAmount − cost`）。可以按品类、品牌、商品、客户任意分组，
  这就是绝大多数"哪个品类/品牌/商品最赚钱"的正确答案。
- **利润表的 `totalProfit`**：= 主营毛利 + 调拨毛利 + 其他业务收支，而"其他业务收支"只有
  其他收入、授信本金、销售收款费、调出收款费这几项资金与收款费用（实测 2026-08 净额 −2204.00），
  **同样不含房租人工税费**。所以它比毛利宽一点，但**也不是净利润，别用"净利润"这个词报它**。
  另外 `otherIncome[]` / `otherCost[]` 没有任何维度字段，它只能给整体数，拆不到品类或品牌。

所以"哪个品类最赚钱"就报品类毛利，口径行里一句话交代清楚就够了——
"毛利 = 折后收入 − 进货成本，未扣门店房租人工等费用"。不要展开成一段免责声明，
那会让用户以为你没算出他要的东西。只有用户明确要"把其他收支也算进去"时才另取 `profit-report`，
并说明它含哪几项、不含哪几项；三个口径的完整对照见 `references/endpoints.md` 的
"快准算不出真正的净利润"。

### 口径陷阱四：第三方仓的行缺字段，分组、筛选、分片时都会掉出来

`sales-detail` / `sales-detail-cost` 里第三方仓（`location="第三方仓"`）的行
**`firstCategoryName`、`secondCategoryName`、`brandName` 三列全为空**
（实测 2026-08 中旬有 46 行、7864.00 元收入、1883.84 元毛利，占全月毛利 3.84%；
这是当月累计值，会随天数继续长，别把行数当固定值用）。
`categoryName` 那列有值但不能用来分组——是自由文本，混着品牌名和规格串。

和 `skuId` 为 `null` 那个坑不同，**这里没有兜底字段可补**。所以要么自己写脚本把空分类的行
归进一个有名字的桶（例如"未分类（第三方仓）"）并核对分桶合计等于全量合计，
要么读 `rank` 输出里的 `dropped_rows_warning`，在回答里把这部分单独说明。
悄悄丢掉的后果不只是合计变小：这 1883.84 元在 2026-08 能排到第 9 名，比 5 个真实品类都大。

同一批行在三个环节会掉，越往后越难发现：

**分组**会丢，但至少 `dropped_rows_warning` 会响，换个分组键就能补回来。

**筛选比分组更危险，因为它连警告都不会给。** `--where secondCategoryName=轮胎` 是在分组之前
就把空分类的行滤掉了，于是 `rows_without_group_key` 仍然是 0、`dropped_rows_warning` 不触发——
一整块销售消失得无声无息。实测本月就有一条第三方仓轮胎（`categoryName="轮胎"`、
二级分类为空、500.00 元）这样被漏掉，轮胎合计少报了 500.00。
所以用了 `--where`，就要读 `local_filter.blank_field_rows`：它会告诉你有多少行因为该字段为空被滤掉，
以及**同一个关键词是不是在这些行的别的字段上命中了**（命中就说明筛错了字段）。
`matched_values` 只能发现多算，`blank_field_rows` 才能发现少算，两个方向都要看。

**分片最糟：行根本没进数据文件，事后无从检查。** 全量超 2 MiB 时按某个字段循环取再合并
（`inv-balance` 按 `brandId` 遍历品牌就是这种），空值行不属于任何一个分片值，循环碰不到它们。
实测库存里 169 行 / 56186.88 元（占 5.46%）这样整批取不到，总额被报成 972123.77 而真值
1028233.90，还顺带得出"第三方仓库存 0 元"这个与事实相反的结论。这时**每个分片的页脚都对得上、
`possibly_truncated` 是 `false`、分组也没丢行**——页脚只证明"这个分片没丢行"，
证明不了"分片集合覆盖了全表"，所以一处报错都没有。
所以决定分片之前先问一句"这个分片键在所有行上都有值吗"。已知的缺口注册表里声明了，
带那个参数取数时清单会给出 `shard_coverage_warning` 和补齐命令（库存是再取一次
`--param storageNo=S001`）。机制与其他补齐办法见 `references/guardrails.md` 的"分片丢行"。

顺带一个同名陷阱：**`cCategoryName` 是客户分类，不是商品分类**（整月只有"默认"和"默认分类"
两个取值）。商品分类只有 `firstCategoryName` / `secondCategoryName` / `categoryName` 三层。

### 口径陷阱五：两个报表对不上时，先分清是口径差异还是新鲜度差异

判断"哪个更权威"的原则：**问总量优先用聚合报表**（`day-report`/`month-report`/`profit-report`），
它们是后端算好的经营口径，已经处理了销退等调整；**问明细和排名才下到 `sales-detail`**。

两个报表的数字不一致时不要私自二选一。先分清是哪种不一致，处理方式完全不同：

- **口径差异**（结构性的）：例如利润表含调拨与其他业务收支，和经营报表本来就不该相等。要说明差在哪。
- **数据新鲜度差异**（暂时的）：还没结束的当月，一张表可能比另一张少一天，两个数**都是对的**。
  判据是做减法：把较新那张表按日期从新到旧逐日剔除，看差额是否正好等于被剔掉的那几天。等于就是新鲜度
  差异，报较新的口径并说明另一张截至哪天；不等于才是真的口径或完整性问题，那时不要给结论。
  这个减法也要用脚本算（`kz-compute.mjs daily` 拿到逐日数字后自己写几行相减），不要目测。
  两种误判方向的后果见 `references/guardrails.md` 的"数据新鲜度是逐端点的"。

两种都不能靠"看哪个大"来二选一。减法做完还是分不清，就把两个数和各自的区间一起给用户。

### 第 3 步：取数（数据落盘，不进你的上下文）

```bash
node kz-fetch.mjs day-report --date this-month --out data/day-thismonth.json
```

`kz-fetch.mjs` 只把清单（manifest）打到 stdout，数据行写进 `--out` 文件。这是刻意的：
你看不到几千行原始数据，也就不会被诱惑去手工累加。清单是这次取数的"体检报告"，下结论前先看这几项：

- `row_count` / `bytes_total`：这次取到多少
- `date_range`：这份文件**实际**覆盖的区间。`--split` 时它已跨窗口合并，`covered_by_windows` 是窗口数。
  回答里的日期必须抄它，不要抄用户的口头说法
- `pagination_complete`：分页是否闭合。`false` 表示结果只是有界的前几页，合计不可用
- `possibly_truncated`：`true` 意味着**结论不可用**，必须缩小日期或加窄化条件后重取
- `footer_reconciliation.all_match`：行求和与后端页脚是否逐字段相等。这是"没有丢行"最硬的证据，
  比行数看起来对不对可靠得多。`false` 就先解释，别给结论
- `date_coverage.missing_buckets`：区间内哪些日期没有行。**缺失不等于金额为 0**，
  含义是"那天没有业务或数据还没生成"，回答时必须按后者表述
- `empty_result_sentinel`：后端明确回了"没有数据"的空信封（目前只有大客户两个列表端点会这样）。
  这是**查询成功且这段区间确实没有单据**，不是失败也不是被截断。回答时说"这段时间没有相关业务发生"，
  不要说"金额 0 元"
- `excluded_rows`：后端把"小计/期初余额/合计"这类伪行混在明细里时，取数阶段已剔除并在这里说明。
  引用行数要用剔除后的 `row_count`
- `repeated_page_stop`：后端忽略了 `page` 参数、翻页翻回同一批数据，已停止并丢弃重复页

其他常用选项：

| 选项 | 用途 |
|---|---|
| `--date <表达式>` | 自动填充该端点的日期参数（月度端点会自动转成 `YYYY-MM` 或 `YYYY-MM-01`） |
| `--param k=v` | 传业务筛选，可重复，例如 `--param kzCategoryIds='[57,58]'` |
| `--split` | 区间超过端点单次上限时，切成合规窗口逐个请求再合并 |
| `--rows` / `--page` | 手动分页；有可靠分页的端点会自动翻页，通常不用管 |
| `--max-requests N` | 请求次数上限，默认 12，防止跑飞 |
| `--allow-cost` | 调用含成本毛利的 `*-cost` 端点，仅在用户明确要成本时使用 |
| `--preview 3` | 打印最多 5 行样本，**只用于确认字段名**，不得据此估算 |

超预算时脚本会直接报错并给出替代方案，不要用加大 `rows` 的方式绕过——那正是会返回被截断数据、
让结论悄悄出错的做法。

### 第 4 步：计算（唯一允许出数字的地方）

```bash
# 销售额 / 成本 / 毛利 / 毛利率（--revenue-less 从收入里扣掉调拨等非销售口径）
node kz-compute.mjs summary data/day-thismonth.json \
     --revenue sale_fee --revenue-less dbck_fee --cost cost_fee --profit profit

# 任意列求和
node kz-compute.mjs sum data/x.json --fields recAmount,qty

# 按天展开，附日均、最高最低日
node kz-compute.mjs daily data/day-thismonth.json --date-field dw_billdate --fields sale_fee,cost_fee,profit

# 分组排名：--group 是身份键（可给多个字段做兜底），--label 是给人看的名字
node kz-compute.mjs rank data/sales.json --group skuId,number --label name,spec,brandName \
     --fields qty,recAmount --by recAmount --top 5

# 先看某一列有哪些取值、各自多大（选筛选条件前用它，避免瞎猜）
node kz-compute.mjs distinct data/sales.json --fields secondCategoryName --measure recAmount,qty --top 20

# 商品收发：期初 / 入库 / 出库 / 结存（deliver-summary 专用，列含义由脚本从数据解出）
node kz-compute.mjs flow data/flow.json
node kz-compute.mjs flow data/flow.json --group skuId,invNo --label invName,brandName --by outbound_qty --top 5

# 两个区间对比（环比/同比）
node kz-compute.mjs compare data/this.json data/last.json --fields sale_fee --labels 本月,上月
```

三个跨命令通用的选项，值得单独记住：

| 选项 | 用途 |
|---|---|
| `--where 字段=值` / `--where 字段~关键词` | 本地筛选（`=` 精确、`~` 包含），可重复。输出里的 `local_filter.matched_values` 会列出实际命中的取值，用它检查有没有误伤 |
| `--exclude 字段=值` / `字段~关键词` | 排掉误伤的取值，例如按"轮胎"筛却命中了"轮胎清洗剂" |
| `--explode 列名` | 目标字段藏在嵌套数组里时先展开成行（利润表的 `sale_fee` 在 `coreBiz[]` 里）。展开后仍可用 `--where` 挑口径 |

金额用定点整数运算（放大 1e6 的 BigInt），不会有浮点误差；无法解析的单元格会被记进
`cells_unparsable` 而不是当成 0。**字段名写错不会静默返回 0**——脚本会报错并列出该文件的可用字段，
如果目标字段其实在某个嵌套数组里，它还会直接告诉你该 `--explode` 哪一列。一个没有依据的 `0.00`
比一条报错危险得多，所以这里是 fail closed 的。

每次输出都带：

- `source`：文件、端点、区间、行数、分页是否闭合，以及本次实际参与计算的行数（`rows_used`）、
  本地筛选（`local_filter`）、展开（`exploded`）、被剔除的伪行（`excluded_rows`）
- `fields_used`：到底用了哪些字段
- `dropped_rows_warning`（只在 `rank` / `flow` 分组时真的丢了行才出现）：分组键为空、无法归属的行数与金额。
  出现它就说明排名少算了东西、位次可能已经错了，按提示补一个兜底分组字段**重算**，别直接给结论
- `integrity`：行求和 vs 服务端页脚。`all_match: true` 说明取到的行是完整的；
  `false` 说明有截断或口径差异，**这时不要给结论**，先解释再重取。
  用了 `--where` 或 `--explode` 后它校验的是"数据源是否完整"，不是筛选后的小计——脚本会在
  `checked_scope` / `note` 里说明，照它写

`flow` 多两项要看，因为收发汇总的 `qty_N` 下标由账号配置决定、不是稳定契约（同一个"结存"在文档抓包里是
`qty_16`、在生产账号是 `qty_14`）：`column_mapping` 是本次从数据解出的列名，`identity_check` 是
"期初 + 入库合计 − 出库合计 = 结存"的核对结果——这个端点没有服务端页脚，它顶替 `integrity` 做完整性证据。
出现 `column_mapping.ambiguity` 时只引用 `totals` 里非 `null` 的槽位；出现 `no_flow: true` 要说
"这段时间没有收发"，而不是"没有库存"。

`kz-compute.mjs` 覆盖不到的算法（例如加权平均、ABC 分类、拟合），自己写一个 Node 脚本读同一个数据文件，
`import` 复用 `kz-money.mjs` 的定点算术。规则不变：数字必须从脚本 stdout 出来。

### 第 5 步：回答

按这个结构组织，让用户能自己复查：

```
结论：<直接回答问题，数字来自脚本输出>
口径：<用了哪个报表的哪些字段，日期区间是什么>
明细：<必要的分项、排名或趋势>
说明：<分页未闭合、口径差异、权限缺失、数据可能截断等，没有就不写>
```

数字直接抄脚本输出，不要重新排版成"约""大概"，也不要顺手换算单位。区间要写清具体日期
（`2026-08-01 至 2026-08-22`），"本月"这种说法要落到实际日期，因为本月通常还没结束。

## 把名称换成 ID

业务筛选参数几乎都要内部 ID 或业务编码，而同名参数在不同报表里含义可能不同，
猜错不会报错、只会静默返回错误范围的数据。所以先取主数据：

```bash
node kz-fetch.mjs category-tree --out data/cat.json          # 快准分类树 → kzCategoryIds（叶节点 id）
node kz-fetch.mjs brand-list --out data/brand.json           # 品牌 → brandId 取 id
node kz-fetch.mjs contact-home --out data/contact.json       # 客户/大客户/供应商 → id 与 number
node kz-fetch.mjs key-account-category --out data/kacat.json # 大客户分类 → customType 取 id
node kz-fetch.mjs warehouse-list --out data/wh.json          # 仓库 → id 与 locationNo
node kz-fetch.mjs store-list --out data/store.json           # 门店 → storeId
node kz-fetch.mjs employee-list --out data/emp.json          # 员工 → id 与 number
node kz-fetch.mjs settle-account-list --out data/acct.json   # 结算账户 → number
```

`category-tree` 和 `contact-home` 落盘的是原始对象而不是行数组（分别在 `windows[0].raw.data.tree`
和 `windows[0].raw` 下的 `contact` / `bigContact` / `supplier`），写一次性脚本遍历时注意这一点。

`contact-home` 的 `bigContact[]` 只能用来回答"谁是大客户"和给 `key-account-sales-detail`
的 `customerId` 做窄化。**它不是大客户的销售数据来源**，理由见上面"两套独立的单据体系"。

**商品 id 要从业务数据里取，没有独立的商品搜索接口。** 快准/三方商品列表接口的响应在纯 HTTP 线路上
是加密的，但这不影响按商品筛选——`sales-summary-by-goods` 和 `inv-balance` 的每一行都带 `invId`，
那就是各处商品筛选参数要的数字 id：

```bash
# 用 1 次请求把一段时间卖过的商品连 invId 一起拿到，再从里面找用户说的那个商品
node kz-fetch.mjs sales-summary-by-goods --date last-7-days --out data/goods.json
node kz-compute.mjs distinct data/goods.json --fields invId,number,name,brandName --measure qty,recAmount --top 30

# 拿到 invId 之后：逐笔销售 / 库存 / 收发，三个端点都能精确到这一个商品
node kz-fetch.mjs sales-detail  --date last-7-days --param goodsNo=10423925 --out data/one-sales.json
node kz-fetch.mjs inv-balance   --param goods=10423925 --out data/one-stock.json
node kz-fetch.mjs deliver-summary --date last-7-days --param goods=10423925 --out data/one-flow.json
node kz-compute.mjs flow data/one-flow.json    # 期初/入库/出库/结存，列含义由脚本解出
```

参数名和取值来源容易记混，下面几条是实测过的（完整清单见 `references/endpoints.md`）：

- 商品数字 id（`invId`）：在 `sales-detail` / `sales-summary-by-goods` 里叫 `goodsNo`，
  在 `inv-balance` / `deliver-summary` 里叫 `goods`。**给 `skuId` 或商品编码这类非数字值，
  上游会直接 500，不是返回空**
- `customerNo` 在 `sales-detail` 里是客户 **number**（`contact-home` 的 `number`，如 `55160001`），
  在"按商品"汇总里是客户 **id**。销售明细行里的 `buId` 是客户 id，直接塞进 `customerNo` 会得到 0 行
- `salesId` 在 `sales-order-list` 里是员工 **id**，在 `sales-detail` 里是员工 **number**
- `accountNo` 在 `bank-journal` 里是结算账户 **number**，在 `payable-detail` 里是供应商 **id**
- `customerNo` / `goodsNo` / `salesId` / `brandId` 支持逗号分隔多值：`--param goodsNo=10423925,11053`
- `storageNo` 在多个报表里**不筛选行**，只影响响应里出现哪些仓库列。注册表已把这些位置固定为空值，
  传了会报错。要分仓库统计就取 `sales-summary-by-goods` 再按行里的 `locationNo` 本地分组

注册表只暴露实测生效的参数。如果 `--describe` 里没有某个参数，说明它在这个端点上被证明无效或没有
合法取值来源——**不要绕过脚本手工拼 URL 去用它**，那只会得到一份看起来正常、范围其实是全表的数据。

## 三个完整示例

这三例的命令和输出都在生产账号上跑通过，可以照着用。

### 例 1：昨天销售额怎么样？

```bash
node kz-fetch.mjs day-report --date yesterday --out data/day-yesterday.json
```

**先看清单再决定下一步**，因为经营报表有 1～2 天的数据延迟，"昨天"到底有没有数据每次都不一样。
这不是夸张：2026-08-22 这一天里查同一个"昨天"（2026-08-21），先后得到过两种结果——
早些时候 `row_count: 0`、`date_coverage.missing_buckets: ["2026-08-21"]`，几小时后同样的命令
`row_count: 1`、`missing_buckets: []`。数据是在当天陆续落库的。

所以不要背结论，要每次读 `date_coverage`：

- 有行 → 正常计算
- 没有行 → 回答"2026-08-21 的日报还没有数据（通常延迟 1～2 天），最新有数据的一天是 X"，
  **不是**"昨天销售额 0 元"。把"还没生成"说成"营业额 0"是这类问题最容易犯、后果最严重的错，
  因为用户会以为门店一天没开张

有数据时再算，并且取一个参照区间——"怎么样"是评价性问题，单个数字没有信息量：

```bash
node kz-compute.mjs summary data/day-yesterday.json \
     --revenue sale_fee --revenue-less dbck_fee --cost cost_fee --profit profit

node kz-fetch.mjs day-report --date last-7-days --out data/day-last7.json
node kz-compute.mjs daily data/day-last7.json --date-field dw_billdate --fields sale_fee,profit
```

实测输出（2026-08-21）：`revenue 10946.00`、`cost 8004.35`、`gross_profit 2941.65`、
`gross_margin_percent 26.87`、`derived_matches_reported: true`；同区间 `daily` 给出
`average_per_bucket 9259.31`、最高 08-15 `12407.00`、最低 08-19 `5025.00`。
有了这两组数才能回答"怎么样"：昨天 10946 元高于近 7 天日均 9259 元，毛利 2941.65 元还是这 7 天里最高的。

`daily` 的日均、最高日、最低日都是脚本算的，不要自己心算平均值（日期字段是 `dw_billdate`，
不是 `date` 或 `billdate`）。`date_coverage` 说明这 7 天里有几天有数据——日均是按有数据的天算的，
如果有缺日要在回答里讲清楚，否则用户会以为分母是 7。

### 例 2：本月卖得最好的轮胎是哪一款？

轮胎是商品分类。有两条路，本地筛选更省一次请求，而且能看见"筛到了什么"：

```bash
# 1) 取本月销售明细。单次上限 7 天，--split 自动切窗口再合并
node kz-fetch.mjs sales-detail --date this-month --split --out data/sales.json

# 2) 先看分类列有哪些取值——比直接猜"轮胎"两个字落在哪一列可靠
node kz-compute.mjs distinct data/sales.json \
     --fields firstCategoryName,secondCategoryName,categoryName --measure recAmount,qty --top 12

# 3) 二级分类 = 轮胎，按金额和按数量各排一次
node kz-compute.mjs rank data/sales.json --where secondCategoryName=轮胎 \
     --group skuId,number --label name,spec,brandName --fields qty,recAmount --by recAmount --top 5
node kz-compute.mjs rank data/sales.json --where secondCategoryName=轮胎 \
     --group skuId,number --label name,spec,brandName --fields qty,recAmount --by qty --top 5
```

几个必须理解的点：

- **分组键写 `skuId,number` 两个字段，缺一不可。** 只写 `skuId` 会整批丢掉第三方仓的行
  （它们 `skuId` 为 `null`，实测 41 行、30 个商品、6824 元，`totals` 与页脚就差这么多）；
  只写 `number` 会把商品并成一个（`number` 是型号，蓄电池的国标型号被多个 SKU 共用）。
  两个一起给，分组数 1177→1207，`totals` 与页脚逐分相等。`name` 不能做身份键——
  它是分类叶子名（"乘用车轮胎"），2128 行里只有 109 个不同值。看到 `dropped_rows_warning`
  就说明分组键还不够。用户看的是 `--label` 里的 `brandName + spec` 加上分组键里的 `number`
- **用 `secondCategoryName` 而不是关键词匹配。** 分类树里有个叶子叫"轮胎清洗剂"，挂在
  化工养护/清洗剂 下面；`--where categoryName~轮胎` 会把它算进轮胎销量。
  用 `--where` 后一定要看输出里的 `local_filter.matched_values`，确认命中的取值就是你要的
- **"卖得最好"同时可以指销量和销售额**，两个榜单的第一名经常不同，所以两个都算，回答里说清依据

也可以让服务端筛：从 `category-tree` 取"轮胎"下的叶节点 id（实测 乘用车轮胎 `110041346`、
商用车轮胎 `110041347`），传 `--param kzCategoryIds='[110041346,110041347]'`。
响应更小，但看不到"筛掉了什么"，所以拿不准分类归属时优先本地筛。

### 例 3：计算本月的销售额、成本、毛利润

```bash
node kz-fetch.mjs day-report --date this-month --out data/day-thismonth.json
node kz-compute.mjs summary data/day-thismonth.json \
     --revenue sale_fee --revenue-less dbck_fee --cost cost_fee --profit profit
node kz-compute.mjs daily data/day-thismonth.json --date-field dw_billdate --fields sale_fee,cost_fee,profit
```

`--revenue-less dbck_fee` 是这一步的关键。经营报表的 `sale_fee` 里含调拨出库（`dbck_fee`），
而后端的 `profit` 是按 `(sale_fee − dbck_fee) − cost_fee` 算的。不扣这一项，推导毛利就和后端
`profit` 对不上，你会以为哪边算错了。加上之后 `derived_matches_reported: true`，口径对齐，可以直接引用。

实测输出（2026-08-01 至 2026-08-22，21 行）：`revenue 194581.20`、`net_revenue 189715.20`、
`cost 141861.03`、`gross_profit 47854.17`、`gross_margin_percent 25.22`、`reported_profit 47854.17`。
注意 `date_coverage.missing_buckets: ["2026-08-22"]`——今天的数据还没生成，
所以这是"8 月 1 日至 21 日"的合计，回答里要按这个区间说，不能说成"整个 8 月"。

回答时区分两个口径：**"销售额"报 `sale_fee`（含调拨）**，
**"毛利率的分母"用 `net_revenue`（已扣调拨）**，并说明差额是调拨出库。

用户明确要"把其他收支也算进来"时再补一个利润表。注意 `sale_fee` 藏在 `coreBiz[]` 里，必须先展开：

```bash
node kz-fetch.mjs profit-report --date this-month --out data/profit.json
node kz-compute.mjs summary data/profit.json --explode coreBiz --where cust_type=销售 \
     --revenue sale_fee --cost cost_fee --profit zy_profit
```

已核验的对应关系（2026-03..2026-08 已结束的月份逐分一致）：利润表 `cust_type="销售"` 的 `sale_fee`
等于经营报表的 `sale_fee − dbck_fee`，`zy_profit` 等于经营报表的 `profit`。
所以这两张表**不该**得到相同的"销售额"，差的正是调拨；`totalProfit = coreProfit + otherProfit`
是含其他业务收支的口径（**注意它不含房租人工税费，不是净利润**，见口径陷阱三）。
`otherProfit` 经常是负的（授信本金、销售收款费这类都记在 `otherCost[]`），
只报主营会让用户高估——2026-08 实测 `otherProfit −2204.00`。
`totalProfit` 本身不要背数：未结束的当月它一天之内就会变（2026-08-22 当天先后测到 42921.03 和
45862.68，差的是新落库的那部分业务），每次都以脚本输出为准。回答里要写明用的是哪个口径。

**在还没结束的当月，这条对应关系可能差一整天，而两个数都是对的。** 2026-08-22 一天之内实测到两次，
落后的都是利润表：日报净销售 189715.20 vs 利润表 178769.20（差额恰好等于 08-21 一整天），
几小时后销售明细 195128.20 vs 利润表 189715.20（差额恰好等于 08-22 一整天）。
对不上时按口径陷阱五的减法定位，不要猜哪张更准——**数据新鲜度是逐端点的，不是全站统一的**。

## 出错时怎么办

脚本失败一律输出 JSON 里的 `error`，按类型处理：

| 情况 | 处理 |
|---|---|
| `INVALID_AGENT_CREDENTIAL` | Token 无效/已撤销。让用户在 kzmall-plus 重新生成，**不要**把旧值打印出来对比 |
| `AGENT_API_DISABLED` | 该部署没开 Agent API，需要管理员开启 |
| `UPSTREAM_REAUTH_FAILED` | 账号密码变了，需要用户在 kzmall-plus 重新登录一次 |
| `UPSTREAM_REAUTH_COOLDOWN` | 重登录冷却中，按 `Retry-After` 等待后重试 |
| `RESPONSE_TOO_LARGE` / `possibly_truncated` | 缩小日期或加窄化条件，**不要**加大 `rows` |
| `NON_JSON_RESPONSE` | 上游返回了错误页（常见于给某个参数传了类型不对的值，例如把商品编码当 `goodsNo`）。核对 `--describe` 里的取值来源，**不要**当成"查询成功且无数据" |
| `UPSTREAM_QUERY_FAILED` | 业务成功谓词没满足。这不等于"没有数据"，可能是权限或参数不合法 |
| 端点不接受某个参数 | 该参数在这个端点上实测无效或没有合法取值来源，已从注册表移除。按报错提示看 `--describe`，换一个窄化方式 |
| 端点不在注册表 | 如实告诉用户当前接口清单没有这个数据源，不要造接口 |

有一点特别重要：**HTTP 200 不等于查询成功**。每个端点的成功谓词都不一样（`status===200`、
`success===true && status==="success"` 等），脚本已经逐端点判定并在不满足时 fail closed。
你在解读结果时也要守住同样的纪律——空数组要能区分"确实没有业务发生"和"查询根本没成功"。

## 延伸资料

- `references/endpoints.md`：每个端点的完整参数、字段释义、口径陷阱和字段名对照。取数前不确定字段含义就查它。
- `references/recipes.md`：更多问题类型的取数+计算组合（客户欠款排行、品牌对比、库存周转、回款率等）。
- `references/guardrails.md`：预算数值、分页判定规则、脱敏要求和安全边界的完整说明。
