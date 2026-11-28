import { describe, expect, it, vi } from 'vitest'
import { createXrLaunchGuard } from './xrLaunchGuard'

describe('createXrLaunchGuard', () => {
  it('ends a late-resolved XR session and runs cleanup if the owner unmounts while requestSession is pending', async () => {
    const guard = createXrLaunchGuard()
    const onActiveChange = vi.fn()
    const end = vi.fn().mockResolvedValue(undefined)
    const run = vi.fn()

    let resolveSession!: (s: { end: () => Promise<void> }) => void
    const pending = new Promise<{ end: () => Promise<void> }>(r => { resolveSession = r })

    const started = guard.launch(() => pending, run, { onActiveChange })
    expect(started).toBe(true)
    expect(onActiveChange).toHaveBeenCalledWith(true)
    expect(guard.launch(() => pending, run, { onActiveChange })).toBe(false)

    guard.dispose()
    expect(onActiveChange).toHaveBeenLastCalledWith(false)

    resolveSession({ end })
    await Promise.resolve()
    await Promise.resolve()
    expect(end).toHaveBeenCalledTimes(1)
    expect(run).not.toHaveBeenCalled()
  })

  it('cleans up pending state on rejection so the user can retry without leaking active state', async () => {
    const guard = createXrLaunchGuard()
    const onActiveChange = vi.fn()
    const onError = vi.fn()

    guard.launch(() => Promise.reject(new Error('AR unavailable')), vi.fn(), { onActiveChange, onError })
    await Promise.resolve()
    await Promise.resolve()

    expect(onError).toHaveBeenCalledTimes(1)
    expect(onActiveChange).toHaveBeenLastCalledWith(false)
    expect(guard.isBusy()).toBe(false)
  })

  it('ends an attached session when disposed mid-setup before controls are registered', async () => {
    const guard = createXrLaunchGuard()
    const end = vi.fn().mockResolvedValue(undefined)
    const onActiveChange = vi.fn()

    let finishSetup!: () => void
    guard.launch(
      () => Promise.resolve({ end }),
      async (session, isDisposed) => {
        await new Promise<void>(r => { finishSetup = r })
        expect(isDisposed()).toBe(true)
        return session
      },
      { onActiveChange },
    )
    await Promise.resolve()
    guard.dispose()
    expect(end).toHaveBeenCalledTimes(1)
    expect(onActiveChange).toHaveBeenLastCalledWith(false)
    finishSetup()
    await Promise.resolve()
  })
})
