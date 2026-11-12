import { expect } from '@playwright/test'
import type { Page, TestInfo } from '@playwright/test'

export async function checkEmbedding(page: Page, testInfo: TestInfo, link: string) {
  await page.getByText('Insertar en mi web', { exact: true }).click()
  const code = await page.getByLabel('Código para insertar', { exact: true }).inputValue()
  const parsed = await page.evaluate(html => {
    const doc = new DOMParser().parseFromString(html, 'text/html')
    const iframe = doc.querySelector('iframe')!
    return { src: iframe.src, title: iframe.title, allow: iframe.allow, fullscreen: iframe.hasAttribute('allowfullscreen'), scripts: doc.querySelectorAll('script').length }
  }, code)
  expect(parsed.src).toBe(link.replace('/tour/', '/embed/'))
  expect(parsed.allow).toContain('gyroscope'); expect(parsed.fullscreen).toBe(true); expect(parsed.scripts).toBe(0)
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write'])
  await page.getByRole('button', { name: 'Copiar código', exact: true }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Código copiado.' })).toBeVisible()
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(code)
  await page.getByRole('button', { name: 'Ver vista previa web', exact: true }).click()
  const frame = page.frameLocator('iframe[title="Vista previa del recorrido insertado"]')
  await expect(frame.locator('.viewer-frame')).toHaveAttribute('data-status', 'ready', { timeout: 15000 })
  await expect(frame.getByRole('heading', { name: parsed.title, exact: true })).toBeVisible()
  await expect(frame.locator('a[href*="wa.me"]')).toHaveCount(0)
  await expect(frame.getByRole('link', { name: /Vision360/ })).toHaveCount(0)
  await page.getByRole('region', { name: 'Ejemplo en la web del cliente', exact: true }).screenshot({ path: testInfo.outputPath('entrega-integracion-web.png') })
  await page.getByRole('button', { name: 'Ocultar vista previa web', exact: true }).click()
  await expect(page.locator('iframe')).toHaveCount(0)
  await page.getByText('Insertar en mi web', { exact: true }).click()
}
