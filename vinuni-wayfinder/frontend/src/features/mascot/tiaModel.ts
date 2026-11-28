import {
  Bone,
  BufferGeometry,
  CatmullRomCurve3,
  Color,
  CylinderGeometry,
  Float32BufferAttribute,
  Group,
  MathUtils,
  Mesh,
  MeshPhysicalMaterial,
  Object3D,
  Skeleton,
  SkinnedMesh,
  SphereGeometry,
  TorusGeometry,
  Uint16BufferAttribute,
  Vector3,
} from 'three'
import { createTiaAnimations } from './tiaAnimations'

function smoothstep(edge0: number, edge1: number, x: number) {
  const t = MathUtils.clamp((x - edge0) / (edge1 - edge0), 0, 1)
  return t * t * (3 - 2 * t)
}

/** Paint per-vertex colors onto a BufferGeometry for plush multi-tone fox fur. */
function applyVertexColorFn(geometry: BufferGeometry, colorAt: (p: Vector3, n: Vector3) => Color) {
  const pos = geometry.getAttribute('position')
  const norm = geometry.getAttribute('normal')
  const colors = new Float32Array(pos.count * 3)
  const p = new Vector3()
  const n = new Vector3()
  for (let i = 0; i < pos.count; i++) {
    p.fromBufferAttribute(pos, i)
    if (norm) n.fromBufferAttribute(norm, i)
    const c = colorAt(p, n)
    colors[i * 3] = c.r
    colors[i * 3 + 1] = c.g
    colors[i * 3 + 2] = c.b
  }
  geometry.setAttribute('color', new Float32BufferAttribute(colors, 3))
  return geometry
}

/** Attach normalized 4-bone skinIndex + skinWeight attributes to a geometry in model space. */
function applySkinWeights(
  geometry: BufferGeometry,
  weightAt: (p: Vector3) => { indices: [number, number, number, number]; weights: [number, number, number, number] },
) {
  const pos = geometry.getAttribute('position')
  const indices = new Uint16Array(pos.count * 4)
  const weights = new Float32Array(pos.count * 4)
  const p = new Vector3()
  for (let i = 0; i < pos.count; i++) {
    p.fromBufferAttribute(pos, i)
    const { indices: idx, weights: w } = weightAt(p)
    const sum = w[0] + w[1] + w[2] + w[3] || 1
    for (let k = 0; k < 4; k++) {
      indices[i * 4 + k] = idx[k]
      weights[i * 4 + k] = w[k] / sum
    }
  }
  geometry.setAttribute('skinIndex', new Uint16BufferAttribute(indices, 4))
  geometry.setAttribute('skinWeight', new Float32BufferAttribute(weights, 4))
  return geometry
}

/**
 * Seamless skinned plush limb tube (rounded cap at shoulder/hip, smooth bend across elbow/knee,
 * tapered cuff at wrist/ankle) so arms and legs never look like segmented beads.
 */
function createSkinnedLimbGeometry(
  curvePoints: Vector3[],
  radiiAt: (t: number) => number,
  colorAt: (t: number) => Color,
  boneTriplet: [number, number, number],
) {
  const curve = new CatmullRomCurve3(curvePoints)
  const steps = 28
  const rings = 20
  const frames = curve.computeFrenetFrames(steps, false)
  const positions: number[] = []
  const colors: number[] = []
  const skinIdx: number[] = []
  const skinWgt: number[] = []
  const indices: number[] = []

  for (let i = 0; i <= steps; i++) {
    const t = i / steps
    const center = curve.getPointAt(t)
    // Hemispherical end-caps at t -> 0 and t -> 1
    const cap = t < 0.08 ? Math.sqrt(Math.max(0, 1 - Math.pow((0.08 - t) / 0.08, 2)))
      : t > 0.92 ? Math.sqrt(Math.max(0, 1 - Math.pow((t - 0.92) / 0.08, 2)))
      : 1
    const r = radiiAt(t) * Math.max(0.004, cap)
    const col = colorAt(t)

    // Smooth blend from proximal (root/shoulder/hip) -> upper bone -> lower bone
    const wLower = smoothstep(0.40, 0.68, t)
    const wRoot = 1 - smoothstep(0.0, 0.22, t)
    const wUpper = Math.max(0, 1 - wLower - wRoot)
    const wSum = wRoot + wUpper + wLower || 1

    for (let j = 0; j <= rings; j++) {
      const a = (j / rings) * Math.PI * 2
      const p = center
        .clone()
        .addScaledVector(frames.normals[i], Math.cos(a) * r)
        .addScaledVector(frames.binormals[i], Math.sin(a) * r)
      positions.push(p.x, p.y, p.z)
      colors.push(col.r, col.g, col.b)
      skinIdx.push(boneTriplet[0], boneTriplet[1], boneTriplet[2], 0)
      skinWgt.push(wRoot / wSum, wUpper / wSum, wLower / wSum, 0)
    }
    if (i < steps) {
      for (let j = 0; j < rings; j++) {
        const a = i * (rings + 1) + j
        const b = a + rings + 1
        indices.push(a, a + 1, b, b, a + 1, b + 1)
      }
    }
  }

  const geo = new BufferGeometry()
  geo.setAttribute('position', new Float32BufferAttribute(positions, 3))
  geo.setAttribute('color', new Float32BufferAttribute(colors, 3))
  geo.setAttribute('skinIndex', new Uint16BufferAttribute(skinIdx, 4))
  geo.setAttribute('skinWeight', new Float32BufferAttribute(skinWgt, 4))
  geo.setIndex(indices)
  geo.computeVertexNormals()
  geo.normalizeNormals()
  return geo
}

/**
 * Parametric cupped 3D fox ear with generous plush width, smooth rounded tip,
 * concave front hollow, convex back shell, and natural dark russet-brown ear tips.
 */
function createCuppedFoxEarGeometry(side: number) {
  const stacks = 24
  const slices = 30
  const positions: number[] = []
  const indices: number[] = []
  const baseOrange = new Color('#f59830')
  const warmAmber = new Color('#e47823')
  const russetTip = new Color('#4d291d')

  for (let i = 0; i <= stacks; i++) {
    const v = i / stacks
    // Generous cute fox ear silhouette with soft rounded tip
    const widthProfile = Math.pow(1 - v, 0.56) * (0.26 + 0.055 * Math.sin(Math.PI * v))
    const height = v * 0.68
    const forwardBend = 0.048 * v * v

    for (let j = 0; j <= slices; j++) {
      const theta = (j / slices) * Math.PI * 2
      const cosT = Math.cos(theta)
      const sinT = Math.sin(theta)

      const x = cosT * widthProfile - side * 0.016 * v
      const cupDepth = sinT > 0
        ? (0.076 * sinT - 0.036 * Math.pow(sinT, 2) * Math.sin(Math.PI * v)) * (1 - 0.62 * v)
        : 0.105 * sinT * (1 - 0.55 * v)
      const z = cupDepth + forwardBend
      positions.push(x, height, z)
    }
  }

  for (let i = 0; i < stacks; i++) {
    for (let j = 0; j < slices; j++) {
      const a = i * (slices + 1) + j
      const b = a + slices + 1
      indices.push(a, a + 1, b, b, a + 1, b + 1)
    }
  }
  const bottomCenterIndex = positions.length / 3
  positions.push(0, 0, 0)
  for (let j = 0; j < slices; j++) {
    indices.push(bottomCenterIndex, j + 1, j)
  }

  const geo = new BufferGeometry()
  geo.setAttribute('position', new Float32BufferAttribute(positions, 3))
  geo.setIndex(indices)
  geo.computeVertexNormals()
  geo.normalizeNormals()

  return applyVertexColorFn(geo, p => {
    const v = MathUtils.clamp(p.y / 0.68, 0, 1)
    const mid = baseOrange.clone().lerp(warmAmber, smoothstep(0.22, 0.62, v))
    return mid.lerp(russetTip, smoothstep(0.62, 0.92, v))
  })
}

/** Tia is Sunshine's built-in 3D rigged plush fox companion. */
export function createTiaMascot() {
  const model = new Group()
  model.name = 'Tia'
  model.userData = {
    name: 'Tia',
    description: 'Cáo bông đeo khăn len đỏ và ba lô thám hiểm, bạn đồng hành 3D của Sunshine.',
    prototype: false,
  }

  const materials = {
    fur: new MeshPhysicalMaterial({
      color: '#ffffff',
      vertexColors: true,
      roughness: 0.55,
      metalness: 0.0,
      sheen: 0.9,
      sheenRoughness: 0.42,
      sheenColor: new Color('#ffe4be'),
    }),
    orangeFur: new MeshPhysicalMaterial({
      color: '#f59830',
      roughness: 0.55,
      sheen: 0.88,
      sheenRoughness: 0.42,
      sheenColor: new Color('#ffe2b8'),
    }),
    creamFur: new MeshPhysicalMaterial({
      color: '#fff8ec',
      roughness: 0.58,
      sheen: 0.86,
      sheenRoughness: 0.45,
      sheenColor: new Color('#ffffff'),
    }),
    innerEar: new MeshPhysicalMaterial({
      color: '#f2a496',
      roughness: 0.62,
      sheen: 0.78,
      sheenRoughness: 0.48,
      sheenColor: new Color('#ffddd6'),
    }),
    blush: new MeshPhysicalMaterial({
      color: '#f7887e',
      roughness: 0.65,
      sheen: 0.55,
      sheenColor: new Color('#ffc8c2'),
    }),
    glossDark: new MeshPhysicalMaterial({
      color: '#18202b',
      roughness: 0.11,
      metalness: 0.02,
      clearcoat: 1.0,
      clearcoatRoughness: 0.05,
    }),
    amberIris: new MeshPhysicalMaterial({
      color: '#da862c',
      roughness: 0.15,
      clearcoat: 0.95,
      clearcoatRoughness: 0.08,
    }),
    sparkle: new MeshPhysicalMaterial({
      color: '#ffffff',
      emissive: new Color('#ffffff'),
      emissiveIntensity: 0.28,
      roughness: 0.06,
      clearcoat: 1.0,
    }),
    eyelid: new MeshPhysicalMaterial({
      color: '#542d1e',
      roughness: 0.48,
    }),
    tongue: new MeshPhysicalMaterial({
      color: '#eb6c72',
      roughness: 0.4,
      clearcoat: 0.45,
      clearcoatRoughness: 0.22,
    }),
    scarf: new MeshPhysicalMaterial({
      color: '#d23834',
      roughness: 0.66,
      sheen: 0.95,
      sheenRoughness: 0.48,
      sheenColor: new Color('#ffb0a8'),
    }),
    bootUpper: new MeshPhysicalMaterial({
      color: '#253344',
      roughness: 0.4,
      clearcoat: 0.28,
      clearcoatRoughness: 0.35,
    }),
    bootSole: new MeshPhysicalMaterial({
      color: '#f7efe0',
      roughness: 0.66,
    }),
    backpack: new MeshPhysicalMaterial({
      color: '#2f4863',
      roughness: 0.62,
      sheen: 0.45,
      sheenColor: new Color('#7fa1c4'),
    }),
    brass: new MeshPhysicalMaterial({
      color: '#ebb137',
      roughness: 0.28,
      metalness: 0.55,
      clearcoat: 0.5,
    }),
  }
  type MaterialKey = keyof typeof materials

  // 1. Build the humanoid skeleton with fox ears, jaw, and tail.
  const bones: Bone[] = []
  function makeBone(name: string, position: [number, number, number], parent: Object3D): Bone {
    const bone = new Bone()
    bone.name = name
    bone.position.set(...position)
    parent.add(bone)
    bones.push(bone)
    return bone
  }

  const hips = makeBone('Hips', [0, 0.62, 0], model)
  const spine = makeBone('Spine', [0, 0.24, 0], hips)
  const chest = makeBone('Chest', [0, 0.30, 0], spine)
  const neck = makeBone('Neck', [0, 0.32, 0.01], chest)
  const scarfTail = makeBone('ScarfTail', [0.26, -0.02, 0.30], neck)
  const head = makeBone('Head', [0, 0.42, 0.02], neck)
  const leftEarBone = makeBone('LeftEar', [-0.37, 0.36, -0.02], head)
  const rightEarBone = makeBone('RightEar', [0.37, 0.36, -0.02], head)
  const mouthBone = makeBone('mouth', [0, -0.11, 0.675], head)

  const leftShoulder = makeBone('shoulder--1', [-0.23, 0.20, 0.01], chest)
  const leftUpperArm = makeBone('LeftUpperArm', [-0.13, -0.02, 0], leftShoulder)
  const leftForeArm = makeBone('LeftForeArm', [-0.10, -0.25, 0.02], leftUpperArm)
  const leftHand = makeBone('LeftHand', [-0.09, -0.27, 0.05], leftForeArm)

  const rightShoulder = makeBone('shoulder-1', [0.23, 0.20, 0.01], chest)
  const rightUpperArm = makeBone('RightUpperArm', [0.13, -0.02, 0], rightShoulder)
  const rightForeArm = makeBone('RightForeArm', [0.10, -0.25, 0.02], rightUpperArm)
  const rightHand = makeBone('RightHand', [0.09, -0.27, 0.05], rightForeArm)

  const leftUpLeg = makeBone('LeftUpLeg', [-0.22, -0.06, 0], hips)
  const leftLeg = makeBone('LeftLeg', [0, -0.20, 0.01], leftUpLeg)
  const leftFoot = makeBone('LeftFoot', [0, -0.20, 0.03], leftLeg)

  const rightUpLeg = makeBone('RightUpLeg', [0.22, -0.06, 0], hips)
  const rightLeg = makeBone('RightLeg', [0, -0.20, 0.01], rightUpLeg)
  const rightFoot = makeBone('RightFoot', [0, -0.20, 0.03], rightLeg)

  const tail1 = makeBone('Tail1', [0.12, -0.07, -0.27], hips)
  const tail2 = makeBone('Tail2', [0.60, 0.08, -0.45], tail1)
  makeBone('Tail3', [0.33, 0.52, -0.04], tail2)

  const boneIdx = Object.fromEntries(bones.map((b, i) => [b.name, i])) as Record<string, number>
  model.updateMatrixWorld(true)
  const skeleton = new Skeleton(bones)

  function addSkinned(name: string, geo: BufferGeometry, mat: MaterialKey) {
    const mesh = new SkinnedMesh(geo, materials[mat])
    mesh.name = name
    mesh.castShadow = true
    mesh.receiveShadow = true
    model.add(mesh)
    mesh.bind(skeleton)
    mesh.computeBoundingBox()
    mesh.computeBoundingSphere()
    return mesh
  }

  function part(
    name: string,
    geometry: BufferGeometry,
    mat: MaterialKey,
    position: [number, number, number],
    scale: [number, number, number],
    parent: Object3D,
  ) {
    const mesh = new Mesh(geometry, materials[mat])
    mesh.name = name
    mesh.position.set(...position)
    mesh.scale.set(...scale)
    mesh.castShadow = true
    mesh.receiveShadow = true
    parent.add(mesh)
    return mesh
  }

  function ellipsoid(
    name: string,
    mat: MaterialKey,
    position: [number, number, number],
    scale: [number, number, number],
    parent: Object3D,
    segments: [number, number] = [32, 24],
  ) {
    return part(name, new SphereGeometry(1, segments[0], segments[1]), mat, position, scale, parent)
  }

  const sunOrange = new Color('#f69b33')
  const warmCinnamon = new Color('#df7423')
  const pawSockRusset = new Color('#c95e20')
  const creamMask = new Color('#fff8ec')
  const tv = new Vector3()

  // 2. Skinned Plush Torso ('body') & Soft Cream Belly
  const rawTorso = new SphereGeometry(1, 40, 32)
  const torsoPos = rawTorso.getAttribute('position')
  for (let i = 0; i < torsoPos.count; i++) {
    tv.fromBufferAttribute(torsoPos, i)
    const pear = 1 - 0.14 * tv.y
    const x = tv.x * 0.47 * pear
    const y = 1.03 + tv.y * 0.62
    const z = tv.z * 0.39 * pear + (tv.z > 0 ? 0.022 * (1 - tv.y * tv.y) : 0)
    torsoPos.setXYZ(i, x, y, z)
  }
  rawTorso.computeVertexNormals()
  rawTorso.normalizeNormals()
  applyVertexColorFn(rawTorso, p => warmCinnamon.clone().lerp(sunOrange, smoothstep(0.45, 1.55, p.y)))
  applySkinWeights(rawTorso, p => {
    const wChest = smoothstep(1.02, 1.42, p.y)
    const wHips = 1 - smoothstep(0.55, 0.96, p.y)
    const wSpine = Math.max(0, 1 - wChest - wHips)
    return { indices: [boneIdx.Hips, boneIdx.Spine, boneIdx.Chest, 0], weights: [wHips, wSpine, wChest, 0] }
  })
  addSkinned('body', rawTorso, 'fur')

  const rawBelly = new SphereGeometry(1, 32, 24)
  const bellyPos = rawBelly.getAttribute('position')
  for (let i = 0; i < bellyPos.count; i++) {
    tv.fromBufferAttribute(bellyPos, i)
    const pear = 1 - 0.12 * tv.y
    bellyPos.setXYZ(i, tv.x * 0.31 * pear, 0.99 + tv.y * 0.41, 0.305 + tv.z * 0.12)
  }
  rawBelly.computeVertexNormals()
  rawBelly.normalizeNormals()
  applySkinWeights(rawBelly, p => {
    const wChest = smoothstep(1.02, 1.36, p.y)
    const wHips = 1 - smoothstep(0.58, 0.94, p.y)
    const wSpine = Math.max(0, 1 - wChest - wHips)
    return { indices: [boneIdx.Hips, boneIdx.Spine, boneIdx.Chest, 0], weights: [wHips, wSpine, wChest, 0] }
  })
  addSkinned('belly', rawBelly, 'creamFur')

  // Cute 3-petal fluffy chest fur ruff right under the scarf
  ellipsoid('chest-tuft-center', 'creamFur', [0, 0.21, 0.375], [0.105, 0.12, 0.075], chest, [20, 16]).rotation.x = 0.2
  for (const side of [-1, 1] as const) {
    const petal = ellipsoid(`chest-tuft-${side}`, 'creamFur', [side * 0.082, 0.22, 0.355], [0.075, 0.095, 0.065], chest, [18, 14])
    petal.rotation.set(0.18, 0, side * -0.35)
  }

  // 3. Seamless Skinned Plush Arms & Legs + Cute Fox Paws & Explorer Mini-Boots
  for (const side of [-1, 1] as const) {
    const foreArmBone = side === -1 ? leftForeArm : rightForeArm
    const handBone = side === -1 ? leftHand : rightHand
    const footBone = side === -1 ? leftFoot : rightFoot
    const armBones: [number, number, number] = side === -1
      ? [boneIdx['shoulder--1'], boneIdx.LeftUpperArm, boneIdx.LeftForeArm]
      : [boneIdx['shoulder-1'], boneIdx.RightUpperArm, boneIdx.RightForeArm]
    const legBones: [number, number, number] = side === -1
      ? [boneIdx.Hips, boneIdx.LeftUpLeg, boneIdx.LeftLeg]
      : [boneIdx.Hips, boneIdx.RightUpLeg, boneIdx.RightLeg]

    // Continuous skinned plush arm sleeve (zero bead seams!)
    const armGeo = createSkinnedLimbGeometry(
      [
        new Vector3(side * 0.32, 1.37, 0.02),
        new Vector3(side * 0.41, 1.22, 0.025),
        new Vector3(side * 0.48, 1.05, 0.04),
        new Vector3(side * 0.54, 0.87, 0.07),
      ],
      t => 0.148 - 0.022 * t + 0.012 * Math.sin(Math.PI * t),
      t => sunOrange.clone().lerp(pawSockRusset, smoothstep(0.55, 0.98, t) * 0.55),
      armBones,
    )
    addSkinned(`arm-sleeve-${side}`, armGeo, 'fur')

    // Rigid forearm reference marker ('arm-1' / 'arm--1') so forearm-to-paw distance is exact under any shoulder/elbow bend
    const armAnchor = new Object3D()
    armAnchor.name = `arm-${side}`
    foreArmBone.add(armAnchor)

    // Continuous skinned plush leg (zero bead seams!)
    const legGeo = createSkinnedLimbGeometry(
      [
        new Vector3(side * 0.22, 0.63, 0.0),
        new Vector3(side * 0.22, 0.48, 0.005),
        new Vector3(side * 0.22, 0.34, 0.015),
        new Vector3(side * 0.22, 0.20, 0.035),
      ],
      t => 0.168 - 0.032 * t,
      t => warmCinnamon.clone().lerp(pawSockRusset, smoothstep(0.45, 0.95, t) * 0.6),
      legBones,
    )
    addSkinned(`leg-${side}`, legGeo, 'fur')

    // Plump cream fox paw + adorable pink palm & 3 toe-bean cushions
    const pawGroup = ellipsoid(`paw-${side}`, 'creamFur', [0, 0, 0], [0.156, 0.162, 0.156], handBone)
    ellipsoid(`paw-pad-${side}`, 'blush', [0, -0.10, 0.64], [0.34, 0.28, 0.18], pawGroup, [16, 12])
    for (const [ti, tx, ty] of [[-1, -0.32, 0.24], [0, 0, 0.34], [1, 0.32, 0.24]] as const) {
      ellipsoid(`toe-bean-${side}-${ti}`, 'blush', [tx, ty, 0.68], [0.13, 0.14, 0.14], pawGroup, [12, 10])
    }

    // Explorer Mini-Boot ('foot-1' / 'foot--1') with cream rubber sole & toe bumper, bottom resting cleanly at y = 0
    const bootUpper = ellipsoid(`foot-${side}`, 'bootUpper', [0, -0.03, 0.09], [0.205, 0.122, 0.275], footBone)
    bootUpper.receiveShadow = true
    part(
      `boot-sole-${side}`,
      new CylinderGeometry(1, 1.03, 1, 28),
      'bootSole',
      [0, -0.132, 0.09],
      [0.212, 0.056, 0.285],
      footBone,
    )
    ellipsoid(`boot-toe-${side}`, 'bootSole', [0, -0.075, 0.275], [0.165, 0.066, 0.108], footBone, [20, 14])
    ellipsoid(`boot-cuff-${side}`, 'scarf', [0, 0.052, 0.03], [0.162, 0.04, 0.172], footBone, [20, 14])
  }

  // 4. Sculpted Kawaii Red-Fox Head with Integrated Fluffy Cheek Ruffs & Vertex-Colored Fox Mask!
  const headGeo = new SphereGeometry(1, 48, 38)
  const hp = headGeo.getAttribute('position')
  for (let i = 0; i < hp.count; i++) {
    tv.fromBufferAttribute(hp, i)
    // Soft plush kawaii lower cheeks + gentle fox-ruff silhouette on left & right sides
    const cheekBand = Math.exp(-Math.pow((tv.y + 0.24) / 0.36, 2))
    const sideFlare = Math.pow(Math.abs(tv.x), 1.8) * cheekBand * 0.095
    const frontSnoutPush = tv.z > 0
      ? Math.exp(-Math.pow(tv.x / 0.44, 2) - Math.pow((tv.y + 0.20) / 0.30, 2)) * 0.10 * tv.z
      : 0
    const x = tv.x * (0.70 + 0.065 * cheekBand) + Math.sign(tv.x) * sideFlare
    const y = tv.y * 0.59
    const z = tv.z * 0.55 + frontSnoutPush
    hp.setXYZ(i, x, y, z)
  }
  headGeo.computeVertexNormals()
  headGeo.normalizeNormals()

  // Authentic red-fox M-shaped cream cheek/jaw mask blended seamlessly into golden-orange forehead
  applyVertexColorFn(headGeo, p => {
    const crown = smoothstep(-0.35, 0.52, p.y)
    const orange = warmCinnamon.clone().lerp(sunOrange, 0.35 + 0.65 * crown)
    if (p.z < -0.05) return orange
    // Classic red-fox widow's peak: cream rises slightly over the outer cheeks and dips into a cute V under the nose bridge
    const maskTopY = -0.09 + 0.11 * Math.sin(Math.min(1, Math.abs(p.x) / 0.48) * Math.PI * 0.85) - 0.06 * Math.exp(-Math.pow(p.x / 0.14, 2))
    const frontMask = smoothstep(0.02, 0.24, p.z) * (1 - smoothstep(maskTopY - 0.045, maskTopY + 0.045, p.y))
    return orange.lerp(creamMask, frontMask)
  })
  part('head', headGeo, 'fur', [0, 0.07, 0], [1, 1, 1], head)

  // Cute fluffy crown hair tuft on top of Tia's head
  for (const [idx, ox, oy, rotZ] of [[0, 0, 0.65, 0.08], [1, 0.068, 0.63, -0.34]] as const) {
    const tuft = ellipsoid(`crown-tuft-${idx}`, 'orangeFur', [ox, oy, 0.07], [0.052, 0.095, 0.048], head, [16, 12])
    tuft.rotation.set(0.24, 0, rotZ)
  }

  // Soft plump cream snout cushion right under the glossy nose (flush with the seamless fox mask)
  ellipsoid('snout', 'creamFur', [0, -0.06, 0.55], [0.20, 0.125, 0.15], head)

  for (const side of [-1, 1] as const) {
    const earBone = side === -1 ? leftEarBone : rightEarBone
    const earMesh = new Mesh(createCuppedFoxEarGeometry(side), materials.fur)
    earMesh.name = `ear-${side}`
    earMesh.rotation.z = side * -0.18
    earMesh.rotation.x = 0.05
    earMesh.castShadow = true
    earMesh.receiveShadow = true
    earBone.add(earMesh)

    const innerEar = ellipsoid(`inner-ear-${side}`, 'innerEar', [side * 0.036, 0.27, 0.052], [0.132, 0.235, 0.035], earBone, [24, 18])
    innerEar.rotation.z = side * -0.18
    innerEar.rotation.x = 0.05

    // Fluffy cream ear-base fur tuft nestled inside the lower ear hollow
    const earTuft = ellipsoid(`ear-tuft-${side}`, 'creamFur', [side * 0.015, 0.10, 0.078], [0.105, 0.075, 0.048], earBone, [18, 14])
    earTuft.rotation.z = side * 0.3

    // Expressive sparkling eyes: glossy dark iris + warm amber crescent + 2 catchlights + upper lash arc
    const eyeX = side * 0.245
    const eyeY = 0.125
    const eyeZ = 0.505
    const eye = ellipsoid(`eye-${side}`, 'glossDark', [eyeX, eyeY, eyeZ], [0.092, 0.116, 0.054], head, [28, 22])
    eye.rotation.y = side * 0.15
    const iris = ellipsoid(`eye-iris-${side}`, 'amberIris', [eyeX, eyeY - 0.034, eyeZ + 0.035], [0.06, 0.05, 0.025], head, [20, 16])
    iris.rotation.y = side * 0.15
    ellipsoid(`eye-glint-${side}`, 'sparkle', [eyeX - 0.027, eyeY + 0.04, eyeZ + 0.05], [0.03, 0.036, 0.016], head, [16, 12])
    ellipsoid(`eye-glint-sub-${side}`, 'sparkle', [eyeX + 0.027, eyeY - 0.035, eyeZ + 0.048], [0.015, 0.017, 0.012], head, [14, 10])

    const lash = new Mesh(new TorusGeometry(0.092, 0.013, 10, 24, Math.PI * 0.86), materials.eyelid)
    lash.name = `eyelid-${side}`
    lash.position.set(eyeX, eyeY + 0.018, eyeZ + 0.036)
    lash.rotation.z = Math.PI * 0.07
    lash.rotation.y = side * 0.15
    head.add(lash)

    // Cheerful soft cream Shiba-fox pip eyebrows
    const brow = ellipsoid(`brow-${side}`, 'creamFur', [side * 0.225, 0.295, 0.475], [0.082, 0.036, 0.035], head, [20, 14])
    brow.rotation.z = side * 0.10
    brow.rotation.y = side * 0.14

    // Soft rosy coral blush right below the outer eye corners, flush on the cheek surface
    const blush = ellipsoid(`blush-${side}`, 'blush', [side * 0.38, -0.01, 0.475], [0.092, 0.048, 0.036], head, [20, 14])
    blush.rotation.y = side * 0.34
  }

  // Glossy heart-rounded dark fox nose + crisp twin-curve 'ω' fox smile clearly in front of the snout!
  const nose = ellipsoid('nose', 'glossDark', [0, -0.005, 0.695], [0.092, 0.062, 0.058], head, [26, 20])
  nose.rotation.x = 0.14

  const philtrum = ellipsoid('philtrum', 'glossDark', [0, 0.055, 0.024], [0.009, 0.028, 0.01], mouthBone, [12, 10])
  philtrum.rotation.x = -0.1

  for (const side of [-1, 1] as const) {
    const curve = new Mesh(new TorusGeometry(0.046, 0.012, 10, 22, Math.PI * 0.94), materials.glossDark)
    curve.name = side === 1 ? 'smile' : 'smile-left'
    curve.rotation.z = Math.PI * 1.03
    curve.position.set(side * 0.045, 0.032, 0.025)
    mouthBone.add(curve)
  }
  ellipsoid('mouth-cavity', 'tongue', [0, -0.004, 0.012], [0.048, 0.024, 0.022], mouthBone, [18, 14])

  // 5. Cozy Knitted Red Scarf + Swaying Ribbons + Explorer Campus Backpack
  const scarfMain = new Mesh(new TorusGeometry(0.35, 0.086, 16, 44), materials.scarf)
  scarfMain.name = 'scarf'
  scarfMain.rotation.x = Math.PI / 2 + 0.06
  scarfMain.position.set(0, 0.03, 0.01)
  scarfMain.castShadow = true
  neck.add(scarfMain)

  const scarfFold = new Mesh(new TorusGeometry(0.32, 0.06, 14, 38), materials.scarf)
  scarfFold.name = 'scarf-fold'
  scarfFold.rotation.x = Math.PI / 2 - 0.05
  scarfFold.rotation.y = 0.08
  scarfFold.position.set(0, 0.088, 0.015)
  scarfFold.castShadow = true
  neck.add(scarfFold)

  ellipsoid('scarf-knot', 'scarf', [0, 0, 0], [0.112, 0.102, 0.096], scarfTail, [22, 18])
  const ribbonFront = ellipsoid('scarf-ribbon', 'scarf', [0.04, -0.22, 0.05], [0.096, 0.265, 0.044], scarfTail, [22, 18])
  ribbonFront.rotation.z = -0.2
  const ribbonBack = ellipsoid('scarf-ribbon-sub', 'scarf', [-0.04, -0.17, 0.02], [0.08, 0.195, 0.038], scarfTail, [20, 16])
  ribbonBack.rotation.z = 0.08

  ellipsoid('backpack', 'backpack', [0, -0.12, -0.39], [0.34, 0.39, 0.21], chest)
  ellipsoid('backpack-flap', 'backpack', [0, 0.11, -0.43], [0.31, 0.15, 0.19], chest)
  ellipsoid('backpack-pocket', 'backpack', [0, -0.23, -0.57], [0.25, 0.18, 0.075], chest)
  ellipsoid('backpack-button', 'brass', [0, -0.10, -0.63], [0.046, 0.046, 0.022], chest, [20, 16])
  const handle = new Mesh(new TorusGeometry(0.085, 0.018, 10, 22, Math.PI), materials.backpack)
  handle.name = 'backpack-handle'
  handle.position.set(0, 0.27, -0.37)
  chest.add(handle)
  for (const side of [-1, 1] as const) {
    ellipsoid(`strap-${side}`, 'backpack', [side * 0.35, 0.05, -0.03], [0.062, 0.29, 0.30], chest)
  }

  // 6. Skinned 3-Bone Fluffy S-Curved Fox Tail with 5-Petal Feathered Cream Tip
  const tailCurve = new CatmullRomCurve3([
    new Vector3(0.10, 0.54, -0.26),
    new Vector3(0.64, 0.50, -0.66),
    new Vector3(1.05, 0.85, -0.82),
    new Vector3(1.12, 1.38, -0.74),
    new Vector3(0.86, 1.72, -0.60),
  ])
  const tailLength = 48
  const tailRings = 26
  const frames = tailCurve.computeFrenetFrames(tailLength, false)
  const tailPositions: number[] = []
  const tailColors: number[] = []
  const tailSkinIdx: number[] = []
  const tailSkinWgt: number[] = []
  const tailIndices: number[] = []
  const creamColor = new Color('#fff8ec')
  const tailOrange = new Color('#f4932b')
  const tailRusset = new Color('#d96820')

  for (let i = 0; i <= tailLength; i++) {
    const t = i / tailLength
    const point = tailCurve.getPointAt(t)
    const radius = 0.018 + 0.288 * Math.pow(Math.sin(Math.PI * t), 0.68)

    const w3 = smoothstep(0.52, 0.82, t)
    const w1 = 1 - smoothstep(0.18, 0.48, t)
    const w2 = Math.max(0, 1 - w1 - w3)
    const wSum = w1 + w2 + w3 || 1

    for (let j = 0; j <= tailRings; j++) {
      const angle = (j / tailRings) * Math.PI * 2
      const p = point
        .clone()
        .addScaledVector(frames.normals[i], Math.cos(angle) * radius)
        .addScaledVector(frames.binormals[i], Math.sin(angle) * radius)
      tailPositions.push(p.x, p.y, p.z)

      const featherThreshold = 0.67 + 0.055 * Math.cos(angle * 5)
      const tipMix = smoothstep(featherThreshold - 0.04, featherThreshold + 0.04, t)
      const baseShade = tailRusset.clone().lerp(tailOrange, smoothstep(0, 0.55, t))
      const c = baseShade.lerp(creamColor, tipMix)
      tailColors.push(c.r, c.g, c.b)

      tailSkinIdx.push(boneIdx.Tail1, boneIdx.Tail2, boneIdx.Tail3, 0)
      tailSkinWgt.push(w1 / wSum, w2 / wSum, w3 / wSum, 0)
    }

    if (i < tailLength) {
      for (let j = 0; j < tailRings; j++) {
        const a = i * (tailRings + 1) + j
        const b = a + tailRings + 1
        tailIndices.push(a, a + 1, b, b, a + 1, b + 1)
      }
    }
  }

  const tailGeometry = new BufferGeometry()
  tailGeometry.setAttribute('position', new Float32BufferAttribute(tailPositions, 3))
  tailGeometry.setAttribute('color', new Float32BufferAttribute(tailColors, 3))
  tailGeometry.setAttribute('skinIndex', new Uint16BufferAttribute(tailSkinIdx, 4))
  tailGeometry.setAttribute('skinWeight', new Float32BufferAttribute(tailSkinWgt, 4))
  tailGeometry.setIndex(tailIndices)
  tailGeometry.computeVertexNormals()
  tailGeometry.normalizeNormals()
  addSkinned('tail', tailGeometry, 'fur')

  model.updateMatrixWorld(true)
  const animations = createTiaAnimations('Tia', { humanoid: true })

  return {
    model,
    skeleton,
    animations,
    dispose() {
      model.traverse(object => {
        if (object instanceof Mesh) object.geometry.dispose()
      })
      Object.values(materials).forEach(material => material.dispose())
    },
  }
}
