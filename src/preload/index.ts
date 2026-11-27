import { contextBridge, ipcRenderer, webUtils } from 'electron'
import { EVENTS, INVOKE_METHODS, type Api } from '../shared/api'

const api: Record<string, unknown> = {}
for (const m of INVOKE_METHODS) api[m] = (...args: unknown[]) => ipcRenderer.invoke(`api:${m}`, ...args)

function listen<T>(channel: string, cb: (v: T) => void): () => void {
  const fn = (_e: unknown, v: T) => cb(v)
  ipcRenderer.on(channel, fn)
  return () => ipcRenderer.removeListener(channel, fn)
}

api.onProgress = (cb: Parameters<Api['onProgress']>[0]) => listen(EVENTS.progress, cb)
api.onModelDownload = (cb: Parameters<Api['onModelDownload']>[0]) => listen(EVENTS.modelDownload, cb)
api.onOpenFolder = (cb: Parameters<Api['onOpenFolder']>[0]) => listen(EVENTS.openFolder, cb)
api.onJobSynced = (cb: Parameters<Api['onJobSynced']>[0]) => listen(EVENTS.jobSynced, cb)
api.pathForFile = (file: File) => webUtils.getPathForFile(file)

contextBridge.exposeInMainWorld('api', api as unknown as Api)
