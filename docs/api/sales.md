# 销售查询接口

本页涉及的客户、门店、员工、用户、商品、仓库、活动、微仓、车型及大客户分类参数，其选项接口和精确取值字段统一见[查询参数 ID / 编码来源](./lookups.md)。同名 `salesId`、`goodsNo` 在不同页面可能读取不同字段，必须按消费页面匹配。

> 本文档只收录列表、库存和报表查询。页面中的开单、收款、发货、退款、调拨、审核、编辑、复制、删除和导出等动作均不在查询 Agent 的可调用范围内。

## 销售单管理

证据等级：A。主列表请求、待出库数量辅助查询、非空响应行以及 UI 条件/表格列映射均已确认。

```http
GET /scm/invSa?action=getSalesOrderlist&matchCon=&hxState=&beginDate=<YYYY-MM-DD>&endDate=<YYYY-MM-DD>&salesId=&rows=50&page=1&sord=&sidx=&buId=&storeId=&billNo_type=&delieverId=&wayId=&payType=&billStatus=all&billNo_source=&userId=&activity_id=&vin=
```

```http
POST /scm/invSa/getSaleWaitOutNum
Content-Type: application/x-www-form-urlencoded

action=getSalesOrderlist&matchCon=&hxState=&beginDate=<YYYY-MM-DD>&endDate=<YYYY-MM-DD>&salesId=&sord=&sidx=&buId=&storeId=&billNo_type=&delieverId=&wayId=&payType=&billStatus=all&billNo_source=&userId=&activity_id=&vin=
```

`getSaleWaitOutNum` 只用于页面待出库角标，主列表实现不依赖它；本轮尚未沉淀其独立成功谓词和响应字段，因此不把它注册为 Agent 工具。

| UI 筛选项 | 请求参数 | 类型 | 默认值/枚举 | 释义 | 证据 |
|---|---|---|---|---|---|
| 客户名称 | `buId` | string/number | 空 | 客户内部 ID | 查询对象 + 抓包 |
| 开始/结束时间 | `beginDate` / `endDate` | `YYYY-MM-DD` | 页面日期范围 | 开单时间范围 | 查询对象 + 抓包 |
| 综合搜索 | `matchCon` | string | 空 | 客户、单号或整单备注 | UI + 查询对象 |
| 状态页签 | `billStatus` | string | `all`；另有页面状态值 | 销售单状态 | 查询对象 + 抓包 |
| 订单类型 | `billNo_type` | number/string | 空；`0` 销售、`1` 铺货、`2` 微仓铺货 | 销售订单类型 | 组件枚举 |
| 销售门店 | `storeId` | string/number | 空 | `/basedata/Stores/getStoreIdName` 返回的 `data[].id` | 查询对象 + [来源映射](./lookups.md#门店) |
| 销售员 | `salesId` | string/number | 空 | `/basedata/employee?action=list` 返回的 `data.items[].id` | 查询对象 + [来源映射](./lookups.md#员工) |
| 送货员 | `delieverId` | string/number | 空 | 与销售员同源，取员工 `id`；沿用后端拼写 | 查询对象 + [来源映射](./lookups.md#员工) |
| 收款方式 | `payType` | string/number | 空；`0` 挂账、`1` 现金 | 订单收款方式 | 组件枚举 |
| 结算方式 | `wayId` | string/number | 空 | `/basedata/assist/getAssistList` 的 `PayMethod` 条目 `id` | 查询对象 + [来源映射](./lookups.md#结算方式) |
| 开单员 | `userId` | string/number | 空 | `/scm/invSa/SelectQueryAllUser` 返回的 `userId` | 查询对象 + [来源映射](./lookups.md#登录用户操作用户) |
| 数据来源 | `billNo_source` | string/number | 空；`0` 销售开单、`1` ERP 订单、`8` E 站商城、`10` E 站维修、`14` E 站活动、`16` AI 助手订单、`17` E 站 APP | 订单来源 | 组件枚举 |
| VIN | `vin` | string | 空 | 关联车辆 VIN | 查询对象 |
| 活动 ID | `activity_id` | string/number | 空 | E 站活动列表 `data.data[].id` | 查询对象 + [来源映射](./lookups.md#e-站活动) |
| 核销状态（当前 UI 已注释） | `hxState` | string/number | 空 | 兼容历史查询对象；当前请求仍保留 | 模板 + 抓包 |
| 页大小/页码 | `rows` / `page` | integer | `50` / `1`；页大小可选 50、100、200/300 | jqGrid 分页 | 查询对象 + 抓包 |
| 排序字段/方向 | `sidx` / `sord` | string | 空 | 客户端排序参数 | 查询对象 + 抓包 |

成功条件为 `status === 200`；失败时读取 `msg` 并 fail closed。响应外层包含 `status`、`msg`、`totalAmount`、`outAmount`、`payment1`、`Amount`、`data` 和 `editDesc`；可靠分页路径为 `data.page:number`、`data.records:number`、`data.total:number`，列表行为 `data.rows[]`。`data.total` 是总页数，按 `page <= data.total` 继续，每页最多 200。

| 响应字段/路径 | 类型/可空 | 表格列 | 格式/单位 | 释义 | 证据 |
|---|---|---|---|---|---|
| `data.rows[].contactName` | string/可空 | 客户名称 | 文本 | 客户显示名称 | 非空响应 + 表格 `prop` |
| `data.rows[].billNo` | string | 销售单号 | 单号 | 销售单唯一业务编号 | 非空响应 + 表格 `prop` |
| `data.rows[].activity_id` | string/number/可空 | 活动 ID | ID | 关联 E 站活动 | 非空响应 + scoped slot |
| `data.rows[].createTime` | string | 开单时间 | 日期时间 | 销售单创建时间 | 非空响应 + 表格 `prop` |
| `data.rows[].storeName` | string/可空 | 销售门店 | 文本 | 开单门店 | 非空响应 + 表格 `prop` |
| `data.rows[].totalAmount` | numeric string/number | 订单金额 | 元 | 优惠前订单金额 | 非空响应 + 表格 `prop` |
| `data.rows[].amount` | numeric string/number | 出库金额 | 元 | 已出库对应金额 | 非空响应 + 表格 `prop` |
| `data.rows[].rpAmount` | numeric string/number | 已收金额 | 元 | 已收款金额 | 非空响应 + 表格 `prop` |
| `data.rows[].disAmount` | numeric string/number | 优惠金额 | 元 | 整单优惠金额 | 非空响应 + 表格 `prop` |
| `data.rows[].disRate` | numeric string/number | 优惠率 | `%` | 整单优惠比例 | 非空响应 + 表格 `prop` |
| `data.rows[].billStatusName` | string | 订单状态 | 文本 | 后端状态显示名 | 非空响应 + scoped slot |
| `data.rows[].hxStateCodeName` | string/可空 | 收款状态 | 文本 | 收款/核销状态显示名 | 表格 `prop`；类型待更多响应复核 |
| `data.rows[].billNo_typeName` | string | 订单类型 | 文本 | 销售、铺货等显示名 | 非空响应 + 表格 `prop` |
| `data.rows[].payTypeName` | string | 收款方式 | 文本 | 挂账/现金显示名 | 非空响应 + 表格 `prop` |
| `data.rows[].way` | string/可空 | 结算方式 | 文本 | 结算方式显示名 | 非空响应 + 表格 `prop` |
| `data.rows[].printing_times` | integer/string | 打印次数 | 次 | 打印计数 | 非空响应 + 表格 `prop` |
| `data.rows[].tyQuantity` | integer/string | 出库次数 | 次 | 出库操作计数 | 非空响应 + 表格 `prop` |
| `data.rows[].salesName` | string/可空 | 销售员 | 文本 | 销售人员名称 | 非空响应 + 表格 `prop` |
| `data.rows[].userName` | string/可空 | 开单员 | 文本 | 制单人员名称 | 非空响应 + 表格 `prop` |
| `data.rows[].sourceTypeName` | string/可空 | 数据来源 | 文本 | 订单来源显示名 | 非空响应 + 表格 `prop` |
| `data.rows[].delieverName` | string/可空 | 送货员 | 文本 | 送货人员名称 | 非空响应 + 表格 `prop` |
| `data.rows[].vins` | string/array-like/可空 | 关联 VIN 码 | 文本 | 一个或多个关联 VIN | 非空响应 + 表格 `prop` |
| `data.rows[].elapsedTime` | string/number/可空 | 消耗时间 | 页面格式 | 从创建到当前业务节点的耗时 | 表格 `prop`；类型待更多响应复核 |
| `data.rows[].description` | string/可空 | 备注 | 文本 | 整单备注 | 非空响应 + 表格 `prop` |

## 出库单管理

证据等级：A。页面正常加载/查询产生的 POST 请求、非空响应、查询对象和全部主表列绑定均已确认。

```http
POST /scm/InvSa/outboundList
Content-Type: application/x-www-form-urlencoded

buId=&orderType=&payState=&uid=&checkId=&matchCon=&storeId=&salesId=&delieverId=&billStatus=0&transType=150601&page=1&rows=50&sord=&sidx=&beginDate=<YYYY-MM-DD>&endDate=<YYYY-MM-DD>&cancel_beg_time=&cancel_end_time=&cancel_uid=&vin=
```

`billNo_source` 是选择“单据来源”后动态加入的可选参数，默认空条件请求中不存在。

| UI 筛选项 | 请求参数 | 类型 | 默认值/枚举 | 释义 | 证据 |
|---|---|---|---|---|---|
| 客户 | `buId` | string/number | 空 | 客户内部 ID | 查询对象 + 抓包 |
| 开始/结束日期 | `beginDate` / `endDate` | `YYYY-MM-DD` | 页面日期范围 | 出库日期范围 | 查询对象 + 抓包 |
| 综合搜索 | `matchCon` | string | 空 | 客户、出库单号、销售单号或整单备注 | UI + 查询对象 |
| 状态页签 | `billStatus` | string/number | `0` | 出库单状态页签值 | 页签 + 抓包 |
| 固定业务类型 | `transType` | integer-like string | `150601` | 销售出库 | 查询对象 + 抓包 |
| 订单类型 | `orderType` | string/number | 空全部 | 原销售订单类型 | 查询对象 |
| 收款状态 | `payState` | string/number | 空全部 | 出库单收款/核销状态 | 查询对象 |
| 销售门店 | `storeId` | string/number | 空 | 门店 ID | 查询对象 |
| 销售员 | `salesId` | string/number | 空 | 销售人员 ID | 查询对象 |
| 送货员 | `delieverId` | string/number | 空 | 送货人员 ID，沿用后端拼写 | 查询对象 |
| 出库人 | `uid` | string/number | 空 | 出库操作人员 ID | 查询对象 |
| 核销人 | `checkId` | string/number | 空 | 核销人员 ID | 查询对象 |
| 撤销时间 | `cancel_beg_time` / `cancel_end_time` | datetime/date string | 空；非空线格式未闭环，Agent 暂不暴露 | 撤销时间范围 | 高级筛选绑定 |
| 撤销人 | `cancel_uid` | string/number | 空 | 撤销人员 ID | 高级筛选绑定 |
| VIN | `vin` | string | 空 | 关联车辆 VIN | 查询对象 |
| 单据来源 | `billNo_source` | string/number | 空；`0` 销售开单、`1` ERP、`8` E 站商城、`10` E 站维修、`14` E 站活动、`16` AI 助手、`17` E 站 APP | 选择后才动态加入请求 | 模板枚举 + 查询对象 |
| 页码/页大小 | `page` / `rows` | integer | `1` / `50` | 分页 | 抓包 |
| 排序 | `sidx` / `sord` | string | 空 | 排序字段与方向 | 抓包 |

成功条件为 `status === 200`；失败时读取 `msg` 并 fail closed。响应外层为 `records:string`、`total:number`、`status:number`、`msg:string`、`data:array`、`totalAmount:object`、`editDesc:number`。列表直接位于 `data[]`，不是 `data.rows[]`。

| 响应字段/路径 | 类型/可空 | 表格列 | 格式/单位 | 释义 | 证据 |
|---|---|---|---|---|---|
| `data[].id` | string | 隐藏 | ID | 出库单行主键 | 非空响应 |
| `data[].billNo` | string | 出库单号 | 单号 | 出库单业务编号 | 非空响应 + `prop` |
| `data[].createTime` | string | 出库时间 | 日期时间 | 出库单创建/出库时间 | 非空响应 + `prop` |
| `data[].outQty` | number | 出库数量 | 数量 | 本单出库商品数量合计 | 非空响应 + `prop` |
| `data[].amount` | string | 出库金额 | 元 | 本单出库金额 | 非空响应 + `prop` |
| `data[].rpAmount` | string | 已收金额 | 元 | 已收款金额 | 非空响应 + `prop` |
| `data[].buName` | string | 客户名称 | 文本 | 客户显示名称 | 非空响应 + `prop` |
| `data[].storeName` | string | 销售门店 | 文本 | 销售门店名称 | 非空响应 + `prop` |
| `data[].billStatus` | string | 状态上下文 | 状态码 | 原始单据状态 | 非空响应 |
| `data[].bill_status_name` | string | 订单状态 | 文本 | 单据状态显示名 | 非空响应 + `prop` |
| `data[].hxStateCode` | number | 收款状态 | 状态码 | 收款/核销状态编码 | 非空响应 + formatter |
| `data[].saleBillNo` | string | 销售单号 | 单号 | 关联销售单编号 | 非空响应 + `prop` |
| `data[].hasTime` | string/null | 核销时间 | 日期时间 | 核销完成时间 | 非空响应 + `prop` |
| `data[].printing_times` | string | 打印次数 | 次 | 打印计数 | 非空响应 + `prop` |
| `data[].sourceType` | string | 单据来源 | 枚举 | 来源编码/显示上下文 | 非空响应 + formatter |
| `data[].userName` | string | 出库人 | 文本 | 出库操作人员名称 | 非空响应 + `prop` |
| `data[].salesName` | string/null | 销售员 | 文本 | 销售人员名称 | 非空响应 + `prop` |
| `data[].delieverName` | string/null | 送货员 | 文本 | 送货人员名称 | 非空响应 + `prop` |
| `data[].thirdDelieverName` | string | 第三方配送方 | 文本 | 第三方配送服务名称 | 非空响应 + `prop` |
| `data[].thirdDelieverNo` | string | 配送单号 | 单号 | 第三方配送业务单号 | 非空响应 + `prop` |
| `data[].activity_id` | string | 活动 ID | ID | 关联活动 ID；模板列虽声明 `prop="billNo"`，实际 slot 显示该字段 | 非空响应 + scoped slot |
| `data[].vins` | string | VIN | 文本 | 关联 VIN 集合 | 非空响应 + `prop` |
| `data[].description` | string | 备注 | 文本 | 整单备注 | 非空响应 + `prop` |
| `data[].cancelTime` | null（当前样本） | 撤销时间 | 日期时间 | 撤销时间 | 非空响应 + 查询列契约 |
| `data[].cancel_uid` | string | 撤销人 ID | ID | 撤销人员内部 ID | 非空响应 |
| `data[].cancel_uname` | null（当前样本） | 撤销人 | 文本 | 撤销人员名称 | 非空响应 + 列契约 |
| `data[].cancel_reason` | string | 撤销原因 | 文本 | 撤销说明 | 非空响应 + 列契约 |

辅助/控制字段：`history_order:boolean` 历史单标志、`can_modify:boolean` 可修改标志、`canDelivery:boolean` 配送能力标志、`hasThirdPartyDeliveryOrder:boolean` 是否已有第三方配送单、`isFirstThirdPartyDelivery:boolean` 是否首次第三方配送、`saleOrId:string` 关联销售单 ID、`billNoType:string` 订单类型、`salesId:string` 销售员 ID、`delieverId:string` 送货员 ID、`uid:string` 出库人 ID、`checkId:string/null` 核销人 ID、`storeId:string` 门店 ID、`refund_bill_no:string` 关联退款单号。它们只用于列表上下文，查询 Agent 不据此触发收款、配送、修改、打印或其它行内动作。

## 销售退货单管理

证据等级：A。页面“查询”触发的主列表请求、62 行非空响应、jqGrid `colModel` 和页面表头均已确认。仅把列表读取作为查询能力；修改、复制、删除、审核、收款、打印、导入导出均不在 Agent 调用范围内。

```http
GET /scm/invSa?action=list&matchCon=&transType=150602&beginDate=<YYYY-MM-DD>&endDate=<YYYY-MM-DD>&_search=false&nd=<timestamp>&rows=100&page=1&sidx=&sord=asc&salesId=0&hxState=0&billNo_type=-1&returnType=
```

| UI 筛选项 | 请求参数 | 类型 | 默认值/枚举 | 释义 | 证据 |
|---|---|---|---|---|---|
| 固定查询动作 | `action` | string | `list` | 销售单/销售退货列表读取 | 抓包 + 查询配置 |
| 综合搜索 | `matchCon` | string | 空 | 单据号、客户名、备注或厂家产品码；当前输入框提示中“制单人”可作为页面显示文案，但脚本配置为厂家产品码 | UI + 查询配置 + 抓包 |
| 固定业务类型 | `transType` | number-like string | `150602` | 销售退货；同一列表脚本以 `150601` 查询销售单 | 页面入口 + 查询配置 + 抓包 |
| 单据日期 | `beginDate` / `endDate` | `YYYY-MM-DD` | 当前页面日期范围 | 退货单据日期起止范围 | UI + 查询配置 + 抓包 |
| 销售人员 | `salesId` | integer/string | `0`（未选择） | 销售人员内部 ID | 组合控件 + 查询动作 + 抓包 |
| 退款状态 | `hxState` | integer/string | `0`（全部）；`1` 未退款、`2` 部分退款、`3` 全部退款 | 用于过滤退货款处理状态；后端请求值沿用控件 ID | 组件枚举 + 抓包 |
| 订单类型 | `billNo_type` | integer-like string | `-1`（全部）；`0` 销售、`1` 铺货、`2` 微仓铺货 | 原销售订单类型。实际页面控件 ID 为 `saleType`，查询时写入该参数 | UI + 查询动作 + 抓包 |
| 退货类型 | `returnType` | integer-like string | 空；不良品退货为 `1`、普通退货为 `0` | 退货质量/普通退货筛选。UI 选项值会被脚本归一为后端 `1` 或 `0` | 组件枚举 + 查询配置 |
| jqGrid 查询开关 | `_search` | boolean-like string | `false` | jqGrid 默认查询标记 | 抓包 |
| 防缓存标记 | `nd` | integer-like string | `<timestamp>` | 前端生成的时间戳，不是业务条件 | 抓包 |
| 分页 | `rows` / `page` | integer | `100` / `1`；可选 100、200、500 | 每页条数和页码 | jqGrid 配置 + 抓包 |
| 排序 | `sidx` / `sord` | string | 空 / `asc` | jqGrid 排序字段与方向 | jqGrid 配置 + 抓包 |

成功条件为 `success === true && status === "success"`；失败时读取 `msg` 并 fail closed。响应外层为 `success:boolean`、`status:string`、`redirect:null`、`msg:string`、`data:object`；`data.page:number`、`data.records:string`、`data.total:number`、`data.rows:array`。`data.rows[]` 使用下表字段：

| 响应字段/路径 | 类型/可空 | 表格列 | 格式/单位 | 释义 | 证据 |
|---|---|---|---|---|---|
| `data.rows[].id` | string | 隐藏行 ID | ID | 退货单列表行主键 | 非空响应 |
| `data.rows[].salesId` | number | 隐藏 | ID | 销售人员内部 ID | 非空响应 |
| `data.rows[].billDate` | string | 单据日期 | 日期 | 退货单据日期 | 非空响应 + jqGrid `colModel` |
| `data.rows[].billNo` | string | 单据编号 | 单号 | 退货单业务编号 | 非空响应 + jqGrid `colModel` |
| `data.rows[].returnType` | string | 退货类型 | 文本/枚举 | 后端返回的退货类型显示值 | 非空响应 + jqGrid `colModel` |
| `data.rows[].salesName` | string/可空 | 销售人员 | 文本 | 销售人员显示名 | 非空响应 + jqGrid `colModel` |
| `data.rows[].contactName` | string | 客户 | 文本 | 客户显示名 | 非空响应 + jqGrid `colModel` |
| `data.rows[].storeName` | string/可空 | 门店 | 文本 | 销售门店显示名 | 非空响应 + jqGrid `colModel` |
| `data.rows[].customerFree` | numeric string | 客户承担费用 | 元 | 由客户承担的退货费用 | 非空响应 + `currency` 列格式 |
| `data.rows[].totalAmount` | number | 销售金额 | 元 | 退货关联销售金额 | 非空响应 + `currency` 列格式 |
| `data.rows[].disAmount` | numeric string | 优惠金额 | 元 | 退货关联订单优惠金额 | 非空响应 + `currency` 列格式 |
| `data.rows[].amount` | number | 应收金额 | 元 | 退货后应收/退款计算口径金额 | 非空响应 + `currency` 列格式 |
| `data.rows[].diffAmount` | number | 折损金额 | 元 | 退货折损金额 | 非空响应 + `currency` 列格式 |
| `data.rows[].rpAmount` | number | 已退款 | 元 | 已完成退款金额 | 非空响应 + `currency` 列格式 |
| `data.rows[].hxStateCode` | number | 退款状态 | 枚举 | `0` 未退款、`1` 部分退款、`2` 全部退款；这是列表显示编码，与筛选控件 ID 不同 | 非空响应 + formatter |
| `data.rows[].userName` | string | 制单人 | 文本 | 制单人员显示名 | 非空响应 + jqGrid `colModel` |
| `data.rows[].billNo_type` | string | 订单类型 | 文本 | 关联原订单的销售/铺货/微仓铺货类型 | 非空响应 + jqGrid `colModel` |
| `data.rows[].sourceType` | string | 订单来源 | 文本 | 若响应另带 `sourceTypeName` 则优先显示，否则 `2`/`3` 显示“订单生成”，其余显示“手工创建” | 非空响应 + formatter |
| `data.rows[].sourceOrder` | string | 订单编号 | 单号 | 来源订单编号 | 非空响应 + jqGrid `colModel` |
| `data.rows[].checkName` | null/可空 | 审核人（按配置隐藏） | 文本 | 审核人员显示名；样本中为 `null` | 非空响应 + jqGrid `colModel` |
| `data.rows[].description` | string | 备注 | 文本 | 单据备注 | 非空响应 + jqGrid `colModel` |
| `data.rows[].cancel_reason` | string | 退货原因 | 文本 | 退货原因说明 | 非空响应 + jqGrid `colModel` |
| `data.rows[].isDisable` | number | 隐藏 | 状态码 | 列表侧的不可编辑/关联收款限制标记；不得据此触发编辑 | 非空响应 + 隐藏列配置 |
| `data.rows[].checked` | number | 隐藏 | 状态码 | 单据审核状态控制标记 | 非空响应 + 加灰逻辑 |
| `data.rows[].billStatus` / `billStatusName` | string | 未显示 | 文本/状态 | 单据状态原始值及显示名，当前页面未配置为可见列 | 非空响应 |
| `data.rows[].totalQty` | number | 未显示 | 件/基本单位 | 单据商品数量合计 | 非空响应 |
| `data.rows[].transType` / `transTypeName` | number / string | 未显示 | 业务类型 | 单据业务类型编码及名称 | 非空响应 |
| `data.rows[].timeType` | string | 未显示 | 状态/时间类型 | 页面打开详情时携带的时间类型上下文 | 非空响应 |
| `data.rows[].tid`、`saleOrId`、`saleOrNo`、`from` | null/可空 | 未显示 | ID/上下文 | 关联单据或来源上下文字段；样本均为 `null` | 非空响应 |
| `data.rows[].disEditable` | 未在本次非空样本出现 | 隐藏“不可编辑” | 状态码 | jqGrid 配置的可选字段，详情页操作逻辑会读取；类型待出现该字段的响应确认 | jqGrid `colModel` + 页面逻辑 |

## 报价单管理

证据等级：有效报价 A；等待报价与作废报价 B。三个页签的真实请求和列配置均已确认；有效报价有非空响应，另外两页当前为空。

```http
POST /scm/invSa/quotationList
Content-Type: application/x-www-form-urlencoded

kzSwitch=0&rows=500&page=1&buId=&endDate=<YYYY-MM-DD>&beginDate=<YYYY-MM-DD>
```

等待报价页签：

```http
POST /moveMall/offerApply/quotations
Content-Type: application/x-www-form-urlencoded

kzSwitch=1&rows=20&page=1&buId=&endDate=<YYYY-MM-DD>&beginDate=<YYYY-MM-DD>
```

作废报价仍调用 `POST /scm/invSa/quotationList`，把 `kzSwitch` 改为 `2`，默认 `rows=500`。

| UI 筛选项 | 请求参数 | 类型 | 默认值/枚举 | 释义 | 证据 |
|---|---|---|---|---|---|
| 页签 | `kzSwitch` | integer-like string | `0` 有效报价、`1` 等待报价、`2` 作废报价 | 决定查询端点/报价状态 | 页签处理器 + 抓包 |
| 客户 | `buId` | string/number | 空 | 客户内部 ID | 查询对象 + 抓包 |
| 开始/结束日期 | `beginDate` / `endDate` | `YYYY-MM-DD` | 页面日期范围 | 报价日期范围 | 查询对象 + 抓包 |
| 综合搜索 | `matchCon` | string | 空时省略 | 商品名称、商品码或报价单号；输入后动态加入 | 输入绑定 + 查询对象 |
| 页码/页大小 | `page` / `rows` | integer | 有效/作废 `1` / `500`；等待 `1` / `20` | 分页 | 抓包 + 页签配置 |

有效报价和作废报价的成功条件为 `status === 200`；失败时读取 `msg` 并 fail closed。两者的响应外层为 `status:number`、`msg:string`、`records:number`、`total:number`、`rows:array`、`kzSwitch:string`。

| 响应字段/路径 | 类型/可空 | 表格列 | 格式/单位 | 释义 | 证据 |
|---|---|---|---|---|---|
| `rows[].id` | string | 隐藏 | ID | 报价行 ID | 非空响应 |
| `rows[].buId` | string | 隐藏 | ID | 客户 ID | 非空响应 |
| `rows[].buName` | string | 客户 | 文本 | 客户名称 | 非空响应 + `prop` |
| `rows[].invId` | string | 隐藏 | ID | 商品 ID | 非空响应 |
| `rows[].name` | string | 商品名称 | 文本 | 报价商品名称 | 非空响应 + `prop` |
| `rows[].status` | string | 物料状态 | `1` 在售、`2` 暂供、`3` 停供、`4` 停售、`5` 新品 | 商品供应状态 | 非空响应 + formatter |
| `rows[].createTime` | string | 报价日期 | 日期时间 | 报价创建时间 | 非空响应 + `prop` |
| `rows[].billNo` | string | 订单编号 | 单号 | 报价/来源订单编号 | 非空响应 + `prop` |
| `rows[].apply` | string | 车型 | 文本 | 适用车型 | 非空响应 + `prop` |
| `rows[].vin` | string | 车架号 | VIN | 关联 VIN | 非空响应 + `prop` |
| `rows[].price` | string | 销售报价 | 元 | 报价单价 | 非空响应 + `prop` |
| `rows[].num` | string | 销售数量 | 数量 | 报价数量 | 非空响应 + `prop` |

等待报价的成功条件为 `success === true && status === "success"`；失败时读取 `msg` 并 fail closed。其响应外层为 `success`、`status`、`redirect`、`msg`、`data`，空列表路径为 `data.rows[]`，并有 `data.total:number`、`data.records:number`。作废报价外层与有效报价相同但顶层 `rows[]` 为空。因此两者的行字段类型/可空性仍按 B 级处理；三个页签必须按各自容器解析，不能共用一个列表路径。

## 微仓出入库

证据等级：B。Agent 线路：条件可执行；微仓多选筛选暂不暴露。真实空表单查询、响应外层、单据类型枚举和全部表格 `prop` 已确认；默认日期范围结果为空，行字段类型/可空性待非空响应补证。

```http
POST /basedata/Inventory/getMoveFlow
Content-Type: application/x-www-form-urlencoded

page=1&rows=20&storageIds=&storageNames=&startDate=<YYYY-MM-DD>&endDate=<YYYY-MM-DD>&isMoveShop=&trans_type=&skey=&billNo=
```

| UI 筛选项 | 请求参数 | 类型 | 默认值/枚举 | 释义 | 证据 |
|---|---|---|---|---|---|
| 微仓/归属客户 | `storageIds` / `storageNames` | string | 空值固定发送两个空键；双选后的最终线格式未闭环 | `/Storage/getMoveStorage` 行的 `id` 与 `name` 必须同序对应 | 仓库组件 + 空值抓包 + [来源映射](./lookups.md#微仓) |
| 微仓标志 | `isMoveShop` | string/number | 当前规范请求固定发送空字符串；不要擅自改成 `1` | 页面预留的微仓范围标志；当前线路未证明非空值语义 | 默认抓包 |
| 日期 | `startDate` / `endDate` | `YYYY-MM-DD` | 当月 1 日 / 当前日 | 流水日期范围 | 日期控件 + 抓包 |
| 单据编号 | `billNo` | string | 空 | 精确或关键字匹配流水单号 | `v-model` + 抓包 |
| 物料 | `skey` | string | 空 | 物料编码或产品简码 | 输入提示 + `v-model` |
| 单据类型 | `trans_type` | string/number | 空全部 | `moveTransType` 返回的类型代码 | 组件绑定 + 抓包 |
| 页码/页大小 | `page` / `rows` | integer | `1` / `20` | 分页 | 查询对象 + 抓包 |

单据类型辅助接口实际为 POST：

```http
POST /basedata/Inventory/moveTransType
<empty body; no Content-Type header>
```

该辅助查询发送零字节 body，不带 `Content-Type`；成功条件为 `success === true && status === "success"`，枚举对象位于 `data`。失败时读取 `msg` 并 fail closed。

当前枚举：

| 代码 | 中文类型 |
|---|---|
| `1001` | 采购入库 |
| `1002` | 销售退货出库 |
| `2001` | 领用出库 |
| `2002` | 撤单入库 |
| `3001` | 修理厂盘亏（补领） |
| `4001` | 期初入库 |
| `5001` | 服务站盘盈 |
| `5002` | 服务站盘亏 |

成功条件为 `success === true && status === "success"`；失败时读取 `msg` 并 fail closed。主查询响应为 `success:boolean`、`status:string`、`msg:string`、`data.list[]`、`data.records:number`。当前 `data.list` 为空；列契约如下：

| 响应字段 | 表格列 | 格式/单位 | 释义 | 证据 |
|---|---|---|---|---|
| `billNo` | 单据编号 | 单号 | 微仓流水单号 | 模板 `prop` |
| `billDate` | 单据日期 | 日期 | 业务发生日期 | 模板 `prop` |
| `contactName` | 归属客户 | 文本 | 微仓所属客户名称 | 模板 `prop` |
| `invName` | 商品名称 | 文本 | 商品显示名称 | 模板 `prop` |
| `simpleCode` | 产品简码 | 编码 | 商品产品简码 | 模板 `prop` |
| `packSpec` | 规格型号 | 文本 | 包装/规格型号 | 模板 `prop` |
| `unitName` | 单位 | 文本 | 计量单位 | 模板 `prop` |
| `qty` | 数量 | 数量 | 本笔入库或出库数量 | 模板 `prop` |
| `categoryName` | 商品分类 | 文本 | 商品分类名称 | 模板 `prop` |
| `transTypeName` | 单据类型 | 文本 | 单据类型显示名 | 模板 `prop` |
| `amount` | 单据金额 | 元 | 本笔流水金额 | 模板 `prop` |

导出会生成文件，不属于查询 Agent。

在 `storageIds/storageNames` 的双选序列化得到真实请求证据前，Agent 只能查询全部微仓或使用其它已确认条件，不能自行假定逗号连接。

## 微仓账号

证据等级：B。空请求、空列表响应外层、组件读取逻辑和列字段均已确认；当前账号没有微仓账号记录，实际行类型/可空性待补证。

```http
POST /moveMall/AgentContact/list
Content-Type: application/x-www-form-urlencoded;charset=UTF-8

<empty body>
```

无独立查询条件。成功条件为 `success === true && status === "success"`；失败时读取 `msg` 并 fail closed。响应为 `success:boolean`、`status:string`、`msg:string`、`data.list[]`；当前 `list` 为空。

| 响应字段 | 表格列 | 类型/枚举 | 释义 | 证据 |
|---|---|---|---|---|
| `mobile` | 账号 | 待非空响应确认 | 微仓小程序手机号账号 | 组件 `prop` |
| `name` | 姓名 | 待非空响应确认 | 账号使用人姓名 | 组件 `prop` |
| `status` | 是否启用 | `1` 启用、`0` 禁用 | 账号启用状态 | 组件 switch 枚举 |
| `id` | 不展示 | 待非空响应确认 | 账号内部 ID，组件仅用于后续修改/删除 | 组件方法 |

手机号和姓名属于个人信息：Agent 只在用户明确询问时返回必要字段，不得持久化实际值。页面的添加、修改、启停和删除接口均为写操作，禁止调用。

## 微仓其他查询页

证据等级：C。已从当前页面及其已加载 bundle 确认主查询路径、完整请求对象、响应读取路径和列 `prop`，但三个页面都必须选择真实客户或微仓后才会正常发主请求；本轮没有代选，因此没有非空响应样本，这些路径仍不得直接生成 HTTP 工具。

### 微仓备货推荐

```http
POST /moveMall/firstMatch/recommend
Content-Type: application/x-www-form-urlencoded
```

| UI 筛选项 | 请求参数 | 类型 | 默认值/枚举 | 释义 | 证据 |
|---|---|---|---|---|---|
| 客户名称 | `contactId` | string/number | 必选 | 所选微仓归属客户 ID | 客户选择回调 + 查询校验 |
| 品类品牌 | `cateCodes` | string | 必选，逗号分隔 | 所选品类编码去重后拼接 | `getCategoryAndBrand()` |
| 品类品牌 | `brandIds` | comma-separated string | 逗号分隔 | 所选 `brands[].code` 去重后拼接；这里不是通用品牌数字 ID | `getCategoryAndBrand()` |
| 品类品牌 | `cateBrandMap` | JSON string | 例如 `{<cateCode>:[<brandCode>]}` | 保留每个品类与其品牌 code 的组合关系 | `getCategoryAndBrand()` |
| 推荐策略 | `type` | string | `sales` 历史销量；`vin` VIN；`car` 车型 | 决定请求字段分支和结果列 | 组件 radio `v-model` |
| 历史销量 | `dimension` | string | `customer` 客户；`station` 服务站；`city` 所在城市 | 仅 `type=sales`；历史销量统计维度 | 组件枚举 |
| 补货周期 | `repCycle` | integer | `1` 每周 1 次；`2` 每周 2 次 | 仅 `type=sales`；一周补货频次 | 组件枚举 |
| 时间范围 | `timeRange` | integer | `1` 近 1 年；`2` 近 2 年 | 仅 `type=sales`；历史销量回看范围 | 组件 radio 枚举 |
| 自定义时间 | `startDate` / `endDate` | date string | 可空；`YYYY-MM-DD` | `timeArr` 非空时追加；当前模板将该控件隐藏 | `getParams()` + render |
| 仅显示销量大于等于 | `num` | integer | `1`，最小 1 | 仅 `type=sales`；最低销量阈值 | 组件 input-number |
| 服务站有库存 | `onlyInStock` | integer | `1` 勾选；`0` 未勾选，默认 `1` | 仅 `type=sales`；过滤服务站无库存商品 | 组件 checkbox |
| 微仓历史无备货 | `onlyNotInMove` | integer | `1` 勾选；`0` 未勾选，默认 `1` | 仅 `type=sales`；过滤已有微仓备货记录的商品 | 组件 checkbox + tooltip |
| VIN 码 | `vin` | string | `type=vin` 时必填 | 支持多个 VIN，页面提示用逗号或换行分隔 | 组件 textarea + 查询校验 |
| 选择车型 | `compressIds` | string | `type=car` 时必填，逗号分隔 | 所选压缩车型 ID 集合 | `getParams()` |

请求分支：

- `type=sales` 复制完整 `form`，删除 `vin`、`compressIds`；
- `type=vin` 发送 `contactId/cateCodes/brandIds/type/vin/cateBrandMap`；
- `type=car` 发送 `contactId/cateCodes/brandIds/type/compressIds/cateBrandMap`；
- 任一分支在 `timeArr` 非空时追加 `startDate/endDate`。

响应读取为 `status`、`msg`、`data: array`；`status=success` 时直接把 `data` 作为表格行。

| 响应字段/路径 | 类型/可空 | 表格列 | 格式/枚举 | 释义 | 证据 |
|---|---|---|---|---|---|
| `status` | string | 不展示 | `success` 表示成功 | 查询状态 | 正式响应处理函数 |
| `msg` | string，可空 | 不展示 | 文本 | 失败提示 | 正式响应处理函数 |
| `data` | array | 表格数据源 | — | 推荐商品行数组，不再套 `list` | 正式响应处理函数 |
| `data[].categoryName` | 待非空响应确认 | 品类 | 文本 | 商品品类名称 | 表格 `prop` |
| `data[].brandName` | 待非空响应确认 | 品牌 | 文本 | 商品品牌名称 | 表格 `prop` |
| `data[].simpleCode` | 待非空响应确认 | 产品简码 | 文本 | 服务站产品简码 | 表格 `prop` |
| `data[].number` | 待非空响应确认 | 原厂产品码 | 文本 | 原厂产品编号 | 表格 `prop` |
| `data[].saleNum` | 待非空响应确认 | 销量 | 数量；仅 `type=sales` 显示 | 所选维度和时间范围内的历史销量 | 条件列 `prop` |
| `data[].recommendNum` | 待非空响应确认 | 推荐备货数量 | 正整数，页面最小值 1 | 推荐的本次备货数量 | 表格 `prop` + input-number |
| `data[].totalQty` | 待非空响应确认 | 服务站库存 | 数量 | 服务站当前库存 | 表格 `prop` |
| `data[].inMove` | 待非空响应确认 | 微仓历史有无备货 | `1` 显示“有”，其他显示“无” | 是否存在微仓历史备货 | 表格 `prop` + 渲染表达式 |
| `data[].moveQty` | 待非空响应确认 | 合并显示在“微仓历史有无备货” | 数量 | `inMove=1` 时显示为“有（数量）” | 渲染表达式 |
| `data[].skuId` | 待非空响应确认 | 不展示 | ID | 商品 SKU 上下文；只供后续开单动作使用，Agent 不调用该动作 | 页面后续动作读取 |

### 微仓补货管理

```http
POST /moveMall/MoveSto/getMoveStoSupplement
Content-Type: application/x-www-form-urlencoded
```

| UI 筛选项/上下文 | 请求参数 | 类型 | 默认值/枚举 | 释义 | 证据 |
|---|---|---|---|---|---|
| 客户 | `contactId` | string/number | 必选 | 组件内部从 `searchForm.buId` 映射的客户 ID | `search()` 请求对象 |
| 查询来源 | `source` | string | `1` 普通查询；`2` 表格单商品刷新 | 区分整表查询与选择/替换商品后的定点刷新 | `search(skuId, from)` |
| 补货时间 | `beginDate` / `endDate` | string | 必选；最终日期时间线格式未闭环 | 补货/领用统计区间；开始时间可能被上次补货时间校正 | 日期控件 + `search()`；C 级不执行 |
| 定点商品 | `skuId` | string/number | 普通查询为空 | `source=2` 时指定要刷新的 SKU | `search()` |
| 分类 | `categoryIds` | string | 空；多选最终线格式未闭环 | 所选商品分类叶节点 ID；Agent 暂不暴露此筛选 | 分类组件 `fixVal()` |
| 只看领用商品 | `outQty` | integer | `1` 勾选；`0` 未勾选；页面初始勾选 | 是否仅返回统计期内有领用量的商品 | checkbox + 请求归一化 |
| 物料 | `skey` | string | 空 | 匹配物料编码、产品简码或产品码 | 输入框 placeholder + `v-model` |
| 排序（当前隐藏） | `orderByOutQty` | integer | 请求仅发 `0` / `1` | 选“当前库存”发 `0`；其余排序值统一发 `1` | 隐藏 select + 请求归一化 |

响应读取为 `status`、`msg`、`data: array`；普通查询把 `data` 作为整表，`source=2` 时只读取 `data[0]` 替换当前行。

| 响应字段/路径 | 类型/可空 | 表格列 | 格式/单位 | 释义 | 证据 |
|---|---|---|---|---|---|
| `status` | string | 不展示 | `success` 表示成功 | 查询状态 | 正式响应处理函数 |
| `msg` | string，可空 | 不展示 | 文本 | 失败提示 | 正式响应处理函数 |
| `data` | array | 表格数据源 | — | 补货商品行数组 | 正式响应处理函数 |
| `data[].invName` | 待非空响应确认 | 商品 | 文本 | 商品完整名称 | 单元格渲染表达式 |
| `data[].simpleCode` | 待非空响应确认 | 产品简码 | 文本 | 产品简码 | 表格 `prop` |
| `data[].unitName` | 待非空响应确认 | 单位 | 文本 | 商品计量单位 | 表格 `prop` |
| `data[].qty` | 待非空响应确认 | 当前库存 | 数量 | 当前微仓库存；值为 0 时整行标红 | 表格 `prop` + 行样式 |
| `data[].warningQty` | 待非空响应确认 | 库存预警值 | 数量 | 库存低于该值时提示补货 | 表格 `prop` + tooltip |
| `data[].outQty` | 待非空响应确认 | 领用数量 | 数量 | 查询区间内的领用数量 | 表格 `prop` |
| `data[].addQty` | 待非空响应确认 | 补货推荐数量 | 非负整数 | 本次建议补货数量，页面允许调整 | 单元格 input-number |
| `data[].invId` | 待非空响应确认 | 不展示 | ID | 商品库存上下文，用于判断有效商品行 | 页面行逻辑 |
| `data[].skuId` | 待非空响应确认 | 不展示 | ID | SKU 上下文，用于定点刷新 | 页面行逻辑 |

补货推荐弹窗使用另一个只读查询：

```http
POST /moveMall/moveSto/recommendReplenish
Content-Type: application/x-www-form-urlencoded
```

| UI 筛选项 | 请求参数 | 类型 | 默认值/枚举 | 释义 | 证据 |
|---|---|---|---|---|---|
| 当前客户 | `contact_id` | string/number | 必选 | 复用主页面客户 ID | `getRecommendParams()` |
| 品类品牌 | `cate_codes` | string | 必选，逗号分隔 | 所选品类编码 | `getRecommendParams()` |
| 品类品牌 | `brand_id` | comma-separated string | 逗号分隔 | 所选品牌 `code`；不是通用品牌数字 ID | `getRecommendParams()` |
| 品类品牌 | `cate_brand_map` | JSON string | 品类到品牌 code 数组的映射 | 保留品类与品牌组合关系 | `getRecommendParams()` |
| 推荐策略 | `replenish_type` | string | `1` AI 报价助手群历史 VIN；`2` 手工 VIN | 决定使用日期还是 VIN | radio 枚举 |
| 查询日期 | `start_date` / `end_date` | date string | `replenish_type=1` 时必填 | 历史 VIN 查询区间；开始日期可能被上次补货时间校正 | 查询校验 + 请求构造 |
| VIN 码 | `vin_str` | string | `replenish_type=2` 时必填 | 手工输入的 VIN 集合 | 查询校验 + textarea |

响应读取为 `status`、`msg`、`data.goods[]`。

| 响应字段/路径 | 类型/可空 | 表格列 | 格式/单位 | 释义 | 证据 |
|---|---|---|---|---|---|
| `data.goods[].brandName` | 待非空响应确认 | 品牌 | 文本 | 推荐商品品牌 | 表格 `prop` |
| `data.goods[].categoryName` | 待非空响应确认 | 品类 | 文本 | 推荐商品品类 | 表格 `prop` |
| `data.goods[].simpleCode` | 待非空响应确认 | 产品简码 | 文本 | 产品简码 | 表格 `prop` |
| `data.goods[].skuId` | 待非空响应确认 | 物料编码 | ID/编码 | SKU/物料标识 | 表格 `prop` |
| `data.goods[].number` | 待非空响应确认 | 原厂产品码 | 文本 | 原厂产品编号 | 表格 `prop` |

### 微仓库存管理

```http
POST /basedata/inventory/getMoveStorageInventory
Content-Type: application/x-www-form-urlencoded
```

| UI 筛选项 | 请求参数 | 类型 | 默认值/枚举 | 释义 | 证据 |
|---|---|---|---|---|---|
| 微仓 | `contact_id` | string/number | 随所选微仓写入 | 所选微仓的归属客户 ID | `sureChooseDialog()` |
| 微仓 | `storage_id` | string/number | 必选 | 所选微仓 ID；缺失时页面阻止查询 | `sureChooseDialog()` + 查询校验 |
| 微仓 | `storageNames` | string | 必选 | 所选微仓显示名称 | `sureChooseDialog()` + 查询校验 |
| 微仓类型 | `is_move_shop` | string | `1` 铺货微仓；`0` 普通微仓 | 从微仓选择器同步到主查询 | 选择器枚举 + `search()` |
| 分类 | `category_ids` | string | 空；多选最终线格式未闭环 | 所选商品分类叶节点 ID；Agent 暂不暴露此筛选 | 分类组件 `fixVal()` |
| 物料信息 | `skey` | string | 空 | 匹配物料编码或产品简码 | 输入框 placeholder + `v-model` |
| 仅显示滞留天数大于等于 | `only_show_diff_day_num` | integer | `0`，最小 0 | 最低滞留天数阈值 | input-number + `v-model` |
| 页码 | `page` | integer | `1` | 当前页 | 查询对象 + 分页组件 |
| 每页条数 | `limit` | integer | `20`；可选 `20/50/100` | 分页大小 | 查询对象 + 分页组件 |

响应读取为 `status`、`msg`、`data.list[]`、`data.count`。

| 响应字段/路径 | 类型/可空 | 表格列 | 格式/单位 | 释义 | 证据 |
|---|---|---|---|---|---|
| `status` | string | 不展示 | `success` 表示成功 | 查询状态 | 正式响应处理函数 |
| `msg` | string，可空 | 不展示 | 文本 | 失败提示 | 正式响应处理函数 |
| `data.list` | array | 表格数据源 | — | 当前页库存行 | 正式响应处理函数 |
| `data.count` | 待非空响应确认 | 分页总数 | 条 | 符合条件的总记录数 | 正式响应处理函数 |
| `data.list[].goods_name` | 待非空响应确认 | 商品名称 | 文本 | 商品完整名称 | 表格 `prop` |
| `data.list[].simple_code` | 待非空响应确认 | 产品简码 | 文本 | 产品简码 | 表格 `prop` |
| `data.list[].spec` | 待非空响应确认 | 规格型号 | 文本 | 商品规格型号 | 表格 `prop` |
| `data.list[].unit` | 待非空响应确认 | 单位 | 文本 | 商品计量单位 | 表格 `prop` |
| `data.list[].pack_spec` | 待非空响应确认 | 包装规格 | 文本 | 商品包装规格 | 表格 `prop` |
| `data.list[].total_qty` | 待非空响应确认 | 微仓当前库存 | 数量 | 当前微仓库存数量 | 表格 `prop` |
| `data.list[].warning_qty` | 待非空响应确认 | 库存预警值 | 数量 | 库存低于该值时提示补货；是直接响应字段 | 表格 `prop` + tooltip |
| `data.list[].days_difference` | 待非空响应确认 | 滞留天数 | 天 | 最近领用时间到当前日期的天数；无领用时改用入库时间，是直接响应字段 | 表格 `prop` + tooltip |
| `data.list[].earliest_in_time` | 待非空响应确认 | 首次入库时间 | datetime | 商品首次进入该微仓的时间 | 表格 `prop` |
| `data.list[].recent_out_time` | 待非空响应确认 | 最近领用时间 | datetime，可空 | 商品最近一次领用时间 | 表格 `prop` |
| `data.list[].car_model` | 待非空响应确认 | 适用车型 | 文本 | 商品适配车型说明 | 表格 `prop` |
| `data.list[].id` | 待非空响应确认 | 不展示 | ID | 库存行 ID，页面后续编辑预警值时使用 | 页面行逻辑 |
| `data.list[].inv_id` | 待非空响应确认 | 不展示 | ID | 商品库存 ID，页面后续屏蔽动作使用 | 页面行逻辑 |
| `data.list[].is_hide` | 待非空响应确认 | 不展示 | `1` 已屏蔽；其他未屏蔽 | 决定操作列显示“屏蔽”还是“取消屏蔽” | 操作列渲染表达式 |
| `data.list[].shield_id` | 待非空响应确认 | 不展示 | ID | 已屏蔽记录 ID，页面取消屏蔽时使用 | 页面行逻辑 |

微仓选择弹窗使用 `POST /Storage/getMoveStorage`，请求为 `isMoveShop`（`1` 铺货微仓、`0` 普通微仓）、`key`（仓库编号/名称）、`page`、`rows`；组件读取 `status/msg/data.list[]/data.total/data.in_non_shop_white`。它只用于建立上述微仓查询上下文，不应把返回的真实客户或仓库信息持久化。

## E 站套餐

证据等级：B。真实请求、响应外层和组件列字段已确认；当前列表为空，行字段类型与可空性仍待非空响应确认。

```http
POST /Provider/index/saas/inner/bag/list
Content-Type: application/x-www-form-urlencoded

page=1&limit=20&source_type=2
```

| UI 筛选项 | 请求参数 | 类型 | 默认值/枚举 | 释义 | 证据 |
|---|---|---|---|---|---|
| 套餐名称 | `bag_name` | string | 空时省略该键；非空时发送文本 | 按套餐名称过滤 | 默认抓包 + 组件 `v-model` |
| 状态 | `status` | number/string | 空全部时省略该键；`1` 在售中、`2` 已下架 | 套餐上下架状态 | 默认抓包 + 组件枚举 |
| 来源 | `source_type` | number | `2` | 当前单站 E 站来源固定值 | 抓包 + 查询对象 |
| 页码/页大小 | `page` / `limit` | integer | `1` / `20` | 分页 | 抓包 + 查询对象 |

成功条件为 `code === 0`；失败时读取顶层 `message` 并 fail closed。响应外层：`code`、`message`、`data.count`、`data.page_count`、`data.list[]`、`data.select_status[]`。

| 响应字段/路径 | 类型/可空 | 表格列 | 格式/单位 | 释义 | 证据 |
|---|---|---|---|---|---|
| `data.list[].img_mini` | 待非空响应确认 | 套餐图片 | URL | 缩略图地址 | 组件 `prop` |
| `data.list[].name` | 待非空响应确认 | 套餐名称 | 文本 | 套餐显示名称 | 组件 `prop` |
| `data.list[].price` | 待非空响应确认 | 套餐金额 | 元 | 套餐销售金额 | 组件 `prop` |
| `data.list[].qty` | 待非空响应确认 | 套餐库存 | 件/套 | 可售库存 | 组件 `prop` |
| `data.list[].status_desc` | 待非空响应确认 | 状态 | 文本 | 上下架状态显示名 | 组件 `prop` |
| `data.list[].trade_way_desc` | 待非空响应确认 | 支付方式 | 文本 | 支付方式显示名 | 组件 `prop` |
| `data.list[].modifier` | 待非空响应确认 | 更新人 | 文本 | 最后更新人员 | 组件 `prop` |
| `data.list[].update_time` | 待非空响应确认 | 更新时间 | 日期时间 | 最后更新时间 | 组件 `prop` |

## E 站活动

证据等级：A。

```http
POST /Provider/index/saas/inner/activity/list
Content-Type: application/json

{"limit":20,"page":1,"id":"","name":"","type":"","status":"","source_type":"","examine_status":"","is_seckill":""}
```

| UI 筛选项 | 请求参数 | 类型 | 默认值/枚举 | 释义 | 证据 |
|---|---|---|---|---|---|
| 活动 ID | `id` | string/number | 空 | 精确或组件定义的活动 ID 查询 | 组件 `v-model` + 抓包 |
| 活动名称 | `name` | string | 空 | 活动名称关键字 | 组件 `v-model` + 抓包 |
| 活动类型 | `type` | string/number | 空全部 | 活动类型选项 ID | 组件 `v-model` |
| 活动状态 | `status` | string/number | 空全部 | 活动状态选项 ID | 组件 `v-model` |
| 来源 | `source_type` | string/number | 空全部；`1` 平台、`2` 单站 | 活动来源 | 组件枚举 |
| 审核状态 | `examine_status` | string/number | 空全部 | 审核状态选项 ID | 组件 `v-model` |
| 是否秒杀 | `is_seckill` | string/number | 空全部；`1` 是、`0` 否 | 秒杀活动标志 | 组件枚举 |
| 上线时间 | `online_time` | array | 空数组时省略；元素日期线格式未闭环，Agent 暂不发送非空数组 | 上线日期范围 | 组件 watcher |
| 开始时间 | `begin_time` | array | 空数组时省略；元素日期线格式未闭环，Agent 暂不发送非空数组 | 活动开始日期范围 | 组件 watcher |
| 结束时间 | `end_time` | array | 空数组时省略；元素日期线格式未闭环，Agent 暂不发送非空数组 | 活动结束日期范围 | 组件 watcher |
| 页码/页大小 | `page` / `limit` | integer | `1` / `20` | 分页 | 抓包 |

成功条件为 `code === 0`；失败时读取顶层 `message` 并 fail closed。响应列表位于 `data.data[]`，总数为 `data.records`，不是 `data.list[]`。

| 响应字段/路径 | 类型/可空 | 表格列 | 格式/单位 | 释义 | 证据 |
|---|---|---|---|---|---|
| `data.data[].id` | number/string | 活动 ID | ID | 活动主键 | 非空响应 + 组件 `prop` |
| `data.data[].name` | string | 活动名称 | 文本 | 活动显示名称 | 非空响应 + 组件 `prop` |
| `data.data[].source_type` | number/string | 来源 | `1` 平台、`2` 单站 | 原始来源值 | 非空响应 + 组件渲染 |
| `data.data[].create_time` | string | 发起时间 | 日期时间 | 活动创建时间 | 非空响应 + 组件 `prop` |
| `data.data[].online_time` | string/可空 | 上线时间 | 日期时间 | 活动上线时间 | 非空响应 + 组件 `prop` |
| `data.data[].begin_time` | string | 开始时间 | 日期时间 | 活动生效时间 | 非空响应 + 组件 `prop` |
| `data.data[].end_time` | string | 结束时间 | 日期时间 | 活动结束时间 | 非空响应 + 组件 `prop` |
| `data.data[].status_name` | string | 活动状态 | 文本 | 状态显示名 | 非空响应 + 组件 `prop` |
| `data.data[].is_seckill` | number/string | 是否秒杀 | `1` 是、`0` 否 | 秒杀标志 | 非空响应 + 组件渲染 |
| `data.data[].type_name` | string | 活动类型 | 文本 | 类型显示名 | 非空响应 + 组件 `prop` |

页面自动调用的 `hasRegister` / `register` 是 E 站注册状态流程，不属于查询 Agent 的活动列表工具。

## E 站积分商品

证据等级：A。

```http
POST /provider/index/saas/inner/credit/product/list
Content-Type: application/x-www-form-urlencoded

keyword=&category_code=&limit=20&page=1
```

| UI 筛选项 | 请求参数 | 类型 | 默认值/枚举 | 释义 | 证据 |
|---|---|---|---|---|---|
| 商品名称 | `keyword` | string | 空 | 商品名称关键字 | 组件 `v-model` + 抓包 |
| 商品分类 | `category_code` | string | 空全部；`02` 办公用品、`03` 维修工具、`04` 日用百货、`05` 食品零食、`06` 数码电器、`07` 其他 | 积分商品分类编码 | 组件枚举 |
| 页码/页大小 | `page` / `limit` | integer | `1` / `20` | 分页 | 抓包 |

旧文档中的查询参数 `status` 不存在；状态只作为返回列展示。成功条件为 `code === 0`；失败时读取顶层 `message` 并 fail closed。响应包含 `code`、`message`、`data.count`、`data.page_count`、`data.list[]`。

| 响应字段/路径 | 类型/可空 | 表格列 | 格式/单位 | 释义 | 证据 |
|---|---|---|---|---|---|
| `data.list[].code` | string/number | 商品 ID | ID | 积分商品编码 | 非空响应 + 组件 `prop` |
| `data.list[].name` | string | 商品名称 | 文本 | 商品显示名称 | 非空响应 + 组件 `prop` |
| `data.list[].category_name` | string | 商品分类 | 文本 | 分类显示名 | 非空响应 + 组件 `prop` |
| `data.list[].imgs[0]` | string/可空 | 商品图片 | URL | 首张商品图片 | 非空响应 + 组件渲染 |
| `data.list[].credit` | number/string | 兑换所需积分 | 积分 | 单件兑换积分 | 非空响应 + 组件 `prop` |
| `data.list[].use_qty` | number/string | 已兑换数量 | 件 | 历史兑换数量 | 非空响应 + 组件 `prop` |
| `data.list[].qty` | number/string | 当前库存 | 件 | 可兑换库存 | 非空响应 + 组件 `prop` |
| `data.list[].status` | number/string | 状态 | `1` 上架、`0` 下架 | 上下架状态 | 非空响应 + 组件渲染 |

## E 站订单

证据等级：A。Agent 线路：条件可执行；`pay_mode` 因枚举冲突暂不暴露。

```http
POST /moveMall/Orders/activityOrderList
Content-Type: application/x-www-form-urlencoded;charset=UTF-8

limit=20&page=1&is_all=0&order_no=&activity_id=&activity_name=&activity_source_type=&order_status=-1&begin_time=&end_time=&data_source=1
```

| UI 筛选项 | 请求参数 | 类型 | 默认值/枚举 | 释义 | 证据 |
|---|---|---|---|---|---|
| 订单编号 | `order_no` | string | 空 | E 站订单号 | 组件 `v-model` + 抓包 |
| 活动编号 | `activity_id` | string/number | 空 | 关联活动 ID | 组件 `v-model` |
| 活动名称 | `activity_name` | string | 空 | 活动名称关键字 | 组件 `v-model` |
| 活动平台 | `activity_source_type` | string/number | 空全部；`1` 平台、`2` 自有 | 活动来源平台 | 组件枚举 |
| 订单状态 | `order_status` | string | `-1` 全部、`0` 待支付、`13` 待发货、`1` 已完成、`9` 已取消、`2` 部分退款、`3` 全部退款、`14` 待收货 | 订单状态值 | 组件枚举 + 抓包 |
| 下单时间 | `begin_time` / `end_time` | `YYYY-MM-DD HH:mm:ss` | 默认发送两个空键 | 无时区后缀的页面本地时间；当前取证会话为 Asia/Shanghai | 日期组件 `valueFormat` + 默认抓包 |
| 是否套包 | `is_bag` | number/string | 默认缺键；选择后 `1` 是、`2` 否 | 套包订单标志 | 组件枚举 + 默认抓包 |
| 支付方式 | `pay_mode` | number/string | 默认缺键；当前筛选隐藏 | 当前组件显示 `1` 不限、`2` 微信支付，但响应元数据为 `0` 全部、`1` 挂帐、`2` 微信支付，两者冲突 | 组件枚举 + 响应元数据 |
| 数据来源 | `data_source` | number | `1` E 站小程序、`2` E 站 APP | 订单数据来源 | 组件枚举 + 抓包 |
| 全量导出标志 | `is_all` | number | 查询固定 `0` | `1` 仅用于导出，不属于查询 Agent | 查询对象 |
| 页码/页大小 | `page` / `limit` | integer | `1` / `20` | 分页 | 抓包 |

成功条件为 `success === true && status === "success"`；否则读取 `msg` 并 fail closed，不能把失败当成空列表。顶层响应为 `success:boolean`、`status:string`、`redirect:null`、`msg:string`、`list:array`、`count:number`、`page_count:number`，列表路径是 `list[]`，总记录数和总页数分别是 `count`、`page_count`。顶层还返回 `pay_mode[]` 与 `is_bag[]` 枚举元数据；由于前述支付方式冲突，Agent 不采用 `pay_mode` 作为可选筛选。

| 响应字段/路径 | 类型/可空 | 表格列 | 格式/单位 | 释义 | 证据 |
|---|---|---|---|---|---|
| `list[].order_no` | string | 订单编号 | 单号 | E 站订单号 | 非空响应 + 组件 `prop` |
| `list[].sa_invoice_order_no` | string/可空 | 销售单号 | 单号 | 生成的销售单号 | 非空响应 + 组件 `prop` |
| `list[].create_time` | string | 订单时间 | 日期时间 | 下单时间 | 非空响应 + 组件 `prop` |
| `list[].activity_id` | number/string/可空 | 活动编号 | ID | 关联活动 ID | 非空响应 + 组件 `prop` |
| `list[].activity_name` | string/可空 | 活动名称 | 文本 | 关联活动名称 | 非空响应 + 组件 `prop` |
| `list[].activity_source_type_name` | string/可空 | 活动平台 | 文本 | 活动来源显示名 | 非空响应 + 组件 `prop` |
| `list[].is_bag` | number/string/可空 | 是否套包 | `1` 是、`2` 否 | 套包订单标志 | 组件枚举 + 组件渲染 |
| `list[].pay_mode_name` | string/可空 | 支付方式 | 文本 | 支付方式显示名 | 非空响应 + 组件 `prop` |
| `list[].source_name` | string | 订单来源 | 文本 | 来源显示名 | 非空响应 + 组件 `prop` |
| `list[].contact_name` | string | 维修厂名称 | 文本 | 下单客户名称 | 非空响应 + 组件 `prop` |
| `list[].order_status_name` | string | 订单状态 | 文本 | 状态显示名 | 非空响应 + 组件 `prop` |
| `list[].pay_time` | string/可空 | 付款时间 | 日期时间 | 支付完成时间 | 非空响应 + 组件 `prop` |
| `list[].activity_amount` | number/string | 优惠金额 | 元 | 活动优惠金额 | 非空响应 + 组件 `prop` |
| `list[].coupon_source_type_name` | string/可空 | 优惠券来源 | 文本 | 优惠券来源显示名 | 非空响应 + 组件 `prop` |
| `list[].coupon_amount` | number/string | 优惠券面额 | 元 | 优惠券抵扣额 | 非空响应 + 组件 `prop` |
| `list[].pay_amount` | number/string | 实付金额 | 元 | 客户实际支付金额 | 非空响应 + 组件 `prop` |
| `list[].activity_cashback_amount` | number/string | 返现金额 | 元 | 活动返现金额 | 非空响应 + 组件 `prop` |
| `list[].income_amount` | number/string | 收款金额 | 元 | 订单实际入账金额 | 非空响应 + 组件 `prop` |

## E 站积分订单

证据等级：A。Agent 线路：可执行。

```http
POST /provider/index/saas/inner/credit/order/list
Content-Type: application/x-www-form-urlencoded

contact_id=&keyword=&start_date=&end_date=&limit=20&page=1&
```

客户选项读取：

```http
GET /basedata/contact?action=list&simple=1
```

| UI 筛选项 | 请求参数 | 类型 | 默认值/枚举 | 释义 | 证据 |
|---|---|---|---|---|---|
| 客户名称 | `contact_id` | string/number | 空 | 客户 ID | 组件选择器 + 抓包 |
| 商品名称 | `keyword` | string | 空 | 商品名称关键字 | 组件 `v-model` |
| 日期范围 | `start_date` / `end_date` | `YYYY-MM-DD` | 当前默认查询发送两个空键；选择日期后发送日期文本 | 日期组件 `valueFormat=yyyy-MM-dd`，无时区或时间部分 | 当前抓包 + 日期组件 |
| 页码/页大小 | `page` / `limit` | integer | `1` / `20` | 分页 | 抓包 |

成功条件为 `code === 0`；失败时读取顶层 `message` 并 fail closed。顶层为 `code:number`、`message:string`、`data:object`，分页容器为 `data.count:number`、`data.page_count:number`、`data.list:array`。

| 响应字段/路径 | 类型/可空 | 表格列 | 格式/单位 | 释义 | 证据 |
|---|---|---|---|---|---|
| `data.list[].contact_name` | string | 下单客户 | 文本 | 客户名称 | 非空响应 + 组件 `prop` |
| `data.list[].order_no` | string | 订单号 | 单号 | 积分兑换订单号 | 非空响应 + 组件 `prop` |
| `data.list[].create_time` | string | 下单时间 | 日期时间 | 订单创建时间 | 非空响应 + 组件 `prop` |
| `data.list[].status_text` | string | 订单状态 | 文本 | 状态显示名 | 非空响应 + 组件 `prop` |
| `data.list[].name` | string | 商品名称 | 文本 | 兑换商品名称 | 非空响应 + 组件 `prop` |
| `data.list[].number` | number/string | 商品件数 | 件 | 兑换数量 | 非空响应 + 组件 `prop` |

## E 站退货申请

证据等级：A。Agent 线路：可执行。

```http
GET /applyReturn/applyReturnOrder/getList?skey=&customer_id=&search_type=1&data_source=1&page=1&rows=20&status=
```

客户选项：

```http
GET /basedata/contact?action=list&page=1&row=100000&disable=true&customerType=0&isDelete=0
```

页面另有开始/结束日期条件；空值时请求可省略对应键。

| UI 筛选项 | 请求参数 | 类型 | 默认值/枚举 | 释义 | 证据 |
|---|---|---|---|---|---|
| 综合搜索 | `skey` | string | 空 | 按所选搜索类型匹配单号 | 组件 `v-model` + 抓包 |
| 搜索类型 | `search_type` | number/string | `1` 申请单号、`2` 退货单号 | `skey` 的匹配字段 | 组件枚举 |
| 客户 | `customer_id` | string/number | 空 | 客户 ID | 组件选择器 |
| 订单来源 | `data_source` | number/string | `1` 小程序、`2` APP | 申请来源 | 组件枚举 |
| 日期 | `beginDate` / `endDate` | `YYYY-MM-DD` | 空时可省略 | 单据日期范围 | 组件 watcher |
| 状态页签 | `status` | number/string | 空全部；`1` 待处理、`2` 待入库、`3` 已完成 | 退货申请状态 | 组件枚举 |
| 页码/页大小 | `page` / `rows` | integer | `1` / `20` | 分页 | 抓包 |

成功条件为 `success === true && status === "success"`；失败时读取 `msg` 并 fail closed。顶层为 `success:boolean`、`status:string`、`redirect:null`、`msg:string`、`data:object`，分页容器为 `data.page:number`、`data.total:number`、`data.records:number`、`data.rows:array`。

| 响应字段/路径 | 类型/可空 | 表格列 | 格式/单位 | 释义 | 证据 |
|---|---|---|---|---|---|
| `data.rows[].bill_date` | string | 单据日期 | 日期时间 | 申请单创建日期 | 非空响应 + 组件 `prop` |
| `data.rows[].bill_no` | string | 申请单号 | 单号 | 退货申请单号 | 非空响应 + 组件 `prop` |
| `data.rows[].customer_name` | string | 客户 | 文本 | 申请客户名称 | 非空响应 + 组件 `prop` |
| `data.rows[].total_amount` | number/string | 退货金额 | 元 | 申请退货总金额 | 非空响应 + 组件 `prop` |
| `data.rows[].total_qty` | number/string | 退货数量 | 件 | 申请退货总数量 | 非空响应 + 组件 `prop` |
| `data.rows[].statusName` | string | 退货状态 | 文本 | 状态显示名 | 非空响应 + 组件 `prop` |
| `data.rows[].saInvoiceNo` | string/可空 | 退货单号 | 单号 | 完成后关联的销售退货单号 | 非空响应 + 组件 `prop` |
| `data.rows[].remark` | string/可空 | 备注 | 文本 | 申请备注 | 非空响应 + 组件 `prop` |

## E 站关单退款

证据等级：A。Agent 线路：可执行。

```http
POST /moveMall/UnionPayController/refund
Content-Type: application/json;charset=UTF-8

{"bill_no":"","sa_invoice_order_no":"","contact_name":"","status":99,"pay_type":"","ctime_start":"","ctime_end":"","rtime_start":"","rtime_end":"","page":1,"limit":20,"data_source":1}
```

| UI 筛选项 | 请求参数 | 类型 | 默认值/枚举 | 释义 | 证据 |
|---|---|---|---|---|---|
| 退款单号 | `bill_no` | string | 空 | 退款业务单号 | 组件 `v-model` + 抓包 |
| 关联订单号 | `sa_invoice_order_no` | string | 空 | 关联销售/E 站订单号 | 组件 `v-model` |
| 维修厂名称 | `contact_name` | string | 空 | 客户名称关键字 | 组件 `v-model` |
| 退款状态 | `status` | number | `99` 全部、`1` 已退款、`0` 待退款 | 退款处理状态 | 组件枚举 |
| 退款方式 | `pay_type` | number/string | 空全部、`2` 原路返回、`3` 线下退款 | 退款资金路径 | 组件枚举 |
| 发起时间 | `ctime_start` / `ctime_end` | `YYYY-MM-DD HH:mm:ss` | 默认发送两个空键 | 无时区后缀的页面本地时间；当前取证会话为 Asia/Shanghai | 日期组件 `valueFormat` + 默认抓包 |
| 退款时间 | `rtime_start` / `rtime_end` | `YYYY-MM-DD HH:mm:ss` | 默认发送两个空键 | 无时区后缀的页面本地时间；当前取证会话为 Asia/Shanghai | 日期组件 `valueFormat` + 默认抓包 |
| 数据来源 | `data_source` | number | `1` 小程序、`2` APP | 订单来源 | 组件枚举 |
| 页码/页大小 | `page` / `limit` | integer | `1` / `20` | 分页 | 抓包 |

成功条件为 `success === true && status === "success"`；失败时读取 `msg` 并 fail closed。顶层为 `wait_refund_count:number`、`success:boolean`、`status:string`、`redirect:null`、`page_count:number`、`msg:string`、`list:array`、`count:number`。列表路径为 `list[]`，总记录数和总页数为 `count`、`page_count`；`wait_refund_count` 是页面待退款角标，不是当前页行数。

| 响应字段/路径 | 类型/可空 | 表格列 | 格式/单位 | 释义 | 证据 |
|---|---|---|---|---|---|
| `list[].bill_status_name` | string | 退款状态 | 文本 | 退款状态显示名 | 非空响应 + 组件 `prop` |
| `list[].create_time` | string | 发起时间 | 日期时间 | 退款申请发起时间 | 非空响应 + 组件 `prop` |
| `list[].bill_no` | string | 退款单号 | 单号 | 退款业务单号 | 非空响应 + 组件 `prop` |
| `list[].sa_invoice_order_no` | string | 关联订单号 | 单号 | 被关闭/退款的订单号 | 非空响应 + 组件 `prop` |
| `list[].order_type_name` | string/可空 | 关联订单来源 | 文本 | 关联订单类型显示名 | 非空响应 + 组件 `prop` |
| `list[].contact_name` | string | 维修厂名称 | 文本 | 客户名称 | 非空响应 + 组件 `prop` |
| `list[].refund_source` | string/可空 | 退款来源 | 文本 | 退款触发来源 | 非空响应 + 组件 `prop` |
| `list[].pay_amount` | number/string | 退款金额 | 元 | 实际退款金额 | 非空响应 + 组件 `prop` |
| `list[].pay_type_name` | string | 退款方式 | 文本 | 原路返回/线下退款显示名 | 非空响应 + 组件 `prop` |
| `list[].out_bill_no` | string/可空 | 流水号 | 单号 | 外部支付退款流水号 | 非空响应 + 组件 `prop` |
| `list[].nickname` | string/可空 | 退款人 | 文本 | 操作人员显示名 | 非空响应 + 组件 `prop` |
| `list[].pay_success_time` | string/可空 | 退款时间 | 日期时间 | 退款成功时间 | 非空响应 + 组件 `prop` |

不得把该列表查询与任何实际退款执行动作混淆。

## 商品调拨单管理

证据等级：A。主列表 POST 请求、非空响应、状态枚举和主表列绑定均已确认。

```http
POST /stf/apply/list
Content-Type: application/x-www-form-urlencoded

page=1&rows=20&type=0&apply_sid=&deliver_sid=&bill_status=&create_beg_time=&create_end_time=&in_beg_time=&in_end_time=&out_beg_time=&out_end_time=&bill_no=
```

| UI 筛选项 | 请求参数 | 类型 | 默认值/枚举 | 释义 | 证据 |
|---|---|---|---|---|---|
| 列表类型 | `type` | integer-like string | `0` | 当前商品调拨申请列表类型 | 查询对象 + 抓包 |
| 申请服务站 | `apply_sid` | string/number | 空 | 调入/申请方服务站 ID | 查询对象 |
| 发货服务站 | `deliver_sid` | string/number | 空 | 调出/发货方服务站 ID | 查询对象 |
| 单据状态 | `bill_status` | integer-like string | 空全部；`0` 待出库、`1` 待入库、`2` 已入库、`3` 已驳回、`4` 已取消 | 调拨流程状态 | 组件枚举 |
| 申请时间 | `create_beg_time` / `create_end_time` | string | 空；非空线格式未闭环，Agent 暂不暴露 | 调拨申请创建时间范围 | 查询对象 |
| 入库时间 | `in_beg_time` / `in_end_time` | string | 空；非空线格式未闭环，Agent 暂不暴露 | 调入完成时间范围 | 查询对象 |
| 出库时间 | `out_beg_time` / `out_end_time` | string | 空；非空线格式未闭环，Agent 暂不暴露 | 调出完成时间范围 | 查询对象 |
| 单号 | `bill_no` | string | 空 | 调拨申请单/关联调拨单号关键字 | 查询对象 |
| 页码/页大小 | `page` / `rows` | integer | `1` / `20` | 分页 | 抓包 |

成功条件为 `success === true && status === "success"`；失败时读取 `msg` 并 fail closed。响应外层为 `success:boolean`、`status:string`、`redirect:null`、`msg:string`、`data:object`；`data.records:number`、`data.total:number`、`data.list:array`、`data.total_in_price:number`、`data.total_out_price:number`、`data.statistics:object`。

| 响应字段/路径 | 类型/可空 | 表格列 | 格式/单位 | 释义 | 证据 |
|---|---|---|---|---|---|
| `data.list[].id` | string | 隐藏 | ID | 调拨申请主键 | 非空响应 |
| `data.list[].bill_no` | string | 调拨申请单号 | 单号 | 申请单业务编号 | 非空响应 + `prop` |
| `data.list[].bill_status` | string | 状态上下文 | 状态码 | 原始状态编码 | 非空响应 |
| `data.list[].bill_status_name` | string | 状态 | 文本 | 状态显示名 | 非空响应 + `prop` |
| `data.list[].apply_sid` | string | 隐藏 | ID | 申请/调入服务站 ID | 非空响应 |
| `data.list[].apply_sname` | string | 申请服务站 | 文本 | 申请/调入服务站名称 | 非空响应 + `prop` |
| `data.list[].deliver_sid` | string | 隐藏 | ID | 发货服务站 ID | 非空响应 |
| `data.list[].out_sname` | string | 发货服务站 | 文本 | 调出/发货服务站名称 | 非空响应 + `prop` |
| `data.list[].in_price` | string | 调入金额 | 元 | 调入方金额 | 非空响应 + `prop` |
| `data.list[].out_price` | string | 调出金额 | 元 | 调出方金额 | 非空响应 + `prop` |
| `data.list[].remark` | string | 备注 | 文本 | 调拨备注 | 非空响应 + `prop` |
| `data.list[].u_id` | string | 隐藏 | ID | 申请人员 ID | 非空响应 |
| `data.list[].u_name` | string | 申请人 | 文本 | 申请人员名称 | 非空响应 + `prop` |
| `data.list[].create_time` | string | 申请时间 | 日期时间 | 调拨申请创建时间 | 非空响应 + `prop` |
| `data.list[].in_time` | string/null | 入库时间 | 日期时间 | 调入完成时间 | 非空响应 + `prop` |
| `data.list[].out_time` | string/null | 发货时间 | 日期时间 | 调出完成时间 | 非空响应 + `prop` |
| `data.list[].type` | number | 调拨类型上下文 | 枚举码 | 调拨类型编码 | 非空响应 |
| `data.list[].type_name` | string | 调拨类型 | 文本 | 调拨类型显示名 | 非空响应 + `prop` |
| `data.list[].stf_bill_no` | string/null | 出/入库调拨单号 | 单号 | 关联库存调拨单号 | 非空响应 + `prop` |

页面的发货、入库、驳回、取消以及调拨制单动作均会改变业务状态，不属于查询 Agent。

## 大客户销售出库单

证据等级：A。当前页面正常加载/查询产生的 GET、2 行非空响应、查询处理器、筛选枚举和全部 jqGrid 列均已重新确认。

```http
GET /scm/invCu?action=list&matchCon=&transType=180601&beginDate=<YYYY-MM-DD>&endDate=<YYYY-MM-DD>&relationOrderNo=&_search=false&nd=<timestamp>&rows=100&page=1&sidx=&sord=asc&salesId=0&hxState=0&serviceType=0&sourceType=0&delieverId=0&customType=0&billStatus=
```

| UI 筛选项 | 请求参数 | 类型 | 默认值/枚举 | 释义 | 证据 |
|---|---|---|---|---|---|
| 综合搜索 | `matchCon` | string | 空 | 单据号、客户名或厂家产品码 | UI 占位文案 + 查询处理器 + 抓包 |
| 固定业务类型 | `transType` | integer-like string | `180601` | 大客户销售出库 | 页面入口 + 抓包 |
| 日期 | `beginDate` / `endDate` | `YYYY-MM-DD` | 当前页面日期范围 | 配送/单据日期起止 | UI + 查询处理器 + 抓包 |
| 订单状态 | `billStatus` | integer-like string | 空全部；`0` 草稿、`1` 待审核、`3` 完成 | UI 的“全部”值 `4` 在请求前归一为空 | 组件枚举 + 查询处理器 |
| 客户类型 | `customType` | string/number | `0` 全部 | 大客户分类 ID，选项由 `/scm/invCu/getCarType` 提供 | UI + 辅助接口 + 抓包 |
| 业务类型 | `serviceType` | integer-like string | `0` 全部；`1` 普通业务、`2` 直采业务、`3` 临采业务 | 出库服务/采购模式 | 组件枚举 + 查询处理器 |
| 销售人员 | `salesId` | string/number | `0` 全部 | 销售员工 ID | UI + 查询处理器 + 抓包 |
| 送货人员 | `delieverId` | string/number | `0` 全部 | 送货员工 ID，保留后端历史拼写 | UI + 查询处理器 + 抓包 |
| 付款/核销状态 | `hxState` | integer-like string | `0` 全部；`1` 未付款、`2` 部分付款、`3` 全部付款 | 账款核销状态 | 组件枚举 + 查询处理器 |
| 关联平台单号 | `relationOrderNo` | string | 空 | 关联的平台订单号 | UI + 查询处理器 + 抓包 |
| 来源 | `sourceType` | integer-like string | `0` 全部；`1` 自制订单、`2` 平台订单 | 订单产生来源 | 组件枚举 + 查询处理器 |
| jqGrid 控制 | `_search` / `nd` / `rows` / `page` / `sidx` / `sord` | boolean-like / timestamp / integer / integer / string / string | `false` / 动态 / `100` / `1` / 空 / `asc` | 防缓存、分页和排序 | 抓包 + jqGrid 配置 |

首次自动加载可只携带核心条件；点击“查询”后会明确追加 `salesId/hxState/serviceType/sourceType/delieverId/customType/billStatus`。

成功条件为 `success === true && status === "success"`；失败时读取 `msg` 并 fail closed。响应外层：`success:boolean`、`status:string`、`redirect`、`msg:string`、`data.page:number`、`data.records:number | numeric string`、`data.total:number`、`data.rows:array`。当前响应的 `records` 为 number，历史脱敏响应曾返回数值字符串，调用方应按数值归一化。

| 响应字段/路径 | 类型/可空 | 表格列 | 格式/单位 | 释义 | 证据 |
|---|---|---|---|---|---|
| `data.rows[].id` | string | 隐藏/操作上下文 | ID | 出库单内部 ID | 非空响应 + jqGrid `id` |
| `data.rows[].billDate` | string | 配送日期 | 日期 | 出库/配送日期 | 非空响应 + `colModel` |
| `data.rows[].billNo` | string | 订单编号 | 单号 | 大客户出库单号 | 非空响应 + `colModel` |
| `data.rows[].serviceTypeName` | string | 业务类型 | 文本 | 服务/采购模式显示名 | 非空响应 + `colModel` |
| `data.rows[].saleName` | string/null | 销售人员 | 文本 | 销售员工名称 | 非空响应 + `colModel` |
| `data.rows[].delieverName` | string/null | 送货人员 | 文本 | 送货员工名称 | 非空响应 + `colModel` |
| `data.rows[].billStatus` | string | 状态 | 文本 | 单据状态显示值 | 非空响应 + `colModel` |
| `data.rows[].transTypeName` | string | 业务类别 | 文本 | 大客户销售类别显示名 | 非空响应 + `colModel` |
| `data.rows[].contactName` | string | 客户 | 文本 | 客户名称 | 非空响应 + `colModel` |
| `data.rows[].disRate` | string | 优惠率 | `%` | 整单优惠比例 | 非空响应 + `colModel` |
| `data.rows[].disAmount` | number | 优惠金额 | 元 | 整单优惠金额 | 非空响应 + currency formatter |
| `data.rows[].totalAmount` | number | 销售金额 | 元 | 表格直接展示的订单销售金额 | 非空响应 + currency formatter |
| `data.rows[].postageKz` | string | 服务站配送费 | 元数值字符串 | 服务站配送费 | 非空响应 + currency formatter |
| `data.rows[].totalPurPrice` | number | 成本金额 | 元 | 销售成本 | 非空响应 + currency formatter |
| `data.rows[].totalCost` | number | 毛利金额 | 元 | 字段名像“总成本”，但当前列和计算口径均作毛利使用 | 非空响应 + `colModel` + 金额校验 |
| `data.rows[].userName` | string | 制单人 | 文本 | 单据创建人 | 非空响应 + `colModel` |
| `data.rows[].sourceType` | string | 来源 | 文本/枚举 | 订单来源显示值 | 非空响应 + `colModel` |
| `data.rows[].srcChannelOrder` | string | 关联平台单号 | 单号 | 平台侧关联订单号 | 非空响应 + `colModel` |

非主表列字段：

| 字段 | 当前非空响应类型 | 释义 |
|---|---|---|
| `saCode` | null（该样本） | 兼容配送单编码，当前列已注释 |
| `buName` | string/null | 兼容往来单位/店铺显示名，当前样本为 `null`，历史脱敏响应曾返回文本 |
| `description` | string | 整单备注 |
| `transType` | string | 业务类型编码 |
| `amount` | number | 优惠后金额/应收口径；校验约为 `totalAmount - disAmount` |
| `hxStateCode` | string | 付款/核销状态编码 |
| `rpAmount` | number | 已收/已付核销金额 |
| `serviceType` | string | 业务类型编码 |
| `srcOrderNo` | string | 上游/源订单号 |
| `srcOrderSource` | string | 源订单渠道标记，页面用于决定操作按钮 |

“操作”是前端根据 `id/serviceType/billStatus/srcOrderSource` 生成的派生列，不是响应字段。金额口径已用非空响应校验：`amount ≈ totalAmount - disAmount`，`totalCost ≈ amount - totalPurPrice`，可有分位舍入差。

## 大客户销售退货单

证据等级：B。Agent 线路：条件可执行。页面“查询”产生的主列表 URL、默认参数和 jqGrid 列字段已确认；当前正常页面响应为空，行字段类型/可空性仍待非空响应补证。页面正式 `jsonReader` 已闭环非空列表和分页路径；空结果则使用与普通成功结构不同的精确哨兵。

```http
GET /scm/invCu?action=list&matchCon=&transType=180602&beginDate=<YYYY-MM-DD>&endDate=<YYYY-MM-DD>&relationOrderNo=&_search=false&nd=<timestamp>&rows=100&page=1&sidx=&sord=asc&salesId=0&hxState=0&serviceType=&sourceType=0&delieverId=&customType=&billStatus=
```

| UI 筛选项 | 请求参数 | 类型 | 默认值 | 释义 | 证据 |
|---|---|---|---|---|---|
| 综合搜索 | `matchCon` | string | 空 | 单据号、客户名或厂家产品码 | 查询对象 + 抓包 |
| 固定业务类型 | `transType` | integer-like string | `180602` | 大客户销售退货 | 页面入口 + 抓包 |
| 开始/结束日期 | `beginDate` / `endDate` | `YYYY-MM-DD` | 当前月范围 | 退货单日期范围 | 日期控件 + 抓包 |
| 关联平台退单号 | `relationOrderNo` | string | 空 | 平台侧关联退单编号 | 查询对象 + 抓包 |
| 销售人员 | `salesId` | string/number | `0` 全部 | 销售人员 ID | 查询对象 + 抓包 |
| 收款/核销状态 | `hxState` | string/number | `0` 全部 | 退款/核销状态筛选 | 查询对象 + 抓包 |
| 业务类型 | `serviceType` | string/number | 空全部 | 配送服务业务类型 | 查询对象 + 抓包 |
| 来源 | `sourceType` | string/number | `0` 全部 | 数据/平台来源 | 查询对象 + 抓包 |
| 送货人员 | `delieverId` | string/number | 空 | 送货人员 ID | 查询对象 + 抓包 |
| 客户类型 | `customType` | string/number | 空全部 | 客户分类值 | 查询对象 + 抓包 |
| 单据状态 | `billStatus` | string/number | 空全部 | 退货单状态 | 查询对象 + 抓包 |
| jqGrid 分页/排序 | `rows` / `page` / `sidx` / `sord` | integer/integer/string/string | `100` / `1` / 空 / `asc` | 分页和排序 | 抓包 |

成功解析只允许两种互斥形态：

1. 列表成功：HTTP 200，`data` 为对象，`data.rows` 为数组，且 `data.records`、`data.total` 可归一为非负整数；页面正式 `jsonReader` 分别把它们绑定为列表、总记录数和总页数。按请求页码递增至 `page >= data.total`，每页最多 200。
2. 空结果哨兵：HTTP 200，顶层严格满足 `status === "-1"`、`msg === "没有数据"`、`data` 为长度 0 的数组；只在这四项同时成立时归一为空列表和 0 条记录。

其它响应一律 fail closed，不能仅凭 HTTP 200 当成成功。下面的类型/可空性仍待非空成功响应确认：

| 响应字段 | 表格列 | 格式/单位 | 释义 |
|---|---|---|---|
| `data.rows[].billDate` | 配送日期 | 日期 | 退货/配送业务日期 |
| `data.rows[].billNo` | 订单编号 | 单号 | 大客户退货单号 |
| `data.rows[].serviceTypeName` | 业务类型（当前隐藏） | 文本 | 配送服务类型显示名 |
| `data.rows[].saleName` | 销售人员 | 文本 | 销售人员名称 |
| `data.rows[].delieverName` | 送货人员 | 文本 | 送货人员名称 |
| `data.rows[].billStatus` | 状态 | 状态显示 | 单据状态 |
| `data.rows[].transTypeName` | 业务类别 | 文本 | 退货业务类型显示名 |
| `data.rows[].contactName` | 客户 | 文本 | 客户名称 |
| `data.rows[].disRate` | 优惠率 | `%` | 整单优惠比例 |
| `data.rows[].disAmount` | 优惠金额 | 元 | 优惠金额 |
| `data.rows[].totalAmount` | 销售金额 | 元 | 关联销售/退货金额 |
| `data.rows[].postageKz` | 服务站配送费（当前隐藏） | 元 | 服务站配送费用 |
| `data.rows[].totalPurPrice` | 成本金额 | 元 | 商品成本金额 |
| `data.rows[].totalCost` | 毛利金额 | 元 | 毛利金额；不要仅凭字段名误作成本 |
| `data.rows[].userName` | 制单人 | 文本 | 制单人员名称 |
| `data.rows[].sourceType` | 来源 | 枚举显示 | 数据来源 |
| `data.rows[].srcChannelOrder` | 关联平台退单号 | 单号 | 平台退货单编号 |

## 大客户销售配送/退货明细

证据等级：配送明细 A，退货明细 B。Agent 线路：条件可执行；分类筛选暂不暴露。两页主查询路径、重复 `transType` 参数、筛选项和列绑定均已确认；配送页有非空响应，退货页当前为空。

```http
GET /report/getInitCuSale_detail?transType=180601&customerId=&beginDate=<YYYY-MM-DD>&endDate=<YYYY-MM-DD>&billNo=&productCode=&status=&searchType=1&skuId=&brandId=&categoryTreeAllValue=&transType=180601&_search=false&nd=<timestamp>&rows=1000000&page=1&sidx=billDate&sord=desc&require=
```

退货页使用完全相同的契约，把两处 `transType` 都改为 `180602`。必须保留重复键；前端不是用单个参数覆盖。

| UI 筛选项 | 请求参数 | 类型 | 默认值/枚举 | 释义 | 证据 |
|---|---|---|---|---|---|
| 固定业务类型 | `transType`（重复两次） | integer-like string | 配送 `180601`、退货 `180602` | 区分配送/退货明细 | 页面入口 + 抓包 |
| 客户 | `customerId` | string/number | 空全部 | 客户 ID | 组合框 + 抓包 |
| 开始/结束日期 | `beginDate` / `endDate` | `YYYY-MM-DD` | 当前月范围 | 单据日期范围 | 日期控件 + 抓包 |
| 商品分类 | `categoryTreeAllValue` | string | 当前仅确认发送空键 | 非空选择的候选来源和最终线格式未闭环，Agent 保持为空 | 空值抓包 + 分类组件 |
| 品牌 | `brandId` | string/number | 空 | 品牌 ID | 品牌下拉 + 抓包 |
| 状态 | `status` | integer-like string | 空全部；`1` 待审核、`2` 未通过审核、`3` 已完成 | 单据审核/完成状态 | 下拉枚举 |
| 综合搜索类型 | `searchType` | integer-like string | `1` 大客户销售单号、`2` 物料名称、`3` 物料编码、`4` 产品码 | 决定 `require` 匹配字段 | 下拉枚举 + 抓包 |
| 综合搜索值 | `require` | string | 空 | 按 `searchType` 搜索的关键字 | 输入绑定 + 抓包 |
| 兼容空参数 | `billNo` / `productCode` / `skuId` | string | 空 | 列表脚本保留的历史参数；当前综合输入写入 `require` | 查询对象 + 抓包 |
| 分页/排序 | `rows` / `page` / `sidx` / `sord` | integer/integer/string/string | 页面为 `1000000` / `1` / `billDate` / `desc` | 近似全量页面配置，不是 Agent 默认值；排序固定 `billDate desc` | grid 配置 + 抓包 |

成功条件为 `status === 200`；失败时读取 `msg` 并 fail closed。响应外层为 `status:number`、`msg:string`、`data:object`。非空列表位于 `data.list[]`；成功的空查询可能返回 `data.list === null`，调用方须将 `null` 归一为空数组，其他类型一律 fail closed。配送页当前非空行字段：

该端点最多查询连续 7 天并最多读取 2 MiB；达到上限后必须让用户缩小客户、品牌或搜索条件。较小 `rows` 的可靠分页语义尚未复核，不得自动用 `rows=1000000` 拉取。

| 响应字段/路径 | 类型/可空 | 表格列 | 格式/单位 | 释义 | 证据 |
|---|---|---|---|---|---|
| `data.list[].billDate` | string | 单据日期 | 日期 | 配送单据日期 | 非空响应 + `colModel` |
| `data.list[].billNo` | string | 单据编号 | 单号 | 大客户销售单号 | 非空响应 + `colModel` |
| `data.list[].billStatus` | string | 状态 | 状态码/显示 | 单据状态 | 非空响应 + `colModel` |
| `data.list[].transTypeName` | string | 业务类型 | 文本 | 业务类型显示名 | 非空响应 + `colModel` |
| `data.list[].skuId` | string | 物料编码 | 编码 | 物料编码 | 非空响应 + `colModel` |
| `data.list[].goodsName` | string | 商品名称 | 文本 | 商品显示名称 | 非空响应 + `colModel` |
| `data.list[].invNumber` | string | 原厂商产品码 | 编码 | 厂商产品编号 | 非空响应 + `colModel` |
| `data.list[].brandName` | string | 商品品牌 | 文本 | 品牌名称 | 非空响应 + `colModel` |
| `data.list[].categoryName` | string | 商品分类 | 文本 | 分类名称 | 非空响应 + `colModel` |
| `data.list[].invSpec` | string | 规格型号 | 文本 | 商品规格 | 非空响应 + `colModel` |
| `data.list[].mainUnit` | string | 单位 | 文本 | 主计量单位 | 非空响应 + `colModel` |
| `data.list[].deduction` | string | 折扣额 | 元 | 行级折扣金额 | 非空响应 + `colModel` |
| `data.list[].discountRate` | string | 折扣率 | `%` | 折扣比例 | 非空响应 + `colModel` |
| `data.list[].qty` | string | 订单数量 | 数量 | 配送商品数量 | 非空响应 + `colModel` |
| `data.list[].price` | string | 单价 | 元 | 销售单价 | 非空响应 + `colModel` |
| `data.list[].amount` | number | 合计金额 | 元 | 行销售金额 | 非空响应 + `colModel` |
| `data.list[].totalPurPrice` | number | 成本金额 | 元 | 行成本金额 | 非空响应 + `colModel` |
| `data.list[].totalCost` | number | 毛利金额 | 元 | 行毛利金额 | 非空响应 + `colModel` |

非展示但已确认的上下文字段：`id/sid/iid/contactId/buId/invId` 均为 string ID；`saCode` 当前为 `null`；`billType/transType/invName/carModel/prevPrice/discountPrice/locationId/locationName/locationAreaId/locationAreaName/salesId/delieverId/description/srcOrderEntryId/srcOrderId/srcOrderNo/sourceInfoRowNo/isDelete/taxRate/taxRateCode/buType/goodsStatus/minNum/packSpec/saleModel/productCode` 均为 string。退货页返回同一 `data.list[]` 容器但当前为空，因此只能复用字段契约，类型/可空性仍按 B 级等待非空响应复核。

## 大客户平台订单

证据等级：A。默认 JSON 查询返回 1 行；完整查询对象、筛选枚举、非空字段类型、分页容器和主表列均已确认。

```http
POST /scm/invCu/channelOrder
Content-Type: application/json;charset=UTF-8

{
  "order_no": "",
  "begin_date": "",
  "end_date": "",
  "merchant_code": "",
  "contact_name": "",
  "contact_user": "",
  "mobile": "",
  "status": "",
  "sku_name": "",
  "page": 1,
  "rows": 20
}
```

| UI 筛选项 | JSON 字段 | 类型 | 默认值/枚举 | 释义 | 证据 |
|---|---|---|---|---|---|
| 客户类别 | `merchant_code` | string | 空全部；多选以逗号连接 | `getCarType` 返回类别 ID 的集合 | 组件数组拼接 + 抓包 |
| 客户名称 | `contact_name` | string | 空 | 客户名称关键字 | `v-model` |
| 联系人 | `contact_user` | string | 空 | 收货联系人关键字 | `v-model` |
| 联系方式 | `mobile` | string | 空 | 联系电话关键字 | `v-model` |
| 订单状态 | `status` | string | 空全部；`created` 待审核、`wait_ship` 待发货、`part_ship` 部分发货、`finish` 已完成、`cancel` 取消；多选逗号连接 | 平台订单状态 | 组件枚举 + 数组拼接 |
| 商品名称 | `sku_name` | string | 空 | 商品关键字 | `v-model` |
| 平台单号 | `order_no` | string | 空 | 平台订单编号 | `v-model` |
| 时间 | `begin_date` / `end_date` | string | 空；非空线格式未闭环，Agent 暂不暴露 | 下单时间范围 | 日期范围控件 + 查询对象 |
| 页码/页大小 | `page` / `rows` | integer | `1` / `20` | 分页 | 抓包 + 分页组件 |

成功条件为 `code === 0`；失败时读取顶层 `msg` 并 fail closed。响应为 `code:number`、`msg:string`、`data.total:number`、`data.list[]`。

| 响应字段/路径 | 类型/可空 | 表格列 | 格式/单位 | 释义 | 证据 |
|---|---|---|---|---|---|
| `data.list[].create_time` | string | 时间 | 日期时间 | 订单创建时间 | 非空响应 + `prop` |
| `data.list[].order_no` | string | 平台单号 | 单号 | 当前平台订单编号 | 非空响应 + `prop` |
| `data.list[].merchant_code_text` | string | 客户类别 | 文本 | 客户类别显示名 | 非空响应 + `prop` |
| `data.list[].contact_name` | string | 客户名称 | 文本 | 客户名称 | 非空响应 + `prop` |
| `data.list[].address` | string | 客户地址 | 地址 | 收货/经营地址 | 非空响应 + `prop` |
| `data.list[].contact_user` | string | 联系人 | 文本 | 收货联系人 | 非空响应 + `prop` |
| `data.list[].mobile` | string | 联系方式 | 电话 | 联系电话 | 非空响应 + `prop` |
| `data.list[].goods_num` | numeric string | 商品数量 | 数量 | 订单商品总数量 | 非空响应 + `prop` |
| `data.list[].shiped_num` | numeric string | 已发货商品数量 | 数量 | 已发货数量 | 非空响应 + `prop` |
| `data.list[].total_amount` | numeric string | 订单总额 | 元 | 订单总金额 | 非空响应 + `prop` |
| `data.list[].status_text` | string | 订单状态 | 文本 | 状态显示名 | 非空响应 + `prop` |
| `data.list[].remark` | string | 备注 | 文本 | 订单备注 | 非空响应 + `prop` |

非展示但已确认字段：`id`、`sid`、`contact_id`、`source_shop_id` 均为 string ID；`scene_code`、`merchant_code`、`source_order_no`、`status` 为来源/类别/状态代码；`submit_time`、`finish_time`、`modify_time`、`begin_date`、`end_date` 为 string；`goods_amount`、`cost_amount`、`profit_amount`、`postage`、`receipt_num` 为 numeric string；`wait_ship_num` 为 number；`approve_user`、`approve_remark` 为 string。

地址、联系人和电话属于个人信息，默认只返回完成任务所需的最少字段。创建、复制、配置、审核、出库和打印均会改变业务状态或生成外部结果，禁止调用。

## 大客户平台退单

证据等级：B。真实 JSON 请求、筛选枚举、空响应外层和全部主表列已确认；当前结果为空，行类型/可空性待非空响应补证。

```http
POST /scm/invCu/channelAftersale
Content-Type: application/json;charset=UTF-8

{
  "order_no": "",
  "refund_no": "",
  "begin_date": "",
  "end_date": "",
  "merchant_code": "",
  "contact_name": "",
  "contact_user": "",
  "mobile": "",
  "status": "",
  "sku_name": "",
  "page": 1,
  "rows": 20
}
```

| UI 筛选项 | JSON 字段 | 类型 | 默认值/枚举 | 释义 | 证据 |
|---|---|---|---|---|---|
| 客户类别 | `merchant_code` | string | 空全部；多选值以逗号连接 | `getCarType` 返回的客户类别 ID 集合 | 组件数组拼接 + 抓包 |
| 客户名称 | `contact_name` | string | 空 | 客户名称关键字 | `v-model` + 抓包 |
| 联系人 | `contact_user` | string | 空 | 收货联系人关键字 | `v-model` + 抓包 |
| 联系方式 | `mobile` | string | 空 | 联系电话关键字 | `v-model` + 抓包 |
| 退单状态 | `status` | string | 空全部；`pass` 待收货、`finish` 已完成、`reject` 已拒绝；多选逗号连接 | 平台售后状态 | 组件枚举 + 数组拼接 + 抓包 |
| 商品名称 | `sku_name` | string | 空 | 退货商品关键字 | `v-model` + 抓包 |
| 平台订单号 | `order_no` | string | 空 | 原平台订单编号 | `v-model` + 抓包 |
| 平台退货单号 | `refund_no` | string | 空 | 平台售后/退货编号 | `v-model` + 抓包 |
| 时间 | `begin_date` / `end_date` | string | 空；组件补 `00:00:00` / `23:59:59`，完整线格式未抓到，Agent 暂不暴露 | 退单创建时间范围 | 日期范围组件 + 查询对象 |
| 页码/页大小 | `page` / `rows` | integer | `1` / `20`；UI 可选 `20/50/100` | 分页 | 抓包 + 分页组件 |

成功条件为 `code === 0`；失败时读取顶层 `msg` 并 fail closed。当前空响应为 `code:number`、`msg:string`、`data.total:number`、`data.list:[]`。

| 响应字段/路径 | 类型/可空 | 表格列 | 格式/单位 | 释义 | 证据 |
|---|---|---|---|---|---|
| `data.list[].create_time` | 待非空响应确认 | 时间 | 日期时间 | 退单创建时间 | 组件 `prop` |
| `data.list[].refund_no` | 待非空响应确认 | 平台退货单号 | 单号 | 平台售后/退货编号 | 组件 `prop` |
| `data.list[].order_no` | 待非空响应确认 | 平台订单号 | 单号 | 原平台订单编号 | 组件 `prop` |
| `data.list[].merchant_code_text` | 待非空响应确认 | 客户类别 | 文本 | 客户类别显示名 | 组件 `prop` |
| `data.list[].contact_name` | 待非空响应确认 | 客户名称 | 文本 | 客户名称 | 组件 `prop` |
| `data.list[].address` | 待非空响应确认 | 客户地址 | 地址 | 客户收货/经营地址 | 组件 `prop` |
| `data.list[].contact_user` | 待非空响应确认 | 联系人 | 文本 | 收货联系人 | 组件 `prop` |
| `data.list[].mobile` | 待非空响应确认 | 联系方式 | 电话 | 联系电话 | 组件 `prop` |
| `data.list[].total_num` | 待非空响应确认 | 退货数量 | 数量 | 退货商品总数量 | 组件 `prop` |
| `data.list[].total_amount` | 待非空响应确认 | 退单总额 | 元 | 退货金额合计 | 组件 `prop` |
| `data.list[].status_text` | 待非空响应确认 | 退单状态 | 文本 | 状态显示名 | 组件 `prop` |
| `data.list[].apply_remark` | 待非空响应确认 | 备注 | 文本 | 退货申请备注 | 组件 `prop` |

组件还读取 `data.list[].status`（string 枚举）来决定是否显示“收货”操作；当前空响应无法证明其实际可空性。“序号”和“操作”均是前端派生列。

详情、收货入库、拒绝等后续动作会改变业务状态，禁止调用。地址、联系人和手机号属于个人信息：Agent 只在用户明确询问时返回必要字段，不得持久化真实值。

## 普通客户销售明细

证据等级：A。Agent 线路：条件可执行；普通无商品条件查询可用，商品候选仍受 `kziv` 页面会话依赖。普通端点与“计算毛利”端点的真实查询、各 1711 行非空响应、查询处理器、jqGrid `colModel` 和页脚汇总绑定均已确认。

```http
GET /report/salesDetail_detail?action=detail&beginDate=<YYYY-MM-DD>&endDate=<YYYY-MM-DD>&customerNo=&goodsNo=&storageNo=&brandId=&cateoryTreeValue=&categoryTreeAllValue=&saleType=-1&kzCategoryIds=%5B%5D&action=sales_detail&_search=false&nd=<timestamp>&rows=3000&page=1&sidx=date&sord=desc&salesId=
```

“计算毛利”不发送布尔请求参数，而是切换到带 `_cost` 后缀的端点：

```http
GET /report/salesDetail_detail_cost?action=detail&...&action=sales_detail
```

真实请求有两个 `action`：先 `detail`，后 `sales_detail`。使用 `URLSearchParams.append` 保留重复键，不要用普通对象序列化将前一个覆盖。

| UI 筛选项 | 请求参数 | 类型 | 默认值/枚举 | 释义 | 证据 |
|---|---|---|---|---|---|
| 日期 | `beginDate` / `endDate` | `YYYY-MM-DD` | 两个键都发送；Agent 默认最多连续 7 天 | 销售业务日期起止 | UI + 查询处理器 + 抓包 |
| 客户 | `customerNo` | comma-separated string | 空值发送空键；多选如 `<customerNumber1>,<customerNumber2>` | 客户选择器的 `number` 以逗号连接 | `data('numbers')` + `numbers.join(',')` + 抓包 |
| 商品 | `goodsNo` | comma-separated string | 空值发送空键；多选如 `<goodsId1>,<goodsId2>` | 商品选择器的 `id` 以逗号连接；参数名中的 `No` 不代表业务编号 | `data('ids')` + `ids.join(',')` + 抓包 |
| 仓库 | `storageNo` | comma-separated string | 空值发送空键；多选如 `<locationNo1>,<locationNo2>` | 仓库选择器的 `number/locationNo` 以逗号连接 | `data('numbers')` + `numbers.join(',')` + 抓包 |
| 业务员 | `salesId` | comma-separated string | 空值发送空键；多选如 `<employeeNumber1>,<employeeNumber2>` | 员工 `number` 以逗号连接；这里不取员工 `id` | `data('numbers')` + `numbers.join(',')` + [来源映射](./lookups.md#员工) |
| 品牌 | `brandId` | comma-separated string | 空值发送空键；多选如 `<brandId1>,<brandId2>` | 通用品牌 `id` 以逗号连接 | `data('ids')` + `ids.join(',')` + 抓包 |
| 三方类别（老树） | `cateoryTreeValue` | string | 空值发送空键；非空为单个节点 `id` | 候选来自 `/basedata/assist?action=list&typeNumber=trade&isDelete=2`；保留后端拼写 `cateory` | 老树 `getValue()` + 请求构造 |
| 快准类别（新级联） | `kzCategoryIds` | JSON array string | 空值固定 `[]`；多选为叶节点 ID 数组的 JSON 字符串 | 候选来自 `GET /basedata/Category/tree`，组件 `emitPath=false`、`multiple=true` | 级联配置 + `JSON.stringify` + 抓包 |
| 历史快准类别（老树） | `categoryTreeAllValue` | string | 当前控件隐藏，正常请求发送空键 | 候选来自 `/basedata/assist?action=kzlist&typeNumber=trade&isDelete=2`；若恢复控件则提交单个节点 `id` | 老树 `getValue()` + 请求构造 |
| 订单类型 | `saleType` | integer-like string | `-1` 全部；`0` 销售、`1` 铺货、`2` 微仓铺货 | 销售单类型 | UI 枚举 + 抓包 |
| 计算毛利 | 端点 `_cost` 后缀 | boolean UI | 默认关闭，且可按权限隐藏 | 选择是否返回成本/毛利字段 | UI + 端点选择逻辑 + 两类抓包 |
| jqGrid 控制 | `_search` / `nd` / `rows` / `page` / `sidx` / `sord` | boolean-like / timestamp / integer / integer / string / string | 页面为 `false` / 动态 / `3000` / `1` / `date` / `desc` | `rows=3000` 是页面近似全量配置，不是 Agent 默认值；排序固定 `date desc` | 抓包 + jqGrid 配置 |

最终线格式示例（占位符均须 URL 编码；这里不含任何真实业务值）：

```text
customerNo=<customerNumber1>,<customerNumber2>&goodsNo=<goodsId1>,<goodsId2>&storageNo=<locationNo1>,<locationNo2>&salesId=<employeeNumber1>,<employeeNumber2>&brandId=<brandId1>,<brandId2>&cateoryTreeValue=<thirdPartyCategoryId>&categoryTreeAllValue=&kzCategoryIds=%5B%22<kzLeafId1>%22%2C%22<kzLeafId2>%22%5D
```

多选顺序不承担名称配对语义；每个参数只发送其规定的 ID/编号，不发送对应显示名。

普通与 `_cost` 端点的成功条件均为 `status === 200`；结构不符时 fail closed。两者均返回 `status:number`、`data.rows:array`、`data.userdata:object`；当前真实响应没有 `records/total`，页面使用 `loadonce` 直接加载行数组。

| 响应字段/路径 | 类型/可空 | 表格列 | 格式/单位 | 释义 | 证据 |
|---|---|---|---|---|---|
| `data.rows[].date` | string | 销售日期 | 日期 | 销售业务日期 | 非空响应 + `colModel` |
| `data.rows[].billNo` | string | 销售单据号 | 单号 | 销售单号 | 非空响应 + `colModel` |
| `data.rows[].transTypeName` | string | 业务类别 | 文本 | 业务类型显示名 | 非空响应 + `colModel` |
| `data.rows[].billNoTypeStr` | string | 订单类型 | 文本 | 销售/铺货/微仓铺货等显示值 | 非空响应 + `colModel` |
| `data.rows[].salesName` | string/null | 销售人员 | 文本 | 销售员工名称 | 非空响应 + `colModel` |
| `data.rows[].delieverName` | string/null | 送货员 | 文本 | 送货员工名称 | 非空响应 + `colModel` |
| `data.rows[].buName` | string | 客户 | 文本 | 客户名称 | 非空响应 + `colModel` |
| `data.rows[].cCategoryName` | string | 客户类型 | 文本 | 客户分类显示名 | 非空响应 + `colModel` |
| 配置字段 `type` | 当前响应未返回 | 商品属性 | 文本 | `colModel` 已声明，但当前 1711 行样本均无此键；不得伪造值 | `colModel` + 非空响应字段集 |
| `data.rows[].skuId` | string/null | 物料编码 | 编码 | 站内 SKU/物料编码 | 非空响应 + `colModel` |
| `data.rows[].number` | string | 原厂商产品码 | 编码 | 厂家商品编码 | 非空响应 + `colModel` |
| `data.rows[].name` | string | 商品名称 | 文本 | 商品显示名称 | 非空响应 + `colModel` |
| `data.rows[].productCode` | string/null | 快准产品码 | 编码 | 快准体系产品码 | 非空响应 + `colModel` |
| `data.rows[].brandName` | string/null | 品牌名称 | 文本 | 商品品牌显示名 | 非空响应 + `colModel` |
| `data.rows[].firstCategoryName` | string | 商品一级分类 | 文本 | 一级分类显示名 | 非空响应 + `colModel` |
| `data.rows[].secondCategoryName` | string | 商品二级分类 | 文本 | 二级分类显示名 | 非空响应 + `colModel` |
| `data.rows[].categoryName` | string | 商品分类 | 文本 | 商品分类显示名 | 非空响应 + `colModel` |
| `data.rows[].spec` | string/null | 规格型号 | 文本 | 商品规格型号 | 非空响应 + `colModel` |
| `data.rows[].packSpec` | string/null | 包装规格 | 文本 | 销售/包装规格 | 非空响应 + `colModel` |
| `data.rows[].unit` | string | 单位 | 文本 | 计量单位 | 非空响应 + `colModel` |
| `data.rows[].location` | string | 仓库 | 文本 | 出库仓库名称 | 非空响应 + `colModel` |
| `data.rows[].areaNo` | string | 货位 | 编码/文本 | 货位号；空值时页面显示“已删除” | 非空响应 + formatter |
| `data.rows[].qty` | number | 数量 | 数量 | 销售数量 | 非空响应 + currency formatter |
| `data.rows[].unitPrice` | string | 单价 | 元数值字符串 | 销售单价 | 非空响应 + currency formatter |
| `data.rows[].amount` | number | 订单金额 | 元 | 优惠前销售金额 | 非空响应 + currency formatter |
| `data.rows[].disAmount` | string | 优惠金额 | 元数值字符串 | 销售优惠金额 | 非空响应 + currency formatter |
| `data.rows[].recAmount` | number | 应收金额 | 元 | 优惠后应收/净销售金额 | 非空响应 + currency formatter |
| `data.rows[].description` | string | 备注 | 文本 | 行或关联单据备注 | 非空响应 + `colModel` |

当选择 `_cost` 端点时，每行额外返回：

| 响应字段 | 类型 | 表格列 | 格式/单位 | 释义 | 证据 |
|---|---|---|---|---|---|
| `data.rows[].unitCost` | string | 成本价 | 元数值字符串 | 单位成本 | `_cost` 非空响应 + `colModel` |
| `data.rows[].cost` | number | 销售成本 | 元 | 该销售明细行的总成本 | `_cost` 非空响应 + `colModel` |
| `data.rows[].saleProfit` | number | 销售毛利 | 元 | 应收口径减销售成本，可有分位舍入差 | `_cost` 非空响应 + `colModel` + 金额校验 |
| `data.rows[].salepPofitRate` | string | 毛利率 | `%` 字符串 | 销售毛利率，保留后端历史拼写 | `_cost` 非空响应 + `colModel` |

非主表列但已在非空响应中确认的上下文字段：`billId:string` 销售单 ID、`billType:string` 单据类型、`buId:number` 客户 ID、`minNum:string` 兼容数量字段、`transType:string` 业务类型编码。`minNum` 当前无可见列或正式后端释义，不仅凭字段名扩大语义。

`data.userdata` 是 jqGrid 页脚汇总对象：`qty:number`、`amount:number`、`disAmount:number`、`recAmount:number`；`_cost` 端点还会将 `cost:number`、`saleProfit:number`、`salepPofitRate:string` 写入页脚。`unitPrice/unitCost` 在页脚为字符串占位，不应解读为可直接求和的单价。`_cost` 响应还有 `data.profit:number`，但当前表格代码未绑定它，与页脚 `saleProfit` 也不相等，因此仅记为后端附加毛利指标，不自行猜测口径。

金额口径已逐行校验：`recAmount = amount - disAmount`，销售收入取 `recAmount`，销售成本取 `cost`；`saleProfit ≈ recAmount - cost`，可有分位舍入差。

该端点没有可靠的 `records/total` 分页语义。Agent 最多查询连续 7 天，优先要求客户、商品或仓库之一；最多读取 2 MiB，超限即停止并提示缩小范围，不得自动复制页面的 3000 行近似全量策略。`_cost` 端点还涉及经营敏感值，只有用户明确要求且权限允许时才能切换。

## 销售汇总

证据等级：A。Agent 线路：条件可执行；旧分类筛选和依赖 `kziv` 的商品候选筛选暂不暴露。按商品、按客户两个页签的真实请求、非空响应、不同列表容器、动态仓库列和固定 `colModel` 均已确认。

```http
GET /report/salesDetail_inv?action=inv&beginDate=<YYYY-MM-DD>&endDate=<YYYY-MM-DD>&customerNo=&goodsNo=&storageNo=&brandId=&cateoryTreeValue=&categoryTreeAllValue=&_search=false&nd=<timestamp>&rows=1000000&page=1&sidx=date&sord=desc
```

按客户：

```http
GET /report/salesDetail_customer?action=customer&beginDate=<YYYY-MM-DD>&endDate=<YYYY-MM-DD>&customerNo=&goodsNo=&storageNo=&brandId=&cateoryTreeValue=&categoryTreeAllValue=&_search=false&nd=<timestamp>&rows=1000000&page=1&sidx=date&sord=desc
```

“计算毛利”不是普通布尔参数。组件启用该开关时选择带 `_cost` 后缀的查询端点（`salesDetail_inv_cost` / `salesDetail_customer_cost`），并显示成本、毛利列；当前账号页面把该开关隐藏，不能在 Agent 中假定有成本权限。

| UI 筛选项 | 请求参数 | 类型 | 默认值 | 释义 | 证据 |
|---|---|---|---|---|---|
| 汇总页签 | 路径 + `action` | string | 商品：`salesDetail_inv` + `inv`；客户：`salesDetail_customer` + `customer` | 选择汇总维度 | 页签处理器 + 抓包 |
| 开始/结束日期 | `beginDate` / `endDate` | `YYYY-MM-DD` | 当前月范围 | 销售统计期间 | 日期控件 + 抓包 |
| 客户 | `customerNo` | string/number | 空值发送空键；当前只允许单选 | 按商品页签取客户 `id`；按客户页签取客户 `number` | 组件绑定 + 抓包 + [来源映射](./lookups.md#首页主数据集合) |
| 商品 | `goodsNo` | string/number | 空值发送空键；当前只允许单选 | 两个页签都取商品 `id`；候选线路依赖页面解码 | 组件绑定 + 抓包 + [来源映射](./lookups.md#商品选择器) |
| 仓库 | `storageNo` | string/number | 按商品页签空值发送空键、当前只允许单选；按客户页签不提交仓库条件 | 按商品页签取仓库 `locationNo` | 组件绑定 + 抓包 + [来源映射](./lookups.md#普通仓库) |
| 品牌 | `brandId` | string/number | 空全部 | 品牌 ID | 组件绑定 + 抓包 |
| 旧分类兼容值 | `cateoryTreeValue` | string | 当前只确认发送空键 | 本页未取得非空选择与候选 `action` 的绑定，Agent 保持为空 | 空值抓包 |
| 旧分类完整值 | `categoryTreeAllValue` | string | 当前只确认发送空键 | 本页未取得非空选择的精确来源与线格式，Agent 保持为空 | 空值抓包 |
| 计算毛利 | 端点 `_cost` 后缀 | boolean UI | 默认关闭/可能按权限隐藏 | 是否请求成本、毛利字段 | 组件端点选择逻辑 |
| 分页/排序 | `rows` / `page` / `sidx` / `sord` | integer/integer/string/string | 页面为 `1000000` / `1` / `date` / `desc` | 近似全量页面配置，不是 Agent 默认值；排序固定 `date desc` | grid 配置 + 抓包 |

两个端点的成功条件均为 `status === 200`；失败时读取 `msg` 并 fail closed。响应容器不同：按商品的非空结果是 `data.rows[]`，并带 `data.page:number`、`data.records:string`、`data.total:number`、`data.stoNames:array`、`data.userdata:object`；成功的空查询可能直接返回 `data:[]`，应归一为空列表。按客户是 `data.list[]`，并带 `data.total:object`。不能用同一个 `rows` 解析器处理两者，除上述空数组外遇到其它形态须 fail closed。

页面的 `rows=1000000` 不能进入 Agent 配置。两个汇总端点最多查询连续 7 天并最多读取 2 MiB；达到上限时让用户缩小客户/商品范围。较小 `rows` 是否提供可靠续页尚未复核，因此不能声称结果可自动翻页补全。

公共非空行字段：

| 响应字段 | 类型/可空 | 表格列 | 格式/单位 | 释义 |
|---|---|---|---|---|
| `billId` / `billNo` / `billType` | string | 隐藏/明细上下文 | ID/单号/类型 | 来源单据 ID、编号和类型 |
| `date` | string | 明细上下文 | 日期 | 销售日期 |
| `buId` | number | 隐藏 | ID | 客户 ID |
| `buName` | string | 客户（按客户可见；按商品隐藏） | 文本 | 客户名称 |
| `number` | string | 原厂商产品码 | 编码 | 原厂商产品编号 |
| `productCode` | string/null | 快准产品码 | 编码 | 快准产品编码 |
| `name` | string | 商品名称 | 文本 | 商品显示名称 |
| `spec` | string/null | 规格型号 | 文本 | 商品规格 |
| `unit` | string | 单位 | 文本 | 计量单位 |
| `minNum` | string | 未显示 | 数量文本 | 最小包装/订货数量上下文 |
| `packSpec` | string/null | 包装规格 | 文本 | 包装规格 |
| `location` / `locationNo` | string | 仓库上下文/仓库编码（隐藏） | 文本/编码 | 仓库名称与编码 |
| `skuId` | string/null | 物料编码 | 编码 | 物料编码 |
| `invId` | string | 商品 ID（隐藏） | ID | 商品内部 ID |
| `brandName` | string/null | 商品品牌 | 文本 | 品牌名称 |
| `categoryName` | string | 商品分类 | 文本 | 分类名称 |
| `cCategoryName` | null（当前样本） | 未显示 | 文本 | 客户分类兼容字段，当前样本为空 |
| `salesName` | string/null | 未显示 | 文本 | 销售人员名称 |
| `transType` | string | 业务上下文 | 编码 | 销售业务类型编码 |
| `qty` | string | 销售数量 | 数量 | 销售数量 |
| `unitPrice` | string | 单价 | 元 | 销售单价 |
| `amount` | string | 销售金额 | 元 | 优惠前/列表口径销售金额 |
| `disAmount` | string | 优惠金额 | 元 | 优惠金额 |
| `recAmount` | string | 应收金额 | 元 | 应收金额 |

按商品额外返回 `storage:string`、`transTypeName:string` 以及一个或多个 `count_<locationId>:string`。动态列定义来自 `data.stoNames[]`：仓库对象提供 `id/name/locationList`，`locationList[]` 提供 `id/sid/name/colIndex`；行字段 `count_<locationId>` 与对应 `colIndex` 绑定。按客户额外返回 `baseQty:number`。

固定列配置还声明 `buNo` 客户编码、`unitCost` 单位成本、`cost` 销售成本、`saleProfit` 销售毛利、`salepPofitRate` 毛利率；这些成本字段只应在 `_cost` 响应实际出现且用户有权限时使用，不能从普通端点缺失字段推算。

## 销售对账明细

证据等级：A。真实查询 URL、非空响应、筛选枚举、固定字段和动态支付方式列均已确认。

```http
GET /Report/getSaleBalance?action=detail&matchCon=&type=0&payStatus=-1&buId=0&saleType=-1&beginDate=<YYYY-MM-DD>&endDate=<YYYY-MM-DD>
```

| UI 筛选项 | 请求参数 | 类型 | 默认值/枚举 | 释义 | 证据 |
|---|---|---|---|---|---|
| 销售出库单号 | `matchCon` | string | 空 | 出库单号关键字 | 输入绑定 + 抓包 |
| 拆分类型 | `type` | integer-like string | `0` 支付方式、`1` 账户 | 动态收款列按支付方式或账户拆分 | 下拉枚举 + 抓包 |
| 收款状态 | `payStatus` | integer-like string | `-1` 全部、`1` 全部收款、`2` 欠款 | 应收结清状态 | 下拉枚举 + 抓包 |
| 客户 | `buId` | string/number | `0` 全部 | 客户 ID | 客户组件 + 抓包 |
| 订单类型 | `saleType` | integer-like string | `-1` 全部、`0` 销售、`1` 铺货、`2` 微仓铺货 | 原销售订单类型 | 下拉枚举 + 抓包 |
| 开始/结束日期 | `beginDate` / `endDate` | `YYYY-MM-DD` | 当前月范围 | 销售制单日期范围 | 日期控件 + 抓包 |

成功条件为 `status === 200`；失败时读取 `msg` 并 fail closed。响应外层为 `status:number`、`msg:string`、`data:object`。列表位于 `data.rows[]`，`data.colIndex[]` 与 `data.colNames[]` 定义动态金额列，`data.total` 给出合计；`data.stoNames` 当前为 string 兼容字段。

| 响应字段/路径 | 类型/可空 | 表格列 | 格式/单位 | 释义 | 证据 |
|---|---|---|---|---|---|
| `data.rows[].id` | string | ID | ID | 对账行 ID | 非空响应 + `colModel` |
| `data.rows[].transType` | number | 订单类型 | 枚举 | 销售/铺货等订单类型编码 | 非空响应 + formatter |
| `data.rows[].billNo` | string | 销售出库单号 | 单号 | 出库单业务编号 | 非空响应 + `colModel` |
| `data.rows[].billDate` | string | 销售制单日期 | 日期 | 销售/出库制单日期 | 非空响应 + `colModel` |
| `data.rows[].buId` | string | 隐藏 | ID | 客户 ID | 非空响应 |
| `data.rows[].buName` | string | 客户 | 文本 | 客户名称 | 非空响应 + `colModel` |
| `data.rows[].storeId` | string | 隐藏 | ID | 门店 ID | 非空响应 |
| `data.rows[].storeName` | string | 门店名称 | 文本 | 门店名称 | 非空响应 + `colModel` |
| `data.rows[].payType` | string | 收款类型 | 文本/编码 | 收款方式显示上下文 | 非空响应 + `colModel` |
| `data.rows[].amount` | number | 销售金额 | 元 | 本单销售金额 | 非空响应 + `colModel` |
| `data.rows[].amount_<paymentMethodId>` | number | 动态支付方式/账户列 | 元 | 字段名来自 `data.colIndex[]`，标题来自同位置 `data.colNames[]` | 非空响应 + 动态列逻辑 |
| `data.rows[].reAmount` | number | 小计 | 元 | 动态收款金额小计 | 非空响应 + `colModel` |
| `data.rows[].diffAmount` | number | 折让金额 | 元 | 收款折让金额 | 非空响应 + `colModel` |
| `data.rows[].resAmount` | number | 应收余额 | 元 | 未收应收余额 | 非空响应 + `colModel` |

`data.total` 含各 `amount_<paymentMethodId>` 合计，以及 `totalAmount` 销售金额合计、`totalDiffAmount` 折让合计、`totalReAmount` 收款小计合计、`totalResAmount` 应收余额合计，类型均为 number。

## 明确排除的销售写流程

商品报价、快速报价、销售单、销售退货单、商品调拨单、大客户销售出库单、大客户销售退货单属于创建/变更业务单据流程，不纳入查询 Agent 工具集。管理列表即使包含编辑、打印、收款、审核、退款、复制等按钮，也只能使用其查询动作。
