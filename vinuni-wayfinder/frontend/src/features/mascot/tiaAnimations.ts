import { AnimationClip, Euler, Object3D, Quaternion, QuaternionKeyframeTrack, Vector3, VectorKeyframeTrack } from 'three'

export type TiaMotion = 'walk' | 'wave' | 'jump' | 'dance'
export type TiaClipName = 'idle' | TiaMotion | 'talk'

export type MascotPatrolState = {
  angle: number
  radiusX: number
  radiusZ: number
  angularSpeed: number
}

export function createMascotPatrol(radiusX = 0.52, radiusZ = 0.36, angularSpeed = 1.25): MascotPatrolState {
  return { angle: 0, radiusX, radiusZ, angularSpeed }
}

/** Moves the mascot root along a smooth oval stroll path while steering it toward the velocity tangent. */
export function stepMascotPatrol(model: Object3D, state: MascotPatrolState, delta: number) {
  state.angle = (state.angle + delta * state.angularSpeed) % (Math.PI * 2)
  const a = state.angle
  // Start at (0, 0) when angle = 0 via shifted ellipse x = rx * sin(a), z = rz * (1 - cos(a)) - rz * 0.5 * sin^2...
  // Using centered smooth loop starting smoothly from origin blend:
  const x = Math.sin(a) * state.radiusX
  const z = (Math.cos(a) - 1) * state.radiusZ * 0.5 + Math.sin(a * 2) * 0.08
  const dx = Math.cos(a) * state.radiusX
  const dz = -Math.sin(a) * state.radiusZ * 0.5 + Math.cos(a * 2) * 0.16
  model.position.set(x, 0, z)
  const yaw = Math.atan2(dx, dz)
  model.quaternion.setFromAxisAngle(new Vector3(0, 1, 0), yaw)
}

export function resetMascotPatrol(model: Object3D, state: MascotPatrolState) {
  state.angle = 0
  model.position.set(0, 0, 0)
  model.quaternion.identity()
}

function eulerTrack(node: string, times: number[], rotations: [number, number, number][]) {
  const e = new Euler()
  const q = new Quaternion()
  const values = rotations.flatMap(([rx, ry, rz]) => {
    e.set(rx, ry, rz, 'XYZ')
    return q.setFromEuler(e).toArray()
  })
  return new QuaternionKeyframeTrack(`${node}.quaternion`, times, values)
}

function axisTrack(node: string, axis: Vector3, times: number[], angles: number[]) {
  const q = new Quaternion()
  return new QuaternionKeyframeTrack(
    `${node}.quaternion`,
    times,
    angles.flatMap(angle => q.setFromAxisAngle(axis, angle).toArray()),
  )
}

/**
 * Procedural skeletal keyframe clips for Tia's humanoid rig with fox ears and tail
 * and fallback 4-joint clips for club-generated recipe mascots.
 */
export function createTiaAnimations(root = 'Tia', options: { humanoid?: boolean } = {}): AnimationClip[] {
  const humanoid = options.humanoid ?? (root === 'Tia')
  const yAxis = new Vector3(0, 1, 0)
  const zAxis = new Vector3(0, 0, 1)

  if (!humanoid) {
    const idle = new AnimationClip('idle', 2.8, [
      new VectorKeyframeTrack(`${root}.position`, [0, 0.7, 1.4, 2.1, 2.8], [
        0, 0, 0, 0, 0.025, 0, 0, 0, 0, 0, 0.025, 0, 0, 0, 0,
      ]),
      axisTrack('shoulder-1', zAxis, [0, 1.4, 2.8], [0, 0.08, 0]),
      axisTrack('shoulder--1', zAxis, [0, 1.4, 2.8], [0, -0.08, 0]),
    ])
    const walk = new AnimationClip('walk', 1.0, [
      new VectorKeyframeTrack(`${root}.position`, [0, 0.25, 0.5, 0.75, 1.0], [
        0, 0, 0, 0, 0.06, 0, 0, 0, 0, 0, 0.06, 0, 0, 0, 0,
      ]),
      eulerTrack('shoulder-1', [0, 0.25, 0.5, 0.75, 1.0], [
        [0, 0, 0], [0.45, 0, 0.1], [0, 0, 0], [-0.45, 0, 0.1], [0, 0, 0],
      ]),
      eulerTrack('shoulder--1', [0, 0.25, 0.5, 0.75, 1.0], [
        [0, 0, 0], [-0.45, 0, -0.1], [0, 0, 0], [0.45, 0, -0.1], [0, 0, 0],
      ]),
    ])
    const wave = new AnimationClip('wave', 2.4, [
      axisTrack('shoulder-1', zAxis, [0, 0.35, 0.65, 0.95, 1.25, 1.55, 1.85, 2.4], [0, 1.8, 2.35, 1.8, 2.35, 1.8, 2.35, 0]),
    ])
    const jump = new AnimationClip('jump', 1.3, [
      new VectorKeyframeTrack(`${root}.position`, [0, 0.18, 0.55, 0.95, 1.1, 1.3], [0, 0, 0, 0, 0, 0, 0, 0.65, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]),
      new VectorKeyframeTrack(`${root}.scale`, [0, 0.18, 0.55, 0.95, 1.1, 1.3], [1, 1, 1, 1.05, 0.9, 1.05, 0.97, 1.03, 0.97, 1.05, 0.9, 1.05, 1, 1, 1, 1, 1, 1]),
      axisTrack('shoulder-1', zAxis, [0, 0.18, 0.55, 0.95, 1.3], [0, -0.15, 1.05, 0.3, 0]),
      axisTrack('shoulder--1', zAxis, [0, 0.18, 0.55, 0.95, 1.3], [0, 0.15, -1.05, -0.3, 0]),
    ])
    const dance = new AnimationClip('dance', 2.0, [
      axisTrack(root, yAxis, [0, 0.5, 1, 1.5, 2], [0, Math.PI / 2, Math.PI, Math.PI * 1.5, Math.PI * 2]),
      new VectorKeyframeTrack(`${root}.position`, [0, 0.5, 1, 1.5, 2], [0, 0, 0, 0, 0.07, 0, 0, 0, 0, 0, 0.07, 0, 0, 0, 0]),
      axisTrack('shoulder-1', zAxis, [0, 0.25, 0.5, 1, 1.5, 1.75, 2], [0, 0.9, 1.15, 0.9, 1.15, 0.9, 0]),
      axisTrack('shoulder--1', zAxis, [0, 0.25, 0.5, 1, 1.5, 1.75, 2], [0, -0.9, -1.15, -0.9, -1.15, -0.9, 0]),
    ])
    const talk = new AnimationClip('talk', 0.64, [
      new VectorKeyframeTrack('mouth.scale', [0, 0.12, 0.23, 0.32, 0.46, 0.57, 0.64], [
        1, 1, 1, 1, 2.1, 1, 1, 1.1, 1, 1, 1.65, 1, 1, 1.15, 1, 1, 1.8, 1, 1, 1, 1,
      ]),
    ])
    return [idle, walk, wave, jump, dance, talk]
  }

  // 1. IDLE: Soft breathing, curious head tilt, ear flicks, and fluid 3-bone fox tail wag
  const idleTimes = [0, 0.8, 1.6, 2.4, 3.2]
  const idle = new AnimationClip('idle', 3.2, [
    eulerTrack('Spine', idleTimes, [
      [0, 0, 0], [-0.025, 0.02, 0], [0.01, 0, 0], [-0.025, -0.02, 0], [0, 0, 0],
    ]),
    eulerTrack('Chest', idleTimes, [
      [0, 0, 0], [-0.03, 0.025, 0.015], [0.015, 0, 0], [-0.03, -0.025, -0.015], [0, 0, 0],
    ]),
    eulerTrack('Head', idleTimes, [
      [0, 0, 0], [0.025, 0.055, -0.045], [-0.015, 0, 0.02], [0.02, -0.055, 0.04], [0, 0, 0],
    ]),
    eulerTrack('LeftEar', [0, 0.55, 0.72, 0.9, 2.1, 3.2], [
      [0, 0, 0], [0, 0, 0.03], [0.08, 0, 0.18], [0, 0, 0.02], [-0.03, 0, -0.04], [0, 0, 0],
    ]),
    eulerTrack('RightEar', [0, 1.3, 1.48, 1.68, 2.5, 3.2], [
      [0, 0, 0], [0, 0, -0.03], [0.09, 0, -0.2], [0, 0, -0.02], [-0.03, 0, 0.04], [0, 0, 0],
    ]),
    eulerTrack('LeftUpperArm', idleTimes, [
      [0, 0, 0], [0.03, 0, -0.04], [0, 0, -0.01], [-0.03, 0, -0.04], [0, 0, 0],
    ]),
    eulerTrack('RightUpperArm', idleTimes, [
      [0, 0, 0], [-0.03, 0, 0.04], [0, 0, 0.01], [0.03, 0, 0.04], [0, 0, 0],
    ]),
    eulerTrack('ScarfTail', idleTimes, [
      [0, 0, 0], [0.04, 0.06, 0.05], [0, 0, -0.02], [0.03, -0.05, -0.04], [0, 0, 0],
    ]),
    // Phase-delayed S-wave across Tail1 -> Tail2 -> Tail3
    eulerTrack('Tail1', idleTimes, [
      [0, 0, 0], [0.04, 0.22, 0.06], [0, 0, 0], [0.04, -0.22, -0.06], [0, 0, 0],
    ]),
    eulerTrack('Tail2', idleTimes, [
      [0, 0, 0], [0.05, 0.28, 0.09], [0.02, 0.08, 0.02], [0.05, -0.28, -0.09], [0, 0, 0],
    ]),
    eulerTrack('Tail3', idleTimes, [
      [0, 0, 0], [0.06, 0.32, 0.12], [0.03, 0.14, 0.05], [0.06, -0.32, -0.12], [0, 0, 0],
    ]),
  ])

  // 2. WALK: Contra-lateral humanoid gait (duration = 1.0s)
  // Note: around +X, negative angle swings limb FORWARD (+Z), positive angle swings BACKWARD (-Z);
  // knee flexion is positive +X rotation (bending lower leg back -Z).
  const wt = [0, 0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875, 1.0]
  const walk = new AnimationClip('walk', 1.0, [
    new VectorKeyframeTrack('Hips.position', wt, [
      0, 0.625, 0,
      0, 0.652, 0,
      0, 0.638, 0,
      0, 0.652, 0,
      0, 0.625, 0,
      0, 0.652, 0,
      0, 0.638, 0,
      0, 0.652, 0,
      0, 0.625, 0,
    ]),
    eulerTrack('Hips', wt, [
      [0, 0, 0],
      [0.015, -0.05, 0.02],
      [0.02, -0.09, 0.025],
      [0.015, -0.04, 0.015],
      [0, 0, 0],
      [0.015, 0.05, -0.02],
      [0.02, 0.09, -0.025],
      [0.015, 0.04, -0.015],
      [0, 0, 0],
    ]),
    eulerTrack('Spine', wt, [
      [0.02, 0, 0],
      [0.03, 0.04, -0.02],
      [0.04, 0.07, -0.025],
      [0.03, 0.03, -0.015],
      [0.02, 0, 0],
      [0.03, -0.04, 0.02],
      [0.04, -0.07, 0.025],
      [0.03, -0.03, 0.015],
      [0.02, 0, 0],
    ]),
    eulerTrack('Head', wt, [
      [0, 0, 0],
      [-0.02, -0.02, -0.03],
      [-0.03, -0.03, -0.04],
      [-0.01, -0.01, -0.02],
      [0, 0, 0],
      [-0.02, 0.02, 0.03],
      [-0.03, 0.03, 0.04],
      [-0.01, 0.01, 0.02],
      [0, 0, 0],
    ]),
    // Right leg: swings forward (0 -> 0.25), stance/push back (0.25 -> 0.75), recovers forward (0.75 -> 1.0)
    // Foot counter-rotates so sole stays level / toe-up above floor y >= 0!
    eulerTrack('RightUpLeg', wt, [
      [0, 0, 0],
      [-0.42, 0, 0],
      [-0.55, 0, 0],
      [-0.22, 0, 0],
      [0.06, 0, 0],
      [0.32, 0, 0],
      [0.44, 0, 0],
      [0.20, 0, 0],
      [0, 0, 0],
    ]),
    eulerTrack('RightLeg', wt, [
      [0.10, 0, 0],
      [0.58, 0, 0],
      [0.14, 0, 0],
      [0.08, 0, 0],
      [0.10, 0, 0],
      [0.16, 0, 0],
      [0.24, 0, 0],
      [0.56, 0, 0],
      [0.10, 0, 0],
    ]),
    eulerTrack('RightFoot', wt, [
      [-0.10, 0, 0],
      [-0.20, 0, 0],
      [0.34, 0, 0],
      [0.12, 0, 0],
      [-0.16, 0, 0],
      [-0.46, 0, 0],
      [-0.64, 0, 0],
      [-0.68, 0, 0],
      [-0.10, 0, 0],
    ]),
    // Left leg: phase-shifted by 0.5s (back at 0.25, forward at 0.75)
    eulerTrack('LeftUpLeg', wt, [
      [0.06, 0, 0],
      [0.32, 0, 0],
      [0.44, 0, 0],
      [0.20, 0, 0],
      [0, 0, 0],
      [-0.42, 0, 0],
      [-0.55, 0, 0],
      [-0.22, 0, 0],
      [0.06, 0, 0],
    ]),
    eulerTrack('LeftLeg', wt, [
      [0.10, 0, 0],
      [0.16, 0, 0],
      [0.24, 0, 0],
      [0.56, 0, 0],
      [0.10, 0, 0],
      [0.58, 0, 0],
      [0.14, 0, 0],
      [0.08, 0, 0],
      [0.10, 0, 0],
    ]),
    eulerTrack('LeftFoot', wt, [
      [-0.16, 0, 0],
      [-0.46, 0, 0],
      [-0.64, 0, 0],
      [-0.68, 0, 0],
      [-0.10, 0, 0],
      [-0.20, 0, 0],
      [0.34, 0, 0],
      [0.12, 0, 0],
      [-0.16, 0, 0],
    ]),
    // Contra-lateral arms: Right arm swings BACK (+X) at t=0.25 when Right leg steps FORWARD, and FORWARD (-X) at t=0.75
    eulerTrack('RightUpperArm', wt, [
      [0, 0, 0],
      [0.28, 0, 0.05],
      [0.52, 0, 0.08],
      [0.24, 0, 0.04],
      [0, 0, 0],
      [-0.32, 0, 0.05],
      [-0.54, 0, 0.08],
      [-0.25, 0, 0.04],
      [0, 0, 0],
    ]),
    eulerTrack('RightForeArm', wt, [
      [-0.18, 0, 0],
      [-0.12, 0, 0],
      [-0.08, 0, 0],
      [-0.15, 0, 0],
      [-0.18, 0, 0],
      [-0.34, 0, 0],
      [-0.42, 0, 0],
      [-0.26, 0, 0],
      [-0.18, 0, 0],
    ]),
    eulerTrack('LeftUpperArm', wt, [
      [0, 0, 0],
      [-0.32, 0, -0.05],
      [-0.54, 0, -0.08],
      [-0.25, 0, -0.04],
      [0, 0, 0],
      [0.28, 0, -0.05],
      [0.52, 0, -0.08],
      [0.24, 0, -0.04],
      [0, 0, 0],
    ]),
    eulerTrack('LeftForeArm', wt, [
      [-0.18, 0, 0],
      [-0.34, 0, 0],
      [-0.42, 0, 0],
      [-0.26, 0, 0],
      [-0.18, 0, 0],
      [-0.12, 0, 0],
      [-0.08, 0, 0],
      [-0.15, 0, 0],
      [-0.18, 0, 0],
    ]),
    eulerTrack('LeftEar', wt, [
      [0, 0, 0], [-0.06, 0, 0.05], [0.03, 0, 0.02], [-0.06, 0, 0.05], [0, 0, 0],
      [-0.06, 0, -0.02], [0.03, 0, 0.02], [-0.06, 0, 0.04], [0, 0, 0],
    ]),
    eulerTrack('RightEar', wt, [
      [0, 0, 0], [-0.06, 0, -0.02], [0.03, 0, -0.02], [-0.06, 0, -0.05], [0, 0, 0],
      [-0.06, 0, -0.05], [0.03, 0, -0.02], [-0.06, 0, -0.04], [0, 0, 0],
    ]),
    eulerTrack('ScarfTail', wt, [
      [0.06, 0, 0], [0.16, 0.08, 0.08], [0.08, 0.12, 0.05], [0.16, 0.04, 0.02], [0.06, 0, 0],
      [0.16, -0.08, -0.08], [0.08, -0.12, -0.05], [0.16, -0.04, -0.02], [0.06, 0, 0],
    ]),
    eulerTrack('Tail1', wt, [
      [0, 0, 0], [0.06, 0.16, 0.04], [0.03, 0.24, 0.08], [0.06, 0.12, 0.04], [0, 0, 0],
      [0.06, -0.16, -0.04], [0.03, -0.24, -0.08], [0.06, -0.12, -0.04], [0, 0, 0],
    ]),
    eulerTrack('Tail2', wt, [
      [0, 0, 0], [0.05, 0.22, 0.06], [0.08, 0.3, 0.1], [0.04, 0.16, 0.05], [0, 0, 0],
      [0.05, -0.22, -0.06], [0.08, -0.3, -0.1], [0.04, -0.16, -0.05], [0, 0, 0],
    ]),
    eulerTrack('Tail3', wt, [
      [0, 0, 0], [0.04, 0.26, 0.08], [0.1, 0.34, 0.12], [0.05, 0.2, 0.07], [0, 0, 0],
      [0.04, -0.26, -0.08], [0.1, -0.34, -0.12], [0.05, -0.2, -0.07], [0, 0, 0],
    ]),
  ])

  // 3. WAVE: Enthusiastic greeting with arm raised out to the side in clear view (showing pink paw pads!), elbow wave & tail wag!
  const waveTimes = [0, 0.35, 0.65, 0.95, 1.25, 1.55, 1.85, 2.4]
  const wave = new AnimationClip('wave', 2.4, [
    eulerTrack('Spine', waveTimes, [
      [0, 0, 0], [0, -0.04, 0.04], [0, -0.05, 0.06], [0, -0.04, 0.03],
      [0, -0.05, 0.06], [0, -0.04, 0.03], [0, -0.05, 0.05], [0, 0, 0],
    ]),
    eulerTrack('Head', waveTimes, [
      [0, 0, 0], [-0.03, 0.05, -0.09], [-0.04, 0.07, -0.12], [-0.03, 0.04, -0.07],
      [-0.04, 0.07, -0.12], [-0.03, 0.04, -0.07], [-0.04, 0.06, -0.11], [0, 0, 0],
    ]),
    eulerTrack('shoulder-1', waveTimes, [
      [0, 0, 0], [0, -0.22, 0.22], [0, -0.22, 0.26], [0, -0.22, 0.18],
      [0, -0.22, 0.26], [0, -0.22, 0.18], [0, -0.22, 0.24], [0, 0, 0],
    ]),
    eulerTrack('RightUpperArm', waveTimes, [
      [0, 0, 0], [0, -0.45, 1.48], [0, -0.45, 1.66], [0, -0.45, 1.38],
      [0, -0.45, 1.66], [0, -0.45, 1.38], [0, -0.45, 1.64], [0, 0, 0],
    ]),
    eulerTrack('RightForeArm', waveTimes, [
      [0, 0, 0], [0, 0, 0.18], [0, 0, 0.48], [0, 0, -0.05],
      [0, 0, 0.48], [0, 0, -0.05], [0, 0, 0.44], [0, 0, 0],
    ]),
    eulerTrack('RightHand', waveTimes, [
      [0, 0, 0], [0, -0.2, 0.05], [0, -0.2, 0.24], [0, -0.2, -0.20],
      [0, -0.2, 0.24], [0, -0.2, -0.20], [0, -0.2, 0.22], [0, 0, 0],
    ]),
    eulerTrack('LeftEar', waveTimes, [
      [0, 0, 0], [0.05, 0, 0.08], [0.06, 0, 0.12], [0.04, 0, 0.06],
      [0.06, 0, 0.12], [0.04, 0, 0.06], [0.05, 0, 0.1], [0, 0, 0],
    ]),
    eulerTrack('Tail1', waveTimes, [
      [0, 0, 0], [0.05, 0.24, 0.06], [0.05, -0.24, -0.06], [0.05, 0.24, 0.06],
      [0.05, -0.24, -0.06], [0.05, 0.24, 0.06], [0.05, -0.2, -0.05], [0, 0, 0],
    ]),
    eulerTrack('Tail2', waveTimes, [
      [0, 0, 0], [0.06, 0.3, 0.1], [0.06, -0.3, -0.1], [0.06, 0.3, 0.1],
      [0.06, -0.3, -0.1], [0.06, 0.3, 0.1], [0.06, -0.26, -0.08], [0, 0, 0],
    ]),
    eulerTrack('Tail3', waveTimes, [
      [0, 0, 0], [0.08, 0.34, 0.12], [0.08, -0.34, -0.12], [0.08, 0.34, 0.12],
      [0.08, -0.34, -0.12], [0.08, 0.34, 0.12], [0.08, -0.28, -0.1], [0, 0, 0],
    ]),
  ])

  // 4. JUMP: Anticipation knee bend (feet stay >= 0) -> airborne stretch & tucked paws -> soft landing -> rest
  const jt = [0, 0.18, 0.55, 0.95, 1.12, 1.3]
  const jump = new AnimationClip('jump', 1.3, [
    new VectorKeyframeTrack(`${root}.position`, jt, [
      0, 0, 0,
      0, 0.01, 0,
      0, 0.68, 0,
      0, 0.02, 0,
      0, 0.01, 0,
      0, 0, 0,
    ]),
    new VectorKeyframeTrack(`${root}.scale`, jt, [
      1, 1, 1,
      1.04, 0.93, 1.04,
      0.97, 1.04, 0.97,
      1.04, 0.94, 1.04,
      1.01, 0.99, 1.01,
      1, 1, 1,
    ]),
    eulerTrack('Spine', jt, [
      [0, 0, 0], [0.14, 0, 0], [-0.1, 0, 0], [0.12, 0, 0], [0.04, 0, 0], [0, 0, 0],
    ]),
    eulerTrack('Head', jt, [
      [0, 0, 0], [0.08, 0, 0], [-0.14, 0, 0], [0.08, 0, 0], [0.02, 0, 0], [0, 0, 0],
    ]),
    eulerTrack('RightUpperArm', jt, [
      [0, 0, 0], [0.25, 0, -0.12], [-0.25, 0, 1.25], [0.15, 0, 0.35], [0.05, 0, 0.1], [0, 0, 0],
    ]),
    eulerTrack('LeftUpperArm', jt, [
      [0, 0, 0], [0.25, 0, 0.12], [-0.25, 0, -1.25], [0.15, 0, -0.35], [0.05, 0, -0.1], [0, 0, 0],
    ]),
    eulerTrack('RightForeArm', jt, [
      [0, 0, 0], [-0.35, 0, 0], [-0.25, 0, 0.2], [-0.3, 0, 0], [-0.1, 0, 0], [0, 0, 0],
    ]),
    eulerTrack('LeftForeArm', jt, [
      [0, 0, 0], [-0.35, 0, 0], [-0.25, 0, -0.2], [-0.3, 0, 0], [-0.1, 0, 0], [0, 0, 0],
    ]),
    eulerTrack('RightUpLeg', jt, [
      [0, 0, 0], [-0.22, 0, 0], [0.24, 0, 0.06], [-0.18, 0, 0], [-0.06, 0, 0], [0, 0, 0],
    ]),
    eulerTrack('LeftUpLeg', jt, [
      [0, 0, 0], [-0.22, 0, 0], [0.24, 0, -0.06], [-0.18, 0, 0], [-0.06, 0, 0], [0, 0, 0],
    ]),
    eulerTrack('RightLeg', jt, [
      [0, 0, 0], [0.44, 0, 0], [0.35, 0, 0], [0.36, 0, 0], [0.12, 0, 0], [0, 0, 0],
    ]),
    eulerTrack('LeftLeg', jt, [
      [0, 0, 0], [0.44, 0, 0], [0.35, 0, 0], [0.36, 0, 0], [0.12, 0, 0], [0, 0, 0],
    ]),
    eulerTrack('RightFoot', jt, [
      [0, 0, 0], [-0.22, 0, 0], [0.28, 0, 0], [-0.18, 0, 0], [-0.06, 0, 0], [0, 0, 0],
    ]),
    eulerTrack('LeftFoot', jt, [
      [0, 0, 0], [-0.22, 0, 0], [0.28, 0, 0], [-0.18, 0, 0], [-0.06, 0, 0], [0, 0, 0],
    ]),
    eulerTrack('LeftEar', jt, [
      [0, 0, 0], [-0.12, 0, 0.08], [0.16, 0, -0.06], [-0.18, 0, 0.14], [-0.04, 0, 0.03], [0, 0, 0],
    ]),
    eulerTrack('RightEar', jt, [
      [0, 0, 0], [-0.12, 0, -0.08], [0.16, 0, 0.06], [-0.18, 0, -0.14], [-0.04, 0, -0.03], [0, 0, 0],
    ]),
    eulerTrack('ScarfTail', jt, [
      [0, 0, 0], [-0.1, 0, 0], [0.38, 0, 0.14], [-0.18, 0, -0.08], [-0.05, 0, 0], [0, 0, 0],
    ]),
    eulerTrack('Tail1', jt, [
      [0, 0, 0], [-0.16, 0, 0], [0.28, 0, 0], [-0.2, 0, 0], [-0.06, 0, 0], [0, 0, 0],
    ]),
    eulerTrack('Tail2', jt, [
      [0, 0, 0], [-0.2, 0, 0], [0.32, 0, 0], [-0.24, 0, 0], [-0.08, 0, 0], [0, 0, 0],
    ]),
  ])

  // 5. DANCE: Full 360° joyful spin with hip groove, alternating knee bounces, raised pumping paws, and tail swirl
  const dt = [0, 0.25, 0.5, 0.75, 1.0, 1.25, 1.5, 1.75, 2.0]
  const dance = new AnimationClip('dance', 2.0, [
    axisTrack(root, yAxis, [0, 0.5, 1.0, 1.5, 2.0], [0, Math.PI / 2, Math.PI, Math.PI * 1.5, Math.PI * 2]),
    new VectorKeyframeTrack(`${root}.position`, dt, [
      0, 0, 0, 0, 0.08, 0, 0, 0.01, 0, 0, 0.09, 0, 0, 0.01, 0,
      0, 0.08, 0, 0, 0.01, 0, 0, 0.09, 0, 0, 0, 0,
    ]),
    eulerTrack('Hips', dt, [
      [0, 0, 0], [0, 0.1, 0.08], [0, 0, 0], [0, -0.1, -0.08], [0, 0, 0],
      [0, 0.1, 0.08], [0, 0, 0], [0, -0.1, -0.08], [0, 0, 0],
    ]),
    eulerTrack('Spine', dt, [
      [0, 0, 0], [-0.04, -0.08, -0.07], [0, 0, 0], [-0.04, 0.08, 0.07], [0, 0, 0],
      [-0.04, -0.08, -0.07], [0, 0, 0], [-0.04, 0.08, 0.07], [0, 0, 0],
    ]),
    eulerTrack('Head', dt, [
      [0, 0, 0], [-0.06, 0.08, -0.1], [0.03, 0, 0], [-0.06, -0.08, 0.1], [0.03, 0, 0],
      [-0.06, 0.08, -0.1], [0.03, 0, 0], [-0.06, -0.08, 0.1], [0, 0, 0],
    ]),
    eulerTrack('RightUpperArm', dt, [
      [0, 0, 0], [-0.2, 0, 1.25], [-0.15, 0, 0.95], [-0.2, 0, 1.35], [-0.15, 0, 0.95],
      [-0.2, 0, 1.25], [-0.15, 0, 0.95], [-0.2, 0, 1.3], [0, 0, 0],
    ]),
    eulerTrack('LeftUpperArm', dt, [
      [0, 0, 0], [-0.15, 0, -0.95], [-0.2, 0, -1.25], [-0.15, 0, -0.95], [-0.2, 0, -1.35],
      [-0.15, 0, -0.95], [-0.2, 0, -1.25], [-0.15, 0, -1.0], [0, 0, 0],
    ]),
    eulerTrack('RightForeArm', dt, [
      [0, 0, 0], [-0.4, 0, 0.25], [-0.2, 0, 0.1], [-0.45, 0, 0.3], [-0.2, 0, 0.1],
      [-0.4, 0, 0.25], [-0.2, 0, 0.1], [-0.35, 0, 0.2], [0, 0, 0],
    ]),
    eulerTrack('LeftForeArm', dt, [
      [0, 0, 0], [-0.2, 0, -0.1], [-0.4, 0, -0.25], [-0.2, 0, -0.1], [-0.45, 0, -0.3],
      [-0.2, 0, -0.1], [-0.4, 0, -0.25], [-0.25, 0, -0.15], [0, 0, 0],
    ]),
    eulerTrack('RightUpLeg', dt, [
      [0, 0, 0], [-0.28, 0, 0.08], [0, 0, 0], [-0.08, 0, 0], [0, 0, 0],
      [-0.28, 0, 0.08], [0, 0, 0], [-0.08, 0, 0], [0, 0, 0],
    ]),
    eulerTrack('RightLeg', dt, [
      [0, 0, 0], [0.45, 0, 0], [0, 0, 0], [0.12, 0, 0], [0, 0, 0],
      [0.45, 0, 0], [0, 0, 0], [0.12, 0, 0], [0, 0, 0],
    ]),
    eulerTrack('LeftUpLeg', dt, [
      [0, 0, 0], [-0.08, 0, 0], [0, 0, 0], [-0.28, 0, -0.08], [0, 0, 0],
      [-0.08, 0, 0], [0, 0, 0], [-0.28, 0, -0.08], [0, 0, 0],
    ]),
    eulerTrack('LeftLeg', dt, [
      [0, 0, 0], [0.12, 0, 0], [0, 0, 0], [0.45, 0, 0], [0, 0, 0],
      [0.12, 0, 0], [0, 0, 0], [0.45, 0, 0], [0, 0, 0],
    ]),
    eulerTrack('Tail1', dt, [
      [0, 0, 0], [0.1, 0.3, 0.1], [0.05, 0, 0], [0.1, -0.3, -0.1], [0.05, 0, 0],
      [0.1, 0.3, 0.1], [0.05, 0, 0], [0.1, -0.3, -0.1], [0, 0, 0],
    ]),
    eulerTrack('Tail2', dt, [
      [0, 0, 0], [0.12, 0.36, 0.14], [0.08, 0.1, 0.04], [0.12, -0.36, -0.14], [0.08, -0.1, -0.04],
      [0.12, 0.36, 0.14], [0.08, 0.1, 0.04], [0.12, -0.36, -0.14], [0, 0, 0],
    ]),
  ])

  // 6. TALK: Expressive mouth articulation + friendly conversational head nods & ear perks
  const talkTimes = [0, 0.12, 0.23, 0.32, 0.46, 0.57, 0.64]
  const talk = new AnimationClip('talk', 0.64, [
    new VectorKeyframeTrack('mouth.scale', talkTimes, [
      1, 1, 1,
      1.08, 2.2, 1.05,
      1, 1.12, 1,
      1.05, 1.75, 1.03,
      1, 1.15, 1,
      1.06, 1.9, 1.04,
      1, 1, 1,
    ]),
    eulerTrack('Head', [0, 0.16, 0.36, 0.52, 0.64], [
      [0, 0, 0], [-0.035, 0.025, -0.03], [0.02, -0.02, 0.02], [-0.025, 0.015, -0.02], [0, 0, 0],
    ]),
    eulerTrack('LeftEar', [0, 0.2, 0.45, 0.64], [
      [0, 0, 0], [0.05, 0, 0.08], [-0.02, 0, 0.02], [0, 0, 0],
    ]),
    eulerTrack('RightEar', [0, 0.2, 0.45, 0.64], [
      [0, 0, 0], [0.05, 0, -0.08], [-0.02, 0, -0.02], [0, 0, 0],
    ]),
  ])

  return [idle, walk, wave, jump, dance, talk]
}
