import { CURRENT_USER_ID } from '../../lib/constants'
import { useAuthState } from './useAuthState'

export function useViewerId() {
  const { user } = useAuthState()
  return user?.uid ?? CURRENT_USER_ID
}
