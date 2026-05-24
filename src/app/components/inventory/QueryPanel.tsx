import { SearchableDropdown, DropdownOption } from './SearchableDropdown'

interface QueryPanelProps {
  brandOptions: DropdownOption[]
  selectedBrand: number | null
  onBrandChange: (value: string | number | null) => void
  startDate: string
  onStartDateChange: (v: string) => void
  endDate: string
  onEndDateChange: (v: string) => void
  onQuery: () => void
  loading?: boolean
}

export function QueryPanel({
  brandOptions,
  selectedBrand,
  onBrandChange,
  startDate,
  onStartDateChange,
  endDate,
  onEndDateChange,
  onQuery,
  loading,
}: QueryPanelProps) {
  return (
    <div className="bg-white border border-gray-200 rounded-md mx-8 mt-5 p-5 px-6">
      <div className="flex items-end gap-4 flex-wrap">
        <SearchableDropdown
          label="品牌"
          options={brandOptions}
          value={selectedBrand}
          onChange={onBrandChange}
          placeholder="全部品牌"
        />

        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-gray-500 tracking-wide">销售日期</label>
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={startDate}
              onChange={(e) => onStartDateChange(e.target.value)}
              className="h-9 px-3 w-[160px] border border-gray-200 rounded-md text-[13px] text-gray-900 outline-none transition-colors focus:border-blue-600 focus:ring-[3px] focus:ring-blue-600/10 cursor-pointer"
            />
            <span className="text-[13px] text-gray-400">至</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => onEndDateChange(e.target.value)}
              className="h-9 px-3 w-[160px] border border-gray-200 rounded-md text-[13px] text-gray-900 outline-none transition-colors focus:border-blue-600 focus:ring-[3px] focus:ring-blue-600/10 cursor-pointer"
            />
          </div>
        </div>

        <div className="flex flex-col gap-1.5 ml-auto">
          <label className="text-xs font-medium text-gray-500 tracking-wide">&nbsp;</label>
          <button
            type="button"
            onClick={onQuery}
            disabled={loading}
            className="h-9 px-5 rounded-md text-[13px] font-medium bg-blue-600 text-white transition-colors hover:bg-blue-700 hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
          >
            查询
          </button>
        </div>
      </div>
    </div>
  )
}