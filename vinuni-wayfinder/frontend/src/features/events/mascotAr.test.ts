import { describe, expect, it } from 'vitest'
import { Mesh, MeshStandardMaterial, Scene, SkinnedMesh } from 'three'
import { USDZExporter } from 'three/examples/jsm/exporters/USDZExporter.js'
import { createTiaMascot } from '../mascot/tiaModel'
import { chooseArLocomotionClip, joystickMove, joystickVector, prepareSceneForUsdz } from './mascotAr'

describe('joystickVector', () => {
  it('normalises the thumb offset to a unit disc with a small dead zone', () => {
    expect(joystickVector(0, 0, 50)).toEqual({ x: 0, y: 0 })
    expect(joystickVector(3, 0, 50)).toEqual({ x: 0, y: 0 })
    const v = joystickVector(100, 0, 50)
    expect(v.x).toBeCloseTo(1)
    expect(v.y).toBeCloseTo(0)
  })
})

describe('joystickMove', () => {
  it('pushing up walks away from the camera along the floor', () => {
    // camera yaw 0 → camera looks toward -Z
    const m = joystickMove({ x: 0, y: -1 }, 0, 0.5, 1)
    expect(m.dx).toBeCloseTo(0)
    expect(m.dz).toBeCloseTo(-0.5)
  })
  it('pushing right walks to the camera’s right', () => {
    const m = joystickMove({ x: 1, y: 0 }, 0, 0.5, 1)
    expect(m.dx).toBeCloseTo(0.5)
    expect(m.dz).toBeCloseTo(0)
  })
  it('follows the camera heading', () => {
    // camera turned 90° left (yaw +π/2) → forward is -X
    const m = joystickMove({ x: 0, y: -1 }, Math.PI / 2, 0.5, 1)
    expect(m.dx).toBeCloseTo(-0.5)
    expect(m.dz).toBeCloseTo(0)
  })
  it('faces the direction of travel and stands still without input', () => {
    expect(joystickMove({ x: 0, y: 0 }, 0, 0.5, 1)).toEqual({ dx: 0, dz: 0, facing: null })
    expect(joystickMove({ x: 1, y: 0 }, 0, 0.5, 1).facing).toBeCloseTo(Math.PI / 2)
  })
})

describe('chooseArLocomotionClip', () => {
  it('switches between walk when moving and idle when standing still', () => {
    expect(chooseArLocomotionClip({ moving: true, oneShotActive: false, clips: ['idle', 'walk', 'wave'] })).toBe('walk')
    expect(chooseArLocomotionClip({ moving: false, oneShotActive: false, clips: ['idle', 'walk', 'wave'] })).toBe('idle')
  })

  it('does not interrupt an active one-shot emote like wave, jump, or dance', () => {
    expect(chooseArLocomotionClip({ moving: true, oneShotActive: true, clips: ['idle', 'walk', 'wave'] })).toBeNull()
    expect(chooseArLocomotionClip({ moving: false, oneShotActive: true, clips: ['idle', 'walk', 'wave'] })).toBeNull()
  })

  it('falls back gracefully when walk or idle clips are unavailable', () => {
    expect(chooseArLocomotionClip({ moving: true, oneShotActive: false, clips: ['wave'] })).toBeNull()
    expect(chooseArLocomotionClip({ moving: false, oneShotActive: false, clips: ['wave'] })).toBeNull()
  })
})

describe('prepareSceneForUsdz', () => {
  it('bakes SkinnedMesh and vertex-colored fur so iPhone AR Quick Look never renders Tia bleached white', async () => {
    const asset = createTiaMascot()
    const scene = new Scene()
    scene.add(asset.model)
    const cleanup = prepareSceneForUsdz(scene)
    let skinnedCount = 0
    const body = scene.getObjectByName('body') as Mesh
    scene.traverse(obj => {
      if (obj instanceof SkinnedMesh) skinnedCount++
    })
    expect(skinnedCount).toBe(0)
    expect(body).toBeInstanceOf(Mesh)
    const bodyMat = body.material as MeshStandardMaterial
    expect(bodyMat.isMeshStandardMaterial).toBe(true)
    // Without DOM canvas in Node, fallback tint bakes average warm fox-orange color (not pure white 0xffffff)
    expect(bodyMat.color.getHex()).not.toBe(0xffffff)
    expect(bodyMat.color.r).toBeGreaterThan(bodyMat.color.b * 1.5)

    const usdz = await new USDZExporter().parseAsync(scene, { quickLookCompatible: true })
    expect(usdz.byteLength).toBeGreaterThan(1000)
    cleanup()
    asset.dispose()
  })
})
