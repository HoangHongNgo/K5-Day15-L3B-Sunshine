import { Box3, BoxGeometry, ConeGeometry, CylinderGeometry, Group, MathUtils, Mesh, MeshStandardMaterial, SphereGeometry, TorusGeometry, Vector3 } from 'three'
import type { MascotAsset } from '../events/events'
import { createTiaAnimations } from './tiaAnimations'
import { createTiaMascot } from './tiaModel'
import type { ModelPart } from './mascotRecipe'

function geometry(shape: ModelPart['shape']) {
  switch (shape) {
    case 'ellipsoid': return new SphereGeometry(.5, 28, 20)
    case 'cone': return new ConeGeometry(.5, 1, 28)
    case 'cylinder': return new CylinderGeometry(.5, .5, 1, 28)
    case 'box': return new BoxGeometry(1, 1, 1)
    case 'torus': return new TorusGeometry(.37, .13, 12, 36).scale(1, 1, 1 / .26)
  }
}

export function createEventMascot(asset: MascotAsset) {
  if (asset.kind !== 'model3d' || !asset.recipe) return createTiaMascot()
  const model = new Group()
  model.name = 'Companion'
  model.userData.name = asset.name
  const sculpture = new Group()
  model.add(sculpture)
  const joints = { body: new Group(), rightArm: new Group(), leftArm: new Group(), mouth: new Group() }
  joints.rightArm.name = 'shoulder-1'
  joints.leftArm.name = 'shoulder--1'
  joints.mouth.name = 'mouth'

  for (const [i, part] of asset.recipe.parts.entries()) {
    const mesh = new Mesh(geometry(part.shape), new MeshStandardMaterial({ color: part.color, roughness: .55 }))
    mesh.name = `part-${i}`
    mesh.position.set(...part.position)
    mesh.scale.set(...part.size)
    mesh.rotation.set(...part.rotation.map(MathUtils.degToRad) as [number, number, number])
    mesh.castShadow = true
    mesh.receiveShadow = true
    joints[part.group].add(mesh)
  }
  // Pivot arms at the shoulder and the mouth around its center without moving any resting geometry.
  for (const [group, joint] of Object.entries(joints)) {
    sculpture.add(joint)
    if (group === 'body') continue
    const bounds = new Box3().setFromObject(joint)
    bounds.getCenter(joint.position)
    if (group !== 'mouth') joint.position.y = bounds.max.y
    for (const mesh of joint.children) mesh.position.sub(joint.position)
  }
  const bounds = new Box3().setFromObject(sculpture)
  const center = bounds.getCenter(new Vector3()), size = bounds.getSize(new Vector3())
  const scale = Math.min(2.7 / size.y, 2.8 / size.x, 2.8 / size.z)
  sculpture.scale.setScalar(scale)
  sculpture.position.set(-center.x * scale, -bounds.min.y * scale, -center.z * scale)
  return {
    model,
    animations: createTiaAnimations(model.name),
    dispose() {
      model.traverse(object => {
        if (object instanceof Mesh) {
          object.geometry.dispose()
          object.material.dispose()
        }
      })
    },
  }
}
