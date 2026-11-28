export class ApiError extends Error {
  code: string
  status: number
  constructor(code: string, message: string, status: number)
}

export function pollJob(
  job: string,
  onStage?: (stage: string) => void,
  opts?: { intervalMs?: number; maxMs?: number },
): Promise<unknown>

export const api: {
  health: () => Promise<unknown>
  destinations: () => Promise<unknown>
  site: () => Promise<unknown>
  saveSite: (site: unknown) => Promise<unknown>
  route: (params: Record<string, string>) => Promise<unknown>
  spotSearch: (q: string) => Promise<unknown>
  spots: () => Promise<unknown>
  clearSpot: (id: string) => Promise<unknown>
  locate: (blob: Blob, previous?: string) => Promise<unknown>
  correct: (photoId: string, trueSpot: string) => Promise<unknown>
  addTrace: (trace: unknown) => Promise<unknown>
  uploadMapImage: (mapId: string, file: File) => Promise<unknown>
  importSite: (file: File) => Promise<unknown>
  uploadVideo: (
    nodeId: string,
    file: Pick<File, 'size' | 'slice'> & { name?: string },
    onProgress?: (fraction: number) => void,
    onStage?: (stage: string) => void,
  ) => Promise<unknown>
}
