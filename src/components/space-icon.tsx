import {
  BookOpen,
  Code2,
  Compass,
  Database,
  Megaphone,
  Palette,
  ShieldCheck,
  Users,
  type LucideIcon,
} from 'lucide-react'

export const SPACE_ICON_OPTIONS = [
  { value: 'book-open', label: 'Book' },
  { value: 'code-2', label: 'Code' },
  { value: 'compass', label: 'Compass' },
  { value: 'database', label: 'Database' },
  { value: 'megaphone', label: 'Megaphone' },
  { value: 'palette', label: 'Palette' },
  { value: 'shield-check', label: 'Shield' },
  { value: 'users', label: 'People' },
] as const

export type SpaceIconName = (typeof SPACE_ICON_OPTIONS)[number]['value']

const ICONS: Record<SpaceIconName, LucideIcon> = {
  'book-open': BookOpen,
  'code-2': Code2,
  compass: Compass,
  database: Database,
  megaphone: Megaphone,
  palette: Palette,
  'shield-check': ShieldCheck,
  users: Users,
}

export function SpaceIcon({ name, size = 18 }: { name: SpaceIconName; size?: number }) {
  const Icon = ICONS[name] ?? BookOpen
  return <Icon size={size} strokeWidth={1.8} aria-hidden="true" />
}
