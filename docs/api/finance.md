# 财务查询接口

> 这里只记录由正常页面查询明确证明的契约；没有抓到业务请求时不猜后端路径或参数名，并明确标为 C 级。

## 利润表

证据等级：A（页面入口、真实查询 URL、查询条件和结果字段均已确认）。

页面入口：

```http
GET /reports/profitReport/init?action=
```

主查询：

```http
GET /reports/ProfitReport/getProfitReport?startMonth=<YYYY-MM>&endMonth=<YYYY-MM>&storeId=
```

| 参数 | 类型 | 页面默认值 | 说明 |
|---|---|---|---|
| `startMonth` | `YYYY-MM` | 当年 1 月 | 起始月份 |
| `endMonth` | `YYYY-MM` | 当前月份 | 结束月份 |
| `storeId` | string/number | 空 | 门店 ID；空表示当前权限范围 |

响应行与页面列映射：

| 字段 | UI 含义 |
|---|---|
| `month` | 月份 |
| `coreBiz` | 主营业务收入 |
| `coreBiz1` | 主营业务成本 |
| `coreProfitRate` | 主营业务利润率 |
| `coreProfit` | 主营业务利润 |
| `otherIncome` | 其他业务收入 |
| `otherCost` | 其他业务费用支出 |
| `otherProfit` | 其他业务利润 |
| `totalProfit` | 合计利润 |

## 现金银行报表

证据等级：A。

结算账户选项：

```http
GET /basedata/settAcct?action=list
```

主查询：

```http
GET /report/bankBalance_detail?action=detail&beginDate=<YYYY-MM-DD>&endDate=<YYYY-MM-DD>&accountNo=&action=cash_bank_journal_new&_search=false&nd=<timestamp>&rows=3000&page=1&sidx=date&sord=desc
```

注意主查询保留两个 `action` 参数。业务参数为起止日期和 `accountNo` 结算账户编号；默认最多返回 3000 行。

响应行字段：

`accountNumber` 账户编号、`accountName` 账户名称、`type` 账户类型、`date` 日期、`billNo` 单据编号、`billType` 业务类型、`categoryName` 结算方式、`income` 收入、`expenditure` 支出、`discount` 折让、`balance` 账户余额、`buName` 往来单位、`billId`、`billTypeNo`。

## 应付账款明细

证据等级：A。

```http
GET /report/fundBalance_detailSupplier?action=detailSupplier&type=10&beginDate=<YYYY-MM-DD>&endDate=<YYYY-MM-DD>&accountNo=&action=detailSupplier&_search=false&nd=<timestamp>&rows=3000&page=1&sidx=date&sord=desc
```

| 参数 | 说明 |
|---|---|
| `type` | 页面固定为 `10`，表示供应商应付维度 |
| `beginDate` / `endDate` | 单据日期范围 |
| `accountNo` | 供应商选择值；空表示全部 |
| `_search`、`nd`、`rows`、`page`、`sidx`、`sord` | jqGrid 查询、分页和排序参数 |

响应行字段：`buName` 供应商、`date` 单据日期、`billNo` 单据编号、`transType` 业务类型、`income` 应付账款、`expenditure` 付款、`balance` 应付余额、`billId`、`billTypeNo`。

## 付款单查询

证据等级：A。

```http
GET /scm/payment?action=list&matchCon=&beginDate=<YYYY-MM-DD>&endDate=<YYYY-MM-DD>&_search=false&nd=<timestamp>&rows=2000&page=1&sidx=number&sord=desc&buId=
```

`matchCon` 支持单据号或备注，`buId` 是采购单位选择值；页面默认查询当月，最多 2000 行。响应行字段：`operating` 操作展示、`billDate`、`billNo`、`contactName` 采购单位、`totalAmount` 付款金额、`isDisable` 是否可编辑、`description` 备注。查询 Agent 应忽略 `operating` 和 `isDisable` 所指向的编辑能力。

## 调拨收付款单查询

证据等级：A。

```http
GET /scm/invTf/paymentList?matchCon=&type=0&beginDate=<YYYY-MM-DD>&endDate=<YYYY-MM-DD>&_search=false&nd=<timestamp>&rows=2000&page=1&sidx=number&sord=desc
```

`type` 页面默认 `0`（全部），`matchCon` 为单据号。响应字段：`operating`、`billDate`、`billNo`、`transTypeName` 单据类型、`totalAmount` 收/付款金额、`totalDiffAmount` 折让金额、`description`、`isDisable`。

## 线上流水查询

证据等级：B。路径、POST 请求体键、UI 条件和结果列已确认；行响应 schema 未完整取得。

```http
POST /moveMall/UnionPayController/payOrderList
Content-Type: application/x-www-form-urlencoded

pay_type=&pay_no=&beg_time=&end_time=&order_no=&contact_name=&page=1&limit=20&is_all=&data_source=
```

`pay_type` 是支付类型，`pay_no` 是流水单号，`order_no` 是订单号，`contact_name` 是维修厂，`beg_time` / `end_time` 是日期范围，`data_source` 是订单来源（页面默认“E站小程序”），`page` / `limit` 默认 1 / 20。结果字段：序号、流水单号、订单号、订单来源、维修厂名称、付款时间、付款金额、手续费、是否出账。

## 三方成本调整单查询

证据等级：A。

```http
GET /scm/Cost/costList?matchCon=&beginDate=<YYYY-MM-DD>&endDate=<YYYY-MM-DD>&billStatus=2&_search=false&nd=<timestamp>&rows=100&page=1&sidx=number&sord=desc&searchType=0
```

| 参数 | 默认值 | 说明 |
|---|---|---|
| `matchCon` | 空 | 关键字 |
| `beginDate` / `endDate` | 当月 | 日期 |
| `billStatus` | `2` | 状态选择值 |
| `searchType` | `0` | 关键字类型选择值 |

响应字段：`operating`、`billDate`、`billNo` 成本调整单号、`billStatus`、`userName` 制单人、`description`。禁止调用对应的成本调整制单或编辑动作。

## 其它收入单查询

证据等级：A。

```http
GET /scm/ori/listInc?action=listInc&matchCon=&beginDate=<YYYY-MM-DD>&endDate=<YYYY-MM-DD>&_search=false&nd=<timestamp>&rows=100&page=1&sidx=number&sord=desc
```

`matchCon` 支持单据号、客户名或备注。响应字段：`operating`、`billDate`、`billNo`、`contactName` 客户名称、`totalAmount` 金额。

## 其它支出单查询

证据等级：A。

```http
GET /scm/ori/listExp?action=listExp&matchCon=&beginDate=<YYYY-MM-DD>&endDate=<YYYY-MM-DD>&_search=false&nd=<timestamp>&rows=100&page=1&sidx=number&sord=desc&buId=
```

`matchCon` 支持单据号或备注，`buId` 为供应商选择值。响应字段：`operating`、`billDate`、`billNo`、`contactName` 供应商名称、`totalAmount` 金额。

## 客户账户列表与统计

证据等级：B。接口路径和 UI 条件已确认；两个查询均为 POST，本轮未取得请求体键名。

```http
POST /scm/receipt/get_account_list_new
POST /scm/receipt/get_account_statistics
```

页面还会读取微仓权限：

```http
POST /moveMall/MoveSto/checkMoveRight
```

UI 入参为客户选择、页码和每页条数（默认 50）。列表字段：客户编码、客户名称、期初欠款金额、应收余额、账户余额、授信金额/余额、联系人、联系电话、是否启用授信、状态、备注、微仓应收余额、微仓未对账金额。Agent 可以读取字段，但不得执行授信设置或其他行内操作，且不得持久化联系人或电话实际值。

## 服务站账户汇总

证据等级：B。自动加载的两个 POST 查询路径已确认；本轮未取得请求体和响应键名，接入时应以后端正式契约为准。

```http
POST /scm/receipt/accountBalanceSummary
POST /scm/receipt/baitiaoPendingAdjustList
```

页面展示的汇总能力包括：现金账户余额合计、预充值、待退款、返利、融资、金融授信、南京银行授信、拉卡拉授信、快准授信合计、运营授信、专属授信、已使用/待还金额、授信待还和分期待还。第二个接口用于白条待调账列表；不要从查询 Agent 调用任何调账动作。

## 收款单管理列表

证据等级：B。主列表的 POST 请求体键和首页汇总路径已确认；行响应 schema 未完整取得。

```http
POST /scm/receipt/get_receipt_list_new
POST /scm/receipt/receipt_home_page
```

主列表请求体：

```text
buId=&endDate=<YYYY-MM-DD>&beginDate=<YYYY-MM-DD>&wayId=&transType=&billStatus=&matchCon=&page=1&rows=<pageSize>&checkTimeBegin=&checkTimeEnd=
```

`buId` 客户、`wayId` 结算方式、`transType` 收款类型、`billStatus` 状态、`matchCon` 收款单号/客户名称，`checkTimeBegin` / `checkTimeEnd` 为确认时间范围。

UI 条件：客户、起止日期、收款单号/客户名称综合条件，以及高级状态复选项。结果字段：收款流水单号、收款时间、客户名称、收款金额、优惠金额、收款类型、收款人、关联单号、结算方式、结算账户、状态、确认时间、确认人、备注。页面的“收款”“批量确认”等按钮均为写操作，禁止调用。

## 经营报表（日经营数据）

证据等级：B。真实查询路径和日期/分页参数已确认；页面使用非语义化报表组件，本轮未把动态结果值当作字段定义。

```http
GET /report/getDayReport?action=getDayReport&beginDate=<YYYY-MM-DD>&endDate=<YYYY-MM-DD>&_search=false&nd=<timestamp>&rows=3000&page=1&sidx=date&sord=desc
```

默认一次最多 3000 行。接入 Agent 时应限制日期范围；具体响应字段需后端 schema 或一份脱敏响应结构补证。

## 应收账款总表

证据等级：C。页面入口和 UI 契约已确认，但该报表运行在浏览器隔离的跨进程 iframe 中，当前只读通道无法取得业务请求 URL。

```http
GET /report/account_receive_summary
```

UI 入参：起止日期、客户、页码。当前可靠输出列：客户、应收余额、客户 ID。主查询路径未被正常抓包证明，不得生成 HTTP 工具调用。

## 应收账款明细表

证据等级：C。

```http
GET /report/account_proceeds_detail_new?action=detail
```

UI 入参：起止日期、客户、页码。页面采用同一隔离报表组件；业务请求路径和结果字段未被正常抓包证明。

## 客户应收余额表

证据等级：C。

```http
GET /report/customer_balance_receivable?action=list
```

UI 入参：`beginDate`、`endDate`、客户、`type`（两种值）、`payStatus`（三种值）、页码。可靠结果字段：`buName` 修理厂客户、`cCategoryName` 客户类别、`fPreAmount` 期初应收余额、`salesAmount` 本期销售金额、`preAmount` 本期应收余额、`lPreAmount` 期末应收余额、`reAmount` 小计、`diffAmount` 本期折让金额。业务查询 URL 未被正常抓包证明，保持 C 级。

## 客户对账单

证据等级：C。必须选择客户后才会发业务请求，本轮未为抓路径而挑选任何真实客户。

```http
GET /report/customers_reconciliation_new?action=customers_reconciliation_new
```

UI 入参：客户（必选）、起止日期、`match` 匹配复选框、业务类别。输出字段：`date`、`billNo`、`transType`、`skuStandName` 商品名称、`categoryName`、`carModel`、`unit`、`qty`、`price`、`hangDisAmount` 商品优惠、`totalAmount` 商品小计、`disAmount` 整单折扣额、`amount` 应收金额、`rpAmount` 实际收款金额、`diffAmount` 折让金额、`inAmount` 应收款余额、`billId`、`billType`。

## 供应商对账单

证据等级：C。必须选择供应商后才会发业务请求。

```http
GET /report/suppliers_reconciliation_new?action=
```

UI 入参：供应商（必选）、起止日期、`match` 复选框。输出字段：`date`、`billNo`、`transType`、`invNo`、`invName`、`skuId`、`spec`、`unit`、`qty`、`price`、`totalAmount` 采购金额、`disAmount` 优惠金额、`amount` 应付金额、`rpAmount` 实际付款金额、`billId`、`billType`。

## C 级限制汇总

应收账款总表、应收账款明细、客户应收余额、客户/供应商对账单目前只有 C 级 UI 契约。它们不得加入可执行 HTTP 工具清单，直到正常抓包或后端正式 schema 补齐业务请求路径。

## 明确排除的财务写流程

收款单、付款单、调拨收付款单、三方成本调整单、其它收入单、其它支出单属于资金或成本变更流程，禁止查询 Agent 调用。列表页中的确认、审核、作废、编辑、删除、导出也不属于查询接口。
