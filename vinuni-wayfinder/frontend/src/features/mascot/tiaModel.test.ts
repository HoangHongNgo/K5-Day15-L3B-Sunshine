import { describe, expect, it, vi } from 'vitest'
import { AnimationMixer, Bone, Box3, Mesh, MeshPhysicalMaterial, Raycaster, Skeleton, SkinnedMesh, Vector3 } from 'three'
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js'
import { createTiaMascot } from './tiaModel'
import { createMascotPatrol, resetMascotPatrol, stepMascotPatrol } from './tiaAnimations'

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

  it('rigs Tia with an anatomical 3D humanoid skeleton, normalized skin weights, and fox secondary bones', () => {
    const asset = createTiaMascot()
    expect(asset.skeleton).toBeInstanceOf(Skeleton)
    const requiredBones = [
      'Hips', 'Spine', 'Chest', 'Neck', 'Head',
      'LeftEar', 'RightEar', 'mouth', 'ScarfTail',
      'shoulder--1', 'LeftUpperArm', 'LeftForeArm', 'LeftHand',
      'shoulder-1', 'RightUpperArm', 'RightForeArm', 'RightHand',
      'LeftUpLeg', 'LeftLeg', 'LeftFoot',
      'RightUpLeg', 'RightLeg', 'RightFoot',
      'Tail1', 'Tail2', 'Tail3',
    ]
    for (const name of requiredBones) {
      const bone = asset.model.getObjectByName(name)
      expect(bone, `missing bone ${name}`).toBeInstanceOf(Bone)
    }

    const skinnedMeshes: SkinnedMesh[] = []
    asset.model.traverse(obj => {
      if (obj instanceof SkinnedMesh) skinnedMeshes.push(obj)
    })
    expect(skinnedMeshes.length).toBeGreaterThanOrEqual(2)
    for (const mesh of skinnedMeshes) {
      expect(mesh.skeleton).toBe(asset.skeleton)
      const skinIndex = mesh.geometry.getAttribute('skinIndex')
      const skinWeight = mesh.geometry.getAttribute('skinWeight')
      expect(skinIndex).toBeDefined()
      expect(skinWeight).toBeDefined()
      for (let i = 0; i < skinWeight.count; i++) {
        const sum = skinWeight.getX(i) + skinWeight.getY(i) + skinWeight.getZ(i) + skinWeight.getW(i)
        expect(sum).toBeCloseTo(1, 4)
        for (let k = 0; k < 4; k++) {
          const idx = skinIndex.getComponent(i, k)
          expect(idx).toBeGreaterThanOrEqual(0)
          expect(idx).toBeLessThan(asset.skeleton.bones.length)
        }
      }
    }
    asset.dispose()
  })

  it('walks with a contra-lateral humanoid gait and patrols smoothly along a stage path', () => {
    const asset = createTiaMascot()
    const walk = asset.animations.find(clip => clip.name === 'walk')
    expect(walk).toBeDefined()
    const mixer = new AnimationMixer(asset.model)
    const leftFoot = asset.model.getObjectByName('LeftFoot')!
    const rightFoot = asset.model.getObjectByName('RightFoot')!
    const rightPaw = asset.model.getObjectByName('paw-1')!
    const restRightFoot = rightFoot.getWorldPosition(new Vector3())
    const restLeftFoot = leftFoot.getWorldPosition(new Vector3())
    const restRightPaw = rightPaw.getWorldPosition(new Vector3())

    mixer.clipAction(walk!).play()
    mixer.update(walk!.duration * 0.25)
    const q1RightFoot = rightFoot.getWorldPosition(new Vector3())
    const q1LeftFoot = leftFoot.getWorldPosition(new Vector3())
    const q1RightPaw = rightPaw.getWorldPosition(new Vector3())
    expect(q1RightFoot.z - restRightFoot.z).toBeGreaterThan(0.08)
    expect(q1LeftFoot.z - restLeftFoot.z).toBeLessThan(-0.08)
    // Contra-lateral arm swing: right arm swings back when right leg steps forward
    expect(q1RightPaw.z - restRightPaw.z).toBeLessThan(-0.04)

    mixer.update(walk!.duration * 0.5)
    const q3RightFoot = rightFoot.getWorldPosition(new Vector3())
    const q3LeftFoot = leftFoot.getWorldPosition(new Vector3())
    expect(q3LeftFoot.z - restLeftFoot.z).toBeGreaterThan(0.08)
    expect(q3RightFoot.z - restRightFoot.z).toBeLessThan(-0.08)

    // Verify feet never clip deep below the floor throughout the walk cycle
    mixer.stopAllAction()
    mixer.clipAction(walk!).play()
    for (let i = 0; i <= 40; i++) {
      mixer.update(walk!.duration / 40)
      const bounds = new Box3().setFromObject(asset.model)
      expect(bounds.min.y).toBeGreaterThanOrEqual(-0.015)
    }

    // Spatial patrol controller moves and steers Tia smoothly, then resets cleanly
    const patrol = createMascotPatrol()
    stepMascotPatrol(asset.model, patrol, 0.6)
    expect(Math.hypot(asset.model.position.x, asset.model.position.z)).toBeGreaterThan(0.05)
    resetMascotPatrol(asset.model, patrol)
    expect(asset.model.position.toArray()).toEqual([0, 0, 0])
    expect(asset.model.quaternion.toArray()).toEqual([0, 0, 0, 1])

    mixer.stopAllAction()
    mixer.uncacheRoot(asset.model)
    asset.dispose()
  })

  it('breathes, twitches ears, and wags the multi-bone fox tail during idle without displacing the root', () => {
    const asset = createTiaMascot()
    const idle = asset.animations.find(clip => clip.name === 'idle')
    expect(idle).toBeDefined()
    const tailTip = asset.model.getObjectByName('Tail3')!
    const restTip = tailTip.getWorldPosition(new Vector3())
    const mixer = new AnimationMixer(asset.model)
    mixer.clipAction(idle!).play()
    let maxWag = 0
    for (let i = 0; i < 20; i++) {
      mixer.update(idle!.duration / 20)
      const pos = tailTip.getWorldPosition(new Vector3())
      maxWag = Math.max(maxWag, Math.abs(pos.x - restTip.x))
      expect(asset.model.position.toArray()).toEqual([0, 0, 0])
    }
    expect(maxWag).toBeGreaterThan(0.04)
    mixer.stopAllAction()
    mixer.uncacheRoot(asset.model)
    asset.dispose()
  })

  it('uses tactile physical plush/clearcoat materials, multi-tone fur vertex colors, and exports cleanly to GLB', async () => {
    const asset = createTiaMascot()
    let hasPlushSheen = false
    let hasGlossyClearcoat = false
    let hasVertexColoredFur = false
    asset.model.traverse(obj => {
      if (!(obj instanceof Mesh)) return
      if (obj.geometry.getAttribute('color')) hasVertexColoredFur = true
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material]
      for (const mat of mats) {
        if (mat instanceof MeshPhysicalMaterial) {
          if (mat.sheen > 0.7) hasPlushSheen = true
          if (mat.clearcoat > 0.8) hasGlossyClearcoat = true
        }
      }
    })
    expect(hasPlushSheen).toBe(true)
    expect(hasGlossyClearcoat).toBe(true)
    expect(hasVertexColoredFur).toBe(true)

    class NodeFileReader {
      result: ArrayBuffer | string | null = null
      onloadend: (() => void) | null = null
      readAsArrayBuffer(blob: Blob) {
        void blob.arrayBuffer().then(buf => { this.result = buf; this.onloadend?.() })
      }
      readAsDataURL(blob: Blob) {
        void blob.arrayBuffer().then(buf => {
          this.result = `data:${blob.type || 'application/octet-stream'};base64,${Buffer.from(buf).toString('base64')}`
          this.onloadend?.()
        })
      }
    }
    vi.stubGlobal('FileReader', NodeFileReader)
    try {
      const gltf = await new GLTFExporter().parseAsync(asset.model, { binary: false, animations: asset.animations }) as {
        skins?: Array<{ joints: number[] }>
        animations?: Array<{ name: string; channels: unknown[] }>
      }
      expect(gltf.skins?.length).toBeGreaterThanOrEqual(1)
      expect(gltf.skins![0].joints.length).toBe(asset.skeleton.bones.length)
      expect(gltf.animations?.map(a => a.name)).toEqual(['idle', 'walk', 'wave', 'jump', 'dance', 'talk'])
      for (const anim of gltf.animations!) {
        expect(anim.channels.length).toBeGreaterThan(0)
      }
      const glb = await new GLTFExporter().parseAsync(asset.model, { binary: true, animations: asset.animations })
      expect(glb).toBeInstanceOf(ArrayBuffer)
      expect(new TextDecoder().decode(new Uint8Array(glb as ArrayBuffer, 0, 4))).toBe('glTF')
    } finally {
      vi.unstubAllGlobals()
      asset.dispose()
    }
  })
})
