import { SearchableDropdown, DropdownOption } from './SearchableDropdown'
import { Button } from '../ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card'
import { Input } from '../ui/input'
import { Label } from '../ui/label'

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
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">查询条件</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap items-end gap-4">
          <SearchableDropdown
            label="品牌"
            options={brandOptions}
            value={selectedBrand}
            onChange={onBrandChange}
            placeholder="全部品牌"
          />
          <div className="grid gap-2">
            <Label htmlFor="startDate">开始日期</Label>
            <Input
              id="startDate"
              type="date"
              value={startDate}
              onChange={(e) => onStartDateChange(e.target.value)}
              className="w-[160px]"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="endDate">结束日期</Label>
            <Input
              id="endDate"
              type="date"
              value={endDate}
              onChange={(e) => onEndDateChange(e.target.value)}
              className="w-[160px]"
            />
          </div>
          <Button type="button" onClick={onQuery} disabled={loading} className="ml-auto">
            查询
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
