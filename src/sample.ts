// A made-up phone photo of a drawing: a tilted sheet on a dark table, lit from
// one side, with a wobbly brush mark. Lets the app be tried without a photo.

export function samplePhoto(): HTMLCanvasElement {
  const W = 1600
  const H = 1200
  const c = document.createElement('canvas')
  c.width = W
  c.height = H
  const g = c.getContext('2d')!

  g.fillStyle = '#3a3330'
  g.fillRect(0, 0, W, H)

  // The sheet, slightly in perspective.
  const sheet: [number, number][] = [
    [330, 140],
    [1290, 200],
    [1340, 1080],
    [250, 1030],
  ]
  g.beginPath()
  sheet.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)))
  g.closePath()
  const light = g.createLinearGradient(250, 0, 1340, 1100)
  light.addColorStop(0, '#f4efe4')
  light.addColorStop(1, '#a9a49a')
  g.fillStyle = light
  g.fill()

  // Ink, drawn roughly in sheet space with a hand-held wobble.
  g.save()
  g.beginPath()
  sheet.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)))
  g.clip()
  g.transform(0.98, 0.06, -0.08, 0.98, 330, 140)
  g.strokeStyle = '#1d1a24'
  g.fillStyle = '#1d1a24'
  g.lineCap = 'round'
  g.lineJoin = 'round'
  let seed = 7
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) - 0.5

  // A loose circle.
  g.lineWidth = 22
  g.beginPath()
  for (let a = 0; a <= Math.PI * 2.08; a += 0.05) {
    const r = 270 + rand() * 8 + Math.sin(a * 3) * 6
    const x = 480 + Math.cos(a) * r
    const y = 450 + Math.sin(a) * r
    a ? g.lineTo(x, y) : g.moveTo(x, y)
  }
  g.stroke()

  // A note head and stem inside it.
  g.beginPath()
  g.ellipse(430, 560, 78, 56, -0.4, 0, Math.PI * 2)
  g.fill()
  g.lineWidth = 16
  g.beginPath()
  g.moveTo(500, 540)
  g.bezierCurveTo(505, 420, 498, 330, 510, 250)
  g.bezierCurveTo(570, 300, 600, 330, 640, 400)
  g.stroke()

  // A pencil smudge and a few specks, for the cleanup to remove.
  g.globalAlpha = 0.12
  g.lineWidth = 40
  g.beginPath()
  g.moveTo(760, 760)
  g.lineTo(880, 800)
  g.stroke()
  g.globalAlpha = 1
  for (let i = 0; i < 25; i++) {
    g.beginPath()
    g.arc(100 + Math.abs(rand()) * 1600, 80 + Math.abs(rand()) * 1400, 1.5 + Math.abs(rand()) * 2, 0, Math.PI * 2)
    g.fill()
  }
  g.restore()

  // A soft phone shadow across one corner.
  const shade = g.createRadialGradient(1250, 1050, 50, 1250, 1050, 520)
  shade.addColorStop(0, 'rgba(0,0,0,0.35)')
  shade.addColorStop(1, 'rgba(0,0,0,0)')
  g.fillStyle = shade
  g.fillRect(0, 0, W, H)
  return c
}
