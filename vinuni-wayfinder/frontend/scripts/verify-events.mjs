import { chromium, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
await mkdir('artifacts', { recursive: true })

const base = process.env.PROTOTYPE_URL || 'http://localhost:4173'
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true })
const report = { checks: [], accessibility: [], errors: [], screenshots: [] }
const key = 'vinuni-ar-map.events.v1'
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' })
  context.setDefaultTimeout(15000)
  // Use the local catalogue and stub every paid request, including when running against a live dev backend.
  await context.route('**/api/destinations', route => route.fulfill({ json: { rooms: [] } }))
  await context.addInitScript(() => localStorage.setItem('vinuni-wayfinder.btc.token.v1', 'fixture-session'))
  const page = await context.newPage()
  page.on('pageerror', e => report.errors.push(e.message))
  await page.goto(`${base}/clb/su-kien/moi`, { waitUntil: 'networkidle' })
  await page.getByRole('button', { name: 'Đăng thử sự kiện', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('đặt tên')
  await page.getByLabel('Tên sự kiện', { exact: true }).fill('Gặp gỡ CLB — kiểm thử')
  await page.getByRole('button', { name: 'Lưu bản nháp' }).click()
  await expect(page).toHaveURL(/\/clb\/su-kien\/.+\/chinh-sua/)
  const eventId = new URL(page.url()).pathname.split('/')[3]
  await page.goto(`${base}/su-kien/${eventId}`)
  await expect(page.getByRole('heading', { name: 'Chưa có sự kiện này' })).toBeVisible()
  await page.goto(`${base}/clb/su-kien/${eventId}/chinh-sua`)
  await page.getByLabel('Câu lạc bộ / đơn vị tổ chức').fill('CLB thử nghiệm')
  await page.getByLabel('Mô tả', { exact: true }).fill('Sự kiện kiểm thử giao diện, không phải lịch tổ chức thực tế.')
  await page.getByLabel('Bắt đầu', { exact: true }).fill('2026-12-01T15:00')
  await page.getByLabel('Kết thúc', { exact: true }).fill('2026-12-01T14:00')
  await page.getByLabel('Địa điểm chính tại VinUni').selectOption('i109')
  await page.getByRole('button', { name: /^Tia/ }).click()
  await page.getByRole('button', { name: 'Đăng thử sự kiện', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('kết thúc phải sau')
  await page.getByLabel('Kết thúc', { exact: true }).fill('2026-12-01T17:00')
  await page.getByRole('button', { name: 'Đăng thử sự kiện', exact: true }).click()
  await expect(page).toHaveURL(`${base}/su-kien/${eventId}`)
  await page.reload()
  await expect(page.locator('.event-detail-art [data-mascot=tia3d]')).toBeVisible()
  report.checks.push('Drafts persist without becoming public; invalid times are rejected; publishing creates a separate detail URL that survives reload')
  await page.getByRole('link', { name: 'Dẫn đường tới sự kiện', exact: true }).click()
  await expect(page.locator('.journey-preview [data-mascot=vini]')).toBeVisible()
  await page.getByRole('link', { name: /Chưa biết mình đang ở đâu/ }).click()
  await page.getByRole('link', { name: /Chụp ảnh xung quanh/ }).click()
  await expect(page.locator('.camera-mascot [data-mascot=vini]')).toBeVisible()
  await page.getByRole('link', { name: 'Dùng ảnh mẫu' }).click()
  await page.getByRole('link', { name: /Kiến trúc khuôn viên.*Thử ảnh này/ }).click()
  await page.getByRole('heading', { name: 'Đây có phải nơi bạn đang đứng?' }).waitFor()
  await page.getByRole('button', { name: /Đúng, mình đang ở đây/ }).click()
  assert.equal(new URL(page.url()).searchParams.get('event'), eventId)
  await expect(page.locator('.journey-preview [data-mascot=vini]')).toBeVisible()
  await page.getByRole('button', { name: 'Xem hành trình' }).click()
  await page.getByRole('button', { name: 'Đã tới Khởi nghiệp' }).click()
  await page.reload()
  await expect(page.locator('.journey-companion [data-mascot=vini]')).toBeVisible()
  assert.equal(new URL(page.url()).searchParams.get('event'), eventId)
  await page.getByRole('link', { name: 'Đổi điểm xuất phát' }).click()
  await page.getByRole('link', { name: 'Sảnh Toà I', exact: true }).click()
  assert.equal(new URL(page.url()).searchParams.get('event'), eventId)
  await page.getByLabel('Điểm đến', { exact: true }).selectOption('coffee')
  assert.equal(new URL(page.url()).searchParams.has('event'), false)
  await expect(page.locator('.journey-preview [data-mascot=vini]')).toBeVisible()
  await page.goto(`${base}/di-den?to=i109&from=lobby`)
  await expect(page.locator('.journey-preview [data-mascot=vini]')).toBeVisible()
  await page.goto(`${base}/di-den?to=coffee&event=${eventId}`)
  await expect(page.locator('.journey-preview [data-mascot=vini]')).toBeVisible()
  report.checks.push('Vini guides navigation while the event context survives camera flow, origin changes, steps and reload')

  // Stub generation only in this test browser. No billed calls in routine tests.
  let calls = 0
  const mascotId = 'momo-fixture'
  const part = { group: 'body', shape: 'ellipsoid', color: '#267e5a', position: [0, 1, 0], size: [1, 1.5, .8], rotation: [0, 0, 0] }
  const fixture = { id: mascotId, name: 'Momo kiểm thử', kind: 'model3d', recipe: { version: 1, parts: [
    part, { ...part, group: 'mouth', color: '#382c39', position: [0, 1.2, .42], size: [.2, .1, .1] },
    { ...part, group: 'rightArm', position: [.55, 1, 0], size: [.2, .6, .2] },
    { ...part, group: 'leftArm', position: [-.55, 1, 0], size: [.2, .6, .2] },
  ] } }
  await page.route('**/api/club-mascots/generate', route => {
    calls++
    assert.equal(route.request().headers().authorization, 'Bearer fixture-session')
    return calls === 1
      ? route.fulfill({ status: 429, json: { detail: { code: 'quota', message: 'Hết lượt kiểm thử.' } } })
      : route.fulfill({ json: { mascot: fixture } })
  })
  await page.goto(`${base}/clb/mascot`)
  await page.getByLabel('Tên mascot', { exact: true }).fill(fixture.name)
  await page.getByLabel('Mô tả nhân vật').fill('Một robot tròn màu xanh dành cho CLB.')
  assert.equal(calls, 0)
  await page.getByRole('button', { name: 'Tạo mascot 3D', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('Hết lượt kiểm thử')
  await page.getByRole('button', { name: 'Tạo mascot 3D', exact: true }).click()
  const preview = page.locator('.creator-preview img')
  await expect(preview).toBeVisible()
  const front = await preview.getAttribute('src')
  await page.getByRole('button', { name: 'Xoay phải' }).click()
  await expect.poll(() => preview.getAttribute('src')).not.toBe(front)
  assert.equal(await page.evaluate(key => JSON.parse(localStorage.getItem(key)).mascots.length, key), 0)
  await page.getByRole('button', { name: 'Dùng mascot này' }).click()
  await expect(page.getByRole('button', { name: 'Đã chọn mascot này' })).toBeVisible()
  assert.equal(await page.evaluate(key => JSON.parse(localStorage.getItem(key)).mascots[0].kind, key), 'model3d')
  assert.equal(calls, 2)
  await page.goto(`${base}/clb/su-kien/${eventId}/chinh-sua`)
  await page.getByRole('button', { name: /^Momo kiểm thử/ }).click()
  await page.getByRole('button', { name: 'Cập nhật trang sự kiện' }).click()
  await expect(page.locator(`.event-detail-art [data-mascot="${mascotId}"] img`)).toBeVisible()
  await page.getByRole('link', { name: 'Dẫn đường tới sự kiện' }).click()
  await expect(page.locator('.journey-preview [data-mascot=vini]')).toBeVisible()
  report.checks.push('AI errors are visible, the 3D preview rotates, selection persists the complete asset, and the event shows its own character')
  await page.addInitScript(key => { const original = Storage.prototype.setItem; Storage.prototype.setItem = function(k, v) { if (k === key) throw new DOMException('Quota full', 'QuotaExceededError'); return original.call(this, k, v) } }, key)
  await page.goto(`${base}/clb/su-kien/moi`)
  await page.getByLabel('Tên sự kiện', { exact: true }).fill('Nháp khi đầy bộ nhớ')
  await page.getByRole('button', { name: 'Lưu bản nháp' }).click()
  await expect(page.getByRole('alert')).toContainText('Chưa lưu được')
  await expect(page.getByLabel('Tên sự kiện', { exact: true })).toHaveValue('Nháp khi đầy bộ nhớ')
  report.checks.push('Storage quota failures are visible and retain unsaved form input')

  const routes = ['/clb', '/clb/su-kien/moi', '/clb/mascot', '/su-kien', `/su-kien/${eventId}`, `/di-den?to=i109&event=${eventId}`]
  for (const route of routes) {
    await page.goto(`${base}${route}`, { waitUntil: 'networkidle' })
    const audit = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()
    report.accessibility.push({ route, violations: audit.violations.map(v => ({ id: v.id, nodes: v.nodes.map(n => n.target) })) })
    for (const width of [320, 390, 768, 1440]) {
      await page.setViewportSize({ width, height: width > 800 ? 1000 : 844 })
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `overflow ${route} at ${width}`)
    }
  }
  report.checks.push('Six new/event-context screens fit 320, 390, 768 and 1440px widths and pass automated accessibility checks')
  for (const [route, name, width] of [['/clb', 'events-dashboard', 1440], ['/clb/su-kien/moi', 'events-editor', 1440], ['/clb/mascot', 'events-studio', 1440], ['/su-kien/robotics-open-lab', 'events-detail-mobile', 390], ['/clb/su-kien/moi', 'events-editor-mobile', 390]]) {
    await page.setViewportSize({ width, height: width > 800 ? 1000 : 844 })
    await page.goto(`${base}${route}`, { waitUntil: 'networkidle' })
    await page.screenshot({ path: `artifacts/${name}.png`, fullPage: true }); report.screenshots.push(`${name}.png`)
  }
  if (await page.evaluate(() => navigator.serviceWorker?.getRegistration().then(Boolean))) {
    await page.goto(`${base}/su-kien/${eventId}`, { waitUntil: 'networkidle' })
    await page.evaluate(async () => { await navigator.serviceWorker.ready })
    await page.reload({ waitUntil: 'networkidle' })
    await context.setOffline(true)
    await page.reload({ waitUntil: 'networkidle' })
    await expect(page.locator(`.event-detail-art [data-mascot="${mascotId}"] img`)).toBeVisible()
    await page.getByRole('link', { name: 'Dẫn đường tới sự kiện' }).click()
    await expect(page.locator('.journey-preview [data-mascot=vini]')).toBeVisible()
    report.checks.push('Saved event and custom mascot survive offline reload and navigation')
  }
  assert.deepEqual(report.errors, [])
  assert.equal(report.accessibility.flatMap(a => a.violations).length, 0, 'See artifacts/events-verification.json')
} finally {
  await writeFile('artifacts/events-verification.json', JSON.stringify(report, null, 2))
  console.log(JSON.stringify(report, null, 2))
  await browser.close()
}
