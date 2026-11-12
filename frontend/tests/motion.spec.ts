import { expect, test, type Page } from '@playwright/test'

async function sensors(page: Page, permission: 'granted' | 'denied' | 'reject' | 'pending' = 'granted') {
  await page.addInitScript((permission) => {
    const state = { requests: 0, listeners: new Set<EventListenerOrEventListenerObject>(), viewer: null as any, resolve: null as any }
    ;(window as any).__motionTest = state
    Object.defineProperty(navigator, 'maxTouchPoints', { configurable: true, get: () => 1 })
    Object.defineProperty(DeviceOrientationEvent, 'requestPermission', { configurable: true, value: () => {
      state.requests++
      if (permission === 'reject') return Promise.reject(new DOMException('Denied', 'NotAllowedError'))
      if (permission === 'pending') return new Promise((resolve) => { state.resolve = resolve })
      return Promise.resolve(permission)
    } })
    const add = window.addEventListener.bind(window), remove = window.removeEventListener.bind(window)
    window.addEventListener = ((type: string, listener: EventListenerOrEventListenerObject, options?: any) => {
      if (type === 'deviceorientation') state.listeners.add(listener)
      add(type, listener, options)
    }) as typeof window.addEventListener
    window.removeEventListener = ((type: string, listener: EventListenerOrEventListenerObject, options?: any) => {
      if (type === 'deviceorientation') state.listeners.delete(listener)
      remove(type, listener, options)
    }) as typeof window.removeEventListener
    let pannellum: any
    Object.defineProperty(window, 'pannellum', { configurable: true, get: () => pannellum, set(value) {
      const factory = value.viewer
      value.viewer = (...args: any[]) => { state.viewer = factory(...args); return state.viewer }
      pannellum = value
    } })
  }, permission)
}

async function ready(page: Page) {
  await expect(page.locator('.viewer-frame')).toHaveAttribute('data-status', 'ready')
}
async function point(page: Page, alpha: number | null, beta = 90, gamma = 0) {
  await page.evaluate(({ alpha, beta, gamma }) => window.dispatchEvent(new DeviceOrientationEvent('deviceorientation', { alpha, beta, gamma })), { alpha, beta, gamma })
}
async function view(page: Page) {
  return page.evaluate(() => {
    const viewer = (window as any).__motionTest.viewer
    return { yaw: viewer.getYaw(), pitch: viewer.getPitch(), hfov: viewer.getHfov() }
  })
}

test('movimiento del celular pide permiso y sigue giro e inclinación sin cambiar el zoom', async ({ page }) => {
  await sensors(page)
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto('/visor'); await ready(page)
  expect(await page.evaluate(() => (window as any).__motionTest.requests)).toBe(0)
  await point(page, 330, 120)
  expect((await view(page)).yaw).toBeCloseTo(0)
  await page.getByRole('button', { name: 'Mirar con el celular', exact: true }).click()
  await point(page, 0)
  await expect(page.getByRole('button', { name: 'Desactivar movimiento', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await point(page, 330, 120)
  await expect.poll(async () => Math.abs((await view(page)).yaw - 30)).toBeLessThan(.2)
  await expect.poll(async () => Math.abs((await view(page)).pitch - 30)).toBeLessThan(.2)
  await page.getByRole('button', { name: 'Acercar', exact: true }).click()
  await point(page, 320, 120)
  await expect.poll(async () => Math.abs((await view(page)).yaw - 40)).toBeLessThan(.2)
  expect((await view(page)).hfov).toBeCloseTo(100)
  await page.getByRole('button', { name: 'Desactivar movimiento', exact: true }).click()
  const stopped = await view(page)
  await point(page, 250, 150)
  expect(await view(page)).toEqual(stopped)
  expect(await page.evaluate(() => (window as any).__motionTest.listeners.size)).toBe(0)
  expect(errors).toEqual([])
})

test('movimiento mantiene dirección en horizontal y al pasar por cero, centra y permite arrastrar', async ({ page }) => {
  await sensors(page)
  await page.goto('/visor'); await ready(page)
  await page.getByRole('button', { name: 'Mirar con el celular', exact: true }).click()
  await point(page, 359)
  await point(page, 1)
  await expect.poll(async () => Math.abs((await view(page)).yaw + 2)).toBeLessThan(.2)
  await page.getByRole('button', { name: 'Centrar movimiento', exact: true }).click()
  const centered = await view(page)
  await point(page, 270, 0, 90) // Misma dirección óptica que alpha=0, beta=90, gamma=0.
  expect((await view(page)).yaw).toBeCloseTo(centered.yaw)
  await point(page, 240, 0, 90)
  await expect.poll(async () => Math.abs((await view(page)).yaw - (centered.yaw + 30))).toBeLessThan(.2)
  await page.getByTestId('panorama').dispatchEvent('pointerdown', { pointerId: 1, button: 0 })
  await expect(page.getByRole('button', { name: 'Mirar con el celular', exact: true })).toHaveAttribute('aria-pressed', 'false')
  expect(await page.evaluate(() => (window as any).__motionTest.listeners.size)).toBe(0)
})

test('movimiento continúa al cambiar ambiente y limpia sensores al desmontar', async ({ page }) => {
  await sensors(page)
  await page.goto('/visor'); await ready(page)
  await page.getByRole('button', { name: 'Mirar con el celular', exact: true }).click()
  await point(page, 0); await point(page, 330)
  await expect.poll(async () => Math.abs((await view(page)).yaw - 30)).toBeLessThan(.2)
  await page.getByRole('button', { name: 'Sala de prueba', exact: true }).click()
  await expect.poll(() => page.evaluate(() => {
    const viewer = (window as any).__motionTest.viewer
    return viewer.getScene() === 'sala' && viewer.isLoaded()
  })).toBe(true)
  await ready(page)
  const initial = await view(page)
  await point(page, 330) // Recalibración en la dirección inicial del nuevo ambiente.
  expect((await view(page)).yaw).toBeCloseTo(initial.yaw)
  await point(page, 320)
  await expect.poll(async () => Math.abs((await view(page)).yaw - initial.yaw - 10)).toBeLessThan(.2)
  await page.getByRole('button', { name: 'Desmontar visor', exact: true }).click()
  expect(await page.evaluate(() => (window as any).__motionTest.listeners.size)).toBe(0)
  await page.getByRole('button', { name: 'Montar visor', exact: true }).click()
  await ready(page)
  await expect(page.getByRole('button', { name: 'Mirar con el celular', exact: true })).toHaveAttribute('aria-pressed', 'false')
})

for (const permission of ['denied', 'reject'] as const) {
  test(`movimiento con permiso ${permission} conserva el control manual`, async ({ page }) => {
    await sensors(page, permission)
    const errors: string[] = []; page.on('pageerror', (error) => errors.push(error.message))
    await page.goto('/visor'); await ready(page)
    await page.getByRole('button', { name: 'Mirar con el celular', exact: true }).click()
    await expect(page.getByText(/No se habilitó el permiso|El navegador no permitió/)).toBeVisible()
    expect(await page.evaluate(() => (window as any).__motionTest.listeners.size)).toBe(0)
    await page.getByRole('button', { name: 'Acercar', exact: true }).click()
    expect((await view(page)).hfov).toBeCloseTo(100)
    expect(errors).toEqual([])
  })
}

test('movimiento sin lecturas válidas avisa y no deja listeners pendientes', async ({ page }) => {
  await sensors(page)
  await page.goto('/visor'); await ready(page)
  await page.clock.install()
  await page.getByRole('button', { name: 'Mirar con el celular', exact: true }).click()
  await point(page, null)
  await page.clock.fastForward(6100)
  await expect(page.getByText('No recibimos datos del sensor.', { exact: false })).toBeVisible()
  expect(await page.evaluate(() => (window as any).__motionTest.listeners.size)).toBe(0)
})

test('movimiento exige conexión segura y descarta permisos que llegan después de desmontar', async ({ page }) => {
  await sensors(page, 'pending')
  await page.goto('/visor'); await ready(page)
  await page.getByRole('button', { name: 'Mirar con el celular', exact: true }).click()
  await page.getByRole('button', { name: 'Desmontar visor', exact: true }).click()
  await page.evaluate(() => (window as any).__motionTest.resolve('granted'))
  expect(await page.evaluate(() => (window as any).__motionTest.listeners.size)).toBe(0)
  await page.addInitScript(() => Object.defineProperty(window, 'isSecureContext', { value: false, configurable: true }))
  await page.reload(); await ready(page)
  await expect(page.getByRole('button', { name: 'Mirar con el celular', exact: true })).toBeDisabled()
  await expect(page.getByText(/abrí el recorrido desde un enlace HTTPS/)).toBeVisible()
})

test('movimiento no disponible ofrece control táctil y oculta la pestaña detiene sensores activos', async ({ page }) => {
  await sensors(page)
  await page.goto('/visor'); await ready(page)
  await page.getByRole('button', { name: 'Mirar con el celular', exact: true }).click()
  await point(page, 0)
  await expect(page.getByRole('button', { name: 'Desactivar movimiento', exact: true })).toBeVisible()
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true })
    document.dispatchEvent(new Event('visibilitychange'))
  })
  await expect(page.getByRole('button', { name: 'Mirar con el celular', exact: true })).toHaveAttribute('aria-pressed', 'false')
  expect(await page.evaluate(() => (window as any).__motionTest.listeners.size)).toBe(0)
  await page.addInitScript(() => Object.defineProperty(window, 'DeviceOrientationEvent', { configurable: true, value: undefined }))
  await page.reload(); await ready(page)
  await expect(page.getByRole('button', { name: 'Mirar con el celular', exact: true })).toBeDisabled()
  await expect(page.getByText(/Este navegador no ofrece acceso a los sensores/)).toBeVisible()
})

test('movimiento responde sin demora prolongada y mantiene sensores al cambiar calidad', async ({ page }) => {
  await sensors(page)
  await page.goto('/visor'); await ready(page)
  await page.clock.install()
  await page.getByRole('button', { name: 'Mirar con el celular', exact: true }).click()
  await point(page, 0)
  await point(page, 330, 120)
  await page.clock.runFor(100)
  const moved = await view(page)
  expect(Math.abs(moved.yaw - 30)).toBeLessThan(1.5)
  expect(Math.abs(moved.pitch - 30)).toBeLessThan(1.5)
  // No medir FPS con emulación: esto comprueba la respuesta temporal del filtro.
  await page.clock.resume()
  await page.getByRole('combobox', { name: 'Calidad del panorama' }).selectOption('high')
  await ready(page)
  expect(await page.evaluate(() => (window as any).__motionTest.listeners.size)).toBe(1)
  await point(page, 330, 120)
  await expect(page.getByRole('button', { name: 'Desactivar movimiento', exact: true })).toBeEnabled()
  const centered = await view(page)
  await point(page, 320, 120)
  await expect.poll(async () => Math.abs((await view(page)).yaw - centered.yaw - 10)).toBeLessThan(.2)
  await page.getByRole('button', { name: 'Desmontar visor', exact: true }).click()
  expect(await page.evaluate(() => (window as any).__motionTest.listeners.size)).toBe(0)
})
