// The privacy notice on a first visit, and the same panel as "privacy settings"
// from the footer. The one choice it offers: let this browser keep saved styles.

import { setStorageAllowed, storageAllowed, storedNow } from './consent'

let dismissed = false

const panel = document.createElement('aside')
panel.className = 'privacy-notice'
panel.setAttribute('aria-label', 'Privacy')
panel.hidden = true
document.body.append(panel)

function render(settings: boolean) {
  const allowed = storageAllowed()
  const kept = storedNow().length
  panel.innerHTML = allowed
    ? `
      <p><strong>Your styles are kept in this browser.</strong> ${kept} item${kept === 1 ? '' : 's'} in its local storage, nothing anywhere else. No cookies, no tracking.</p>
      <div class="row">
        <button class="button small" type="button" data-act="forget">Stop and delete them</button>
        <button class="button small" type="button" data-act="close">Close</button>
        <a href="./privacy.html">Privacy policy</a>
      </div>`
    : `
      <p><strong>Hand Drawn sets no cookies and tracks nothing.</strong> Your photos never leave this browser.</p>
      <p>It can remember the styles you save, here in this browser only, if you allow it. Say no and it won’t even store that answer, so it asks again next visit.</p>
      <div class="row">
        <button class="button primary small" type="button" data-act="allow">Remember my styles</button>
        <button class="button small" type="button" data-act="decline">${settings ? 'Close' : 'Keep nothing'}</button>
        <a href="./privacy.html">Privacy policy</a>
      </div>`
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

/** On load: ask, unless this browser already allowed keeping styles. */
export function privacyNotice() {
  if (!storageAllowed() && !dismissed) render(false)
}

/** The footer link: the same panel, showing what is kept now. */
export function privacySettings() {
  render(true)
  panel.querySelector<HTMLElement>('button')?.focus()
}
