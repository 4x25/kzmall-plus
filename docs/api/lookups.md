# 查询参数 ID / 编码来源

本页解决领域文档中“知道主查询需要 `xxxId`，却不知道这个值从哪里取得”的问题。它记录正常页面使用的选项接口、响应中的提交字段与显示字段，以及同名参数在不同页面上的差异。

路径均相对于快准车服基地址；经本项目调用时在前面加 `/api`。选项值受当前服务站、账号权限和主数据状态影响，Agent 应按需实时查询，不能缓存或持久化真实客户、员工、账户、仓库等业务数据。

## 使用原则

1. 先确定**消费页面和主查询参数**，再选择本页对应的选项接口；不能仅凭 `Id`、`No` 后缀猜字段。
2. 同一选项通常同时提供 `id`、`number` 和 `name`。`id` 是内部主键，`number` 是业务编码，`name` 只用于显示；主查询具体取哪一个由页面绑定决定。
3. 多选参数沿用主查询文档规定的序列化形式：逗号分隔、集合、或 JSON 数组字符串。不要把显示名拼进 ID 集合。
4. 下表中的 A 表示请求、响应字段和消费绑定均已确认；B 表示接口和页面绑定已确认，但当前响应为空或原始载荷经过站点编码，类型仍需保守处理。

## 参数到选项接口总表

| 主查询参数 | 消费场景 | 选项接口/来源 | 提交字段 | 显示字段 | 证据 |
|---|---|---|---|---|---|
| `buId`、`contactId`、`contact_id`、`customerId`、`customer_id`、组件本地 `accountId` | 普通客户 | `GET /basedata/contact/getHomePageContact` 的 `data.contact[]`，或分页 `GET /basedata/contact?action=list...` | `id` | `name`；业务编码为 `number` | A |
| `customerId`、`buId` | 大客户 | 上述接口的 `data.bigContact[]`，或分页列表加 `customerType=1` | `id` | `name` | A |
| `supplierId`、供应商语义的 `buId` | 供应商 | 上述接口的 `data.supplier[]`，或分页列表加 `type=10` | `id` | `name` | A |
| `accountNo` | **应付账款明细**的供应商条件 | 供应商选择器；不是结算账户接口 | `id` | `name` | A |
| `customerNo` | 销售明细表、销售汇总“按客户” | 客户选择器 | `number` | `name` | A |
| `customerNo` | 销售汇总“按商品” | 客户选择器 | `id` | `name` | A；同一参数随页签改变 |
| `storeId` | 销售单、出库单、利润表等 | `POST /basedata/Stores/getStoreIdName` | `data[].id` | `data[].name` | A |
| `salesId`、`delieverId` | 销售单/出库单/大客户单据列表 | `POST /basedata/employee?action=list` | `data.items[].id` | `name` | A |
| `salesId` | 销售明细等老报表 | 员工选择器 | `number` | `name` | A |
| `userId` | 销售单“开单员” | `GET /scm/invSa/SelectQueryAllUser?action=SelectQueryAllUser` | `data.items[].userId` | `realName` | A |
| `uid`、`checkId`、`cancel_uid` | 出库人、对账/核销人、撤销人 | `POST /scm/InvSa/getUsers` | `data[].uid` | `userName` | A |
| `locationId`、`outLocationId`、`inLocationId`、仓库语义的 `storage` | 普通仓库 | `GET /basedata/invlocation?action=list...` | `data.rows[].id` | `name` | A |
| `storageNo` | 库存/销售报表 | 普通仓库列表 | `locationNo` | `name` | A |
| `storageIds`、`storage_id` | 微仓出入库、微仓库存 | `POST /Storage/getMoveStorage` | `data.list[].id` | `name`；编号为 `locationNo` | B |
| 随微仓取得的 `contact_id` | 微仓库存 | 同上 | `data.list[].contactId` | `contactName` | B |
| `wayId` | 结算方式 | `GET /basedata/assist/getAssistList`，条目 `typeNumber=PayMethod` | `data[].id` | `name` | A |
| `accountNo` | **现金银行报表**的结算账户条件 | `GET /basedata/settAcct?action=list` | `data.items[].number` | `name` | A |
| `goods` / `goodsNo` | 库存余额、商品收发报表 | 商品选择器：`GET /basedata/inventory?action=kzlist...` | `goods=id`；`goodsNo=number` | `name` / `goods_sale_name` | A；原始载荷编码 |
| `goodsNo` | 销售明细表、销售汇总表 | 同一商品选择器 | `id` | `name` / `goods_sale_name` | A；参数名虽为 `No`，这里不是 `number` |
| `inv_ids` | 套包商品过滤 | 同一商品选择器 | `id` | `name` / `goods_sale_name` | A；原始载荷编码 |
| `skuId` | 需要物料/SKU 精确值的查询 | 同一商品列表行 | `skuId` | 商品名，可同时展示 `number` | A；不要用商品 `id` 代替 |
| `brandId` | 通用商品/销售/库存查询 | `GET` 或 `POST /basedata/assist/brand` | `data.items[].id` | `name` | A |
| `assistId`、`catId` | 老商品分类/库存分类控件 | `/basedata/assist`，按页面使用 `action=list`、`kzlist` 或 `alllist` | `data.items[].id` | `name` | A |
| `categoryIds`、`category_ids`、`kzCategoryIds` | 新分类级联控件 | `GET /basedata/Category/tree` | 所选叶节点 `id` | `name` | A |
| `cateCodes`、`cate_codes` | 微仓品类品牌控件 | `POST /moveMall/moveSto/getCategoryWithBrand` | `data.category[].code` | `name` | A |
| `brandIds`、`brand_id` | 微仓品类品牌控件 | 同上 | `data.category[].brands[].code` | `name` | A；这里是品牌 `code`，不是通用品牌 `id` |
| `transTypeId` | 其它入/出库单查询 | `POST /scm/invOi/queryTransType`，`type=in` 或 `out` | `data.items[].id` | `name` | A |
| `apply_sid`、`deliver_sid` | 商品调拨单管理 | `POST /basedata/Assist/userList` | 顶层数组 `[].sid` | `name` | A |
| `activity_id` | 销售单/E 站订单活动条件 | `POST /Provider/index/saas/inner/activity/list` | `data.data[].id` | `name` | A |
| `customType`、`merchant_code` | 大客户分类 | `POST /scm/invCu/getCarType` | `data[].id` | `name` | A |
| `compressIds` | 微仓按车型推荐 | `POST /sale/Offer/getCarDataByStep` 逐级加载 | 解码后节点 `id`；最终多选叶节点 ID | `name` | B；原始 `data` 为 `kziv` |

## 客户与供应商

### 首页主数据集合

```http
GET /basedata/contact/getHomePageContact
```

响应外层为 `success/status/redirect/msg/data`。`data` 下分三组：

| 路径 | 用途 | 已确认公共字段 |
|---|---|---|
| `data.contact[]` | 普通客户 | `id:number`、`number:string`、`name:string` |
| `data.bigContact[]` | 大客户 | `id:number`、`number:string`、`name:string` |
| `data.supplier[]` | 供应商 | `id:number`、`number:string`、`name:string` |

大多数 `buId/customerId/contactId/contact_id/customer_id/supplierId` 都提交对应分组的 `id`。`customerNo` 必须进一步区分页面：销售明细表和销售汇总“按客户”读取 `number`，销售汇总“按商品”却读取 `id`。

### 分页选择器

普通客户选择弹窗页面为 `/settings/customer_batch`，供应商为 `/settings/supplier_batch`。两者最终都查询：

```http
GET /basedata/contact?action=list&skey=&isDelete=2&_search=false&nd=<timestamp>&rows=100&page=1&sidx=&sord=
```

按页面追加的限定条件：

| 选择器 | 追加参数 |
|---|---|
| 普通客户 | `customerType=0` |
| 大客户 | `customerType=1` |
| 供应商 | `type=10` |
| E 站简化客户 | `simple=1` |
| 已绑定微仓客户 | `simple=1&is_move_shop=1` |

响应分页容器为 `data.page/records/total/rows[]`；行公共字段仍是 `id/number/name`。

部分新微仓页面使用专用分页组件：

```http
POST /basedata/Contact/moveContact
Content-Type: application/x-www-form-urlencoded

keyword=&page=1&rows=20
```

组件读取 `data.contacts[]` 和 `data.total`；候选行使用 `id`、`number`、`name`。当前账号的专用列表可能为空，因此字段类型以组件契约为准。

### `accountNo` 的两个不同含义

`accountNo` 不能只按名字解释：

| 主查询 | 选项来源 | 实际提交 |
|---|---|---|
| `/report/fundBalance_detailSupplier` 应付明细 | `Business.filterSupplier()` | 供应商 `id`。控件同时保存 `number`，但查询模块明确读取 `data('ids')` |
| `/report/bankBalance_detail` 现金银行报表 | `/basedata/settAcct?action=list` | 结算账户 `number` |

## 门店、员工与系统用户

### 门店

```http
POST /basedata/Stores/getStoreIdName
```

响应为 `status/msg/data[]`，条目字段为 `id:string`、`name:string`、`isDefault`。销售单和出库单模板均把 `item.id` 绑定给 `storeId`。

### 员工

页面可使用以下两种只读形态：

```http
POST /basedata/employee?action=list
POST /basedata/employee/getEmployeeList
```

前者返回 `data.items[]`，后者当前返回 `data[]`。公共字段包括 `id`、`empId`、`number`、`name`，它们不是可互换字段。

| 消费页面 | 参数 | 读取字段 |
|---|---|---|
| 销售单管理、出库单管理 | `salesId`、`delieverId` | `id`；模板是 `:value="item.id"` |
| 销售明细表等老报表 | `salesId` | `number`；通用员工控件保存两个值，报表读取 `data('numbers')` |

当前已检查的这些筛选器不读取 `empId`。遇到其它页面时应查看该页绑定，不能因为字段名相似而替换。

### 登录用户/操作用户

销售单开单员：

```http
GET /scm/invSa/SelectQueryAllUser?action=SelectQueryAllUser
```

响应 `data.items[]` 使用 `userId:number` 和 `realName:string`，分别提交给 `userId` 和用于显示。

出库操作用户：

```http
POST /scm/InvSa/getUsers
```

响应 `data[]` 使用 `uid:string` 和 `userName:string`。出库单模板把同一个 `uid` 分别绑定给 `uid`、`checkId`、`cancel_uid`。

## 仓库与微仓

### 普通仓库

分页弹窗页面为 `/settings/storage_batch`，列表请求为：

```http
GET /basedata/invlocation?action=list&disable=&skey=&isDelete=2&move_type=&_search=false&nd=<timestamp>&rows=100&page=1&sidx=&sord=
```

响应为 `data.rows[]`，已确认字段：

| 字段 | 用途 |
|---|---|
| `id:string` | `locationId/outLocationId/inLocationId`，以及部分页面的仓库 `storage` |
| `locationNo:string` | `storageNo` 和仓库编号显示 |
| `name:string` | 仓库显示名；部分页面的 `storageNames` |

### 微仓

```http
POST /Storage/getMoveStorage
Content-Type: application/x-www-form-urlencoded

isMoveShop=1&key=&page=1&rows=20
```

`isMoveShop=1` 是铺货微仓，`0` 是普通微仓。响应容器为 `data.list[]/data.total/data.in_non_shop_white`。当前账号返回空列表，但页面组件已明确使用下列行字段：

| 字段 | 用途 |
|---|---|
| `id` | `storageIds` 或 `storage_id` |
| `name` | `storageNames` 和候选显示名 |
| `locationNo` | 仓库编号列 |
| `contactId` | 选中微仓后同步到主查询的 `contact_id` |
| `contactName` | “归属客户”显示列 |

因为没有非空行样本，这些字段的实际类型仍标 B；字段名和消费关系已由页面组件确认。

## 支付方式与结算账户

### 结算方式

```http
GET /basedata/assist/getAssistList
```

当前响应 `data[]` 的条目均为 `typeNumber=PayMethod`。`wayId` 取 `id:number`，显示取 `name:string`。

### 结算账户

```http
GET /basedata/settAcct/getAccountList
GET /basedata/settAcct?action=list
```

`getAccountList` 按用途返回 `data.all[]` 和 `data.nopay[]`；`action=list` 返回 `data.items[]`。公共字段均包括 `id:number`、`number:string`、`name:string`。现金银行报表的 `accountNo` 明确取 `number`。

## 商品、品牌与分类

### 商品选择器

快准商品选择页使用：

```http
GET /basedata/inventory?action=kzlist&skey=&mBrand=&cars=&models=&mYear=&displacement=&width=&typeNumber=&_search=false&nd=<timestamp>&rows=20&page=1&sidx=number&sord=desc
```

页面入口通常为 `/settings/goods_batch_kz`。原始 HTTP 响应的 `data` 是以 `kziv` 开头的站点编码字符串；页面正式处理流程解码后的候选行至少包含：

| 字段 | 释义 |
|---|---|
| `id` | 商品内部 ID |
| `number` | 原厂商产品码/业务编码 |
| `name` / `goods_sale_name` | 商品显示名 |
| `skuId` | 物料/SKU 标识 |

消费差异：

| 页面/参数 | 读取字段 |
|---|---|
| 库存余额、商品收发报表 `goods` | `id` |
| 库存余额、商品收发报表 `goodsNo` | `number` |
| 销售明细表、销售汇总表 `goodsNo` | `id` |
| 套包查询 `inv_ids` | `id` |
| 任何明确名为 `skuId` 的精确条件 | `skuId` |

因此，Agent 不能建立全局规则“`goodsNo` 一定取 `number`”。

### 通用品牌

```http
POST /basedata/assist/brand
GET /basedata/assist/brand?isDelete=0&_search=false&nd=<timestamp>&rows=100&page=1&sidx=id&sord=desc
```

两种调用都返回 `data.items[]`；通用 `brandId` 取 `id:number`，显示取 `name:string`。`code:string` 是独立业务编码，不应默认代替 `id`。

### 分类

新级联组件使用：

```http
GET /basedata/Category/tree
```

递归节点为 `data.tree[]`，包含 `id/code/name/child`。组件值配置为 `id`，多选后通常取每条路径的末级节点：

- `categoryIds/category_ids`：逗号分隔的叶节点 ID；
- `kzCategoryIds`：页面导航选择的 ID 数组，主查询中序列化为 JSON 数组字符串。

老分类组件使用：

```http
POST /basedata/assist?action=list&typeNumber=trade&isDelete=2
POST /basedata/assist?action=kzlist&typeNumber=trade&isDelete=2
POST /basedata/assist?action=alllist&typeNumber=trade&isDelete=2
```

返回 `data.items[]`，`assistId/catId` 取 `id`，显示取 `name`；具体 `action` 以消费页面为准。

### 微仓品类品牌

```http
POST /moveMall/moveSto/getCategoryWithBrand
```

响应为 `data.category[]`，分类字段是 `code/name/brands`；`brands[]` 只有 `code/name`。页面提交：

- `cateCodes/cate_codes`：所选分类 `code` 去重并以逗号连接；
- `brandIds/brand_id`：所选 `brands[].code` 去重并以逗号连接。

这组 `brandIds` 不是 `/basedata/assist/brand` 的数字 `id`。

## 其它业务选择器

### 入/出库业务类型

```http
POST /scm/invOi/queryTransType?action=queryTransType&type=in
POST /scm/invOi/queryTransType?action=queryTransType&type=out
```

响应 `data.items[]` 同时含 `id`、`typeId`、`acctId`、`name`。页面组合框配置明确为 `value: "id"`、`text: "name"`，所以 `transTypeId` 必须取 `id`。

### 跨服务站调拨

```http
POST /basedata/Assist/userList
```

响应顶层直接是数组，条目为 `uid/sid/name`。`apply_sid` 和 `deliver_sid` 均取 `sid:string`；`uid` 不是这两个筛选参数的值。

### E 站活动

```http
POST /Provider/index/saas/inner/activity/list
Content-Type: application/json

{"limit":20,"page":1,"id":"","name":"","type":"","status":"","source_type":"","examine_status":"","is_seckill":""}
```

候选列表在 `data.data[]`，`activity_id` 取 `id:number`，显示取 `name:string`。分页总数在 `data.records`。

### 大客户分类

```http
POST /scm/invCu/getCarType
```

响应 `data[]` 为 `id:string/name:string`。单选 `customType` 取 `id`；平台订单的多选 `merchant_code` 将多个 `id` 以逗号连接。

### 车型级联

```http
POST /sale/Offer/getCarDataByStep
Content-Type: application/x-www-form-urlencoded

id=<parentId>
```

根节点请求的 `id` 为空，展开节点时传当前节点 `id`。原始 HTTP 响应外层为 `success/status/redirect/msg/data`，其中 `data` 是 `kziv` 编码字符串；页面正式处理后读取 `data.list[]`，并按以下方式归一化：

- 节点 `id → value`；
- 节点 `name → label`；
- 有 `children` 时将子节点展开到当前级；
- 第四级及以后无子节点的节点标记为叶节点；
- 组件使用 `emitPath=false` 和 `multiple=true`，所以 `compressIds` 是所选叶节点 `id` 的集合，而不是完整路径。

该接口已经实现页面工作流闭环，但原始 HTTP `data` 仍需使用站点现有解码流程，因此独立 Agent 工具在具备兼容解码前应保持 B 级。

## 不需要选项接口的参数

不是所有带 `Id`、`No` 或编码含义的字段都应再寻找一个主数据接口：

- `billNo`、`relationOrderNo`、`order_no`、`refund_no`、VIN、`skey`、`matchCon` 等是用户已知内容或自由检索词，直接输入，不做候选枚举。
- `billStatus`、`saleType`、`payType`、`sourceType`、`type` 等页面内固定枚举，其值域已经写在各主查询参数表中，不需要远程选项接口。
- `billId`、`invId`、`adjustId`、`saleOrId`、`source_shop_id` 等只出现在列表响应或详情跳转上下文中，应从前一个查询响应取得；它们不是独立筛选项。查询 Agent 也不能据此调用文档明确排除的编辑、审核或删除动作。
- `parentId`、`categoryId`、`brandId`、`unitId` 等如果只是商品/分类响应的附加字段，由该行或树节点直接提供；只有当它们作为另一个查询的筛选参数时，才按本页对应业务场景查选项。

## 仍需保守处理的边界

- `/Storage/getMoveStorage` 和 `/basedata/Contact/moveContact` 在当前账号下可能返回空列表；字段名与提交关系已确认，但实际类型/可空性仍待非空样本。
- 商品和车型候选的原始 `data` 使用 `kziv`。文档记录页面正式处理后的字段契约，不把编码字符串冒充普通 JSON。
- ID、编号和名称都属于租户数据。文档只记录字段契约，不记录任何真实选项值。
