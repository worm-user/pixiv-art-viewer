import { BrowserWindow } from 'electron'
import crypto from 'crypto'

// Pixiv API constants - matching the reference pixiv_auth.py implementation
const CLIENT_ID = 'MOBrBDS8blbauoSck0ZfDbtuzpyT'
const CLIENT_SECRET = 'lsACyCD94FhDUtGTXi3QzcFE2uU1hqtDaKeqrdwj'
const REDIRECT_URI = 'https://app-api.pixiv.net/web/v1/users/auth/pixiv/callback'
const LOGIN_URL = 'https://app-api.pixiv.net/web/v1/login'
const AUTH_TOKEN_URL = 'https://oauth.secure.pixiv.net/auth/token'
const USER_AGENT = 'PixivIOSApp/7.13.3 (iOS 14.6; iPhone13,2)'

function s256(data: string): string {
  // S256 transformation: Base64URL-encode(SHA256(ascii(data))), with padding stripped
  return crypto
    .createHash('sha256')
    .update(data, 'ascii')
    .digest('base64url') // Node's base64url already strips '=' padding
}

function oauthPkce(): { codeVerifier: string; codeChallenge: string } {
  // token_urlsafe(32) equivalent
  const codeVerifier = crypto.randomBytes(32).toString('base64url')
  const codeChallenge = s256(codeVerifier)
  return { codeVerifier, codeChallenge }
}

export function openPixivLoginWindow(parent: BrowserWindow): Promise<string> {
  return new Promise((resolve, reject) => {
    const { codeVerifier, codeChallenge } = oauthPkce()

    console.log('[pixiv-auth] Generated code_verifier:', codeVerifier)
    console.log('[pixiv-auth] Generated code_challenge:', codeChallenge)

    const loginParams = new URLSearchParams({
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
      client: 'pixiv-android',
    })
    const loginUrl = `${LOGIN_URL}?${loginParams.toString()}`

    const authWindow = new BrowserWindow({
      width: 600,
      height: 800,
      parent,
      modal: true,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        partition: 'persist:pixiv',
        disableBlinkFeatures: 'WebAuthentication', // Disable passkey prompts
      },
    })

    // Remove the mobile User-Agent override so it behaves more like a normal desktop login,
    // which also helps reduce aggressive passkey/app prompts.
    // authWindow.webContents.setUserAgent(...)

    let resolved = false

    // Enable performance/network logging via the devtools protocol
    // to capture the pixiv:// redirect (same approach as the Selenium reference)
    const debugger_ = authWindow.webContents.debugger
    try {
      debugger_.attach('1.3')
    } catch (err) {
      console.error('[pixiv-auth] Failed to attach debugger:', err)
    }
    debugger_.sendCommand('Network.enable')

    const finishAuth = async (code: string) => {
      resolved = true
      console.log('[pixiv-auth] Captured code:', code)
      // Hide the window immediately instead of closing to avoid segfaults during event handlers
      authWindow.hide()
      
      try {
        const refreshToken = await exchangeCodeForToken(code, codeVerifier)
        resolve(refreshToken)
      } catch (e) {
        reject(e)
      } finally {
        // Safely close the window after the event loop has settled
        setTimeout(() => {
          if (!authWindow.isDestroyed()) {
            try { debugger_.detach() } catch (_) {}
            authWindow.close()
          }
        }, 100)
      }
    }

    debugger_.on('message', async (_event: any, method: string, params: any) => {
      if (resolved) return
      if (method === 'Network.requestWillBeSent') {
        const url: string = params.documentURL || params.request?.url || ''
        if (url.startsWith('pixiv://')) {
          const match = url.match(/code=([^&]*)/)
          if (match) {
            finishAuth(match[1])
          }
        }
      }
    })

    // Also intercept via navigation events as a fallback
    const tryExtractCode = async (url: string) => {
      if (resolved) return
      if (url.startsWith('pixiv://')) {
        const match = url.match(/code=([^&]*)/)
        if (match) {
          finishAuth(match[1])
        }
      }
    }

    authWindow.webContents.on('will-navigate', (_event, url) => tryExtractCode(url))
    authWindow.webContents.on('did-redirect-navigation', (_event, url) => tryExtractCode(url))
    authWindow.webContents.on('did-fail-load', (_event, _code, _desc, url) => tryExtractCode(url))
    authWindow.webContents.setWindowOpenHandler(({ url }) => {
      tryExtractCode(url)
      return { action: 'deny' }
    })

    authWindow.on('closed', () => {
      if (!resolved) {
        try { debugger_.detach() } catch (_) {}
        reject(new Error('Login window closed by user'))
      }
    })

    authWindow.loadURL(loginUrl)
  })
}

async function exchangeCodeForToken(code: string, codeVerifier: string): Promise<string> {
  // Matches the reference pixiv_auth.py implementation exactly
  const body = new URLSearchParams({
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    code: code,
    code_verifier: codeVerifier,
    grant_type: 'authorization_code',
    include_policy: 'true',
    redirect_uri: REDIRECT_URI,
  })

  console.log('[pixiv-auth] Exchanging code for token...')

  const response = await fetch(AUTH_TOKEN_URL, {
    method: 'POST',
    headers: {
      'User-Agent': USER_AGENT,
      'App-OS-Version': '14.6',
      'App-OS': 'ios',
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: body.toString(),
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`Failed to exchange code: ${response.status} ${text}`)
  }

  const json = await response.json()
  console.log('[pixiv-auth] Token exchange successful!')
  return json.refresh_token
}
