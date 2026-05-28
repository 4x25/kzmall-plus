import { useState } from 'react'
import { Check, ChevronsUpDown, Search } from 'lucide-react'
import { cn } from '../../lib/utils'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Label } from '../ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover'

export interface DropdownOption {
  value: string | number | null
  label: string
}

interface SearchableDropdownProps {
  label: string
  options: DropdownOption[]
  value: string | number | null
  onChange: (value: string | number | null) => void
  placeholder?: string
  searchable?: boolean
  className?: string
}

export function SearchableDropdown({
  label,
  options,
  value,
  onChange,
  placeholder = '请选择',
  searchable = true,
  className,
}: SearchableDropdownProps) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const selected = options.find((o) => o.value === value)
  const filtered = searchable && search
    ? options.filter((o) => o.label.toLowerCase().includes(search.toLowerCase()))
    : options

  return (
    <div className={cn('grid gap-2', className)}>
      <Label>{label}</Label>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" role="combobox" aria-expanded={open} className="w-[220px] justify-between font-normal">
            <span className={cn('truncate', !selected && 'text-muted-foreground')}>{selected ? selected.label : placeholder}</span>
            <ChevronsUpDown className="opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-[260px] p-0">
          {searchable && (
            <div className="flex items-center gap-2 border-b p-2">
              <Search className="size-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="搜索…"
                className="h-8 border-0 px-0 shadow-none focus-visible:ring-0"
              />
            </div>
          )}
          <div className="max-h-72 overflow-auto p-1">
            {filtered.length === 0 ? (
              <div className="py-6 text-center text-sm text-muted-foreground">无匹配项</div>
            ) : (
              filtered.map((opt) => (
                <button
                  type="button"
                  key={String(opt.value)}
                  onClick={() => {
                    onChange(opt.value)
                    setOpen(false)
                    setSearch('')
                  }}
                  className={cn(
                    'relative flex w-full cursor-default select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-accent hover:text-accent-foreground',
                    opt.value === value && 'bg-accent text-accent-foreground'
                  )}
                >
                  <Check className={cn('mr-2 size-4', opt.value === value ? 'opacity-100' : 'opacity-0')} />
                  <span className="truncate">{opt.label}</span>
                </button>
              ))
            )}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  )
}
