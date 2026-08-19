# 商品与品牌查询接口

本页出现的 `assistId`、`inv_ids`、`skuId`、品牌和分类参数，其选项接口与字段映射统一见[查询参数 ID / 编码来源](./lookups.md)。

## 快准商品列表

证据等级：A。Agent 线路：页面会话依赖。正常页面加载/查询请求、查询对象、jqGrid 列配置、站点正式解码调用以及解码后的非空响应字段类型均已确认。只提取了字段名和类型，没有保存商品行值。

页面入口：

```http
GET /settings/goods_list_kz?action=goods_list_kz&typeNumber=all
```

主查询：

```http
GET /basedata/inventory?action=kzlist&isDelete=2&query=true&isDelete=0&_search=false&nd=<timestamp>&rows=50&page=1&sidx=id&sord=desc
```

点击页面“查询”后，默认请求还会加入 `skey`、`mBrand`、`cars`、`models`、`mYear`、`typeNumber`、`matStatus`、`bussType`；空分类时 `assistId` 省略。

| UI 筛选项 | 请求参数 | 类型 | 默认值/枚举 | 释义 | 证据 |
|---|---|---|---|---|---|
| 综合搜索 | `skey` | string | 空 | 商品名称、商品编码、商品品牌、车型或 VIN 关键字；旧文档写成 `matchCon`，当前脚本实际使用 `skey` | 查询对象 + 抓包 |
| 快准分类树 | `assistId` | string/number | 未选择时省略 | 所选快准分类节点 ID | zTree 回调 + 查询对象 |
| 库存页签 | `typeNumber` | string/number | `all`；`storage` 有库存、`zero` 无库存，或自定义分类编号 | 页面顶部库存/分类维度 | 页签配置 + 抓包 |
| 页签显示名 | `name` | string | 默认省略 | 自定义页签的显示名称；仅选择相应页签时随查询对象发送 | 页签回调 |
| 物料状态 | `matStatus` | comma-separated string | 空；`1` 正常、`3` 停供、`4` 停用 | 可多选的物料状态 | Vue 选项 + 抓包 |
| 业务类别上下文 | `bussType` | string | 当前入口为空 | 页面上游传入的业务类别上下文 | 查询对象 + 抓包 |
| 兼容车型条件 | `mBrand` / `cars` / `models` / `mYear` | string | 空 | 当前 UI 已不展示但查询对象仍保留的历史车型条件 | 查询对象 + 抓包 |
| 显示正常商品 | `isDelete` | string/number | URL 先有 `2`，查询数据再覆盖为 `0` | jqGrid 保留重复键；后出现的 `0` 是当前页面实际筛选值 | 抓包 + grid `postData` |
| 查询模式 | `query` | boolean-like string | `true` | 快准商品查询固定标记 | grid URL + 抓包 |
| 页码/页大小 | `page` / `rows` | integer | `1` / `50`；页大小可选 50、100、200 | jqGrid 分页 | grid 配置 + 抓包 |
| 排序 | `sidx` / `sord` | string | `id` / `desc` | 默认按商品行 ID 倒序 | grid 配置 + 抓包 |
| jqGrid 查询/防缓存 | `_search` / `nd` | boolean-like / integer-like | `false` / `<timestamp>` | 非业务条件 | 抓包 |

线上传输外层是 `success:boolean`、`status:string`、`redirect:null`、`msg:string`、`data:string`。页面已加载的正式处理函数确认：当 `data` 以 `kziv` 开头时，页面拆出 16 字节 IV，使用当前会话内的 `SYSTEM.k` 调用 `aesDecrypt`，再以 `JSON.parse` 写回 `data`。文档不记录密钥或任何解码后的行值。逻辑解码后 `data` 为对象，包含 `page:number`、`records:number`、`total:number`、`rows:array`。

纯 HTTP Agent 只能收到编码字符串，并不拥有快准页面会话中的 `SYSTEM.k`。因此本节的逻辑 schema 用于解释页面字段，不表示 Agent 能直接解析；在项目提供受控的正式解码适配前，不得把该端点加入普通 HTTP 工具。

| 响应字段/路径 | 类型/可空 | 表格列 | 格式/单位 | 释义 | 证据 |
|---|---|---|---|---|---|
| `data.rows[].categoryName` | string | 商品类别 | 文本 | 快准商品分类名称 | 非空解码结构 + `colModel` |
| `data.rows[].number` | string | 原厂商产品码 | 编码 | 原厂商产品编号 | 非空解码结构 + `colModel` |
| `data.rows[].baseName` | string | 商品名称 | 文本 | 当前列表展示的基础商品名称 | 非空解码结构 + `colModel` |
| `data.rows[].skuId` | string | 物料编码 | 编码 | 快准物料编码 | 非空解码结构 + `colModel` |
| `data.rows[].simple_code` | string | 产品简码 | 编码 | 商品产品简码 | 非空解码结构 + `colModel` |
| `data.rows[].brandName` | string | 品牌 | 文本 | 品牌名称 | 非空解码结构 + `colModel` |
| `data.rows[].spec` | string | 规格型号 | 文本 | 商品规格型号 | 非空解码结构 + `colModel` |
| `data.rows[].packSpec` | string | 包装规格 | 文本 | 包装规格 | 非空解码结构 + `colModel` |
| `data.rows[].unitName` | string | 单位 | 文本 | 计量单位名称 | 非空解码结构 + `colModel` |
| `data.rows[].storageSum` | number | 当前库存 | 数量 | 当前权限范围内库存合计 | 非空解码结构 + `colModel` |
| `data.rows[].quantity` | number | 期初数量 | 数量 | 商品期初库存数量 | 非空解码结构 + `colModel` |
| `data.rows[].amount` | number | 期初总价 | 元 | 商品期初库存总价 | 非空解码结构 + `colModel` |
| `data.rows[].stockType` | string | 备货类型（当前隐藏） | 枚举文本/编码 | 商品备货分类 | 非空解码结构 + `colModel` |
| `data.rows[].status` | string | 物料状态 | `1` 正常、`2` 暂供、`3` 停供、`4` 停用、`5` 新品 | 物料供应状态 | 非空解码结构 + formatter |
| `data.rows[].isBuy` | number | 是否限售 | `1` 是，其他值否 | 商品限售标志 | 非空解码结构 + formatter |
| `data.rows[].carModel` | string | 适用车型 | 文本 | 适用车型描述 | 非空解码结构 + `colModel` |
| `data.rows[].remark` | 当前样本未出现 | 备注 | 文本 | 列配置存在，但当前非空样本没有该键 | `colModel` |
| `data.rows[].minNum` | string | 订货批量（隐藏） | 数量文本 | 最小订货批量 | 非空解码结构 + `colModel` |
| `data.rows[].invId` | string | 商品 ID（隐藏） | ID | 商品内部 ID | 非空解码结构 + `colModel` |

当前非空逻辑响应还包含下列非主表列字段；其中没有足够 UI 或后端说明的字段保守标记为“内部字段”，避免仅凭名称过度解释。

| 字段 | 类型 | 释义 |
|---|---|---|
| `id` / `sid` / `brandId` / `categoryId` / `unitId` | string / string / string / string / number | 行 ID、服务站 ID、品牌 ID、分类 ID、单位 ID |
| `categoryCode` / `productCode` / `barCode` / `oe_code` | string | 分类编码、快准产品码、条码、OE 编码 |
| `name` / `oldName` / `goods` / `goods_sale_name` | string | 商品名称相关的兼容/销售展示字段 |
| `purPrice` / `salePrice` / `guidePrice` / `lowPrice` | string | 采购价、零售价、指导价、最低价文本 |
| `iniAmount` / `iniCost` / `totalAmount` / `discountRate` | number | 期初金额、期初成本、汇总金额、折扣率 |
| `fineQty` | number | 正品数量字段；当前主表未展示 |
| `productModel` / `saleModel` | string | 产品型号与销售型号 |
| `buyStatus` / `isBadReturn` / `isUnsalableReturn` | string | 购买状态、不良品退货和滞销退货相关状态 |
| `isOldSku` / `isPoShield` / `isSelf` / `is_hot` / `noPricingFlag` | number / number / number / string / number | 旧物料、采购屏蔽、自有商品、热销及未定价标志 |
| `skuClassId` | null（当前样本） | SKU 分类 ID；当前样本为空 |
| `def` / `level` / `pinYin` | string | 当前列表未展示的内部定义、层级和拼音检索字段 |

## 三方商品列表

证据等级：A。Agent 线路：页面会话依赖。正常页面请求、查询绑定、站点正式解码以及解码后的非空响应字段类型均已确认。

```http
GET /basedata/inventory?action=list&isDelete=2&isDelete=0&_search=false&nd=<timestamp>&rows=50&page=1&sidx=number&sord=asc
```

| UI 筛选项 | 请求参数 | 类型 | 默认值/枚举 | 释义 | 证据 |
|---|---|---|---|---|---|
| 综合搜索 | `skey` | string | 空 | 商品编号、商品名称、规格型号或适用车型关键字；旧文档写成 `matchCon`，当前脚本实际使用 `skey` | 查询处理器 + 抓包 |
| 商品分类 | `assistId` | string/number | 未选择时省略 | 三方商品分类节点 ID | 分类树 + 查询处理器 |
| 是否显示禁用 | `isDelete` | string/number | URL 先有 `2`，默认数据条件为 `0`；勾选后为 `1` | 三方商品启用/禁用筛选 | 查询处理器 + 抓包 |
| 用户触发标志 | `isUserOpt` | integer | 点击查询为 `1`；切换“显示禁用”时为 `0` | 区分主动搜索与筛选切换 | 查询处理器 + 抓包 |
| 页码/页大小 | `page` / `rows` | integer | `1` / `50`；可选 50、100、200 | jqGrid 分页 | grid 配置 + 抓包 |
| 排序 | `sidx` / `sord` | string | `number` / `asc` | 默认按商品编号升序 | grid 配置 + 抓包 |
| jqGrid 查询/防缓存 | `_search` / `nd` | boolean-like / integer-like | `false` / `<timestamp>` | 非业务条件 | 抓包 |

传输层同样先返回编码 `data:string`，再由当前会话的正式 `processData` 解码。逻辑结构为 `data.page:number`、`data.records:number`、`data.total:number`、`data.rows:array`。

与快准商品列表相同，逻辑字段可读不等于纯 HTTP 线路可读。没有受控解码适配时，Agent 必须 fail closed。

| 响应字段/路径 | 类型/可空 | 表格列 | 格式/单位 | 释义 | 证据 |
|---|---|---|---|---|---|
| `data.rows[].categoryName` | string | 商品类别 | 文本 | 三方商品分类名称 | 非空解码结构 + `colModel` |
| `data.rows[].number` | string | 商品编号 | 编码 | 三方商品业务编号 | 非空解码结构 + `colModel` |
| `data.rows[].name` | string | 商品名称 | 文本 | 商品显示名称 | 非空解码结构 + `colModel` |
| `data.rows[].spec` | string | 规格型号 | 文本 | 商品规格 | 非空解码结构 + `colModel` |
| `data.rows[].unitName` | string | 单位 | 文本 | 原始单位名称；表格虚拟列 `unitsName` 在没有多单位字段时显示该值 | 非空解码结构 + formatter |
| `data.rows[].storageSum` | number | 当前库存 | 数量 | 当前库存合计 | 非空解码结构 + `colModel` |
| `data.rows[].quantity` | number/string | 期初数量 | 数量 | 期初库存数量 | 非空解码结构 + `colModel` |
| `data.rows[].amount` | number | 期初总价 | 元 | 期初库存总价 | 非空解码结构 + `colModel` |
| `data.rows[].purPrice` | string | 预计采购价 | 元 | 预计采购单价 | 非空解码结构 + `colModel` |
| `data.rows[].salePrice` | string | 零售价 | 元 | 默认零售单价 | 非空解码结构 + `colModel` |
| `data.rows[].remark` | string/null | 备注 | 文本 | 商品备注 | 非空解码结构 + `colModel` |
| `data.rows[].carModel` | string | 适用车型 | 文本 | 适用车型描述 | 非空解码结构 + `colModel` |
| `data.rows[].delete` | boolean | 状态 | `false` 已启用、`true` 已禁用 | 商品启用状态；查询 Agent 不调用状态变更动作 | 非空解码结构 + formatter |

三方商品响应还包含快准列表中的多数内部/兼容字段，以及下列三方特有字段：

| 字段 | 类型/可空 | 释义 |
|---|---|---|
| `locationId` / `locationAreaId` / `locationName` | string | 默认货位、货区及货位名称 |
| `highQty` / `lowQty` | string | 库存上限/下限文本 |
| `advanceDay` | null（当前样本） | 提前期天数字段，当前样本为空 |
| `isWarranty` | string | 质保相关标志 |
| `retailPrice` | string | 兼容零售价字段 |
| `iniAmount` | number/string | 期初金额；当前样本存在数值与数值字符串两种类型 |

## 套包分页列表

证据等级：A。Agent 线路：条件可执行。页面正常打开/查询产生的 POST、20 行非空响应、页面查询对象与全部可见列绑定均已确认。

```http
POST /storage/getPackageList
Content-Type: application/x-www-form-urlencoded

page=1&rows=20&inv_ids=
```

| UI 筛选项 | 请求参数 | 类型 | 默认值/形态 | 释义 | 证据 |
|---|---|---|---|---|---|
| 商品 | `inv_ids` | string | 空值固定发送 `inv_ids=`；多选线格式尚未取得非空样本 | 限定套包商品；页面从商品选择器的 `data('ids')` 取值 | UI + 查询组件 + 空值抓包 |
| 页码 | `page` | integer | `1` | 从 1 开始的页码；点击“查询”时重置为 1 | 查询组件 + 抓包 |
| 每页行数 | `rows` | integer | `20` | 分页大小 | 查询组件 + 抓包 |

成功条件为 `success === true && status === "success"`；失败时读取 `msg` 并 fail closed。响应外层：`success:boolean`、`status:string`、`redirect`、`msg:string`、`data`。分页容器为 `data.page:number`、`data.records:number`、`data.total:number`、`data.rows:array`。

商品候选本身还受 `kziv` 页面会话依赖影响。Agent 可以执行不带商品条件的分页列表；在多选序列化和候选解码适配完成前，不得暴露 `inv_ids` 筛选。

| 响应字段/路径 | 类型/可空 | 表格列 | 格式/单位 | 释义 | 证据 |
|---|---|---|---|---|---|
| `data.rows[].package_inv_id` | string | 隐藏 | ID | 套包商品内部 ID | 非空响应 + 组件行处理 |
| `data.rows[].package_sku_id` | string | 套包物料编码 | 编码 | 套包物料/SKU 编码 | 非空响应 + 表格绑定 |
| `data.rows[].name` | string | 名称 | 文本 | 套包商品名称 | 非空响应 + 表格绑定 |
| `data.rows[].number` | string | 厂商编码 | 编码 | 套包原厂商产品编码 | 非空响应 + 表格绑定 |
| `data.rows[].brandName` | string | 品牌 | 文本 | 品牌显示名 | 非空响应 + 表格绑定 |
| `data.rows[].categoryName` | string | 分类 | 文本 | 套包商品分类显示名 | 非空响应 + 表格绑定 |
| `data.rows[].qty` | number/string | 库存 | 数量 | 当前套包库存；当前 20 行响应同时存在数字与数值字符串，组件加载后会显式执行 `parseInt` | 非空响应 + 组件行处理 |
| `data.rows[].detail_qty` | string | 子物料数量 | 数量字符串 | 套包所含子物料项数/数量字段 | 非空响应 + 表格绑定 |

“操作”列不是响应字段，页面根据行数据生成组装/拆包按钮；查询 Agent 必须忽略该列。

页面还存在“组装”“拆包”“确认”等写操作，均不属于本接口文档且禁止由查询 Agent 调用。

## 报价规则分页列表

证据等级：A。页面自动加载的 JSON POST、2 行非空响应、分页对象和全部主表列 `prop` 均已确认。该列表没有业务筛选表单，“刷新”只是重新发送同一分页请求。

```http
POST /basedata/QuoteManager/ruleList
Content-Type: application/json

{"page":1,"rows":20}
```

| UI 条件 | JSON 字段 | 类型 | 默认值/枚举 | 释义 | 证据 |
|---|---|---|---|---|---|
| 页码 | `page` | integer | `1` | 从 1 开始的页码 | 抓包 + 组件查询对象 |
| 每页行数 | `rows` | integer | `20`；UI 可选 `20/50/100` | 分页大小 | 抓包 + 分页组件 |

成功条件为 `success === true && status === "success"`；失败时读取 `msg` 并 fail closed。响应外层：`success:boolean`、`status:string`、`redirect`、`msg:string`、`data.total:number`、`data.list:array`。

| 响应字段/路径 | 类型/可空 | 表格列 | 格式/单位 | 释义 | 证据 |
|---|---|---|---|---|---|
| `data.list[].id` | string | 隐藏 | ID | 报价规则内部 ID，页面仅供后续操作使用 | 非空响应 + 组件方法 |
| `data.list[].sid` | string | 隐藏 | ID | 所属服务站 ID | 非空响应 |
| `data.list[].code` | string | 报价规则编码 | 编码 | 规则业务编码 | 非空响应 + 组件 `prop` |
| `data.list[].name` | string | 报价规则名称 | 文本 | 规则显示名称 | 非空响应 + 组件 `prop` |
| `data.list[].description` | string | 报价规则备注 | 文本 | 规则说明；空值在 UI 显示 `-` | 非空响应 + 组件 `prop` |
| `data.list[].goods_count` | number | 报价商品数 | 条 | 已纳入规则的商品数 | 非空响应 + 组件 `prop` |
| `data.list[].contact_count` | number | 关联客户数 | 个 | 已关联客户数 | 非空响应 + 组件 `prop` |

“序号”由表格组件生成；“操作”也是前端派生列，不属于响应字段。

页面上的新增、设置报价、设置客户、编辑、复制新增、删除均为写操作，查询 Agent 不得调用。

## 品牌能力

品牌在当前权限下没有独立的“品牌管理”菜单；查询 Agent 应通过[共享品牌列表接口](./shared.md#品牌列表)获得 `brandId` 和名称，再传给销售、库存等业务查询。
