import { expect, test } from '@playwright/test'
import { navigate } from './navigationHelpers'

test('consulta histórica de Vision360 se conserva y se convierte en trabajo', async ({ page, browser }, testInfo) => {
  test.skip(process.env.TEST_API !== '1', 'Requiere API y PostgreSQL temporal')
  test.setTimeout(60_000)
  page.setDefaultTimeout(10_000)
  const name = `Consulta ${testInfo.project.name} ${Date.now()}`
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto('/inicio')
  // La portada ya no recibe consultas globales; crear una consulta histórica como fixture.
  const receipt = await page.evaluate(async (name) => {
    const base = 'http://127.0.0.1:8002/api/v1'
    const session = await fetch(`${base}/auth/session`, { credentials: 'include' }).then(response => response.json())
    const response = await fetch(`${base}/service-requests`, {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': session.csrf_token },
      body: JSON.stringify({ name, email: 'visitor@example.com', whatsapp: '+54 9 11 1234 5678',
        property_kind: 'casa', locality: 'Palermo', area_m2: 90, rooms: 3,
        message: 'Coordinar para la próxima semana', consent: true, website: '', submission_id: crypto.randomUUID() }),
    })
    if (!response.ok) throw new Error(`No se pudo preparar la consulta histórica: ${response.status}`)
    return response.json()
  }, name)
  const id = receipt.id
  await page.goto(`/studio/solicitudes?solicitud=${id}`)
  await page.getByLabel('Email', { exact: true }).fill(process.env.TEST_ADMIN_EMAIL!)
  await page.getByLabel('Contraseña', { exact: true }).fill('Test-password-123!')
  await page.getByRole('button', { name: 'Ingresar', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Solicitudes de digitalización', exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name, exact: true })).toBeVisible()
  await expect(page.getByText('Aviso por email pendiente de activación', { exact: true }).first()).toBeVisible()
  await page.reload()
  await expect(page.getByRole('heading', { name, exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Ver todas las solicitudes', exact: true }).click()
  await expect(page).not.toHaveURL(/solicitud=/)
  await navigate(page, 'Organizaciones')
  await page.getByLabel('Nombre de la organización', { exact: true }).fill(`Cliente ${name}`)
  await page.getByRole('combobox', { name: 'Tipo de organización', exact: true }).selectOption('agency')
  await page.getByRole('button', { name: 'Crear organización', exact: true }).click()
  await expect(page.getByRole('heading', { name: `Cliente ${name}`, exact: true })).toBeVisible()
  await navigate(page, 'Solicitudes web')
  await page.getByRole('button', { name: 'Consultas de Vision360', exact: true }).click()
  const item = page.getByRole('article').filter({ has: page.getByRole('heading', { name, exact: true }) })
  await expect(item.locator('details')).not.toHaveAttribute('open')
  await expect(item.getByText('visitor@example.com', { exact: true })).not.toBeVisible()
  await expect(item.getByRole('button', { name: 'Ver historial', exact: true })).not.toBeVisible()
  const summary = item.locator('summary')
  await summary.focus()
  await summary.press('Enter')
  await expect(item.getByText('visitor@example.com', { exact: true })).toBeVisible()
  await expect(item.getByText('Coordinar para la próxima semana', { exact: true })).toBeVisible()
  await expect(item.getByText('Palermo', { exact: true })).toBeVisible()
  await summary.click()
  await expect(item.getByText('visitor@example.com', { exact: true })).not.toBeVisible()
  await summary.click()
  await page.screenshot({ path: testInfo.outputPath('solicitud-desplegada.png'), fullPage: true })
  await item.getByRole('combobox', { name: 'Nuevo estado', exact: true }).selectOption('PRESUPUESTADO')
  await item.getByLabel('Nota interna', { exact: true }).fill('Cliente contactado por WhatsApp')
  await item.getByRole('button', { name: 'Actualizar estado', exact: true }).click()
  await expect(item.locator('.badge')).toHaveText('PRESUPUESTADO')
  await item.getByRole('button', { name: `Preparar trabajo para ${name}`, exact: true }).click()
  await page.getByRole('button', { name: 'Cliente existente', exact: true }).click()
  await page.getByRole('combobox', { name: 'Cliente del trabajo', exact: true }).selectOption({ label: `Cliente ${name}` })
  await page.getByLabel('Nombre del trabajo', { exact: true }).fill(`Recorrido ${name}`)
  await page.getByRole('button', { name: 'Guardar y abrir trabajo', exact: true }).click()
  await expect(page).toHaveURL(/\/studio\/trabajos\/[a-f\d-]+/)
  await expect(page.getByRole('heading', { name: `Recorrido ${name}`, exact: true })).toBeVisible()
  await page.reload()
  await expect(page.getByRole('heading', { name: `Recorrido ${name}`, exact: true })).toBeVisible()
  const stranger = await browser.newContext()
  try {
    const other = await stranger.newPage()
    await other.goto('/studio')
    await other.getByRole('button', { name: 'Crear una cuenta', exact: true }).click()
    await other.getByLabel('Email', { exact: true }).fill(`stranger-${testInfo.project.name}-${Date.now()}@example.com`)
    await other.getByLabel('Contraseña', { exact: true }).fill('Test-password-123!')
    await other.getByRole('button', { name: 'Registrarme', exact: true }).click()
    await expect(other.getByRole('button', { name: 'Cerrar sesión', exact: true })).toBeVisible()
    await expect(other.getByRole('button', { name: 'Solicitudes web', exact: true, includeHidden: true })).toHaveCount(1)
    await other.goto(`/studio/solicitudes?solicitud=${id}`)
    await expect(other.getByRole('alert')).toContainText('reservadas a la administración')
    await expect(other.getByRole('heading', { name, exact: true })).toHaveCount(0)
  } finally { await stranger.close() }
  expect(errors).toEqual([])
})
