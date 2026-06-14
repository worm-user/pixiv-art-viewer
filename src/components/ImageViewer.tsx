import { useState, useEffect, useRef } from 'react'
import { Copy, Pipette, Zap, Palette } from 'lucide-react'

export default function ImageViewer({ filename, picturesPath }: { filename: string, picturesPath: string }) {
  const [tags, setTags] = useState<{danbooru: string, style: string} | null>(null)
  const [colors, setColors] = useState<Record<string, string>>({})
  const [analyzing, setAnalyzing] = useState(false)
  const [tagging, setTagging] = useState(false)
  const [taggingStatus, setTaggingStatus] = useState('')
  const [availableModels, setAvailableModels] = useState<string[]>([])
  const [selectedModel, setSelectedModel] = useState<string>('qwen2-vl')
  const imageRef = useRef<HTMLImageElement>(null)

  const imageUrl = `file://${picturesPath}\\${filename}`

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
      alert('Copied to clipboard!')
    } catch (e) {
      console.error(e)
      alert('Failed to copy image.')
    }
  }

  const useEyedropper = async () => {
    // @ts-ignore
    if (!window.EyeDropper) {
      alert('EyeDropper API is not supported in this environment.')
      return
    }
    try {
      // @ts-ignore
      const eyeDropper = new window.EyeDropper()
      const result = await eyeDropper.open()
      await navigator.clipboard.writeText(result.sRGBHex)
      alert(`Copied ${result.sRGBHex} to clipboard!`)
    } catch (e) {
      // User canceled
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
    <div style={{ display: 'flex', width: '100%', height: '100%' }}>
      <div style={{ flex: 1, padding: '24px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-color)', overflow: 'hidden' }}>
        <img 
          ref={imageRef}
          src={imageUrl} 
          alt={filename} 
          style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', boxShadow: '0 4px 12px rgba(0,0,0,0.5)' }}
        />
      </div>

      <div style={{ width: '300px', background: 'var(--panel-bg)', borderLeft: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '16px', borderBottom: '1px solid var(--border-color)', display: 'flex', gap: '8px' }}>
          <button onClick={copyToClipboard} title="Copy to Clipboard" style={{ flex: 1, display: 'flex', justifyContent: 'center' }}>
            <Copy size={16} />
          </button>
          <button onClick={useEyedropper} title="Eyedropper" style={{ flex: 1, display: 'flex', justifyContent: 'center' }}>
            <Pipette size={16} />
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
