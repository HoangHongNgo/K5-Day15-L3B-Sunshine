import { chromium, expect } from '@playwright/test'
import assert from 'node:assert/strict'
import { mkdir, readFile } from 'node:fs/promises'
import { AnimationMixer, Vector3 } from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'

// No paid API calls: this exercises the real model, WebGL viewer and GLB export.
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true })
const base = process.env.PROTOTYPE_URL || 'http://localhost:5173'
await mkdir('artifacts', { recursive: true })
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1100 }, reducedMotion: 'no-preference' })
  const page = await context.newPage()
  page.setDefaultTimeout(7000)
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.addInitScript(() => {
    let frameTime = 0
    const requestFrame = window.requestAnimationFrame.bind(window)
    window.requestAnimationFrame = callback => requestFrame(() => callback(frameTime))
    window.advanceMascotFrames = async count => {
      for (let i = 0; i < count; i++) {
        frameTime += 100
        await new Promise(resolve => requestFrame(resolve))
      }
    }
  })
  const advanceFrames = count => page.evaluate(count => window.advanceMascotFrames(count), count)
  await page.goto(`${base}/mascot-3d`, { waitUntil: 'networkidle' })
  await expect(page.getByRole('heading', { name: 'Chào Tia, người bạn mới.' })).toBeVisible()
  const canvas = page.locator('.mascot3d-canvas canvas')
  await expect(canvas).toBeVisible()
  await expect(page.getByRole('button', { name: 'Tự xoay' })).toHaveAttribute('aria-pressed', 'false')
  const front = await canvas.screenshot()
  await page.getByRole('button', { name: 'Mặt sau', exact: true }).click()
  const back = await canvas.screenshot()
  assert.ok(!front.equals(back), 'Back view must render different 3D geometry')
  await page.screenshot({ path: 'artifacts/tia-back.png', fullPage: true })
  await page.getByRole('button', { name: 'Đặt lại góc nhìn' }).click()
  const box = await canvas.boundingBox()
  await page.mouse.move(box.x + box.width * .45, box.y + box.height * .5)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width * .7, box.y + box.height * .55, { steps: 12 })
  await page.mouse.up()
  assert.ok(!front.equals(await canvas.screenshot()), 'Dragging must change the view')
  await page.getByRole('button', { name: 'Mặt trước', exact: true }).click()
  await page.screenshot({ path: 'artifacts/tia-front.png', fullPage: true })
  const atRest = await canvas.screenshot()
  await advanceFrames(5)
  assert.ok(!atRest.equals(await canvas.screenshot()), 'Tia must breathe at rest')

  const walk = page.getByRole('button', { name: 'Đi bộ', exact: true })
  const stop = page.getByRole('button', { name: 'Dừng động tác', exact: true })
  await walk.click()
  await expect(walk).toHaveAttribute('aria-pressed', 'true')
  const walkStart = await canvas.screenshot()
  await advanceFrames(6)
  const midWalk = await canvas.screenshot()
  assert.ok(!walkStart.equals(midWalk), 'Walking must change the pose and stage position')
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await expect(walk).toBeDisabled()
  assert.ok(midWalk.equals(await canvas.screenshot()), 'Pausing must preserve the current walk pose and position')
  await advanceFrames(6)
  assert.ok(midWalk.equals(await canvas.screenshot()), 'The pause must keep the current frame frozen')
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await expect(walk).toBeEnabled()
  assert.ok(midWalk.equals(await canvas.screenshot()), 'Resuming must begin at the paused frame')
  await advanceFrames(4)
  assert.ok(!midWalk.equals(await canvas.screenshot()), 'Resuming must advance the walk')
  await stop.click()
  await expect(walk).toHaveAttribute('aria-pressed', 'false')
  assert.ok(atRest.equals(await canvas.screenshot()), 'Stopping the walk must return Tia to the center at idle')
  await advanceFrames(5)
  assert.ok(!atRest.equals(await canvas.screenshot()), 'Idle must keep animating after stopping an action')

  for (const name of ['Vẫy tay', 'Nhảy', 'Múa xoay', 'Mở miệng nói']) {
    const button = page.getByRole('button', { name, exact: true })
    await button.click()
    await expect(button).toHaveAttribute('aria-pressed', 'true')
    const start = await canvas.screenshot()
    await advanceFrames(5)
    assert.ok(!start.equals(await canvas.screenshot()), `${name} must animate the model`)
    if (name === 'Vẫy tay') await page.screenshot({ path: 'artifacts/tia-wave.png', fullPage: true })
    await stop.click()
    await expect(button).toHaveAttribute('aria-pressed', 'false')
  }
  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Tải mô hình .GLB' }).click()
  const download = await downloadPromise
  await download.saveAs('artifacts/tia.glb')
  const glb = await readFile('artifacts/tia.glb')
  assert.equal(glb.toString('utf8', 0, 4), 'glTF')
  assert.equal(glb.readUInt32LE(4), 2)
  assert.equal(glb.readUInt32LE(8), glb.length)
  const gltf = JSON.parse(glb.toString('utf8', 20, 20 + glb.readUInt32LE(12)))
  assert.ok(gltf.meshes.length > 10, 'Export must include the mascot geometry')
  assert.ok(gltf.nodes.some(node => node.name === 'tail'), 'Export must include the back of the character')
  assert.ok(!gltf.nodes.some(node => node.name === 'display-plinth'), 'Display platform must not be part of the mascot')
  const joints = new Set(gltf.skins.flatMap(skin => skin.joints.map(index => gltf.nodes[index].name)))
  assert.ok(joints.has('Hips') && joints.has('LeftLeg') && joints.has('Tail3'), 'GLB must contain Tia’s bound body and tail bones')
  assert.deepEqual(gltf.animations.map(animation => animation.name).sort(), ['dance', 'idle', 'jump', 'talk', 'walk', 'wave'])
  assert.ok(gltf.animations.every(animation => animation.channels.length > 0), 'GLB must include playable animation channels')
  const loaded = await new GLTFLoader().parseAsync(glb.buffer.slice(glb.byteOffset, glb.byteOffset + glb.byteLength), '')
  const mixer = new AnimationMixer(loaded.scene)
  const leg = loaded.scene.getObjectByName('LeftLeg')
  const restLeg = leg.quaternion.clone()
  mixer.clipAction(loaded.animations.find(clip => clip.name === 'walk')).play()
  mixer.update(.35)
  assert.ok(leg.quaternion.angleTo(restLeg) > .1, 'Downloaded walk must bend the knee')
  mixer.stopAllAction()
  const paw = loaded.scene.getObjectByName('paw-1')
  const rest = paw.getWorldPosition(new Vector3())
  mixer.clipAction(loaded.animations.find(clip => clip.name === 'wave')).play()
  mixer.update(.8)
  assert.ok(paw.getWorldPosition(new Vector3()).y > rest.y + .6, 'Downloaded wave must animate the actual arm')
  mixer.stopAllAction()
  mixer.clipAction(loaded.animations.find(clip => clip.name === 'jump')).play()
  mixer.update(.55)
  assert.ok(loaded.scene.getObjectByName('Tia').position.y > .5, 'Downloaded jump must move the actual model')
  mixer.stopAllAction()
  mixer.uncacheRoot(loaded.scene)
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 })
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `overflow at ${width}`)
  }
  await page.setViewportSize({ width: 390, height: 844 })
  await page.screenshot({ path: 'artifacts/tia-mobile.png', fullPage: true })
  await page.getByRole('button', { name: 'Tự xoay' }).click()
  await expect(page.getByRole('button', { name: 'Tự xoay' })).toHaveAttribute('aria-pressed', 'true')
  await page.getByRole('button', { name: 'Tự xoay' }).click()
  assert.deepEqual(errors, [])

  const reduced = await context.newPage()
  await reduced.emulateMedia({ reducedMotion: 'reduce' })
  await reduced.goto(`${base}/mascot-3d`)
  const reducedCanvas = reduced.locator('.mascot3d-canvas canvas')
  await expect(reduced.getByRole('status').filter({ hasText: 'giảm chuyển động' })).toBeVisible()
  await expect(reduced.getByRole('button', { name: 'Đi bộ', exact: true })).toBeDisabled()
  const reducedFrame = await reducedCanvas.screenshot()
  assert.ok(reducedFrame.equals(await reducedCanvas.screenshot()), 'Initial reduced-motion preference must leave Tia still')
  await reduced.close()

  const fallback = await context.newPage()
  await fallback.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext
    HTMLCanvasElement.prototype.getContext = function (type, ...args) {
      return type.startsWith('webgl') ? null : original.call(this, type, ...args)
    }
  })
  await fallback.goto(`${base}/mascot-3d`)
  await expect(fallback.getByRole('alert')).toContainText('chưa mở được 3D')
  await expect(fallback.getByRole('button', { name: 'Tải mô hình .GLB' })).toBeDisabled()
  console.log(JSON.stringify({ checks: ['3D front/back', 'drag rotation', 'idle and walk', 'wave/jump/dance/talk', 'stop to idle', 'reduced motion and resume', 'auto rotation toggle', 'GLB skeleton and six animations', '320–1440px layout', 'WebGL fallback'], glbBytes: glb.length, errors }, null, 2))
} finally {
  await browser.close()
}
