export interface BrandOption {
  id: number
  name: string
}

export interface ProductRow {
  invId: string
  invNo: string
  invName: string
  skuId: string
  spec: string
  unit: string
  packSpec: string
  brandName: string
  categoryName: string
  simpleCode: string
  in_time: string
  out_time: string
  qty_1: string
  saleQty: number
}

export interface SalesRow {
  skuId: string
  qty: number
}

interface BrandResponse {
  success: boolean
  msg: string
  data: { items: BrandOption[] }
}

function parseJSON<T>(res: Response): Promise<T> {
  return res.text().then((text) => {
    try {
      return JSON.parse(text) as T
    } catch {
      throw new Error(text.slice(0, 500))
    }
  })
}

export async function fetchBrands(): Promise<BrandOption[]> {
  const params = new URLSearchParams({
    isDelete: '0',
    _search: 'false',
    nd: String(Date.now()),
    rows: '100',
    page: '1',
    sidx: 'id',
    sord: 'desc',
  })
  const res = await fetch(`/api/basedata/assist/brand?${params}`)
  const json: BrandResponse = await parseJSON(res)
  if (!json.success) throw new Error(json.msg || '获取品牌失败')
  return json.data.items.map(({ id, name }) => ({ id, name }))
}

interface InventoryResponse {
  status: number
  msg: string
  data: { rows: ProductRow[] }
}

export async function fetchInventory(brandId: number | null): Promise<ProductRow[]> {
  const params = new URLSearchParams({
    action: 'detail',
    goods: '',
    goodsNo: '',
    storage: '',
    storageNo: '',
    catId: '',
    catName: '',
    brandId: brandId != null ? String(brandId) : '',
    area: 'false',
    zero: 'true',
    negative: 'false',
    carModel: 'false',
    area_name: '',
  })
  const res = await fetch(`/api/report/invBalance?${params}`)
  const json: InventoryResponse = await parseJSON(res)
  if (json.status !== 200) throw new Error(json.msg || '获取库存数据失败')
  return json.data.rows
}

interface SalesResponse {
  status: number
  msg: string
  data: { rows: SalesRow[] }
}

export async function fetchSales(brandId: number | null, startDate: string, endDate: string): Promise<SalesRow[]> {
  const params = new URLSearchParams()
  params.append('action', 'detail')
  params.set('beginDate', startDate)
  params.set('endDate', endDate)
  params.set('customerNo', '')
  params.set('goodsNo', '')
  params.set('storageNo', '')
  params.set('brandId', brandId != null ? String(brandId) : '')
  params.set('cateoryTreeValue', '')
  params.set('categoryTreeAllValue', '')
  params.set('saleType', '-1')
  params.set('kzCategoryIds', '[]')
  params.append('action', 'sales_detail')
  params.set('_search', 'false')
  params.set('nd', String(Date.now()))
  params.set('rows', '3000')
  params.set('page', '1')
  params.set('sidx', 'date')
  params.set('sord', 'desc')
  params.set('salesId', '')
  const res = await fetch(`/api/report/salesDetail_detail?${params}`)
  const json: SalesResponse = await parseJSON(res)
  if (json.status !== 200) throw new Error(json.msg || '获取销售数据失败')
  return json.data.rows
}