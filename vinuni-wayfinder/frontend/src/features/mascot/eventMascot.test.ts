import { AnimationMixer, Box3, Mesh, MeshStandardMaterial } from 'three'
import { expect, it, vi } from 'vitest'
import { builtInMascots, isMascot, readEventStore, type MascotAsset } from '../events/events'
import { createEventsApi } from '../events/eventsApi'
import * as models from './eventMascot'

const part = { group: 'body', shape: 'box', color: '#127abe', position: [0, 1, 0], size: [1, 1.5, .75], rotation: [0, 0, 0] }
const recipe = { version: 1, parts: [part,
  { ...part, shape: 'ellipsoid', group: 'mouth', position: [0, 1.5, .41], size: [.22, .06, .06] },
  { ...part, group: 'rightArm', position: [.6, 1.1, 0], size: [.2, .65, .2] },
  { ...part, group: 'leftArm', position: [-.6, 1.1, 0], size: [.2, .65, .2] },
] }
const robot = { id: 'robot-bleu', name: 'Robot Bleu', kind: 'model3d', recipe } as MascotAsset

it('loads saved 3D recipes alongside old image mascots and retains Tia in the picker', () => {
  const legacy = { id: 'cat', name: 'Mèo', kind: 'image', image: 'data:image/png;base64,AAAA' }
  expect(builtInMascots.find(m => m.id === 'tia3d')?.kind).toBe('tia')
  const records = readEventStore(JSON.stringify({ version: 1, events: [], mascots: [legacy, robot] }))
  expect(records.mascots).toEqual([legacy, robot])
  expect(isMascot({ ...robot, id: 'tia3d' })).toBe(false)
  for (const change of [{ size: [999, 1, 1] }, { group: 'mouth', shape: 'script' }, { color: 'url(x)' }]) {
    expect(isMascot({ ...robot, recipe: { version: 1, parts: [{ ...part, ...change }, ...recipe.parts.slice(1)] } })).toBe(false)
  }
})

it('renders different shapes and colors from each recipe, with feet on the floor', async () => {
  for (const [shape, geometry, color] of [['box', 'BoxGeometry', '#127abe'], ['cone', 'ConeGeometry', '#cd9012']]) {
    const asset = models.createEventMascot({ ...robot, recipe: { version: 1, parts: [{ ...part, shape, color }, ...recipe.parts.slice(1)] } } as MascotAsset)
    const mesh = asset.model.getObjectByName('part-0') as Mesh
    expect(mesh.geometry.type).toBe(geometry)
    expect((mesh.material as MeshStandardMaterial).color.getHexString()).toBe(color.slice(1))
    expect(new Box3().setFromObject(asset.model).min.y).toBeCloseTo(0)
    asset.dispose()
  }
})

it('binds speech to visible mouth geometry for generated, built-in and legacy mascots', async () => {
  for (const input of [robot, builtInMascots[0]]) {
    const { model, animations, dispose } = models.createEventMascot(input)
    expect(animations.map(clip => clip.name)).toEqual(expect.arrayContaining(['idle', 'walk', 'wave', 'jump', 'dance', 'talk']))
    const mouth = model.getObjectByName('mouth')!
    const rest = new Box3().setFromObject(mouth)
    const mixer = new AnimationMixer(model)
    mixer.clipAction(animations.find(clip => clip.name === 'talk')!).play()
    mixer.update(.12)
    const open = new Box3().setFromObject(mouth)
    expect(open.max.y - open.min.y).toBeGreaterThan((rest.max.y - rest.min.y) * 1.3)
    mixer.stopAllAction()
    mixer.uncacheRoot(model)
    dispose()
  }
})

it('sends the organizer brief to the authenticated generator and receives a preview', async () => {
  const fetch = vi.fn().mockResolvedValue(Response.json({ mascot: robot }))
  const input = { name: robot.name, brief: 'Robot màu xanh của CLB', club: 'Robotics' }
  const result = await createEventsApi(fetch).generateMascot(input, 'club-token')
  expect(fetch.mock.calls[0][0]).toBe('/api/club-mascots/generate')
  expect(fetch.mock.calls[0][1]).toMatchObject({ method: 'POST', headers: { Authorization: 'Bearer club-token' }, body: JSON.stringify(input) })
  expect(result.mascot).toEqual(robot)
})
