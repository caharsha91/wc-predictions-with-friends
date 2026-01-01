import { useEffect, useState } from 'react'

import { getSimulationState, subscribeSimulationState, type SimulationState } from '../../lib/simulation'

export function useSimulationState(): SimulationState {
  const [state, setState] = useState<SimulationState>(() => getSimulationState())

  useEffect(() => {
    return subscribeSimulationState(() => {
      setState(getSimulationState())
    })
  }, [])

  return state
}
