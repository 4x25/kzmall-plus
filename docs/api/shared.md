# 共享辅助查询接口

这些接口由销售、库存和商品页面正常打开时自动调用，用于构造查询表单的品牌、分类和业务类别选项。

主查询参数到选项接口、ID 字段和显示字段的统一映射见[查询参数 ID / 编码来源](./lookups.md)。

## 品牌列表

证据等级：A。

页面存在两种等价调用形态：老页面自动发出无请求体的 `POST`，本项目现有前端使用带分页参数的 `GET`。

```http
POST /basedata/assist/brand
```

```http
GET /basedata/assist/brand?isDelete=0&_search=false&nd=<timestamp>&rows=100&page=1&sidx=id&sord=desc
```

查询参数：

| 参数 | 类型 | 示例/默认值 | 说明 |
|---|---|---|---|
| `isDelete` | integer | `0` | 仅正常品牌 |
| `_search` | boolean-like string | `false` | jqGrid 搜索开关 |
| `nd` | integer | `<timestamp>` | 防缓存值 |
| `rows` | integer | `100` | 页大小 |
| `page` | integer | `1` | 页码，从 1 开始 |
| `sidx` | string | `id` | 排序字段 |
| `sord` | enum | `desc` | `asc` / `desc` |

响应外层：`success`、`status`、`redirect`、`msg`、`data`；`data` 包含 `items`、`totalsize`。

`data.items[]` 字段：

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | number | 品牌 ID；提交给其他查询接口的 `brandId` |
| `number` | number | 品牌内部编号 |
| `name` | string | 品牌名称 |
| `alias` | string | 品牌别名 |
| `remark` | string/null | 备注 |
| `sortIndex` | number | 排序值 |
| `status` | number | 状态 |
| `code` | string | 品牌编码 |

Agent 最小输出建议为 `{ id, name }`；不要将整份品牌表重复写入对话上下文。

## 快准商品分类树

证据等级：A（请求已抓取，响应为 JSON）。

```http
GET /basedata/Category/tree
```

无请求参数。当前非空响应外层为 `success:boolean`、`status:string`、`redirect:null`、`msg:string`、`data:object`，分类树位于 `data.tree[]`。

| 响应字段/路径 | 类型/可空 | UI 用途 | 释义 |
|---|---|---|---|
| `data.tree[].id` | string | 分类节点值/上下文 | 分类内部 ID |
| `data.tree[].parentId` | string | 树层级 | 父分类 ID；顶层按后端约定取根值 |
| `data.tree[].name` | string | 分类显示名 | 分类中文名称 |
| `data.tree[].code` | string | 业务查询值 | 分类编码，供相关查询条件使用 |
| `data.tree[].child` | array | 子级节点 | 递归子分类数组；子节点字段结构相同 |

该接口用于页面的“快准类别”级联选择器。选择后，业务查询通常提交：

- `cateoryTreeValue`：注意后端沿用拼写错误 `cateory`；
- `categoryTreeAllValue`：完整层级值；
- 部分页面另提交 `kzCategoryIds`，默认是字符串化 JSON 数组 `[]`。

不要自行修正参数拼写，否则后端不会识别。

## 三方类别/业务类别列表

证据等级：A。

```http
POST /basedata/assist?action=list&typeNumber=trade&isDelete=2
POST /basedata/assist?action=kzlist&typeNumber=trade&isDelete=2
POST /basedata/assist?action=alllist&typeNumber=trade&isDelete=2
```

三种 `action` 由不同页面使用：

- `list`：三方类别或通用类别；
- `kzlist`：快准类别；
- `alllist`：库存页所需的完整集合。

响应条目已观察字段：

`detail`、`id`、`level`、`name`、`parentId`、`remark`、`sortIndex`、`status`、`typeNumber`、`isSelf`。

这些虽然使用 `POST`，但在页面中仅用于读取选项。Agent 不应把同一路径扩展为新增或修改类别动作。

## 其他页面级辅助查询

打开快准商品管理页时还会自动调用：

```http
POST /basedata/QuoteManager/isV2QuoteRule
```

它用于判断当前服务站是否启用 v2 报价规则，不是规则列表本身。规则列表见[商品与品牌查询接口](./products.md)。
