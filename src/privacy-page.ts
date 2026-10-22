// The privacy policy's storage list, from the same list the app uses, and what
// this browser holds right now.

import { STORED, setStorageAllowed, storedNow } from './ui/consent'

const list = document.getElementById('storage-list')!
list.replaceChildren(
  ...STORED.map(({ key, purpose }) => {
    const tr = document.createElement('tr')
    for (const text of [key, purpose, 'Until you delete it or withdraw permission']) {
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
  now.textContent = kept.length
    ? `In this browser right now: ${kept.join(', ')}.`
    : 'In this browser right now: nothing.'
}

document.getElementById('forget')!.addEventListener('click', () => {
  setStorageAllowed(false)
  show()
})

show()
