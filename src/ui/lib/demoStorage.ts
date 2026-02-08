const DEMO_KEY_PREFIXES = [
  'wc-cache:demo:',
  'wc-picks:demo:',
  'wc-bracket:demo:',
  'wc-picks-wizard:demo:',
  'wc-bracket-wizard:demo:',
  'wc-play-last-focus:demo:',
  'wc-member-cache:demo',
  'wc-demo-scenario',
  'wc-demo-now-override',
  'wc-demo-viewer-id'
]

function isDemoStorageKey(key: string): boolean {
  return DEMO_KEY_PREFIXES.some((prefix) => key.startsWith(prefix))
}

export function clearDemoLocalStorage(): void {
  if (typeof window === 'undefined') return
  const keysToRemove: string[] = []
  for (let index = 0; index < window.localStorage.length; index += 1) {
    const key = window.localStorage.key(index)
    if (!key || !isDemoStorageKey(key)) continue
    keysToRemove.push(key)
  }
  for (const key of keysToRemove) {
    window.localStorage.removeItem(key)
  }
}
