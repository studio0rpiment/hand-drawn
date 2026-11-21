// Common sizes for a picture: square tiles and screens in pixels, print sizes
// in inches at 300 dpi. Shared by the Texture and Sketches tabs; the names are
// texture.size.<id> and texture.size-group.<group> in texture.md.

export const DPI = 300
/** Common sizes: on screen in pixels, and print sizes in inches at 300 dpi. */
export const PRESETS: { group: string; id: string; w: number; h: number }[] = [
  { group: 'tiles', id: 'square-512', w: 512, h: 512 },
  { group: 'tiles', id: 'square-1024', w: 1024, h: 1024 },
  { group: 'tiles', id: 'square-2048', w: 2048, h: 2048 },
  { group: 'tiles', id: 'square-4096', w: 4096, h: 4096 },
  { group: 'screens', id: 'hd', w: 1920, h: 1080 },
  { group: 'screens', id: '4k', w: 3840, h: 2160 },
  { group: 'screens', id: 'post', w: 1080, h: 1350 },
  { group: 'screens', id: 'story', w: 1080, h: 1920 },
  { group: 'screens', id: 'banner', w: 1500, h: 500 },
  { group: 'screens', id: 'phone', w: 1290, h: 2796 },
  ...(
    [
      ['a5', 148 / 25.4, 210 / 25.4],
      ['a4', 210 / 25.4, 297 / 25.4],
      ['letter', 8.5, 11],
      ['5x7', 5, 7],
      ['8x10', 8, 10],
      ['11x14', 11, 14],
      ['12x12', 12, 12],
    ] as const
  ).map(([id, w, h]) => ({ group: 'print', id, w: Math.round(w * DPI), h: Math.round(h * DPI) })),
]

