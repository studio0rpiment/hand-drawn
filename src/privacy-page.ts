// The privacy policy's storage list, from the same list the app uses, and what
// this browser holds right now.

import { STORED, setStorageAllowed, storedNow } from './ui/consent'
import { t } from './text'

const list = document.getElementById('storage-list')!
list.replaceChildren(
  ...STORED.map(({ key, purpose }) => {
    const tr = document.createElement('tr')
    for (const text of [key, t(purpose), t('privacy.how-long')]) {
      const td = document.createElement('td')
      td.textContent = text
      tr.append(td)
    }
    tr.firstElementChild!.classList.add('key')
    return tr
  }),
)

const now = document.getElementById('stored-now')!
function show() {
  const kept = storedNow()
  now.textContent = kept.length ? t('privacy.stored-now', { list: kept.join(', ') }) : t('privacy.stored-nothing')
}

document.getElementById('forget')!.addEventListener('click', () => {
  setStorageAllowed(false)
  show()
})

show()
