import { expect } from '@playwright/test'
import type { Locator, Page, Request, TestInfo } from '@playwright/test'

export async function chooseHotspotPosition(page: Page, editor: Locator, testInfo: TestInfo) {
  const panorama = editor.getByTestId('panorama')
  const marker = editor.getByRole('img', { name: 'Ubicación del punto sin guardar', exact: true })
  const writes: string[] = []
  const watch = (request: Request) => {
    if (request.method() !== 'GET' && request.url().includes('/hotspots')) writes.push(request.method())
  }
  page.on('request', watch)
  try {
    await editor.getByRole('button', { name: 'Ubicar punto', exact: true }).click()
    const box = (await panorama.boundingBox())!
    async function place(x: number, y: number) {
      if (testInfo.project.name.includes('mobile')) await panorama.tap({ position: { x, y } })
      else await panorama.click({ position: { x, y } })
      await expect(marker).toBeVisible()
      await expect(marker).toHaveCount(1)
      await expect.poll(async () => {
        const image = (await panorama.boundingBox())!, pin = (await marker.boundingBox())!
        return Math.abs(pin.x + pin.width / 2 - image.x - x) + Math.abs(pin.y + pin.height / 2 - image.y - y)
      }).toBeLessThan(5)
    }
    await place(box.width * .35, box.height * .55)
    const yaw = editor.getByLabel('Yaw del punto (°)', { exact: true })
    const pitch = editor.getByLabel('Pitch del punto (°)', { exact: true })
    const first = await yaw.inputValue()
    await expect(editor.getByRole('button', { name: 'Ubicar punto', exact: true })).toHaveAttribute('aria-pressed', 'true')
    await place(box.width * .65, box.height * .45)
    expect(await yaw.inputValue()).not.toBe(first)
    const selected = { yaw: Number(await yaw.inputValue()), pitch: Number(await pitch.inputValue()) }
    await panorama.scrollIntoViewIfNeeded()
    const frame = (await panorama.boundingBox())!
    await page.mouse.move(frame.x + frame.width * .5, frame.y + frame.height * .7)
    await page.mouse.down()
    await page.mouse.move(frame.x + frame.width * .6, frame.y + frame.height * .7, { steps: 8 })
    await page.mouse.up()
    expect(Number(await yaw.inputValue())).toBe(selected.yaw)
    expect(Number(await pitch.inputValue())).toBe(selected.pitch)
    expect(writes).toEqual([])
    await expect(editor.locator('canvas[data-persistente="true"]')).toHaveCount(1)
    await editor.getByRole('button', { name: 'Vista inicial', exact: true }).click()
    await panorama.scrollIntoViewIfNeeded()
    await page.screenshot({ path: testInfo.outputPath('marca-provisional-conexion.png') })
    return selected
  } finally { page.off('request', watch) }
}
