import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('api', {
  getPicturesPath: () => ipcRenderer.invoke('get-pictures-path'),
  loginPixiv: () => ipcRenderer.invoke('login-pixiv'),
  loadToken: () => ipcRenderer.invoke('load-token'),
  saveToken: (token: string) => ipcRenderer.invoke('save-token', token),
  fetchUserWorks: (refreshToken: string, userId: number) => ipcRenderer.invoke('fetch-user-works', refreshToken, userId),
  downloadImage: (url: string, filename: string) => ipcRenderer.invoke('download-image', url, filename),
  listLocalImages: () => ipcRenderer.invoke('list-local-images'),
  listOllamaModels: () => ipcRenderer.invoke('list-ollama-models'),
  analyzeImage: (filename: string, targetModel: string) => ipcRenderer.invoke('analyze-image', filename, targetModel),
  onAnalyzeProgress: (callback: (filename: string, msg: string) => void) => {
    ipcRenderer.on('analyze-progress', (_event, filename, msg) => callback(filename, msg))
  },
  removeAnalyzeProgress: () => {
    ipcRenderer.removeAllListeners('analyze-progress')
  },
  extractColors: (filename: string) => ipcRenderer.invoke('extract-colors', filename),
  copyImageToClipboard: (filename: string) => ipcRenderer.invoke('copy-image-to-clipboard', filename),
  showInExplorer: (filename: string) => ipcRenderer.invoke('show-in-explorer', filename),
})
