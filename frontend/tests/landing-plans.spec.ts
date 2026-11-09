import { tokenFor } from './accountFixtures'
import { expect, test } from '@playwright/test'

test('planes del inicio llevan al registro y conservan la elección sin activar un plan pago', async ({ page }, testInfo) => {
  test.skip(process.env.TEST_API !== '1' || process.env.AUTH_REQUIRE_VERIFIED_EMAIL === 'true', 'Requiere API temporal')
  test.setTimeout(90_000)
  page.setDefaultTimeout(10_000)
  await page.goto('/inicio')
  await page.getByRole('link', { name: 'Planes', exact: true }).click()
  const plans = page.getByRole('region', { name: 'Un plan para tu estudio.', exact: true })
  await expect(plans.getByRole('article')).toHaveCount(3)
  await expect(plans.getByText('14 días gratis', { exact: true })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.screenshot({ path: testInfo.outputPath('planes-inicio.png') })
  for (const [label, code] of [['Probar gratis', 'trial'], ['Elegir Estudio', 'studio'], ['Elegir Profesional', 'professional']]) {
    await plans.getByRole('link', { name: label, exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Crear cuenta', exact: true })).toBeVisible()
    await expect(page).toHaveURL(new RegExp(`plan=${code}`))
    if (code !== 'professional') await page.goto('/inicio#planes')
  }
  await expect(page.getByText('Elegiste Profesional.', { exact: false })).toBeVisible()
  const email = `plan-inicio-${testInfo.project.name}-${Date.now()}@example.com`
  await page.getByLabel('Email', { exact: true }).fill(email)
  await page.getByLabel('Contraseña', { exact: true }).fill('Test-password-123!')
  await page.getByRole('button', { name: 'Registrarme', exact: true }).click()
  const account = page.getByRole('dialog', { name: 'Mi cuenta', exact: true })
  await expect(account.getByRole('button', { name: 'Mi plan', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(account.getByText('Elegiste Profesional', { exact: true })).toBeVisible()
  await expect(account.getByText('Prueba', { exact: true })).toBeVisible()
  await expect(account.getByRole('link', { name: 'Consultar activación de Profesional', exact: true })).toBeVisible()
  await page.reload()
  await expect(account.getByText('Elegiste Profesional', { exact: true })).toBeVisible()
  await account.getByRole('button', { name: 'Cerrar Mi cuenta', exact: true }).click()
  await expect(page).not.toHaveURL(/plan=/)
  // Con una sesión iniciada, la selección abre Mi plan y no pide registrarse otra vez.
  await page.goto('/inicio#planes')
  await plans.getByRole('link', { name: 'Elegir Estudio', exact: true }).click()
  await expect(account.getByText('Elegiste Estudio', { exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Crear cuenta', exact: true })).toHaveCount(0)
  await expect(account.getByText('Prueba', { exact: true })).toBeVisible()
  await account.getByRole('link', { name: 'Consultar activación de Estudio', exact: true }).click()
  await expect(page.getByLabel('Tu consulta', { exact: true })).toHaveValue(/plan Estudio/)
  // Los valores ajenos al catálogo no se aceptan como selección.
  await page.goto('/studio?plan=legacy')
  await expect(page.getByRole('dialog', { name: 'Mi cuenta', exact: true })).toHaveCount(0)
})

test('elección del inicio se conserva al ingresar con una cuenta existente', async ({ page }) => {
  test.skip(process.env.TEST_API !== '1' || process.env.AUTH_REQUIRE_VERIFIED_EMAIL === 'true', 'Requiere API temporal')
  page.setDefaultTimeout(10_000)
  await page.goto('/inicio')
  await page.getByRole('link', { name: 'Elegir Profesional', exact: true }).click()
  await page.getByRole('button', { name: 'Ya tengo una cuenta', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Ingresar', exact: true })).toBeVisible()
  await page.getByLabel('Email', { exact: true }).fill(process.env.TEST_ADMIN_EMAIL!)
  await page.getByLabel('Contraseña', { exact: true }).fill('Test-password-123!')
  await page.getByRole('button', { name: 'Ingresar', exact: true }).click()
  const account = page.getByRole('dialog', { name: 'Mi cuenta', exact: true })
  await expect(account.getByText('Elegiste Profesional', { exact: true })).toBeVisible()
  await expect(account.getByRole('button', { name: 'Mi plan', exact: true })).toHaveAttribute('aria-pressed', 'true')
})


test('plan elegido se conserva hasta confirmar el email obligatorio', async ({ page, browser, baseURL }, testInfo) => {
  test.skip(process.env.TEST_API !== '1' || process.env.AUTH_REQUIRE_VERIFIED_EMAIL !== 'true', 'Requiere verificación obligatoria')
  const email = `plan-verificado-${testInfo.project.name}-${Date.now()}@example.com`
  await page.goto('/inicio')
  await page.getByRole('link', { name: 'Elegir Profesional', exact: true }).click()
  await page.getByLabel('Email', { exact: true }).fill(email)
  await page.getByLabel('Contraseña', { exact: true }).fill('Test-password-123!')
  await page.getByRole('button', { name: 'Registrarme', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Verificá tu email', exact: true })).toBeVisible()
  await expect(page.getByRole('dialog', { name: 'Mi cuenta', exact: true })).toHaveCount(0)
  const context = await browser.newContext({ baseURL })
  try {
    const visitor = await context.newPage()
    await visitor.goto(`/cuenta/verificar#token=${tokenFor(email, 'verify')}`)
    await visitor.getByRole('button', { name: 'Confirmar mi email', exact: true }).click()
    await expect(visitor.getByRole('status')).toContainText('Email verificado')
    await page.getByRole('button', { name: 'Ya verifiqué mi email', exact: true }).click()
    const account = page.getByRole('dialog', { name: 'Mi cuenta', exact: true })
    await expect(account.getByText('Elegiste Profesional', { exact: true })).toBeVisible()
    await expect(account.getByText('Prueba', { exact: true })).toBeVisible()
  } finally { await context.close() }
})
