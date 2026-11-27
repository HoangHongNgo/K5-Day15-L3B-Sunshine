import { BufferGeometry, CatmullRomCurve3, ExtrudeGeometry, Float32BufferAttribute, Group, Mesh, MeshStandardMaterial, Shape, SphereGeometry, TorusGeometry, Vector3 } from 'three'
import { createTiaAnimations } from './tiaAnimations'

/** Tia is the built-in fox companion. */
export function createTiaMascot() {
  const model = new Group()
  model.name = 'Tia'
  model.userData = { name: 'Tia', description: 'Cáo vàng đeo khăn đỏ, bạn đồng hành Sunshine.', prototype: true }
  const materials = {
    gold: new MeshStandardMaterial({ color: '#efa62e', roughness: .47 }),
    light: new MeshStandardMaterial({ color: '#fff0d4', roughness: .65 }),
    dark: new MeshStandardMaterial({ color: '#202a35', roughness: .35 }),
    white: new MeshStandardMaterial({ color: '#ffffff', roughness: .3 }),
    pink: new MeshStandardMaterial({ color: '#dc7b63', roughness: .65 }),
    scarf: new MeshStandardMaterial({ color: '#be3e36', roughness: .7 }),
    navy: new MeshStandardMaterial({ color: '#344c64', roughness: .7 }),
  }
  type Color = keyof typeof materials
  function oval(name: string, color: Color, position: [number, number, number], scale: [number, number, number], parent = model) {
    const mesh = new Mesh(new SphereGeometry(1, 32, 24), materials[color])
    mesh.name = name
    mesh.position.set(...position)
    mesh.scale.set(...scale)
    mesh.castShadow = true
    mesh.receiveShadow = true
    parent.add(mesh)
    return mesh
  }
  oval('body', 'gold', [0, 1.02, 0], [.46, .65, .37])
  oval('belly', 'light', [0, 1.02, .29], [.31, .42, .12])
  for (const side of [-1, 1]) {
    oval(`foot-${side}`, 'dark', [side * .24, .16, .13], [.23, .16, .3])
    oval(`leg-${side}`, 'gold', [side * .24, .38, 0], [.17, .29, .17])
    const arm = oval(`arm-${side}`, 'gold', [side * .49, 1.08, .02], [.17, .41, .17])
    arm.rotation.z = side * .3
    oval(`paw-${side}`, 'light', [side * .6, .78, .07], [.16, .18, .17])
  }
  oval('head', 'gold', [0, 1.97, .02], [.7, .59, .52])
  // Bevelled ears have real depth and coloured inner faces, including a back surface.
  const earShape = new Shape()
  earShape.moveTo(-.22, 0)
  earShape.quadraticCurveTo(-.26, .2, -.08, .61)
  earShape.quadraticCurveTo(-.035, .69, .035, .61)
  earShape.quadraticCurveTo(.25, .24, .23, 0)
  earShape.closePath()
  for (const side of [-1, 1]) {
    const ear = new Mesh(new ExtrudeGeometry(earShape, { depth: .13, bevelEnabled: true, bevelSegments: 3, steps: 1, bevelSize: .065, bevelThickness: .07, curveSegments: 12 }), materials.gold)
    ear.name = `ear-${side}`
    ear.position.set(side * .43, 2.3, -.02)
    ear.rotation.z = side * -.18
    ear.castShadow = true
    model.add(ear)
    const inner = oval(`inner-ear-${side}`, 'pink', [side * .46, 2.58, .17], [.115, .23, .035])
    inner.rotation.z = side * -.18
    oval(`cheek-${side}`, 'light', [side * .29, 1.8, .4], [.35, .23, .22])
    oval(`eye-${side}`, 'dark', [side * .255, 2.04, .493], [.082, .108, .044])
    oval(`eye-glint-${side}`, 'white', [side * .255 - .024, 2.077, .532], [.025, .031, .014])
    oval(`blush-${side}`, 'pink', [side * .48, 1.88, .47], [.085, .04, .025])
    const brow = oval(`brow-${side}`, 'gold', [side * .26, 2.22, .47], [.11, .036, .035])
    brow.rotation.z = side * -.15
  }
  oval('nose', 'dark', [0, 1.88, .665], [.105, .065, .055])
  const smile = new Mesh(new TorusGeometry(.085, .012, 8, 20, Math.PI), materials.dark)
  smile.name = 'smile'
  smile.rotation.z = Math.PI
  smile.position.set(0, 1.79, .607)
  const mouth = new Group()
  mouth.name = 'mouth'
  mouth.position.copy(smile.position)
  smile.position.set(0, 0, 0)
  mouth.add(smile)
  model.add(mouth)
  const scarf = new Mesh(new TorusGeometry(.34, .095, 12, 40), materials.scarf)
  scarf.name = 'scarf'
  scarf.rotation.x = Math.PI / 2
  scarf.position.set(0, 1.51, .015)
  scarf.castShadow = true
  model.add(scarf)
  oval('scarf-knot', 'scarf', [.27, 1.48, .29], [.115, .11, .1])
  const ribbon = oval('scarf-ribbon', 'scarf', [.3, 1.26, .37], [.105, .3, .045])
  ribbon.rotation.z = -.23
  oval('backpack', 'navy', [0, 1.02, -.4], [.34, .4, .21])
  oval('backpack-pocket', 'navy', [0, .91, -.59], [.25, .19, .06])
  oval('backpack-button', 'gold', [0, 1.03, -.65], [.045, .045, .018])
  for (const side of [-1, 1]) oval(`strap-${side}`, 'navy', [side * .36, 1.21, -.03], [.065, .3, .31])

  // A tapered curved mesh, rather than a billboard: the tail stays solid at every angle.
  const curve = new CatmullRomCurve3([
    new Vector3(.12, .55, -.27), new Vector3(.65, .5, -.65),
    new Vector3(1.05, .85, -.8), new Vector3(1.1, 1.35, -.72), new Vector3(.87, 1.65, -.62),
  ])
  const length = 40, rings = 20, frames = curve.computeFrenetFrames(length, false)
  const positions: number[] = [], indices: number[] = []
  for (let i = 0; i <= length; i++) {
    const t = i / length
    const point = curve.getPointAt(t)
    const radius = .015 + .26 * Math.pow(Math.sin(Math.PI * t), .7)
    for (let j = 0; j <= rings; j++) {
      const angle = j / rings * Math.PI * 2
      const p = point.clone().addScaledVector(frames.normals[i], Math.cos(angle) * radius).addScaledVector(frames.binormals[i], Math.sin(angle) * radius)
      positions.push(p.x, p.y, p.z)
    }
    if (i < length) for (let j = 0; j < rings; j++) {
      const a = i * (rings + 1) + j, b = a + rings + 1
      indices.push(a, a + 1, b, b, a + 1, b + 1)
    }
  }
  const tailGeometry = new BufferGeometry()
  tailGeometry.setAttribute('position', new Float32BufferAttribute(positions, 3))
  tailGeometry.setIndex(indices)
  tailGeometry.addGroup(0, 28 * rings * 6, 0)
  tailGeometry.addGroup(28 * rings * 6, 12 * rings * 6, 1)
  tailGeometry.computeVertexNormals()
  const tail = new Mesh(tailGeometry, [materials.gold, materials.light])
  tail.name = 'tail'
  tail.castShadow = true
  model.add(tail)

  // Rotate the complete arm and paw at the shoulder without separating the hand.
  model.updateMatrixWorld(true)
  for (const side of [-1, 1]) {
    const shoulder = new Group()
    shoulder.name = `shoulder-${side}`
    shoulder.position.set(side * .42, 1.36, .02)
    model.add(shoulder)
    shoulder.attach(model.getObjectByName(`arm-${side}`)!)
    shoulder.attach(model.getObjectByName(`paw-${side}`)!)
  }
  const animations = createTiaAnimations()

  return {
    model,
    animations,
    dispose() {
      model.traverse(object => { if (object instanceof Mesh) object.geometry.dispose() })
      Object.values(materials).forEach(material => material.dispose())
    },
  }
}
