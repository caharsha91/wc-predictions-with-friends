const MOBILE_ROOT_REDIRECT_OPTOUT_KEY = 'wc-mobile-root-redirect-optout'

const MOBILE_UA_PATTERN = /(android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini|mobile)/i

type StorageLike = {
  getItem: (key: string) => string | null
  setItem: (key: string, value: string) => void
}

type RootRedirectDecisionInput = {
  pathname: string
  companionEnabled: boolean
  optedOut: boolean
  userAgent?: string | null
}

function getSessionStorage(): StorageLike | null {
  if (typeof window === 'undefined') return null
  return window.sessionStorage
}

function normalizePathname(pathname: string): string {
  const trimmed = String(pathname ?? '').trim()
  if (!trimmed) return '/'
  return trimmed.length > 1 && trimmed.endsWith('/') ? trimmed.replace(/\/+$/, '') || '/' : trimmed
}

function getUserAgent(): string {
  if (typeof navigator === 'undefined') return ''
  return navigator.userAgent || ''
}

export { MOBILE_ROOT_REDIRECT_OPTOUT_KEY }

export function isMobileUserAgent(userAgent: string | null | undefined = getUserAgent()): boolean {
  return MOBILE_UA_PATTERN.test(String(userAgent ?? ''))
}

export function readMobileRootRedirectOptOut(storage: StorageLike | null = getSessionStorage()): boolean {
  if (!storage) return false
  try {
    return storage.getItem(MOBILE_ROOT_REDIRECT_OPTOUT_KEY) === '1'
  } catch {
    return false
  }
}

export function markMobileRootRedirectOptOut(storage: StorageLike | null = getSessionStorage()) {
  if (!storage) return
  try {
    storage.setItem(MOBILE_ROOT_REDIRECT_OPTOUT_KEY, '1')
  } catch {
    // best effort only
  }
}

export function shouldAutoRedirectToCompanionFromRoot(input: RootRedirectDecisionInput): boolean {
  const isRootPath = normalizePathname(input.pathname) === '/'
  if (!isRootPath) return false
  if (!input.companionEnabled) return false
  if (input.optedOut) return false
  return isMobileUserAgent(input.userAgent)
}
