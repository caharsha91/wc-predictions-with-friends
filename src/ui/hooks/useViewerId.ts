import { CURRENT_USER_ID } from '../../lib/constants'
import { useAuthState } from './useAuthState'
import { useSimulationState } from './useSimulationState'

export function useViewerId() {
  const { user } = useAuthState()
  const simulation = useSimulationState()
  return simulation.enabled ? simulation.selectedUserId : user?.uid ?? CURRENT_USER_ID
}
