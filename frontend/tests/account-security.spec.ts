import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'
import { expect, test } from '@playwright/test'

function tokenFor(email: string, purpose: 'verify' | 'reset') {
  // Fixture exclusiva de la base efímera: no hay un endpoint de prueba ni un bypass en la aplicación.
  return execFileSync(resolve('../backend/.venv/bin/python'), ['-c', `
import os,sys
from sqlalchemy import create_engine,select
from sqlalchemy.engine import make_url
from sqlalchemy.orm import Session
from app.modules.auth.models import User, AuthAction
from app.modules.auth.actions import raw_token
url=make_url(os.environ['DATABASE_URL'])
assert os.environ.get('APP_ENV') == 'test' and url.host in ('localhost','127.0.0.1') and url.database.endswith('_test')
with Session(create_engine(url)) as db:
    user=db.scalar(select(User).where(User.email_normalized==sys.argv[1]))
    action=db.scalar(select(AuthAction).where(AuthAction.user_id==user.id,AuthAction.purpose==sys.argv[2]).order_by(AuthAction.created_at.desc()))
    print(raw_token(action))
`, email, purpose], { cwd: resolve('../backend'), encoding: 'utf8' }).trim()
}

test('verifica email, cambia contraseña y recupera la cuenta con enlaces de un solo uso', async ({ page, browser, baseURL }, testInfo) => {
  test.skip(process.env.TEST_API !== '1' || process.env.AUTH_REQUIRE_VERIFIED_EMAIL !== 'true', 'Requiere API temporal con verificación obligatoria')
  test.setTimeout(90_000)
  const email = `seguridad-${testInfo.project.name}-${Date.now()}@example.com`
  const original = 'Test-password-123!', changed = 'Changed-password-456!', recovered = 'Recovered-password-789!'
  await page.goto('/studio')
  await page.getByRole('button', { name: 'Crear una cuenta', exact: true }).click()
  await page.getByLabel('Email', { exact: true }).fill(email)
  await page.getByLabel('Contraseña', { exact: true }).fill(original)
  await page.getByRole('button', { name: 'Registrarme', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Verificá tu email', exact: true })).toBeVisible()
  const verifyToken = tokenFor(email, 'verify')
  const anonymous = await browser.newContext({ baseURL, viewport: page.viewportSize()! })
  try {
    const visitor = await anonymous.newPage()
    await visitor.goto(`/cuenta/verificar#token=${verifyToken}`)
    await expect(visitor).not.toHaveURL(/#token=/)
    await expect(visitor.getByRole('button', { name: 'Confirmar mi email', exact: true })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Verificá tu email', exact: true })).toBeVisible()
    await visitor.getByRole('button', { name: 'Confirmar mi email', exact: true }).click()
    await expect(visitor.getByRole('status')).toContainText('Email verificado')
    await page.getByRole('button', { name: 'Ya verifiqué mi email', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Trabajos', exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Seguridad de cuenta', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: 'Seguridad de tu cuenta', exact: true })
    await expect(dialog).toContainText('Email verificado')
    await dialog.getByLabel('Contraseña actual', { exact: true }).fill(original)
    await dialog.getByLabel('Nueva contraseña', { exact: true }).fill(changed)
    await dialog.getByLabel('Repetir nueva contraseña', { exact: true }).fill(changed)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.screenshot({ path: testInfo.outputPath('seguridad-cuenta.png') })
    await dialog.getByRole('button', { name: 'Cambiar contraseña', exact: true }).click()
    await expect(dialog.getByRole('status')).toContainText('Contraseña actualizada')
    await dialog.getByRole('button', { name: 'Cerrar seguridad de cuenta', exact: true }).click()
    await visitor.goto('/studio')
    await visitor.getByRole('button', { name: 'Olvidé mi contraseña', exact: true }).click()
    await visitor.getByLabel('Email', { exact: true }).fill(email)
    await visitor.getByRole('button', { name: 'Enviar enlace de recuperación', exact: true }).click()
    await expect(visitor.getByRole('status')).toContainText('Si la cuenta corresponde')
    const resetToken = tokenFor(email, 'reset')
    await visitor.goto(`/cuenta/restablecer#token=${resetToken}`)
    await expect(visitor).not.toHaveURL(/#token=/)
    await visitor.getByLabel('Nueva contraseña', { exact: true }).fill(recovered)
    await visitor.getByLabel('Repetir nueva contraseña', { exact: true }).fill(recovered)
    await visitor.getByRole('button', { name: 'Guardar nueva contraseña', exact: true }).click()
    await expect(visitor.getByRole('status')).toContainText('Contraseña actualizada')
    await page.reload()
    await expect(page.getByRole('button', { name: 'Ingresar', exact: true })).toBeVisible()
    await visitor.goto(`/cuenta/restablecer#token=${resetToken}`)
    await visitor.getByLabel('Nueva contraseña', { exact: true }).fill(changed)
    await visitor.getByLabel('Repetir nueva contraseña', { exact: true }).fill(changed)
    await visitor.getByRole('button', { name: 'Guardar nueva contraseña', exact: true }).click()
    await expect(visitor.getByRole('alert')).toContainText('ya fue utilizado')
    await page.getByLabel('Email', { exact: true }).fill(email)
    await page.getByLabel('Contraseña', { exact: true }).fill(recovered)
    await page.getByRole('button', { name: 'Ingresar', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Trabajos', exact: true })).toBeVisible()
  } finally { await anonymous.close() }
})
