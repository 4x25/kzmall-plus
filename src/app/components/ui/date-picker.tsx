import { useEffect, useMemo, useState } from 'react'
import { CalendarIcon, ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from './button'
import { Popover, PopoverContent, PopoverTrigger } from './popover'
import { cn } from '../../lib/utils'

interface DatePickerProps {
  id?: string
  value: string
  onChange: (value: string) => void
}

function formatDate(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function todayValue() {
  return formatDate(new Date())
}

function parseDate(value: string) {
  const [year, month, day] = value.split('-').map(Number)
  if (!year || !month || !day) return new Date()
  return new Date(year, month - 1, day)
}

function formatDisplay(value: string) {
  const date = parseDate(value)
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`
}

export function DatePicker({ id, value, onChange }: DatePickerProps) {
  const [open, setOpen] = useState(false)
  const [viewDate, setViewDate] = useState(() => parseDate(value))
  const selectedDate = useMemo(() => parseDate(value), [value])

  useEffect(() => {
    setViewDate(parseDate(value))
  }, [value])

  const year = viewDate.getFullYear()
  const month = viewDate.getMonth()
  const firstDay = new Date(year, month, 1).getDay()
  const days = new Date(year, month + 1, 0).getDate()
  const today = todayValue()

  const changeMonth = (offset: number) => {
    setViewDate((current) => new Date(current.getFullYear(), current.getMonth() + offset, 1))
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button id={id} type="button" variant="outline" className="w-[180px] justify-start font-normal">
          <CalendarIcon className="size-4" />
          {formatDisplay(value)}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 p-3">
        <div className="mb-3 flex items-center justify-between">
          <Button type="button" variant="ghost" size="icon" onClick={() => changeMonth(-1)}>
            <ChevronLeft className="size-4" />
          </Button>
          <div className="text-sm font-medium">{year}年{month + 1}月</div>
          <Button type="button" variant="ghost" size="icon" onClick={() => changeMonth(1)}>
            <ChevronRight className="size-4" />
          </Button>
        </div>
        <div className="grid grid-cols-7 gap-1 text-center text-xs text-muted-foreground">
          {['日', '一', '二', '三', '四', '五', '六'].map((day) => (
            <div key={day} className="py-1">{day}</div>
          ))}
        </div>
        <div className="mt-1 grid grid-cols-7 gap-1">
          {Array.from({ length: firstDay }).map((_, index) => (
            <div key={`empty-${index}`} />
          ))}
          {Array.from({ length: days }).map((_, index) => {
            const day = index + 1
            const date = new Date(year, month, day)
            const dateValue = formatDate(date)
            const isSelected = formatDate(selectedDate) === dateValue
            const isFuture = dateValue > today

            return (
              <Button
                key={dateValue}
                type="button"
                variant={isSelected ? 'default' : 'ghost'}
                size="icon"
                className={cn('size-8 text-sm', !isSelected && 'font-normal')}
                disabled={isFuture}
                onClick={() => {
                  onChange(dateValue)
                  setOpen(false)
                }}
              >
                {day}
              </Button>
            )
          })}
        </div>
        <div className="mt-3 border-t pt-3">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="w-full"
            onClick={() => {
              onChange(today)
              setOpen(false)
            }}
          >
            今天
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}
