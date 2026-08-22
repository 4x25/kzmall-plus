# 库存查询接口

本页出现的商品、仓库、品牌、分类和业务类型 ID/编码参数，其获取接口与字段映射统一见[查询参数 ID / 编码来源](./lookups.md)。特别注意 `goodsNo`、`storageNo` 在这些报表中取业务编码，而不是仅凭参数后缀推断。

## 库存余额

证据等级：A。Agent 线路：条件可执行；不带商品筛选可直接查询，商品候选仍受 `kziv` 页面会话依赖；旧分类和货位筛选在来源/非空线格式分别闭环前保持隐藏。

```http
GET /report/invBalance?action=detail&goods=&goodsNo=&storage=&storageNo=&catId=&catName=&brandId=&area=false&zero=false&negative=false&carModel=false&area_name=
```

仓库早期脱敏的正常 UI 请求还确认了成本版端点；该次查询主动开启了零库存和车型显示，因此其中的 `zero=true`、`carModel=true` 是样本筛选值，不是页面默认值：

```http
GET /report/invBalance_cost?action=detail&goods=&goodsNo=&storage=&storageNo=&catId=&catName=&brandId=&area=false&zero=true&negative=false&carModel=true&area_name=
```

本轮未重新勾选“显示成本毛利”，所以 `_cost` 路径及其成本字段保留为历史非空响应证据，普通端点和当前默认值则以本轮抓包为准。

| UI 筛选项 | 请求参数 | 类型 | 默认值/枚举 | 释义 | 证据 |
|---|---|---|---|---|---|
| 固定查询动作 | `action` | string | `detail` | 库存余额明细查询 | 抓包 |
| 商品 | `goods` / `goodsNo` | string | 空 | 商品选择器分别提交商品 `id` 与 `number`；显示名不进入这两个字段 | UI + 抓包 + [来源映射](./lookups.md#商品选择器) |
| 仓库 | `storage` / `storageNo` | string | 空 | 仓库选择器分别提交 `id` 与 `locationNo` | UI + 抓包 + [来源映射](./lookups.md#普通仓库) |
| 商品类别 | `catId` / `catName` | string/number + string | 空；本页候选 `action` 与双字段非空线格式未闭环，Agent 暂不暴露 | 类别 ID 与显示名必须来自同一节点 | UI + 空值抓包 |
| 品牌 | `brandId` | string/number | 空 | 品牌 ID | UI + 抓包 |
| 显示货位 | `area` | boolean-like string | `false` | 是否展开货位维度 | UI + 抓包 |
| 显示零库存 | `zero` | boolean-like string | `false` | 是否保留零库存商品；旧笔记中的 `true` 是特定查询值 | UI + 抓包 |
| 显示负库存 | `negative` | boolean-like string | `false` | 是否保留负库存商品 | UI + 抓包 |
| 显示车型 | `carModel` | boolean-like string | `false` | 是否展示适用车型 | UI + 抓包 |
| 货位 | `area_name` | string | 空；候选来源和非空提交样本未闭环，Agent 暂不暴露 | 指定货位过滤；不得自行拼接货位显示名 | UI + 空值抓包 |

页面另有“显示成本毛利”复选框。本轮为避免暴露经营敏感值未勾选；历史脱敏响应已确认成本版行字段可包含 `cost_1`、`allcost_1`、`cost_2`、`allcost_2`、`cost_3`、`allcost_3`。

成功条件为 `status === 200`；失败时读取 `msg` 并 fail closed。响应外层：`status`、`msg`、`data`；`data` 常见 `total`、`page`、`records`、`rows`。

| 响应字段/路径 | 类型/可空 | 表格列 | 格式/单位 | 释义 | 证据 |
|---|---|---|---|---|---|
| `data.rows[].invId` | string/number | 商品 ID | ID | 商品主键 | 非空响应 + jqGrid 列配置 |
| `data.rows[].invNo` | string | 原厂产品码 | 编码 | 厂商商品编号 | 非空响应 + jqGrid 列配置 |
| `data.rows[].invName` | string | 商品名称 | 文本 | 商品显示名称 | 非空响应 + jqGrid 列配置 |
| `data.rows[].skuId` | string | 物料编码 | 编码 | 站内 SKU/物料编码 | 非空响应 + jqGrid 列配置 |
| `data.rows[].simpleCode` | string/可空 | 产品简码 | 编码 | 商品简码 | 非空响应 + jqGrid 列配置 |
| `data.rows[].spec` | string/可空 | 规格型号 | 文本 | 商品规格 | 非空响应 + jqGrid 列配置 |
| `data.rows[].unit` | string/可空 | 单位 | 文本 | 基本计量单位 | 非空响应 + jqGrid 列配置 |
| `data.rows[].packSpec` | string/可空 | 包装规格 | 文本 | 包装换算说明 | 非空响应 + jqGrid 列配置 |
| `data.rows[].minNum` | string/可空 | 未显示 | 数量文本 | 历史响应中的最小包装/订货数量上下文；正式后端释义待确认 | 历史脱敏响应 |
| `data.rows[].brandName` | string/可空 | 品牌 | 文本 | 品牌名称 | 非空响应 + jqGrid 列配置 |
| `data.rows[].categoryName` | string/可空 | 商品类别 | 文本 | 分类名称 | 非空响应 + jqGrid 列配置 |
| `data.rows[].carModel` | string/可空 | 适用车型 | 文本 | 适配车型 | 非空响应 + jqGrid 列配置 |
| `data.rows[].in_time` | string/可空 | 最近入库时间 | 日期时间 | 最近一次入库时间 | 非空响应 + jqGrid 列配置 |
| `data.rows[].out_time` | string/可空 | 最近出库时间 | 日期时间 | 最近一次出库时间 | 非空响应 + jqGrid 列配置 |
| `data.rows[].area` | string/可空 | 货位 | 文本 | 当前货位 | 非空响应 + jqGrid 列配置 |
| `data.rows[].qty_1` | number/string | 所有仓库库存 | 件/基本单位 | 全部仓库数量合计 | 非空响应 + 分组列配置 |
| `data.rows[].cost_1` | number/string/可空 | 所有仓库单位成本 | 元/单位 | 成本版可见 | 早期脱敏响应 + 分组列配置 |
| `data.rows[].allcost_1` | number/string/可空 | 所有仓库库存成本 | 元 | 数量乘单位成本的汇总口径 | 早期脱敏响应 + 分组列配置 |
| `data.rows[].qty_2` | number/string | 快准仓库存 | 件/基本单位 | 快准仓数量 | 非空响应 + 分组列配置 |
| `data.rows[].cost_2` | number/string/可空 | 快准仓单位成本 | 元/单位 | 成本版可见 | 早期脱敏响应 + 分组列配置 |
| `data.rows[].allcost_2` | number/string/可空 | 快准仓库存成本 | 元 | 快准仓成本合计 | 早期脱敏响应 + 分组列配置 |
| `data.rows[].qty_3` | number/string | 三方仓库存 | 件/基本单位 | 三方仓数量 | 非空响应 + 分组列配置 |
| `data.rows[].cost_3` | number/string/可空 | 三方仓单位成本 | 元/单位 | 成本版可见 | 早期脱敏响应 + 分组列配置 |
| `data.rows[].allcost_3` | number/string/可空 | 三方仓库存成本 | 元 | 三方仓成本合计 | 早期脱敏响应 + 分组列配置 |

早期字段清单还曾单独列出 `key`，但同一份非空 JSON 样本和本轮响应/列配置均未出现该键，因此不把它列入可用响应契约。

## 货位调整记录

证据等级：A。

```http
GET /basedata/area/changeShow?action=changeShow&matchCon=&beginDate=<YYYY-MM-DD>&endDate=<YYYY-MM-DD>&_search=false&nd=<timestamp>&rows=100&page=1&sidx=number&sord=desc
```

| UI 筛选项 | 请求参数 | 类型 | 默认值/枚举 | 释义 | 证据 |
|---|---|---|---|---|---|
| 固定查询动作 | `action` | string | `changeShow` | 货位调整记录列表 | 抓包 + 查询配置 |
| 综合搜索 | `matchCon` | string | 空 | 单据号或备注 | UI + 查询配置 |
| 单据日期 | `beginDate` / `endDate` | `YYYY-MM-DD` | 页面日期范围 | 货位调整单日期范围 | UI + 抓包 |
| jqGrid 查询开关 | `_search` | boolean-like string | `false` | jqGrid 默认查询标记 | 抓包 |
| 防缓存标记 | `nd` | integer-like string | `<timestamp>` | 页面时间戳，不是业务条件 | 抓包 |
| 分页 | `rows` / `page` | integer | `100` / `1` | 每页条数和页码 | jqGrid 配置 + 抓包 |
| 排序 | `sidx` / `sord` | string | `number` / `desc` | 按单据编号倒序 | jqGrid 配置 + 抓包 |

成功条件为 `status === 200`；失败时读取 `msg` 并 fail closed。响应外层为 `status:number`、`msg:string`、`data:object`；可靠分页路径为 `data.page:number`、`data.records:number`、`data.total:number`，列表行为 `data.rows[]`。`data.total` 是总页数，按 `page <= data.total` 继续，每页最多 200。

| 响应字段/路径 | 类型/可空 | 表格列 | 格式/单位 | 释义 | 证据 |
|---|---|---|---|---|---|
| `data.rows[].id` | number | 隐藏行 ID | ID | 货位调整单主键 | 非空响应 |
| `data.rows[].state` | string | 隐藏/操作状态 | 状态 | 列表行状态上下文 | 非空响应 |
| `data.rows[].billDate` | string | 单据日期 | 日期 | 调整单日期 | 非空响应 + jqGrid `colModel` |
| `data.rows[].billNo` | string | 单据编号 | 单号 | 调整单业务编号 | 非空响应 + jqGrid `colModel` |
| `data.rows[].goods` | array | 商品 | 多行文本 | 单据内商品显示值；与数量、单位等数组按索引对应 | 非空响应 + formatter |
| `data.rows[].qty` | array | 数量 | 件/基本单位 | 各商品调整数量 | 非空响应 + formatter |
| `data.rows[].mainUnit` | array | 单位 | 文本 | 各商品基本计量单位 | 非空响应 + formatter |
| `data.rows[].outLocationName` | array | 仓库 | 多行文本 | 调整前所在仓库 | 非空响应 + formatter |
| `data.rows[].outAreaName` | array | 调整前货位 | 多行文本 | 调整前货位名称 | 非空响应 + formatter |
| `data.rows[].inLocationName` | array | 调入仓库（隐藏） | 多行文本 | 调整后的仓库；当前列配置隐藏 | 非空响应 + jqGrid `colModel` |
| `data.rows[].inAreaName` | array | 调整后货位 | 多行文本 | 调整后货位名称 | 非空响应 + formatter |
| `data.rows[].userName` | string | 制单人 | 文本 | 制单人员显示名 | 非空响应 + jqGrid `colModel` |
| `data.rows[].description` | string | 备注 | 文本 | 调整单备注 | 非空响应 + jqGrid `colModel` |

该接口只读；不要调用“货位调整”制单页的保存动作。

## 库存调拨单列表

证据等级：B（请求已验证，当前默认条件返回空列表）。

```http
GET /scm/invTf?action=list&matchCon=&outLocationId=-1&inLocationId=-1&billStatus=1&beginDate=<YYYY-MM-DD>&endDate=<YYYY-MM-DD>&outBeginDate=&outEndDate=&inbeginDate=&inEndDate=&_search=false&nd=<timestamp>&rows=100&page=1&sidx=number&sord=desc&inBeginDate=
```

| UI 筛选项 | 请求参数 | 类型 | 默认值/枚举 | 释义 | 证据 |
|---|---|---|---|---|---|
| 固定查询动作 | `action` | string | `list` | 库存调拨单列表 | 抓包 + 查询配置 |
| 综合搜索 | `matchCon` | string | 空 | 单据编号或备注 | UI + 查询配置 |
| 调出仓库 | `outLocationId` | integer/string | `-1`（全部） | 调出仓库内部 ID | UI + 抓包 |
| 调入仓库 | `inLocationId` | integer/string | `-1`（全部） | 调入仓库内部 ID | UI + 抓包 |
| 单据状态 | `billStatus` | integer/string | `1` 待调出；`2` 待调入；`3` 已完成；`5` 已关闭 | 调拨流程状态 | 页签枚举 + 抓包 |
| 单据日期 | `beginDate` / `endDate` | `YYYY-MM-DD` | 页面日期范围 | 调拨单创建/单据日期范围 | UI + 抓包 |
| 调出日期 | `outBeginDate` / `outEndDate` | `YYYY-MM-DD` | 空 | 实际调出时间范围 | UI + 查询配置 |
| 调入日期 | `inbeginDate` / `inBeginDate`、`inEndDate` | `YYYY-MM-DD` | 空 | 实际调入时间范围。页面请求同时保留大小写不同的历史起始参数，兼容调用时不要擅自合并 | 查询配置 + 抓包 |
| jqGrid 查询开关/时间戳 | `_search` / `nd` | string | `false` / `<timestamp>` | jqGrid 标记和防缓存参数 | 抓包 |
| 分页 | `rows` / `page` | integer | `100` / `1` | 每页条数和页码 | jqGrid 配置 + 抓包 |
| 排序 | `sidx` / `sord` | string | `number` / `desc` | 按单据编号倒序 | jqGrid 配置 + 抓包 |

状态计数接口：

```http
GET /scm/invTf?action=tfListNum&<同一组业务过滤条件>
```

该计数接口同样没有业务状态字段；成功条件为 HTTP 状态 `200`，响应恰含数值字段 `wait_out`、`out`，否则 fail closed。它只用于页签角标，不影响主列表解析，也可不注册为独立 Agent 工具。列表行字段因默认查询为空，不能从本轮响应可靠推断。

当前线路没有业务 `status/msg` 字段。成功条件为 HTTP 状态 `200`、顶层 `data` 为对象且 `data.rows` 为数组；任一结构不符即 fail closed。当前 `data.rows` 为空。响应没有 `page/records/total` 或其它可靠分页元数据，尚未证明“短页/空页”可以作为终止条件；Agent 只允许请求 `page=1`、`rows<=200`，并固定返回 `pagination_complete: false`，不得自动请求后续页。下面的字段名和列语义来自 `transfersList.js`，类型与可空性待非空响应确认：

| 响应字段/路径 | 类型/可空 | 表格列 | 格式/单位 | 释义 | 证据 |
|---|---|---|---|---|---|
| `data.rows[].billDate` | 待确认 | 单据日期 | 日期 | 调拨单日期 | jqGrid `colModel` |
| `data.rows[].billNo` | 待确认 | 单据编号 | 单号 | 调拨单业务编号 | jqGrid `colModel` |
| `data.rows[].goods` | 待确认，预计 array | 商品 | 多行文本 | 调拨商品列表 | jqGrid `colModel` + formatter |
| `data.rows[].qty` | 待确认，预计 array | 数量 | 件/基本单位 | 各商品调拨数量 | jqGrid `colModel` + formatter |
| `data.rows[].mainUnit` | 待确认，预计 array | 单位 | 文本 | 各商品计量单位 | jqGrid `colModel` + formatter |
| `data.rows[].simple_code` | 待确认 | 简码 | 编码 | 商品简码 | jqGrid `colModel` |
| `data.rows[].outLocationName` | 待确认 | 调出仓库 | 文本 | 调出仓库名称 | jqGrid `colModel` |
| `data.rows[].outAreaName` | 待确认 | 调出仓库区域 | 文本 | 调出货位/区域名称 | jqGrid `colModel` |
| `data.rows[].out_time` | 待确认 | 调出时间 | 日期时间 | 实际调出时间 | jqGrid `colModel` |
| `data.rows[].inLocationName` | 待确认 | 调入仓库 | 文本 | 调入仓库名称 | jqGrid `colModel` |
| `data.rows[].in_time` | 待确认 | 调入时间 | 日期时间 | 实际调入时间 | jqGrid `colModel` |
| `data.rows[].userName` | 待确认 | 制单人 | 文本 | 制单人员显示名 | jqGrid `colModel` |
| `data.rows[].source_type_name` | 待确认 | 调拨类型 | 文本 | 调拨来源/类型显示名 | jqGrid `colModel` |
| `data.rows[].description` | 待确认 | 备注 | 文本 | 调拨单备注 | jqGrid `colModel` |

## 其它入库单列表

证据等级：A。

业务类型选项：

```http
POST /scm/invOi/queryTransType?action=queryTransType&type=in
<empty body; no Content-Type header>
```

该辅助查询成功条件为 `status === 200`；候选位于 `data.items[]`，总数为数值字符串 `data.totalsize`。

列表：

```http
GET /scm/invOi/listIn?action=listIn&type=in&matchCon=&locationId=-1&transTypeId=-1&beginDate=<YYYY-MM-DD>&endDate=<YYYY-MM-DD>&_search=false&nd=<timestamp>&rows=100&page=1&sidx=number&sord=desc
```

| UI 筛选项 | 请求参数 | 类型 | 默认值/枚举 | 释义 | 证据 |
|---|---|---|---|---|---|
| 固定查询动作/方向 | `action` / `type` | string | `listIn` / `in` | 其它入库单列表 | 抓包 + 查询配置 |
| 综合搜索 | `matchCon` | string | 空 | 单据号、供应商或备注 | UI + 查询配置 |
| 仓库 | `locationId` | integer/string | `-1`（全部） | 入库仓库 ID | UI + 抓包 |
| 业务类别 | `transTypeId` | integer/string | `-1`（全部） | 由 `queryTransType?type=in` 返回的业务类别 ID | UI + 辅助接口 + 抓包 |
| 单据日期 | `beginDate` / `endDate` | `YYYY-MM-DD` | 页面日期范围 | 入库单日期范围 | UI + 抓包 |
| jqGrid 查询开关/时间戳 | `_search` / `nd` | string | `false` / `<timestamp>` | jqGrid 标记和防缓存参数 | 抓包 |
| 分页 | `rows` / `page` | integer | `100` / `1` | 每页条数和页码 | jqGrid 配置 + 抓包 |
| 排序 | `sidx` / `sord` | string | `number` / `desc` | 按单据编号倒序 | jqGrid 配置 + 抓包 |

成功条件为 `status === 200`；失败时读取 `msg` 并 fail closed。响应外层为 `status:number`、`msg:string`、`data.page:number`、`data.records:string`、`data.total:number`、`data.rows:array`。

| 响应字段/路径 | 类型/可空 | 表格列 | 格式/单位 | 释义 | 证据 |
|---|---|---|---|---|---|
| `data.rows[].id` | number | 隐藏行 ID | ID | 其它入库单主键 | 非空响应 |
| `data.rows[].billDate` | string | 单据日期 | 日期 | 入库单日期 | 非空响应 + jqGrid `colModel` |
| `data.rows[].billNo` | string | 单据编号 | 单号 | 入库单业务编号 | 非空响应 + jqGrid `colModel` |
| `data.rows[].transType` | number | 业务类别 | 枚举 | 业务类别编码，列 formatter 使用对应显示名 | 非空响应 + jqGrid `colModel` |
| `data.rows[].transTypeName` | string | 业务类别（显示值） | 文本 | 业务类别名称 | 非空响应 + formatter |
| `data.rows[].amount` | number | 金额 | 元 | 其它入库单金额 | 非空响应 + jqGrid `colModel` |
| `data.rows[].contactName` | string | 供应商 | 文本 | 往来供应商名称 | 非空响应 + jqGrid `colModel` |
| `data.rows[].userName` | string | 制单人 | 文本 | 制单人员显示名 | 非空响应 + jqGrid `colModel` |
| `data.rows[].checkName` | null/可空 | 审核人（按配置可隐藏） | 文本 | 审核人员显示名；样本为 `null` | 非空响应 + jqGrid `colModel` |
| `data.rows[].description` | string | 备注 | 文本 | 入库单备注 | 非空响应 + jqGrid `colModel` |
| `data.rows[].checked` | number | 隐藏 | 状态码 | 审核状态控制标记 | 非空响应 |
| `data.rows[].billType` | string | 隐藏/业务上下文 | 类型码 | 单据业务类型 | 非空响应 |
| `data.rows[].totalAmount` | number | 未显示 | 元 | 单据金额相关原始合计字段 | 非空响应 |
| `data.rows[].isEdit` | string | 隐藏/操作状态 | 状态 | 页面是否允许编辑的列表标记；查询 Agent 不使用该标记触发写操作 | 非空响应 |

`isEdit` 只是列表返回状态；查询 Agent 不得据此调用编辑动作。

## 其它出库单列表

证据等级：B（请求已验证，当前默认条件为空）。

```http
GET /scm/invOi/listOut?action=listOut&type=out&matchCon=&locationId=-1&transTypeId=-1&beginDate=<YYYY-MM-DD>&endDate=<YYYY-MM-DD>&_search=false&nd=<timestamp>&rows=100&page=1&sidx=number&sord=desc
```

| UI 筛选项 | 请求参数 | 类型 | 默认值/枚举 | 释义 | 证据 |
|---|---|---|---|---|---|
| 固定查询动作/方向 | `action` / `type` | string | `listOut` / `out` | 其它出库单列表 | 抓包 + 查询配置 |
| 综合搜索 | `matchCon` | string | 空 | 单据号、客户名或备注 | UI + 查询配置 |
| 仓库 | `locationId` | integer/string | `-1`（全部） | 出库仓库 ID | UI + 抓包 |
| 业务类别 | `transTypeId` | integer/string | `-1`（全部） | 出库业务类别 ID | UI + 辅助接口 + 抓包 |
| 单据日期 | `beginDate` / `endDate` | `YYYY-MM-DD` | 页面日期范围 | 出库单日期范围 | UI + 抓包 |
| jqGrid 查询开关/时间戳 | `_search` / `nd` | string | `false` / `<timestamp>` | jqGrid 标记和防缓存参数 | 抓包 |
| 分页 | `rows` / `page` | integer | `100` / `1` | 每页条数和页码 | jqGrid 配置 + 抓包 |
| 排序 | `sidx` / `sord` | string | `number` / `desc` | 按单据编号倒序 | jqGrid 配置 + 抓包 |

成功条件为 `status === 200`；失败时读取 `msg` 并 fail closed。响应外层已确认 `status:number`、`msg:string`、`data.page:number`、`data.records:number`、`data.total:number`、`data.rows:array`；当前 `rows` 为空。字段名和列语义来自 `otherOutboundList.js`，类型与可空性待非空响应确认：

| 响应字段/路径 | 类型/可空 | 表格列 | 格式/单位 | 释义 | 证据 |
|---|---|---|---|---|---|
| `data.rows[].billDate` | 待确认 | 单据日期 | 日期 | 出库单日期 | jqGrid `colModel` |
| `data.rows[].billNo` | 待确认 | 单据编号 | 单号 | 出库单业务编号 | jqGrid `colModel` |
| `data.rows[].transTypeName` | 待确认 | 业务类别 | 文本 | 出库业务类别显示名 | jqGrid `colModel` |
| `data.rows[].amount` | 待确认 | 金额 | 元 | 其它出库单金额 | jqGrid `colModel` |
| `data.rows[].contactName` | 待确认 | 客户 | 文本 | 往来客户名称 | jqGrid `colModel` |
| `data.rows[].userName` | 待确认 | 制单人 | 文本 | 制单人员显示名 | jqGrid `colModel` |
| `data.rows[].checkName` | 待确认 | 审核人 | 文本 | 审核人员显示名 | jqGrid `colModel` |
| `data.rows[].description` | 待确认 | 备注 | 文本 | 出库单备注 | jqGrid `colModel` |

## 商品收发明细

证据等级：B。Agent 线路：条件可执行；旧分类、商品候选和未闭环枚举的业务类型筛选暂不暴露。

```http
GET /report/deliverDetail?action=detail&beginDate=<YYYY-MM-DD>&endDate=<YYYY-MM-DD>&goods=&goodsNo=&storage=&storageNo=&brandId=&cateoryTreeValue=&categoryTreeAllValue=&transType=&_search=false&nd=<timestamp>&rows=3000&page=1&sidx=date&sord=desc
```

| UI 筛选项 | 请求参数 | 类型 | 默认值/枚举 | 释义 | 证据 |
|---|---|---|---|---|---|
| 固定查询动作 | `action` | string | `detail` | 商品收发明细 | 页面脚本查询 URL |
| 日期范围 | `beginDate` / `endDate` | `YYYY-MM-DD` | 页面日期范围 | 收发业务发生日期 | UI + 查询对象 |
| 商品 | `goods` / `goodsNo` | string | 空 | 商品选择器分别提交 `id` 与 `number` | UI + 查询对象 + [来源映射](./lookups.md#商品选择器) |
| 仓库 | `storage` / `storageNo` | string | 空 | 当前查询读取 `storageNo=locationNo`；`storage` 是兼容参数 | UI + 查询对象 + [来源映射](./lookups.md#普通仓库) |
| 品牌 | `brandId` | integer/string | 空 | 品牌内部 ID | UI + 查询对象 |
| 旧分类兼容值 | `cateoryTreeValue` | string | 当前仅确认发送 `cateoryTreeValue=` | 本页未取得非空选择与候选 `action` 的绑定，不能按参数名猜为快准或三方分类 | 空值抓包 |
| 旧分类完整值 | `categoryTreeAllValue` | string | 当前仅确认发送 `categoryTreeAllValue=` | 本页未取得非空选择的精确来源与线格式 | 空值抓包 |
| 业务类别 | `transType` | integer/string | 空；本页候选接口/值域未闭环，Agent 暂不暴露 | 收发业务类型 | UI + 空值抓包 |
| jqGrid 查询开关/时间戳 | `_search` / `nd` | string | `false` / `<timestamp>` | jqGrid 标记和防缓存参数 | jqGrid 约定 |
| 分页 | `rows` / `page` | integer | `3000` / `1` | 每页条数和页码 | jqGrid 配置 |
| 排序 | `sidx` / `sord` | string | `date` / `desc` | 按业务日期倒序 | jqGrid 配置 |

成功条件为 `status === 200`；失败时读取 `msg` 并 fail closed。响应外层为 `status:number`、`msg:string`、`data:object`，列表为 `data.rows[]`，页脚为 `data.userdata`。

当前未取得非空响应样本；字段名和可见列来自 `goodsFlowDetail.js`，类型与可空性待补证：

| 响应字段/路径 | 类型/可空 | 表格列 | 格式/单位 | 释义 | 证据 |
|---|---|---|---|---|---|
| `data.rows[].skuId` | 待确认 | 物料编码 | 编码 | 站内物料/SKU 编码 | jqGrid `colModel` |
| `data.rows[].number` | 待确认 | 原厂商产品码 | 编码 | 厂商产品编码 | jqGrid `colModel` |
| `data.rows[].name` | 待确认 | 商品名称 | 文本 | 商品显示名称 | jqGrid `colModel` |
| `data.rows[].productCode` | 待确认 | 快准产品码 | 编码 | 快准体系产品编码 | jqGrid `colModel` |
| `data.rows[].brandName` | 待确认 | 商品品牌 | 文本 | 品牌名称 | jqGrid `colModel` |
| `data.rows[].categoryName` | 待确认 | 商品分类 | 文本 | 分类名称 | jqGrid `colModel` |
| `data.rows[].spec` | 待确认 | 规格型号 | 文本 | 商品规格 | jqGrid `colModel` |
| `data.rows[].unit` | 待确认 | 单位 | 文本 | 基本计量单位 | jqGrid `colModel` |
| `data.rows[].packSpec` | 待确认 | 包装规格 | 文本 | 包装换算说明 | jqGrid `colModel` |
| `data.rows[].date` | 待确认 | 日期 | 日期 | 收发业务日期 | jqGrid `colModel` |
| `data.rows[].billNo` | 待确认 | 单据号 | 单号 | 来源业务单据编号 | jqGrid `colModel` |
| `data.rows[].billId` | 待确认 | 隐藏业务单 ID | ID | 来源业务单主键 | 隐藏列配置 |
| `data.rows[].billType` | 待确认 | 隐藏业务类型 | 类型码 | 来源单据类型 | 隐藏列配置 |
| `data.rows[].transType` | 待确认 | 业务类别 | 文本/枚举 | 收发业务类别显示值 | jqGrid `colModel` |
| `data.rows[].transTypeId` | 待确认 | 隐藏业务类别编号 | ID | 业务类别内部编号 | 隐藏列配置 |
| `data.rows[].buName` | 待确认 | 往来单位 | 文本 | 客户、供应商或其它往来单位 | jqGrid `colModel` |
| `data.rows[].location` | 待确认 | 仓库 | 文本 | 收发所在仓库 | jqGrid `colModel` |
| `data.rows[].inqty` | 待确认 | 入库数量 | 件/基本单位 | 本笔业务入库数量 | jqGrid `colModel` |
| `data.rows[].outqty` | 待确认 | 出库数量 | 件/基本单位 | 本笔业务出库数量 | jqGrid `colModel` |
| `data.rows[].totalqty` | 待确认 | 结存数量 | 件/基本单位 | 业务发生后的结存数量 | jqGrid `colModel` |

当前 bundle 中成本列 `inunitCost` / `incost`、`outunitCost` / `outcost`、`totalunitCost` / `totalcost` 已被注释，不能作为当前响应必有字段。页面的 `rows=3000` 不是 Agent 默认值；较小页是否稳定生效尚未复核。Agent 最多查询 7 天，并优先要求商品或仓库条件；响应达到 2 MiB 时停止并要求缩小范围，不得自动扩大 `rows`。

## 商品收发汇总

证据等级：A（请求、外层响应和 UI 分组列已验证）。Agent 线路：条件可执行；旧分类筛选和商品候选筛选暂不暴露。

```http
GET /report/deliverSummary?action=detail&beginDate=<YYYY-MM-DD>&endDate=<YYYY-MM-DD>&goods=&goodsNo=&storage=&storageNo=&brandId=&cateoryTreeValue=&categoryTreeAllValue=
```

| UI 筛选项 | 请求参数 | 类型 | 默认值/枚举 | 释义 | 证据 |
|---|---|---|---|---|---|
| 固定查询动作 | `action` | string | `detail` | 商品收发汇总 | 抓包 |
| 日期范围 | `beginDate` / `endDate` | `YYYY-MM-DD` | 页面日期范围 | 统计期间 | UI + 抓包 |
| 商品 | `goods` / `goodsNo` | string | 空 | 商品选择器分别提交 `id` 与 `number` | UI + 抓包 + [来源映射](./lookups.md#商品选择器) |
| 仓库 | `storage` / `storageNo` | string | 空 | 仓库选择器分别提交 `id` 与 `locationNo` | UI + 抓包 + [来源映射](./lookups.md#普通仓库) |
| 品牌 | `brandId` | string/number | 空 | 品牌 ID | UI + 抓包 |
| 旧分类兼容值 | `cateoryTreeValue` | string | 当前仅确认发送空字符串 | 本页没有非空选择证据，不能套用销售明细页的候选绑定 | 空值抓包 |
| 旧分类完整值 | `categoryTreeAllValue` | string | 当前仅确认发送空字符串 | 本页没有非空选择证据，Agent 保持为空 | 空值抓包 |

基础维度逐项映射：

| 响应字段/路径 | 类型/可空 | 表格列 | 格式/单位 | 释义 | 证据 |
|---|---|---|---|---|---|
| `data.rows[].skuId` | string | 物料编码 | 编码 | 站内物料编码 | 非空响应 + jqGrid 列配置 |
| `data.rows[].invNo` | string | 商品编号 | 编码 | 商品业务编号 | 非空响应 + jqGrid 列配置 |
| `data.rows[].invName` | string | 商品名称 | 文本 | 商品显示名称 | 非空响应 + jqGrid 列配置 |
| `data.rows[].productCode` | string/可空 | 原厂产品码 | 编码 | 厂商产品编码 | 非空响应 + jqGrid 列配置 |
| `data.rows[].brandName` | string/可空 | 品牌 | 文本 | 品牌名称 | 非空响应 + jqGrid 列配置 |
| `data.rows[].categoryName` | string/可空 | 商品类别 | 文本 | 分类名称 | 非空响应 + jqGrid 列配置 |
| `data.rows[].spec` | string/可空 | 规格型号 | 文本 | 商品规格 | 非空响应 + jqGrid 列配置 |
| `data.rows[].packSpec` | string/可空 | 包装规格 | 文本 | 包装说明 | 非空响应 + jqGrid 列配置 |
| `data.rows[].unit` | string/可空 | 单位 | 文本 | 基本计量单位 | 非空响应 + jqGrid 列配置 |
| `data.rows[].locationNo` | string/可空 | 仓库编号 | 编码 | 仓库业务编号 | 非空响应 + jqGrid 列配置 |
| `data.rows[].location` | string/可空 | 仓库 | 文本 | 仓库名称 | 非空响应 + jqGrid 列配置 |

数量字段必须按页面分组顺序解释，不能只凭编号猜测：

| 响应字段/路径 | 类型/可空 | 表格列 | 格式/单位 | 释义 | 证据 |
|---|---|---|---|---|---|
| `data.rows[].qty_0` | number/string | 期初 | 件/基本单位 | 统计期初库存 | 非空响应 + 分组列配置 |
| `data.rows[].qty_1` | number/string | 调拨入库 | 件/基本单位 | 调拨入库数量 | 非空响应 + 分组列配置 |
| `data.rows[].qty_2` | number/string | 普通采购 | 件/基本单位 | 普通采购入库数量 | 非空响应 + 分组列配置 |
| `data.rows[].qty_3` | number/string | 销售退回 | 件/基本单位 | 普通销售退货入库数量 | 非空响应 + 分组列配置 |
| `data.rows[].qty_4` | number/string | 大客户销退 | 件/基本单位 | 大客户销售退货入库数量 | 非空响应 + 分组列配置 |
| `data.rows[].qty_5` | number/string | 盘盈 | 件/基本单位 | 盘点盘盈入库数量 | 非空响应 + 分组列配置 |
| `data.rows[].qty_6` | number/string | 其他入库 | 件/基本单位 | 其它入库数量 | 非空响应 + 分组列配置 |
| `data.rows[].qty_7` | number/string | 成本调整 | 件/基本单位 | 成本调整对应数量 | 非空响应 + 分组列配置 |
| `data.rows[].qty_8` | number/string | 入库合计 | 件/基本单位 | 所有入库类型合计 | 非空响应 + 分组列配置 |
| `data.rows[].qty_9` | number/string | 调拨出库 | 件/基本单位 | 调拨出库数量 | 非空响应 + 分组列配置 |
| `data.rows[].qty_10` | number/string | 采购退回 | 件/基本单位 | 采购退货出库数量 | 非空响应 + 分组列配置 |
| `data.rows[].qty_11` | number/string | 普通销售 | 件/基本单位 | 普通销售出库数量 | 非空响应 + 分组列配置 |
| `data.rows[].qty_12` | number/string | 大客户销售 | 件/基本单位 | 大客户销售出库数量 | 非空响应 + 分组列配置 |
| `data.rows[].qty_13` | number/string | 盘亏 | 件/基本单位 | 盘点盘亏出库数量 | 非空响应 + 分组列配置 |
| `data.rows[].qty_14` | number/string | 其他出库 | 件/基本单位 | 其它出库数量 | 非空响应 + 分组列配置 |
| `data.rows[].qty_15` | number/string | 出库合计 | 件/基本单位 | 所有出库类型合计 | 非空响应 + 分组列配置 |
| `data.rows[].qty_16` | number/string | 结存 | 件/基本单位 | 统计期末库存 | 非空响应 + 分组列配置 |

**上表的数字后缀是该抓包账号的列布局，不是跨账号契约。** 分组列由该账号启用了哪些业务类型决定，
启用项不同，`入库合计` / `出库合计` / `结存` 就落在不同下标上。已实测的反例：某生产账号是
`入库合计=qty_7`、`出库合计=qty_13`、`结存=qty_14`，按本表取 `qty_16` 会把"还有 3 条库存"读成"结存 0"——
数字看起来完全正常，错得无声无息。本端点又没有服务端页脚，页脚交叉核对帮不上忙。

所以调用方不能硬编码下标，要从数据本身解列含义。判据是收发汇总逐行成立的恒等式
`期初 + 入库合计 − 出库合计 = 结存`，加上"这四组列从左到右就是 期初｜入库｜出库｜结存"的布局约束
（下标递增）。实测按本表的 in=8/out=15/end=16 在那个生产账号的 1172 行里只有 75 行满足该恒等式。
参考实现见 `skills/kzmall-business-analyst/scripts/kz-compute.mjs` 的 `flow` 命令。

成功条件为 `status === 200`；失败时读取 `msg` 并 fail closed。响应外层为 `status:number`、`msg:string`、`data:object`。本次默认查询响应接近 10 MB。Agent 最多查询 7 天且优先要求商品或仓库条件；最多读取 2 MiB，超限后停止并明确提示用户缩小范围，不能把页面近似全量请求直接复制为工具默认值。

## 明确排除的库存写流程

库存盘点、三方库存盘点、货位调整、库存调拨单、其它入库单、其它出库单均属于会改变库存或单据状态的流程，不纳入查询 Agent 工具集。
