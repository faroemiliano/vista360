import { dateLocale } from '../../i18n'

export function storageBytes(value: number) {
  const [unit, divisor] = value >= 1e9 ? ['GB', 1e9] : value >= 1e6 ? ['MB', 1e6] : value >= 1e3 ? ['KB', 1e3] : ['B', 1]
  return `${new Intl.NumberFormat(dateLocale(), { maximumFractionDigits: 2 }).format(value / divisor)} ${unit}`
}
