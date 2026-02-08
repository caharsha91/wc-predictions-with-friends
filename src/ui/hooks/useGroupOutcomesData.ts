import type { Match } from '../../types/matches'
import { useGroupStageData } from './useGroupStageData'

export function useGroupOutcomesData(matches: Match[]) {
  return useGroupStageData(matches)
}
