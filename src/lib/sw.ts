// Update safety nets (PLAN §6, steps 3-4). Reloading under someone who is typing an
// amount loses their input, so reloads wait until the page is idle or hidden.

const RELOAD_KEY = 'steady:reloaded-at'

/** True when reloading now would lose something: an open dialog or a focused field. */
export function isBusy(doc: Document = document): boolean {
  if (doc.querySelector('dialog[open]')) return true
  const el = doc.activeElement
  return (
    el instanceof HTMLInputElement ||
    el instanceof HTMLTextAreaElement ||
    el instanceof HTMLSelectElement
  )
}

export function safeReload() {
  if (!isBusy()) {
    location.reload()
    return
  }
  const onHidden = () => {
    if (document.visibilityState !== 'hidden') return
    document.removeEventListener('visibilitychange', onHidden)
    location.reload()
  }
  document.addEventListener('visibilitychange', onHidden)
}

// A chunk that 404s after a deploy means this page is older than the server. One reload
// fixes it; a second within 10 s means something else is wrong, so stop looping.
function reloadOnceForStaleChunk() {
  try {
    const last = Number(sessionStorage.getItem(RELOAD_KEY) ?? 0)
    if (Date.now() - last < 10_000) return
    sessionStorage.setItem(RELOAD_KEY, String(Date.now()))
  } catch {
    return
  }
  location.reload()
}

export function installUpdateGuards() {
  window.addEventListener('vite:preloadError', (event) => {
    event.preventDefault()
    reloadOnceForStaleChunk()
  })
  // Another tab accepted an update: this page now runs old code against a new SW.
  if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
    let reloading = false
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (reloading) return
      reloading = true
      safeReload()
    })
  }
}
