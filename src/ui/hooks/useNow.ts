import { useEffect, useState } from 'react'

type UseNowOptions = {
  tickMs?: number
}

export function useNow(options: UseNowOptions = {}): Date {
  const { tickMs = 0 } = options
  const [now, setNow] = useState<Date>(() => new Date())

  useEffect(() => {
    setNow(new Date())
    if (!tickMs) return
    const id = window.setInterval(() => setNow(new Date()), tickMs)
    return () => window.clearInterval(id)
  }, [tickMs])

  return now
}
