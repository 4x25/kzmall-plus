import { SearchableDropdown, DropdownOption } from './SearchableDropdown'
import { Button } from '../ui/button'
import { Card, CardContent } from '../ui/card'
import { DatePicker } from '../ui/date-picker'
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
            <DatePicker
              id="startDate"
              value={startDate}
              onChange={onStartDateChange}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="endDate">结束日期</Label>
            <DatePicker
              id="endDate"
              value={endDate}
              onChange={onEndDateChange}
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
