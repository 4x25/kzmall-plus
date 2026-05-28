# 大客户销售明细接口

## 请求

关注 `beginDate`、`endDate` 两个参数，其他参数均为写死值。

```http
GET /scm/invCu?action=list&matchCon=&transType=180601&beginDate=2026-01-01&endDate=2026-01-05&relationOrderNo=&_search=false&sidx=&sord=asc&salesId=0&hxState=0&serviceType=0&sourceType=0&delieverId=0&customType=0&billStatus=
```

原始地址：

```text
https://dgj8.kzmall.cc/index.php/scm/invCu?action=list&matchCon=&transType=180601&beginDate=2026-01-01&endDate=2026-01-05&relationOrderNo=&_search=false&sidx=&sord=asc&salesId=0&hxState=0&serviceType=0&sourceType=0&delieverId=0&customType=0&billStatus=
```

## 响应字段

- `billDate`: 配送日期
- `billNo`: 订单编号
- `serviceTypeName`: 业务类型
- `saleName`: 销售人员
- `delieverName`: 送货人员
- `billStatus`: 状态
- `transTypeName`: 业务类别
- `contactName`: 客户
- `disRate`: 优惠率
- `disAmount`: 优惠金额
- `totalAmount`: 销售金额
- `postageKz`: 服务站配送费
- `totalPurPrice`: 成本金额
- `totalCost`: 毛利金额
- `userName`: 制单人
- `sourceType`: 来源

## 响应示例

```json
{
  "success": true,
  "status": "success",
  "redirect": null,
  "msg": "查询成功！",
  "data": {
    "page": 1,
    "records": "2",
    "total": 1,
    "rows": [
      {
        "id": "100001",
        "billDate": "2026-01-02",
        "billNo": "DKH000020260102000001",
        "saCode": null,
        "saleName": "示例销售员",
        "contactName": "示例大客户A",
        "delieverName": "示例送货员",
        "buName": "示例店铺A",
        "disRate": "0.00",
        "disAmount": 0,
        "billStatus": "已完成",
        "totalAmount": 100,
        "transTypeName": "大客户销售",
        "description": "",
        "transType": "180601",
        "amount": 100,
        "totalPurPrice": 80,
        "totalCost": 20,
        "hxStateCode": "未付款",
        "userName": "示例制单人",
        "rpAmount": 0,
        "serviceType": "3",
        "serviceTypeName": "临采业务",
        "postageKz": "0.00000000",
        "sourceType": "自制订单",
        "srcOrderNo": "",
        "srcChannelOrder": "",
        "srcOrderSource": "default"
      },
      {
        "id": "100002",
        "billDate": "2026-01-03",
        "billNo": "DKH000020260103000002",
        "saCode": null,
        "saleName": "示例销售员",
        "contactName": "示例大客户B",
        "delieverName": "示例送货员",
        "buName": "示例店铺B",
        "disRate": "0.00",
        "disAmount": 0,
        "billStatus": "已完成",
        "totalAmount": 200,
        "transTypeName": "大客户销售",
        "description": "",
        "transType": "180601",
        "amount": 200,
        "totalPurPrice": 160,
        "totalCost": 40,
        "hxStateCode": "未付款",
        "userName": "示例制单人",
        "rpAmount": 0,
        "serviceType": "3",
        "serviceTypeName": "临采业务",
        "postageKz": "0.00000000",
        "sourceType": "自制订单",
        "srcOrderNo": "",
        "srcChannelOrder": "",
        "srcOrderSource": "default"
      }
    ]
  }
}
```
