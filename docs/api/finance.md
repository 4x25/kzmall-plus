# 财务查询接口

> 这里只记录由正常页面查询明确证明的契约；没有抓到业务请求时不猜后端路径或参数名，并明确标为 C 级。

## 利润表

证据等级：A。页面入口、真实查询、9 行非空响应、嵌套业务数组和 jqGrid 渲染绑定均已确认。

页面入口：

```http
GET /reports/profitReport/init?action=
```

主查询：

```http
GET /reports/ProfitReport/getProfitReport?startMonth=<YYYY-MM>&endMonth=<YYYY-MM>&storeId=
```

| UI 筛选项 | 请求参数 | 类型 | 页面默认值/约束 | 说明 | 证据 |
|---|---|---|---|---|---|
| 开始月份 | `startMonth` | `YYYY-MM` | 当年 1 月 | 统计起始月份 | 月份控件 + 抓包 |
| 结束月份 | `endMonth` | `YYYY-MM` | 当前月份 | 统计结束月份；页面限制跨度不超过一年 | 月份控件 + 查询代码 |
| 门店 | `storeId` | string/number | 空 | 可由入口 URL 传入门店 ID；空表示当前权限范围 | 查询对象 + 抓包 |

响应外层为字面量键 `200:boolean`、`status:number`、`redirect:null`、`msg:string`、`data:array`。主表直接使用 `data[]`；当前响应中的月度行和合计行字段类型一致。

| 响应字段/路径 | 类型/可空 | 表格列 | 格式/单位 | 释义 | 证据 |
|---|---|---|---|---|---|
| `data[].month` | string | 月份 | `YYYY-MM` 或合计文本 | 月度统计周期 | 非空响应 + `colModel` |
| `data[].coreBiz` | array | 主营业务-收入 | 多行 `客户类型:金额` | 主营业务按客户类型拆分；收入取子项 `sale_fee` | 非空响应 + formatter |
| 派生 `coreBiz1` | array | 主营业务-成本 | 多行 `客户类型:金额` | 前端把同一个 `coreBiz` 数组复制为 `coreBiz1`，成本取子项 `cost_fee`；不是后端原生字段 | 查询回调 + formatter |
| `data[].coreProfitRate` | number | 主营业务-利润率 | 页面追加 `%` | 主营业务综合利润率 | 非空响应 + formatter |
| `data[].coreProfit` | number | 主营业务-利润 | 元 | 主营业务利润 | 非空响应 + `colModel` |
| `data[].otherIncome` | array | 其他业务-收入 | 多行 `结算/收入方式:金额` | 其他收入拆分，金额取子项 `qtsr_fee` | 非空响应 + formatter |
| `data[].otherCost` | array | 其他业务-费用支出 | 多行 `结算/支出方式:金额` | 其他支出拆分，金额取子项 `qtzc_fee` | 非空响应 + formatter |
| `data[].otherProfit` | number | 其他业务-利润 | 元 | 其他业务利润 | 非空响应 + `colModel` |
| `data[].totalProfit` | number | 合计利润 | 元 | 主营与其他业务利润合计 | 非空响应 + `colModel` |

嵌套数组子项：

| 路径 | 类型 | 释义 |
|---|---|---|
| `coreBiz[].cust_type` | string | 客户类型名称 |
| `coreBiz[].sale_fee` / `cost_fee` | number | 该客户类型的销售收入 / 销售成本 |
| `coreBiz[].zy_profit` / `zy_profit_rate` | number | 主营利润 / 主营利润率 |
| `coreBiz[].dw_month` / `month` | number / string | 内部月份序号 / 月份文本 |
| `otherIncome[].sk_mode` / `qtsr_fee` | string / number | 其他收入方式 / 金额 |
| `otherCost[].sk_mode` / `qtzc_fee` | string / number | 其他支出方式 / 金额 |
| `otherIncome[]`、`otherCost[]` 的 `dw_month` / `month` | number / string | 内部月份序号 / 月份文本 |

页面“导出”会生成文件，不纳入查询 Agent。

## 现金银行报表

证据等级：A。结算账户选项、真实查询、908 行非空响应、页脚汇总和全部表格列均已确认。

结算账户选项：

```http
GET /basedata/settAcct?action=list
```

主查询：

```http
GET /report/bankBalance_detail?action=detail&beginDate=<YYYY-MM-DD>&endDate=<YYYY-MM-DD>&accountNo=&action=cash_bank_journal_new&_search=false&nd=<timestamp>&rows=3000&page=1&sidx=date&sord=desc
```

注意主查询保留两个 `action` 参数，不能用普通对象序列化后只留一个。

| UI 筛选项 | 请求参数 | 类型 | 默认值 | 释义 | 证据 |
|---|---|---|---|---|---|
| 日期 | `beginDate` / `endDate` | `YYYY-MM-DD` | 当月 1 日 / 当前日 | 流水日期范围，均为必填 | 日期控件 + 抓包 |
| 结算账户 | `accountNo` | string | 空全部 | `/basedata/settAcct?action=list` 返回的账户编号 | 下拉绑定 + 抓包 |
| 查询动作 | 第一个/第二个 `action` | string | `detail` / `cash_bank_journal_new` | 后端业务动作与页面报表动作 | 抓包 |
| jqGrid 参数 | `_search`、`nd`、`rows`、`page`、`sidx`、`sord` | mixed | `false`、动态、`3000`、`1`、`date`、`desc` | 防缓存、分页和排序 | 抓包 + 网格配置 |

响应外层为 `status:number`、`msg:string`、`data.list[]`、`data.total`、`data.params`。`data.total` 是页脚汇总，包含同名的 `income`、`expenditure`、`discount`、`balance` 数值以及 `cash`、`bank` 分项；`data.params` 回显报表查询条件。

| 响应字段/路径 | 类型/可空 | 表格列 | 格式/单位 | 释义 | 证据 |
|---|---|---|---|---|---|
| `data.list[].accountNumber` | string | 账户编号 | 编号 | 结算账户编号 | 非空响应 + `colModel` |
| `data.list[].accountName` | string | 账户名称 | 文本 | 结算账户名称 | 非空响应 + `colModel` |
| `data.list[].type` | string | 账户类型 | 文本 | 账户类型显示名 | 非空响应 + `colModel` |
| `data.list[].date` | string | 日期 | 日期 | 流水发生日期 | 非空响应 + `colModel` |
| `data.list[].billNo` | string | 单据编号 | 单号 | 来源业务单据编号 | 非空响应 + `colModel` |
| `data.list[].billType` | string | 业务类型 | 文本 | 业务类型显示名 | 非空响应 + `colModel` |
| `data.list[].categoryName` | string | 结算方式 | 文本 | 结算方式名称 | 非空响应 + `colModel` |
| `data.list[].income` | number | 收入 | 元 | 账户收入金额 | 非空响应 + `colModel` |
| `data.list[].expenditure` | number | 支出 | 元 | 账户支出金额 | 非空响应 + `colModel` |
| `data.list[].discount` | number | 折让 | 元 | 单据折让金额 | 非空响应 + `colModel` |
| `data.list[].balance` | number | 账户余额 | 元 | 该笔流水后的账户余额 | 非空响应 + `colModel` |
| `data.list[].buName` | string | 往来单位 | 文本 | 客户或供应商名称 | 非空响应 + `colModel` |
| `data.list[].billId` | number | 隐藏 | 内部 ID | 来源业务单据 ID，仅用于页面只读跳转 | 非空响应 + 隐藏列 |
| `data.list[].billTypeNo` | string | 隐藏 | 业务代码 | 来源单据类型代码 | 非空响应 + 隐藏列 |
| `data.list[].buId` | number | 不展示 | 内部 ID | 往来单位 ID | 非空响应 |
| `data.list[].transType` | string | 不展示 | 业务代码 | 交易类型代码 | 非空响应 |

打印、导出以及点击行后进入业务单据的后续动作均不属于本查询接口。

## 应付账款明细

证据等级：A。真实查询、829 行非空响应、供应商筛选绑定、页脚汇总和列配置均已确认。

```http
GET /report/fundBalance_detailSupplier?action=detailSupplier&type=10&beginDate=<YYYY-MM-DD>&endDate=<YYYY-MM-DD>&accountNo=&action=detailSupplier&_search=false&nd=<timestamp>&rows=3000&page=1&sidx=date&sord=desc
```

主查询同样保留两个 `action=detailSupplier` 参数。

| UI 筛选项 | 请求参数 | 类型 | 默认值 | 释义 | 证据 |
|---|---|---|---|---|---|
| 日期 | `beginDate` / `endDate` | `YYYY-MM-DD` | 当月 1 日 / 当前日 | 单据日期范围，均为必填 | 日期控件 + 抓包 |
| 供应商 | `accountNo` | string/number | 空全部 | 供应商选择控件的内部值 | 控件绑定 + 抓包 |
| 应付维度 | `type` | string | 固定 `10` | 供应商应付账款维度 | 抓包 |
| jqGrid 参数 | `_search`、`nd`、`rows`、`page`、`sidx`、`sord` | mixed | `false`、动态、`3000`、`1`、`date`、`desc` | 防缓存、分页和排序 | 抓包 + 网格配置 |

响应外层为 `success:boolean`、`status:string`、`redirect:null`、`msg:string`、`data.list[]` 和 `data.total`。金额在当前非空响应中为数值字符串；`data.total` 用同名字段提供页脚合计。

| 响应字段/路径 | 类型/可空 | 表格列 | 格式/单位 | 释义 | 证据 |
|---|---|---|---|---|---|
| `data.list[].buName` | string | 供应商 | 文本 | 供应商名称 | 非空响应 + `colModel` |
| `data.list[].date` | string | 单据日期 | 日期 | 来源单据日期 | 非空响应 + `colModel` |
| `data.list[].billNo` | string | 单据编号 | 单号 | 来源业务单号 | 非空响应 + `colModel` |
| `data.list[].transType` | string | 业务类型 | 文本 | 业务类型显示名 | 非空响应 + `colModel` |
| `data.list[].income` | numeric string | 应付账款 | 元 | 本笔增加的应付款 | 非空响应 + `colModel` |
| `data.list[].expenditure` | numeric string | 付款 | 元 | 本笔付款/冲减金额 | 非空响应 + `colModel` |
| `data.list[].balance` | numeric string | 应付余额 | 元 | 累计应付余额 | 非空响应 + `colModel` |
| `data.list[].billId` | 当前样本未返回 | 隐藏 | 内部 ID | 组件预留的来源单据 ID | 隐藏列配置 |
| `data.list[].billTypeNo` | 当前样本未返回 | 隐藏 | 业务代码 | 组件预留的来源单据类型 | 隐藏列配置 |

页面的打印、导出和点击行跳转不纳入查询 Agent。

## 付款单查询

证据等级：A。默认查询返回 33 行；查询参数、非空字段类型、分页容器和当前服务类型的全部可见列均已确认。

```http
GET /scm/payment?action=list&matchCon=&beginDate=<YYYY-MM-DD>&endDate=<YYYY-MM-DD>&_search=false&nd=<timestamp>&rows=2000&page=1&sidx=number&sord=desc
```

| UI 筛选项 | 请求参数 | 类型 | 默认值 | 释义 | 证据 |
|---|---|---|---|---|---|
| 供应商 | `buId` | string/number | 初次加载省略；手动查询为空字符串 | 供应商内部 ID | 供应商组件 + 查询代码 |
| 综合搜索 | `matchCon` | string | 空 | 单据号、供应商或备注关键字 | 输入提示 + 查询代码 |
| 日期 | `beginDate` / `endDate` | `YYYY-MM-DD` | 当月 1 日 / 当前日 | 付款单日期范围 | 日期控件 + 抓包 |
| jqGrid 参数 | `_search`、`nd`、`rows`、`page`、`sidx`、`sord` | mixed | `false`、动态、`2000`、`1`、`number`、`desc` | 防缓存、分页和排序 | 抓包 + 网格配置 |

响应为 `status:number`、`msg:string`、`data.page:number`、`data.records:string`、`data.total:number`、`data.rows[]`。

| 响应字段/路径 | 类型/可空 | 表格列 | 格式/单位 | 释义 | 证据 |
|---|---|---|---|---|---|
| `data.rows[].billDate` | string | 单据日期 | 日期 | 付款单日期 | 非空响应 + `colModel` |
| `data.rows[].billNo` | string | 单据编号 | 单号 | 付款单编号 | 非空响应 + `colModel` |
| `data.rows[].contactName` | string | 采购单位 | 文本 | 供应商/采购单位名称 | 非空响应 + `colModel` |
| `data.rows[].totalAmount` | number | 付款金额 | 元 | 付款总额 | 非空响应 + `colModel` |
| `data.rows[].description` | string | 备注 | 文本 | 付款说明 | 非空响应 + `colModel` |
| `data.rows[].isDisable` | string | 隐藏“是否可编辑” | `1` 页面只读查看，其他值可能显示修改 | UI 权限标记，不是业务查询结果 | 非空响应 + formatter |
| `data.rows[].id` | number | 不展示 | 内部 ID | 付款单 ID | 非空响应 |
| `data.rows[].amount` | numeric string | 不展示 | 金额 | 后端附加金额字段 | 非空响应 |
| `data.rows[].srcOrderId` | string | 不展示 | 内部 ID/单号 | 来源订单标识 | 非空响应 |
| 派生 `operating` | 非响应字段 | 操作 | HTML | 页面由 `id`、`isDisable` 生成，查询 Agent 必须忽略 | formatter |

服务类型 2 的组件还预留 `bDeAmount`（本次核销金额）、`adjustRate`（整单折扣）、`deAmount`（本次预付款）三列；当前服务类型未展示且非空响应未返回，故不声明其实际类型。修改、删除和导出均禁止调用。

## 调拨收付款单查询

证据等级：B。真实请求、完整筛选枚举、空分页响应和全部列绑定已确认；即使扩展至 2025-01-01 至 2026-08-18，当前账号仍无记录，因此行字段类型/可空性待非空响应补证。

```http
GET /scm/invTf/paymentList?matchCon=&type=0&beginDate=<YYYY-MM-DD>&endDate=<YYYY-MM-DD>&_search=false&nd=<timestamp>&rows=2000&page=1&sidx=number&sord=desc
```

| UI 筛选项 | 请求参数 | 类型 | 默认值/枚举 | 释义 | 证据 |
|---|---|---|---|---|---|
| 单据类型 | `type` | string/number | `0` 全部、`1` 调拨收入单、`2` 调拨支出单 | 调拨收支方向 | 组件枚举 + 抓包 |
| 综合搜索 | `matchCon` | string | 空 | 单据编号关键字 | 查询对象 |
| 日期 | `beginDate` / `endDate` | `YYYY-MM-DD` | 当月 1 日 / 当前日 | 单据日期范围 | 日期控件 + 抓包 |
| jqGrid 参数 | `_search`、`nd`、`rows`、`page`、`sidx`、`sord` | mixed | `false`、动态、`2000`、`1`、`number`、`desc` | 防缓存、分页和排序 | 抓包 + 网格配置 |

当前空响应为 `status:number`、`msg:string`、`data.page:number`、`data.records:number`、`data.total:number`、`data.rows:[]`。

| 响应字段 | 表格列 | 格式/单位 | 释义 | 证据 |
|---|---|---|---|---|
| `billDate` | 单据日期 | 日期 | 调拨收/付款单日期 | `colModel` |
| `billNo` | 单据编号 | 单号 | 调拨收/付款单编号 | `colModel` |
| `transTypeName` | 单据类型 | 文本 | 调拨收入/支出类型显示名 | `colModel` |
| `totalAmount` | 收/付款金额 | 元 | 本单收款或付款金额 | `colModel` |
| `totalDiffAmount` | 折让金额 | 元 | 调拨结算折让 | `colModel` |
| `description` | 备注 | 文本 | 单据备注 | `colModel` |
| `isDisable` | 隐藏“是否可编辑” | 枚举 | 页面权限标记，Agent 忽略 | `colModel` + formatter |
| 派生 `operating` | 操作 | HTML | 页面操作列，不是响应字段 | formatter |

查看之外的修改、删除动作均不属于查询能力。

## 线上流水查询

证据等级：B。路径、真实 POST 请求体、响应外层和组件列字段已确认；当前筛选结果为空，行字段类型与可空性待非空响应确认。

```http
POST /moveMall/UnionPayController/payOrderList
Content-Type: application/x-www-form-urlencoded

pay_type=1&pay_no=&beg_time=&end_time=&order_no=&contact_name=&page=1&limit=20&is_all=0&data_source=1
```

| UI 筛选项 | 请求参数 | 类型 | 默认值/枚举 | 释义 | 证据 |
|---|---|---|---|---|---|
| 记录页签 | `pay_type` | number/string | `1` 交易记录、`2` 退款记录 | 决定列表业务类型 | 组件页签 + 抓包 |
| 流水单号/退款单号 | `pay_no` | string | 空 | 随页签匹配交易流水或退款单号 | 组件 `v-model` |
| 订单号 | `order_no` | string | 空 | 关联订单号 | 组件 `v-model` |
| 维修厂名称 | `contact_name` | string | 空 | 客户名称关键字 | 组件 `v-model` |
| 订单来源 | `data_source` | number | `1` E 站小程序、`2` E 站 APP | 来源渠道 | 组件枚举 + 抓包 |
| 付款时间 | `beg_time` / `end_time` | `YYYY-MM-DD HH:mm:ss` | 空 | 付款/退款时间范围 | 组件 watcher |
| 全量导出标志 | `is_all` | number | 查询固定 `0` | `1` 仅用于导出，查询 Agent 不使用 | 查询对象 |
| 页码/页大小 | `page` / `limit` | integer | `1` / `20`；页大小可选 20、50、100、500 | 分页 | 组件配置 + 抓包 |

响应外层为 `success`、`status`、`redirect`、`page_count`、`msg`、`list[]`、`count`。

| 响应字段/路径 | 类型/可空 | 表格列 | 格式/单位 | 释义 | 证据 |
|---|---|---|---|---|---|
| `list[].bill_no` | 待非空响应确认 | 流水单号；退款页为退款单号 | 单号 | 当前交易/退款记录编号 | 组件 `prop` |
| `list[].order_no` | 待非空响应确认 | 订单号 | 单号 | 关联订单编号 | 组件 `prop` |
| `list[].source_name` | 待非空响应确认 | 订单来源 | 文本 | 来源显示名 | 组件 `prop` |
| `list[].contact_name` | 待非空响应确认 | 维修厂名称 | 文本 | 客户名称 | 组件 `prop` |
| `list[].pay_time` | 待非空响应确认 | 付款时间 | 日期时间 | 支付或退款发生时间 | 组件 `prop` |
| `list[].pay_amount` | 待非空响应确认 | 付款金额；退款页为退款金额 | 元 | 交易金额 | 组件 `prop` |
| `list[].service_amount` | 待非空响应确认 | 手续费 | 元 | 支付通道手续费 | 组件 `prop` |
| `list[].bill_status` | 待非空响应确认 | 是否出账（仅交易记录） | `3` 已到账，其他值未到账 | 银行出账/到账状态 | 组件渲染逻辑 |

## 三方成本调整单查询

证据等级：A。默认当月为空；在只读扩大日期范围后取得 3 行非空响应，并确认全部筛选枚举、字段类型和列绑定。

```http
GET /scm/Cost/CostList?matchCon=&beginDate=<YYYY-MM-DD>&endDate=<YYYY-MM-DD>&billStatus=2&_search=false&nd=<timestamp>&rows=100&page=1&sidx=number&sord=desc&searchType=0
```

初次加载抓到 `CostList`，组件后续刷新使用大小写不同的 `costList`；接入项目时应采用当前已抓到的 `CostList` 并保留回归验证。

| UI 筛选项 | 请求参数 | 类型 | 默认值/枚举 | 释义 | 证据 |
|---|---|---|---|---|---|
| 日期 | `beginDate` / `endDate` | `YYYY-MM-DD` | 当月 1 日 / 当前日 | 单据日期范围 | 日期控件 + 抓包 |
| 状态 | `billStatus` | string/number | `2` 全部、`0` 已提交、`1` 草稿 | 成本调整单状态 | 原生选项 + formatter |
| 搜索类型 | `searchType` | string/number | `0` 商品编号/名称、`1` 成本调整单号、`2` 制单人 | 解释 `matchCon` | 原生选项 + 查询代码 |
| 关键字 | `matchCon` | string | 空 | 按 `searchType` 搜索 | 查询对象 |
| jqGrid 参数 | `_search`、`nd`、`rows`、`page`、`sidx`、`sord` | mixed | `false`、动态、`100`、`1`、`number`、`desc` | 防缓存、分页和排序 | 抓包 + 网格配置 |

响应位于 `data.rows[]`；本次非空样本只返回该容器，没有通用 `status/msg` 外层。

| 响应字段/路径 | 类型/可空 | 表格列 | 格式/单位 | 释义 | 证据 |
|---|---|---|---|---|---|
| `data.rows[].billDate` | string | 单据日期 | 日期 | 成本调整日期 | 非空响应 + `colModel` |
| `data.rows[].billNo` | string | 成本调整单号 | 单号 | 调整单编号 | 非空响应 + `colModel` |
| `data.rows[].billStatus` | string | 状态 | `0` 已提交，其他当前显示草稿 | 调整单状态代码 | 非空响应 + formatter |
| `data.rows[].userName` | string | 制单人 | 文本 | 创建调整单的人员 | 非空响应 + `colModel` |
| `data.rows[].description` | string | 备注 | 文本 | 调整说明 | 非空响应 + `colModel` |
| `data.rows[].id` / `sid` / `uid` | string | 不展示 | 内部 ID | 调整单、服务站和用户标识 | 非空响应 |
| `data.rows[].createTime` / `modifyTime` | string | 不展示 | 日期时间 | 创建和修改时间 | 非空响应 |
| `data.rows[].isDelete` | string | 不展示 | 后端标记 | 删除状态标记；不据此调用删除动作 | 非空响应 |
| 派生 `operating` | 非响应字段 | 操作 | HTML | 页面根据状态生成查看/修改/删除按钮 | formatter |

禁止调用对应的制单、编辑、删除或导出动作。

## 其它收入单查询

证据等级：A。默认查询返回 3 行；请求参数、分页容器、非空字段类型和表格列均已确认。

```http
GET /scm/ori/listInc?action=listInc&matchCon=&beginDate=<YYYY-MM-DD>&endDate=<YYYY-MM-DD>&_search=false&nd=<timestamp>&rows=100&page=1&sidx=number&sord=desc
```

| UI 筛选项 | 请求参数 | 类型 | 默认值 | 释义 | 证据 |
|---|---|---|---|---|---|
| 综合搜索 | `matchCon` | string | 空 | 单据号、客户名或备注 | 输入提示 + 查询代码 |
| 日期 | `beginDate` / `endDate` | `YYYY-MM-DD` | 当月 1 日 / 当前日 | 收入单日期范围 | 日期控件 + 抓包 |
| jqGrid 参数 | `_search`、`nd`、`rows`、`page`、`sidx`、`sord` | mixed | `false`、动态、`100`、`1`、`number`、`desc` | 防缓存、分页和排序 | 抓包 + 网格配置 |

响应为 `status:number`、`msg:string`、`data.page:number`、`data.records:string`、`data.total:number`、`data.rows[]`。

| 响应字段/路径 | 类型/可空 | 表格列 | 释义 | 证据 |
|---|---|---|---|---|
| `data.rows[].billDate` | string | 单据日期 | 其它收入单日期 | 非空响应 + `colModel` |
| `data.rows[].billNo` | string | 单据编号 | 收入单编号 | 非空响应 + `colModel` |
| `data.rows[].contactName` | string | 客户名称 | 收入往来客户 | 非空响应 + `colModel` |
| `data.rows[].totalAmount` | number | 金额 | 收入金额，元 | 非空响应 + `colModel` |
| `data.rows[].id` | string | 不展示 | 收入单 ID | 非空响应 |
| `data.rows[].amount` | number | 不展示 | 后端附加金额字段 | 非空响应 |
| `data.rows[].billType` / `transType` / `transTypeName` | string / number / string | 不展示 | 单据类型与业务类型代码/名称 | 非空响应 |
| `data.rows[].description` | string | 不展示 | 收入单备注 | 非空响应 |
| `data.rows[].userName` | string | 不展示 | 制单人 | 非空响应 |
| `data.rows[].checkName` | null（当前样本） | 不展示 | 审核/确认人 | 非空响应 |
| `data.rows[].checked` / `canDel` / `canUpdate` | number | 不展示 | 页面状态与操作权限标记 | 非空响应 |

操作列由前端生成；新增、修改、撤销、打印和导出均不属于查询能力。

## 其它支出单查询

证据等级：A。默认查询返回 3 行；供应商绑定、分页容器、非空字段类型和列配置均已确认。

```http
GET /scm/ori/listExp?action=listExp&matchCon=&beginDate=<YYYY-MM-DD>&endDate=<YYYY-MM-DD>&_search=false&nd=<timestamp>&rows=100&page=1&sidx=number&sord=desc
```

| UI 筛选项 | 请求参数 | 类型 | 默认值 | 释义 | 证据 |
|---|---|---|---|---|---|
| 供应商 | `buId` | string/number | 初次加载省略；手动查询为空字符串 | 供应商内部 ID | 供应商组件 + 查询代码 |
| 综合搜索 | `matchCon` | string | 空 | 单据号、供应商名或备注 | 输入提示 + 查询代码 |
| 日期 | `beginDate` / `endDate` | `YYYY-MM-DD` | 当月 1 日 / 当前日 | 支出单日期范围 | 日期控件 + 抓包 |
| jqGrid 参数 | `_search`、`nd`、`rows`、`page`、`sidx`、`sord` | mixed | `false`、动态、`100`、`1`、`number`、`desc` | 防缓存、分页和排序 | 抓包 + 网格配置 |

响应外层和字段类型与“其它收入单查询”相同，列表位于 `data.rows[]`。

| 响应字段/路径 | 类型/可空 | 表格列 | 释义 | 证据 |
|---|---|---|---|---|
| `data.rows[].billDate` | string | 单据日期 | 其它支出单日期 | 非空响应 + `colModel` |
| `data.rows[].billNo` | string | 单据编号 | 支出单编号 | 非空响应 + `colModel` |
| `data.rows[].contactName` | string | 供应商名称 | 支出往来供应商 | 非空响应 + `colModel` |
| `data.rows[].totalAmount` | number | 金额 | 支出金额，元 | 非空响应 + `colModel` |
| `data.rows[].id`、`amount`、`billType`、`transType`、`transTypeName` | string/number | 不展示 | 内部 ID、附加金额和业务类型 | 非空响应 |
| `data.rows[].description`、`userName` | string | 不展示 | 备注、制单人 | 非空响应 |
| `data.rows[].checkName` | null（当前样本） | 不展示 | 审核/确认人 | 非空响应 |
| `data.rows[].checked` / `canDel` / `canUpdate` | number | 不展示 | 页面状态与操作权限标记 | 非空响应 |

操作列由前端生成；新增、修改、撤销、打印和导出均禁止调用。

## 客户账户列表与统计

证据等级：A。列表 POST 请求体、非空响应行、统计接口和表格 `prop` 映射均已确认。

```http
POST /scm/receipt/get_account_list_new
POST /scm/receipt/get_account_statistics
```

列表请求体：

```text
buId=&page=1&rows=50&sortWay=
```

页面还会读取微仓权限：

```http
POST /moveMall/MoveSto/checkMoveRight
```

| UI 筛选项 | 请求参数 | 类型 | 默认值/枚举 | 释义 | 证据 |
|---|---|---|---|---|---|
| 客户 | `buId` | string/number | 空 | 客户内部 ID；组件本地字段名为 `accountId` | 查询对象 + 抓包 |
| 页码/页大小 | `page` / `rows` | integer | `1` / `50`；页大小可选 50、100、200/300 | 分页 | 查询对象 + 抓包 |
| 列排序 | `sortWay` | string | 空；如 `ARREARS_DESC`、`BALANCE_ASC` | 由可排序列名和升降序拼接后转大写 | 组件排序逻辑 |

列表响应外层为 `success`、`status`、`redirect`、`msg`、`data`；分页数据位于 `data.list[]`，同时返回 `data.page`、`data.rows`、`data.records`、`data.total`、`data.limit`。

| 响应字段/路径 | 类型/可空 | 表格列 | 格式/单位 | 释义 | 证据 |
|---|---|---|---|---|---|
| `data.list[].contactNumber` | string | 客户编码 | 编码 | 客户业务编码 | 非空响应 + 表格 `prop` |
| `data.list[].contactName` | string | 客户名称 | 文本 | 客户显示名称 | 非空响应 + 表格 `prop` |
| `data.list[].debt_amount` | numeric string | 期初欠款金额 | 元 | 账户初始化时的欠款 | 非空响应 + 表格 `prop` |
| `data.list[].arrears` | numeric string | 应收余额 | 元 | 当前未收应收款 | 非空响应 + 表格 `prop` |
| `data.list[].balance` | numeric string | 账户余额 | 元 | 客户预存/可用账户余额 | 非空响应 + 表格 `prop` |
| `data.list[].credit` | numeric string | 授信金额/余额 | 元 | 授信总额；与 `credit_vacancy` 组合展示 | 非空响应 + 表格 `prop` |
| `data.list[].credit_vacancy` | numeric string | 授信金额/余额 | 元 | 剩余授信额度 | 非空响应 + scoped slot |
| `data.list[].linkName` | string/可空 | 联系人 | 文本 | 客户联系人 | 非空响应 + 表格 `prop` |
| `data.list[].mobile` | string/可空 | 联系电话 | 电话 | 联系电话 | 非空响应 + 表格 `prop` |
| `data.list[].creditStatus` | string | 是否启用授信 | 枚举显示 | 授信开关状态 | 非空响应 + 表格 `prop` |
| `data.list[].disable` | string | 状态 | 枚举显示 | 客户账户启用状态 | 非空响应 + 表格 `prop` |
| `data.list[].description` | string/可空 | 备注 | 文本 | 账户备注 | 非空响应 + 表格 `prop` |
| `data.list[].move_arrears` | numeric string | 微仓应收余额 | 元 | 微仓业务应收余额 | 非空响应 + 表格 `prop` |
| `data.list[].move_nocheck_amount` | numeric string | 微仓未对帐金额 | 元 | 微仓未对账金额 | 非空响应 + 表格 `prop` |

联系人和电话属于个人信息：Agent 仅在用户明确需要时返回最少字段，不得持久化实际值。授信设置、期初欠款导入、导出及行内启停均为写/高风险动作，不属于查询接口。

## 服务站账户汇总

证据等级：A。两个自动加载的 POST、空 JSON 请求体、非空响应、页面组件字段绑定和待办汇总算法均已确认。页面没有查询表单，进入页面即读取当前服务站账户。

```http
POST /scm/receipt/accountBalanceSummary
Content-Type: application/json;charset=UTF-8

{}

POST /scm/receipt/baitiaoPendingAdjustList
Content-Type: application/json;charset=UTF-8

{}
```

两个接口的通用响应外层为 `success:boolean`、`status:string`、`redirect:null`、`msg:string`。账户汇总位于 `data` 对象；金额的 `*Yuan` 字段是元单位数值字符串，页面会补千分位但不会改变原始接口值。

`accountBalanceSummary` 的页面展示字段：

| 响应字段/路径 | 类型/可空 | 页面指标 | 格式/单位 | 释义 | 证据 |
|---|---|---|---|---|---|
| `data.balanceTotalAmountYuan` | string | 可用资金总额 | 元字符串 | 当前服务站所有可用账户余额合计 | 非空响应 + 组件绑定 |
| `data.cashAccount.balanceTotalAmountYuan` | string | 现金账户余额合计 | 元字符串 | 现金类子账户可用余额合计 | 非空响应 + 组件绑定 |
| `data.cashAccount.recharge.balanceAmountYuan` | string | 预充值账户余额 | 元字符串 | 预充值子账户可用余额 | 非空响应 + 组件绑定 |
| `data.cashAccount.refund.balanceAmountYuan` | string | 待退款账户余额 | 元字符串 | 待退款子账户可用余额 | 非空响应 + 组件绑定 |
| `data.cashAccount.rebate.balanceAmountYuan` | string | 返利账户余额 | 元字符串 | 返利子账户可用余额 | 非空响应 + 组件绑定 |
| `data.cashAccount.finance.balanceAmountYuan` | string | 融资账户余额 | 元字符串 | 融资子账户可用余额 | 非空响应 + 组件绑定 |
| `data.financeCreditAccount.balanceTotalAmountYuan` | string | 金融授信账户余额 | 元字符串 | 外部金融机构授信可用余额合计 | 非空响应 + 组件绑定 |
| `data.financeCreditAccount.nanjing.balanceAmountYuan` | string | 南京银行授信余额 | 元字符串 | 南京银行授信可用余额 | 非空响应 + 组件绑定 |
| `data.financeCreditAccount.lakala.balanceAmountYuan` | string | 拉卡拉授信余额 | 元字符串 | 拉卡拉授信可用余额 | 非空响应 + 组件绑定 |
| `data.financeCreditAccount.icbc.balanceAmountYuan` | 条件对象内 string | 工商银行授信余额 | 元字符串 | 工商银行授信可用余额；当前响应未返回该机构，组件按存在性显示 | 组件条件绑定 |
| `data.kzCreditAccount.balanceTotalAmountYuan` | string | 快准授信余额合计 | 元字符串 | 快准授信可用余额合计 | 非空响应 + 组件绑定 |
| `data.kzCreditAccount.commonCredit.balanceAmountYuan` | string | 运营授信余额 | 元字符串 | 通用/运营授信可用余额 | 非空响应 + 组件绑定 |
| `data.kzCreditAccount.specCredit.balanceAmountYuan` | string | 专属授信余额 | 元字符串 | 专属授信可用余额 | 非空响应 + 组件绑定 |
| `data.kzCreditAccount.totalBaitiaoWaitPayYuan` | string | 已使用金额（待还金额） | 元字符串 | 白条已使用、等待偿还的总金额 | 非空响应 + 组件绑定 |
| `data.kzCreditAccount.usedTotalAmountYuan` | string | 授信待还金额 | 元字符串 | 当前授信待还总额 | 非空响应 + 组件绑定 |
| `data.kzCreditAccount.baitiaoDelayYuan` | string | 分期待还金额 | 元字符串 | 分期业务待还总额 | 非空响应 + 组件绑定 |
| `data.sid` | string | 不展示 | 服务站 ID | 当前账户所属服务站标识 | 非空响应 |

账户对象还返回以下辅助字段：

| 对象 | 字段 | 类型 | 释义 |
|---|---|---|---|
| `cashAccount.recharge` / `rebate` | `supportApplyWithDraw` | boolean | 是否支持申请提现 |
| `cashAccount.refund` / `finance` | `supportApplyWithDraw`、`freezeAmountYuan` | boolean、string | 是否支持提现、冻结金额 |
| `financeCreditAccount.nanjing` / `lakala`（以及条件性的 `icbc`） | `totalAmountYuan`、`usedAmountYuan`、`validDate`、`supportApplyWithDraw` | string、string、string、boolean | 授信总额、已用金额、有效期、是否支持提现 |
| `kzCreditAccount` | `totalAmountYuan` | string | 快准授信总额 |
| `kzCreditAccount.commonCredit` / `specCredit` | `totalAmountYuan`、`usedAmountYuan`、`supportApplyWithDraw` | string、string、boolean | 子授信总额、已用金额、是否支持提现 |

`baitiaoPendingAdjustList` 的 `data` 为承运/发货主体数组：

| 响应字段/路径 | 类型/可空 | 页面用途 | 释义 | 证据 |
|---|---|---|---|---|
| `data[].shipperCode` | string | 主体过滤 | 发货主体编码；当前组件只汇总编码 `001` | 非空响应 + 组件逻辑 |
| `data[].shipperName` | string | 不展示 | 发货主体名称 | 非空响应 |
| `data[].balanceAjustList` | array | 待办计算源 | 白条余额调整/授信待还明细 | 非空响应 + 组件逻辑 |
| `data[].balanceAjustList[].detail.expireDate` | string | 一周待还、逾期判断 | 到期时间；距当前不足 7 天计入一周待还，小于当前时间计入逾期 | 非空响应 + 组件算法 |
| `data[].balanceAjustList[].extInfo.stayAmountYuan` | string | 待还金额汇总 | 待还总金额；页面转为数字求和后保留两位小数 | 非空响应 + 组件算法 |
| 派生 `weekPendingNum` | integer | 一周待还授信笔数 | 满足上述 7 天条件的明细数，不是后端原生字段 | 组件算法 |
| 派生 `weekPendingMoneyYuan` | string | 一周待还授信金额 | 满足 7 天条件的 `stayAmountYuan` 合计 | 组件算法 |
| 派生 `overdueAmountYuan` | string | 已逾期授信总金额 | 已过期明细的 `stayAmountYuan` 合计 | 组件算法 |

`balanceAjustList[]` 已观察到的顶层字段如下；`*Yuan` 为元字符串，与同名前缀的 number 原始金额字段成对出现：

| 字段组 | 类型 | 释义 |
|---|---|---|
| `id`、`adjustNo`、`adjustDate` | number、string、string | 调整记录 ID、调整单号、调整日期 |
| `createTime`、`updateTime`、`createTimeStr`、`updateTimeStr` | string | 创建/更新时间及其显示字符串 |
| `createUser`、`updateUser` | string | 创建人、更新人标识 |
| `type` / `typeDesc`、`status` / `statusDesc` | string | 调整类型及显示名、状态及显示名 |
| `oaNo`、`sourceOrderNo`、`sourceAdjustNo` | string | OA 单号、来源订单号、来源调整单号 |
| `sid` / `sname` | string | 服务站 ID / 名称 |
| `shipperCode` / `shipperName`、`marketingCode` | string | 发货主体编码/名称、营销主体编码 |
| `totalAmount` / `totalAmountYuan` | number / string | 调整总金额原始值 / 元字符串 |
| `auditRemark`、`remark`、`returnInfo` | string | 审核备注、业务备注、返还信息 |
| `subAccountId`、`subAccountTypeCode` / `subAccountTypeName`、`subAccountCode` | number、string | 子账户 ID、类型编码/名称、子账户编码 |
| `rebateTypeCode` / `rebateTypeDesc`、`rebateDeptCode` / `rebateDeptDesc` | string | 返利类型、返利部门的编码与显示名 |
| `effectDate`、`expireDate`、`auditTime` | string | 生效日期、到期日期、审核时间 |
| `expireStatus` / `expireStatusDesc`、`paybackStatus` / `paybackStatusDesc` | string | 到期状态、还款状态的编码与显示名 |
| `sourceType` / `sourceTypeDesc` | string | 来源类型编码与显示名 |
| `specRebateRuleCode`、`activityId` / `activityName` | string | 专项返利规则、活动 ID / 名称 |
| `rebateFirstDepartCode` / `rebateFirstDepartName`、`budgetMonth` | string | 一级返利部门编码/名称、预算月份 |
| `productLineCode` / `productLineName` | string | 产品线编码与名称 |
| `finChannelCode`、`finReduceReasonCode` | string | 金融渠道编码、金融核减原因编码 |
| `attractInvestment`、`hasInWaitingAudit` | string | 招商相关标记、是否存在待审核记录的后端值 |
| `installment` / `installmentDesc` | boolean / string | 是否分期及显示说明 |

明细子对象：

| 路径 | 字段 | 类型 | 释义 |
|---|---|---|---|
| `detail` | `id`、`adjustId`、`adjustNo`、`subAccountId`、`subAccountCode`、`subAccountTypeCode`、`subAccountTypeName` | number/string | 明细及调整单、子账户标识 |
| `detail` | `type` / `typeDesc`、`amount` / `amountYuan`、`expireDate`、`remark` | string/number | 明细类型、金额、到期日和备注 |
| `detail` | `interestDailyRate`、`lateFeeDailyRate` | string | 日利率、日滞纳金率 |
| `detail` | `createTime`、`updateTime`、`createUser`、`updateUser`、`createTimeStr`、`updateTimeStr` | string | 审计时间与人员字段 |
| `extInfo` | `sourceAmount`、`creditAmount`、`hasUseAmount`、`frozenAmount`、`availableAmount` 及各自 `*Yuan` | number / string | 来源、授信、已用、冻结和可用金额 |
| `extInfo` | `stayPrincipalAmount`、`returnPrincipalAmount`、`returningAmount` 及各自 `*Yuan` | number / string | 待还本金、已还本金、还款中金额 |
| `extInfo` | `stayInterestAmount`、`returnInterestAmount`、`interestAmount` 及各自 `*Yuan` | number / string | 待还、已还及合计利息 |
| `extInfo` | `stayLateFeeAmount`、`returnLateFeeAmount`、`lateFeeAmount` 及各自 `*Yuan` | number / string | 待还、已还及合计滞纳金 |
| `extInfo` | `stayAmount`、`returnAmount` 及各自 `*Yuan` | number / string | 待还总额、已还总额 |
| `extInfo` | `returnPrincipalAmountToRefundAccount` / `returnPrincipalAmountToRefundAccountYuan` | number/string / string | 退回退款账户的本金金额；原始字段本次样本存在 number/string 两种形态 |
| `extInfo` | `inInstallmentWhitelist` | boolean | 是否在分期白名单 |
| `extInfo` | `id`、`adjustId`、`adjustNo`、创建/更新时间与人员字段 | number/string | 扩展记录及审计标识 |

该页面的“立即处理”、授信还款和各账户管理入口会进入后续业务流程；这里只允许读取两个汇总接口，不调用任何提现、调账或还款动作。

## 收款单管理列表

证据等级：A。主列表 POST 请求体、非空响应行、首页汇总路径和表格 `prop` 映射均已确认。

```http
POST /scm/receipt/get_receipt_list_new
POST /scm/receipt/receipt_home_page
```

主列表请求体：

```text
buId=&endDate=<YYYY-MM-DD>&beginDate=<YYYY-MM-DD>&wayId=&transType=&billStatus=SUBMIT&matchCon=&page=1&rows=50&checkTimeBegin=&checkTimeEnd=
```

| UI 筛选项 | 请求参数 | 类型 | 默认值/枚举 | 释义 | 证据 |
|---|---|---|---|---|---|
| 客户 | `buId` | string/number | 空 | 客户内部 ID | 查询对象 + 抓包 |
| 收款日期 | `beginDate` / `endDate` | `YYYY-MM-DD` | 当月第一天 / 当前日 | 收款单日期范围 | 组件默认值 + 抓包 |
| 结算方式 | `wayId` | string/number | 空全部 | 结算方式 ID | 查询对象 |
| 收款类型 | `transType` | string/number | 空全部 | 收款业务类型 ID | 查询对象 |
| 状态页签 | `billStatus` | string | 默认 `SUBMIT`；`ALL` 全部、`SUBMIT` 已提交、`CONFIRM` 已确认、`CANCEL` 已撤销 | 收款单状态 | 模板页签 + 抓包 |
| 综合搜索 | `matchCon` | string | 空 | 收款单号或客户名称 | UI + 查询对象 |
| 确认时间 | `checkTimeBegin` / `checkTimeEnd` | `YYYY-MM-DD` | 空 | 财务确认时间范围 | 查询对象 |
| 页码/页大小 | `page` / `rows` | integer | `1` / `50`；页大小可选 50、100、200/300 | 分页 | 查询对象 + 抓包 |

响应外层为 `success`、`status`、`redirect`、`msg`、`data`；列表位于 `data.list[]`，并返回分页字段。

| 响应字段/路径 | 类型/可空 | 表格列 | 格式/单位 | 释义 | 证据 |
|---|---|---|---|---|---|
| `data.list[].billNo` | string | 收款流水单号 | 单号 | 收款单业务编号 | 非空响应 + 表格 `prop` |
| `data.list[].billDate` | string | 收款时间 | 日期时间 | 收款单日期 | 非空响应 + 表格 `prop` |
| `data.list[].contactName` | string | 客户名称 | 文本 | 付款客户名称 | 非空响应 + 表格 `prop` |
| `data.list[].amount` | numeric string | 收款金额 | 元 | 本单收款金额 | 非空响应 + 表格 `prop` |
| `data.list[].totalDiffAmount` | numeric string | 优惠金额 | 元 | 本单折让/优惠金额 | 非空响应 + 表格 `prop` |
| `data.list[].transTypeName` | string | 收款类型 | 文本 | 收款业务类型显示名 | 非空响应 + 表格 `prop` |
| `data.list[].userName` | string/可空 | 收款人 | 文本 | 收款操作人员 | 非空响应 + 表格 `prop` |
| `data.list[].srcOrderNo` | string/可空 | 关联单号 | 单号 | 关联来源单号 | 非空响应 + 表格 `prop` |
| `data.list[].wayName` | string/可空 | 结算方式 | 文本 | 结算方式显示名 | 非空响应 + 表格 `prop` |
| `data.list[].accName` | string/可空 | 结算账户 | 文本 | 收款账户名称 | 非空响应 + 表格 `prop` |
| `data.list[].billStatus` | string | 状态 | 后端状态代码 | 响应原始状态；请求页签使用 `ALL/SUBMIT/CONFIRM/CANCEL`，两套值不可直接混用 | 非空响应 + 模板渲染 |
| `data.list[].billStatusName` | string/可空 | 状态 | 文本 | 后端返回的状态显示名 | 非空响应 |
| `data.list[].checkTime` | string/可空 | 确认时间 | 日期时间 | 财务确认时间 | 非空响应 + 表格 `prop` |
| `data.list[].checkName` | string/可空 | 确认人 | 文本 | 财务确认人员 | 非空响应 + 表格 `prop` |
| `data.list[].description` | string/可空 | 备注 | 文本 | 收款单备注 | 非空响应 + 表格 `prop` |

页面的“收款”“批量确认”“财务确认”“撤销”等按钮均会改变业务或资金状态，禁止调用。

## 经营报表（日/月经营数据）

证据等级：A。日报、月报页签的真实请求、非空响应、查询参数、jqGrid `colModel` 和全部主表列绑定均已确认。

日报：

```http
GET /report/getDayReport?action=getDayReport&beginDate=<YYYY-MM-DD>&endDate=<YYYY-MM-DD>&_search=false&nd=<timestamp>&rows=3000&page=1&sidx=date&sord=desc
```

月报：

```http
GET /report/getMonthReport?action=getMonthReport&beginDate=<YYYY-MM-01>&endDate=<YYYY-MM-01>&_search=false&nd=<timestamp>&rows=3000&page=1&sidx=date&sord=desc
```

| UI 筛选项 | 请求参数 | 类型 | 默认值 | 释义 | 证据 |
|---|---|---|---|---|---|
| 报表页签 | URL / `action` | enum | `getDayReport` 日报、`getMonthReport` 月报 | 决定日/月接口和日期粒度 | 页签 + 查询代码 + 抓包 |
| 日报日期 | `beginDate` / `endDate` | `YYYY-MM-DD` | 当月 1 日 / 当前日 | 日经营数据日期范围 | 日期控件 + 抓包 |
| 月报月份 | `beginDate` / `endDate` | `YYYY-MM-01` | 当年 1 月 / 当前月 | 月控件选择 `YYYY-MM`，请求统一补 `-01` | 查询代码 + 抓包 |
| jqGrid 查询标志 | `_search` | boolean-like string | `false` | jqGrid 固定查询参数 | 抓包 |
| 防缓存值 | `nd` | timestamp | 动态 | jqGrid 防缓存时间戳 | 抓包 |
| 页码/页大小 | `page` / `rows` | integer | `1` / `3000` | 一次最多 3000 行 | jqGrid 配置 + 抓包 |
| 排序 | `sidx` / `sord` | string | `date` / `desc` | 后端排序字段和方向 | 抓包 |

响应外层为 `status:number`、`msg:string`、`data.rows[]` 和 `data.userdata`。`rows[]` 是分日/分月行；`userdata` 是 jqGrid 页脚汇总对象，键名与可汇总列相同。当前非空样本中金额和数量均为 number，`kzProfitRate`、`profit_rate` 为百分比字符串，`remark` 为 nullable string。

| 表格列 | 日报响应字段 | 月报响应字段 | 类型/格式 | 释义 |
|---|---|---|---|---|
| 统计日期/月份 | `dw_billdate` | `dw_month` | string，日期/月 | 统计周期 |
| 销售收款/业务收款 | `ywsk_fee` | `ywsk_fee` | number，元 | 销售或业务收款金额 |
| 调拨收款 | `dbsk_fee` | `dbsk_fee` | number，元 | 调拨业务收款 |
| 其他收款 | `qtsk_fee` | `qtsk_fee` | number，元 | 其他业务收款 |
| 合计收款 | `hjsk_fee` | `hjsk_fee` | number，元 | 各类收款合计 |
| 采购付款 | `cgfk_fee` | `cgfk_fee` | number，元 | 采购业务付款 |
| 调拨付款 | `dbfk_fee` | `dbfk_fee` | number，元 | 调拨业务付款 |
| 其他付款 | `qtfk_fee` | `qtfk_fee` | number，元 | 其他业务付款 |
| 合计付款 | `hjfk_fee` | `hjfk_fee` | number，元 | 各类付款合计 |
| 出库单数 | `ckds` | `ckds` | number，笔 | 销售出库单数量 |
| 现金销售额 | `cash_fee` | `cash_fee` | number，元 | 现金结算销售额 |
| 挂账单数 | `gzds` | `gzds` | number，笔 | 挂账销售单数量 |
| 挂账销售额 | `credit_fee` | `credit_fee` | number，元 | 挂账销售金额 |
| 调拨销售额 | `dbck_fee` | `dbck_fee` | number，元 | 调拨出库销售额 |
| 销退单数 | `xtds` | `xtds` | number，笔 | 销售退货单数量 |
| 销退金额 | `xt_fee` | `xt_fee` | number，元 | 销售退货金额 |
| 合计销售额 | `sale_fee` | `sale_fee` | number，元 | 综合销售额 |
| 快准商品-采购单数 | `kz_cgds` | `kz_cgds` | number，笔 | 快准商品采购单数 |
| 快准商品-采购金额 | `kz_cg_fee` | `kz_cg_fee` | number，元 | 快准商品采购金额 |
| 快准商品-入库金额 | `kz_rk_fee` | `kz_cgrk_fee` | number，元 | 快准商品采购入库金额；日/月接口字段不同 |
| 快准商品-采购退货单数 | `kz_thds` | `kz_cgckds` | number，笔 | 快准商品采购退货数量 |
| 快准商品-采购退货金额 | `kz_th_fee` | `kz_cgck_fee` | number，元 | 快准商品采购退货金额 |
| 第三方商品-入库单数 | `other_rkds` | `other_cgrkds` | number，笔 | 三方商品入库单数 |
| 第三方商品-入库金额 | `other_rk_fee` | `other_cgrk_fee` | number，元 | 三方商品入库金额 |
| 第三方商品-采购退货单数 | `other_thds` | `other_cgckds` | number，笔 | 三方商品采购退货单数 |
| 第三方商品-采购退货金额 | `other_th_fee` | `other_cgck_fee` | number，元 | 三方商品采购退货金额 |
| 合计采购额 | `hj_cg_fee` | `hj_cg_fee` | number，元 | 快准与三方采购额合计 |
| 合计采购入库金额 | `hj_rk_fee` | `hj_cgrk_fee` | number，元 | 采购入库金额合计 |
| 合计采退金额 | `hj_ct_fee` | `hj_ct_fee` | number，元 | 采购退货金额合计 |
| 快准商品-销售额 | `kzSaleFee` | `kzSaleFee` | number，元 | 快准商品销售额 |
| 快准商品-销售成本 | `kzCostFee` | `kzCostFee` | number，元 | 快准商品销售成本 |
| 快准商品-销售毛利 | `kzProfit` | `kzProfit` | number，元 | 快准商品销售毛利 |
| 快准商品-毛利率 | `kzProfitRate` | `kzProfitRate` | string，百分比 | 快准商品毛利率 |
| 合计-销售成本 | `cost_fee` | `cost_fee` | number，元 | 全部商品销售成本 |
| 合计-销售毛利 | `profit` | `profit` | number，元 | 全部商品销售毛利 |
| 合计-毛利率 | `profit_rate` | `profit_rate` | string，百分比 | 综合毛利率 |
| 期初库存结存 | `qc_store_fee` | — | number，元 | 日报期初库存金额 |
| 期末库存结存 | `store_fee` | `avg_store_fee` | number，元 | 日报期末库存；月报字段名为平均/期末库存口径 |
| sid | `station_code` | `station_code` | string | 服务站编码 |
| 月份天 | — | `dw_month_d` | string | 月报内部月份天标识 |
| 备注 | `remark` | `remark` | nullable string | 报表备注 |

非空响应还包含不直接展示为当前主表列的辅助核算字段：`station_name` 服务站名称；`cashds` 现金单数；`xssk_fee`、`yssk_fee`、`qk_fee`、`ystk_fee`、`xstk_fee` 等收付款拆分；`ck_num` / `ck_fee`、`qtrk_num` / `qtrk_fee`、`qtck_num` / `qtck_fee` 等出入库数量与金额；`inventory_surplus_num` / `inventory_surplus_fee`、`inventory_losses_num` / `inventory_losses_fee` 盘盈盘亏；`big_sale_num` / `big_sale_fee` / `big_sale_cost`、`big_return_num` / `big_return_fee` / `big_return_cost` 大客户销售及退货；以及 `kz_*`、`other_*`、`dbck_*` 的成本、毛利和毛利率拆分。它们当前没有独立可见列绑定，接入时不应把字段名直译结果冒充正式财务口径。

页面“导出”会触发文件生成，不属于查询 Agent 能力；只调用上述两个 JSON 查询接口，并限制日期范围。

## 应收账款总表

证据等级：FR。入口、FineReport 会话请求、参数提交和渲染列均已确认；它不是稳定业务 REST，不能直接加入 Agent HTTP 工具清单。

```http
GET /report/account_receive_summary
```

当前页面在登录态下实际把菜单 iframe 导向：

```http
GET https://bi.kzmall.cc/webroot/decision/view/report?viewlet=<report>&station_code=<stationCode>&...
```

参数提交和取页协议：

```http
POST https://bi.kzmall.cc/webroot/decision/view/report?op=fr_dialog&cmd=parameters_d
Content-Type: application/x-www-form-urlencoded

__parameters__=<json>
```

```http
GET https://bi.kzmall.cc/webroot/decision/view/report?op=page_content&pn=1&...
```

| UI 筛选项 | `__parameters__` 键 | 类型/默认值 | 释义 | 证据 |
|---|---|---|---|---|
| 开始日期 | `[5f00][59cb][65e5][671f]` | 日期字符串 | FineReport 编码键解码后为“开始日期” | 参数 POST + 报表控件 |
| 结束日期 | `[7ed3][675f][65e5][671f]` | 日期字符串 | FineReport 编码键解码后为“结束日期” | 参数 POST + 报表控件 |
| 客户 | `[5ba2][6237]` | string/ID | FineReport 编码键解码后为“客户”；空表示全部 | 参数 POST + 报表控件 |

请求体同时带对应的 `LABEL...` 键。`viewlet`、临时会话参数、页面尺寸参数和 `station_code` 都由当前报表会话生成，不能硬编码或跨会话复用。

该协议返回报表页面片段而不是业务 JSON。当前渲染列已确认：`客户`、`应收余额`、`客户ID`。因此可以描述报表输入/输出，但不能声称存在 `rows[]` 或稳定响应字段名。

## 应收账款明细表

证据等级：FR。当前 UI 同样进入 FineReport 会话；参数提交、列标题和旧版页面的字段绑定均已确认，但没有稳定的业务 JSON 响应契约。

```http
GET /report/account_proceeds_detail_new?action=detail
```

当前 UI 使用与“应收账款总表”相同的 `view/report → parameters_d → page_content` 协议，`__parameters__` 键仍是开始日期、结束日期和客户三项。渲染列为：客户、单据日期、单据编号、业务类型、应收账款、收款、收款优惠、应收余额。

页面保留的旧版 jqGrid bundle 为这些列提供了逻辑字段绑定，但当前 FineReport `page_content` 不以这些名称返回 JSON：

| 逻辑字段 | 类型/可空 | 渲染列 | 释义 | 证据 |
|---|---|---|---|---|
| `buName` | 待普通 JSON 响应确认 | 客户 | 客户显示名称 | 旧版 `colModel` + 当前报表列 |
| `date` | 待确认 | 单据日期 | 业务单据日期 | 旧版 `colModel` + 当前报表列 |
| `billNo` | 待确认 | 单据编号 | 业务单据号 | 旧版 `colModel` + 当前报表列 |
| `transType` | 待确认 | 业务类型 | 单据业务类型 | 旧版 `colModel` + 当前报表列 |
| `income` | 待确认 | 应收账款 | 应收增加额 | 旧版 `colModel` + 当前报表列 |
| `expenditure` | 待确认 | 收款 | 收款/冲减应收金额 | 旧版 `colModel` + 当前报表列 |
| `discount` | 待确认 | 收款优惠 | 收款折让金额 | 旧版 `colModel` + 当前报表列 |
| `balance` | 待确认 | 应收余额 | 单据后的应收余额 | 旧版 `colModel` + 当前报表列 |
| `billId` / `billTypeNo` | 待确认 | 隐藏 | 原系统详情跳转使用的单据 ID/类型 | 旧版隐藏列 |

旧版 bundle 中还保留 `GET /report/fundBalance_detail?action=detail` 及 `beginDate`、`endDate`、`accountNo`、`rows=3000` 等 jqGrid 契约，但当前桌面菜单没有触发该接口，所以它只能作为兼容线索，不能替代当前 FineReport 协议生成可执行工具。

## 客户应收余额表

证据等级：A。页面“查询”产生的真实请求、非空响应、动态收款列、筛选枚举和 jqGrid 字段映射均已确认。

```http
GET /report/customer_balance_receivable?action=list
```

主查询：

```http
GET /Report/getCustomerBalance?action=detail&type=0&payStatus=-1&buId=-1&beginDate=<YYYY-MM-DD>&endDate=<YYYY-MM-DD>
```

| UI 筛选项 | 请求参数 | 类型 | 默认值/枚举 | 释义 | 证据 |
|---|---|---|---|---|---|
| 开始/结束日期 | `beginDate` / `endDate` | `YYYY-MM-DD` | 当月第一天 / 当前日 | 统计期间 | 页面默认值 + 抓包 |
| 客户 | `buId` | string/number | `-1` 全部 | 客户内部 ID | 客户选择器 + 查询对象 |
| 收款拆分类型 | `type` | integer-like string | `0` 支付方式、`1` 账户 | 动态金额列按支付方式或账户拆分 | 下拉枚举 + 抓包 |
| 收款状态 | `payStatus` | integer-like string | `-1` 全部、`1` 全部收款、`2` 欠款 | 客户应收结清状态 | 下拉枚举 + 抓包 |

响应外层为 `status:number`、`msg:string`、`data:object`。`data.rows[]` 是非空列表，`data.colIndex[]` 给出动态金额字段名，`data.colNames[]` 给出对应中文列名，`data.total` 给出同口径合计。

| 响应字段/路径 | 类型/可空 | 表格列 | 格式/单位 | 释义 | 证据 |
|---|---|---|---|---|---|
| `data.rows[].buId` | string | 隐藏/行上下文 | ID | 客户内部 ID | 非空响应 |
| `data.rows[].buName` | string | 修理厂客户 | 文本 | 客户显示名称 | 非空响应 + `colModel` |
| `data.rows[].cCategoryName` | string | 客户类别 | 文本 | 客户分类名称 | 非空响应 + `colModel` |
| `data.rows[].fPreAmount` | number | 期初应收余额 | 元 | 统计期开始前的应收余额 | 非空响应 + `colModel` |
| `data.rows[].salesAmount` | number | 本期销售金额 | 元 | 期间销售金额 | 非空响应 + `colModel` |
| `data.rows[].preAmount` | number | 本期应收余额 | 元 | 本期新增/形成的应收口径 | 非空响应 + `colModel` |
| `data.rows[].lPreAmount` | number | 期末应收余额 | 元 | 统计期末应收余额 | 非空响应 + `colModel` |
| `data.rows[].amount_<paymentMethodId>` | number | 动态支付方式/账户列 | 元 | 字段名来自 `data.colIndex[]`，中文标题来自同位置的 `data.colNames[]` | 非空响应 + 动态列逻辑 |
| `data.rows[].reAmount` | number | 小计/本期收款金额 | 元 | 动态收款列合计；没有动态列时标题为“本期收款金额” | 非空响应 + 动态列逻辑 |
| `data.rows[].diffAmount` | number | 本期折让金额 | 元 | 期间收款折让金额 | 非空响应 + `colModel` |

`data.total` 含 `amount_<paymentMethodId>`、`reAmount`、`salesAmount`、`diffAmount`、`preAmount`、`fPreAmount`、`lPreAmount` 的数值合计。

## 客户对账单

证据等级：C。主查询路径、全部请求参数、业务类别枚举、响应容器与列字段已由当前 bundle 确认；UI 强制选择真实客户，本轮没有代选，主查询未通过正常条件实际触发，因此不得生成 HTTP 工具，字段类型/可空性也待非空响应确认。

```http
GET /report/customers_reconciliation_new?action=customers_reconciliation_new
```

主查询契约：

```http
GET /report/customerBalance_detail?action=detail&beginDate=<YYYY-MM-DD>&endDate=<YYYY-MM-DD>&customerId=<id>&customerName=<customer>&showDetail=true&type=&_search=false&nd=<timestamp>&rows=3000&page=1&sidx=date&sord=desc
```

| UI 筛选项 | 请求参数 | 类型 | 默认值/枚举 | 释义 | 证据 |
|---|---|---|---|---|---|
| 客户（必选） | `customerId` / `customerName` | string/number + string | 未选时 UI 拒绝查询 | 客户 ID 和显示名 | 客户组合框 + 查询处理器 |
| 开始/结束日期 | `beginDate` / `endDate` | `YYYY-MM-DD` | 当前系统日期范围 | 对账期间 | 日期控件 + 查询对象 |
| 显示明细 | `showDetail` | boolean-like string | 当前页面默认勾选，查询值 `true`；取消为 `false` | 是否显示商品级明细列 | 复选框 + 查询处理器 |
| 业务类别 | `type` | comma-separated string | 空全部；`1` 普通销售、`2` 普通铺货、`3` 微仓铺货、`4` 销退（人工）、`5` 销退（自动） | 可多选业务类型 | Vue 选项 + 查询处理器 |
| jqGrid 分页/排序 | `rows` / `page` / `sidx` / `sord` | integer/integer/string/string | `3000` / `1` / `date` / `desc` | 当前页最多 3000 行 | grid 配置 |

响应读取契约为 `data.list[]`、`data.total`。下列字段均由 `colModel` 与当前表头确认，类型/可空性待非空响应补证：

| 响应字段 | 表格列 | 格式/单位 | 释义 |
|---|---|---|---|
| `date` | 单据日期 | 日期 | 业务单据日期 |
| `billNo` | 单据编号 | 单号 | 销售/收款等业务单号 |
| `transType` | 业务类别 | 文本 | 业务类型显示值 |
| `skuStandName` | 商品名称 | 文本 | 商品标准名称 |
| `categoryName` | 商品分类 | 文本 | 商品分类名称 |
| `carModel` | 备注车型 | 文本 | 关联车型备注 |
| `unit` | 单位 | 文本 | 计量单位 |
| `qty` | 数量 | 数量 | 商品数量 |
| `price` | 商品单价 | 元 | 商品单价 |
| `hangDisAmount` | 商品优惠 | 元 | 行级商品优惠 |
| `totalAmount` | 商品小计 | 元 | 行级金额小计 |
| `disAmount` | 整单折扣额 | 元 | 整单折扣分摊/显示金额 |
| `amount` | 应收金额 | 元 | 本行/单据应收金额 |
| `rpAmount` | 实际收款金额 | 元 | 已实际收款金额 |
| `diffAmount` | 折让金额 | 元 | 收款折让金额 |
| `inAmount` | 应收款余额 | 元 | 业务发生后的应收余额 |
| `billId` / `billType` | 隐藏 | ID/类型 | 详情跳转上下文；查询 Agent 不触发行内跳转 |

## 供应商对账单

证据等级：C。主查询路径、参数、响应容器和列字段已由当前 bundle 确认；UI 强制选择真实供应商，本轮没有代选，主查询未通过正常条件实际触发，因此不得生成 HTTP 工具，字段类型/可空性待补证。

```http
GET /report/suppliers_reconciliation_new?action=
```

主查询契约：

```http
GET /report/supplierBalance_detail?action=detail&beginDate=<YYYY-MM-DD>&endDate=<YYYY-MM-DD>&supplierId=<id>&supplierName=<supplier>&showDetail=false&_search=false&nd=<timestamp>&rows=3000&page=1&sidx=date&sord=desc
```

| UI 筛选项 | 请求参数 | 类型 | 默认值 | 释义 | 证据 |
|---|---|---|---|---|---|
| 供应商（必选） | `supplierId` / `supplierName` | string/number + string | 未选时 UI 拒绝查询 | 供应商 ID 和显示名 | 供应商组合框 + 查询处理器 |
| 开始/结束日期 | `beginDate` / `endDate` | `YYYY-MM-DD` | 当前系统日期范围 | 对账期间 | 日期控件 + 查询对象 |
| 显示明细 | `showDetail` | boolean-like string | `false`；勾选为 `true` | 是否显示商品级明细列 | 复选框 + 查询处理器 |
| jqGrid 分页/排序 | `rows` / `page` / `sidx` / `sord` | integer/integer/string/string | `3000` / `1` / `date` / `desc` | 当前页最多 3000 行 | grid 配置 |

响应读取契约为 `data.list[]`、`data.total`。字段类型/可空性待非空响应补证：

| 响应字段 | 表格列 | 格式/单位 | 释义 |
|---|---|---|---|
| `date` | 单据日期 | 日期 | 采购/付款业务日期 |
| `billNo` | 单据编号 | 单号 | 业务单号 |
| `transType` | 业务类别 | 文本 | 业务类型显示值 |
| `invNo` | 原厂商产品码 | 编码 | 厂商产品编号 |
| `invName` | 商品名称 | 文本 | 商品显示名称 |
| `skuId` | 物料编码 | 编码 | 物料编码 |
| `spec` | 规格型号 | 文本 | 商品规格 |
| `unit` | 单位 | 文本 | 计量单位 |
| `qty` | 数量 | 数量 | 商品数量 |
| `price` | 单价 | 元 | 采购单价 |
| `totalAmount` | 采购金额 | 元 | 行级采购金额 |
| `disAmount` | 优惠金额 | 元 | 采购优惠金额 |
| `amount` | 应付金额 | 元 | 本行/单据应付金额 |
| `rpAmount` | 实际付款金额 | 元 | 已实际付款金额 |
| `inAmount` | 应付款余额（明细列） | 元 | 业务发生后的应付余额 |
| `billId` / `billType` | 隐藏 | ID/类型 | 详情跳转上下文；查询 Agent 不触发行内跳转 |

## 报表接入限制汇总

- 应收账款总表和明细表已经抓到 FineReport 会话协议，但该协议依赖 `viewlet`、报表会话与页面参数，标记为 FR，不生成普通 HTTP 工具。
- 客户应收余额是 A 级普通查询接口，可以进入 HTTP 工具清单。
- 客户/供应商对账单是 C 级：bundle 已确认路径、参数和列字段，但主查询没有在正常必选条件下实际触发；取得只读真实请求及脱敏非空响应或正式 schema 后再升级证据等级。

## 明确排除的财务写流程

收款单、付款单、调拨收付款单、三方成本调整单、其它收入单、其它支出单属于资金或成本变更流程，禁止查询 Agent 调用。列表页中的确认、审核、作废、编辑、删除、导出也不属于查询接口。
