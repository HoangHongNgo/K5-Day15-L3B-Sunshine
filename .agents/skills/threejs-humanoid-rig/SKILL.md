---
name: threejs-humanoid-rig
description: >-
  Build, bind, animate, crossfade, and export procedural 3D humanoid skeletons
  (Bone, Skeleton, SkinnedMesh, AnimationMixer, GLTFExporter) in Three.js r187+.
  Use when rigging 3D characters or mascots with humanoid bones, skin weights,
  locomotion cycles (idle, walk, wave, jump, dance, talk), or glTF/GLB export.
---

# Three.js 3D Humanoid Skeleton & Locomotion Skill (r187+)

## 1. Standard Humanoid Bone Hierarchy

Build a clean single-root `THREE.Bone` tree under `Hips` so both `THREE.AnimationMixer` and `GLTFExporter` resolve joints deterministically:

```text
Hips (pelvis center — root translation & weight shift)
├── Spine → Chest → Neck → Head
│   ├── LeftEar / RightEar       (secondary ear twitch & follow-through)
│   ├── mouth                    (jaw / speech articulation)
│   └── ScarfTail                (secondary cloth follow-through)
├── LeftShoulder (shoulder--1) → LeftUpperArm → LeftForeArm → LeftHand
├── RightShoulder (shoulder-1) → RightUpperArm → RightForeArm → RightHand
├── LeftUpLeg → LeftLeg → LeftFoot
├── RightUpLeg → RightLeg → RightFoot
└── Tail1 → Tail2 → Tail3        (multi-segment spline chain for organic wag)
```

### Critical Rules for Bone Binding
1. Add the root `Hips` bone to the character `Group` **before** binding any `SkinnedMesh`.
2. Call `characterGroup.updateMatrixWorld(true)` once all bones are positioned in rest pose.
3. For each `SkinnedMesh`, attach `skinIndex` (`Uint16BufferAttribute`, itemSize 4) and `skinWeight` (`Float32BufferAttribute`, itemSize 4) where the 4 weights of every vertex are finite, non-negative, and normalized (`w0 + w1 + w2 + w3 = 1`).
4. Call `skinnedMesh.bind(skeleton)` after `updateMatrixWorld(true)` so `skeleton.calculateInverses()` captures accurate inverse bind matrices.
5. Call `skinnedMesh.computeBoundingBox()` and `skinnedMesh.computeBoundingSphere()` after binding so raycasting and frustum checks work immediately.

## 2. Smooth Vertex Skinning Across Joints

Avoid rigid sphere seams on organic parts (torso, neck, tail, limbs) by blending weights smoothly across adjacent bones:
- **Torso / Belly**: Blend between `Hips`, `Spine`, and `Chest` along normalized height `t` using `smoothstep`.
- **Tail Chain (`Tail1 -> Tail2 -> Tail3`)**: Parameterize curve `u in [0, 1]`; blend `[1 - s, s]` across consecutive tail bones so wagging curves continuously without creases.
- **Rigid / Semi-Rigid Attachments**: Boots, backpack, eyes, or paw pads that should not shear can either be rigid-weighted (`[boneIdx, 0, 0, 0]`, `[1, 0, 0, 0]`) or parented directly to their anatomical `Bone` (`RightForeArm`, `LeftFoot`, `Head`, `Chest`). Keep rigidly coupled markers on the same bone segment when Euclidean distance invariance is required.

## 3. Biomechanical Locomotion & Secondary Motion

Design `THREE.AnimationClip` tracks with seamless loop boundaries (value at `t = duration` equals value at `t = 0`):

- **`idle` (Breathing & Presence)**:
  - Subtle `Spine`/`Chest` pitch + scale/lift, gentle `Head` tilt, asynchronous `LeftEar`/`RightEar` flicks, and phase-shifted `Tail1 -> Tail2 -> Tail3` sine wave (`phi, phi - 0.6, phi - 1.2` for whip follow-through).
- **`walk` (Contra-Lateral Humanoid Gait)**:
  - Opposite phase (`pi` offset) between left and right legs (`LeftUpLeg` forward `+X/-X` while `RightUpLeg` extends back).
  - Knee flexion (`LeftLeg`, `RightLeg`) lifts the swinging foot cleanly above `y = 0` while the stance leg stays planted.
  - Contra-lateral arm swing (`LeftUpperArm` moves in phase with `RightUpLeg`; `RightUpperArm` in phase with `LeftUpLeg`) with slight elbow bend (`LeftForeArm`, `RightForeArm`).
  - Double-frequency vertical hip bob (`2 * omega`) on `Hips.position.y`, subtle pelvic yaw/roll, and counter-swaying tail.
- **`jump` (Anticipation → Launch → Apex → Landing)**:
  - Keep feet planted on `y >= 0` during crouch anticipation and landing compression by matching `Hips.position.y` lowering to the kinematic leg shortening `L1*(1 - cos(theta1)) + L2*(1 - cos(theta2))` at every sub-keyframe.

## 4. Mixer Crossfading, GLTF Export & Disposal

- **Track Naming for `GLTFExporter`**: Target bone names directly (`BoneName.quaternion`, `BoneName.position`) when bone names are unique under the root `Group`. `PropertyBinding.findNode` resolves them for both `AnimationMixer` and `GLTFExporter`.
- **Smooth Transitions**: Fade between clips (`action.reset().fadeIn(0.2).play()` while fading out previous action, or `stopAllAction()` when deterministic reset to rest pose is needed).
- **Resource Cleanup**: On unmount, call `mixer.stopAllAction()`, `mixer.uncacheRoot(root)`, and dispose every `Mesh`/`SkinnedMesh` geometry and material.
