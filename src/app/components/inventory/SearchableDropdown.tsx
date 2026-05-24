import { useState, useRef, useEffect } from 'react'
import { ChevronDown } from 'lucide-react'

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
  const ref = useRef<HTMLDivElement>(null)

  const selected = options.find((o) => o.value === value)
  const displayText = selected ? selected.label : placeholder

  const filtered = searchable && search
    ? options.filter((o) => o.label.toLowerCase().includes(search.toLowerCase()))
    : options

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  return (
    <div className={`flex flex-col gap-1.5 ${className ?? ''}`} ref={ref}>
      <label className="text-xs font-medium text-gray-500 tracking-wide">{label}</label>
      <div className="relative">
        <button
          type="button"
          onClick={() => {
            setOpen((prev) => !prev)
            setSearch('')
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') setOpen(false)
          }}
          className={`h-9 px-3 w-[200px] border rounded-md text-[13px] flex items-center justify-between gap-2 transition-colors font-body
            ${open ? 'border-blue-600 ring-[3px] ring-blue-600/10' : 'border-gray-200 hover:border-gray-400'}
            ${!selected ? 'text-gray-400' : 'text-gray-900'}
          `}
        >
          <span className="truncate">{displayText}</span>
          <ChevronDown className={`w-3.5 h-3.5 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>

        {open && (
          <div className="absolute top-[calc(100%+4px)] left-0 min-w-[220px] bg-white border border-gray-200 rounded-md shadow-lg z-[200] max-h-[280px] overflow-y-auto">
            {searchable && (
              <div className="p-2 border-b border-gray-200 sticky top-0 bg-white z-1">
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="搜索…"
                  className="w-full h-[30px] px-2.5 border border-gray-200 rounded text-xs outline-none focus:border-blue-600"
                  autoFocus
                />
              </div>
            )}
            {filtered.length === 0 && (
              <div className="py-4 text-center text-gray-400 text-xs">无匹配项</div>
            )}
            {filtered.map((opt) => (
              <button
                type="button"
                key={String(opt.value)}
                onClick={() => {
                  onChange(opt.value)
                  setOpen(false)
                  setSearch('')
                }}
                className={`w-full px-3 py-2 text-[13px] text-left truncate hover:bg-blue-50 transition-colors
                  ${opt.value === value ? 'bg-blue-50 text-blue-600 font-medium' : 'text-gray-900'}
                `}
              >
                {opt.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}