import { AnimationClip, Quaternion, QuaternionKeyframeTrack, Vector3, VectorKeyframeTrack } from 'three'

export type TiaMotion = 'wave' | 'jump' | 'dance'

/** Standard keyframe clips so the same motions can be played on the web and in GLB. */
export function createTiaAnimations(root = 'Tia'): AnimationClip[] {
  function rotation(node: string, axis: Vector3, times: number[], angles: number[]) {
    return new QuaternionKeyframeTrack(`${node}.quaternion`, times, angles.flatMap(angle => new Quaternion().setFromAxisAngle(axis, angle).toArray()))
  }
  const z = new Vector3(0, 0, 1), y = new Vector3(0, 1, 0)
  const wave = new AnimationClip('wave', 2.4, [
    rotation('shoulder-1', z, [0, .35, .65, .95, 1.25, 1.55, 1.85, 2.4], [0, 1.8, 2.35, 1.8, 2.35, 1.8, 2.35, 0]),
  ])
  const jump = new AnimationClip('jump', 1.3, [
    new VectorKeyframeTrack(`${root}.position`, [0, .18, .55, .95, 1.1, 1.3], [0, 0, 0, 0, 0, 0, 0, .65, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]),
    new VectorKeyframeTrack(`${root}.scale`, [0, .18, .55, .95, 1.1, 1.3], [1, 1, 1, 1.05, .9, 1.05, .97, 1.03, .97, 1.05, .9, 1.05, 1, 1, 1, 1, 1, 1]),
    rotation('shoulder-1', z, [0, .18, .55, .95, 1.3], [0, -.15, 1.05, .3, 0]),
    rotation('shoulder--1', z, [0, .18, .55, .95, 1.3], [0, .15, -1.05, -.3, 0]),
  ])
  const dance = new AnimationClip('dance', 2, [
    rotation(root, y, [0, .5, 1, 1.5, 2], [0, Math.PI / 2, Math.PI, Math.PI * 1.5, Math.PI * 2]),
    new VectorKeyframeTrack(`${root}.position`, [0, .5, 1, 1.5, 2], [0, 0, 0, 0, .07, 0, 0, 0, 0, 0, .07, 0, 0, 0, 0]),
    rotation('shoulder-1', z, [0, .25, .5, 1, 1.5, 1.75, 2], [0, .9, 1.15, .9, 1.15, .9, 0]),
    rotation('shoulder--1', z, [0, .25, .5, 1, 1.5, 1.75, 2], [0, -.9, -1.15, -.9, -1.15, -.9, 0]),
  ])
  const talk = new AnimationClip('talk', .64, [
    new VectorKeyframeTrack('mouth.scale', [0, .12, .23, .32, .46, .57, .64], [
      1, 1, 1, 1, 2.1, 1, 1, 1.1, 1, 1, 1.65, 1, 1, 1.15, 1, 1, 1.8, 1, 1, 1, 1,
    ]),
  ])
  return [wave, jump, dance, talk]
}
