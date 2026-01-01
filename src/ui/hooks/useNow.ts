import { useEffect, useState } from 'react'

import { useSimulationState } from './useSimulationState'

type UseNowOptions = {
  tickMs?: number
}

export function useNow(options: UseNowOptions = {}): Date {
  const { tickMs = 0 } = options
  const simulation = useSimulationState()
  const [now, setNow] = useState<Date>(() =>
    simulation.enabled ? new Date(simulation.simNow) : new Date()
  )

  useEffect(() => {
    if (simulation.enabled) {
      setNow(new Date(simulation.simNow))
      return
    }
    setNow(new Date())
    if (!tickMs) return
    const id = window.setInterval(() => setNow(new Date()), tickMs)
    return () => window.clearInterval(id)
  }, [simulation.enabled, simulation.simNow, tickMs])

  return now
}
