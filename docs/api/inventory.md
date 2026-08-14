# 库存查询接口

## 库存余额

证据等级：A。

```http
GET /report/invBalance?action=detail&goods=&goodsNo=&storage=&storageNo=&catId=&catName=&brandId=&area=false&zero=false&negative=false&carModel=false&area_name=
```

| 参数 | 类型 | 页面默认值 | 说明 |
|---|---|---|---|
| `action` | string | `detail` | 固定 |
| `goods` | string | 空 | 商品显示值 |
| `goodsNo` | string | 空 | 商品编号/内部选择值 |
| `storage` | string | 空 | 仓库显示值 |
| `storageNo` | string | 空 | 仓库编号 |
| `catId` | string/number | 空 | 类别 ID |
| `catName` | string | 空 | 类别名称 |
| `brandId` | string/number | 空 | 品牌 ID |
| `area` | boolean-like string | `false` | 是否显示货位 |
| `zero` | boolean-like string | `false` | 是否显示零库存。旧笔记中的 `true` 是特定查询值，不是当前页面默认值 |
| `negative` | boolean-like string | `false` | 是否显示负库存 |
| `carModel` | boolean-like string | `false` | 是否显示车型 |
| `area_name` | string | 空 | 多货位用逗号分隔 |

页面另有“显示成本毛利”复选框。勾选后可能切换到成本版接口/追加成本字段；本轮为避免暴露经营敏感值未勾选。现有早期笔记已确认成本版行字段可包含 `cost_1`、`allcost_1`、`cost_2`、`allcost_2`、`cost_3`、`allcost_3`。

响应外层：`status`、`msg`、`data`；`data` 常见 `total`、`page`、`records`、`rows`。

`rows[]` 主要字段：

- 商品：`invId`、`invNo`、`invName`、`skuId`、`simpleCode`、`spec`、`unit`、`packSpec`、`brandName`、`categoryName`、`carModel`；
- 时间/货位：`in_time`、`out_time`、`area`；
- 所有仓库：`qty_1`、`cost_1`、`allcost_1`；
- 快准仓：`qty_2`、`cost_2`、`allcost_2`；
- 三方仓：`qty_3`、`cost_3`、`allcost_3`。

## 货位调整记录

证据等级：A。

```http
GET /basedata/area/changeShow?action=changeShow&matchCon=&beginDate=<YYYY-MM-DD>&endDate=<YYYY-MM-DD>&_search=false&nd=<timestamp>&rows=100&page=1&sidx=number&sord=desc
```

业务参数：`matchCon` 综合条件、`beginDate` / `endDate` 调整日期；其余为分页排序参数。

响应行字段：

`state`、`id`、`billDate`、`qty`、`goods`、`mainUnit`、`description`、`billNo`、`userName`、`outLocationName`、`inLocationName`、`outAreaName`、`inAreaName`。

该接口只读；不要调用“货位调整”制单页的保存动作。

## 库存调拨单列表

证据等级：B（请求已验证，当前默认条件返回空列表）。

```http
GET /scm/invTf?action=list&matchCon=&outLocationId=-1&inLocationId=-1&billStatus=1&beginDate=<YYYY-MM-DD>&endDate=<YYYY-MM-DD>&outBeginDate=&outEndDate=&inBeginDate=&inEndDate=&_search=false&nd=<timestamp>&rows=100&page=1&sidx=number&sord=desc
```

| 参数 | 说明 |
|---|---|
| `matchCon` | 单号等综合条件 |
| `outLocationId` | 调出仓库，`-1` 表示全部 |
| `inLocationId` | 调入仓库，`-1` 表示全部 |
| `billStatus` | 单据状态；页面默认实测为 `1` |
| `beginDate` / `endDate` | 单据日期 |
| `outBeginDate` / `outEndDate` | 出库日期范围 |
| `inBeginDate` / `inEndDate` | 入库日期范围。请求中曾出现历史拼写 `inbeginDate`，接入时应兼容页面实际发送值 |

状态计数接口：

```http
GET /scm/invTf?action=tfListNum&<同一组业务过滤条件>
```

已观察返回字段 `wait_out`、`out`。列表行字段因默认查询为空，不能从本轮响应可靠推断。

## 其它入库单列表

证据等级：A。

业务类型选项：

```http
POST /scm/invOi/queryTransType?action=queryTransType&type=in
```

列表：

```http
GET /scm/invOi/listIn?action=listIn&type=in&matchCon=&locationId=-1&transTypeId=-1&beginDate=<YYYY-MM-DD>&endDate=<YYYY-MM-DD>&_search=false&nd=<timestamp>&rows=100&page=1&sidx=number&sord=desc
```

响应行字段：`checkName`、`checked`、`billDate`、`billType`、`id`、`amount`、`transType`、`contactName`、`description`、`billNo`、`totalAmount`、`userName`、`transTypeName`、`isEdit`。

`isEdit` 只是列表返回状态；查询 Agent 不得据此调用编辑动作。

## 其它出库单列表

证据等级：B（请求已验证，当前默认条件为空）。

```http
GET /scm/invOi/listOut?action=listOut&type=out&matchCon=&locationId=-1&transTypeId=-1&beginDate=<YYYY-MM-DD>&endDate=<YYYY-MM-DD>&_search=false&nd=<timestamp>&rows=100&page=1&sidx=number&sord=desc
```

参数语义与其它入库单一致。由于当前响应无行，本轮不把入库字段未经验证地复制为出库字段。

## 商品收发明细

证据等级：B。

```http
GET /report/deliverDetail?action=detail&beginDate=<YYYY-MM-DD>&endDate=<YYYY-MM-DD>&goods=&goodsNo=&storageNo=&brandId=&cateoryTreeValue=&categoryTreeAllValue=&action=&_search=false&nd=<timestamp>&rows=3000&page=1&sidx=date&sord=desc&transType=
```

业务条件：日期、商品/商品编号、仓库编号、品牌、快准/三方分类、收发业务类型 `transType`。默认一次请求最多 3000 行；Agent 应优先缩小日期范围，并在结果过大时分页/分段查询。

## 商品收发汇总

证据等级：A（请求、外层响应和 UI 分组列已验证）。

```http
GET /report/deliverSummary?action=detail&beginDate=<YYYY-MM-DD>&endDate=<YYYY-MM-DD>&goods=&goodsNo=&storage=&storageNo=&brandId=&cateoryTreeValue=&categoryTreeAllValue=
```

基础维度：`skuId`、`invNo`、`invName`、`productCode`、`brandName`、`categoryName`、`spec`、`packSpec`、`unit`、`locationNo`、`location`。

数量按以下组展示：期初、调拨入库、普通采购、销售退回、大客户销退、盘盈、其他入库、成本调整、入库合计、调拨出库、采购退回、普通销售、大客户销售、盘亏、其他出库、出库合计、结存。页面字段使用 `qty_0` 至 `qty_16` 一组编号；不要只凭编号猜业务含义，应以列分组顺序映射。

响应外层为 `status:number`、`msg:string`、`data:object`。本次默认查询响应接近 10 MB，Agent 必须限制时间和商品范围，避免把大响应整份塞入上下文。

## 明确排除的库存写流程

库存盘点、三方库存盘点、货位调整、库存调拨单、其它入库单、其它出库单均属于会改变库存或单据状态的流程，不纳入查询 Agent 工具集。
