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
const page = await browser.newPage({ permissions: ['geolocation', 'camera', 'microphone'], geolocation: eventLocation, viewport: { width: 390, height: 844 } })
const button = name => page.getByRole('button', { name, exact: true })

function boxesOverlap(a, b) {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y
}

function insideViewport(box, width, height) {
  return box.x >= 0 && box.y >= 0 && box.x + box.width <= width + 1 && box.y + box.height <= height + 1
}

try {
  // Exercise the offline organizer flow with synthetic location, WebXR, voice and camera inputs.
  const uploads = []
  const questions = []
  const directionsAsked = []
  let transcriptions = 0
  await page.route('**/api/**', async route => {
    const request = route.request()
    if (request.url().endsWith('/photos') && request.method() === 'POST') {
      uploads.push(request.postDataJSON())
      return route.fulfill({ status: 201, json: { id: 'photo-1', status: 'pending' } })
    }
    if (request.url().endsWith('/transcribe') && request.method() === 'POST') {
      assert.equal(request.headers()['content-type'], 'audio/wav')
      const wav = request.postDataBuffer()
      assert.ok(wav.length > 44)
      assert.equal(wav.toString('ascii', 0, 4), 'RIFF')
      assert.equal(wav.toString('ascii', 8, 12), 'WAVE')
      assert.equal(wav.readUInt16LE(22), 1)
      assert.equal(wav.readUInt32LE(24), 16000)
      assert.equal(wav.readUInt16LE(34), 16)
      transcriptions++
      return route.fulfill({ json: { transcript: 'Sự kiện bắt đầu lúc mấy giờ?' } })
    }
    const url = new URL(request.url())
    if (url.pathname === '/api/locate' && request.method() === 'POST') {
      return route.fulfill({ json: { photoId: 'p_0123456789ab', spot: 'g101_door', tier: 'auto', label: 'Phòng G101' } })
    }
    if (url.pathname === '/api/voice/directions' && request.method() === 'POST') {
      assert.equal(url.searchParams.get('voice'), '1')
      directionsAsked.push(request.postDataJSON())
      return route.fulfill({ json: {
        answer: 'Từ Phòng G101, đi dọc hành lang đến Phòng G106.',
        audioBase64: 'SUQzBAAAAAAA',
        route: { startId: 'g101_door', startLabel: 'Phòng G101', destinationId: 'G106' },
      } })
    }
    if (url.pathname.endsWith('/ask') && request.method() === 'POST') {
      assert.equal(url.searchParams.get('voice'), '1')
      questions.push(request.postDataJSON())
      return route.fulfill({ json: { answer: 'Hẹn gặp ở sảnh.', audioBase64: 'SUQzBAAAAAAA' } })
    }
    return route.fulfill({ status: 503, json: {} })
  })
  await page.addInitScript(() => {
    const getMedia = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices)
    window.testTracks = []
    window.answerAudioPlays = 0
    Object.defineProperty(window, 'speechSynthesis', { value: {
      speak: () => { throw new Error('The event must play the Vietnamese recording') }, cancel() {},
    } })
    window.Audio = class extends EventTarget {
      constructor(src = '') { super(); this.src = src }
      async play() {
        window.answerAudioPlays++
        for (const name of ['play', 'playing']) {
          const event = new Event(name)
          this.dispatchEvent(event)
          this['on' + name]?.(event)
        }
      }
      pause() {}
      load() {}
      removeAttribute(name) { if (name === 'src') this.src = '' }
    }
    // Expose WebXR support with a rejecting session so we verify native AR stays on the unlocked surface and survives rejection.
    Object.defineProperty(navigator, 'xr', {
      configurable: true,
      value: {
        isSessionSupported: async mode => mode === 'immersive-ar',
        requestSession: async () => { throw new Error('ARCore unavailable in headless test') },
      },
    })
    navigator.mediaDevices.getUserMedia = async constraints => {
      const media = await getMedia(constraints)
      window.testTracks.push(...media.getTracks())
      return media
    }
  })

  const liveTracks = kind => page.evaluate(k => window.testTracks.filter(t => (!k || t.kind === k) && t.readyState === 'live').length, kind)

  await page.goto(base + '/clb/su-kien/moi')
  await page.getByLabel('Địa điểm chính tại VinUni').selectOption({ index: 1 })
  await button('Đặt điểm gặp tại vị trí hiện tại').click()
  await expect(page.getByLabel('Vĩ độ điểm gặp')).toHaveValue('10')
  await expect(page.getByLabel('Kinh độ điểm gặp')).toHaveValue('20')
  await page.getByLabel('Tên sự kiện', { exact: true }).fill('Sự kiện minh hoạ')
  await page.getByLabel('Câu lạc bộ / đơn vị tổ chức').fill('CLB mẫu')
  await page.getByLabel('Mô tả', { exact: true }).fill('Hẹn gặp ở sảnh.')
  await page.getByLabel('Bắt đầu', { exact: true }).fill('2026-12-02T14:00')
  await page.getByLabel('Kết thúc', { exact: true }).fill('2026-12-02T16:00')
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
  // A rejected native AR session keeps both actions available on the unlocked event.
  const nativeAr = button('Gặp Tia trong AR')
  const plainCamera = button('Chụp ảnh gửi album CLB')
  await expect(nativeAr).toBeVisible()
  await expect(plainCamera).toBeVisible()
  await nativeAr.click()
  await expect(page.getByText(/Thiết bị chưa mở được AR/)).toBeVisible()
  await expect(plainCamera).toBeVisible()

  await page.evaluate(() => {
    const getMedia = navigator.mediaDevices.getUserMedia
    navigator.mediaDevices.getUserMedia = () => {
      navigator.mediaDevices.getUserMedia = getMedia
      return Promise.reject(new DOMException('Denied', 'NotAllowedError'))
    }
  })
  await plainCamera.click()
  await expect(page.getByText(/Bạn chưa cấp quyền camera/)).toBeVisible()
  await button('Đóng camera').click()
  await check.click()
  await plainCamera.click()

  const dialog = page.getByRole('dialog', { name: 'Chụp ảnh cùng mascot' })
  await expect(dialog).toBeVisible()
  // No duplicate Native AR button inside fullscreen EncounterCamera.
  await expect(dialog.getByRole('button', { name: 'Gặp Tia trong AR', exact: true })).toHaveCount(0)

  const placement = dialog.getByRole('button', { name: /Đặt .* trong khung hình/ })
  const shutter = dialog.getByRole('button', { name: /Chụp ảnh cùng/ })
  const talkBtn = dialog.getByRole('button', { name: 'Nói chuyện', exact: true })
  const adjustBtn = dialog.getByRole('button', { name: 'Tùy chỉnh mascot', exact: true })

  // Capture must be guarded before placement and show an actionable Vietnamese hint.
  await expect(placement).toBeVisible()
  await expect(shutter).toBeDisabled()
  await expect(dialog.getByText(/chạm vào khung hình để đặt Tia/i)).toBeVisible()

  // Direct 'Nói chuyện' control must be reachable on the ready camera bar without opening settings, and not overlap at 390x844.
  await expect(talkBtn).toBeEnabled()
  await expect(adjustBtn).toBeEnabled()
  const portraitTalk = await talkBtn.boundingBox()
  const portraitShutter = await shutter.boundingBox()
  const portraitAdjust = await adjustBtn.boundingBox()
  assert.ok(insideViewport(portraitTalk, 390, 844))
  assert.ok(insideViewport(portraitShutter, 390, 844))
  assert.ok(insideViewport(portraitAdjust, 390, 844))
  assert.equal(boxesOverlap(portraitTalk, portraitShutter), false)
  assert.equal(boxesOverlap(portraitShutter, portraitAdjust), false)

  const frame = await page.locator('.encounter-viewport').boundingBox()
  assert.deepEqual(frame, { x: 0, y: 0, width: 390, height: 844 })
  await placement.click({ position: { x: 105, y: 190 } })
  await expect(shutter).toBeEnabled()
  await expect(dialog.getByText(/chạm vào khung hình để đặt Tia/i)).toHaveCount(0)

  // One-tap Nói chuyện from ready camera: typed ask, voice transcribe->ask, cancel mic, and cleanup on panel switch.
  await talkBtn.click()
  await expect(page.getByLabel('Câu hỏi về sự kiện')).toBeVisible()
  await page.getByLabel('Câu hỏi về sự kiện').fill('Trạm đầu tiên ở đâu?')
  await button('Gửi câu hỏi').click()
  await expect(button('Dừng đọc')).toBeVisible()
  await button('Dừng đọc').click()
  await button('Nghe lại').click()
  await expect(button('Dừng đọc')).toBeVisible()
  assert.equal(await page.evaluate(() => window.answerAudioPlays), 2)

  await button('Nói').click()
  await expect.poll(() => liveTracks('audio')).toBe(1)
  await expect(button('Nghe lại')).toBeDisabled()
  await page.waitForTimeout(350)
  await button('Dừng và hỏi').click()
  await expect(page.getByLabel('Câu hỏi về sự kiện')).toHaveValue('Sự kiện bắt đầu lúc mấy giờ?')
  await expect(button('Dừng đọc')).toBeVisible()
  assert.equal(await page.evaluate(() => window.answerAudioPlays), 3)
  assert.equal(transcriptions, 1)
  assert.deepEqual(questions, [{ question: 'Trạm đầu tiên ở đâu?' }, { question: 'Sự kiện bắt đầu lúc mấy giờ?' }])
  assert.equal(await liveTracks('audio'), 0)

  await button('Chỉ đường').click()
  await button('Dùng ảnh xung quanh').click()
  await expect(page.getByText('Ảnh nhận diện: Phòng G101.')).toBeVisible()
  await page.getByRole('textbox', { name: 'Hỏi chỉ đường' }).fill('Tôi muốn đi phòng G106.')
  await button('Gửi câu hỏi').click()
  await expect(page.getByText('Từ Phòng G101, đi dọc hành lang đến Phòng G106.')).toBeVisible()
  await expect(page.getByRole('link', { name: 'Mở lộ trình' })).toHaveAttribute('href', /from=g101_door.*to=G106/)
  assert.equal(directionsAsked[0].question, 'Tôi muốn đi phòng G106.')
  assert.equal(directionsAsked[0].photoId, 'p_0123456789ab')
  assert.equal(await page.evaluate(() => window.answerAudioPlays), 4)
  await button('Sự kiện').click()

  await button('Nói').click()
  await expect.poll(() => liveTracks('audio')).toBe(1)
  await button('Hủy ghi').click()
  await expect.poll(() => liveTracks('audio')).toBe(0)
  assert.equal(transcriptions, 1)

  // Switching from voice to tools must clean up active mic stream and close EventVoice.
  await button('Nói').click()
  await expect.poll(() => liveTracks('audio')).toBe(1)
  await adjustBtn.click()
  await expect(page.getByLabel('Câu hỏi về sự kiện')).toHaveCount(0)
  await expect.poll(() => liveTracks('audio')).toBe(0)

  // Hide only the moving video while inspecting the real 3D canvas (idle-safe checks: never expect frozen identical pixels).
  const stillCamera = await page.addStyleTag({ content: '.encounter-viewport video {visibility:hidden}' })
  const canvas = page.locator('.encounter-viewport canvas')
  async function mascotSnapshot() {
    const snapshot = sharp(await canvas.screenshot({ style: '.encounter-tools, .encounter-top, .encounter-bottom { visibility: hidden !important }' }))
    const { width, height, channels } = await snapshot.metadata()
    const raw = await snapshot.extract({ left: 0, top: 0, width, height: Math.floor(height * .75) }).raw().toBuffer()
    let opaque = 0
    for (let i = channels - 1; i < raw.length; i += channels) {
      if (raw[i] > 40) opaque++
    }
    return { raw, opaque }
  }

  const slider = page.getByRole('slider', { name: 'Kích thước mascot' })
  await expect(slider).toHaveValue('100')
  await slider.focus()
  await slider.press('End')
  await expect(slider).toHaveValue('140')
  const big = await mascotSnapshot()
  await slider.press('Home')
  await expect(slider).toHaveValue('60')
  const small = await mascotSnapshot()
  assert.ok(big.opaque > small.opaque * 1.4, `Expected 140% mascot (${big.opaque} px) to be larger than 60% (${small.opaque} px)`)
  for (let i = 0; i < 4; i++) await slider.press('ArrowRight')
  await expect(slider).toHaveValue('100')

  await expect(button('Đi bộ')).toBeVisible()
  for (const name of ['Đi bộ', 'Vẫy tay', 'Nhảy', 'Nhảy múa']) {
    await button(name).click()
    const before = await mascotSnapshot()
    assert.ok(before.opaque > 200, `Mascot should remain visible during ${name}`)
    await expect.poll(async () => !before.raw.equals((await mascotSnapshot()).raw)).toBe(true)
  }
  await stillCamera.evaluate(el => el.remove())

  // Switching lens must clean up active voice recording, reset ground zoom/placement, and re-arm capture appropriately.
  await talkBtn.click()
  await button('Nói').click()
  await expect.poll(() => liveTracks('audio')).toBe(1)
  await button('Đổi camera').click()
  await expect(page.getByLabel('Câu hỏi về sự kiện')).toHaveCount(0)
  await expect.poll(() => liveTracks('audio')).toBe(0)
  await expect.poll(() => page.evaluate(() => window.testTracks.filter(t => t.kind === 'video').length)).toBe(2)
  assert.equal(await liveTracks('video'), 1)
  // Selfie camera places mascot automatically.
  await expect(shutter).toBeEnabled()

  // Switch back to rear lens: placement resets (shutter disabled), then no-sensor fallback auto-places mascot.
  await button('Đổi camera').click()
  await expect.poll(() => page.evaluate(() => window.testTracks.filter(t => t.kind === 'video').length)).toBe(3)
  await expect(shutter).toBeDisabled()
  await expect(shutter).toBeEnabled({ timeout: 4000 })

  // Capture photo -> native savePhoto triggers download fallback, camera tracks stop, opt-in consent gates CLB upload.
  const downloaded = page.waitForEvent('download')
  await shutter.click()
  const download = await downloaded
  assert.match(download.suggestedFilename(), /\.jpg$/i)

  const preview = page.getByRole('img', { name: /Ảnh vừa chụp/ })
  await expect(preview).toBeVisible()
  const photo = await preview.getAttribute('src')
  assert.ok(photo.startsWith('data:image/jpeg;base64,') && photo.length > 6000)
  assert.equal(await liveTracks(null), 0)

  const saveAgain = page.waitForEvent('download')
  await button('Lưu vào Ảnh').click()
  await saveAgain
  await expect(page.getByText(/Ảnh đã tải về máy/)).toBeVisible()

  const saved = await download.createReadStream()
  const chunks = []
  for await (const chunk of saved) chunks.push(chunk)
  assert.deepEqual(Buffer.concat(chunks), Buffer.from(photo.split(',')[1], 'base64'))
  assert.equal(uploads.length, 0)
  const submit = button('Gửi ảnh cho CLB')
  await expect(submit).toBeDisabled()
  await page.getByRole('checkbox', { name: /Tôi đồng ý/ }).check()
  await submit.click()
  await expect(page.getByText(/Đã gửi ảnh cho CLB/)).toBeVisible()
  assert.deepEqual(uploads, [{ image: photo }])

  // Landscape phone (844x390): controls stay inside viewport without overlapping, voice panel is usable, local-only capture does not upload.
  await page.goto(detail + '?chup-anh=1')
  await page.setViewportSize({ width: 844, height: 390 })
  await check.click()
  await plainCamera.click()
  await expect(dialog).toBeVisible()
  assert.deepEqual(await page.locator('.encounter-viewport').boundingBox(), { x: 0, y: 0, width: 844, height: 390 })
  await expect(shutter).toBeDisabled()
  await expect(shutter).toBeEnabled({ timeout: 4000 })

  const landTalk = await talkBtn.boundingBox()
  const landShutter = await shutter.boundingBox()
  const landAdjust = await adjustBtn.boundingBox()
  assert.ok(insideViewport(landTalk, 844, 390))
  assert.ok(insideViewport(landShutter, 844, 390))
  assert.ok(insideViewport(landAdjust, 844, 390))
  assert.equal(boxesOverlap(landTalk, landShutter), false)
  assert.equal(boxesOverlap(landShutter, landAdjust), false)

  await talkBtn.click()
  const voiceInput = page.getByLabel('Câu hỏi về sự kiện')
  await expect(voiceInput).toBeVisible()
  const voiceBox = await page.locator('.encounter-tools').boundingBox()
  assert.ok(insideViewport(voiceBox, 844, 390))
  assert.equal(boxesOverlap(voiceBox, landShutter), false)
  await talkBtn.click()

  const localCopy = page.waitForEvent('download')
  await shutter.click()
  await localCopy
  await expect(page.getByRole('checkbox', { name: /Tôi đồng ý/ })).not.toBeChecked()
  await button('Đóng ảnh').click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect.poll(() => liveTracks(null)).toBe(0)
  assert.equal(uploads.length, 1, 'Keeping the second photo on the device must not upload it.')
  console.log('Verified portrait/landscape mascot controls, placement guard, direct voice + Azure transcribe/ask, native savePhoto, opt-in sharing, native AR placement and media cleanup.')
} finally { await browser.close() }
