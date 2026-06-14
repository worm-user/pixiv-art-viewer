import { useState, useEffect } from 'react'
import { PanelLeftClose, PanelLeft, X } from 'lucide-react'
import './App.css'
import Gallery from './components/Gallery'
import Downloader from './components/Downloader'
import ImageViewer from './components/ImageViewer'

function App() {
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [sidebarMode, setSidebarMode] = useState<'gallery' | 'downloader'>('gallery')
  const [openTabs, setOpenTabs] = useState<string[]>([])
  const [activeTab, setActiveTab] = useState<string | null>(null)
  const [picturesPath, setPicturesPath] = useState('')
  const [isSidebarHovered, setIsSidebarHovered] = useState(false)

  useEffect(() => {
    // @ts-ignore
    window.api.getPicturesPath().then(setPicturesPath)
  }, [])

  const openImage = (filename: string) => {
    if (!openTabs.includes(filename)) {
      setOpenTabs([...openTabs, filename])
    }
    setActiveTab(filename)
  }

  const closeTab = (e: React.MouseEvent, filename: string) => {
    e.stopPropagation()
    const newTabs = openTabs.filter(t => t !== filename)
    setOpenTabs(newTabs)
    if (activeTab === filename) {
      setActiveTab(newTabs.length > 0 ? newTabs[newTabs.length - 1] : null)
    }
  }

  return (
    <div className="app-container">
      <div 
        className={`sidebar-wrapper ${sidebarMode === 'gallery' ? 'overlay-wrapper' : ''} ${isSidebarHovered ? 'hovered' : ''}`}
        onMouseEnter={() => sidebarMode === 'gallery' && setIsSidebarHovered(true)}
        onMouseLeave={() => sidebarMode === 'gallery' && setIsSidebarHovered(false)}
      >
        <div className={`sidebar ${sidebarMode === 'gallery' ? (isSidebarHovered ? 'overlay-visible' : 'overlay-hidden') : (sidebarOpen ? '' : 'hidden')}`}>
          <div className="sidebar-header">
            <span style={{ fontWeight: 600 }}>Pixiv Ref</span>
          </div>
          <div className="sidebar-tabs">
            <button 
              className={`sidebar-tab ${sidebarMode === 'gallery' ? 'active' : ''}`}
              onClick={() => { setSidebarMode('gallery'); setIsSidebarHovered(true); }}
            >
              Gallery
            </button>
            <button 
              className={`sidebar-tab ${sidebarMode === 'downloader' ? 'active' : ''}`}
              onClick={() => setSidebarMode('downloader')}
            >
              Download
            </button>
          </div>
          <div className="sidebar-content">
            {sidebarMode === 'gallery' && <Gallery onOpenImage={openImage} picturesPath={picturesPath} />}
            {sidebarMode === 'downloader' && <Downloader />}
          </div>
        </div>
      </div>

      <div className="main-content">
        <div className="tabs-bar">
          <button 
            className="toggle-sidebar-btn" 
            onClick={() => setSidebarOpen(!sidebarOpen)}
            title="Toggle Sidebar"
          >
            {sidebarOpen ? <PanelLeftClose size={18} /> : <PanelLeft size={18} />}
          </button>
          
          {openTabs.map(tab => (
            <div 
              key={tab} 
              className={`tab ${activeTab === tab ? 'active' : ''}`}
              onClick={() => setActiveTab(tab)}
            >
              <span className="tab-title" style={{ maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {tab}
              </span>
              <button className="tab-close" onClick={(e) => closeTab(e, tab)}>
                <X size={14} />
              </button>
            </div>
          ))}
        </div>
        
        <div className="viewer-area">
          {activeTab ? (
            <ImageViewer filename={activeTab} picturesPath={picturesPath} />
          ) : (
            <div className="empty-state">
              <p>Select an image from the gallery to view</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default App
