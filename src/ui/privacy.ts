// The privacy notice on a first visit, and the same panel as "privacy settings"
// from the footer. The one choice it offers: let this browser keep saved settings (styles).

import { setStorageAllowed, storageAllowed, storedNow } from './consent'
import { t, tHtml, tn } from '../text'
import { toHtml } from '../text/parse'

let dismissed = false

const panel = document.createElement('aside')
panel.className = 'privacy-notice'
panel.setAttribute('aria-label', t('common.privacy'))
panel.hidden = true
document.body.append(panel)

function render(settings: boolean) {
  const allowed = storageAllowed()
  const kept = storedNow().length
  panel.innerHTML = allowed
    ? `
      <p>${toHtml(tn('common.privacy-kept', kept))}</p>
      <div class="row">
        <button class="button small" type="button" data-act="forget">${tHtml('common.privacy-forget')}</button>
        <button class="button small" type="button" data-act="close">${tHtml('common.privacy-close')}</button>
        <a href="./privacy.html">${tHtml('common.privacy-policy')}</a>
      </div>`
    : `
      <p>${tHtml('common.privacy-notice')}</p>
      <p>${tHtml('common.privacy-ask')}</p>
      <div class="row">
        <button class="button primary small" type="button" data-act="allow">${tHtml('common.privacy-allow')}</button>
        <button class="button small" type="button" data-act="decline">${tHtml(settings ? 'common.privacy-close' : 'common.privacy-decline')}</button>
        <a href="./privacy.html">${tHtml('common.privacy-policy')}</a>
      </div>`
  restingPlace()
  panel.hidden = false
}

panel.addEventListener('click', (e) => {
  const act = (e.target as HTMLElement).closest<HTMLElement>('[data-act]')?.dataset.act
  if (!act) return
  if (act === 'allow') setStorageAllowed(true)
  if (act === 'forget') setStorageAllowed(false)
  dismissed = true
  panel.hidden = true
})

/** Where the panel rests: halfway up the window, or just below the Scan buttons if they reach lower. */
function restingPlace() {
  const buttons = document.querySelector('.intro-actions')
  const below = buttons && buttons.getClientRects().length ? buttons.getBoundingClientRect().bottom + 16 : 0
  document.documentElement.style.setProperty('--notice-top', `${Math.max(innerHeight / 2, below)}px`)
}
addEventListener('resize', restingPlace)

/** On load: ask, unless this browser already allowed keeping styles. */
export function privacyNotice() {
  if (!storageAllowed() && !dismissed) render(false)
}

/** The footer link: the same panel, showing what is kept now. */
export function privacySettings() {
  render(true)
  panel.querySelector<HTMLElement>('button')?.focus()
}
