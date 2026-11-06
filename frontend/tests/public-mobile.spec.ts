import { expect, test } from '@playwright/test'

test('cambia de ambiente conservando página, controles y canvas del recorrido público', async ({ page }) => {
  let publicationRequests = 0
  await page.route('**/api/v1/public/tours/continuous-tour', (route) => {
    publicationRequests++
    return route.fulfill({ json: {
      schema_version: 1, version: 1, title: 'Visita continua', description: '', start_scene_id: 'living',
      scenes: [
        { id: 'living', name: 'Living', initial_view: { yaw: 0, pitch: 0, hfov: 110 },
          sources: [{ url: 'http://127.0.0.1:5175/panoramas/atrio-2048.png', width: 2048, height: 1024 }],
          hotspots: [{ id: 'ida', type: 'navigation', label: 'Ir a Cocina', target_scene_id: 'kitchen', content: null, yaw: 0, pitch: -10 }] },
        { id: 'kitchen', name: 'Cocina', initial_view: { yaw: 0, pitch: 0, hfov: 110 },
          sources: [{ url: 'http://127.0.0.1:5175/panoramas/sala-2048.png', width: 2048, height: 1024 }],
          hotspots: [{ id: 'vuelta', type: 'navigation', label: 'Volver a Living', target_scene_id: 'living', content: null, yaw: 0, pitch: -10 }] },
      ],
    } })
  })
  await page.route('**/panoramas/sala-2048.png', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 450))
    await route.continue()
  })
  await page.goto('/tour/continuous-tour')
  await expect(page.locator('.viewer-frame')).toHaveAttribute('data-status', 'ready', { timeout: 15_000 })
  const initialRequests = publicationRequests // StrictMode repite el efecto inicial en desarrollo.
  await page.locator('.panorama canvas').evaluate((element) => element.setAttribute('data-persistente', 'true'))
  await page.locator('.viewer-controls').evaluate((element) => element.setAttribute('data-persistente', 'true'))
  const documentNavigations: string[] = []
  page.on('framenavigated', (frame) => { if (frame === page.mainFrame()) documentNavigations.push(frame.url()) })
  for (let round = 0; round < 3; round++) {
    for (const step of [{ button: 'Ir a Cocina', name: 'Cocina' }, { button: 'Volver a Living', name: 'Living' }]) {
      await page.getByRole('button', { name: step.button, exact: true }).click()
      await expect(page.getByRole('heading', { name: step.name, exact: true })).toBeVisible()
      await expect(page.locator('.viewer-frame')).toHaveAttribute('data-status', 'ready', { timeout: 15_000 })
      await expect(page.locator('canvas[data-persistente="true"]')).toHaveCount(1)
      await expect(page.locator('.viewer-controls[data-persistente="true"]')).toHaveCount(1)
      expect(await page.evaluate(() => window.scrollY)).toBe(0)
    }
  }
  expect(publicationRequests).toBe(initialRequests)
  expect(documentNavigations).toEqual([])
})

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
