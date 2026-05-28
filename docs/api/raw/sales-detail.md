# 普通客户销售明细接口

## 请求

关注 `beginDate`、`endDate` 两个参数，其他参数均为写死值。

```http
GET /report/salesDetail_detail_cost?beginDate=2026-01-01&endDate=2026-01-02&customerNo=&goodsNo=&storageNo=&brandId=&cateoryTreeValue=&categoryTreeAllValue=&saleType=-1&kzCategoryIds=%5B%5D&action=sales_detail&_search=false&sidx=date&sord=desc&salesId=
```

原始地址：

```text
https://dgj8.kzmall.cc/index.php/report/salesDetail_detail_cost?beginDate=2026-01-01&endDate=2026-01-02&customerNo=&goodsNo=&storageNo=&brandId=&cateoryTreeValue=&categoryTreeAllValue=&saleType=-1&kzCategoryIds=%5B%5D&action=sales_detail&_search=false&sidx=date&sord=desc&salesId=
```

## 响应字段

- `date`: 销售日期
- `billNo`: 销售单据号
- `transTypeName`: 业务类别
- `billNoTypeStr`: 订单类型
- `transType`: 业务类别
- `salesName`: 销售人员
- `delieverName`: 送货员
- `buName`: 客户
- `cCategoryName`: 客户类型
- `type`: 商品属性
- `skuId`: 物料编码
- `number`: 原厂商产品码
- `name`: 商品名称
- `productCode`: 快准产品码
- `brandName`: 品牌名称
- `firstCategoryName`: 商品一级分类
- `secondCategoryName`: 商品二级分类
- `categoryName`: 商品分类
- `spec`: 规格型号
- `packSpec`: 包装规格
- `unit`: 单位
- `location`: 仓库
- `areaNo`: 货位
- `qty`: 数量
- `unitPrice`: 单价
- `amount`: 订单金额
- `disAmount`: 优惠金额
- `recAmount`: 应收金额
- `unitCost`: 成本价
- `cost`: 销售成本
- `saleProfit`: 销售毛利
- `salepPofitRate`: 毛利率
- `description`: 备注

## 响应示例

```json
{
  "status": 200,
  "data": {
    "rows": [
      {
        "billId": "900000000000000001",
        "billNo": "XS0000202601010001",
        "billType": "SALE",
        "date": "2026-01-01",
        "buId": 100001,
        "buName": "示例客户A",
        "productCode": "EA000001F",
        "number": "KZ000001FS",
        "name": "示例商品",
        "spec": "示例规格",
        "unit": "件",
        "minNum": "1",
        "packSpec": "10件/箱",
        "salesName": "示例销售员",
        "delieverName": "示例送货员",
        "location": "示例仓库",
        "areaNo": "A-01-01",
        "description": "",
        "skuId": "1000000001",
        "brandName": "示例品牌",
        "categoryName": "示例分类",
        "cCategoryName": "示例客户类型",
        "firstCategoryName": "示例一级分类",
        "secondCategoryName": "示例二级分类",
        "cost": 10,
        "unitCost": "10.00000000",
        "saleProfit": 5,
        "salepPofitRate": "33.33%",
        "transTypeName": "销售",
        "transType": "150601",
        "unitPrice": "15.00000000",
        "qty": 1,
        "amount": 15,
        "recAmount": 15,
        "disAmount": "0.00000000",
        "billNoTypeStr": "销售"
      }
    ]
  }
}
```
