/**
 * 快准车服只读查询端点注册表（唯一合法接口清单）。
 *
 * 这里的每一条都来自 kzmall-plus 仓库 docs/api/ 中"证据等级 A/B + Agent 线路
 * 可执行/条件可执行"的抓包记录。注册表之外的任何路径都不允许调用：写接口、
 * 页面会话依赖接口（原始 data 是 kziv 编码）、FineReport 报表协议和只有
 * C 级入口证据的页面都被故意排除。
 *
 * 为什么用"有序模板"而不是普通对象：多个端点的真实请求带重复键
 * （销售明细有两个 action、现金银行和应付明细也有两个 action），
 * 普通对象序列化会把前一个覆盖掉，后端行为随之改变。模板保留顺序和重复键。
 *
 * 模板取值形式：
 *   'literal'                → 固定值，原样发送
 *   { p: 'beginDate' }       → 必填参数，缺失即报错
 *   { p: 'customerNo', opt } → 可选参数；未提供时仍发送空键（页面就是这么发的）
 *   { nd: true }             → jqGrid 防缓存时间戳，不是业务条件
 *   { rows: true } / { page: true } → 分页参数，由 kz-http 按预算注入
 */

export const MAX_RESPONSE_BYTES = 2 * 1024 * 1024 // 2 MiB，全局查询预算
export const MAX_ROWS_RELIABLE = 200 // 有可靠服务端分页时的单页硬上限
export const MAX_ROWS_LOADONCE = 3000 // 页面 loadonce 端点已证明可用的上限

/** 业务成功谓词。HTTP 200 从来不等于"查询成功"，必须逐端点判断。 */
export const PREDICATES = {
  /** body.status === 200 */
  status200: (b) => b && typeof b === 'object' && b.status === 200,
  /** body.success === true && body.status === 'success' */
  successStatus: (b) => b && typeof b === 'object' && b.success === true && b.status === 'success',
  /** body.code === 0 */
  code0: (b) => b && typeof b === 'object' && b.code === 0,
  /** 顶层就是数组，且 HTTP 200（个别辅助接口没有业务状态字段） */
  topLevelArray: (b) => Array.isArray(b),
}

/**
 * 大客户单据列表的"精确空结果哨兵"。
 *
 * 这个端点在"查询成功但这段时间没有单据"时，返回的信封与成功形态完全不同：
 * status 是字符串 "-1"、msg 是"没有数据"、data 是长度 0 的数组。成功谓词对它必然不成立，
 * 如果不单独识别，就会把"这个月没有大客户业务"错报成"查询失败"——而这两者对用户的含义完全相反。
 *
 * 识别条件必须逐项精确匹配（四个条件全中才算），放宽任何一格都会把真正的失败当成空结果放过去。
 * 抓包证据来自 transType=180602 的空响应；180601 是同一个后端处理器，所以两边都挂上。
 */
const KEY_ACCOUNT_EMPTY_SENTINEL = {
  match: { status: '-1', msg: '没有数据' },
  dataEmptyArray: true,
  why: '大客户单据列表在无数据时返回 status="-1" + msg="没有数据" + data=[]，与成功信封不同形态。',
}

/**
 * @typedef {object} Endpoint
 * @property {string} title       中文名称，用于人类可读输出
 * @property {'GET'|'POST'} method
 * @property {string} path        相对快准基地址的路径（网关前缀 /api 由 kz-http 加）
 * @property {Array} [query]      有序查询模板
 * @property {Array} [form]       有序 application/x-www-form-urlencoded 模板
 * @property {'none'|'empty-form'} [body] 无模板时的请求体形态
 * @property {boolean} [trailingAmp] 抓包里请求体结尾多一个 &，保持一致
 * @property {keyof PREDICATES} success
 * @property {{match:object, dataEmptyArray?:boolean, why:string}} [emptySentinel]
 *   成功谓词之外的、精确匹配的"查询成功但无数据"信封。只有全部条件同时成立才归一为空结果，
 *   否则仍按 fail closed 处理——把失败当成空结果，会让"接口出问题了"变成"这个月没生意"。
 * @property {string} [transTypeOverride] 继承查询模板后要替换的 transType 值（同一端点靠它区分出库/退货）
 * @property {string} container   行数组路径；'@raw' 表示整个 data 都要保留
 * @property {boolean} [emptyDataArrayOk] 成功的空查询可能直接返回 data: []
 * @property {string} [footer]    服务端算好的合计对象路径
 * @property {Array<string|{row:string,footer:string}>} [footerSum]
 *   可与行求和交叉核对的字段；行与页脚字段名不同时写成 {row, footer}
 * @property {{field:string, values:string[], why:string}} [excludeRows]
 *   后端混在明细里的结构性伪行（小计 / 期初余额 / 合计）。这些行必须在求和之前
 *   剔除，否则会重复计算——应付账款明细表的行里就夹了 230 条"小计"，
 *   不剔正好把金额算成两倍。剔除动作会连数量一起报告，不做静默丢弃。
 * @property {object} [dates]     日期口径与跨度上限
 * @property {object} [paging]    分页能力
 * @property {boolean} [costGated] 成本/毛利端点，必须用户明确要求才可调用
 * @property {string[]} [narrow]  强烈建议至少提供其中一个窄化条件
 * @property {string} [notes]
 */

/** @type {Record<string, Endpoint>} */
export const ENDPOINTS = {
  // ── 经营与利润：回答"销售额 / 成本 / 毛利"的首选口径 ──────────────────────
  'day-report': {
    title: '经营报表-日报',
    method: 'GET',
    path: 'report/getDayReport',
    query: [
      ['action', 'getDayReport'],
      ['beginDate', { p: 'beginDate' }],
      ['endDate', { p: 'endDate' }],
      ['_search', 'false'],
      ['nd', { nd: true }],
      ['rows', { rows: true }],
      ['page', { page: true }],
      ['sidx', 'date'],
      ['sord', 'desc'],
    ],
    success: 'status200',
    container: 'data.rows',
    footer: 'data.userdata',
    footerSum: ['sale_fee', 'cost_fee', 'profit', 'cash_fee', 'credit_fee', 'xt_fee'],
    dates: { begin: 'beginDate', end: 'endDate', unit: 'day', maxSpan: 31 },
    // 行数天然不超过日期跨度（≤31），远小于请求上限，所以取到就是闭环
    paging: { mode: 'date-bounded', defaultRows: 200 },
    dateField: 'dw_billdate',
    notes:
      '一行一天，日期字段是 dw_billdate（没有 date 字段）。没有业务发生的日期不会出现在 rows 里，' +
      '所以行数少于天数是正常的，不是截断。已核验恒等式：sale_fee = cash_fee + credit_fee + xt_fee + dbck_fee；' +
      'profit = (sale_fee - dbck_fee) - cost_fee；profit_rate = round(profit / sale_fee × 100)%。' +
      'dbck_fee 是调拨出库，计入 sale_fee 但不计入 profit 的收入侧，所以直接用 sale_fee - cost_fee 会比后端 profit 多出 dbck_fee。' +
      '另有一组快准口径字段 kzSaleFee / kzCostFee / kzProfit，它们满足 kzSaleFee - kzCostFee = kzProfit。',
  },

  'month-report': {
    title: '经营报表-月报',
    method: 'GET',
    path: 'report/getMonthReport',
    query: [
      ['action', 'getMonthReport'],
      ['beginDate', { p: 'beginDate' }],
      ['endDate', { p: 'endDate' }],
      ['_search', 'false'],
      ['nd', { nd: true }],
      ['rows', { rows: true }],
      ['page', { page: true }],
      ['sidx', 'date'],
      ['sord', 'desc'],
    ],
    // 月报的成功谓词和日报不同，不能共用解析器
    success: 'successStatus',
    container: 'data.rows',
    footer: 'data.userdata',
    footerSum: ['sale_fee', 'cost_fee', 'profit'],
    dates: { begin: 'beginDate', end: 'endDate', unit: 'month-first-day', maxSpan: 366, budgetLabel: '≤12 个月' },
    paging: { mode: 'date-bounded', defaultRows: 200 },
    dateField: 'dw_month',
    notes:
      '一行一月，请求日期必须是 YYYY-MM-01；行里的月份字段是 dw_month（"2026-07"），dw_month_d 是当月 1 日。' +
      '与日报同样的恒等式：sale_fee = cash_fee + credit_fee + xt_fee + dbck_fee，profit = (sale_fee - dbck_fee) - cost_fee。' +
      '部分字段名与日报不同（kz_rk_fee → kz_cgrk_fee 等）。' +
      '单次上限 12 个月（超了直接报错），所以它也是"这个账号的数据从哪个月开始"的探针：' +
      '往前分段查，返回行数不足 12 就说明查到头了。实测本账号 2023-09..2024-08 只返回 5 行、' +
      '其中 4 个月有销售，即数据始于 2024-04、销售始于 2024-05。回答"从来/有史以来"这类' +
      '无界问题之前先这样量一下历史长度，再决定是扫全量还是只给下界（见 guardrails.md 的"无界断言"）。',
  },

  'profit-report': {
    title: '利润表',
    method: 'GET',
    path: 'reports/ProfitReport/getProfitReport',
    query: [
      ['startMonth', { p: 'startMonth' }],
      ['endMonth', { p: 'endMonth' }],
      ['storeId', { p: 'storeId', opt: true }],
    ],
    success: 'status200',
    container: 'data',
    dates: { begin: 'startMonth', end: 'endMonth', unit: 'month', maxSpan: 12, budgetLabel: '≤12 个月' },
    paging: { mode: 'none' },
    dateField: 'month',
    excludeRows: {
      field: 'month',
      values: ['合计'],
      why: '后端把区间汇总行也放在 data[] 里（month="合计"），与月度行相加会把整段区间算两遍。',
    },
    notes:
      '主表就是 data[]，一行一个月。后端还会在 data[] 末尾追加一行 month="合计" 的区间汇总行，' +
      '取数时已按 excludeRows 自动剔除（剔除数量会记在 manifest.excluded_rows 里），所以落盘的行可以直接求和。' +
      'coreBiz[] 按 cust_type 拆分（"销售" / "调拨"），已核验：cust_type="销售" 的 sale_fee 等于经营报表的 sale_fee - dbck_fee，' +
      'zy_profit 等于经营报表的 profit。otherIncome[].qtsr_fee 与 otherCost[].qtzc_fee 是其他业务，' +
      'totalProfit = coreProfit + otherProfit。口径比经营报表宽（含调拨与其他收支），两边数字不该相等。' +
      '**注意 totalProfit 不是净利润。** 房租、人工、水电、税费、差旅这些非经营性开支根本不在快准里，' +
      '所以这套接口算不出真正的净利润；totalProfit 比毛利多算的只有其他收入、授信本金、销售收款费、' +
      '调出收款费这几项资金与收款费用。报它时不要用"净利润"这个词。' +
      '反过来，**商品销售场景里用户口语说的"净利润""利润""赚了多少"默认就是毛利**，' +
      '直接用 sales-detail-cost 的 saleProfit 回答，不要先纠正用户用词、也不要展开免责声明，' +
      '在口径行里写一句"毛利 = 折后收入 − 进货成本，未扣门店房租人工等费用"就够了。' +
      '本端点的 otherIncome/otherCost 里的项目（实测有"其他收入""授信本金""销售收款费""调出收款费"）' +
      '不带品类、品牌、商品或客户字段，所以它只能给整体数。用户明确要"把其他收支也算进来"时才用它，' +
      '并用脚本给出桥接（实测 2026-08 截至 08-21：47854.17 + 212.51 = 48066.68，498.50 − 2702.50 = −2204.00，' +
      'totalProfit 45862.68，无法归属到品类的部分 −1991.49，占销售毛利 −4.16%）。' +
      '用户特意问"把其他收支摊进来会不会改变名次"时，才把 otherProfit 按毛利占比等比例摊一次做敏感性检验，' +
      '分摊结果不能当成各品类的利润报出去；没问就别做。' +
      'totalProfit 的具体数值不要记：未结束的当月一天之内就会变（2026-08-22 当天先后测到 42921.03 和 45862.68）。',
  },

  // ── 销售明细与汇总：回答"哪个商品卖得最好 / 逐单核查" ─────────────────────
  'sales-detail': {
    title: '销售明细表',
    method: 'GET',
    path: 'report/salesDetail_detail',
    query: [
      ['action', 'detail'],
      ['beginDate', { p: 'beginDate' }],
      ['endDate', { p: 'endDate' }],
      ['customerNo', { p: 'customerNo', opt: true }],
      ['goodsNo', { p: 'goodsNo', opt: true }],
      ['storageNo', ''], // 实测不生效：加与不加，响应逐字节相同，所以固定留空
      ['brandId', { p: 'brandId', opt: true }],
      ['cateoryTreeValue', ''], // 三方类别老树：候选 id 只能从注册表之外的接口取，没有合法取值来源，固定留空
      ['categoryTreeAllValue', ''],
      ['saleType', { p: 'saleType', opt: true, default: '-1' }],
      ['kzCategoryIds', { p: 'kzCategoryIds', opt: true, default: '[]' }],
      ['action', 'sales_detail'], // 第二个 action 是真实请求的一部分
      ['_search', 'false'],
      ['nd', { nd: true }],
      ['rows', { rows: true }],
      ['page', { page: true }],
      ['sidx', 'date'],
      ['sord', 'desc'],
      ['salesId', { p: 'salesId', opt: true }],
    ],
    success: 'status200',
    container: 'data.rows',
    footer: 'data.userdata',
    footerSum: ['qty', 'amount', 'disAmount', 'recAmount'],
    dates: { begin: 'beginDate', end: 'endDate', unit: 'day', maxSpan: 7 },
    paging: { mode: 'single', defaultRows: 200, maxRows: MAX_ROWS_LOADONCE },
    narrow: ['customerNo', 'goodsNo', 'brandId', 'kzCategoryIds', 'salesId'],
    notes:
      '一行一个销售明细行。销售收入取 recAmount（= amount - disAmount，已实测逐行成立）。' +
      '**明细里混着销退行，所以 recAmount 合计天然是净额**：销退是 transType=150602' +
      '（transTypeName 为"销退"或"销售退款"），以负数行出现在同一个数组里，' +
      '实测每月 92~115 行、每月 1.1~1.7 万元。所以问"本月销售额"直接求和就对了，' +
      '**不要**再去 sales-return-list 减一次，那会把退货扣两遍。' +
      '验证：recAmount 合计 = month-report 的 sale_fee − dbck_fee，实测 2026-03..07 逐月逐分相等。' +
      '要把毛额销售与退货拆开时，用 --where transType=150602 / --exclude transType=150602 各算一次。' +
      '注意大客户侧不是这个规矩（后端把退货分列、合计是毛额），别照搬，见 key-account-return-list。' +
      '商品身份用 --group skuId,number 两个字段：单用 number 会合并商品（number 是型号，' +
      '蓄电池这类国标型号被多个 SKU 共用，实测 6-QW-80min(450)-C 一个型号对应 5 个 skuId）；' +
      '单用 skuId 会丢行（第三方仓商品的 skuId 是 null，实测 2128 行里有 41 行、30 个商品、6824 元）。' +
      '两个字段一起给，分组数 1177→1207，合计与服务端页脚逐分相等。' +
      '字段含义：skuId 商品编码（第三方仓为 null）、number 型号（轮胎的规格花纹就在这里，如 205/55R16 91V EL316）、' +
      'name 商品名称（同分类叶子名，如"乘用车轮胎"，2128 行只有 109 个不同值，不足以标识商品）、' +
      'spec 规格、brandName 品牌、unit 单位、unitPrice 单价（不是 price）、location 发货仓库（不是 stoName）、' +
      'firstCategoryName/secondCategoryName/categoryName 三级分类、transTypeName 业务类型、date 单据日期。' +
      '**按品类或品牌分组时第三方仓的行会掉出来，而且这一处没有兜底字段。** 同一批 location="第三方仓" 的行，' +
      'firstCategoryName / secondCategoryName / brandName 三列全为空（实测 2026-08 有 46 行、' +
      '7864.00 元收入、1883.84 元毛利，占全月毛利 3.84%；location 恰好干净地二分数据，快准仓那 2137 行全部有分类）。' +
      'categoryName 那列有值但不能用——是自由文本，混着分类名（"尾门""玻璃水"）、品牌名（"飞利浦"）' +
      '和规格串（"1141/21W /B15AS 半脚/单丝/青光"），不是快准分类树的节点。' +
      'skuId 为 null 那个坑能用 number 补，这个补不了：要么自己写脚本把空分类的行归进一个有名字的桶' +
      '（如"未分类（第三方仓）"）并核对分桶合计与全量合计逐分相等，要么读 rank 输出的 dropped_rows_warning' +
      '并在回答里单独说明这部分既不能归品类也不能归品牌。悄悄丢掉的后果不只是合计变小：' +
      '这 1883.84 元在 2026-08 能排到第 9 名，比 5 个真实品类都大，用户看到的排名会缺一块而毫无提示。' +
      '**cCategoryName 是客户分类不是商品分类**（整月只有"默认"和"默认分类"两个取值），' +
      '名字里有 Category 但拿它做品类分析会得到两个巨大的桶，而且不报错。' +
      '**利润口径**：行级只有 saleProfit（毛利 = recAmount − cost），而商品销售场景里用户口语说的' +
      '"净利润""利润""赚了多少"默认就是它，直接按它答即可；口径行里说明"未扣门店房租人工等费用"。' +
      '快准算不出真正的净利润（房租人工税费都不在系统内），profit-report 的 totalProfit 也不是，见该端点。' +
      '窄化参数的取值来源（给错类型会 500，不是返回空）：' +
      'goodsNo 要商品数字 id，也就是 sales-summary-by-goods / inv-balance 行里的 invId（实测 10423925 精确命中 1 行；' +
      '给 skuId 或 productCode 这类非数字编码上游直接 HTTP 500）；' +
      'customerNo 要 contact-home 里的 number（实测 55160001 只返回盛远行的行；给 buId 会返回 0 行）；' +
      'salesId 要 employee-list 里的 number；brandId 要 brand-list 里的 id（实测 112 行窄化到 26 行）；' +
      'kzCategoryIds 是 JSON 数组字符串，叶节点 id 来自 category-tree，空值必须是 []（实测 [110041346,110041347] 只留下轮胎行）。' +
      'customerNo / goodsNo / salesId / brandId 都支持逗号分隔的多值（goodsNo=10423925,11053），一次问几个商品不用取几次。' +
      'saleType 是订单类型枚举：-1 全部（默认）、0 销售、1 铺货、2 微仓铺货，只用这四个值。' +
      'storageNo 在本端点不生效，已固定留空；要分仓库看销售请改用 sales-summary-by-goods 的 locationNo 列。' +
      'cateoryTreeValue（三方类别老树）的候选 id 只能从本注册表之外的接口取，没有合法取值来源，也固定留空。',
  },

  'sales-detail-cost': {
    title: '销售明细表（含成本毛利）',
    method: 'GET',
    path: 'report/salesDetail_detail_cost',
    query: null, // 与 sales-detail 完全同形，见下方 inherit
    inheritQuery: 'sales-detail',
    success: 'status200',
    container: 'data.rows',
    footer: 'data.userdata',
    footerSum: ['qty', 'amount', 'disAmount', 'recAmount', 'cost', 'saleProfit'],
    dates: { begin: 'beginDate', end: 'endDate', unit: 'day', maxSpan: 7 },
    paging: { mode: 'single', defaultRows: 200, maxRows: MAX_ROWS_LOADONCE },
    narrow: ['customerNo', 'goodsNo', 'brandId', 'kzCategoryIds', 'salesId'],
    costGated: true,
    notes: '在 sales-detail 每行之上追加 unitCost、cost、saleProfit、salepPofitRate（后端历史拼写）。saleProfit ≈ recAmount - cost，允许分位舍入差。data.profit 与页脚 saleProfit 不相等，口径未知，不要使用。',
  },

  'sales-summary-by-goods': {
    title: '销售汇总表-按商品',
    method: 'GET',
    path: 'report/salesDetail_inv',
    query: [
      ['action', 'inv'],
      ['beginDate', { p: 'beginDate' }],
      ['endDate', { p: 'endDate' }],
      ['customerNo', { p: 'customerNo', opt: true }],
      ['goodsNo', { p: 'goodsNo', opt: true }],
      // storageNo 实测不筛行：给 KZ001 得到同一批 102 行（只是顺序不同），
      // 变化的只是响应里少了另一个仓库的 count_ 列。当成"只看某仓库"会得到错的结论，固定留空。
      ['storageNo', ''],
      ['brandId', { p: 'brandId', opt: true }],
      ['cateoryTreeValue', ''],
      ['categoryTreeAllValue', ''],
      ['_search', 'false'],
      ['nd', { nd: true }],
      ['rows', { rows: true }],
      ['page', { page: true }],
      ['sidx', 'date'],
      ['sord', 'desc'],
    ],
    success: 'status200',
    container: 'data.rows',
    emptyDataArrayOk: true,
    footer: 'data.userdata',
    footerSum: ['qty', 'amount', 'disAmount', 'recAmount'],
    dates: { begin: 'beginDate', end: 'endDate', unit: 'day', maxSpan: 7 },
    paging: { mode: 'single', defaultRows: 200, maxRows: MAX_ROWS_LOADONCE },
    narrow: ['goodsNo', 'brandId', 'customerNo'],
    notes:
      '一行一个商品（实测 539 行对应 539 个不同 invId，同区间销售明细 745 行，两边金额合计相同）。' +
      '本端点没有快准类别筛选。行里比销售明细多了 invId（商品数字 id）与 locationNo / location（发货仓库），' +
      '所以它是"商品名 → invId"的取号来源：拿到 invId 后就能用它去窄化 sales-detail（goodsNo）、' +
      'inv-balance（goods）、deliver-summary（goods）。goodsNo 在本端点同样要 invId（实测 10423925 精确返回 1 行）。' +
      '两个容易误读的列：storage 与 count_<locationId>（中文名在 data.stoNames[] 同位置）是**当前库存数量**，' +
      '不是销量——实测 539 行逐行满足 storage = 各 count_ 之和，且与 inv-balance 的 qty_1/qty_2/qty_3 对得上。' +
      'billId / billNo / date / buName 只是其中一张代表性单据（539 行只有 369 个不同 billNo），' +
      '不要拿它回答"这个商品是哪天卖的 / 卖给谁了"，那要用 sales-detail。' +
      'customerNo 在"按商品"页签提交客户 id（与销售明细相反，那边要 number）。' +
      'storageNo 不筛行，已固定留空——要分仓库统计就按行里的 locationNo 本地分组。' +
      '页脚金额带千分位逗号（"64,952.44"），已在解析层统一处理。' +
      '它还是判断"某个商品到底卖过没有"的正确量具：实测全历史 47679 行的 billType 全是 SALE、' +
      'transTypeName 只有 销售 / 销退 / 销售退款 三种，没有调拨混进来。' +
      '（对比 day-report 的 sale_fee 是含调拨的，不能用来判断单个商品卖过没有。）' +
      '跨端点连接商品时用 invId 而不是 skuId——第三方仓商品的 skuId 是 null，' +
      '而 invId 在 inv-balance、本端点、key-account-sales-detail 三边都有值。',
  },

  'sales-summary-by-customer': {
    title: '销售汇总表-按客户',
    method: 'GET',
    path: 'report/salesDetail_customer',
    query: [
      ['action', 'customer'],
      ['beginDate', { p: 'beginDate' }],
      ['endDate', { p: 'endDate' }],
      ['customerNo', { p: 'customerNo', opt: true }],
      ['goodsNo', { p: 'goodsNo', opt: true }],
      ['storageNo', ''],
      ['brandId', { p: 'brandId', opt: true }],
      ['cateoryTreeValue', ''],
      ['categoryTreeAllValue', ''],
      ['_search', 'false'],
      ['nd', { nd: true }],
      ['rows', { rows: true }],
      ['page', { page: true }],
      ['sidx', 'date'],
      ['sord', 'desc'],
    ],
    success: 'status200',
    container: 'data.list', // 注意：容器与"按商品"不同
    footer: 'data.total',
    footerSum: ['qty', 'amount', 'disAmount', 'recAmount'],
    dates: { begin: 'beginDate', end: 'endDate', unit: 'day', maxSpan: 7 },
    paging: { mode: 'single', defaultRows: 200, maxRows: MAX_ROWS_LOADONCE },
    notes:
      '容器是 data.list[]，页脚是 data.total 对象。customerNo 在本页签提交客户 number。' +
      '页脚里 baseQty 被后端塞成了 "SALE" 字符串（脏字段），不要把它当数量；数量看 qty。' +
      '行里的客户名字段是 buName。',
  },

  'sales-order-list': {
    title: '销售单管理列表',
    method: 'GET',
    path: 'scm/invSa',
    query: [
      ['action', 'getSalesOrderlist'],
      ['matchCon', { p: 'matchCon', opt: true }],
      ['hxState', ''],
      ['beginDate', { p: 'beginDate' }],
      ['endDate', { p: 'endDate' }],
      ['salesId', { p: 'salesId', opt: true }],
      ['rows', { rows: true }],
      ['page', { page: true }],
      ['sord', ''],
      ['sidx', ''],
      ['buId', { p: 'buId', opt: true }],
      ['storeId', { p: 'storeId', opt: true }],
      ['billNo_type', { p: 'billNo_type', opt: true }],
      ['delieverId', { p: 'delieverId', opt: true }],
      ['wayId', { p: 'wayId', opt: true }],
      ['payType', { p: 'payType', opt: true }],
      ['billStatus', { p: 'billStatus', opt: true, default: 'all' }],
      ['billNo_source', { p: 'billNo_source', opt: true }],
      ['userId', { p: 'userId', opt: true }],
      ['activity_id', { p: 'activity_id', opt: true }],
      ['vin', { p: 'vin', opt: true }],
    ],
    success: 'status200',
    container: 'data.rows',
    dates: { begin: 'beginDate', end: 'endDate', unit: 'day', maxSpan: 31 },
    paging: { mode: 'pages', totalPages: 'data.total', records: 'data.records', defaultRows: 200 },
    notes: '一行一张销售单。data.total 是总页数不是总记录数。salesId/delieverId 提交员工 id（与销售明细不同）。',
  },

  'sales-return-list': {
    title: '销售退货单管理列表',
    method: 'GET',
    path: 'scm/invSa',
    query: [
      ['action', 'list'],
      ['matchCon', { p: 'matchCon', opt: true }],
      ['transType', '150602'], // 固定为销售退货
      ['beginDate', { p: 'beginDate' }],
      ['endDate', { p: 'endDate' }],
      ['_search', 'false'],
      ['nd', { nd: true }],
      ['rows', { rows: true }],
      ['page', { page: true }],
      ['sidx', ''],
      ['sord', 'asc'],
      ['salesId', { p: 'salesId', opt: true, default: '0' }],
      ['hxState', { p: 'hxState', opt: true, default: '0' }],
      ['billNo_type', { p: 'billNo_type', opt: true, default: '-1' }],
      ['returnType', { p: 'returnType', opt: true }],
    ],
    success: 'successStatus',
    container: 'data.rows',
    dates: { begin: 'beginDate', end: 'endDate', unit: 'day', maxSpan: 31 },
    paging: { mode: 'pages', totalPages: 'data.total', records: 'data.records', defaultRows: 200 },
    notes:
      '一行一张普通客户销售退货单。amount 是应收/退款口径金额，totalAmount 是关联销售金额。' +
      'hxStateCode：0 未退款、1 部分退款、2 全部退款（与筛选控件的 hxState 取值不同）。' +
      '**用它回答"退了多少货/多少单"，不要用它去从销售额里扣退货**——sales-detail 的明细里' +
      '已经含了同样这批销退（transType=150602 的负数行），recAmount 合计本身就是净额，再减一次是扣两遍。',
  },

  'sales-reconcile-detail': {
    title: '销售对账明细表',
    method: 'GET',
    path: 'Report/getSaleBalance',
    query: [
      ['action', 'detail'],
      ['matchCon', { p: 'matchCon', opt: true }],
      ['type', { p: 'type', opt: true, default: '0' }],
      ['payStatus', { p: 'payStatus', opt: true, default: '-1' }],
      ['buId', { p: 'buId', opt: true, default: '0' }],
      ['saleType', { p: 'saleType', opt: true, default: '-1' }],
      ['beginDate', { p: 'beginDate' }],
      ['endDate', { p: 'endDate' }],
    ],
    success: 'status200',
    container: 'data.rows',
    footer: 'data.total',
    // 页脚字段名与行不同，所以这里必须显式给出 row→footer 的对应关系
    footerSum: [
      { row: 'amount', footer: 'totalAmount' },
      { row: 'reAmount', footer: 'totalReAmount' },
      { row: 'resAmount', footer: 'totalResAmount' },
      { row: 'diffAmount', footer: 'totalDiffAmount' },
    ],
    dates: { begin: 'beginDate', end: 'endDate', unit: 'day', maxSpan: 31 },
    paging: { mode: 'none' },
    notes:
      '逐单应收/已收/欠款。动态收款列字段名在 data.colIndex[]，中文标题在同位置的 data.colNames[]。' +
      'payStatus：-1 全部、1 全部收款、2 欠款。' +
      '注意页脚字段名与行不同：行里是 amount/reAmount/resAmount，页脚是 totalAmount/totalReAmount/totalResAmount，' +
      '所以行 amount 只能与页脚 totalAmount 对照，不能按同名字段直接比。',
  },

  // ── 大客户销售：与普通客户完全独立的另一套单据体系 ─────────────────────────
  //
  // 这是最容易漏掉的一块。快准把大客户业务放在 scm/invCu 模块（transType 180601/180602），
  // 与门店零售/普通客户走的 report/salesDetail_* 报表**没有任何交集**：
  // 销售明细表的 saleType 只区分 销售/铺货/微仓铺货，压根不含大客户维度，
  // 所以"用销售明细表按客户名单拆出大客户"是错的——那批单据根本不在这张表里。
  // 站管家后台本身就是两个独立菜单、两个独立接口，回答"普通 vs 大客户"必须分别取数再相加。
  'key-account-sales-list': {
    title: '大客户销售出库单查询',
    method: 'GET',
    path: 'scm/invCu',
    query: [
      ['action', 'list'],
      ['matchCon', { p: 'matchCon', opt: true }],
      ['transType', '180601'], // 固定为大客户销售出库
      ['beginDate', { p: 'beginDate' }],
      ['endDate', { p: 'endDate' }],
      ['relationOrderNo', { p: 'relationOrderNo', opt: true }],
      ['_search', 'false'],
      ['nd', { nd: true }],
      ['rows', { rows: true }],
      ['page', { page: true }],
      ['sidx', ''],
      ['sord', 'asc'],
      ['salesId', { p: 'salesId', opt: true, default: '0' }],
      ['hxState', { p: 'hxState', opt: true, default: '0' }],
      ['serviceType', { p: 'serviceType', opt: true, default: '0' }],
      ['sourceType', { p: 'sourceType', opt: true, default: '0' }],
      ['delieverId', { p: 'delieverId', opt: true, default: '0' }],
      ['customType', { p: 'customType', opt: true, default: '0' }],
      ['billStatus', { p: 'billStatus', opt: true }],
    ],
    success: 'successStatus',
    emptySentinel: KEY_ACCOUNT_EMPTY_SENTINEL,
    container: 'data.rows',
    dates: { begin: 'beginDate', end: 'endDate', unit: 'day', maxSpan: 31 },
    paging: { mode: 'pages', totalPages: 'data.total', records: 'data.records', defaultRows: 200 },
    notes:
      '一行一张大客户出库单（不是一行一个商品，要按商品看就用 key-account-sales-detail）。' +
      '**字段名有一处会让人反着用：totalCost 是毛利金额，不是成本。** 成本在 totalPurPrice。' +
      '文档已用非空响应校验过两条恒等式：amount ≈ totalAmount − disAmount，totalCost ≈ amount − totalPurPrice。' +
      '所以内部自洽的三元组是 (amount, totalPurPrice, totalCost)：amount 是折后应收，' +
      '与普通客户销售明细的 recAmount 同口径（都是扣掉优惠之后的收入），做"普通 vs 大客户"对比要用它；' +
      'totalAmount 是折前销售金额，页面表格展示的是这一列，两者在有优惠时不相等。' +
      '客户名字段是 contactName（buName 在当前样本里是 null，不要用）；日期字段是 billDate，' +
      '要逐日/逐月拆分就把它交给 kz-compute.mjs daily --date-field billDate。' +
      'billStatus 请求侧：空=全部、0 草稿、1 待审核、3 完成——留空会把草稿和待审核单一起算进合计，' +
      '问"实际销售额"时要么只取 3，要么按 --group billStatus 报出分布，不要闷着不说。' +
      'customType 是大客户分类 id，取值来源 key-account-category（不是客户 id）。' +
      '本端点没有服务端页脚，完整性靠可靠分页（data.records 总记录数、data.total 总页数）闭合。' +
      '独立旁证：month-report / day-report 的非展示字段 big_sale_fee / big_sale_cost 就是后端自己算的' +
      '大客户销售收入与成本。实测 2026-03..08 六个月，本端点的 amount 合计与 big_sale_fee **逐月逐分相等**，' +
      '这是"选对了端点、也选对了收入字段"最硬的旁证；但 totalPurPrice 合计与 |big_sale_cost| ' +
      '有 0.50~202.80 元的月度差（成本口径不同，不是丢数据），所以成本别拿 big_sale_cost 当校验基准，' +
      '这两个字段也不要直接当正式财务口径报给用户。' +
      '**注意这条旁证成立的前提是"只算出库单、不扣退货"**：big_sale_fee 就是出库口径，' +
      '退货单列在 big_return_fee。所以回答"大客户收入"时报本端点的合计即可；' +
      '如果拿"出库 + 退货"的净额去比 big_sale_fee，有退货的月份就会对不上（实测 2026-06 差 41 元），' +
      '而这时容易误判成"取数漏了单据"，实际是自己换了口径。要报净额就必须写明"已扣退货"。' +
      '响应里 totalPurPrice / totalCost 是成本与毛利，用户只问销售额时不要主动报出来。',
  },

  'key-account-return-list': {
    title: '大客户销售退货单查询',
    method: 'GET',
    path: 'scm/invCu',
    query: [
      ['action', 'list'],
      ['matchCon', { p: 'matchCon', opt: true }],
      ['transType', '180602'], // 固定为大客户销售退货
      ['beginDate', { p: 'beginDate' }],
      ['endDate', { p: 'endDate' }],
      ['relationOrderNo', { p: 'relationOrderNo', opt: true }],
      ['_search', 'false'],
      ['nd', { nd: true }],
      ['rows', { rows: true }],
      ['page', { page: true }],
      ['sidx', ''],
      ['sord', 'asc'],
      ['salesId', { p: 'salesId', opt: true, default: '0' }],
      ['hxState', { p: 'hxState', opt: true, default: '0' }],
      // 退货页这几个键的默认值是空而不是 0，保持与抓包一致
      ['serviceType', { p: 'serviceType', opt: true }],
      ['sourceType', { p: 'sourceType', opt: true, default: '0' }],
      ['delieverId', { p: 'delieverId', opt: true }],
      ['customType', { p: 'customType', opt: true }],
      ['billStatus', { p: 'billStatus', opt: true }],
    ],
    success: 'successStatus',
    emptySentinel: KEY_ACCOUNT_EMPTY_SENTINEL,
    container: 'data.rows',
    dates: { begin: 'beginDate', end: 'endDate', unit: 'day', maxSpan: 31 },
    paging: { mode: 'pages', totalPages: 'data.total', records: 'data.records', defaultRows: 200 },
    notes:
      '一行一张大客户退货单，字段契约与 key-account-sales-list 相同（totalCost 同样是毛利不是成本）。' +
      '**用户问"大客户收入/成本/毛利"时，报的是出库单口径（key-account-sales-list），不要把退货扣进去。**' +
      '后端自己就是分列的：月报里 big_sale_fee 只等于出库单合计、退货单列在 big_return_fee，' +
      '后台界面也按这个口径显示。扣了退货得到的数会和用户在后台看到的对不上，而两个数都"算得对"，' +
      '所以这种错查不出来、只能靠口径选对。要净额时必须写明"已扣退货"。' +
      '**别照普通侧的做法处理退货：两侧默认口径不对称。** 普通客户销售明细表把销退' +
      '（transType=150602，transTypeName="销退"/"销售退款"）当负数行混在同一个数组里，' +
      '所以 recAmount 合计天然是净额（实测每月 92~115 行、每月 1.1~1.7 万元）；' +
      '大客户侧却是两个独立端点、后端分列。同一个"要不要扣退货"的问题，两侧答案相反。' +
      '**退货单的 amount / totalPurPrice / totalCost 本身就是负数**（实测 2026-06 两张退货单 amount 为 -26 和 -15，' +
      '月报的 big_return_fee 也是负号口径），所以真要算净额时是 **出库 + 退货**，不是相减——' +
      '写成"出库 − 退货"会把退货按正向加回去，方向正好反了，而且金额小的时候差异不显眼、很难发现。' +
      '证据等级 B：仓库抓包时该账号这段区间没有退货单，行的类型/可空性还没有非空响应复核，' +
      '所以拿到非空数据时要先 --preview 3 确认字段形态和正负号，再决定怎么算。' +
      '退货为空是常态，会命中精确空结果哨兵（status="-1" + msg="没有数据"），' +
      'manifest 里 empty_result_sentinel 为 true 时含义是"这段时间没有大客户退货"，不是查询失败。',
  },

  'key-account-sales-detail': {
    title: '大客户销售配送明细',
    method: 'GET',
    path: 'report/getInitCuSale_detail',
    query: [
      ['transType', '180601'],
      ['customerId', { p: 'customerId', opt: true }],
      ['beginDate', { p: 'beginDate' }],
      ['endDate', { p: 'endDate' }],
      ['billNo', ''], // 列表脚本保留的历史参数，综合搜索实际写进 require
      ['productCode', ''],
      ['status', { p: 'status', opt: true }],
      ['searchType', { p: 'searchType', opt: true, default: '1' }],
      ['skuId', ''],
      ['brandId', { p: 'brandId', opt: true }],
      ['categoryTreeAllValue', ''], // 非空取值的线格式未闭环，固定留空
      ['transType', '180601'], // 重复键是真实请求的一部分，前端不是用一个参数覆盖
      ['_search', 'false'],
      ['nd', { nd: true }],
      ['rows', { rows: true }],
      ['page', { page: true }],
      ['sidx', 'billDate'],
      ['sord', 'desc'],
      ['require', { p: 'require', opt: true }],
    ],
    success: 'status200',
    container: 'data.list',
    dates: { begin: 'beginDate', end: 'endDate', unit: 'day', maxSpan: 7 },
    paging: { mode: 'single', defaultRows: 200, maxRows: MAX_ROWS_LOADONCE },
    notes:
      '大客户业务的行级明细：一行一个商品行，这是"大客户都买了什么、哪款卖得最多"的唯一数据源。' +
      '金额三元组与单据列表同构：amount 行销售金额、totalPurPrice 行成本、totalCost 行毛利' +
      '（同样是名字像成本、实际是毛利）。商品身份用 skuId + invNumber，商品名 goodsName、' +
      '品牌 brandName、分类 categoryName、规格 invSpec、数量 qty、单价 price。' +
      '**qty 是出库方向的负数**（实测 2026-08 六行的 qty 合计为 −6，而 amount 合计是正的 +166.00），' +
      '所以问"卖了多少件"要取绝对值，直接求和会得到负的"销量"。金额三列不受影响，出库单是正数。' +
      '**分类只有叶子级 categoryName，没有 firstCategoryName/secondCategoryName**，' +
      '所以要和普通侧的一级品类口径对齐时，映射关系请拿同一区间的 sales-detail 反查' +
      '（--where categoryName=<叶子名> --fields firstCategoryName，实测"空气滤清器""空调滤清器"→过滤系统、' +
      '"汽机油"→汽车油品，各自唯一命中），不要凭商品知识猜；反查不到就如实标注无法映射。' +
      '成功的空查询可能返回 data.list = null，已归一为空数组；其它非数组形态一律 fail closed。' +
      '本端点没有服务端页脚也没有可靠分页元数据，完整性只能靠"取回行数 < 请求行数"判断，' +
      '所以单次上限 7 天、跨月要 --split。页面用的 rows=1000000 不是 Agent 默认值，也不允许复制。' +
      'require 配合 searchType 使用：1 大客户销售单号、2 物料名称、3 物料编码、4 产品码。' +
      'customerId 是客户 id（contact-home 的 data.bigContact[].id）。',
  },

  'key-account-return-detail': {
    title: '大客户销售退货明细',
    method: 'GET',
    path: 'report/getInitCuSale_detail',
    query: null,
    inheritQuery: 'key-account-sales-detail',
    // 两处 transType 都要改成 180602，见下方 transTypeOverride
    transTypeOverride: '180602',
    success: 'status200',
    container: 'data.list',
    dates: { begin: 'beginDate', end: 'endDate', unit: 'day', maxSpan: 7 },
    paging: { mode: 'single', defaultRows: 200, maxRows: MAX_ROWS_LOADONCE },
    notes:
      '与 key-account-sales-detail 完全同一个端点、同一份契约，只是两处 transType 都换成 180602。' +
      '证据等级 B：仓库抓包时为空，字段类型/可空性待非空响应复核。空结果同样是 data.list = null。',
  },

  // ── 库存 ────────────────────────────────────────────────────────────────
  'inv-balance': {
    title: '库存余额（库存查询）',
    method: 'GET',
    path: 'report/invBalance',
    query: [
      ['action', 'detail'],
      // goodsNo / storage 实测完全不生效（加与不加，响应逐字节相同），所以固定留空：
      // 开放一个"看起来能筛、实际返回全表"的参数，比不给这个参数危险得多。
      ['goods', { p: 'goods', opt: true }],
      ['goodsNo', ''],
      ['storage', ''],
      ['storageNo', { p: 'storageNo', opt: true }],
      ['catId', ''],
      ['catName', ''],
      ['brandId', { p: 'brandId', opt: true }],
      ['area', 'false'],
      ['zero', { p: 'zero', opt: true, default: 'false' }],
      ['negative', { p: 'negative', opt: true, default: 'false' }],
      ['carModel', 'false'],
      ['area_name', ''],
    ],
    success: 'status200',
    container: 'data.rows',
    footer: 'data.userdata',
    footerSum: ['qty_1', 'qty_2', 'qty_3', 'allcost_1', 'allcost_2', 'allcost_3'],
    paging: { mode: 'none' },
    narrow: ['goods', 'brandId', 'storageNo'],
    // 用某个字段做分片时，该字段为空的行不属于任何分片，会整批取不到——而每个分片自身
    // 都完整、页脚也对得上，所以没有任何一处会报错。声明在这里，kz-fetch 就能在用到这个
    // 窄化参数时主动提醒，并直接给出补齐缺口的命令。
    shardGaps: [
      {
        param: 'brandId',
        blankField: 'brandName',
        complement: '--param storageNo=S001',
        measured: '实测 169 行 / 56186.88 元，占全量 5.46%',
        why: '第三方仓商品的 brandName 与 skuId 都是空的，不属于任何 brandId。',
      },
    ],
    notes:
      '一行一个商品。商品字段名与销售明细不同：这里是 invNo（型号）/ invName（商品名称）/ invId（商品数字 id），' +
      '不是 number / name。qty_1 所有仓库、qty_2 快准仓、qty_3 三方仓的库存数量；' +
      'cost_1/cost_2/cost_3 是单位成本、allcost_1/allcost_2/allcost_3 是库存金额，所以"库存压了多少钱"用 allcost_1。' +
      '可用的窄化有四个：goods（商品数字 id，实测 goods=10423925 精确返回该商品 1 行——' +
      '这个 id 就是本端点和 sales-summary-by-goods 行里的 invId，注意不是 skuId）、' +
      'brandId（品牌 id，来自 brand-list）、storageNo（仓库编码，来自 warehouse-list）、zero（true 时含零库存商品）。' +
      'goodsNo 与 storage 实测完全不生效，已固定留空。' +
      '**storageNo 确实筛行**（早期note说它只改列不改行，那是错的，已按实测更正）：' +
      '实测全量 8134 行 / 页脚 allcost_1 = 1028161.90，storageNo=KZ001 得 7965 行 / 971975.02，' +
      'storageNo=S001 得 169 行 / 56186.88——行数与金额都逐分构成精确划分。' +
      '带 storageNo 时响应少一组仓库列（22 列→19 列），allcost_1/qty_1 也随之变成"该仓库口径"而非全仓合计。' +
      '**按 brandId 循环取全量会静默漏掉第三方仓**：第三方仓商品的 brandName 与 skuId 都是空的，' +
      '不属于任何 brandId，实测 169 行 / 56186.88 元（占全量 5.46%）整批取不到，而每个分片自身都完整、毫无报错。' +
      '要全量就用"brandId 循环 + 一次 storageNo=S001"（后者只 65 KB），或直接按 warehouse-list 逐仓取、' +
      '大仓内部再按 brandId 切（不加窄化的全量 3.75 MiB、单个 KZ001 仓 3.31 MiB，都会被 2 MiB 预算拦下）。' +
      'brandId 接受逗号分隔的多个 id，而且是真并集：实测 brandId=10 得 5 行 / 406.50，brandId=55 得 5 行 / 265.00，' +
      'brandId=10,55 与 55,10 都得 10 行 / 671.50（行数与金额都正好相加，与顺序无关）。' +
      '所以 466 个品牌不必发 466 次请求——每批 25 个 id 拼一次，19 次请求就能覆盖全部品牌。' +
      '批太大只会撞上 2 MiB 预算直接报错（不会静默截断），所以调小批量重试是安全的。' +
      '每种组合的响应都带 data.userdata 页脚，所以每次请求都能用 footer_reconciliation 自证该分片没丢行；' +
      '但页脚是按筛选后的口径算的，它证明不了"分片集合覆盖了全表"，那要靠上面的仓库划分。' +
      '想给全量总额找个独立旁证，用 day-report 最新一天的 store_fee（实测 1029704.23 vs 页脚 1028161.90，差 0.15%）——' +
      '它是日终快照、口径也更宽，只能核对量级，抓不到几十块的差，但足以抓出漏掉一个仓库这种 5% 级别的缺口。' +
      'negative=true 是"只看负库存"而不是"把负库存也算进来"，实测返回 0 行（该账号没有负库存），' +
      '所以默认 negative=false 并没有排除任何东西——别在回答里说"口径不含负库存"，那是把参数名当结论了。' +
      'in_time / out_time 是"最近一次入库/出库时间"，它们是本技能里少见的**无界**证据：' +
      '销售必然伴随出库，所以"最近销售时间 ≤ out_time"，于是 out_time 为空 ⟹ 从未出库 ⟹ 必然从未卖出。' +
      '这条推理不需要任何日期窗口，是回答"从来没卖过什么"的最快入口。但只成立一个方向——' +
      'out_time 非空不等于卖过（调拨等非销售出库也会写它），所以它给出的是下界：' +
      '实测 out_time 为空 2286 款 / 220090.45 元，全历史零销售的真值是 2524 款 / 251898.59 元，' +
      '漏掉 238 款 / 31808.14 元（占真值金额 12.63%）。要真值就得扫全历史销售，见 recipes.md。',
  },

  'deliver-summary': {
    title: '商品收发汇总表',
    method: 'GET',
    path: 'report/deliverSummary',
    query: [
      ['action', 'detail'],
      ['beginDate', { p: 'beginDate' }],
      ['endDate', { p: 'endDate' }],
      ['goods', { p: 'goods', opt: true }],
      ['goodsNo', ''],
      ['storage', ''],
      ['storageNo', ''],
      ['brandId', { p: 'brandId', opt: true }],
      ['cateoryTreeValue', ''],
      ['categoryTreeAllValue', ''],
    ],
    success: 'status200',
    container: 'data.rows',
    dates: { begin: 'beginDate', end: 'endDate', unit: 'day', maxSpan: 7 },
    paging: { mode: 'none' },
    narrow: ['goods', 'brandId'],
    notes:
      '一行一个商品，字段名与 inv-balance 一致（invNo 型号 / invName 商品名称），但**行里没有 invId**，' +
      '商品身份用 skuId + invNo（invName 是分类叶子名，实测 1172 行只有 33 个不同值，单独分组会把不同商品并成一个）。' +
      '数量列是 qty_0…qty_N，每列配一个 cost_N（该项金额）。' +
      '**这些下标不是稳定契约**：它取决于该账号启用了哪些业务类型。仓库文档抓包时 入库合计=qty_8 / 出库合计=qty_15 / 结存=qty_16，' +
      '生产账号实测是 入库合计=qty_7 / 出库合计=qty_13 / 结存=qty_14——照文档取 qty_16 会把"还有 3 条库存"报成"结存 0"。' +
      '所以不要自己挑列，取完数用 kz-compute.mjs flow，它按"期初+入库合计−出库合计=结存"逐行求解列含义，' +
      '解不出或不唯一时留空并说明。本端点没有服务端页脚（server_footers 为空），那条恒等式顶替 footer 做完整性证据。' +
      '不加窄化的全量响应接近 10 MB，所以必须窄化，两个可用开关：' +
      'goods（商品数字 id = invId，来自 sales-summary-by-goods 或 inv-balance；实测 goods=10423925 只返回该商品 1 行、2.5 KB）' +
      '与 brandId（来自 brand-list）。' +
      '"某个商品这周进出多少"就用 goods，它比先取全表再本地筛便宜两个数量级。' +
      'goodsNo / storage / storageNo 实测完全不生效，已固定留空。',
  },

  // ── 资金与应收应付 ──────────────────────────────────────────────────────
  'receipt-list': {
    title: '收款单管理列表',
    method: 'POST',
    path: 'scm/receipt/get_receipt_list_new',
    form: [
      ['buId', { p: 'buId', opt: true }],
      ['endDate', { p: 'endDate' }],
      ['beginDate', { p: 'beginDate' }],
      ['wayId', { p: 'wayId', opt: true }],
      ['transType', { p: 'transType', opt: true }],
      ['billStatus', { p: 'billStatus', opt: true, default: 'SUBMIT' }],
      ['matchCon', { p: 'matchCon', opt: true }],
      ['page', { page: true }],
      ['rows', { rows: true }],
      ['checkTimeBegin', ''],
      ['checkTimeEnd', ''],
    ],
    trailingAmp: true,
    success: 'successStatus',
    container: 'data.list',
    dates: { begin: 'beginDate', end: 'endDate', unit: 'day', maxSpan: 31 },
    paging: { mode: 'pages', totalPages: 'data.total', records: 'data.records', defaultRows: 200 },
    notes: 'billStatus 请求侧取 ALL/SUBMIT/CONFIRM/CANCEL；响应侧 billStatus 是后端代码，两套值不可混用。amount 是收款金额（数值字符串）。',
  },

  'customer-balance': {
    title: '客户应收余额表',
    method: 'GET',
    path: 'Report/getCustomerBalance',
    query: [
      ['action', 'detail'],
      ['type', { p: 'type', opt: true, default: '0' }],
      ['payStatus', { p: 'payStatus', opt: true, default: '-1' }],
      ['buId', { p: 'buId', opt: true, default: '-1' }],
      ['beginDate', { p: 'beginDate' }],
      ['endDate', { p: 'endDate' }],
    ],
    success: 'status200',
    container: 'data.rows',
    footer: 'data.total',
    footerSum: ['fPreAmount', 'salesAmount', 'reAmount', 'diffAmount', 'lPreAmount'],
    dates: { begin: 'beginDate', end: 'endDate', unit: 'day', maxSpan: 31 },
    paging: { mode: 'none' },
    notes:
      '一行一个客户，客户名字段是 buName。fPreAmount 期初应收、salesAmount 本期销售、reAmount 本期收款、' +
      'lPreAmount 期末应收余额（欠款）。payStatus=2 只看欠款客户。' +
      '动态列 amount_<payMethodId> 是按收款方式拆分的已收金额，方式名对应 pay-method-list。' +
      '注意 lPreAmount 是余额（期末快照）而不是期间发生额，跨区间相加没有意义；' +
      '要"当前总欠款"就直接读它的合计，不要把多个区间的 lPreAmount 累加。',
  },

  'bank-journal': {
    title: '现金银行报表',
    method: 'GET',
    path: 'report/bankBalance_detail',
    query: [
      ['action', 'detail'],
      ['beginDate', { p: 'beginDate' }],
      ['endDate', { p: 'endDate' }],
      ['accountNo', { p: 'accountNo', opt: true }],
      ['action', 'cash_bank_journal_new'], // 第二个 action 必须保留
      ['_search', 'false'],
      ['nd', { nd: true }],
      ['rows', { rows: true }],
      ['page', { page: true }],
      ['sidx', 'date'],
      ['sord', 'desc'],
    ],
    success: 'status200',
    container: 'data.list',
    footer: 'data.total',
    // balance 是"该笔之后的余额"，属于快照不是发生额，绝不能求和，所以不进对账表
    footerSum: ['income', 'expenditure'],
    excludeRows: {
      field: 'billType',
      values: ['期初余额'],
      why: '首行是期初余额伪行：date 为空、income/expenditure 都是 0，只带期初 balance，会把"发生笔数"算多一笔。',
    },
    dates: { begin: 'beginDate', end: 'endDate', unit: 'day', maxSpan: 7 },
    paging: { mode: 'single', defaultRows: 200, maxRows: MAX_ROWS_LOADONCE, neverPage: true },
    narrow: ['accountNo'],
    notes:
      'accountNo 在本端点是结算账户 number，来源 settle-account-list。已证明 rows=1 仍返回多行，绝不能请求 page=2。' +
      'income 收入、expenditure 支出、balance 该笔后余额（快照，禁止求和）。' +
      '第一行常是 billType="期初余额" 的伪行：date 为空、income/expenditure 都是 0，只带期初 balance，' +
      '统计笔数时要把它排除。',
  },

  'payable-detail': {
    title: '应付账款明细表',
    method: 'GET',
    path: 'report/fundBalance_detailSupplier',
    query: [
      ['action', 'detailSupplier'],
      ['type', '10'],
      ['beginDate', { p: 'beginDate' }],
      ['endDate', { p: 'endDate' }],
      ['accountNo', { p: 'accountNo', opt: true }],
      ['action', 'detailSupplier'], // 重复键，真实请求就是两个
      ['_search', 'false'],
      ['nd', { nd: true }],
      ['rows', { rows: true }],
      ['page', { page: true }],
      ['sidx', 'date'],
      ['sord', 'desc'],
    ],
    success: 'successStatus',
    container: 'data.list',
    footer: 'data.total',
    footerSum: ['income', 'expenditure'],
    // 实测：7 天共 582 行，其中 230 行 billNo="小计"、230 行 billNo="期初余额"，
    // 真正的明细只有 122 行。不剔除小计行，income 合计会正好变成两倍（69139.02 vs 34569.51）。
    excludeRows: {
      field: 'billNo',
      values: ['小计', '期初余额'],
      why: '后端按供应商分段，每段末尾插一行"小计"、段首插一行"期初余额"；这些是展示用的伪行，与明细行相加会重复计算。',
    },
    dates: { begin: 'beginDate', end: 'endDate', unit: 'day', maxSpan: 7 },
    paging: { mode: 'single', defaultRows: 200, maxRows: MAX_ROWS_LOADONCE, neverPage: true },
    narrow: ['accountNo'],
    notes:
      'accountNo 在本端点是供应商 id（不是结算账户编号，也不是供应商 number），来源 contact-home 的 data.supplier[].id。' +
      '金额为数值字符串且带千分位逗号。income 是付款、expenditure 是采购发生额、balance 是该供应商的应付余额（快照，禁止求和）。' +
      '行里的供应商名字段是 buName，但它只在"期初余额"伪行上有值，明细行是空的——' +
      '要按供应商拆分必须用 accountNo 逐个供应商查，不能靠 buName 分组。',
  },

  // ── 主数据 / 选项来源（把中文名称换成 ID 和编码） ────────────────────────
  'category-tree': {
    title: '快准商品分类树',
    method: 'GET',
    path: 'basedata/Category/tree',
    success: 'successStatus',
    container: 'data.tree',
    paging: { mode: 'none' },
    notes:
      '递归节点 { id, parentId, name, code, child[] }，顶层 15 个一级分类，深度 3 层（一级/二级/叶子）。' +
      '销售明细的 kzCategoryIds 提交叶节点 id 的 JSON 数组字符串，不提交 code。' +
      '注意同名陷阱：叶子"轮胎清洗剂"挂在 化工养护/清洗剂 下，按关键词"轮胎"收集叶子会把它一起收进来；' +
      '车轮系统/轮胎 的两个叶子是 乘用车轮胎 110041346 与 商用车轮胎 110041347（实测有效）。',
  },

  'brand-list': {
    title: '品牌列表',
    method: 'GET',
    path: 'basedata/assist/brand',
    query: [
      ['isDelete', '0'],
      ['_search', 'false'],
      ['nd', { nd: true }],
      ['rows', { rows: true }],
      ['page', { page: true }],
      ['sidx', 'id'],
      ['sord', 'desc'],
    ],
    success: 'successStatus',
    container: 'data.items',
    paging: { mode: 'records', records: 'data.totalsize', defaultRows: 100 },
    notes: '通用 brandId 取 id，不要用 code。输出最小化为 { id, name }。',
  },

  'contact-home': {
    title: '客户/大客户/供应商主数据集合',
    method: 'GET',
    path: 'basedata/contact/getHomePageContact',
    success: 'successStatus',
    container: '@raw',
    paging: { mode: 'none' },
    notes:
      'data.contact[] 普通客户、data.bigContact[] 大客户、data.supplier[] 供应商，条目均为 { id, number, name }。' +
      'buId/supplierId 取 id；销售明细的 customerNo 取 number；大客户明细的 customerId 取 bigContact[].id。' +
      '**bigContact[] 是"客户档案里被标记为大客户的名单"，不是"大客户业务的数据源"。** ' +
      '想知道大客户卖了多少必须查 key-account-sales-list——用这份名单去过滤普通客户销售明细会得到' +
      '一个看起来合理、实际无意义的结果，因为大客户单据根本不在那张报表里。' +
      '两份名单还可能出现相似人名的独立档案（例如"苏州梅石路店[车享家]"与"梅石路车享家"分别在两边），' +
      '按名字匹配两侧客户是不可靠的。',
  },

  'key-account-category': {
    title: '大客户分类',
    method: 'POST',
    path: 'scm/invCu/getCarType',
    // 抓包是零字节 body 且**不带** Content-Type 头，所以这里既不给 form 也不给 body
    success: 'successStatus',
    container: 'data',
    paging: { mode: 'none' },
    notes:
      'data[] 条目 { id, name }。大客户单据列表的 customType 取 id（单选）；' +
      '平台订单的 merchant_code 用逗号连接多个 id。这是大客户分类，与快准商品分类树无关。',
  },

  'warehouse-list': {
    title: '仓库列表',
    method: 'GET',
    path: 'basedata/invlocation',
    query: [
      ['action', 'list'],
      ['disable', ''],
      ['skey', { p: 'skey', opt: true }],
      ['isDelete', '2'],
      ['move_type', ''],
      ['_search', 'false'],
      ['nd', { nd: true }],
      ['rows', { rows: true }],
      ['page', { page: true }],
      ['sidx', ''],
      ['sord', ''],
    ],
    success: 'successStatus',
    container: 'data.rows',
    paging: { mode: 'pages', totalPages: 'data.total', records: 'data.records', defaultRows: 100 },
    notes: 'id 给 locationId/storage，locationNo 给 storageNo，name 只用于显示。',
  },

  'store-list': {
    title: '门店列表',
    method: 'POST',
    path: 'basedata/Stores/getStoreIdName',
    body: 'empty-form', // 零字节 body + Content-Type: application/x-www-form-urlencoded
    success: 'status200',
    container: 'data',
    paging: { mode: 'none' },
    notes: 'data[] 条目 { id, name, isDefault }。利润表/销售单的 storeId 取 id。',
  },

  'employee-list': {
    title: '员工列表',
    method: 'POST',
    path: 'basedata/employee',
    query: [['action', 'list']],
    body: 'empty-form',
    success: 'successStatus',
    container: 'data.items',
    paging: { mode: 'none' },
    notes: '条目含 id、empId、number、name，三者不可互换。销售单/出库单的 salesId 取 id；销售明细等老报表的 salesId 取 number。',
  },

  'settle-account-list': {
    title: '结算账户列表',
    method: 'GET',
    path: 'basedata/settAcct',
    query: [['action', 'list']],
    success: 'status200',
    container: 'data.items',
    paging: { mode: 'none' },
    notes: '条目 { id, number, name }。现金银行报表的 accountNo 取 number。',
  },

  'pay-method-list': {
    title: '结算方式列表',
    method: 'GET',
    path: 'basedata/assist/getAssistList',
    success: 'successStatus',
    container: 'data',
    paging: { mode: 'none' },
    notes: '当前条目均为 typeNumber=PayMethod。wayId 取 id。',
  },
}

/**
 * 解析继承关系，让 *_cost 和大客户退货端点与主端点保持同一份线格式。
 *
 * transTypeOverride 是深拷贝后替换：大客户明细的真实请求带**两个** transType 键，
 * 直接共享数组会把出库端点的值也改掉，两个端点就都变成退货了。
 */
for (const ep of Object.values(ENDPOINTS)) {
  if (!ep.inheritQuery) continue
  const base = ENDPOINTS[ep.inheritQuery].query
  if (ep.transTypeOverride) {
    ep.query = base.map(([k, v]) => (k === 'transType' ? [k, ep.transTypeOverride] : [k, v]))
  } else {
    ep.query = base
  }
}

export function getEndpoint(key) {
  const ep = ENDPOINTS[key]
  if (!ep) {
    const known = Object.keys(ENDPOINTS).sort().join(', ')
    throw new Error(
      `未注册的端点 "${key}"。本技能只允许调用文档已闭环的接口，不得自行拼路径。\n可用端点：${known}`,
    )
  }
  return ep
}
