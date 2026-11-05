import { expect, type Page } from '@playwright/test'

export async function navigate(page: Page, name: string) {
  await expect(page.getByRole('button', { name: 'Cerrar sesión', exact: true })).toBeVisible()
  const menu = page.getByRole('button', { name: 'Abrir menú', exact: true })
  if (await menu.isVisible()) await menu.click()
  const navigation = page.getByRole('navigation', { name: 'Navegación principal', exact: true })
  await navigation.getByRole('button', { name, exact: true }).click()
}
