// Saving a file on a phone. iOS only allows navigator.share() inside the tap's "transient
// activation", so the Blob must already exist when the button is pressed: build it
// ahead of time, then call this synchronously from the click handler.

export type SaveResult = 'shared' | 'downloaded' | 'cancelled'

export async function shareOrDownload(file: File): Promise<SaveResult> {
  const nav = globalThis.navigator
  if (nav?.canShare?.({ files: [file] })) {
    try {
      await nav.share({ files: [file], title: file.name })
      return 'shared'
    } catch (error) {
      // AbortError = the user closed the sheet. Anything else: fall back to download.
      if ((error as DOMException)?.name === 'AbortError') return 'cancelled'
    }
  }
  download(file)
  return 'downloaded'
}

export function download(file: File) {
  const url = URL.createObjectURL(file)
  const a = document.createElement('a')
  a.href = url
  a.download = file.name
  document.body.append(a)
  a.click()
  a.remove()
  // Revoking at once can cancel the download in Safari; give it a moment.
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}
