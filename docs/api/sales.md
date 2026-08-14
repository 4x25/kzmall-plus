# 销售查询接口

> 本文档只收录列表、库存和报表查询。页面中的开单、收款、发货、退款、调拨、审核、编辑、复制、删除和导出等动作均不在查询 Agent 的可调用范围内。

## 销售单管理

证据等级：B。已确认主列表请求与待出库数量辅助查询；当前载荷未取得稳定明文 schema。

```http
GET /scm/invSa?action=list&matchCon=&hxState=&beginDate=<YYYY-MM-DD>&endDate=<YYYY-MM-DD>&salesId=&rows=50&page=1&sord=&sidx=&buId=&storeId=&billNo_type=&delieverId=&wayId=&payType=&billStatus=&billNo_source=&userId=&activity_id=&vin=
```

```http
POST /scm/invSa/getSaleWaitOutNum
Content-Type: application/x-www-form-urlencoded

action=list&matchCon=&hxState=&beginDate=<YYYY-MM-DD>&endDate=<YYYY-MM-DD>&salesId=&sord=&sidx=&buId=&storeId=&billNo_type=&delieverId=&wayId=&payType=&billStatus=&billNo_source=&userId=&activity_id=&vin=
```

业务条件：客户 `buId`、起止日期、综合条件 `matchCon`（客户/单号/整单备注），以及销售员、门店、订单类型、送货员、收款方式、结算方式、单据状态、来源、开单员、活动 ID、VIN 等高级条件。分页默认 `rows=50`、`page=1`。

输出列：销售单号、活动 ID、开单时间、销售门店、订单/出库/已收/优惠金额、优惠率、订单状态/类型、收款/结算方式、打印/出库次数、销售员、开单员、数据来源、送货员、VIN、备注、客户名称。

## 出库单管理

证据等级：C。

```http
GET /scm/invSa?action=deliveryList
```

已确认 UI 条件：客户、起止日期、“客户/单号/整单备注”综合条件、高级搜索、状态页签与分页（默认 50 条/页）。输出列：出库单号、出库时间/数量/金额、已收金额、销售门店、订单状态、送货信息、收款状态、销售单号、核销时间、打印次数、单据来源、出库人、销售员、活动 ID、VIN、备注、客户名称。页面的收款、打印和行内操作不可调用。

## 销售退货单管理

证据等级：B（主请求与完整 UI 字段已确认；默认结果无行 schema）。

```http
GET /scm/invSa?action=list&matchCon=&transType=150602&beginDate=<YYYY-MM-DD>&endDate=<YYYY-MM-DD>&_search=false&nd=<timestamp>&rows=100&page=1&sidx=&sord=asc
```

`transType=150602` 是销售退货固定类型。`matchCon` 提示“单据号/客户名/备注/制单人”；另有日期和订单类型 `saleType`。分页默认 100 条。

输出列：单据日期/编号、退货类型、销售人员、客户、门店、客户承担费用、销售/优惠/应收/折损金额、已退款、退款状态、制单人、订单类型/来源/编号、审核人、备注、退货原因。

## 报价单管理

证据等级：C。

```http
GET /scm/invSa?action=goodsQuotePriceKZList
```

页面条件：客户、起止日期、“商品名称/商品码/报价单号”综合条件，分页默认 500 条。主列表请求路径未被正常抓包证明，不得生成 HTTP 工具。

## 微仓出入库

证据等级：B。

```http
POST /basedata/Inventory/getMoveFlow
Content-Type: application/x-www-form-urlencoded

page=1&rows=20&storageIds=&storageNames=&startDate=<YYYY-MM-DD>&endDate=<YYYY-MM-DD>&isMoveShop=&trans_type=&skey=&billNo=
```

单据类型选项：

```http
GET /basedata/Inventory/moveTransType
```

条件：微仓/归属客户、日期、单据编号、物料编码/产品简码、单据类型、分页。输出列：单据编号/日期、归属客户、商品名称、产品简码、规格型号、单位、数量、商品分类、单据类型、单据金额。

## 微仓账号

证据等级：B。列表页自动读取：

```http
POST /moveMall/AgentContact/list
```

无独立查询条件。输出列：账号、姓名、是否启用。这些属于身份信息，Agent 只应在用户明确询问时返回必要字段，不得持久化实际值。

## 微仓其他查询页

证据等级：C。下列只有可靠 UI 契约，不得生成 HTTP 工具：

| 页面入口 | 主要条件 | 输出列 |
|---|---|---|
| `GET /settings/moveStoInventory` | 客户关键词、商品类别、物料/产品简码、库存条件、分页 | 商品名称、产品简码、规格、单位、包装规格、当前库存、预警值、滞留天数、首次入库/最近领用时间、适用车型 |
| `GET /settings/move_storage_first_match` | 客户、分类/品牌、历史销量类型、周期、日期、备货模式 | 品类、品牌、产品简码、原厂产品码、销量、推荐备货数、服务站库存、微仓历史备货状态 |
| `GET /settings/move_storage_crfp?action=move_storage_crfp` | 客户关键词、起止时间、分类/品牌、商品关键词、排序 | 商品、产品简码、单位、当前库存、预警值、领用数量、补货推荐数量 |

## E 站套餐

证据等级：A。

```http
POST /Provider/index/saas/inner/bag/list
Content-Type: application/x-www-form-urlencoded

page=1&limit=<pageSize>&source_type=
```

输入为套餐名称/编号类文本条件和来源，页面不显示独立分页器时仍传 `page` / `limit`。响应：`code`、`message`、`data.count`、`data.page_count`、`data.list[]`、`data.select_status[]`。当前页无数据行，字段以 UI 列为准：套餐图片、名称、金额、库存、状态、支付方式、更新人、更新时间。

## E 站活动

证据等级：A。

```http
POST /Provider/index/saas/inner/activity/list
Content-Type: application/x-www-form-urlencoded

limit=<pageSize>&page=1&id=&name=&type=&status=&source_type=&examine_status=&is_seckill=
```

条件：活动 ID、名称、类型、状态、来源、审核状态、是否秒杀，以及三组时间区间。已观察行字段：`id`、`name`、`type`、`begin_time`、`end_time`、`status`、`description`、`create_time`、`modify_time`、`source_type`、`examine_status`、`is_seckill`、`online_time`、`platform`、`creator`、`editor`、`type_name`、`status_name`、`examine_status_name`、`examine_time` 等。页面列：来源、上线/开始/结束时间、状态、秒杀标记、类型、活动 ID/名称、发起时间。

页面自动调用的 `hasRegister` / `register` 是 E 站注册状态流程，不属于查询 Agent 的活动列表工具。

## E 站积分商品

证据等级：B。

```http
POST /provider/index/saas/inner/credit/product/list
```

页面条件：关键词、状态、`page`、`limit`（默认 20）。输出列：商品 ID/名称/分类/图片、兑换积分、已兑换数量、当前库存、状态。响应未得到可靠明文 JSON schema，不要根据类似页面猜字段名。

## E 站订单

证据等级：B。

```http
POST /moveMall/Orders/activityOrderList
Content-Type: application/x-www-form-urlencoded

limit=<pageSize>&page=1&is_all=&order_no=&activity_id=&activity_name=&activity_source_type=&order_status=&begin_time=&end_time=&data_source=
```

输出列：订单编号、销售单号、订单时间、活动编号/名称/平台、是否套包、支付方式、订单来源、维修厂、订单状态、付款时间、优惠金额/来源/面额、实付/返现/收款金额。

## E 站积分订单

证据等级：B。

```http
POST /provider/index/saas/inner/credit/order/list
Content-Type: application/x-www-form-urlencoded

contact_id=&keyword=&start_date=<YYYY-MM-DD>&end_date=<YYYY-MM-DD>&limit=20&page=1
```

客户选项读取：

```http
GET /basedata/contact?action=list&simple=1
```

输出列：下单客户、订单号、下单时间、订单状态、商品名称、商品件数。

## E 站退货申请

证据等级：B。

```http
GET /applyReturn/applyReturnOrder/getList?skey=&customer_id=&search_type=1&data_source=1&page=1&rows=20&status=
```

客户选项：

```http
GET /basedata/contact?action=list&page=1&row=100000&disable=true&customerType=0&isDelete=0
```

页面另有开始/结束日期条件，当空值时请求可省略对应键。输出列：单据日期、申请单号、客户、退货金额/数量/状态、退货单号、备注。

## E 站关单退款

证据等级：B。

```http
POST /moveMall/UnionPayController/refund
Content-Type: application/x-www-form-urlencoded

bill_no=&sa_invoice_order_no=&contact_name=&status=&pay_type=&ctime_start=&ctime_end=&rtime_start=&rtime_end=&page=1&limit=20&data_source=
```

输出列：退款状态、发起时间、退款单号、关联订单号/来源、维修厂、退款来源/金额/方式、流水号、退款人、退款时间。不得把这个列表查询与任何实际退款执行动作混淆。

## 商品调拨单管理

证据等级：C。

```http
GET /stf/apply?action=list
```

已确认条件：调拨申请/出/入单号、三组状态/类型选择、商品名称/原厂产品码/物料编码、其他上下文选择和分页（默认 20）。输出列：申请单号/时间/服务站、发货服务站、状态、调拨类型、出/入库调拨单号、调出/调入金额、发货/入库时间、申请人、备注。主列表请求路径未被正常抓包证明，不得生成 HTTP 工具。

## 大客户销售出库单

证据等级：A（来自仓库已脱敏的早期请求笔记，当前 UI 入口已复核）。

```http
GET /scm/invCu?action=list&matchCon=&transType=180601&beginDate=<YYYY-MM-DD>&endDate=<YYYY-MM-DD>&relationOrderNo=&_search=false&sidx=&sord=asc&salesId=0&hxState=0&serviceType=0&sourceType=0&delieverId=0&customType=0&billStatus=
```

主要条件：综合条件、日期、关联订单号、销售/送货人员、核销状态、服务类型、来源、客户类型、单据状态。响应外层：`success`、`status`、`redirect`、`msg`、`data`；`data` 使用 jqGrid 的 `page`、`records`、`total`、`rows`。

行字段：`id`、`billDate`、`billNo`、`saCode`、`saleName`、`contactName`、`delieverName`、`buName`、`disRate`、`disAmount`、`billStatus`、`totalAmount`、`transTypeName`、`description`、`transType`、`amount`、`totalPurPrice`、`totalCost`、`hxStateCode`、`userName`、`rpAmount`、`serviceType`、`serviceTypeName`、`postageKz`、`sourceType`、`srcOrderNo`、`srcChannelOrder`、`srcOrderSource`。

金额口径已用真实响应逐行校验：`amount = totalAmount - disAmount`，因此应收/销售收入取 `amount`；`totalPurPrice` 是销售成本；`totalCost` 虽名称像成本，实际是毛利，基本满足 `totalCost = amount - totalPurPrice`（最多存在分位舍入差）。

## 大客户销售退货单

证据等级：C。

```http
GET /scm/invCu?action=BigInitSaleList&transType=180602
```

UI 条件：单据号/客户名/厂家产品码、日期、销售人员、关联平台退单号、来源。输出列：配送日期、订单编号、业务类型、销售/送货人员、状态、业务类别、客户、优惠率/金额、销售金额、服务站配送费、成本/毛利金额、制单人、来源、关联平台退单号。主列表 URL 未被正常抓包证明，不得调用。

## 大客户销售配送/退货明细

证据等级：C。

```http
GET /Report/initCuSale_detail?transType=180601
GET /Report/initCuSale_detail?transType=180602
```

两页使用同一 UI 契约：客户、起止日期、分类、品牌、状态（待审核/未通过/已完成），以及按大客户销售单号/物料名称/物料编码/产品码搜索。输出列：单据日期/编号/状态/业务类型、物料编码、商品名称、原厂产品码、品牌/分类、规格、单位、折扣额/率、数量、单价、合计/成本/毛利金额。

## 大客户平台订单

证据等级：B。

```http
POST /scm/invCu/channelOrder
Content-Type: application/x-www-form-urlencoded

order_no=&begin_date=&end_date=&merchant_code=&contact_name=&contact_user=&mobile=&status=&sku_name=&page=1&rows=20
```

输出列：时间、平台单号、客户类别/名称、客户地址、联系人/联系方式、商品数量、已发货数量、订单总额、状态、备注。返回结果包含个人和经营敏感信息，Agent 应默认摘要，不得持久化实际值。

## 大客户平台退单

证据等级：B。

```http
POST /scm/invCu/channelAftersale
Content-Type: application/x-www-form-urlencoded

order_no=&refund_no=&begin_date=&end_date=&merchant_code=&contact_name=&contact_user=&mobile=&status=&sku_name=&page=1&rows=20
```

输出列：时间、平台退货单号、平台订单号、客户类别/名称/地址、联系人/联系方式、退货数量、退单总额、状态、备注。

## 普通客户销售明细

证据等级：A。

```http
GET /report/salesDetail_detail?action=detail&beginDate=<YYYY-MM-DD>&endDate=<YYYY-MM-DD>&customerNo=&goodsNo=&storageNo=&brandId=&cateoryTreeValue=&categoryTreeAllValue=&saleType=-1&kzCategoryIds=%5B%5D&action=sales_detail&_search=false&nd=<timestamp>&rows=3000&page=1&sidx=date&sord=desc&salesId=
```

注意：真实请求有两个 `action`：先 `detail`，后 `sales_detail`；使用 `URLSearchParams.append`保留重复键。

业务条件：日期、客户、商品、仓库、业务员、品牌、快准/三方类别、订单类型（`-1` 全部、`0` 销售、`1` 铺货、`2` 微仓铺货）。默认 `rows=3000`、`page=1`、`sidx=date`、`sord=desc`。

响应 `data.rows[]` 行字段：`billId`、`billNo`、`billType`、`date`、`buId`、`buName`、`productCode`、`number`、`name`、`spec`、`unit`、`minNum`、`packSpec`、`salesName`、`delieverName`、`location`、`areaNo`、`description`、`skuId`、`brandName`、`categoryName`、`cCategoryName`、`firstCategoryName`、`secondCategoryName`、`transTypeName`、`transType`、`unitPrice`、`qty`、`amount`、`recAmount`、`disAmount`、`billNoTypeStr`。“计算毛利”开启后还可有 `cost`、`unitCost`、`saleProfit`、`salepPofitRate`。金额口径已逐行校验：`recAmount = amount - disAmount`，销售收入取 `recAmount`，销售成本取 `cost`；`saleProfit` 基本满足 `recAmount - cost`，可有分位舍入差。

## 销售汇总

证据等级：C。

```http
GET /report/sales_summary_good_customer
```

页面有“按商品”与“按客户”两个维度。条件：日期、客户、商品、仓库、品牌、快准类别及毛利开关。当前报表组件未在正常 Resource Timing/CDP 通道中暴露主请求，因此不猜路径或字段。

## 销售对账明细

证据等级：C。

```http
GET /report/sales_reconciliation_details?action=sales_reconciliation_details
```

条件：起止日期、客户、类型（支付方式/账户）、收款状态（全部/全部收款/欠款）、订单类型、销售出库单号。输出列：ID、订单类型、销售出库单号、客户、门店、收款类型、销售金额、小计、折让金额、应收余额、销售制单日期。该页当前未证明主请求 URL，不得生成 HTTP 工具。

## 明确排除的销售写流程

商品报价、快速报价、销售单、销售退货单、商品调拨单、大客户销售出库单、大客户销售退货单属于创建/变更业务单据流程，不纳入查询 Agent 工具集。管理列表即使包含编辑、打印、收款、审核、退款、复制等按钮，也只能使用其查询动作。
