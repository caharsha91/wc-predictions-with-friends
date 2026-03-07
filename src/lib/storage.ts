export type StorageArea = 'local' | 'session'

type StorageParseOptions = {
  area?: StorageArea
}

function resolveStorage(area: StorageArea): Storage | null {
  if (typeof window === 'undefined') return null
  return area === 'session' ? window.sessionStorage : window.localStorage
}

export function getStoredString(key: string, options?: StorageParseOptions): string | null {
  const storage = resolveStorage(options?.area ?? 'local')
  if (!storage) return null
  try {
    return storage.getItem(key)
  } catch {
    return null
  }
}

export function setStoredString(key: string, value: string, options?: StorageParseOptions): void {
  const storage = resolveStorage(options?.area ?? 'local')
  if (!storage) return
  try {
    storage.setItem(key, value)
  } catch {
    // Swallow storage write errors to preserve app flow on locked-down browsers.
  }
}

export function removeStoredKey(key: string, options?: StorageParseOptions): void {
  const storage = resolveStorage(options?.area ?? 'local')
  if (!storage) return
  try {
    storage.removeItem(key)
  } catch {
    // No-op: cleanup best effort.
  }
}

export function getParsedStorage<T>(
  key: string,
  parse: (raw: string) => T | null,
  options?: StorageParseOptions
): T | null {
  const raw = getStoredString(key, options)
  if (!raw) return null
  return parse(raw)
}

export function setSerializedStorage<T>(
  key: string,
  value: T,
  serialize: (value: T) => string = JSON.stringify,
  options?: StorageParseOptions
): void {
  setStoredString(key, serialize(value), options)
}

export function removeByPrefix(prefix: string, options?: StorageParseOptions): string[] {
  const storage = resolveStorage(options?.area ?? 'local')
  if (!storage) return []

  const keys: string[] = []
  try {
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index)
      if (!key || !key.startsWith(prefix)) continue
      keys.push(key)
    }
    for (const key of keys) {
      storage.removeItem(key)
    }
  } catch {
    return []
  }
  return keys
}
