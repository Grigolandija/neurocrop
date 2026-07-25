import type { InputHTMLAttributes, KeyboardEvent } from 'react'

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'onBlur'> & {
  value: number | null | undefined
  onCommit: (value: number | undefined) => void
  allowEmpty?: boolean
}

const format = (value: number | null | undefined) => value == null ? '' : String(value)

export default function NumericInput({ value, onCommit, allowEmpty = false, min, max, onFocus, onKeyDown, ...props }: Props) {
  const commit = (input: HTMLInputElement) => {
    const normalized = input.value.trim().replace(',', '.')
    if (!normalized) {
      if (allowEmpty) onCommit(undefined)
      else input.value = format(value)
      return
    }

    const parsed = Number(normalized)
    if (!Number.isFinite(parsed)) {
      input.value = format(value)
      return
    }

    const minimum = min == null ? undefined : Number(min)
    const maximum = max == null ? undefined : Number(max)
    const next = Math.min(
      Number.isFinite(maximum) ? maximum! : parsed,
      Math.max(Number.isFinite(minimum) ? minimum! : parsed, parsed),
    )
    input.value = format(next)
    onCommit(next)
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    onKeyDown?.(event)
    if (event.defaultPrevented) return
    if (event.key === 'Enter') event.currentTarget.blur()
    if (event.key === 'Escape') {
      event.currentTarget.value = format(value)
      event.currentTarget.blur()
    }
  }

  return <input
    key={format(value)}
    {...props}
    type="number"
    min={min}
    max={max}
    defaultValue={format(value)}
    onFocus={onFocus}
    onBlur={(event) => commit(event.currentTarget)}
    onKeyDown={handleKeyDown}
  />
}
