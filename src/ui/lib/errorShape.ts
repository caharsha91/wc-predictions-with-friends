export type UiErrorShape = {
  message: string
  code?: string
}

export function normalizeUiError(
  error: unknown,
  fallbackMessage: string = 'Something went wrong.'
): UiErrorShape {
  if (typeof error === 'string') {
    const trimmed = error.trim()
    return { message: trimmed || fallbackMessage }
  }

  if (error && typeof error === 'object') {
    const candidate = error as { message?: unknown; code?: unknown }
    const message =
      typeof candidate.message === 'string' && candidate.message.trim()
        ? candidate.message.trim()
        : fallbackMessage
    const code =
      typeof candidate.code === 'string' && candidate.code.trim()
        ? candidate.code.trim()
        : undefined
    return { message, code }
  }

  return { message: fallbackMessage }
}

export function errorMessage(error: unknown, fallbackMessage: string = 'Something went wrong.'): string {
  return normalizeUiError(error, fallbackMessage).message
}
