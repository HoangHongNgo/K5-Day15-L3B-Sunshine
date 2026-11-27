import { chromium, expect } from '@playwright/test'
import assert from 'node:assert/strict'
import sharp from 'sharp'

const browser = await chromium.launch({
  channel: 'chrome',
  headless: true,
  args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
})
const base = process.env.PROTOTYPE_URL || 'http://localhost:5173'
const eventLocation = { latitude: 10, longitude: 20, accuracy: 5 }
const page = await browser.newPage({ permissions: ['geolocation', 'camera'], geolocation: eventLocation, viewport: { width: 390, height: 844 } })
const button = name => page.getByRole('button', { name, exact: true })
try {
  // Exercise the offline organizer flow with synthetic location and camera inputs.
  const uploads = []
  await page.route('**/api/**', async route => {
    const request = route.request()
    if (request.url().endsWith('/photos') && request.method() === 'POST') {
      uploads.push(request.postDataJSON())
      return route.fulfill({ status: 201, json: { id: 'photo-1', status: 'pending' } })
    }
    if (request.url().endsWith('/ask') && request.method() === 'POST') {
      assert.deepEqual(request.postDataJSON(), { question: 'Trạm đầu tiên ở đâu?' })
      return route.fulfill({ json: { answer: 'Hẹn gặp ở sảnh.' } })
    }
    return route.fulfill({ status: 503, json: {} })
  })
  await page.addInitScript(() => {
    const getMedia = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices)
    window.testTracks = []
    // Supply the speech lifecycle on machines without a Vietnamese voice installed.
    Object.defineProperty(window, 'speechSynthesis', { value: {
      speak: utterance => utterance.onstart?.(new Event('start')), cancel() {},
    } })
    navigator.mediaDevices.getUserMedia = async constraints => {
      const media = await getMedia(constraints)
      window.testTracks.push(...media.getTracks())
      return media
    }
  })
  await page.goto(base + '/clb/su-kien/moi')
  await button('Đặt điểm gặp tại vị trí hiện tại').click()
  await expect(page.getByLabel('Vĩ độ điểm gặp')).toHaveValue('10')
  await expect(page.getByLabel('Kinh độ điểm gặp')).toHaveValue('20')
  await page.getByLabel('Tên sự kiện', { exact: true }).fill('Sự kiện minh hoạ')
  await page.getByLabel('Câu lạc bộ / đơn vị tổ chức').fill('CLB mẫu')
  await page.getByLabel('Mô tả', { exact: true }).fill('Hẹn gặp ở sảnh.')
  await page.getByLabel('Bắt đầu', { exact: true }).fill('2026-12-02T14:00')
  await page.getByLabel('Kết thúc', { exact: true }).fill('2026-12-02T16:00')
  await page.getByLabel('Địa điểm chính tại VinUni').selectOption({ index: 1 })
  await button('Đăng thử sự kiện').click()
  await expect(button('Gặp mascot trong AR')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Album sự kiện' })).toBeVisible()
  const detail = page.url()
  await page.getByRole('link', { name: 'Dẫn đường tới sự kiện' }).click()
  await expect(page.locator('[data-mascot="vini"]').first()).toBeVisible()
  await page.goto(detail)
  await button('Gặp mascot trong AR').click()
  await expect(button('Đóng trải nghiệm AR')).toBeVisible()

  const check = button('Kiểm tra vị trí')
  await page.evaluate(() => {
    const location = navigator.geolocation
    const getPosition = location.getCurrentPosition.bind(location)
    location.getCurrentPosition = (_, reject) => { location.getCurrentPosition = getPosition; reject({ code: 1 }) }
  })
  await check.click()
  await expect(page.getByText(/Bạn chưa cho phép truy cập vị trí/)).toBeVisible()
  await page.context().setGeolocation({ ...eventLocation, longitude: 19 })
  await check.click()
  await expect(page.getByText(/Bạn cách điểm gặp khoảng/)).toBeVisible()
  await page.context().setGeolocation({ ...eventLocation, accuracy: 200 })
  await check.click()
  await expect(page.getByText(/Tín hiệu GPS chưa đủ chính xác/)).toBeVisible()
  await expect(page.locator('.encounter-camera video')).toHaveCount(0)
  await page.context().setGeolocation(eventLocation)
  await check.click()
  await page.evaluate(() => {
    const getMedia = navigator.mediaDevices.getUserMedia
    navigator.mediaDevices.getUserMedia = () => {
      navigator.mediaDevices.getUserMedia = getMedia
      return Promise.reject(new DOMException('Denied', 'NotAllowedError'))
    }
  })
  await button('Mở camera AR').click()
  await expect(page.getByText(/Bạn chưa cấp quyền camera/)).toBeVisible()
  await button('Đóng camera').click()
  await check.click()
  await button('Mở camera AR').click()

  const placement = page.getByRole('button', { name: /Đặt .* trong khung hình/ })
  await placement.click({ position: { x: 105, y: 190 } })
  // Hide only the moving video while comparing snapshots of the real 3D canvas.
  const stillCamera = await page.addStyleTag({ content: '.encounter-viewport video {visibility:hidden}' })
  const canvas = page.locator('.encounter-viewport canvas')
  async function mascotPixels() {
    const snapshot = sharp(await canvas.screenshot())
    const { width, height } = await snapshot.metadata()
    // The mobile app's fixed navigation can overlap the very bottom of this screenshot.
    return snapshot.extract({ left: 0, top: 0, width, height: Math.floor(height * .7) }).raw().toBuffer()
  }
  const slider = page.getByRole('slider', { name: 'Kích thước mascot' })
  await expect(slider).toHaveValue('100')
  const initial = await mascotPixels()
  await slider.focus()
  await slider.press('End')
  await expect(slider).toHaveValue('140')
  await expect.poll(async () => initial.equals(await mascotPixels())).toBe(false)
  await slider.press('Home')
  await expect(slider).toHaveValue('60')
  for (let i = 0; i < 4; i++) await slider.press('ArrowRight')
  await expect(slider).toHaveValue('100')
  const rest = await mascotPixels()
  for (const name of ['Vẫy tay', 'Nhảy', 'Nhảy múa']) {
    await button(name).click()
    await expect.poll(async () => rest.equals(await mascotPixels())).toBe(false)
    await expect.poll(async () => rest.equals(await mascotPixels())).toBe(true)
  }
  await button('Nói chuyện').click()
  await page.getByLabel('Câu hỏi về sự kiện').fill('Trạm đầu tiên ở đâu?')
  await button('Gửi câu hỏi').click()
  await expect(button('Dừng đọc')).toBeVisible()
  await expect.poll(async () => rest.equals(await mascotPixels())).toBe(false)
  await button('Vẫy tay').click()
  await expect.poll(async () => rest.equals(await mascotPixels())).toBe(false)
  await stillCamera.evaluate(el => el.remove())
  await button('Đổi camera').click()
  await expect.poll(() => page.evaluate(() => window.testTracks.length)).toBe(2)
  await placement.click()
  await page.getByRole('button', { name: /Chụp ảnh cùng/ }).click()
  const preview = page.getByRole('img', { name: /Ảnh vừa chụp/ })
  await expect(preview).toBeVisible()
  const photo = await preview.getAttribute('src')
  assert.ok(photo.startsWith('data:image/jpeg;base64,') && photo.length > 6000)
  assert.equal(await page.evaluate(() => window.testTracks.filter(t => t.readyState === 'live').length), 0)
  assert.equal(uploads.length, 0)
  const submit = button('Gửi ảnh cho CLB')
  await expect(submit).toBeDisabled()
  await page.getByRole('checkbox', { name: /Tôi đồng ý/ }).check()
  await submit.click()
  await expect(page.getByText(/Đã gửi ảnh cho CLB/)).toBeVisible()
  assert.deepEqual(uploads, [{ image: photo }])
  console.log('Verified organizer placement, Vini navigation, GPS gating, camera denial, 3D actions, camera flip, photo consent and cleanup.')
} finally { await browser.close() }
