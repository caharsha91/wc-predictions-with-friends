import test from 'node:test'
import assert from 'node:assert/strict'

import {
  isMobileUserAgent,
  markMobileRootRedirectOptOut,
  readMobileRootRedirectOptOut,
  shouldAutoRedirectToCompanionFromRoot
} from './mobileRootRedirect'

function createStorageStub() {
  const backing = new Map<string, string>()
  return {
    getItem(key: string) {
      return backing.has(key) ? backing.get(key)! : null
    },
    setItem(key: string, value: string) {
      backing.set(key, value)
    }
  }
}

test('isMobileUserAgent detects common mobile user agents', () => {
  const iphoneUa = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148'
  const androidUa = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/120.0.0.0 Mobile Safari/537.36'
  const desktopUa = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36'

  assert.equal(isMobileUserAgent(iphoneUa), true)
  assert.equal(isMobileUserAgent(androidUa), true)
  assert.equal(isMobileUserAgent(desktopUa), false)
})

test('root redirect decision is guarded to root + mobile + companion-enabled + non-opt-out', () => {
  const baseInput = {
    pathname: '/',
    companionEnabled: true,
    optedOut: false,
    userAgent:
      'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/120.0.0.0 Mobile Safari/537.36'
  }

  assert.equal(shouldAutoRedirectToCompanionFromRoot(baseInput), true)
  assert.equal(shouldAutoRedirectToCompanionFromRoot({ ...baseInput, pathname: '/group-stage/A' }), false)
  assert.equal(shouldAutoRedirectToCompanionFromRoot({ ...baseInput, optedOut: true }), false)
  assert.equal(shouldAutoRedirectToCompanionFromRoot({ ...baseInput, companionEnabled: false }), false)
})

test('session opt-out helpers read and write browser-session flag', () => {
  const storage = createStorageStub()

  assert.equal(readMobileRootRedirectOptOut(storage), false)
  markMobileRootRedirectOptOut(storage)
  assert.equal(readMobileRootRedirectOptOut(storage), true)
})
