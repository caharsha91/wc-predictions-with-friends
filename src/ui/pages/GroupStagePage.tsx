import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'

import { getGroupOutcomesLockTime } from '../../lib/matches'
import type { GroupPrediction } from '../../types/bracket'
import type { Match, Team } from '../../types/matches'
import { Alert } from '../components/ui/Alert'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import PageHeroPanel from '../components/ui/PageHeroPanel'
import Skeleton from '../components/ui/Skeleton'
import { useGroupStageData } from '../hooks/useGroupStageData'
import { useNow } from '../hooks/useNow'
import { usePicksData } from '../hooks/usePicksData'

const BEST_THIRD_SLOTS = 8

type GroupErrors = Record<string, { first?: string; second?: string }>

type ValidationResult = {
  groupErrors: GroupErrors
  bestThirdErrors: string[]
  hasErrors: boolean
}

function formatTime(iso?: string): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

function buildGroupTeams(matches: Match[]): Record<string, Team[]> {
  const groups = new Map<string, Map<string, Team>>()
  for (const match of matches) {
    if (match.stage !== 'Group' || !match.group) continue
    const teamMap = groups.get(match.group) ?? new Map<string, Team>()
    teamMap.set(match.homeTeam.code, match.homeTeam)
    teamMap.set(match.awayTeam.code, match.awayTeam)
    groups.set(match.group, teamMap)
  }

  const next: Record<string, Team[]> = {}
  for (const [groupId, teamMap] of groups.entries()) {
    next[groupId] = [...teamMap.values()].sort((a, b) => a.code.localeCompare(b.code))
  }
  return next
}

function normalizeBestThirds(bestThirds: string[]): string[] {
  const next = [...bestThirds]
  while (next.length < BEST_THIRD_SLOTS) next.push('')
  return next.slice(0, BEST_THIRD_SLOTS)
}

function getCompletionCount(groups: Record<string, GroupPrediction>, groupIds: string[]) {
  let complete = 0
  for (const groupId of groupIds) {
    const group = groups[groupId] ?? {}
    if (group.first && group.second && group.first !== group.second) {
      complete += 1
    }
  }
  return complete
}

function validateSelections(
  groups: Record<string, GroupPrediction>,
  groupIds: string[],
  bestThirds: string[],
  teamGroupByCode: Map<string, string>
): ValidationResult {
  const groupErrors: GroupErrors = {}
  const bestThirdErrors: string[] = []

  for (const groupId of groupIds) {
    const group = groups[groupId] ?? {}
    if (!group.first) {
      groupErrors[groupId] = { ...(groupErrors[groupId] ?? {}), first: 'Required' }
    }
    if (!group.second) {
      groupErrors[groupId] = { ...(groupErrors[groupId] ?? {}), second: 'Required' }
    }
    if (group.first && group.second && group.first === group.second) {
      groupErrors[groupId] = {
        first: 'Pick two different teams',
        second: 'Pick two different teams'
      }
    }
  }

  const normalizedBestThirds = normalizeBestThirds(bestThirds)
  const teamIndexes = new Map<string, number[]>()
  const groupIndexes = new Map<string, number[]>()

  normalizedBestThirds.forEach((code, index) => {
    if (!code) {
      bestThirdErrors[index] = 'Required'
      return
    }

    const groupId = teamGroupByCode.get(code)
    if (!groupId) {
      bestThirdErrors[index] = 'Invalid team'
      return
    }

    const teamSlots = teamIndexes.get(code) ?? []
    teamSlots.push(index)
    teamIndexes.set(code, teamSlots)

    const groupSlots = groupIndexes.get(groupId) ?? []
    groupSlots.push(index)
    groupIndexes.set(groupId, groupSlots)

    const selectedTopTwo = groups[groupId] ?? {}
    if (selectedTopTwo.first === code || selectedTopTwo.second === code) {
      bestThirdErrors[index] = `Already selected in Group ${groupId} top two`
    }
  })

  for (const slots of teamIndexes.values()) {
    if (slots.length <= 1) continue
    for (const index of slots) {
      if (!bestThirdErrors[index]) bestThirdErrors[index] = 'Duplicate team'
    }
  }

  for (const slots of groupIndexes.values()) {
    if (slots.length <= 1) continue
    for (const index of slots) {
      if (!bestThirdErrors[index]) bestThirdErrors[index] = 'Different groups only'
    }
  }

  const hasGroupErrors = Object.keys(groupErrors).length > 0
  const hasBestThirdErrors = bestThirdErrors.some(Boolean)
  return {
    groupErrors,
    bestThirdErrors,
    hasErrors: hasGroupErrors || hasBestThirdErrors
  }
}

export default function GroupStagePage() {
  const navigate = useNavigate()
  const now = useNow({ tickMs: 30_000 })
  const picksState = usePicksData()
  const matches = picksState.state.status === 'ready' ? picksState.state.matches : []
  const groupStage = useGroupStageData(matches)

  const groupTeams = useMemo(() => buildGroupTeams(matches), [matches])
  const groupIds = groupStage.groupIds

  const allTeams = useMemo(
    () => Object.values(groupTeams).flat().sort((a, b) => a.code.localeCompare(b.code)),
    [groupTeams]
  )

  const teamGroupByCode = useMemo(() => {
    const map = new Map<string, string>()
    for (const [groupId, teams] of Object.entries(groupTeams)) {
      for (const team of teams) {
        map.set(team.code, groupId)
      }
    }
    return map
  }, [groupTeams])

  const bestThirds = normalizeBestThirds(groupStage.data.bestThirds)
  const groupLockTime = useMemo(() => getGroupOutcomesLockTime(matches), [matches])
  const groupClosed = groupLockTime ? now.getTime() >= groupLockTime.getTime() : false

  const completion = useMemo(() => {
    const groupsDone = getCompletionCount(groupStage.data.groups, groupIds)
    const bestThirdDone = bestThirds.filter(Boolean).length
    return { groupsDone, bestThirdDone }
  }, [bestThirds, groupIds, groupStage.data.groups])

  const validation = useMemo(
    () => validateSelections(groupStage.data.groups, groupIds, bestThirds, teamGroupByCode),
    [bestThirds, groupIds, groupStage.data.groups, teamGroupByCode]
  )

  const canSave =
    groupStage.loadState.status === 'ready' && !groupClosed && !validation.hasErrors

  if (picksState.state.status === 'loading' || groupStage.loadState.status === 'loading') {
    return (
      <div className="space-y-4">
        <Skeleton className="h-36 rounded-3xl" />
        <Skeleton className="h-80 rounded-3xl" />
      </div>
    )
  }

  if (picksState.state.status === 'error') {
    return (
      <Alert tone="danger" title="Unable to load group stage">
        {picksState.state.message}
      </Alert>
    )
  }

  if (groupStage.loadState.status === 'error') {
    return (
      <Alert tone="danger" title="Unable to load group stage">
        {groupStage.loadState.message}
      </Alert>
    )
  }

  return (
    <div className="space-y-6">
      <PageHeroPanel
        kicker="Group stage"
        title="Group Stage"
        subtitle="Set 1st, 2nd, and best 8 third-place qualifiers."
        meta={
          <div className="text-right text-xs text-muted-foreground" data-last-updated="true">
            <div className="uppercase tracking-[0.2em]">Last updated</div>
            <div className="text-sm font-semibold text-foreground">
              {formatTime(picksState.state.lastUpdated)}
            </div>
          </div>
        }
      >
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={completion.groupsDone === groupIds.length && groupIds.length > 0 ? 'success' : 'warning'}>
              Groups {completion.groupsDone}/{groupIds.length}
            </Badge>
            <Badge tone={completion.bestThirdDone === BEST_THIRD_SLOTS ? 'success' : 'warning'}>
              Best thirds {completion.bestThirdDone}/{BEST_THIRD_SLOTS}
            </Badge>
            <Badge tone={groupClosed ? 'locked' : 'info'}>
              {groupClosed
                ? `Closed ${formatTime(groupLockTime?.toISOString())}`
                : `Closes ${formatTime(groupLockTime?.toISOString())}`}
            </Badge>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={() => navigate('/play')}>Back to Play Center</Button>
            <Button
              variant="secondary"
              onClick={() => void groupStage.save()}
              disabled={!canSave}
              loading={groupStage.saveStatus === 'saving'}
            >
              Save Group Stage
            </Button>
            {groupStage.saveStatus === 'saved' ? <Badge tone="success">Saved</Badge> : null}
            {groupStage.saveStatus === 'error' ? <Badge tone="danger">Save failed</Badge> : null}
          </div>

          {groupClosed ? (
            <Alert tone="info" title="Group stage is closed">
              Editing is disabled, but selections remain visible.
            </Alert>
          ) : null}
        </div>
      </PageHeroPanel>

      <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <Card className="rounded-2xl border-border/60 p-4 sm:p-5">
          <div className="space-y-4">
            <div className="text-sm font-semibold text-foreground">Group winners and runners-up</div>
            <div className="grid gap-3 md:grid-cols-2">
              {groupIds.map((groupId) => {
                const teams = groupTeams[groupId] ?? []
                const prediction = groupStage.data.groups[groupId] ?? {}
                const errors = validation.groupErrors[groupId]
                const secondOptions = teams.filter((team) => team.code !== prediction.first)
                return (
                  <div key={groupId} className="rounded-xl border border-border/70 bg-bg2 p-3">
                    <div className="mb-2 text-sm font-semibold text-foreground">Group {groupId}</div>
                    <div className="grid gap-2">
                      <div>
                        <div className="mb-1 text-xs uppercase tracking-[0.18em] text-muted-foreground">1st place</div>
                        <select
                          value={prediction.first ?? ''}
                          disabled={groupClosed}
                          onChange={(event) =>
                            groupStage.setGroupPick(groupId, 'first', event.target.value)
                          }
                          className="w-full rounded-md border border-input bg-[var(--input-bg)] px-3 py-2 text-sm text-foreground"
                        >
                          <option value="">Select team</option>
                          {teams.map((team) => (
                            <option key={`${groupId}-first-${team.code}`} value={team.code}>
                              {team.code} · {team.name}
                            </option>
                          ))}
                        </select>
                        {errors?.first ? <div className="mt-1 text-xs text-destructive">{errors.first}</div> : null}
                      </div>

                      <div>
                        <div className="mb-1 text-xs uppercase tracking-[0.18em] text-muted-foreground">2nd place</div>
                        <select
                          value={prediction.second ?? ''}
                          disabled={groupClosed}
                          onChange={(event) =>
                            groupStage.setGroupPick(groupId, 'second', event.target.value)
                          }
                          className="w-full rounded-md border border-input bg-[var(--input-bg)] px-3 py-2 text-sm text-foreground"
                        >
                          <option value="">Select team</option>
                          {secondOptions.map((team) => (
                            <option key={`${groupId}-second-${team.code}`} value={team.code}>
                              {team.code} · {team.name}
                            </option>
                          ))}
                        </select>
                        {errors?.second ? <div className="mt-1 text-xs text-destructive">{errors.second}</div> : null}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </Card>

        <Card className="rounded-2xl border-border/60 p-4 sm:p-5">
          <div className="space-y-4">
            <div>
              <div className="text-sm font-semibold text-foreground">Best 8 third-place qualifiers</div>
              <div className="text-xs text-muted-foreground">Pick exactly 8 teams from different groups.</div>
            </div>
            <div className="space-y-2">
              {bestThirds.map((selectedTeam, index) => {
                const usedElsewhereTeams = bestThirds.filter((code, codeIndex) => code && codeIndex !== index)
                const usedElsewhereGroups = new Set(
                  bestThirds
                    .map((code, codeIndex) => (codeIndex === index ? null : teamGroupByCode.get(code) ?? null))
                    .filter((value): value is string => Boolean(value))
                )
                return (
                  <div key={`best-third-${index}`} className="rounded-xl border border-border/70 bg-bg2 p-3">
                    <div className="mb-1 text-xs uppercase tracking-[0.18em] text-muted-foreground">Slot {index + 1}</div>
                    <select
                      value={selectedTeam}
                      disabled={groupClosed}
                      onChange={(event) => groupStage.setBestThird(index, event.target.value)}
                      className="w-full rounded-md border border-input bg-[var(--input-bg)] px-3 py-2 text-sm text-foreground"
                    >
                      <option value="">Select team</option>
                      {allTeams.map((team) => {
                        const teamGroup = teamGroupByCode.get(team.code)
                        const topTwo = teamGroup ? groupStage.data.groups[teamGroup] : undefined
                        const isTopTwo = Boolean(topTwo && (topTwo.first === team.code || topTwo.second === team.code))
                        const usedTeam = team.code !== selectedTeam && usedElsewhereTeams.includes(team.code)
                        const usedGroup =
                          team.code !== selectedTeam && !!teamGroup && usedElsewhereGroups.has(teamGroup)
                        const disabled = usedTeam || usedGroup || isTopTwo
                        return (
                          <option key={`best-third-${index}-${team.code}`} value={team.code} disabled={disabled}>
                            {team.code} · {team.name}
                          </option>
                        )
                      })}
                    </select>
                    {validation.bestThirdErrors[index] ? (
                      <div className="mt-1 text-xs text-destructive">{validation.bestThirdErrors[index]}</div>
                    ) : null}
                  </div>
                )
              })}
            </div>
          </div>
        </Card>
      </div>
    </div>
  )
}
