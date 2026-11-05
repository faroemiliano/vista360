import { expect, test } from '@playwright/test'

test('recorrido público muestra controles de movimiento sin desplazar el panorama', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'maxTouchPoints', { configurable: true, get: () => 1 })
    Object.defineProperty(DeviceOrientationEvent, 'requestPermission', { configurable: true, value: () => Promise.resolve('granted') })
  })
  await page.route('**/api/v1/public/tours/mobile-controls', (route) => route.fulfill({ json: {
    schema_version: 1, version: 1, title: 'Recorrido de prueba', description: '', start_scene_id: 'living',
    scenes: [{ id: 'living', name: 'Living', initial_view: { yaw: 0, pitch: 0, hfov: 110 }, hotspots: [],
      sources: [{ url: 'http://127.0.0.1:5175/panoramas/atrio-2048.png', width: 2048, height: 1024 }] }],
  } }))
  await page.goto('/tour/mobile-controls')
  await expect(page.locator('.viewer-frame')).toHaveAttribute('data-status', 'ready', { timeout: 15_000 })
  for (const viewport of [{ width: 393, height: 851 }, { width: 844, height: 390 }]) {
    await page.setViewportSize(viewport)
    await page.evaluate(() => window.scrollTo(0, 0))
    const motion = page.getByRole('button', { name: 'Mirar con el celular', exact: true })
    await expect(motion).toBeInViewport({ ratio: 1 })
    await expect(page.getByRole('button', { name: 'Acercar', exact: true })).toBeInViewport({ ratio: 1 })
    const button = (await motion.boundingBox())!
    expect(await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.closest('button')?.textContent,
      { x: button.x + button.width / 2, y: button.y + button.height / 2 })).toBe('Mirar con el celular')
    await motion.click()
    await expect.poll(() => page.evaluate(() => {
      window.dispatchEvent(new DeviceOrientationEvent('deviceorientation', { alpha: 0, beta: 90, gamma: 0 }))
      return document.querySelector('[aria-pressed="true"]')?.textContent
    })).toBe('Desactivar movimiento')
    await expect(page.getByRole('button', { name: 'Centrar movimiento', exact: true })).toBeInViewport({ ratio: 1 })
    const frame = (await page.locator('.viewer-frame').boundingBox())!
    expect(frame.y + frame.height).toBeLessThanOrEqual(viewport.height)
    expect(frame.height).toBeGreaterThan(viewport.height * (viewport.height < 500 ? 0.55 : 0.7))
    await page.getByRole('button', { name: 'Desactivar movimiento', exact: true }).click()
    // El área de controles permite acceder al contenido inferior sin arrastrar la foto.
    await page.locator('.viewer-controls').hover()
    await page.mouse.wheel(0, 400)
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  }
})
