import { expect, test, type Page } from '@playwright/test'
import { navigate } from './navigationHelpers'

test('estudios independientes conservan su cartera y comparten sólo clientes autorizados', async ({ page, browser }, testInfo) => {
  test.skip(process.env.TEST_API !== '1', 'Requiere API y PostgreSQL temporal')
  test.setTimeout(90_000)
  page.setDefaultTimeout(10_000)
  const stamp = `${testInfo.project.name}-${Date.now()}`
  const firstStudio = `Estudio Ana ${stamp}`
  const secondStudio = `Estudio Bruno ${stamp}`
  const secondEmail = `studio-bruno-${stamp}@example.com`
  const secondContext = await browser.newContext({ viewport: testInfo.project.use.viewport })
  const second = await secondContext.newPage()
  second.setDefaultTimeout(10_000)
  async function register(target: Page, email: string, studio: string) {
    await target.goto('http://127.0.0.1:5176/studio')
    await target.getByRole('button', { name: 'Crear una cuenta', exact: true }).click()
    await target.getByLabel('Email', { exact: true }).fill(email)
    await target.getByLabel('Contraseña', { exact: true }).fill('Test-password-123!')
    await target.getByRole('button', { name: 'Registrarme', exact: true }).click()
    await target.getByRole('button', { name: 'Editar estudio', exact: true }).click()
    await target.getByLabel('Nombre del estudio', { exact: true }).fill(studio)
    await target.getByRole('button', { name: 'Guardar estudio', exact: true }).click()
    await expect(target.getByRole('heading', { name: studio, exact: true })).toBeVisible()
  }
  async function client(target: Page, name: string) {
    await navigate(target, 'Organizaciones')
    await target.getByLabel('Nombre de la organización', { exact: true }).fill(name)
    const saved = target.waitForResponse((response) => response.url().endsWith('/organizations') && response.request().method() === 'POST')
    await target.getByRole('button', { name: 'Crear organización', exact: true }).click()
    const data = await (await saved).json()
    await expect(target.getByRole('heading', { name, exact: true })).toBeVisible()
    return data
  }
  try {
    await register(page, `studio-ana-${stamp}@example.com`, firstStudio)
    const a = await client(page, 'Remax')
    await client(page, 'Privado de Ana')
    await register(second, secondEmail, secondStudio)
    const b = await client(second, 'Remax')
    await client(second, 'Privado de Bruno')
    expect(a.workspace_id).not.toBe(b.workspace_id)
    for (const [target, own, foreign] of [[page, 'Privado de Ana', 'Privado de Bruno'], [second, 'Privado de Bruno', 'Privado de Ana']] as const) {
      await navigate(target, 'Gestionar clientes')
      const table = target.getByRole('table', { name: 'Clientes', exact: true })
      await expect(table.locator('tbody tr')).toHaveCount(2)
      await expect(table.getByRole('rowheader', { name: own, exact: true })).toBeVisible()
      await expect(table.getByRole('rowheader', { name: foreign, exact: true })).toHaveCount(0)
    }
    expect((await page.request.get(`http://127.0.0.1:8002/api/v1/organizations/${a.id}/jobs`)).status()).toBe(200)
    expect((await second.request.get(`http://127.0.0.1:8002/api/v1/organizations/${a.id}/jobs`)).status()).toBe(404)
    expect((await second.request.get(`http://127.0.0.1:8002/api/v1/organizations?workspace_id=${a.workspace_id}`)).status()).toBe(404)
    const status = await page.evaluate(async ({ id, email }) => {
      const api = 'http://127.0.0.1:8002/api/v1'
      const session = await (await fetch(`${api}/auth/session`, { credentials: 'include' })).json()
      return (await fetch(`${api}/organizations/${id}/members`, { method: 'PUT', credentials: 'include',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': session.csrf_token },
        body: JSON.stringify({ email, role: 'viewer' }),
      })).status
    }, { id: a.id, email: secondEmail })
    expect(status).toBe(200)
    await second.reload()
    await expect(second.getByRole('heading', { name: secondStudio, exact: true })).toBeVisible()
    await second.getByLabel('Estudio activo', { exact: true }).selectOption({ label: `${firstStudio} · compartido` })
    await navigate(second, 'Gestionar clientes')
    const shared = second.getByRole('table', { name: 'Clientes', exact: true })
    await expect(shared.locator('tbody tr')).toHaveCount(1)
    await expect(shared.getByRole('rowheader', { name: 'Remax', exact: true })).toBeVisible()
    await expect(second.getByRole('button', { name: 'Editar estudio', exact: true })).toHaveCount(0)
    await navigate(second, 'Organizaciones')
    await expect(second.getByRole('button', { name: 'Crear organización', exact: true })).toHaveCount(0)
    await second.getByRole('button', { name: 'Abrir organización Remax', exact: true }).click()
    await expect(second.getByRole('button', { name: 'Nuevo trabajo', exact: true })).toHaveCount(0)
    await second.getByLabel('Estudio activo', { exact: true }).selectOption({ label: `${secondStudio} · propio` })
    await navigate(second, 'Gestionar clientes')
    await expect(second.getByRole('rowheader', { name: 'Privado de Bruno', exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Cerrar sesión', exact: true }).click()
    await page.getByLabel('Email', { exact: true }).fill(secondEmail)
    await page.getByLabel('Contraseña', { exact: true }).fill('Test-password-123!')
    await page.getByRole('button', { name: 'Ingresar', exact: true }).click()
    await expect(page.getByRole('heading', { name: secondStudio, exact: true })).toBeVisible()
    await navigate(page, 'Gestionar clientes')
    await expect(page.getByRole('rowheader', { name: 'Privado de Bruno', exact: true })).toBeVisible()
    await expect(page.getByRole('rowheader', { name: 'Privado de Ana', exact: true })).toHaveCount(0)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    await page.screenshot({ path: testInfo.outputPath('estudio-independiente.png'), fullPage: true })
  } finally { await secondContext.close() }
})
