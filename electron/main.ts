import { app, BrowserWindow, ipcMain, protocol } from 'electron'
import path from 'path'
import fs from 'fs/promises'
import { openPixivLoginWindow } from './pixivAuth'
import { loginWithRefreshToken, getUserWorks, downloadImage } from './pixivService'
import { ensureModelAndAnalyze } from './aiService'
import { extractColors } from './imageService'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

process.env.DIST = path.join(__dirname, '../dist')
process.env.VITE_PUBLIC = app.isPackaged ? process.env.DIST : path.join(process.env.DIST, '../public')

let win: BrowserWindow | null
const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL']

// Token persistence helpers
const getConfigPath = () => path.join(app.getPath('userData'), 'config.json')

async function loadConfig(): Promise<Record<string, any>> {
  try {
    const data = await fs.readFile(getConfigPath(), 'utf-8')
    return JSON.parse(data)
  } catch {
    return {}
  }
}

async function saveConfig(config: Record<string, any>) {
  await fs.mkdir(path.dirname(getConfigPath()), { recursive: true })
  await fs.writeFile(getConfigPath(), JSON.stringify(config, null, 2))
}

function createWindow() {
  win = new BrowserWindow({
    icon: path.join(process.env.VITE_PUBLIC, 'electron-vite.svg'),
    width: 1200,
    height: 900,
    backgroundColor: '#121212',
    webPreferences: {
      preload: path.join(__dirname, 'preload.mjs'),
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: false
    },
  })

  win.setTitle('Pixiv Reference Manager')

  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL)
  } else {
    win.loadFile(path.join(process.env.DIST, 'index.html'))
  }
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})

// Register pixiv:// as a privileged scheme BEFORE app is ready
// This prevents the OS from trying to open it (Microsoft Store popup)
protocol.registerSchemesAsPrivileged([
  { scheme: 'pixiv', privileges: { standard: false, secure: true, supportFetchAPI: false } }
])

app.whenReady().then(() => {
  // Register a dummy handler for pixiv:// protocol so the OS doesn't try to handle it
  protocol.handle('pixiv', () => {
    return new Response('', { status: 200 })
  })

  const getPicturesPath = () => path.join(app.getPath('pictures'), 'PixivReference')

  // Setup IPC handlers
  ipcMain.handle('get-pictures-path', () => getPicturesPath())

  // Token persistence
  ipcMain.handle('load-token', async () => {
    const config = await loadConfig()
    return config.refreshToken || ''
  })

  ipcMain.handle('save-token', async (_, token: string) => {
    const config = await loadConfig()
    config.refreshToken = token
    await saveConfig(config)
  })
  
  ipcMain.handle('login-pixiv', async () => {
    if (!win) throw new Error("Main window not ready")
    return await openPixivLoginWindow(win)
  })

  ipcMain.handle('fetch-user-works', async (_, refreshToken: string, userId: number) => {
    await loginWithRefreshToken(refreshToken)
    return await getUserWorks(userId)
  })

  ipcMain.handle('download-image', async (_, url: string, filename: string) => {
    const saveDir = getPicturesPath()
    return await downloadImage(url, saveDir, filename)
  })

  ipcMain.handle('list-local-images', async () => {
    const saveDir = getPicturesPath()
    try {
      const files = await fs.readdir(saveDir)
      return files.filter(f => f.match(/\.(png|jpe?g|webp|gif)$/i))
    } catch (e) {
      return []
    }
  })

  ipcMain.handle('list-ollama-models', async () => {
    try {
      const { getAvailableModels } = await import('./aiService')
      return await getAvailableModels()
    } catch (e) {
      console.error(e)
      return []
    }
  })

  ipcMain.handle('analyze-image', async (event, filename: string, targetModel: string) => {
    const imagePath = path.join(getPicturesPath(), filename)
    return await ensureModelAndAnalyze(imagePath, targetModel, (msg) => {
      event.sender.send('analyze-progress', filename, msg)
    })
  })

  ipcMain.handle('extract-colors', async (_, filename: string) => {
    const imagePath = path.join(getPicturesPath(), filename)
    return await extractColors(imagePath)
  })

  createWindow()
})
