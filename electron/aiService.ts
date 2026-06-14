import fs from 'fs/promises'
import { spawn } from 'child_process'

import { nativeImage } from 'electron'

const OLLAMA_BASE = 'http://127.0.0.1:11434'
const MODEL_NAME = 'qwen2-vl'

async function isOllamaRunning(): Promise<boolean> {
  try {
    const res = await fetch(`${OLLAMA_BASE}/api/tags`)
    return res.ok
  } catch {
    return false
  }
}

async function startOllama(): Promise<void> {
  return new Promise((resolve, reject) => {
    // Attempt to start ollama serve in the background
    const proc = spawn('ollama', ['serve'], {
      detached: true,
      stdio: 'ignore',
      windowsHide: true
    })
    proc.unref()

    // Wait for it to become available
    let retries = 0
    const interval = setInterval(async () => {
      if (await isOllamaRunning()) {
        clearInterval(interval)
        resolve()
      } else {
        retries++
        if (retries > 10) {
          clearInterval(interval)
          reject(new Error('Failed to start Ollama automatically. Please start it manually.'))
        }
      }
    }, 1000)
  })
}

export async function getAvailableModels(): Promise<string[]> {
  if (!(await isOllamaRunning())) {
    await startOllama()
  }
  const res = await fetch(`${OLLAMA_BASE}/api/tags`)
  const json = await res.json()
  const models: any[] = json.models || []
  return models.map(m => m.name)
}

async function ensureModelAvailable(targetModel: string, onProgress: (msg: string) => void): Promise<string> {
  onProgress('Checking Ollama status...')
  if (!(await isOllamaRunning())) {
    onProgress('Starting Ollama daemon...')
    await startOllama()
  }

  onProgress('Checking model availability...')
  const res = await fetch(`${OLLAMA_BASE}/api/tags`)
  const json = await res.json()
  const models: any[] = json.models || []
  
  // Find a model that matches or includes our target name (e.g., handles "qwen2-vl:7b" or custom names)
  const matchedModel = models.find(m => 
    m.name === targetModel || 
    m.name.startsWith(targetModel + ':') ||
    m.name.toLowerCase().includes(targetModel)
  )

  if (matchedModel) {
    return matchedModel.name
  } else {
    // Modify pullModel to accept the target name
    onProgress(`Downloading ${targetModel}... (This may take a while)`)
    const response = await fetch(`${OLLAMA_BASE}/api/pull`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: targetModel })
    })
  
    if (!response.ok) {
      throw new Error(`Failed to pull model: ${response.statusText}`)
    }
  
    if (response.body) {
      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
  
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        
        let newlineIdx
        while ((newlineIdx = buffer.indexOf('\n')) >= 0) {
          const line = buffer.slice(0, newlineIdx)
          buffer = buffer.slice(newlineIdx + 1)
          if (line.trim()) {
            try {
              const data = JSON.parse(line)
              if (data.total && data.completed) {
                const percent = ((data.completed / data.total) * 100).toFixed(1)
                onProgress(`Downloading model: ${percent}% - ${data.status}`)
              } else {
                onProgress(`Model status: ${data.status}`)
              }
            } catch (e) {}
          }
        }
      }
    }
    return targetModel // After pulling, we assume the base model name works
  }
}

export async function ensureModelAndAnalyze(imagePath: string, targetModel: string, onProgress: (msg: string) => void) {
  const actualModelName = await ensureModelAvailable(targetModel, onProgress)

  onProgress(`Analyzing image with ${actualModelName}...`)
  
  // Resize image if it's too large to prevent context window overflow (4096 tokens)
  const image = nativeImage.createFromPath(imagePath)
  const size = image.getSize()
  const MAX_DIM = 1024
  let base64Image = ''

  if (size.width > MAX_DIM || size.height > MAX_DIM) {
    onProgress(`Resizing image for analysis...`)
    const ratio = Math.min(MAX_DIM / size.width, MAX_DIM / size.height)
    const resized = image.resize({
      width: Math.round(size.width * ratio),
      height: Math.round(size.height * ratio)
    })
    // For smaller payload, JPEG is generally better, but we use PNG to preserve transparency just in case
    base64Image = resized.toJPEG(90).toString('base64')
  } else {
    const imageBuffer = await fs.readFile(imagePath)
    base64Image = imageBuffer.toString('base64')
  }

  onProgress(`Generating tags...`)
  const prompt = `
Analyze this illustration and provide two types of tags.
1. Danbooru style tags (character details, clothing, objects, background, e.g., 1girl, blue hair, school uniform, outdoors).
2. Drawing practice style tags (composition, lighting, coloring style, perspective, e.g., dynamic angle, soft shading, rim lighting, low angle).

Output format:
Danbooru: tag1, tag2, tag3...
Style: tag1, tag2, tag3...
`

  const response = await fetch(`${OLLAMA_BASE}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: actualModelName,
      prompt: prompt,
      stream: false,
      images: [base64Image],
      options: {
        num_ctx: 8192 // Increase context window
      }
    })
  })

  if (!response.ok) {
    let errorMsg = response.statusText
    try {
      const errJson = await response.json()
      if (errJson.error) errorMsg = errJson.error
    } catch (_) {}
    throw new Error(`Ollama API error: ${errorMsg}`)
  }

  const json = await response.json()
  return json.response
}
