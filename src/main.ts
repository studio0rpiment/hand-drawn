// The page: the landing, the three tabs (Icon, Texture, Font), where photos
// go when they are dropped or pasted, the sample, and the privacy card. Each
// tab takes its own photos and does its own scan step.

import { loadSampleSheets, openFontPhotos, showFont } from './font/ui'
import { loadIconSample, openIconPhoto, showIcon } from './icon/ui'
import { loadTextureSample, openTexturePhoto, showTexture } from './texture/ui'
import { decorate, favicon, handSliders, installSprite, reserveHoverWidths } from './ui/hand'
import { privacyNotice, privacySettings } from './ui/privacy'
import { installFlags } from './ui/flags'
import { t } from './text'

installSprite()
favicon()

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T
const tabs = [...document.querySelectorAll<HTMLButtonElement>('.tab')]
const views = ['home', ...tabs.map((tab) => tab.dataset.view!)]

/** The view showing: the landing, or one of the tabs. */
const showing = () => views.find((v) => !$(v).hidden)!

function show(view: string) {
  for (const v of views) $(v).hidden = v !== view
  for (const tab of tabs) tab.setAttribute('aria-pressed', String(tab.dataset.view === view))
  // The sample is for a tab; the landing points to the tabs instead.
  $('sample').hidden = view === 'home'
  reserveHoverWidths($(view))
  if (view === 'icon-app') showIcon()
  if (view === 'texture-app') showTexture()
  if (view === 'font-app') showFont()
}

for (const tab of tabs) tab.addEventListener('click', () => show(tab.dataset.view!))
$('home-link').addEventListener('click', () => show('home'))

// ---- The landing ----

/**
 * "Create {icon}, {texture} or {font} from your own drawings": each of the
 * three is a button to its tab.
 */
function landing() {
  const lead = $('home-lead')
  const to: Record<string, string> = { icon: 'icon-app', texture: 'texture-app', font: 'font-app' }
  for (const part of t('home.lead').split(/(\{(?:icon|texture|font)\})/)) {
    const key = /^\{(\w+)\}$/.exec(part)?.[1]
    if (!key) {
      lead.append(part)
      continue
    }
    const b = document.createElement('button')
    b.type = 'button'
    b.className = 'home-choice'
    b.textContent = t(`home.${key}`)
    b.addEventListener('click', () => show(to[key]))
    lead.append(b)
  }
}
landing()

// ---- Photos: to the tab that's open ----

function openFiles(files: File[]) {
  const view = showing()
  if (view === 'font-app') return void openFontPhotos(files)
  const f = files[0]
  if (!f) return
  if (view === 'texture-app') return void openTexturePhoto(f, f.name)
  // On the landing, a photo starts an icon.
  if (view === 'home') show('icon-app')
  void openIconPhoto(f, f.name)
}

$('sample').addEventListener('click', () => {
  const view = showing()
  if (view === 'font-app') void loadSampleSheets()
  else if (view === 'texture-app') void loadTextureSample()
  else void loadIconSample()
})

const drop = $('drop')
let dragDepth = 0
addEventListener('dragenter', (e) => {
  if (!e.dataTransfer?.types.includes('Files')) return
  dragDepth++
  drop.hidden = false
})
addEventListener('dragleave', () => {
  if (--dragDepth <= 0) {
    dragDepth = 0
    drop.hidden = true
  }
})
addEventListener('dragover', (e) => e.preventDefault())
addEventListener('drop', (e) => {
  e.preventDefault()
  dragDepth = 0
  drop.hidden = true
  openFiles([...(e.dataTransfer?.files ?? [])].filter((f) => f.type.startsWith('image/') || /\.hei[cf]$/i.test(f.name)))
})
addEventListener('paste', (e) => {
  const f = [...(e.clipboardData?.items ?? [])].find((i) => i.type.startsWith('image/'))?.getAsFile()
  if (f) openFiles([new File([f], 'pasted', { type: f.type })])
})

handSliders()
decorate()
show('home')

$('privacy-settings').addEventListener('click', privacySettings)
installFlags()
// The privacy card on arrival: it stays until a choice is made.
privacyNotice()
