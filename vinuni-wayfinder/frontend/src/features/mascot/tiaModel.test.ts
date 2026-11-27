import { describe, expect, it } from 'vitest'
import { AnimationMixer, Box3, Mesh, Raycaster, Vector3 } from 'three'
import { createTiaMascot } from './tiaModel'

describe('mascot 3D thử nghiệm', () => {
  it('waves the paw and arm together around the shoulder, then returns to rest', () => {
    const asset = createTiaMascot()
    const clip = asset.animations?.find(animation => animation.name === 'wave')
    expect(clip).toBeDefined()
    const mixer = new AnimationMixer(asset.model)
    const paw = asset.model.getObjectByName('paw-1')!, arm = asset.model.getObjectByName('arm-1')!
    const rest = paw.getWorldPosition(new Vector3())
    const distance = rest.distanceTo(arm.getWorldPosition(new Vector3()))
    mixer.clipAction(clip!).play()
    mixer.update(.8)
    const raised = paw.getWorldPosition(new Vector3())
    expect(raised.y).toBeGreaterThan(rest.y + .6)
    expect(raised.distanceTo(arm.getWorldPosition(new Vector3()))).toBeCloseTo(distance, 5)
    mixer.stopAllAction()
    expect(paw.getWorldPosition(new Vector3()).distanceTo(rest)).toBeLessThan(.00001)
    mixer.uncacheRoot(asset.model)
    asset.dispose()
  })

  it('jumps above the platform, never passes through it, and lands after one loop', () => {
    const asset = createTiaMascot()
    const clip = asset.animations?.find(animation => animation.name === 'jump')
    expect(clip).toBeDefined()
    const mixer = new AnimationMixer(asset.model)
    mixer.clipAction(clip!).play()
    let highest = 0
    for (let frame = 0; frame < 130; frame++) {
      mixer.update(.01)
      highest = Math.max(highest, asset.model.position.y)
      const bounds = new Box3().setFromObject(asset.model)
      expect(bounds.min.y).toBeGreaterThanOrEqual(-.001)
    }
    expect(highest).toBeGreaterThan(.5)
    expect(asset.model.position.y).toBeCloseTo(0, 4)
    mixer.stopAllAction()
    expect(asset.model.scale.toArray()).toEqual([1, 1, 1])
    mixer.uncacheRoot(asset.model)
    asset.dispose()
  })

  it('dances through a complete turn and can switch to a wave without leaving a rotated body', () => {
    const asset = createTiaMascot()
    const dance = asset.animations?.find(animation => animation.name === 'dance')
    expect(dance).toBeDefined()
    const mixer = new AnimationMixer(asset.model)
    mixer.clipAction(dance!).play()
    mixer.update(1)
    const facing = new Vector3(0, 0, 1).applyQuaternion(asset.model.quaternion)
    expect(facing.z).toBeLessThan(-.99)
    mixer.update(1)
    expect(new Vector3(0, 0, 1).applyQuaternion(asset.model.quaternion).z).toBeGreaterThan(.99)
    mixer.stopAllAction()
    mixer.clipAction(asset.animations.find(animation => animation.name === 'wave')!).play()
    mixer.update(.8)
    expect(asset.model.quaternion.toArray()).toEqual([0, 0, 0, 1])
    mixer.stopAllAction()
    mixer.uncacheRoot(asset.model)
    asset.dispose()
  })

  it('has a solid body, feet above the floor, and geometry visible from behind', () => {
    const { model, dispose } = createTiaMascot()
    model.updateMatrixWorld(true)
    const bounds = new Box3().setFromObject(model)
    const size = bounds.getSize(new Vector3())
    expect(bounds.min.y).toBeGreaterThanOrEqual(-0.01)
    expect(size.y).toBeGreaterThan(2)
    expect(size.z).toBeGreaterThan(0.8)
    const rear = new Raycaster(new Vector3(0, 1, -6), new Vector3(0, 0, 1))
    expect(rear.intersectObject(model, true).length).toBeGreaterThan(0)
    model.traverse(object => {
      if (!(object instanceof Mesh)) return
      const positions = object.geometry.getAttribute('position')
      expect(Array.from(positions.array).every(Number.isFinite)).toBe(true)
    })
    dispose()
  })

  it('creates independent models so modifying one mascot cannot change another', () => {
    const first = createTiaMascot(), second = createTiaMascot()
    const a = first.model.getObjectByName('body') as Mesh
    const b = second.model.getObjectByName('body') as Mesh
    a.position.y = 99
    expect(b.position.y).toBeLessThan(3)
    expect(a.geometry).not.toBe(b.geometry)
    expect(a.material).not.toBe(b.material)
    first.dispose()
    second.dispose()
  })

  it('shows the outer tail surface rather than the inside of a hollow tube', () => {
    const { model, dispose } = createTiaMascot()
    model.updateMatrixWorld(true)
    const ray = new Raycaster(new Vector3(1.05, .85, -6), new Vector3(0, 0, 1))
    const hit = ray.intersectObject(model.getObjectByName('tail')!, true)[0]
    expect(hit).toBeDefined()
    expect(hit.point.z).toBeLessThan(-.85)
    dispose()
  })

  it('releases every mesh geometry and material when the viewer closes', () => {
    const { model, dispose } = createTiaMascot()
    const resources = new Set<{ addEventListener: (name: 'dispose', listener: () => void) => void }>()
    model.traverse(object => {
      if (!(object instanceof Mesh)) return
      resources.add(object.geometry)
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) resources.add(material)
    })
    let released = 0
    resources.forEach(resource => resource.addEventListener('dispose', () => released++))
    expect(resources.size).toBeGreaterThan(0)
    dispose()
    expect(released).toBe(resources.size)
  })
})
