import { Select } from '@base-ui/react/select'
import { ChevronDown, Check } from 'lucide-react'
import * as styles from '@/styles/app.css'

export type FancySelectOption = { value: string; label: string }

export function FancySelect({
  value,
  onChange,
  options,
  name,
  placeholder,
  disabled,
  className,
}: {
  value: string
  onChange: (value: string) => void
  options: FancySelectOption[]
  name?: string
  placeholder?: string
  disabled?: boolean
  className?: string
}) {
  return (
    <Select.Root<string>
      value={value || null}
      onValueChange={(next) => onChange(next ?? '')}
      name={name}
      disabled={disabled}
      items={options}
    >
      <Select.Trigger className={`${styles.fancySelectTrigger} ${className ?? ''}`}>
        <Select.Value placeholder={placeholder ?? options.find((option) => option.value === value)?.label} />
        <Select.Icon className={styles.fancySelectIcon}>
          <ChevronDown size={15} />
        </Select.Icon>
      </Select.Trigger>
      <Select.Portal>
        <Select.Positioner className={styles.fancySelectPositioner} sideOffset={6}>
          <Select.Popup className={styles.fancySelectPopup}>
            <Select.List>
              {options.map((option) => (
                <Select.Item
                  className={styles.fancySelectItem}
                  key={option.value}
                  value={option.value}
                  label={option.label}
                >
                  <Select.ItemText>{option.label}</Select.ItemText>
                  <Select.ItemIndicator className={styles.fancySelectIndicator}>
                    <Check size={14} />
                  </Select.ItemIndicator>
                </Select.Item>
              ))}
            </Select.List>
          </Select.Popup>
        </Select.Positioner>
      </Select.Portal>
    </Select.Root>
  )
}
