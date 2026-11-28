import * as THREE from 'three'
import { describe, expect, it, vi } from 'vitest'
import { clampStageWalkX, contactShadowState, createEncounterMotionRunner, frameMascot, toggleEncounterMotion } from './encounterStage'

describe('toggleEncounterMotion', () => {
  it('toggles looping walk on and off so users can pause walking back to idle', () => {
    expect(toggleEncounterMotion(null, 'walk')).toEqual({ nextLoop: 'walk', play: 'walk' })
    expect(toggleEncounterMotion('walk', 'walk')).toEqual({ nextLoop: null, play: null })
  })

  it('clears active walk loop when triggering a one-shot motion', () => {
    expect(toggleEncounterMotion('walk', 'wave')).toEqual({ nextLoop: null, play: 'wave' })
    expect(toggleEncounterMotion(null, 'jump')).toEqual({ nextLoop: null, play: 'jump' })
    expect(toggleEncounterMotion('walk', 'dance')).toEqual({ nextLoop: null, play: 'dance' })
  })
})

describe('AR camera framing & floor shadow tracking', () => {
  it('uses 65% of a phone frame for a standing mascot and supports a smaller or larger photo composition', () => {
    const frame = (zoom = 1) => frameMascot(360, 450, 1.5, 3, .5, .9, zoom)
    expect(frame().scale * 3).toBeCloseTo(450 * .65)
    expect(frame(.6).scale).toBeLessThan(frame().scale)
    expect(frame(1.4).scale).toBeGreaterThan(frame().scale)
  })

  it('keeps the resting model inside the camera when enlarged and tapped near an edge', () => {
    const w = 320, h = 400, modelWidth = 4, modelHeight = 2
    for (const x of [0, 1]) {
      for (const y of [0, 1]) {
        const p = frameMascot(w, h, modelWidth, modelHeight, x, y, 1.4)
        const halfWidth = p.scale * modelWidth / 2
        expect(p.x - halfWidth).toBeGreaterThanOrEqual(-w / 2)
        expect(p.x + halfWidth).toBeLessThanOrEqual(w / 2)
        expect(p.y).toBeGreaterThanOrEqual(-h / 2)
        expect(p.y + p.scale * modelHeight).toBeLessThanOrEqual(h / 2)
      }
    }
  })

  it('keeps patrol walking inside the camera frame when anchored at the right corner and tracks the floor shadow', () => {
    const w = 360, h = 640, modelW = 1.6, modelH = 2.8
    const frame = frameMascot(w, h, modelW, modelH, 0.72, 0.88, 1)
    for (const rawOffset of [-0.5, 0, 0.5]) {
      const clampedModelX = clampStageWalkX(rawOffset, frame.x, frame.scale, w, modelW)
      const worldCenterX = frame.x + clampedModelX * frame.scale
      expect(worldCenterX - (frame.scale * modelW) / 2).toBeGreaterThanOrEqual(-w / 2 - 0.01)
      expect(worldCenterX + (frame.scale * modelW) / 2).toBeLessThanOrEqual(w / 2 + 0.01)
    }
    const grounded = contactShadowState(0.18, 0)
    const airborne = contactShadowState(0.18, 0.65)
    expect(grounded.x).toBeCloseTo(0.18)
    expect(airborne.scaleFactor).toBeLessThan(grounded.scaleFactor)
    expect(airborne.opacity).toBeLessThan(grounded.opacity)
  })
})

describe('encounter motion availability and idle safety', () => {
  function makeClip(name: string, duration = 0.5) {
    return new THREE.AnimationClip(name, duration, [
      new THREE.VectorKeyframeTrack('Mascot.position', [0, duration], [0, 0, 0, 0, 0.2, 0]),
    ])
  }

  function setupRunner(clipNames: string[]) {
    const model = new THREE.Group()
    model.name = 'Mascot'
    const mixer = new THREE.AnimationMixer(model)
    const animations = clipNames.map(name => makeClip(name))
    let activeLoop: ((now: number) => void) | null = null
    const setLoop = vi.fn((cb: ((now: number) => void) | null) => { activeLoop = cb })
    const render = vi.fn()
    const runner = createEncounterMotionRunner({ model, animations, mixer, setLoop, render })
    return { model, mixer, runner, setLoop, render, getLoop: () => activeLoop }
  }

  it('reports walk availability accurately and never stops idle when a missing animation is requested', () => {
    const { runner, getLoop } = setupRunner(['idle', 'wave', 'jump', 'dance', 'talk'])
    expect(runner.hasMotion('walk')).toBe(false)
    expect(runner.hasMotion('wave')).toBe(true)

    runner.setIdle(true)
    expect(runner.currentMotion()).toBe('idle')
    expect(getLoop()).not.toBeNull()

    runner.play('walk')
    expect(runner.currentMotion()).toBe('idle')
    expect(getLoop()).not.toBeNull()
  })

  it('supports walk patrol and returns to idle after one-shot clips unless reduced motion pauses idle', () => {
    const { runner, mixer, getLoop } = setupRunner(['idle', 'walk', 'wave', 'jump', 'dance', 'talk'])
    expect(runner.hasMotion('walk')).toBe(true)

    runner.setIdle(true)
    runner.play('walk')
    expect(runner.currentMotion()).toBe('walk')

    runner.play('wave')
    expect(runner.currentMotion()).toBe('wave')
    mixer.update(0.6)
    expect(runner.currentMotion()).toBe('idle')

    runner.setIdle(false)
    expect(runner.currentMotion()).toBeNull()
    expect(getLoop()).toBeNull()

    runner.play('talk')
    expect(runner.currentMotion()).toBe('talk')
    runner.play(null)
    expect(runner.currentMotion()).toBeNull()
  })
})
