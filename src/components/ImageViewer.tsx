import { useState, useEffect, useRef } from 'react'
import { Copy, Zap, Palette } from 'lucide-react'

export default function ImageViewer({ filename, picturesPath }: { filename: string, picturesPath: string }) {
  const [tags, setTags] = useState<{danbooru: string, style: string} | null>(null)
  const [colors, setColors] = useState<Record<string, string>>({})
  const [analyzing, setAnalyzing] = useState(false)
  const [tagging, setTagging] = useState(false)
  const [taggingStatus, setTaggingStatus] = useState('')
  const [availableModels, setAvailableModels] = useState<string[]>([])
  const [selectedModel, setSelectedModel] = useState<string>('qwen2-vl')
  const [toastMessage, setToastMessage] = useState<string | null>(null)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const imageRef = useRef<HTMLImageElement>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const [magnifier, setMagnifier] = useState<{ x: number, y: number, natX: number, natY: number } | null>(null)

  const imageUrl = `file://${picturesPath}\\${filename}`

  useEffect(() => {
    let isMounted = true;
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

  useEffect(() => {
    setTags(null)
    setColors({})
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

  const copyToClipboard = async () => {
    try {
      const response = await fetch(imageUrl)
      const blob = await response.blob()
      await navigator.clipboard.write([
        new ClipboardItem({ [blob.type]: blob })
      ])
      showToast('Copied image to clipboard!')
    } catch (e) {
      console.error(e)
      showToast('Failed to copy image.')
    }
  }

  const handleMouseMove = (e: React.MouseEvent<HTMLImageElement>) => {
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
    const pixel = ctx.getImageData(magnifier.natX, magnifier.natY, 1, 1).data;
    const hex = "#" + [pixel[0], pixel[1], pixel[2]].map(x => x.toString(16).padStart(2, '0')).join('');
    
    try {
      await navigator.clipboard.writeText(hex);
      showToast(`Copied color ${hex}`);
    } catch (e) {
      console.error(e);
    }
  }

  const extractColors = async () => {
    setAnalyzing(true)
    try {
      // @ts-ignore
      const res = await window.api.extractColors(filename)
      setColors(res)
    } catch (e) {
      console.error(e)
    } finally {
      setAnalyzing(false)
    }
  }

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

      {magnifier && canvasRef.current && (
        <div style={{
          position: 'fixed',
          left: magnifier.x - 50,
          top: magnifier.y - 50,
          width: 100,
          height: 100,
          borderRadius: '50%',
          border: '2px solid #000',
          pointerEvents: 'none',
          backgroundImage: `url("${imageUrl.replace(/\\/g, '/')}")`,
          backgroundSize: `${canvasRef.current.width * 10}px ${canvasRef.current.height * 10}px`,
          backgroundPosition: `${-(magnifier.natX * 10 + 5 - 50)}px ${-(magnifier.natY * 10 + 5 - 50)}px`,
          zIndex: 9999,
          imageRendering: 'pixelated',
          boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
          backgroundRepeat: 'no-repeat'
        }}>
          <div style={{
            position: 'absolute',
            left: '50%', top: '50%',
            width: 10, height: 10,
            transform: 'translate(-50%, -50%)',
            border: '1px solid #000',
            boxSizing: 'border-box'
          }} />
        </div>
      )}

      <div style={{ flex: 1, padding: '24px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-color)', overflow: 'hidden' }}>
        <img 
          ref={imageRef}
          src={imageUrl} 
          alt={filename} 
          onMouseMove={handleMouseMove}
          onMouseLeave={() => setMagnifier(null)}
          onClick={handleImageClick}
          style={{ 
            maxWidth: '100%', 
            maxHeight: '100%', 
            objectFit: 'contain', 
            boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
            cursor: canvasRef.current ? 'none' : 'default'
          }}
        />
      </div>

      <div style={{ width: '300px', background: 'var(--panel-bg)', borderLeft: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '16px', borderBottom: '1px solid var(--border-color)', display: 'flex', gap: '8px' }}>
          <button onClick={copyToClipboard} title="Copy image to Clipboard" style={{ flex: 1, display: 'flex', justifyContent: 'center', gap: '8px', alignItems: 'center' }}>
            <Copy size={16} />
            <span style={{ fontSize: '13px' }}>Copy Image</span>
          </button>
        </div>

        <div style={{ padding: '16px', borderBottom: '1px solid var(--border-color)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <span style={{ fontWeight: 600, fontSize: '14px' }}>Color Palette</span>
            <button onClick={extractColors} disabled={analyzing} style={{ padding: '4px 8px' }}>
              <Palette size={14} />
            </button>
          </div>
          {Object.keys(colors).length > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
              {Object.entries(colors).map(([name, hex]) => hex && (
                <div key={name} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
                  <div style={{ width: '100%', aspectRatio: '1', backgroundColor: hex, borderRadius: '4px', border: '1px solid var(--border-color)' }} />
                  <span style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>{hex}</span>
                </div>
              ))}
            </div>
          )}
        </div>

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
      </div>
    </div>
  )
}
