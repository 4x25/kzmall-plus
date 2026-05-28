# 库存查询接口

## 请求

参数均为写死值。

```http
GET /report/invBalance_cost?action=detail&goods=&goodsNo=&storage=&storageNo=&catId=&catName=&brandId=&area=false&zero=true&negative=false&carModel=true&area_name=
```

原始地址：

```text
https://dgj8.kzmall.cc/index.php/report/invBalance_cost?action=detail&goods=&goodsNo=&storage=&storageNo=&catId=&catName=&brandId=&area=false&zero=true&negative=false&carModel=true&area_name=
```

## 响应字段

- `key`: 字段名
- `invNo`: 原厂商产品码
- `invName`: 商品名称
- `skuId`: 物料编码
- `simpleCode`: 简码
- `spec`: 规格型号
- `unit`: 单位
- `packSpec`: 包装规格
- `brandName`: 商品品牌
- `categoryName`: 商品分类
- `in_time`: 最近入库日期
- `out_time`: 最近出库日期
- `area`: 货位
- `carModel`: 车型
- `qty_1`: 库存数量（所有仓库）
- `cost_1`: 平均单价（所有仓库）
- `allcost_1`: 结存成本（所有仓库）
- `qty_2`: 库存数量（快准仓库）
- `cost_2`: 成本价（快准仓库）
- `allcost_2`: 结存成本（快准仓库）
- `qty_3`: 库存数量（第三方仓库）
- `cost_3`: 成本价（第三方仓库）
- `allcost_3`: 结存成本（第三方仓库）

## 响应示例

```json
{
  "status": 200,
  "msg": "success",
  "data": {
    "total": 1,
    "page": 1,
    "records": 3,
    "rows": [
      {
        "carModel": "示例车型A 1.6L 2020-2022",
        "invId": "100001",
        "invNo": "INV000001",
        "invName": "示例商品A",
        "skuId": "1000000001",
        "spec": "示例规格A",
        "brandName": "示例品牌",
        "categoryName": "示例分类",
        "simpleCode": "",
        "unit": "件",
        "minNum": "1",
        "packSpec": "10件/箱",
        "qty_1": "1.0",
        "in_time": "2026-01-01 09:00:00",
        "out_time": "2026-01-02 09:00:00",
        "qty_2": "1.0",
        "cost_2": "10.00",
        "allcost_2": "10.00",
        "qty_3": "0.0",
        "cost_3": "0.00",
        "allcost_3": "0.00",
        "cost_1": "10.00",
        "allcost_1": "10.00"
      },
      {
        "carModel": "示例车型B 2.0L 2021-2023",
        "invId": "100002",
        "invNo": "INV000002",
        "invName": "示例商品B",
        "skuId": "1000000002",
        "spec": "示例规格B",
        "brandName": "示例品牌",
        "categoryName": "示例分类",
        "simpleCode": "",
        "unit": "件",
        "minNum": "1",
        "packSpec": "20件/箱",
        "qty_1": "1.0",
        "in_time": "2026-01-03 10:00:00",
        "out_time": "2026-01-04 10:00:00",
        "qty_2": "1.0",
        "cost_2": "20.00",
        "allcost_2": "20.00",
        "qty_3": "0.0",
        "cost_3": "0.00",
        "allcost_3": "0.00",
        "cost_1": "20.00",
        "allcost_1": "20.00"
      },
      {
        "carModel": "示例车型C 3.0L 2022-2024",
        "invId": "100003",
        "invNo": "INV000003",
        "invName": "示例商品C",
        "skuId": "1000000003",
        "spec": "示例规格C",
        "brandName": "示例品牌",
        "categoryName": "示例分类",
        "simpleCode": "",
        "unit": "件",
        "minNum": "1",
        "packSpec": "30件/箱",
        "qty_1": "1.0",
        "in_time": "2026-01-05 11:00:00",
        "out_time": "2026-01-06 11:00:00",
        "qty_2": "1.0",
        "cost_2": "30.00",
        "allcost_2": "30.00",
        "qty_3": "0.0",
        "cost_3": "0.00",
        "allcost_3": "0.00",
        "cost_1": "30.00",
        "allcost_1": "30.00"
      }
    ]
  }
}
```
