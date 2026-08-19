# 共享辅助查询接口

这些接口由销售、库存和商品页面正常打开时自动调用，用于构造查询表单的品牌、分类和业务类别选项。

主查询参数到选项接口、ID 字段和显示字段的统一映射见[查询参数 ID / 编码来源](./lookups.md)。

## 品牌列表

证据等级：A。

页面存在两种调用形态。老页面自动发出无请求体的 `POST`；本项目现有前端使用可分页的 `GET`。目前只确认二者都返回品牌候选，尚未证明默认过滤、排序和全集范围完全等价；Agent 优先使用可根据 `data.totalsize` 翻页的 `GET`。

```http
POST /basedata/assist/brand
<empty body; no Content-Type header>
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

两种形态的成功条件均为 `success === true && status === "success"`；失败时读取 `msg` 并 fail closed。响应外层：`success`、`status`、`redirect`、`msg`、`data`；`data` 包含 `items`、`totalsize`。

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

无请求参数。成功条件为 `success === true && status === "success"`；失败时读取 `msg` 并 fail closed。当前非空响应外层为 `success:boolean`、`status:string`、`redirect:null`、`msg:string`、`data:object`，分类树位于 `data.tree[]`。

| 响应字段/路径 | 类型/可空 | UI 用途 | 释义 |
|---|---|---|---|
| `data.tree[].id` | string | 分类节点值/上下文 | 分类内部 ID |
| `data.tree[].parentId` | string | 树层级 | 父分类 ID；顶层按后端约定取根值 |
| `data.tree[].name` | string | 分类显示名 | 分类中文名称 |
| `data.tree[].code` | string | 分类上下文 | 分类业务编码；当前销售明细 `kzCategoryIds` 不提交它，而提交叶节点 `id` |
| `data.tree[].child` | array | 子级节点 | 递归子分类数组；子节点字段结构相同 |

当前销售明细页把该接口绑定到新的“快准类别”级联选择器：`value=id`、`children=child`、`emitPath=false`、`multiple=true`。因此选择结果是叶节点 ID 数组，主查询参数 `kzCategoryIds` 使用 `JSON.stringify(...)`，例如两个节点在线路上是 `kzCategoryIds=%5B%22<id1>%22%2C%22<id2>%22%5D`，空值固定发送 `kzCategoryIds=%5B%5D`。

不要从该接口全局推断 `cateoryTreeValue` 或 `categoryTreeAllValue`。这两个名称来自老分类控件，并且在不同旧报表中可能有页面级差异；当前销售明细页的精确绑定见下一节和[来源映射](./lookups.md#分类)。

## 三方类别/业务类别列表

证据等级：A。

```http
POST /basedata/assist?action=list&typeNumber=trade&isDelete=2
<empty body; no Content-Type header>

POST /basedata/assist?action=kzlist&typeNumber=trade&isDelete=2
<empty body; no Content-Type header>

POST /basedata/assist?action=alllist&typeNumber=trade&isDelete=2
<empty body; no Content-Type header>
```

三种 `action` 由不同页面使用：

- `list`：三方类别或通用类别；
- `kzlist`：快准类别；
- `alllist`：库存页所需的完整集合。

2026-08-19 又通过库存查询页的正常自动加载逐项复核了 `alllist`：它同样是零字节请求体，且请求头中没有 `Content-Type`。因此上面三种请求形态都已闭环；不得把任一请求改成 `{}` 或空表单。

当前销售明细页已确认以下逐项映射，不能因参数名称相似而对调：

| 主查询参数 | UI/选项来源 | 提交字段与线格式 | 空值行为 |
|---|---|---|---|
| `cateoryTreeValue` | 三方类别老树，`action=list` | 单个所选节点的 `id`，普通字符串 | 发送 `cateoryTreeValue=` |
| `categoryTreeAllValue` | 历史快准类别老树，`action=kzlist`；当前控件隐藏 | 单个所选节点的 `id`，普通字符串 | 正常请求发送 `categoryTreeAllValue=` |

`alllist` 本轮只确认了库存页面会加载该候选集合，没有取得非空选择后的消费线格式；库存报表中的旧分类筛选因此仍应保持隐藏。

三种 `action` 的成功条件均为 `status === 200`；失败时读取 `msg` 并 fail closed。分页候选位于 `data.items[]`，总数位于 `data.totalsize`。

响应条目已观察字段：

`detail`、`id`、`level`、`name`、`parentId`、`remark`、`sortIndex`、`status`、`typeNumber`、`isSelf`。

这些虽然使用 `POST`，但在页面中仅用于读取选项。Agent 不应把同一路径扩展为新增或修改类别动作。

## 其他页面级辅助查询

打开快准商品管理页时还会自动调用：

```http
POST /basedata/QuoteManager/isV2QuoteRule
```

它用于判断当前服务站是否启用 v2 报价规则，不是规则列表本身。本轮未把它作为 Agent 能力，未闭环独立请求体和成功谓词，因而不得注册或调用。规则列表见[商品与品牌查询接口](./products.md)。
