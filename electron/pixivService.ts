import fs from 'fs/promises'
import { createWriteStream, unlink } from 'fs'
import path from 'path'
import https from 'https'
import crypto from 'crypto'

const CLIENT_ID = 'MOBrBDS8blbauoSck0ZfDbtuzpyT'
const CLIENT_SECRET = 'lsACyCD94FhDUtGTXi3QzcFE2uU1hqtDaKeqrdwj'
const HASH_SECRET = '28c1fdd170a5204386cb1313c7077b34f83e4aaf4aa8ceb0c8360f4d45cb3c37'
const AUTH_TOKEN_URL = 'https://oauth.secure.pixiv.net/auth/token'
const API_BASE = 'https://app-api.pixiv.net'
const USER_AGENT = 'PixivIOSApp/7.13.3 (iOS 14.6; iPhone13,2)'

let accessToken = ''
let loggedInUserId: number | null = null

function getHeaders() {
  const time = new Date().toISOString()
  const hash = crypto.createHash('md5').update(time + HASH_SECRET).digest('hex')
  return {
    'User-Agent': USER_AGENT,
    'App-OS': 'ios',
    'App-OS-Version': '14.6',
    'App-Version': '7.13.3',
    'X-Client-Time': time,
    'X-Client-Hash': hash,
    'Authorization': `Bearer ${accessToken}`,
    'Accept-Language': 'ja',
  }
}

export async function loginWithRefreshToken(refreshToken: string) {
  const body = new URLSearchParams({
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    grant_type: 'refresh_token',
    include_policy: 'true',
    refresh_token: refreshToken,
  })

  const response = await fetch(AUTH_TOKEN_URL, {
    method: 'POST',
    headers: {
      'User-Agent': USER_AGENT,
      'App-OS': 'ios',
      'App-OS-Version': '14.6',
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: body.toString(),
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`Token refresh failed: ${response.status} ${text}`)
  }

  const json = await response.json()
  accessToken = json.access_token
  if (json.user && json.user.id) {
    loggedInUserId = Number(json.user.id)
  }
  console.log('[pixiv-service] Access token refreshed successfully')
  return json
}

export async function getFollowing() {
  if (!loggedInUserId) throw new Error("Not logged in")
  
  let following: any[] = []
  let url: string | null = `${API_BASE}/v1/user/following?user_id=${loggedInUserId}&restrict=public`
  
  for (let i = 0; i < 5 && url; i++) {
    const res = await fetch(url, { headers: getHeaders() })
    if (!res.ok) break;
    const data: any = await res.json()
    if (data.user_previews) {
      following = following.concat(data.user_previews.map((item: any) => ({
        id: item.user.id,
        name: item.user.name,
        account: item.user.account,
        profileImage: item.user.profile_image_urls?.medium || item.user.profile_image_urls?.large || ''
      })))
    }
    url = data.next_url ? data.next_url : null
  }
  
  return following
}

export async function getUserWorks(userId: number) {
  const params = new URLSearchParams({
    user_id: String(userId),
    type: 'illust',
    filter: 'for_ios',
  })

  const response = await fetch(`${API_BASE}/v1/user/illusts?${params.toString()}`, {
    headers: getHeaders(),
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`Failed to fetch user works: ${response.status} ${text}`)
  }

  const json = await response.json()
  return json.illusts
}

export async function downloadImage(url: string, saveDir: string, filename: string): Promise<string> {
  await fs.mkdir(saveDir, { recursive: true })
  const dest = path.join(saveDir, filename)

  return new Promise((resolve, reject) => {
    const file = createWriteStream(dest)
    https.get(url, {
      headers: {
        'Referer': 'https://app-api.pixiv.net/',
        'User-Agent': USER_AGENT,
      }
    }, (response) => {
      if (response.statusCode !== 200) {
        reject(new Error(`Failed to download: ${response.statusCode}`))
        return
      }
      response.pipe(file)
      file.on('finish', () => {
        file.close()
        resolve(dest)
      })
    }).on('error', (err) => {
      unlink(dest, () => {})
      reject(err)
    })
  })
}
