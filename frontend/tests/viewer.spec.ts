import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

async function ready(page: Page) {
  await expect(page.locator('.viewer-frame')).toHaveAttribute('data-status', 'ready')
  await expect(page.locator('.panorama canvas')).toHaveCount(1)
}

test('carga sólo la escena activa desde otro origen y navega por hotspots', async ({ page }, testInfo) => {
  const requests: string[] = []
  const errors: string[] = []
  page.on('request', (request) => { if (request.url().includes('/panoramas/')) requests.push(request.url()) })
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto('/visor')
  await ready(page)
  expect(requests.some((url) => url.includes('sala-'))).toBe(false)
  expect(requests.some((url) => url.startsWith('http://127.0.0.1:5175/'))).toBe(true)
  const navigation = page.getByRole('button', { name: 'Ir a Sala de prueba', exact: true })
  await expect(navigation.locator('svg')).toHaveCount(1)
  await expect(navigation.locator('.tour-navigation-label')).toHaveText('Ir a Sala de prueba')
  const marker = (await navigation.boundingBox())!
  expect(marker.width).toBeGreaterThanOrEqual(48)
  expect(marker.height).toBeGreaterThanOrEqual(48)
  await page.screenshot({ path: testInfo.outputPath('visor.png'), fullPage: true })
  await page.getByRole('button', { name: 'Sobre este panorama', exact: true }).click()
  await expect(page.locator('.information')).toContainText('Grilla sintética propia')
  await navigation.locator('.tour-navigation-label').click()
  await ready(page)
  await expect(page.getByRole('heading', { name: 'Sala de prueba', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Volver a Atrio de prueba', exact: true }).click()
  await ready(page)
  await expect(page.getByRole('heading', { name: 'Atrio de prueba', exact: true })).toBeVisible()
  expect(errors).toEqual([])
})

test('clic/tap obtiene grados; arrastre no crea un punto; agrega y quita marcador', async ({ page, isMobile }) => {
  await page.goto('/visor')
  await ready(page)
  await page.getByRole('button', { name: 'Medir coordenadas' }).click()
  const panorama = page.getByTestId('panorama')
  const box = (await panorama.boundingBox())!
  const center = { x: box.x + box.width / 2, y: box.y + box.height / 2 }
  if (isMobile) await page.touchscreen.tap(center.x, center.y)
  else await page.mouse.click(center.x, center.y)
  await expect(page.getByTestId('coordinates')).toHaveText(/Yaw -?0\.\d{2}° · Pitch -?0\.\d{2}°/)
  const selected = await page.getByTestId('coordinates').textContent()
  await page.mouse.move(center.x, center.y)
  await page.mouse.down()
  await page.mouse.move(center.x + 70, center.y + 20, { steps: 8 })
  await page.mouse.up()
  await expect(page.getByTestId('coordinates')).toHaveText(selected!)
  await page.getByRole('button', { name: 'Vista inicial' }).click()
  // El zoom debe cambiar el ángulo correspondiente a un mismo píxel fuera del centro.
  // Las coordenadas son relativas al visor: la barra se desplaza al envolver en móvil.
  // Medir en una zona vacía: las etiquetas de navegación también reciben toques.
  const point = { x: box.width * 0.2, y: box.height * 0.85 }
  await panorama.click({ position: point })
  const beforeZoom = Number((await page.getByTestId('coordinates').textContent())!.match(/Yaw (-?[\d.]+)/)![1])
  await page.getByRole('button', { name: 'Acercar', exact: true }).click()
  await panorama.click({ position: point })
  const afterZoom = Number((await page.getByTestId('coordinates').textContent())!.match(/Yaw (-?[\d.]+)/)![1])
  expect(Math.abs(afterZoom)).toBeLessThan(Math.abs(beforeZoom))
  await page.getByRole('button', { name: 'Vista amplia', exact: true }).click()
  await panorama.click({ position: point })
  const afterWide = Number((await page.getByTestId('coordinates').textContent())!.match(/Yaw (-?[\d.]+)/)![1])
  expect(Math.abs(afterWide)).toBeGreaterThan(Math.abs(afterZoom))
  expect(afterWide).toBeCloseTo(beforeZoom, 1)
  await page.getByRole('button', { name: 'Vista inicial' }).click()
  await panorama.click({ position: { x: box.width / 2, y: box.height / 2 } })
  await page.getByRole('button', { name: 'Mostrar punto' }).click()
  await page.getByRole('button', { name: 'Mostrar punto' }).click()
  await expect(page.getByRole('button', { name: 'Punto de prueba', exact: true })).toHaveCount(1)
  await page.getByRole('button', { name: 'Quitar punto' }).click()
  await expect(page.getByRole('button', { name: 'Punto de prueba', exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: 'Acercar', exact: true }).click()
  await page.getByRole('button', { name: 'Alejar', exact: true }).click()
  await page.setViewportSize({ width: 700, height: 700 })
  await ready(page)
  await expect.poll(async () => {
    const host = await panorama.boundingBox()
    const canvas = await panorama.locator('canvas').boundingBox()
    return Math.abs(host!.width - canvas!.width) + Math.abs(host!.height - canvas!.height)
  }).toBeLessThan(2)
})

test('desmonta durante descarga y remonta sin canvas ni callbacks huérfanos', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.route('**/panoramas/**', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 150))
    await route.continue().catch(() => {})
  })
  await page.goto('/visor')
  await page.getByRole('button', { name: 'Desmontar visor' }).click()
  await expect(page.locator('canvas')).toHaveCount(0)
  for (let i = 0; i < 3; i++) {
    await page.getByRole('button', { name: 'Montar visor' }).click()
    await ready(page)
    await page.getByRole('button', { name: 'Desmontar visor' }).click()
    await expect(page.locator('canvas')).toHaveCount(0)
  }
  expect(errors).toEqual([])
})

test('retira listeners globales y libera contextos WebGL al desmontar', async ({ page }) => {
  await page.addInitScript(() => {
    const counts = { listeners: 0, contexts: 0 }
    Object.defineProperty(window, '__viewerLifecycle', { value: counts })
    const tracked = new Map<EventTarget, Map<string, Set<EventListenerOrEventListenerObject>>>()
    const names = new Set(['mousemove', 'mouseup', 'mouseleave', 'resize', 'orientationchange'])
    const add = EventTarget.prototype.addEventListener
    const remove = EventTarget.prototype.removeEventListener
    EventTarget.prototype.addEventListener = function (type, callback, options) {
      if ((this === window || this === document) && names.has(type) && callback) {
        const events = tracked.get(this) ?? new Map()
        const callbacks = events.get(type) ?? new Set()
        if (!callbacks.has(callback)) counts.listeners++
        callbacks.add(callback); events.set(type, callbacks); tracked.set(this, events)
      }
      add.call(this, type, callback, options)
    }
    EventTarget.prototype.removeEventListener = function (type, callback, options) {
      if (callback && tracked.get(this)?.get(type)?.delete(callback)) counts.listeners--
      remove.call(this, type, callback, options)
    }
    const getContext = HTMLCanvasElement.prototype.getContext
    const seen = new WeakSet<HTMLCanvasElement>()
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, ...args: Parameters<typeof getContext>) {
      const context = getContext.apply(this, args)
      if (String(args[0]) === 'webgl' && context && !seen.has(this)) {
        seen.add(this); counts.contexts++
        this.addEventListener('webglcontextlost', () => { counts.contexts-- }, { once: true })
      }
      return context
    } as typeof getContext
  })
  await page.goto('/visor')
  await ready(page)
  await page.getByRole('button', { name: 'Desmontar visor' }).click()
  await expect.poll(() => page.evaluate(() => (
    window as unknown as { __viewerLifecycle: { listeners: number; contexts: number } }
  ).__viewerLifecycle)).toEqual({ listeners: 0, contexts: 0 })
})

test('selecciona fallback de 2048 cuando la GPU limita las texturas', async ({ page }) => {
  await page.addInitScript(() => {
    const original = WebGLRenderingContext.prototype.getParameter
    WebGLRenderingContext.prototype.getParameter = function (parameter: number) {
      return parameter === this.MAX_TEXTURE_SIZE ? 2048 : original.call(this, parameter)
    }
  })
  await page.goto('/visor')
  await ready(page)
  await page.getByText('Datos de esta prueba').click()
  await expect(page.locator('.diagnostics')).toContainText('2048 × 1024')
})

test('navegación rápida cancela carga anterior y mantiene el último ambiente', async ({ page }) => {
  await page.route('**/panoramas/atrio-*', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 500))
    await route.continue().catch(() => {})
  })
  await page.goto('/visor')
  await page.getByRole('button', { name: 'Sala de prueba', exact: true }).click()
  await ready(page)
  await expect(page.getByRole('button', { name: 'Referencia de orientación', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Sobre este panorama', exact: true })).toHaveCount(0)
})

test('selección de resolución menor carga el derivado de 2048', async ({ page }) => {
  await page.goto('/visor')
  await ready(page)
  await page.getByLabel('Resolución de prueba').selectOption('small')
  await ready(page)
  await page.getByText('Datos de esta prueba').click()
  await expect(page.locator('.diagnostics')).toContainText('2048 × 1024')
})

test('gesto táctil gira y pinch no selecciona un punto', async ({ page, browserName }, testInfo) => {
  test.skip(browserName !== 'chromium' || !testInfo.project.name.startsWith('mobile'), 'Gesto real inyectado mediante CDP Chromium móvil')
  await page.goto('/visor')
  await ready(page)
  await page.getByRole('button', { name: 'Medir coordenadas' }).click()
  const box = (await page.getByTestId('panorama').boundingBox())!
  const x = box.x + box.width / 2
  const y = box.y + box.height / 2
  await page.touchscreen.tap(x, y)
  const original = await page.getByTestId('coordinates').textContent()
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1 }] })
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x + 60, y: y + 20, id: 1 }] })
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  await expect(page.getByTestId('coordinates')).toHaveText(original!)
  await page.touchscreen.tap(x, y)
  await expect(page.getByTestId('coordinates')).not.toHaveText(original!)
  const beforePinch = await page.getByTestId('coordinates').textContent()
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x - 30, y, id: 1 }, { x: x + 30, y, id: 2 }] })
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x - 60, y, id: 1 }, { x: x + 60, y, id: 2 }] })
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  await expect(page.getByTestId('coordinates')).toHaveText(beforePinch!)
  await cdp.detach()
})

test('WebGL no disponible muestra un error comprensible', async ({ page }) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, ...args: Parameters<typeof original>) {
      if (String(args[0]).includes('webgl')) return null
      return original.apply(this, args)
    } as typeof original
  })
  await page.goto('/visor')
  await expect(page.getByRole('alert')).toContainText('WebGL')
  await expect(page.locator('.panorama canvas')).toHaveCount(0)
})

test('CORS denegado falla y permite reintentar', async ({ page }) => {
  await page.route('**/panoramas/**', (route) => route.continue({
    url: route.request().url().replace('/panoramas/', '/no-cors/panoramas/'),
  }))
  await page.goto('/visor')
  await expect(page.getByRole('alert')).toBeVisible()
  await page.unroute('**/panoramas/**')
  await page.getByRole('button', { name: 'Reintentar' }).click()
  await ready(page)
})

test('avanza hacia el hotspot y conserva la imagen durante una descarga lenta', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await page.route('**/panoramas/sala-*', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 650))
    await route.continue().catch(() => {})
  })
  await page.goto('/visor')
  await ready(page)
  await page.locator('.panorama canvas').evaluate((canvas) => { canvas.setAttribute('data-previous', 'true') })
  await page.getByRole('button', { name: 'Ir a Sala de prueba', exact: true }).click()
  await expect(page.getByTestId('panorama')).toHaveAttribute('data-transition', 'departing')
  await expect(page.getByRole('heading', { name: 'Sala de prueba', exact: true })).toBeVisible()
  await expect(page.locator('.viewer-frame')).toHaveAttribute('data-status', 'loading')
  await expect(page.locator('canvas[data-previous="true"]')).toHaveCount(1)
  await ready(page)
  await expect(page.locator('canvas[data-previous="true"]')).toHaveCount(0)
  await expect(page.getByTestId('panorama')).not.toHaveAttribute('data-transition', 'departing')
})

test('una navegación nueva o desmontar cancela el acercamiento pendiente', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await page.goto('/visor')
  await ready(page)
  await page.getByRole('button', { name: 'Ir a Sala de prueba', exact: true }).click()
  await expect(page.getByTestId('panorama')).toHaveAttribute('data-transition', 'departing')
  await page.getByRole('button', { name: 'Sala de prueba', exact: true }).click()
  await page.getByRole('button', { name: 'Atrio de prueba', exact: true }).click()
  await ready(page)
  await page.waitForTimeout(350)
  await expect(page.getByRole('heading', { name: 'Atrio de prueba', exact: true })).toBeVisible()
  // Desmontar dentro del mismo turno: el scroll del runner puede superar los 240 ms.
  await page.getByRole('button', { name: 'Ir a Sala de prueba', exact: true }).evaluate((button) => {
    (button as HTMLButtonElement).click()
    document.querySelector<HTMLButtonElement>('.mount-button')!.click()
  })
  await page.waitForTimeout(350)
  await expect(page.locator('canvas')).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'Atrio de prueba', exact: true })).toBeVisible()
  expect(errors).toEqual([])
})

test('movimiento reducido omite acercamiento y entrada animada', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.addInitScript(() => {
    const transitions: string[] = []
    Object.defineProperty(window, '__transitionStates', { value: transitions })
    new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.attributeName === 'data-transition') transitions.push('movement')
      }
    }).observe(document, { subtree: true, attributes: true, attributeFilter: ['data-transition'] })
  })
  await page.goto('/visor')
  await ready(page)
  await page.getByRole('button', { name: 'Ir a Sala de prueba', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Sala de prueba', exact: true })).toBeVisible()
  await ready(page)
  expect(await page.evaluate(() => (window as unknown as { __transitionStates: string[] }).__transitionStates)).toEqual([])
  expect(await page.locator('.panorama-host').evaluate((host) => host.getAnimations().length)).toBe(0)
})
