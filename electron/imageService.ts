import { Vibrant } from 'node-vibrant/node'

export async function extractColors(imagePath: string) {
  const palette = await Vibrant.from(imagePath).getPalette()
  return {
    Vibrant: palette.Vibrant?.hex,
    Muted: palette.Muted?.hex,
    DarkVibrant: palette.DarkVibrant?.hex,
    DarkMuted: palette.DarkMuted?.hex,
    LightVibrant: palette.LightVibrant?.hex,
    LightMuted: palette.LightMuted?.hex,
  }
}
