import { useState, useEffect } from 'react'
import type { ReactNode, InputHTMLAttributes, TextareaHTMLAttributes, SelectHTMLAttributes } from 'react'
import { Button as ShadcnButton } from '@/components/ui/button'
import { Input as ShadcnInput } from '@/components/ui/input'
import { Textarea as ShadcnTextarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

// ─── Button ──────────────────────────────────────────────────────────────────

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'
type ButtonSize = 'sm' | 'md' | 'lg'

const VARIANT_MAP = {
  primary:   'default',
  secondary: 'outline',
  ghost:     'ghost',
  danger:    'destructive',
} as const

const SIZE_MAP = {
  sm: 'sm',
  md: 'default',
  lg: 'lg',
} as const

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  asChild?: boolean
}

export function Button({ variant = 'primary', size = 'md', className, ...props }: ButtonProps) {
  return (
    <ShadcnButton
      variant={VARIANT_MAP[variant]}
      size={SIZE_MAP[size]}
      className={cn('[&_svg]:size-auto', className)}
      {...(props as React.ComponentProps<typeof ShadcnButton>)}
    />
  )
}

// ─── Input ───────────────────────────────────────────────────────────────────

interface LabeledInputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
}

export function Input({ label, id, className, ...props }: LabeledInputProps) {
  const inputId = id ?? label?.toLowerCase().replace(/\s+/g, '-')
  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <Label htmlFor={inputId} className="text-xs text-muted-foreground font-medium tracking-wide">
          {label}
        </Label>
      )}
      <ShadcnInput id={inputId} className={cn('h-8 text-sm', className)} {...(props as React.ComponentProps<typeof ShadcnInput>)} />
    </div>
  )
}

// ─── Textarea ─────────────────────────────────────────────────────────────────

interface LabeledTextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string
}

export function Textarea({ label, id, className, ...props }: LabeledTextareaProps) {
  const inputId = id ?? label?.toLowerCase().replace(/\s+/g, '-')
  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <Label htmlFor={inputId} className="text-xs text-muted-foreground font-medium tracking-wide">
          {label}
        </Label>
      )}
      <ShadcnTextarea
        id={inputId}
        className={cn('text-sm resize-none', className)}
        {...(props as React.ComponentProps<typeof ShadcnTextarea>)}
      />
    </div>
  )
}

// ─── Select ──────────────────────────────────────────────────────────────────

type SelectOption = string | { value: string; label: string }

interface LabeledSelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string
  options?: SelectOption[]
}

export function Select({ label, id, options = [], className, ...props }: LabeledSelectProps) {
  const inputId = id ?? label?.toLowerCase().replace(/\s+/g, '-')
  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <Label htmlFor={inputId} className="text-xs text-muted-foreground font-medium tracking-wide">
          {label}
        </Label>
      )}
      <select
        id={inputId}
        className={cn(
          'h-8 w-full rounded-lg border border-input bg-input/30 px-2.5 text-sm text-foreground transition-colors focus:outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50',
          className
        )}
        {...props}
      >
        <option value="">— select —</option>
        {options.map(o => {
          const val = typeof o === 'string' ? o : o.value
          const lab = typeof o === 'string' ? o : o.label
          return <option key={val} value={val}>{lab}</option>
        })}
      </select>
    </div>
  )
}

// ─── Checkbox ────────────────────────────────────────────────────────────────

interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label: string
}

export function Checkbox({ label, id, ...props }: CheckboxProps) {
  const inputId = id ?? label.toLowerCase().replace(/\s+/g, '-')
  return (
    <label htmlFor={inputId} className="flex items-center gap-2.5 text-sm text-muted-foreground cursor-pointer select-none hover:text-foreground transition-colors">
      <input id={inputId} type="checkbox" className="size-3.5 rounded accent-primary cursor-pointer" {...props} />
      {label}
    </label>
  )
}

// ─── SectionHeader ───────────────────────────────────────────────────────────

interface SectionHeaderProps {
  title: string
  description?: string
  action?: ReactNode
}

export function SectionHeader({ title, description, action }: SectionHeaderProps) {
  return (
    <div className="flex items-start justify-between mb-7">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
        {description && <p className="text-sm text-muted-foreground mt-1 leading-relaxed">{description}</p>}
      </div>
      {action}
    </div>
  )
}

// ─── EmptyState ──────────────────────────────────────────────────────────────

interface EmptyStateProps {
  icon: ReactNode
  title: string
  description?: string
  action?: ReactNode
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="size-11 rounded-2xl bg-card border border-border flex items-center justify-center text-muted-foreground mb-4">
        {icon}
      </div>
      <p className="text-sm font-medium text-foreground">{title}</p>
      {description && <p className="text-xs text-muted-foreground mt-1.5 max-w-xs leading-relaxed">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}

// ─── Card ────────────────────────────────────────────────────────────────────

interface CardProps {
  className?: string
  children: ReactNode
}

export function Card({ className = '', children }: CardProps) {
  return (
    <div className={cn('rounded-xl bg-card text-card-foreground ring-1 ring-foreground/8 shadow-sm', className)}>
      {children}
    </div>
  )
}

// ─── MonthYearPicker ─────────────────────────────────────────────────────────

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]
const CURRENT_YEAR = new Date().getFullYear()
const YEARS = Array.from({ length: CURRENT_YEAR - 1959 + 6 }, (_, i) => CURRENT_YEAR + 5 - i)

const SELECT_CLASS = 'h-8 rounded-lg border border-input bg-input/30 px-2.5 text-sm text-foreground transition-colors focus:outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50 disabled:cursor-not-allowed'

interface MonthYearPickerProps {
  label?: string
  value?: string
  onChange: (val: string) => void
  disabled?: boolean
}

export function MonthYearPicker({ label, value = '', onChange, disabled }: MonthYearPickerProps) {
  const [localYear, setLocalYear] = useState(() => value ? value.split('-')[0] : '')
  const [localMonth, setLocalMonth] = useState(() => value ? (value.split('-')[1] ?? '') : '')

  useEffect(() => {
    if (value) {
      const parts = value.split('-')
      setLocalYear(parts[0] ?? '')
      setLocalMonth(parts[1] ?? '')
    } else {
      setLocalYear('')
      setLocalMonth('')
    }
  }, [value])

  function handleMonthChange(m: string) {
    setLocalMonth(m)
    onChange(localYear && m ? `${localYear}-${m}` : '')
  }

  function handleYearChange(y: string) {
    setLocalYear(y)
    onChange(y && localMonth ? `${y}-${localMonth}` : '')
  }

  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <Label className="text-xs text-muted-foreground font-medium tracking-wide">{label}</Label>
      )}
      <div className="flex gap-2">
        <select
          value={localMonth}
          disabled={disabled}
          onChange={e => handleMonthChange(e.target.value)}
          className={cn('flex-1', SELECT_CLASS)}
        >
          <option value="">Month</option>
          {MONTHS.map((m, i) => (
            <option key={i} value={String(i + 1).padStart(2, '0')}>{m}</option>
          ))}
        </select>
        <select
          value={localYear}
          disabled={disabled}
          onChange={e => handleYearChange(e.target.value)}
          className={cn('w-[88px]', SELECT_CLASS)}
        >
          <option value="">Year</option>
          {YEARS.map(y => (
            <option key={y} value={String(y)}>{y}</option>
          ))}
        </select>
      </div>
    </div>
  )
}

export function formatMonthYear(value: string): string {
  if (!value) return ''
  const [year, month] = value.split('-')
  const short = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  const m = parseInt(month, 10)
  if (!year || isNaN(m) || m < 1 || m > 12) return value
  return `${short[m - 1]} ${year}`
}

// ─── FormCard ────────────────────────────────────────────────────────────────

interface FormCardProps {
  onSave: () => void
  onCancel: () => void
  saveLabel?: string
  children: ReactNode
}

export function FormCard({ onSave, onCancel, saveLabel = 'Save', children }: FormCardProps) {
  return (
    <div className="rounded-xl bg-card ring-1 ring-primary/25 shadow-[0_0_0_1px_color-mix(in_oklch,var(--primary)_8%,transparent),0_2px_8px_rgba(0,0,0,0.4)] p-5 mb-4">
      <div className="grid grid-cols-2 gap-4">
        {children}
      </div>
      <div className="flex gap-2 mt-5 pt-4 border-t border-border">
        <Button onClick={onSave}>{saveLabel}</Button>
        <Button variant="ghost" onClick={onCancel}>Cancel</Button>
      </div>
    </div>
  )
}
