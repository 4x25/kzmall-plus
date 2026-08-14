# 商品与品牌查询接口

## 快准商品列表

证据等级：B。请求和 UI 字段已验证；响应外层是 JSON，但 `data` 为站点编码字符串。遵守“不分析 JavaScript bundle”约束时不解码该载荷。

页面入口：

```http
GET /settings/goods_list_kz?action=goods_list_kz&typeNumber=all
```

主查询：

```http
GET /basedata/inventory?action=kzlist&isDelete=2&query=true&isDelete=0&_search=false&nd=<timestamp>&rows=50&page=1&sidx=id&sord=desc
```

页面查询控件：

| UI 条件 | 请求参数 | 类型/默认值 | 说明 |
|---|---|---|---|
| 综合搜索 | `matchCon` | string / 空 | 页面提示“商品名称/商品编码/商品品牌/车型/vin码” |
| 商品类别 | 页面选择器 | ID / 全部 | 初次空条件请求中可能省略 |
| 正常商品 | `isDelete` | `0` | URL 同时保留历史参数 `isDelete=2`；后出现的 `0` 为页面实测值 |
| 查询模式 | `query` | `true` | 固定值 |
| 页大小 | `rows` | `50`，可选 `100`、`200` | jqGrid 分页 |
| 页码 | `page` | `1` | 从 1 开始 |
| 排序字段 | `sidx` | `id` | 固定默认 |
| 排序方向 | `sord` | `desc` | 固定默认 |

结果列与建议字段映射：

| UI 列 | 字段 |
|---|---|
| 商品类别 | `categoryName` |
| 原厂商产品码 | `number` |
| 商品名称 | `baseName` |
| 物料编码 | `skuId` |
| 产品简码 | `simple_code` |
| 品牌 | `brandName` |
| 规格型号 | `spec` |
| 包装规格 | `packSpec` |
| 单位 | `unitName` |
| 当前库存 | `storageSum` |
| 期初数量 | `quantity` |
| 期初总价 | `amount` |
| 备货类型 | `stockType` |
| 物料状态 | `status` |
| 是否限售 | `isBuy` |
| 适用车型 | `carModel` |
| 备注 | `remark` |
| 订货批量 | `minNum` |
| 商品 ID | `invId` |

响应外层：`success:boolean`、`status:string`、`redirect:null`、`msg:string`、`data:string`。`data` 不是普通 JSON 文本，Agent 需要后端提供官方解码方式或改用可返回明文 JSON 的正式接口；不得通过分析 bundle 自行还原。

## 三方商品列表

证据等级：B，编码限制同上。

```http
GET /basedata/inventory?action=list&isDelete=2&isDelete=0&_search=false&nd=<timestamp>&rows=50&page=1&sidx=number&sord=asc
```

页面查询控件：综合搜索 `matchCon`，提示“按商品编号，商品名称，规格型号，适用车型等查询”；分页默认 50，可选 100、200。

结果列：

`categoryName` 商品类别、`number` 商品编号、`name` 商品名称、`spec` 规格型号、`unitsName` 单位、`storageSum` 当前库存、`quantity` 期初数量、`amount` 期初总价、`purPrice` 预计采购价、`salePrice` 零售价、`remark` 备注、`carModel` 适用车型、`delete` 状态。

响应外层同快准商品列表，`data` 为编码字符串。

## 套包分页列表

证据等级：A。

```http
POST /storage/getPackageList
Content-Type: application/x-www-form-urlencoded

page=1&rows=20&inv_ids=
```

| 参数 | 类型 | 说明 |
|---|---|---|
| `page` | integer | 页码，从 1 开始 |
| `rows` | integer | 默认 20 |
| `inv_ids` | string | 商品选择器返回的商品 ID 集合；空表示全部 |

响应外层：`success`、`status`、`redirect`、`msg`、`data`；数据行为 `data.rows[]`。

| 字段 | 类型 | UI 含义 |
|---|---|---|
| `package_inv_id` | string/number | 套包商品 ID |
| `package_sku_id` | string | 套包物料编码 |
| `name` | string | 名称 |
| `number` | string | 厂商编码 |
| `brandName` | string | 品牌 |
| `categoryName` | string | 分类 |
| `qty` | number/string | 库存 |
| `detail_qty` | number/string | 子物料数量 |

页面还存在“组装”“拆包”“确认”等写操作，均不属于本接口文档且禁止由查询 Agent 调用。

## 报价规则分页列表

证据等级：A。

```http
POST /basedata/QuoteManager/ruleList
Content-Type: application/json

{"page":1,"rows":20}
```

响应数据位于 `data.list[]`：

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | number/string | 规则 ID |
| `sid` | number/string | 服务站 ID |
| `code` | string | 报价规则编码 |
| `name` | string | 报价规则名称 |
| `description` | string | 备注 |
| `contact_count` | number | 关联客户数 |
| `goods_count` | number | 报价商品数 |

页面上的新增、设置报价、设置客户、编辑、复制新增、删除均为写操作，查询 Agent 不得调用。

## 品牌能力

品牌在当前权限下没有独立的“品牌管理”菜单；查询 Agent 应通过[共享品牌列表接口](./shared.md#品牌列表)获得 `brandId` 和名称，再传给销售、库存等业务查询。
