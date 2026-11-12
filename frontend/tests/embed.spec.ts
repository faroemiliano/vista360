import { expect, test } from '@playwright/test'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'

test('recorrido insertado funciona desde otra web sin marca, contacto ni sesión', async ({ page }, testInfo) => {
  await page.addInitScript(() => {
    Object.defineProperty(DeviceOrientationEvent, 'requestPermission', { configurable: true, value: () => Promise.resolve('granted') })
  })
  const title = 'Hotel Mar · Suite principal'
  const requests: string[] = []
  page.on('request', request => { if (request.url().includes('/api/v1/')) requests.push(request.url()) })
  await page.route('**/api/v1/public/tours/hotel-demo', route => route.fulfill({ json: {
    schema_version: 1, version: 1, title, description: 'Descripción del hotel', start_scene_id: 'living',
    scenes: [
      { id: 'living', name: 'Living', initial_view: { yaw: 0, pitch: 0, hfov: 110 },
        sources: [{ url: 'http://127.0.0.1:5175/panoramas/atrio-2048.png', width: 2048, height: 1024 }],
        hotspots: [{ id: 'ida', type: 'navigation', label: 'Entrar a la suite', yaw: 0, pitch: -10, target_scene_id: 'suite', content: null }] },
      { id: 'suite', name: 'Suite', initial_view: { yaw: 0, pitch: 0, hfov: 110 },
        sources: [{ url: 'http://127.0.0.1:5175/panoramas/sala-2048.png', width: 2048, height: 1024 }],
        hotspots: [{ id: 'info', type: 'info', label: 'Servicios de la suite', yaw: 0, pitch: -10, target_scene_id: null, content: { text: 'Desayuno incluido' } }] },
    ],
  } }))
  // Un servidor real conserva la clasificación de red local de Chromium.
  // El puerto diferente prueba una integración entre orígenes distintos.
  const parent = createServer((_request, response) => {
    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
    response.end(`<!doctype html><html lang="es"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Hotel Mar</title><body style="margin:0;background:#fff;color:#172033;font-family:system-ui"><header style="padding:20px"><b>HOTEL MAR</b><p>Conocé nuestros espacios antes de tu llegada.</p></header><iframe title="Visita del hotel" src="http://127.0.0.1:5176/embed/hotel-demo" allow="fullscreen; accelerometer; gyroscope" allowfullscreen style="display:block;width:100%;height:480px;border:0"></iframe></body></html>`)
  })
  await new Promise<void>(resolve => parent.listen(0, '127.0.0.1', resolve))
  try {
    await page.goto(`http://127.0.0.1:${(parent.address() as AddressInfo).port}/hotel-demo`)
    const frame = page.frameLocator('iframe')
    await expect(frame.locator('.viewer-frame')).toHaveAttribute('data-status', 'ready', { timeout: 15000 })
    await expect(frame.getByRole('heading', { name: title, exact: true })).toBeVisible()
    if (testInfo.project.name.includes('mobile')) {
      await frame.getByRole('button', { name: 'Mirar con el celular', exact: true }).click()
      await expect.poll(() => frame.locator('body').evaluate(() => {
        window.dispatchEvent(new DeviceOrientationEvent('deviceorientation', { alpha: 0, beta: 90, gamma: 0 }))
        return document.querySelector('[aria-pressed="true"]')?.textContent
      })).toBe('Desactivar movimiento')
      await frame.getByRole('button', { name: 'Desactivar movimiento', exact: true }).click()
    }
    await expect(frame.getByRole('link', { name: /Vision360/ })).toHaveCount(0)
    await expect(frame.locator('a[href*="wa.me"]')).toHaveCount(0)
    await expect(frame.getByText('Descripción del hotel', { exact: true })).toHaveCount(0)
    await frame.locator('canvas').evaluate(element => element.setAttribute('data-persistente', 'true'))
    await frame.getByRole('button', { name: 'Entrar a la suite', exact: true }).click()
    await expect(frame.getByLabel('Ambiente', { exact: true })).toHaveValue('suite')
    await expect(frame.locator('.viewer-frame')).toHaveAttribute('data-status', 'ready')
    await expect(frame.locator('canvas[data-persistente="true"]')).toHaveCount(1)
    await frame.getByRole('button', { name: 'Servicios de la suite', exact: true }).click()
    await expect(frame.getByText('Desayuno incluido', { exact: true })).toBeVisible()
    await frame.getByRole('button', { name: 'Cerrar información', exact: true }).click()
    await frame.getByLabel('Ambiente', { exact: true }).selectOption('living')
    await expect(frame.locator('.viewer-frame')).toHaveAttribute('data-status', 'ready')
    await frame.getByRole('button', { name: 'Acercar', exact: true }).click()
    expect(await frame.locator('main').evaluate(element => element.scrollWidth <= innerWidth && element.scrollHeight <= innerHeight + 1)).toBe(true)
    const fullscreen = frame.getByRole('button', { name: 'Pantalla completa', exact: true })
    if (await fullscreen.count()) {
      await fullscreen.click()
      await expect(frame.getByRole('button', { name: 'Salir de pantalla completa', exact: true })).toBeVisible()
      await frame.getByRole('button', { name: 'Salir de pantalla completa', exact: true }).click()
      await expect(fullscreen).toBeVisible()
    }
    await frame.getByRole('combobox', { name: 'Idioma', exact: true }).selectOption('pt-BR')
    await expect(frame.getByRole('button', { name: 'Aproximar', exact: true })).toBeVisible()
    await expect(frame.locator('canvas[data-persistente="true"]')).toHaveCount(1)
    expect(requests.length).toBeGreaterThan(0)
    expect(requests.every(url => url.includes('/api/v1/public/'))).toBe(true)
    await page.screenshot({ path: testInfo.outputPath('recorrido-en-web-hotel.png'), fullPage: true })
  } finally {
    parent.closeAllConnections()
    await new Promise<void>((resolve, reject) => parent.close(error => error ? reject(error) : resolve()))
  }
})

test('recorrido insertado despublicado muestra un error y no abre el estudio', async ({ page }) => {
  await page.route('**/api/v1/public/tours/unavailable-demo', route => route.fulfill({ status: 404, json: { detail: 'Recorrido no disponible' } }))
  await page.goto('/embed/unavailable-demo')
  await expect(page.getByRole('heading', { name: 'Recorrido no disponible', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Reintentar recorrido', exact: true })).toBeVisible()
  await expect(page.locator('a[href*="wa.me"]')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Ingresar', exact: true })).toHaveCount(0)
})
