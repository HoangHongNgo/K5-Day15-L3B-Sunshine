import { chromium, expect } from '@playwright/test'
import assert from 'node:assert/strict'

const baseURL = process.env.BASE_URL || 'http://localhost:5174'
const browser = await chromium.launch({
  channel: 'chrome',
  args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'],
})
try {
  const page = await browser.newPage({ baseURL, viewport: { width: 390, height: 844 } })
  await page.route('**/api/destinations', route => route.fulfill({ json: {
    rooms: [{ id: 'a', name: 'Sảnh thử' }, { id: 'b', name: 'Phòng thử' }], outdoorGeo: false,
  } }))
  const steps = ['Hành lang thử', 'Phòng thử'].map((label, i) => ({
    kind: 'walk', text: i ? 'Rẽ phải tại cửa.' : 'Đi thẳng qua sảnh.',
    meters: 12 + i, approx: true, mapKind: 'indoor', building: 'Khu thử', passes: [], side: null,
    target: { node: String(i), label, lat: null, lng: null },
  }))
  await page.route('**/api/route?**', route => route.fulfill({ json: {
    start: 'Sảnh thử', destination: 'Phòng thử', steps, totalMeters: 25, estSeconds: 40,
  } }))
  let photos = 0
  await page.route('**/api/locate', route => {
    photos++
    assert.ok(route.request().postDataBuffer().length > 100)
    return route.fulfill({ json: { tier: 'auto', label: 'Sảnh thử' } })
  })
  await page.addInitScript(() => {
    const original = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices)
    window.streams = []
    navigator.mediaDevices.getUserMedia = async constraints => {
      if (window.denyCamera) throw new DOMException('denied', 'NotAllowedError')
      const stream = await original(constraints)
      window.streams.push(stream)
      return stream
    }
  })
  const button = name => page.getByRole('button', { name, exact: true })
  const allStopped = () => page.evaluate(() => window.streams.every(s => s.getTracks().every(t => t.readyState === 'ended')))
  await page.goto('/di-den?from=a&to=b')
  await expect(button('Bắt đầu với camera')).toBeEnabled({ timeout: 3000 })
  await button('Thẻ chỉ đường').click()
  await button('Xem hành trình').click()
  await expect(page.getByRole('heading', { name: 'Đi thẳng', exact: true })).toBeVisible()
  assert.equal(await page.evaluate(() => window.streams.length), 0)
  await button('Camera').click()
  await expect.poll(() => page.locator('video').evaluate(v => v.videoWidth)).toBeGreaterThan(0)
  await expect(page.locator('.site-header')).toBeHidden()
  await expect(page.locator('.bottom-nav')).toBeHidden()
  await expect(page.getByText('Đi thẳng qua sảnh.', { exact: true })).toBeVisible()
  await button('Xem các mốc').click()
  await expect(page.getByRole('list')).toContainText('Hành lang thử')
  await button('Thu gọn các mốc').click()
  if (process.env.SCREENSHOT) await page.screenshot({ path: process.env.SCREENSHOT })
  assert.equal(photos, 0)
  await button('Định vị lại').click()
  await expect(page.getByRole('status')).toContainText('Sảnh thử')
  assert.equal(photos, 1)
  await button('Đã tới mốc').click()
  await expect(page.getByText('Rẽ phải tại cửa.', { exact: true })).toBeVisible()
  await button('Thẻ chỉ đường').click()
  await expect.poll(allStopped).toBe(true)
  await expect(page.getByRole('heading', { name: 'Rẽ phải', exact: true })).toBeVisible()
  await page.evaluate(() => { window.denyCamera = true })
  await button('Camera').click()
  await expect(page.getByText(/chưa được cấp quyền/i)).toBeVisible()
  await button('Thẻ chỉ đường').click()
  await button('Đã xong chặng này').click()
  await expect(page.getByRole('heading', { name: 'Tới nơi rồi!' })).toBeVisible()

  await page.goto('/di-den?from=a&to=b')
  if (await button('Camera').count()) await button('Camera').click()
  await button('Bắt đầu với camera').click()
  await expect.poll(() => page.locator('video').evaluate(v => v.videoWidth)).toBeGreaterThan(0)
  await button('Đã tới mốc').click()
  await button('Đã tới mốc').click()
  await expect(page.getByRole('heading', { name: 'Tới nơi rồi!' })).toBeVisible()
  await expect.poll(allStopped).toBe(true)
  await page.goto('/di-den')
  await expect(page.getByRole('button', { name: /Dừng chuyển động|Bật chuyển động|Cài VinUni AR Map/ })).toHaveCount(0)
  await page.getByLabel('Điểm xuất phát', { exact: true }).selectOption('a')
  await expect(page.locator('video')).toHaveCount(0)
  await page.getByLabel('Điểm đến', { exact: true }).selectOption('b')
  await expect(page.locator('video')).toBeVisible({ timeout: 1800 })
  console.log('Đã kiểm tra Camera, Thẻ, ảnh định vị, tiến độ, từ chối quyền và giải phóng camera trên màn hình 390 px.')
} finally {
  await browser.close()
}
