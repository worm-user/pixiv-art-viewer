import { useState, useEffect } from 'react'

export default function Downloader() {
  const [token, setToken] = useState('')
  const [userId, setUserId] = useState('')
  const [status, setStatus] = useState('')
  const [downloading, setDownloading] = useState(false)
  const [following, setFollowing] = useState<Array<{id: number, name: string, account: string, profileImage?: string}>>([])

  const fetchFollowing = async (currentToken: string) => {
    try {
      // @ts-ignore
      const users = await window.api.getFollowing(currentToken)
      setFollowing(users)
    } catch (e) {
      console.error('Failed to fetch following users', e)
    }
  }

  // Load saved token on mount
  useEffect(() => {
    // @ts-ignore
    window.api.loadToken().then((saved: string) => {
      if (saved) {
        setToken(saved)
        setStatus('Saved token loaded.')
        fetchFollowing(saved)
      }
    })
  }, [])

  const handleLogin = async () => {
    try {
      setStatus('Opening login window...')
      // @ts-ignore
      const newToken = await window.api.loginPixiv()
      setToken(newToken)
      // Persist the token
      // @ts-ignore
      await window.api.saveToken(newToken)
      setStatus('Login successful! Token acquired and saved.')
      fetchFollowing(newToken)
    } catch (e: any) {
      setStatus(`Login failed: ${e.message}`)
    }
  }

  const handleDownload = async () => {
    if (!token || !userId) {
      setStatus('Need token and User ID')
      return
    }

    setDownloading(true)
    setStatus('Fetching works...')
    try {
      // @ts-ignore
      const works = await window.api.fetchUserWorks(token, parseInt(userId))
      if (!works || works.length === 0) {
        setStatus('No works found')
        setDownloading(false)
        return
      }

      let count = 0
      for (const work of works) {
        let urlsToDownload: string[] = []
        if (work.page_count === 1 && work.meta_single_page?.original_image_url) {
          urlsToDownload.push(work.meta_single_page.original_image_url)
        } else if (work.meta_pages && work.meta_pages.length > 0) {
          for (const page of work.meta_pages) {
            if (page.image_urls?.original) urlsToDownload.push(page.image_urls.original)
          }
        } else if (work.image_urls?.large) {
          urlsToDownload.push(work.image_urls.large)
        }

        for (const url of urlsToDownload) {
          setStatus(`Downloading ${count + 1} / ${works.length}...`)
          const filename = url.split('/').pop() || `${work.id}.jpg`
          // @ts-ignore
          await window.api.downloadImage(url, filename)
          count++
        }
      }
      setStatus(`Downloaded ${count} images!`)
    } catch (e: any) {
      setStatus(`Download error: ${e.message}`)
    } finally {
      setDownloading(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <label style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Pixiv Refresh Token</label>
        <div style={{ display: 'flex', gap: '8px' }}>
          <input 
            type="password" 
            placeholder="Refresh Token..." 
            value={token}
            onChange={e => setToken(e.target.value)}
            style={{ flex: 1 }}
          />
          <button onClick={handleLogin}>Login</button>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <label style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Pixiv User ID</label>
        <div style={{ display: 'flex', gap: '8px' }}>
          <input 
            type="text" 
            placeholder="e.g. 1113943" 
            value={userId}
            onChange={e => setUserId(e.target.value)}
            list="following-users"
            style={{ flex: 1 }}
          />
          {following.length > 0 && (
            <datalist id="following-users">
              {following.map(user => (
                <option key={user.id} value={user.id}>{user.name} ({user.account})</option>
              ))}
            </datalist>
          )}
        </div>
      </div>

      <button onClick={handleDownload} disabled={downloading}>
        {downloading ? 'Downloading...' : 'Download User Works'}
      </button>

      {status && (
        <div style={{ padding: '12px', background: 'var(--bg-color)', borderRadius: '4px', fontSize: '12px' }}>
          {status}
        </div>
      )}

      {following.length > 0 ? (
        <div style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <h3 style={{ fontSize: '13px', margin: 0, color: 'var(--text-secondary)' }}>Following Users</h3>
          <div style={{ 
            display: 'grid', 
            gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', 
            gap: '8px',
            maxHeight: '300px',
            overflowY: 'auto',
            paddingRight: '4px'
          }}>
            {following.map(user => (
              <div 
                key={user.id}
                onClick={() => setUserId(String(user.id))}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  padding: '8px 12px',
                  background: 'var(--bg-color)',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  border: '1px solid var(--border-color)',
                  transition: 'all 0.2s'
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.borderColor = 'var(--text-primary)'
                  e.currentTarget.style.background = 'rgba(255,255,255,0.05)'
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.borderColor = 'var(--border-color)'
                  e.currentTarget.style.background = 'var(--bg-color)'
                }}
                title={`${user.name} (${user.account}) - ${user.id}`}
              >
                {user.profileImage ? (
                  <img src={user.profileImage} alt={user.name} style={{ width: '36px', height: '36px', borderRadius: '50%', objectFit: 'cover' }} />
                ) : (
                  <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: '#333' }} />
                )}
                <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                  <span style={{ fontSize: '13px', fontWeight: 600, whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden', color: 'var(--text-primary)' }}>{user.name}</span>
                  <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>ID: {user.id}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        token && (
          <div style={{ marginTop: '8px', color: 'var(--text-secondary)', fontSize: '12px' }}>
            ※フォロー中のユーザーが見つかりませんでした。
          </div>
        )
      )}
    </div>
  )
}
