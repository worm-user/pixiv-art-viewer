import { useState, useEffect, useRef } from 'react'
import { Copy, Palette, Pin, FolderOpen } from 'lucide-react'

export default function ImageViewer({ filename, picturesPath }: { filename: string, picturesPath: string }) {
  // const [tags, setTags] = useState<{danbooru: string, style: string} | null>(null)
  const [colors, setColors] = useState<Array<{id: string, name: string, hex: string, isPinned: boolean}>>([])
  const maxColors = 48;
  const [sampleSize, setSampleSize] = useState(1);
  const [analyzing, setAnalyzing] = useState(false)
  // const [tagging, setTagging] = useState(false)
  // const [taggingStatus, setTaggingStatus] = useState('')
  // const [availableModels, setAvailableModels] = useState<string[]>([])
  // const [selectedModel, setSelectedModel] = useState<string>('qwen2-vl')
  const [toastMessage, setToastMessage] = useState<string | null>(null)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const imageRef = useRef<HTMLImageElement>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const [magnifier, setMagnifier] = useState<{ x: number, y: number, natX: number, natY: number } | null>(null)
  const [transform, setTransform] = useState({ x: 0, y: 0, scale: 1 })
  const [isDragging, setIsDragging] = useState(false)
  const dragStart = useRef({ x: 0, y: 0 })
  const lastRightClick = useRef<number>(0)

  const imageUrl = `file://${picturesPath}\\${filename}`

  useEffect(() => {
    setTransform({ x: 0, y: 0, scale: 1 });
    setColors([]);
    // setTags(null);
    let isMounted = true;
    
    // Auto-extract colors
    // @ts-ignore
    window.api.extractColors(filename).then((res: Record<string, string>) => {
      if (!isMounted) return;
      const initialColors = Object.entries(res)
        .filter(([_, hex]) => hex)
        .map(([name, hex]) => ({ id: Math.random().toString(), name, hex, isPinned: false }));
      
      setColors(initialColors.slice(0, maxColors));
    }).catch(console.error);

    canvasRef.current = null;
    const loadCanvas = async () => {
      try {
        const response = await fetch(imageUrl);
        const blob = await response.blob();
        const bitmap = await createImageBitmap(blob);
        if (!isMounted) return;
        const canvas = document.createElement('canvas');
        canvas.width = bitmap.width;
        canvas.height = bitmap.height;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (ctx) {
          ctx.drawImage(bitmap, 0, 0);
          canvasRef.current = canvas;
        }
      } catch (e) {
        console.error("Failed to load image for eyedropper", e);
      }
    };
    loadCanvas();
    return () => { isMounted = false; };
  }, [imageUrl]);

  const showToast = (msg: string) => {
    setToastMessage(msg)
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    timeoutRef.current = setTimeout(() => {
      setToastMessage(null)
    }, 2500)
  }

  /*
  useEffect(() => {
    setTaggingStatus('')

    // @ts-ignore
    window.api.onAnalyzeProgress((progFilename: string, msg: string) => {
      if (progFilename === filename) {
        setTaggingStatus(msg)
      }
    })

    // Fetch models
    // @ts-ignore
    window.api.listOllamaModels().then(models => {
      setAvailableModels(models)
      if (models.length > 0 && !models.includes(selectedModel)) {
        const qwenMatch = models.find((m: string) => m.toLowerCase().includes('qwen2-vl'))
        setSelectedModel(qwenMatch || models[0])
      }
    }).catch(console.error)

    return () => {
      // @ts-ignore
      window.api.removeAnalyzeProgress()
    }
  }, [filename])
  */

  const copyToClipboard = async () => {
    try {
      // @ts-ignore
      const success = await window.api.copyImageToClipboard(filename)
      if (success) {
        showToast('Copied image to clipboard!')
      } else {
        showToast('Failed to copy image.')
      }
    } catch (e) {
      console.error(e)
      showToast('Failed to copy image.')
    }
  }

  const openInExplorer = async () => {
    try {
      // @ts-ignore
      await window.api.showInExplorer(filename)
    } catch (e) {
      console.error(e)
    }
  }

  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    const zoomSensitivity = 0.002;
    const delta = -e.deltaY * zoomSensitivity;
    const ratio = 1 + delta;
    const newScale = Math.max(0.1, Math.min(transform.scale * ratio, 50));
    
    const rect = imageRef.current?.getBoundingClientRect();
    if (rect) {
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const dx = e.clientX - cx;
      const dy = e.clientY - cy;

      const scaleRatio = newScale / transform.scale;
      const newX = transform.x - dx * (scaleRatio - 1);
      const newY = transform.y - dy * (scaleRatio - 1);

      setTransform({ x: newX, y: newY, scale: newScale });
    }
  }

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button === 2) { // right click
      const now = Date.now();
      if (now - lastRightClick.current < 300) {
        setTransform({ x: 0, y: 0, scale: 1 });
        lastRightClick.current = 0;
        setIsDragging(false);
      } else {
        lastRightClick.current = now;
        setIsDragging(true);
        dragStart.current = { x: e.clientX - transform.x, y: e.clientY - transform.y };
      }
    } else if (e.button === 0) { // left click
      handleImageClick();
    }
  }

  const handleMouseUp = (e: React.MouseEvent) => {
    if (e.button === 2) {
      setIsDragging(false);
    }
  }

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (isDragging) {
      setTransform(prev => ({
        ...prev,
        x: e.clientX - dragStart.current.x,
        y: e.clientY - dragStart.current.y
      }));
      setMagnifier(null);
      return;
    }

    if (!imageRef.current || !canvasRef.current) return;
    const rect = imageRef.current.getBoundingClientRect();
    const imgRatio = imageRef.current.naturalWidth / imageRef.current.naturalHeight;
    const containerRatio = rect.width / rect.height;
    
    let renderWidth, renderHeight, xOffset, yOffset;
    if (containerRatio > imgRatio) {
      renderHeight = rect.height;
      renderWidth = rect.height * imgRatio;
      xOffset = (rect.width - renderWidth) / 2;
      yOffset = 0;
    } else {
      renderWidth = rect.width;
      renderHeight = rect.width / imgRatio;
      xOffset = 0;
      yOffset = (rect.height - renderHeight) / 2;
    }
    
    const x = e.clientX - rect.left - xOffset;
    const y = e.clientY - rect.top - yOffset;
    
    if (x >= 0 && x <= renderWidth && y >= 0 && y <= renderHeight) {
      const natX = Math.floor((x / renderWidth) * imageRef.current.naturalWidth);
      const natY = Math.floor((y / renderHeight) * imageRef.current.naturalHeight);
      setMagnifier({ x: e.clientX, y: e.clientY, natX, natY });
    } else {
      setMagnifier(null);
    }
  }

  const handleImageClick = async () => {
    if (!magnifier || !canvasRef.current) return;
    const ctx = canvasRef.current.getContext('2d');
    if (!ctx) return;
    
    let r = 0, g = 0, b = 0;
    
    if (sampleSize === 1) {
      const pixel = ctx.getImageData(magnifier.natX, magnifier.natY, 1, 1).data;
      r = pixel[0]; g = pixel[1]; b = pixel[2];
    } else {
      const offset = Math.floor(sampleSize / 2);
      const startX = Math.max(0, magnifier.natX - offset);
      const startY = Math.max(0, magnifier.natY - offset);
      const width = Math.min(canvasRef.current.width - startX, sampleSize);
      const height = Math.min(canvasRef.current.height - startY, sampleSize);
      
      const pixels = ctx.getImageData(startX, startY, width, height).data;
      let count = 0;
      for (let i = 0; i < pixels.length; i += 4) {
        r += pixels[i];
        g += pixels[i+1];
        b += pixels[i+2];
        count++;
      }
      if (count > 0) {
        r = Math.round(r / count);
        g = Math.round(g / count);
        b = Math.round(b / count);
      }
    }
    
    const hex = "#" + [r, g, b].map(x => x.toString(16).padStart(2, '0')).join('');
    
    try {
      await navigator.clipboard.writeText(hex);
      showToast(`Copied color ${hex}`);
      setColors(prev => {
        const existingIndex = prev.findIndex(c => c.hex.toLowerCase() === hex.toLowerCase());
        let next: typeof prev;
        
        if (existingIndex !== -1) {
          const existingColor = prev[existingIndex];
          next = [...prev];
          next.splice(existingIndex, 1);
          next.unshift(existingColor);
        } else {
          const newColor = { id: Math.random().toString(), name: 'Picked', hex, isPinned: false };
          next = [newColor, ...prev];
        }
        
        if (next.length > maxColors) {
          const excess = next.length - maxColors;
          const unpinnedIndices = next
            .map((c, i) => (!c.isPinned ? i : -1))
            .filter(i => i !== -1);
            
          const toRemove = unpinnedIndices.slice(-excess);
          return next.filter((_, i) => !toRemove.includes(i));
        }
        return next;
      });
    } catch (e) {
      console.error(e);
    }
  }

  const handleColorClick = async (hex: string) => {
    try {
      await navigator.clipboard.writeText(hex);
      showToast(`Copied color ${hex}`);
    } catch (e) {
      console.error(e);
    }
  }

  const togglePin = (id: string) => {
    setColors(prev => prev.map(c => c.id === id ? { ...c, isPinned: !c.isPinned } : c));
  }

  const extractColors = async () => {
    setAnalyzing(true)
    try {
      // @ts-ignore
      const res = (await window.api.extractColors(filename)) as Record<string, string>;
      const newColors = Object.entries(res).filter(([_, hex]) => hex).map(([name, hex]) => ({ id: Math.random().toString(), name, hex, isPinned: false }));
      
      setColors(newColors.slice(0, maxColors));
    } catch (e) {
      console.error(e)
    } finally {
      setAnalyzing(false)
    }
  }

  /*
  const analyzeTags = async () => {
    setTagging(true)
    setTaggingStatus('Starting analysis...')
    try {
      // @ts-ignore
      const text = await window.api.analyzeImage(filename, selectedModel)
      // parse text
      const danbooruMatch = text.match(/Danbooru:\s*(.*)/i)
      const styleMatch = text.match(/Style:\s*(.*)/i)
      setTags({
        danbooru: danbooruMatch ? danbooruMatch[1] : 'N/A',
        style: styleMatch ? styleMatch[1] : text
      })
    } catch (e: any) {
      console.error(e)
      setTaggingStatus(`Error: ${e.message}`)
    } finally {
      setTagging(false)
    }
  }
  */

  return (
    <div style={{ display: 'flex', width: '100%', height: '100%', position: 'relative' }}>
      {toastMessage && (
        <div style={{
          position: 'absolute',
          bottom: '40px',
          left: '50%',
          transform: 'translateX(-50%)',
          background: '#000',
          color: '#fff',
          padding: '10px 20px',
          borderRadius: '0',
          zIndex: 1000,
          pointerEvents: 'none',
          boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
          fontSize: '14px',
          fontWeight: 500,
          border: '1px solid #333'
        }}>
          {toastMessage}
        </div>
      )}

      {magnifier && canvasRef.current && !isDragging && (
        <div style={{
          position: 'fixed',
          left: magnifier.x - 60,
          top: magnifier.y - 60,
          width: 120,
          height: 120,
          borderRadius: '50%',
          border: '2px solid #000',
          pointerEvents: 'none',
          backgroundImage: `url("${imageUrl.replace(/\\/g, '/')}")`,
          backgroundSize: `${canvasRef.current.width * 10}px ${canvasRef.current.height * 10}px`,
          backgroundPosition: `${-(magnifier.natX * 10 + 5 - 60)}px ${-(magnifier.natY * 10 + 5 - 60)}px`,
          zIndex: 9999,
          imageRendering: 'pixelated',
          boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
          backgroundRepeat: 'no-repeat'
        }}>
          <div style={{
            position: 'absolute',
            left: '50%', top: '50%',
            width: 10 * sampleSize, 
            height: 10 * sampleSize,
            transform: 'translate(-50%, -50%)',
            border: '1px solid #000',
            boxSizing: 'border-box'
          }} />
        </div>
      )}

      <div 
        style={{ 
          flex: 1, 
          display: 'flex', 
          flexDirection: 'column', 
          alignItems: 'center', 
          justifyContent: 'center', 
          background: 'var(--bg-color)', 
          overflow: 'hidden',
          userSelect: 'none',
          WebkitUserSelect: 'none',
          cursor: isDragging ? 'grabbing' : (magnifier ? 'none' : 'crosshair')
        }}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={(e) => { handleMouseUp(e); setMagnifier(null); }}
        onContextMenu={(e) => { e.preventDefault(); }}
      >
        <img 
          ref={imageRef}
          src={imageUrl} 
          alt={filename} 
          draggable={false}
          style={{ 
            maxWidth: '100%', 
            maxHeight: '100%', 
            objectFit: 'contain', 
            boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
            transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})`,
            transformOrigin: 'center',
            pointerEvents: 'none'
          }}
        />
      </div>

      <div style={{ width: '300px', background: 'var(--panel-bg)', borderLeft: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '16px', borderBottom: '1px solid var(--border-color)', display: 'flex', gap: '8px' }}>
          <button onClick={copyToClipboard} title="Copy image to Clipboard" style={{ flex: 1, display: 'flex', justifyContent: 'center', gap: '8px', alignItems: 'center' }}>
            <Copy size={16} />
            <span style={{ fontSize: '13px' }}>Copy Image</span>
          </button>
          <button onClick={openInExplorer} title="Open in Explorer" style={{ flex: 1, display: 'flex', justifyContent: 'center', gap: '8px', alignItems: 'center' }}>
            <FolderOpen size={16} />
            <span style={{ fontSize: '13px' }}>Open Folder</span>
          </button>
        </div>

        <div style={{ padding: '16px 16px 32px 16px', borderBottom: '1px solid var(--border-color)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontWeight: 600, fontSize: '14px' }}>Color Palette</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <span style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>Size</span>
                <select 
                  value={sampleSize} 
                  onChange={e => setSampleSize(Number(e.target.value))}
                  style={{ width: '40px', fontSize: '11px', padding: '2px', background: 'var(--bg-color)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', borderRadius: '4px' }}
                >
                  <option value={1}>1</option>
                  <option value={3}>3</option>
                  <option value={5}>5</option>
                  <option value={9}>9</option>
                </select>
              </div>
            </div>
            <button onClick={extractColors} disabled={analyzing} style={{ padding: '4px 8px' }} title="Auto Extract">
              <Palette size={14} />
            </button>
          </div>
          {colors.length > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px', overflowY: 'visible' }}>
              {colors.map((c) => (
                <div 
                  key={c.id} 
                  onClick={() => handleColorClick(c.hex)}
                  onContextMenu={(e) => { e.preventDefault(); togglePin(c.id); }}
                  style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', cursor: 'pointer' }}
                  title={c.hex}
                >
                  <div style={{ 
                    width: '100%', aspectRatio: '1', backgroundColor: c.hex, 
                    borderRadius: '4px', border: c.isPinned ? '2px solid #fff' : '1px solid var(--border-color)', 
                    position: 'relative',
                    boxShadow: c.isPinned ? '0 0 8px rgba(255,255,255,0.5)' : 'none',
                    transition: 'all 0.2s'
                  }}>
                    {c.isPinned && (
                      <div style={{ 
                        position: 'absolute', top: '2px', right: '2px', 
                        color: '#fff', filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.8))'
                      }}>
                        <Pin size={12} fill="#fff" />
                      </div>
                    )}
                  </div>
                  <span style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>{c.hex}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* AI Tags Temporarily Disabled
        <div style={{ padding: '16px', flex: 1, overflowY: 'auto' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <span style={{ fontWeight: 600, fontSize: '14px' }}>AI Tags</span>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <select 
                value={selectedModel} 
                onChange={e => setSelectedModel(e.target.value)}
                style={{ 
                  background: 'var(--bg-color)', 
                  color: 'var(--text-primary)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '4px',
                  padding: '2px 4px',
                  fontSize: '12px',
                  maxWidth: '120px'
                }}
              >
                {availableModels.map(m => (
                  <option key={m} value={m}>{m}</option>
                ))}
                {!availableModels.includes(selectedModel) && (
                  <option value={selectedModel}>{selectedModel}</option>
                )}
              </select>
              <button onClick={analyzeTags} disabled={tagging} style={{ padding: '4px 8px' }}>
                <Zap size={14} />
              </button>
            </div>
          </div>
          
          {tags && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '4px' }}>Danbooru Tags</div>
                <div style={{ fontSize: '13px', lineHeight: 1.4 }}>{tags.danbooru}</div>
              </div>
              <div>
                <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '4px' }}>Style & Composition</div>
                <div style={{ fontSize: '13px', lineHeight: 1.4 }}>{tags.style}</div>
              </div>
            </div>
          )}
          {tagging && <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>{taggingStatus || `Analyzing image with ${selectedModel}...`}</div>}
        </div>
        */}
      </div>
    </div>
  )
}
