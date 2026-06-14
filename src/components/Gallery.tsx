import { useState, useEffect, useRef } from 'react'
import { Search } from 'lucide-react'

export default function Gallery({ onOpenImage, picturesPath }: { onOpenImage: (filename: string) => void, picturesPath: string }) {
  const [images, setImages] = useState<string[]>([])
  const [search, setSearch] = useState('')

  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(50)
  const gridRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const updatePageSize = () => {
      if (!gridRef.current) return
      const { width, height } = gridRef.current.getBoundingClientRect()
      
      const minItemWidth = 120
      const gap = 8
      
      let columns = Math.floor((width + gap) / (minItemWidth + gap))
      if (columns < 1) columns = 1

      const itemWidth = (width - (columns - 1) * gap) / columns
      const itemHeight = itemWidth

      let rows = Math.floor((height + gap) / (itemHeight + gap))
      if (rows < 1) rows = 1

      const newPageSize = columns * rows
      setPageSize(prev => prev !== newPageSize ? newPageSize : prev)
    }

    const observer = new ResizeObserver(() => {
      window.requestAnimationFrame(updatePageSize)
    })

    if (gridRef.current) {
      observer.observe(gridRef.current)
      updatePageSize()
    }

    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    fetchImages()
  }, [])

  const fetchImages = async () => {
    // @ts-ignore
    const imgs = await window.api.listLocalImages()
    setImages(imgs)
    setPage(1)
  }

  const filtered = images.filter(img => img.toLowerCase().includes(search.toLowerCase()))
  const totalPages = Math.ceil(filtered.length / pageSize) || 1
  const currentPage = Math.min(page, totalPages)
  const paginated = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: '16px' }}>
      <div style={{ position: 'relative', flexShrink: 0 }}>
        <input 
          type="text" 
          placeholder="Search images..." 
          value={search}
          onChange={e => { setSearch(e.target.value); setPage(1); }}
          style={{ width: '100%', paddingLeft: '32px' }}
        />
        <Search size={16} style={{ position: 'absolute', left: '10px', top: '10px', color: 'var(--text-secondary)' }} />
      </div>

      <div 
        ref={gridRef}
        style={{ 
          flex: 1,
          display: 'grid', 
          gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', 
          gap: '8px', 
          alignContent: 'start',
          overflow: 'hidden',
        }}
      >
        {paginated.map(img => (
          <div 
            key={img} 
            style={{ 
              aspectRatio: '1', 
              background: 'var(--bg-color)', 
              borderRadius: '4px', 
              overflow: 'hidden',
              cursor: 'pointer',
              border: '1px solid var(--border-color)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '4px'
            }}
            onClick={() => onOpenImage(img)}
            title={img}
          >
            <img 
              src={`file://${picturesPath}\\${img}`} 
              alt={img} 
              style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
              loading="lazy"
            />
          </div>
        ))}
        {filtered.length === 0 && (
          <div style={{ gridColumn: '1 / -1', textAlign: 'center', color: 'var(--text-secondary)', padding: '20px' }}>
            No images found.
          </div>
        )}
      </div>
      
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0, padding: '8px 0', borderTop: '1px solid var(--border-color)' }}>
        <button 
          disabled={currentPage === 1} 
          onClick={() => setPage(currentPage - 1)}
          style={{ padding: '4px 12px' }}
        >
          Prev
        </button>
        <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
          {currentPage} / {totalPages}
        </span>
        <button 
          disabled={currentPage === totalPages} 
          onClick={() => setPage(currentPage + 1)}
          style={{ padding: '4px 12px' }}
        >
          Next
        </button>
      </div>

      <button onClick={fetchImages} style={{ flexShrink: 0 }}>Refresh</button>
    </div>
  )
}
