import assert from 'node:assert/strict'
import { chromium, expect } from '@playwright/test'

const browser = await chromium.launch({
  channel: 'chrome',
  args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'],
})
const baseURL = process.env.PROTOTYPE_URL || 'http://127.0.0.1:5174'
try {
  const page = await browser.newPage({ baseURL, viewport: { width: 390, height: 844 }, permissions: ['camera'] })
  await page.route('**/api/**', route => route.fulfill({ status: 503, json: {} }))
  await page.route('**/api/destinations', route => route.fulfill({ json: {
    rooms: [{ id: 'test', name: 'Hành lang thử' }, { id: 'room', name: 'Phòng thử' }], outdoorGeo: false,
  } }))
  await page.route('**/api/health', route => route.fulfill({ json: { ok: true, indexSize: 1 } }))
  const located = { label: 'Hành lang thử', spot: 'test', confidence: .9, ms: 123, top3: [], combined: false, photoId: 'test-photo' }
  let tier = 'auto'
  let photos = 0
  const corrections = []
  await page.route('**/api/locate', route => {
    photos++
    assert.ok(route.request().postDataBuffer().length > 100)
    const top3 = tier === 'picker' ? [{ spot: 'test', label: 'Hành lang thử', confidence: .6 }] : []
    return route.fulfill({ json: { ...located, tier, top3 } })
  })
  await page.route('**/api/correct', route => {
    corrections.push(route.request().postDataJSON())
    return route.fulfill({ json: { ok: true, indexSize: 1 } })
  })
  await page.addInitScript(() => {
    const getUserMedia = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices)
    window.locationTracks = []
    navigator.mediaDevices.getUserMedia = async options => {
      const stream = await getUserMedia(options)
      window.locationTracks.push(...stream.getTracks())
      return stream
    }
  })
  const shutter = page.getByRole('button', { name: 'Chụp để định vị' })
  const tracksStopped = () => page.evaluate(() => window.locationTracks.length > 0 &&
    window.locationTracks.every(track => track.readyState === 'ended'))

  await page.goto('/anh')
  await expect(shutter).toBeEnabled()
  await expect(page.getByText('Hướng camera về hành lang hoặc biển phòng')).toBeVisible()
  await shutter.click()
  await expect(page).toHaveURL(/\/di-den\?from=test&fromLabel=/)
  assert.equal(photos, 1)
  assert.equal(corrections.length, 0)
  await expect.poll(tracksStopped).toBe(true)

  tier = 'picker'
  await page.goto('/anh')
  await shutter.click()
  const candidates = page.getByRole('group', { name: 'Bạn đang ở đâu?' })
  await expect(candidates).toBeVisible()
  assert.equal(corrections.length, 0)
  await candidates.getByRole('button', { name: 'Hành lang thử' }).click()
  await expect(page).toHaveURL(/\/di-den\?from=test&fromLabel=/)
  await expect.poll(() => corrections).toEqual([{ photoId: 'test-photo', trueSpot: 'test' }])
  await expect.poll(tracksStopped).toBe(true)

  await page.goto('/anh?to=room')
  await expect(shutter).toBeEnabled()
  await page.getByRole('link', { name: 'Chọn bằng tên phòng' }).click()
  await expect(page).toHaveURL(/\/vi-tri\?to=room$/)
  await expect.poll(tracksStopped).toBe(true)
  assert.equal(photos, 2)

  await page.goto('/anh')
  await expect(shutter).toBeEnabled()
  await expect(page.locator('.site-header')).toHaveCount(0)
  await expect(page.locator('.bottom-nav')).toHaveCount(0)
  await expect(page.getByRole('link', { name: 'Dùng ảnh mẫu' })).toHaveCount(0)
  await page.goto('/')
  await expect(page.getByRole('link', { name: 'Thử ảnh mẫu' })).toHaveCount(0)
  console.log('Đã kiểm tra camera định vị, xác nhận vị trí, chọn phòng thủ công và giải phóng camera.')
} finally {
  await browser.close()
}
