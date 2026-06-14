import { useState, useEffect } from 'react'

export default function Downloader() {
  const [token, setToken] = useState('')
  const [userId, setUserId] = useState('')
  const [status, setStatus] = useState('')
  const [downloading, setDownloading] = useState(false)

  // Load saved token on mount
  useEffect(() => {
    // @ts-ignore
    window.api.loadToken().then((saved: string) => {
      if (saved) {
        setToken(saved)
        setStatus('Saved token loaded.')
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
        <input 
          type="text" 
          placeholder="e.g. 1113943" 
          value={userId}
          onChange={e => setUserId(e.target.value)}
        />
      </div>

      <button onClick={handleDownload} disabled={downloading}>
        {downloading ? 'Downloading...' : 'Download User Works'}
      </button>

      {status && (
        <div style={{ padding: '12px', background: 'var(--bg-color)', borderRadius: '4px', fontSize: '12px' }}>
          {status}
        </div>
      )}
    </div>
  )
}
