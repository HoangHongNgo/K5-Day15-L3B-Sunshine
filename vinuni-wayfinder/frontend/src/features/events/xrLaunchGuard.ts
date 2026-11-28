export type EndableSession = {
  end: () => Promise<void>
}

type LaunchCallbacks = {
  onActiveChange?: (active: boolean) => void
  onError?: (error: unknown) => void
}

/**
 * Bảo vệ vòng đời mở WebXR: chặn bấm đúp lúc đang chờ, tự kết thúc phiên nếu component
 * unmount trong lúc requestSession hoặc thiết lập hit-test chưa xong.
 */
export function createXrLaunchGuard() {
  let disposed = false
  let busy = false
  let activeSession: EndableSession | null = null
  let activeNotified = false
  let notifyActive: ((active: boolean) => void) | null = null

  function releaseActive() {
    if (!activeNotified) return
    activeNotified = false
    notifyActive?.(false)
  }

  function endSession(session: EndableSession | null) {
    if (!session) return
    void session.end().catch(() => {})
  }

  return {
    launch<S extends EndableSession>(
      request: () => Promise<S>,
      run: (session: S, isDisposed: () => boolean) => Promise<unknown> | void,
      callbacks?: LaunchCallbacks,
    ): boolean {
      if (disposed || busy) return false
      busy = true
      notifyActive = callbacks?.onActiveChange ?? null
      activeNotified = true
      notifyActive?.(true)
      request().then(
        async session => {
          if (disposed) {
            busy = false
            endSession(session)
            releaseActive()
            return
          }
          activeSession = session
          try {
            await run(session, () => disposed)
          } catch (error) {
            if (activeSession === session) activeSession = null
            busy = false
            endSession(session)
            releaseActive()
            if (!disposed) callbacks?.onError?.(error)
          }
        },
        error => {
          busy = false
          activeSession = null
          releaseActive()
          if (!disposed) callbacks?.onError?.(error)
        },
      )
      return true
    },
    markEnded() {
      busy = false
      activeSession = null
      releaseActive()
    },
    isBusy() {
      return busy
    },
    dispose() {
      disposed = true
      const session = activeSession
      activeSession = null
      busy = false
      endSession(session)
      releaseActive()
    },
  }
}
