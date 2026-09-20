'use client'
import { ru, type Dict } from './ru'
import { uz } from './uz'
import { useApp } from '@/lib/stores'

export const dictionaries: Record<'ru' | 'uz', Dict> = { ru, uz }
export function useT(): Dict {
  const locale = useApp((s) => s.locale)
  return dictionaries[locale] ?? ru
}
export { ru }
