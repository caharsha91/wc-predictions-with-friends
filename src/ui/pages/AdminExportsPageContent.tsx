import { useEffect, useMemo, useState } from 'react'
import { collection, getDocs } from 'firebase/firestore'

import { combineBracketPredictions } from '../../lib/bracket'
import {
  fetchBracketPredictions,
  fetchMembers,
  fetchBestThirdQualifiers,
  fetchLeaderboard,
  fetchMatches,
  fetchPicks,
  fetchScoring
} from '../../lib/data'
import type { DataMode } from '../../lib/dataMode'
import { firebaseDb, getLeagueId, hasFirebase } from '../../lib/firebase'
import { isMatchCompleted } from '../../lib/matchStatus'
import { getDateKeyInTimeZone, getLockTime } from '../../lib/matches'
import { flattenPicksFile, getPickOutcome, getPredictedWinner } from '../../lib/picks'
import { buildLeaderboard } from '../../lib/scoring'
import type {
  BracketPrediction,
  BracketPredictionsFile
} from '../../types/bracket'
import type { LeaderboardFile } from '../../types/leaderboard'
import type { Match, MatchStage, MatchWinner, MatchesFile } from '../../types/matches'
import type { Member } from '../../types/members'
import type { Pick, PicksFile } from '../../types/picks'
import type { ScoringConfig } from '../../types/scoring'
import { Alert } from '../components/ui/Alert'
import { Button } from '../components/ui/Button'
import { SelectField } from '../components/ui/Field'
import Progress from '../components/ui/Progress'
import Skeleton from '../components/ui/Skeleton'
import AdminWorkspaceShellV2 from '../components/v2/AdminWorkspaceShellV2'
import SnapshotStamp from '../components/v2/SnapshotStamp'
import { useTournamentPhaseState } from '../context/TournamentPhaseContext'
import { useMediaQuery } from '../hooks/useMediaQuery'
import { useRouteDataMode } from '../hooks/useRouteDataMode'
import { useToast } from '../hooks/useToast'
import { downloadWorkbook } from '../lib/exportWorkbook'

type MatchdayExportIntent = 'MATCHDAY_PICKS' | 'MATCHDAY_LEADERBOARD'

type ExportPresetId =
  | 'USER_PICKS_WORKBOOK'
  | 'MATCHDAY_PICKS_WORKBOOK'
  | 'MATCHDAY_LEADERBOARD_SNAPSHOT'
  | 'FULL_AUDIT_PACK'

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; bundle: SnapshotBundle }

type SnapshotBundle = {
  matchesFile: MatchesFile
  scoring: ScoringConfig
  picksFile: PicksFile
  bracketFile: BracketPredictionsFile
  leaderboardFile: LeaderboardFile
  members: ExportMember[]
  bestThirdQualifiers: string[]
  offlineLastUpdated: string
}

type ExportMember = Member & {
  docId?: string
}

type UserOption = {
  id: string
  name: string
  email?: string
  candidateIds: string[]
  picksCount: number
}

type SheetSpec = {
  name: string
  headers: string[]
  rows: Array<Array<string | number | boolean | Date | null | undefined>>
  widths?: number[]
}

type ScoreTotals = {
  exact: number
  outcome: number
  knockout: number
  bracket: number
  total: number
}

class NoDataError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'NoDataError'
  }
}

const STAGE_ORDER: MatchStage[] = ['Group', 'R32', 'R16', 'QF', 'SF', 'Third', 'Final']

type ExportPreset = {
  id: ExportPresetId
  label: string
  description: string
  requires: 'user' | 'matchday' | 'both'
}

const EXPORT_PRESETS: ExportPreset[] = [
  {
    id: 'USER_PICKS_WORKBOOK',
    label: 'User Picks',
    description: 'User required',
    requires: 'user'
  },
  {
    id: 'MATCHDAY_PICKS_WORKBOOK',
    label: 'Matchday Picks',
    description: 'Matchday required',
    requires: 'matchday'
  },
  {
    id: 'MATCHDAY_LEADERBOARD_SNAPSHOT',
    label: 'Leaderboard',
    description: 'Matchday required',
    requires: 'matchday'
  },
  {
    id: 'FULL_AUDIT_PACK',
    label: 'Audit Pack',
    description: 'User + Matchday',
    requires: 'both'
  }
]

function normalizeKey(value: string | null | undefined): string {
  return (value ?? '').trim().toLowerCase()
}

function sameUser(a: string | null | undefined, b: string | null | undefined): boolean {
  return normalizeKey(a) === normalizeKey(b)
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) return '—'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return value
  return parsed.toISOString()
}

function safeIso(value: string | null | undefined): string | null {
  if (!value) return null
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return null
  return parsed.toISOString()
}

function maxIso(values: Array<string | null | undefined>): string {
  let best: string | null = null
  for (const value of values) {
    const next = safeIso(value)
    if (!next) continue
    if (!best || new Date(next).getTime() > new Date(best).getTime()) {
      best = next
    }
  }
  return best ?? new Date().toISOString()
}

function sanitizeToken(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 48)
}

function looksLikeEmail(value: string | null | undefined): boolean {
  if (!value) return false
  return value.includes('@')
}

function toIsoFromUnknown(value: unknown): string {
  if (typeof value === 'string' && value.trim().length > 0) return value
  if (
    value &&
    typeof value === 'object' &&
    'toDate' in value &&
    typeof (value as { toDate?: unknown }).toDate === 'function'
  ) {
    const date = (value as { toDate: () => Date }).toDate()
    if (date instanceof Date && Number.isFinite(date.getTime())) {
      return date.toISOString()
    }
  }
  return new Date().toISOString()
}

function parseOptionalScore(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return undefined
}

function normalizeFirestorePick(
  userId: string,
  value: unknown,
  fallbackTimestamp: string,
  fallbackMatchId?: string
): Pick | null {
  if (!value || typeof value !== 'object') return null
  const record = value as Record<string, unknown>
  const matchId =
    typeof record.matchId === 'string' && record.matchId.trim()
      ? record.matchId
      : fallbackMatchId && fallbackMatchId.trim()
        ? fallbackMatchId
        : ''

  if (!matchId) return null

  const pickUserId =
    typeof record.userId === 'string' && record.userId.trim()
      ? record.userId
      : userId
  const createdAt = toIsoFromUnknown(record.createdAt ?? fallbackTimestamp)
  const updatedAt = toIsoFromUnknown(record.updatedAt ?? fallbackTimestamp)
  const id =
    typeof record.id === 'string' && record.id.trim()
      ? record.id
      : `pick-${pickUserId}-${matchId}`

  const pick: Pick = {
    id,
    matchId,
    userId: pickUserId,
    createdAt,
    updatedAt
  }

  const homeScore = parseOptionalScore(record.homeScore)
  const awayScore = parseOptionalScore(record.awayScore)
  if (homeScore !== undefined) pick.homeScore = homeScore
  if (awayScore !== undefined) pick.awayScore = awayScore
  if (record.advances === 'HOME' || record.advances === 'AWAY') pick.advances = record.advances
  if (record.outcome === 'WIN' || record.outcome === 'DRAW' || record.outcome === 'LOSS') {
    pick.outcome = record.outcome
  }
  if (record.winner === 'HOME' || record.winner === 'AWAY') pick.winner = record.winner
  if (record.decidedBy === 'REG' || record.decidedBy === 'ET' || record.decidedBy === 'PENS') {
    pick.decidedBy = record.decidedBy
  }
  return pick
}

function normalizeFirestorePicks(userId: string, rawPicks: unknown, fallbackTimestamp: string): Pick[] {
  const parsed: Pick[] = []
  if (Array.isArray(rawPicks)) {
    for (const item of rawPicks) {
      const pick = normalizeFirestorePick(userId, item, fallbackTimestamp)
      if (pick) parsed.push(pick)
    }
  } else if (rawPicks && typeof rawPicks === 'object') {
    for (const [matchId, item] of Object.entries(rawPicks as Record<string, unknown>)) {
      const pick = normalizeFirestorePick(userId, item, fallbackTimestamp, matchId)
      if (pick) parsed.push(pick)
    }
  }

  // Keep only latest pick per match for deterministic exports when legacy rows duplicate.
  const byMatch = new Map<string, Pick>()
  for (const pick of parsed) {
    const current = byMatch.get(pick.matchId)
    if (!current || new Date(pick.updatedAt).getTime() >= new Date(current.updatedAt).getTime()) {
      byMatch.set(pick.matchId, pick)
    }
  }

  return [...byMatch.values()]
}

function dedupeIds(ids: Array<string | null | undefined>): string[] {
  const set = new Set<string>()
  for (const value of ids) {
    const normalized = value?.trim()
    if (!normalized) continue
    set.add(normalized)
  }
  return [...set]
}

function getWorkbookRowCount(sheets: SheetSpec[]): number {
  return sheets.reduce((total, sheet) => total + sheet.rows.length, 0)
}

function loadUsersFromSnapshots(bundle: SnapshotBundle): UserOption[] {
  const picksCountById = new Map<string, number>()
  for (const userDoc of bundle.picksFile.picks) {
    const count = userDoc.picks?.length ?? 0
    picksCountById.set(normalizeKey(userDoc.userId), Math.max(picksCountById.get(normalizeKey(userDoc.userId)) ?? 0, count))
    for (const pick of userDoc.picks ?? []) {
      const key = normalizeKey(pick.userId)
      if (!key) continue
      picksCountById.set(key, Math.max(picksCountById.get(key) ?? 0, count))
    }
  }

  const membersById = new Map<string, Member>()
  const membersByEmail = new Map<string, Member>()
  for (const member of bundle.members) {
    const idKey = normalizeKey(member.id)
    if (idKey) membersById.set(idKey, member)
    const emailKey = normalizeKey(member.email)
    if (emailKey) membersByEmail.set(emailKey, member)
  }

  const optionsByKey = new Map<string, UserOption>()
  function upsert(
    rawId: string,
    name: string,
    email?: string,
    extraIds: Array<string | undefined> = []
  ) {
    const key = normalizeKey(email) || normalizeKey(rawId)
    if (!key) return
    const current = optionsByKey.get(key)
    const candidateIds = dedupeIds([rawId, email, ...extraIds, ...(current?.candidateIds ?? [])])
    const preferredId = current?.id ?? email ?? rawId
    const preferredEmail = current?.email ?? email
    const preferredName =
      current?.name && current.name !== current.id
        ? current.name
        : name || preferredEmail || preferredId
    const picksCount = Math.max(
      picksCountById.get(normalizeKey(rawId)) ?? 0,
      picksCountById.get(normalizeKey(email)) ?? 0,
      ...(candidateIds.map((id) => picksCountById.get(normalizeKey(id)) ?? 0)),
      current?.picksCount ?? 0
    )

    optionsByKey.set(key, {
      id: preferredId,
      name: preferredName,
      email: preferredEmail,
      candidateIds,
      picksCount
    })
  }

  // Prefer users with actual picks so default user preset never lands on an empty user.
  // In Firebase mode, do not introduce unknown users from static picks snapshots.
  for (const userDoc of bundle.picksFile.picks) {
    const memberById = membersById.get(normalizeKey(userDoc.userId))
    const memberByEmail = membersByEmail.get(normalizeKey(userDoc.userId))
    const member = memberById ?? memberByEmail
    upsert(
      userDoc.userId,
      member?.name ?? userDoc.userId,
      member?.email,
      member ? [member.id, member.email] : []
    )
  }

  for (const member of bundle.members) {
    upsert(member.id, member.name || member.email || member.id, member.email, [member.id, member.email])
  }

  for (const entry of bundle.leaderboardFile.entries) {
    const member = entry.member
    upsert(member.id, member.name || member.email || member.id, member.email, [member.id, member.email])
  }

  const mergedByName = new Map<string, UserOption>()
  for (const option of optionsByKey.values()) {
    const nameKey = normalizeKey(option.name)
    if (!nameKey) {
      mergedByName.set(option.id, option)
      continue
    }
    const existing = mergedByName.get(nameKey)
    if (!existing) {
      mergedByName.set(nameKey, option)
      continue
    }

    const shouldMerge =
      existing.name.trim().toLowerCase() === option.name.trim().toLowerCase() &&
      ((Boolean(existing.email) && !option.email) || (!existing.email && Boolean(option.email)))

    if (!shouldMerge) {
      mergedByName.set(`${nameKey}:${option.id}`, option)
      continue
    }

    const candidateIds = dedupeIds([...existing.candidateIds, ...option.candidateIds, existing.id, option.id])
    const picksCount = Math.max(existing.picksCount, option.picksCount)
    const preferredEmail = existing.email ?? option.email
    const preferredId = preferredEmail ?? (looksLikeEmail(existing.id) ? existing.id : option.id)
    const preferredName = existing.name || option.name

    mergedByName.set(nameKey, {
      id: preferredId,
      name: preferredName,
      email: preferredEmail,
      candidateIds,
      picksCount
    })
  }

  return [...mergedByName.values()].sort((a, b) => {
    if (b.picksCount !== a.picksCount) return b.picksCount - a.picksCount
    return a.name.localeCompare(b.name)
  })
}

function loadMatchdays(matches: Match[]): string[] {
  const set = new Set<string>()
  for (const match of matches) {
    set.add(getDateKeyInTimeZone(match.kickoffUtc))
  }
  return [...set].sort((a, b) => b.localeCompare(a))
}

function getUserPicksForId(file: PicksFile, userId: string): Pick[] {
  const target = normalizeKey(userId)
  const doc = file.picks.find(
    (entry) =>
      sameUser(entry.userId, target) ||
      (entry.picks ?? []).some((pick) => sameUser(pick.userId, target))
  )
  return doc?.picks ?? []
}

function getUserPrediction(predictions: BracketPrediction[], userId: string): BracketPrediction | null {
  const target = normalizeKey(userId)
  return predictions.find((entry) => sameUser(entry.userId, target)) ?? null
}

function buildMemberPool(bundle: SnapshotBundle): Member[] {
  const map = new Map<string, Member>()

  for (const member of bundle.members) {
    map.set(normalizeKey(member.id), member)
  }

  for (const entry of bundle.leaderboardFile.entries) {
    const key = normalizeKey(entry.member.id)
    if (map.has(key)) continue
    map.set(key, entry.member)
  }

  for (const userDoc of bundle.picksFile.picks) {
    const key = normalizeKey(userDoc.userId)
    if (map.has(key)) continue
    map.set(key, {
      id: userDoc.userId,
      name: userDoc.userId,
      isMember: true
    })
  }

  return [...map.values()]
}

function getMatchSortValue(match: Match | undefined): number {
  if (!match) return Number.POSITIVE_INFINITY
  const value = new Date(match.kickoffUtc).getTime()
  return Number.isNaN(value) ? Number.POSITIVE_INFINITY : value
}

function getScoreTotals(entry: ReturnType<typeof buildLeaderboard>[number] | undefined): ScoreTotals {
  if (!entry) {
    return { exact: 0, outcome: 0, knockout: 0, bracket: 0, total: 0 }
  }
  return {
    exact: entry.exactPoints,
    outcome: entry.resultPoints,
    knockout: entry.knockoutPoints,
    bracket: entry.bracketPoints,
    total: entry.totalPoints
  }
}

function buildUserWorkbookSheets(
  bundle: SnapshotBundle,
  userId: string,
  userName: string,
  overrides?: {
    picks?: Pick[]
    prediction?: BracketPrediction | null
  }
): SheetSpec[] {
  const matchesById = new Map(bundle.matchesFile.matches.map((match) => [match.id, match]))
  const picks = overrides?.picks ?? getUserPicksForId(bundle.picksFile, userId)
  const bracketPredictions = combineBracketPredictions(bundle.bracketFile)
  const userPrediction = overrides?.prediction ?? getUserPrediction(bracketPredictions, userId)

  const picksRows = [...picks]
    .sort((a, b) => getMatchSortValue(matchesById.get(a.matchId)) - getMatchSortValue(matchesById.get(b.matchId)))
    .map((pick) => {
      const match = matchesById.get(pick.matchId)
      const outcome = getPickOutcome(pick)
      const predictedWinner = getPredictedWinner(pick)
      const lockTime = match ? getLockTime(match.kickoffUtc).toISOString() : ''
      const matchday = match ? getDateKeyInTimeZone(match.kickoffUtc) : ''

      return [
        matchday,
        pick.matchId,
        match?.stage ?? '',
        match?.group ?? '',
        match?.kickoffUtc ?? '',
        match?.homeTeam.code ?? '',
        match?.awayTeam.code ?? '',
        typeof pick.homeScore === 'number' ? pick.homeScore : '',
        typeof pick.awayScore === 'number' ? pick.awayScore : '',
        outcome ?? '',
        pick.advances ?? predictedWinner ?? '',
        lockTime,
        pick.updatedAt ?? ''
      ]
    })

  const groupIds = new Set<string>()
  for (const match of bundle.matchesFile.matches) {
    if (match.stage === 'Group' && match.group) {
      groupIds.add(match.group)
    }
  }
  for (const groupId of Object.keys(userPrediction?.groups ?? {})) {
    groupIds.add(groupId)
  }

  const sortedGroupIds = [...groupIds].sort()
  const groupRows = sortedGroupIds.map((groupId) => {
    const group = userPrediction?.groups?.[groupId]
    return [
      groupId,
      group?.first ?? '',
      group?.second ?? '',
      '',
      '',
      userPrediction?.updatedAt ?? ''
    ]
  })

  const bestThirdRows = (userPrediction?.bestThirds ?? []).map((team, index) => [
    '',
    '',
    '',
    `Slot ${index + 1}`,
    team,
    userPrediction?.updatedAt ?? ''
  ])

  const stageOrderIndex = new Map(STAGE_ORDER.map((stage, index) => [stage, index]))
  const bracketRows = Object.entries(userPrediction?.knockout ?? {})
    .flatMap(([stage, picksByMatch]) =>
      Object.entries(picksByMatch ?? {}).map(([matchId, winner]) => ({
        stage: stage as MatchStage,
        matchId,
        winner
      }))
    )
    .sort((a, b) => {
      const stageA = stageOrderIndex.get(a.stage) ?? Number.POSITIVE_INFINITY
      const stageB = stageOrderIndex.get(b.stage) ?? Number.POSITIVE_INFINITY
      if (stageA !== stageB) return stageA - stageB
      const kickoffA = getMatchSortValue(matchesById.get(a.matchId))
      const kickoffB = getMatchSortValue(matchesById.get(b.matchId))
      return kickoffA - kickoffB
    })
    .map((entry) => {
      const match = matchesById.get(entry.matchId)
      const predictedTeam =
        entry.winner === 'HOME'
          ? match?.homeTeam.code ?? 'HOME'
          : entry.winner === 'AWAY'
            ? match?.awayTeam.code ?? 'AWAY'
            : ''

      return [
        entry.stage,
        match ? getDateKeyInTimeZone(match.kickoffUtc) : '',
        entry.matchId,
        match?.kickoffUtc ?? '',
        match?.homeTeam.code ?? '',
        match?.awayTeam.code ?? '',
        entry.winner,
        predictedTeam,
        userPrediction?.updatedAt ?? ''
      ]
    })

  const daySet = new Set<string>()
  for (const match of bundle.matchesFile.matches) {
    daySet.add(getDateKeyInTimeZone(match.kickoffUtc))
  }
  const matchdaysAsc = [...daySet].sort((a, b) => a.localeCompare(b))

  const member: Member = { id: userId, name: userName, isMember: true }
  const predictionList = userPrediction ? [userPrediction] : []
  const picksForScoring = picks
  let previous: ScoreTotals = { exact: 0, outcome: 0, knockout: 0, bracket: 0, total: 0 }
  const resultsRows = matchdaysAsc.map((matchday) => {
    const finishedThroughDay = bundle.matchesFile.matches.filter(
      (match) => isMatchCompleted(match) && getDateKeyInTimeZone(match.kickoffUtc) <= matchday
    )
    const entry = buildLeaderboard(
      [member],
      finishedThroughDay,
      picksForScoring,
      predictionList,
      bundle.scoring,
      bundle.bestThirdQualifiers
    )[0]
    const current = getScoreTotals(entry)

    const finishedOnDay = bundle.matchesFile.matches.filter(
      (match) => isMatchCompleted(match) && getDateKeyInTimeZone(match.kickoffUtc) === matchday
    ).length

    const awardedExact = current.exact - previous.exact
    const awardedOutcome = current.outcome - previous.outcome
    const awardedKnockout = current.knockout - previous.knockout
    const awardedBracket = current.bracket - previous.bracket
    const awardedTotal = current.total - previous.total

    previous = current

    return [
      matchday,
      finishedOnDay,
      awardedExact,
      awardedOutcome,
      awardedKnockout,
      awardedBracket,
      awardedTotal,
      current.total
    ]
  })

  resultsRows.push([
    'TOTAL',
    '',
    previous.exact,
    previous.outcome,
    previous.knockout,
    previous.bracket,
    previous.total,
    previous.total
  ])

  const nowIso = new Date().toISOString()
  const metadataRows = [
    ['Export preset', 'User picks workbook'],
    ['Last updated (offline)', bundle.offlineLastUpdated],
    ['Export intent', 'User Picks Export'],
    ['Selected user', `${userName} (${userId})`],
    ['Export timestamp (UTC)', nowIso],
    ['Rows exported (Picks)', picksRows.length],
    ['Matches snapshot last updated', formatDateTime(bundle.matchesFile.lastUpdated)],
    ['Leaderboard snapshot last updated', formatDateTime(bundle.leaderboardFile.lastUpdated)],
    ['User picks count', picks.length],
    ['Group outcomes rows', groupRows.length + bestThirdRows.length],
    ['Bracket picks rows', bracketRows.length],
    ['Results rows', resultsRows.length]
  ]

  return [
    {
      name: 'Picks',
      headers: [
        'Matchday',
        'Match ID',
        'Stage',
        'Group',
        'Kickoff UTC',
        'Home Team',
        'Away Team',
        'Pick Home Score',
        'Pick Away Score',
        'Pick Outcome',
        'Advances',
        'Lock Time UTC',
        'Pick Updated At UTC'
      ],
      rows: picksRows,
      widths: [16, 18, 12, 10, 24, 14, 14, 14, 14, 14, 12, 24, 24]
    },
    {
      name: 'GroupOutcomes',
      headers: [
        'Group',
        'Predicted First',
        'Predicted Second',
        'Best Third Slot',
        'Best Third Team',
        'Updated At UTC'
      ],
      rows: [...groupRows, ...bestThirdRows],
      widths: [12, 18, 18, 16, 16, 24]
    },
    {
      name: 'Bracket',
      headers: [
        'Stage',
        'Matchday',
        'Match ID',
        'Kickoff UTC',
        'Home Team',
        'Away Team',
        'Predicted Winner',
        'Predicted Team',
        'Updated At UTC'
      ],
      rows: bracketRows,
      widths: [14, 14, 18, 24, 14, 14, 16, 16, 24]
    },
    {
      name: 'Results',
      headers: [
        'Matchday',
        'Finished Matches',
        'Exact Points (Awarded)',
        'Outcome Points (Awarded)',
        'Knockout Points (Awarded)',
        'Bracket Points (Awarded)',
        'Matchday Total Points',
        'Cumulative Total Points'
      ],
      rows: resultsRows,
      widths: [14, 16, 20, 22, 22, 22, 20, 22]
    },
    {
      name: 'Metadata',
      headers: ['Field', 'Value'],
      rows: metadataRows,
      widths: [32, 56]
    }
  ]
}

function buildMatchdayPicksRows(
  bundle: SnapshotBundle,
  users: UserOption[],
  selectedMatchday: string
): SheetSpec['rows'] {
  const matchById = new Map(
    bundle.matchesFile.matches
      .filter((match) => getDateKeyInTimeZone(match.kickoffUtc) === selectedMatchday)
      .map((match) => [match.id, match])
  )

  const userNameById = new Map<string, string>()
  for (const user of users) {
    const allIds = dedupeIds([user.id, user.email, ...user.candidateIds])
    for (const id of allIds) {
      userNameById.set(normalizeKey(id), user.name)
    }
  }
  for (const member of bundle.members) {
    userNameById.set(normalizeKey(member.id), member.name || member.id)
    if (member.email) userNameById.set(normalizeKey(member.email), member.name || member.email)
    if (member.authUid) userNameById.set(normalizeKey(member.authUid), member.name || member.authUid)
  }

  const rows: SheetSpec['rows'] = []
  for (const userDoc of bundle.picksFile.picks) {
    for (const pick of userDoc.picks ?? []) {
      const match = matchById.get(pick.matchId)
      if (!match) continue

      const resolvedUserId = pick.userId || userDoc.userId
      const resolvedUserName =
        userNameById.get(normalizeKey(resolvedUserId)) ??
        userNameById.get(normalizeKey(userDoc.userId)) ??
        resolvedUserId

      rows.push([
        selectedMatchday,
        match.id,
        match.stage,
        match.kickoffUtc,
        resolvedUserId,
        resolvedUserName,
        match.homeTeam.code,
        match.awayTeam.code,
        typeof pick.homeScore === 'number' ? pick.homeScore : '',
        typeof pick.awayScore === 'number' ? pick.awayScore : '',
        getPickOutcome(pick) ?? '',
        pick.advances ?? getPredictedWinner(pick) ?? '',
        pick.updatedAt ?? ''
      ])
    }
  }

  rows.sort((a, b) => {
    const kickoffA = new Date(String(a[3] ?? '')).getTime()
    const kickoffB = new Date(String(b[3] ?? '')).getTime()
    if (kickoffA !== kickoffB) return kickoffA - kickoffB
    return String(a[5] ?? '').localeCompare(String(b[5] ?? ''))
  })

  return rows
}

function buildMatchdayWorkbookSheets(
  bundle: SnapshotBundle,
  users: UserOption[],
  selectedMatchday: string,
  intent: MatchdayExportIntent
): SheetSpec[] {
  const matches = bundle.matchesFile.matches.filter(
    (match) => getDateKeyInTimeZone(match.kickoffUtc) === selectedMatchday
  )
  const picksRows = buildMatchdayPicksRows(bundle, users, selectedMatchday)

  const memberPool = buildMemberPool(bundle)
  const finishedThroughMatchday = bundle.matchesFile.matches.filter(
    (match) => isMatchCompleted(match) && getDateKeyInTimeZone(match.kickoffUtc) <= selectedMatchday
  )
  const snapshotEntries = buildLeaderboard(
    memberPool,
    finishedThroughMatchday,
    flattenPicksFile(bundle.picksFile),
    combineBracketPredictions(bundle.bracketFile),
    bundle.scoring,
    bundle.bestThirdQualifiers
  )

  const leaderboardRows = snapshotEntries.map((entry, index) => [
    index + 1,
    entry.member.id,
    entry.member.name,
    entry.totalPoints,
    entry.exactPoints,
    entry.resultPoints,
    entry.knockoutPoints,
    entry.bracketPoints,
    entry.exactCount,
    entry.picksCount
  ])

  const nowIso = new Date().toISOString()
  const metadataRows = [
    ['Export preset', intent === 'MATCHDAY_PICKS' ? 'Matchday picks workbook' : 'Matchday leaderboard snapshot'],
    ['Last updated (offline)', bundle.offlineLastUpdated],
    ['Export intent', intent === 'MATCHDAY_PICKS' ? 'Matchday Picks Export' : 'Matchday Leaderboard Snapshot Export'],
    ['Selected matchday', selectedMatchday],
    ['Export timestamp (UTC)', nowIso],
    ['Matches snapshot last updated', formatDateTime(bundle.matchesFile.lastUpdated)],
    ['Leaderboard snapshot last updated', formatDateTime(bundle.leaderboardFile.lastUpdated)],
    ['Users included', new Set(picksRows.map((row) => String(row[4] ?? ''))).size],
    ['Matches included', matches.length],
    ['Pick rows', picksRows.length],
    ['Leaderboard rows', leaderboardRows.length]
  ]

  if (intent === 'MATCHDAY_LEADERBOARD') {
    return [
      {
        name: 'Leaderboard',
        headers: [
          'Rank',
          'User ID',
          'User Name',
          'Total Points',
          'Exact Points',
          'Outcome Points',
          'Knockout Points',
          'Bracket Points',
          'Exact Count',
          'Graded Picks Count'
        ],
        rows: leaderboardRows,
        widths: [8, 20, 20, 14, 14, 16, 16, 14, 12, 18]
      },
      {
        name: 'Metadata',
        headers: ['Field', 'Value'],
        rows: metadataRows,
        widths: [32, 56]
      }
    ]
  }

  return [
    {
      name: 'Picks',
      headers: [
        'Matchday',
        'Match ID',
        'Stage',
        'Kickoff UTC',
        'User ID',
        'User Name',
        'Home Team',
        'Away Team',
        'Pick Home Score',
        'Pick Away Score',
        'Pick Outcome',
        'Advances',
        'Pick Updated At UTC'
      ],
      rows: picksRows,
      widths: [14, 18, 12, 24, 20, 20, 14, 14, 14, 14, 14, 12, 24]
    },
    {
      name: 'Metadata',
      headers: ['Field', 'Value'],
      rows: metadataRows,
      widths: [32, 56]
    }
  ]
}

async function loadExportPicksAndBracketDataForMode(
  dataMode: DataMode
): Promise<{
  picksFile: PicksFile
  bracketFile: BracketPredictionsFile
}> {
  if (dataMode === 'demo') {
    const [picksFile, bracketFile] = await Promise.all([
      fetchPicks({ mode: 'demo' }),
      fetchBracketPredictions({ mode: 'demo' })
    ])
    return { picksFile, bracketFile }
  }

  if (!hasFirebase || !firebaseDb) {
    throw new Error(
      'Exports are unavailable in this environment. Connect the live data source and sign in with admin access.'
    )
  }

  try {
    const leagueId = getLeagueId()
    const [picksSnap, bracketGroupSnap, bracketKnockoutSnap] = await Promise.all([
      getDocs(collection(firebaseDb, 'leagues', leagueId, 'picks')),
      getDocs(collection(firebaseDb, 'leagues', leagueId, 'bracket-group')),
      getDocs(collection(firebaseDb, 'leagues', leagueId, 'bracket-knockout'))
    ])

    const picksFile: PicksFile = {
      picks: picksSnap.docs.map((docSnap) => {
        const data = docSnap.data() as Record<string, unknown>
        const updatedAt = toIsoFromUnknown(data.updatedAt)
        const userId =
          typeof data.userId === 'string' && data.userId.trim()
            ? data.userId
            : docSnap.id
        return {
          userId,
          picks: normalizeFirestorePicks(userId, data.picks, updatedAt),
          updatedAt
        }
      })
    }

    const bracketFile: BracketPredictionsFile = {
      group: bracketGroupSnap.docs.map((docSnap) => {
        const data = docSnap.data() as Record<string, unknown>
        return {
          userId:
            typeof data.userId === 'string' && data.userId.trim()
              ? data.userId
              : docSnap.id,
          groups:
            data.groups && typeof data.groups === 'object'
              ? (data.groups as Record<string, { first?: string; second?: string }>)
              : {},
          bestThirds: Array.isArray(data.bestThirds) ? (data.bestThirds as string[]) : [],
          updatedAt: toIsoFromUnknown(data.updatedAt)
        }
      }),
      knockout: bracketKnockoutSnap.docs.map((docSnap) => {
        const data = docSnap.data() as Record<string, unknown>
        return {
          userId:
            typeof data.userId === 'string' && data.userId.trim()
              ? data.userId
              : docSnap.id,
          knockout:
            data.knockout && typeof data.knockout === 'object'
              ? (data.knockout as Record<string, Record<string, MatchWinner>>)
              : {},
          updatedAt: toIsoFromUnknown(data.updatedAt)
        }
      })
    }

    return { picksFile, bracketFile }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown Firestore error.'
    throw new Error(`Failed to read export picks/bracket from Firestore. ${message}`)
  }
}

async function loadMembersForMode(dataMode: DataMode): Promise<ExportMember[]> {
  if (dataMode === 'demo') {
    const membersFile = await fetchMembers({ mode: 'demo' })
    return membersFile.members.map((member) => ({
      ...member,
      id: member.id,
      docId: member.email?.toLowerCase()
    }))
  }

  if (!hasFirebase || !firebaseDb) {
    throw new Error(
      'Exports are unavailable in this environment. Connect the live data source and sign in with admin access.'
    )
  }

  try {
    const snapshot = await getDocs(collection(firebaseDb, 'leagues', getLeagueId(), 'members'))
    return snapshot.docs.map((docSnap) => {
      const data = docSnap.data() as Partial<ExportMember>
      const email = (data.email ?? docSnap.id).toLowerCase()
      const id =
        typeof data.id === 'string' && data.id.trim()
          ? data.id
          : email
      return {
        id,
        docId: docSnap.id,
        name: data.name ?? email,
        email,
        authUid: typeof data.authUid === 'string' && data.authUid.trim() ? data.authUid : undefined,
        isAdmin: data.isAdmin === true,
        isMember: true
      } satisfies ExportMember
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown Firestore error.'
    throw new Error(`Failed to read members from Firestore. ${message}`)
  }
}

async function loadBundleForMode(dataMode: DataMode): Promise<SnapshotBundle> {
  const [matchesFile, scoring, picksAndBracket, leaderboardFile, bestThirdFile, members] =
    await Promise.all([
      fetchMatches({ mode: dataMode }),
      fetchScoring({ mode: dataMode }),
      loadExportPicksAndBracketDataForMode(dataMode),
      fetchLeaderboard({ mode: dataMode }),
      fetchBestThirdQualifiers({ mode: dataMode }),
      loadMembersForMode(dataMode)
    ])
  const { picksFile, bracketFile } = picksAndBracket

  const picksUpdates = picksFile.picks.map((entry) => entry.updatedAt)
  const groupUpdates = bracketFile.group.map((entry) => entry.updatedAt)
  const knockoutUpdates = bracketFile.knockout.map((entry) => entry.updatedAt)

  const offlineLastUpdated = maxIso([
    matchesFile.lastUpdated,
    leaderboardFile.lastUpdated,
    ...picksUpdates,
    ...groupUpdates,
    ...knockoutUpdates
  ])

  return {
    matchesFile,
    scoring,
    picksFile,
    bracketFile,
    leaderboardFile,
    members,
    bestThirdQualifiers: bestThirdFile.qualifiers,
    offlineLastUpdated
  }
}

const PRESET_SHEETS: Record<ExportPresetId, string[]> = {
  USER_PICKS_WORKBOOK: ['Picks', 'GroupOutcomes', 'Bracket', 'Results', 'Metadata'],
  MATCHDAY_PICKS_WORKBOOK: ['Picks', 'Metadata'],
  MATCHDAY_LEADERBOARD_SNAPSHOT: ['Leaderboard', 'Metadata'],
  FULL_AUDIT_PACK: ['Picks', 'GroupOutcomes', 'Bracket', 'Results', 'MatchdayPicks', 'MatchdayBoard']
}

const SHEET_DISPLAY_LABELS: Record<string, string> = {
  GroupOutcomes: 'Group Outcomes',
  MatchdayPicks: 'Matchday Picks',
  MatchdayBoard: 'Matchday Board'
}

function formatSheetDisplayLabel(name: string): string {
  return SHEET_DISPLAY_LABELS[name] ?? name
}

export default function AdminExportsPage() {
  // QA-SMOKE: route=/admin/exports and /demo/admin/exports ; checklist-id=smoke-admin-exports
  const dataMode = useRouteDataMode()
  const isDemoMode = dataMode === 'demo'
  const phaseState = useTournamentPhaseState()
  const isDesktopViewport = useMediaQuery('(min-width: 768px)')
  const { showToast, updateToast } = useToast()
  const [state, setState] = useState<LoadState>({ status: 'loading' })
  const [selectedPresetId, setSelectedPresetId] = useState<ExportPresetId>('USER_PICKS_WORKBOOK')
  const [selectedUserId, setSelectedUserId] = useState('')
  const [selectedMatchday, setSelectedMatchday] = useState('')
  const [exportStatus, setExportStatus] = useState<'idle' | 'exporting'>('idle')
  const [exportProgress, setExportProgress] = useState(0)
  const exportGateMessage = !isDesktopViewport
    ? 'Exports are available on desktop only.'
    : !phaseState.lockFlags.exportsVisible
      ? 'Exports unlock after tournament lock windows are reached.'
      : null
  const canExport = exportGateMessage === null

  useEffect(() => {
    let canceled = false
    async function run() {
      setState({ status: 'loading' })
      try {
        const bundle = await loadBundleForMode(dataMode)
        if (canceled) return
        setState({ status: 'ready', bundle })
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unable to load export data.'
        if (!canceled) setState({ status: 'error', message })
      }
    }

    void run()
    return () => {
      canceled = true
    }
  }, [dataMode])

  const users = useMemo(() => {
    if (state.status !== 'ready') return []
    return loadUsersFromSnapshots(state.bundle)
  }, [state])

  const matchdays = useMemo(() => {
    if (state.status !== 'ready') return []
    return loadMatchdays(state.bundle.matchesFile.matches)
  }, [state])

  useEffect(() => {
    if (users.length === 0) return
    if (selectedUserId && users.some((user) => sameUser(user.id, selectedUserId))) return
    setSelectedUserId(users[0].id)
  }, [selectedUserId, users])

  useEffect(() => {
    if (matchdays.length === 0) return
    if (selectedMatchday && matchdays.includes(selectedMatchday)) return
    setSelectedMatchday(matchdays[0])
  }, [matchdays, selectedMatchday])

  const selectedUser = useMemo(
    () => users.find((user) => sameUser(user.id, selectedUserId)) ?? null,
    [selectedUserId, users]
  )

  const selectedPreset = useMemo(
    () => EXPORT_PRESETS.find((preset) => preset.id === selectedPresetId) ?? EXPORT_PRESETS[0],
    [selectedPresetId]
  )

  const selectedMatchdayPickCount = useMemo(() => {
    if (state.status !== 'ready' || !selectedMatchday) return 0
    return buildMatchdayPicksRows(state.bundle, users, selectedMatchday).length
  }, [selectedMatchday, state, users])
  const selectedUserPickCount = useMemo(() => {
    if (state.status !== 'ready' || !selectedUser) return 0
    return resolveSelectedUserData(selectedUser).resolvedPicks.length
  }, [selectedUser, state])
  const noDataHint = useMemo(() => {
    if (state.status !== 'ready') return null
    if (selectedPreset.requires === 'user' && selectedUserPickCount === 0) {
      return selectedUser ? `${selectedUser.name} has no submitted picks yet.` : 'Select a user with submitted picks.'
    }
    if (selectedPreset.requires === 'matchday' && selectedMatchdayPickCount === 0) {
      return selectedMatchday ? `No picks were submitted for ${selectedMatchday}.` : 'Select a matchday with submitted picks.'
    }
    if (selectedPreset.requires === 'both') {
      if (selectedUserPickCount === 0 && selectedMatchdayPickCount === 0) {
        return `${selectedUser?.name ?? 'Selected user'} has no picks and ${selectedMatchday || 'selected matchday'} has no submitted picks.`
      }
      if (selectedUserPickCount === 0) {
        return `${selectedUser?.name ?? 'Selected user'} has no submitted picks yet.`
      }
      if (selectedMatchdayPickCount === 0) {
        return `No picks were submitted for ${selectedMatchday || 'selected matchday'}.`
      }
    }
    return null
  }, [
    selectedMatchday,
    selectedMatchdayPickCount,
    selectedPreset.requires,
    selectedUser,
    selectedUserPickCount,
    state.status
  ])
  const requiresUser = selectedPreset.requires === 'user' || selectedPreset.requires === 'both'
  const requiresMatchday = selectedPreset.requires === 'matchday' || selectedPreset.requires === 'both'
  const isAuditPreset = selectedPreset.id === 'FULL_AUDIT_PACK'
  const exportDisabledReason = !canExport ? exportGateMessage : noDataHint
  const isExportActionDisabled = exportStatus === 'exporting' || Boolean(exportDisabledReason)
  const exportControlsDesktopClass = isAuditPreset
    ? 'lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_auto]'
    : 'lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]'
  const availabilityText = canExport ? 'Exports enabled' : exportGateMessage ?? 'Exports unavailable.'
  const modeContextText = isDemoMode ? 'Demo testing mode' : 'Live admin mode'
  const headerMetadata = (
    <>
      {state.status === 'ready' ? (
        <SnapshotStamp timestamp={state.bundle.offlineLastUpdated} prefix="Offline " />
      ) : (
        <span>{state.status === 'loading' ? 'Loading offline snapshot...' : 'Offline snapshot unavailable'}</span>
      )}
      <span className="h-3 w-px bg-border" aria-hidden="true" />
      <span>{modeContextText}</span>
      <span className="h-3 w-px bg-border" aria-hidden="true" />
      <span>{availabilityText}</span>
    </>
  )
  const includedSheetsText = useMemo(() => {
    const sheets = PRESET_SHEETS[selectedPresetId] ?? []
    if (sheets.length === 0) return 'No sheets'
    return sheets.map(formatSheetDisplayLabel).join(' • ')
  }, [selectedPresetId])

  function resolveSelectedUserData(user: UserOption) {
    const candidateIds = dedupeIds([user.id, user.email, ...user.candidateIds])
    const predictions = combineBracketPredictions(state.status === 'ready' ? state.bundle.bracketFile : { group: [], knockout: [] })

    let resolvedPicks: Pick[] = []
    let resolvedPrediction: BracketPrediction | null = null
    let resolvedUserId = user.id

    if (state.status !== 'ready') {
      return { resolvedPicks, resolvedPrediction, resolvedUserId }
    }

    for (const candidateId of candidateIds) {
      const candidatePicks = getUserPicksForId(state.bundle.picksFile, candidateId)
      const candidatePrediction = getUserPrediction(predictions, candidateId)
      if (candidatePicks.length > 0 || candidatePrediction) {
        resolvedPicks = candidatePicks
        resolvedPrediction = candidatePrediction
        resolvedUserId = candidateId
        break
      }
    }

    return { resolvedPicks, resolvedPrediction, resolvedUserId }
  }

  function buildExportWorkbook(presetId: ExportPresetId): {
    presetLabel: string
    fileName: string
    sheets: SheetSpec[]
    selectedUserId?: string
    selectedMatchday?: string
  } {
    if (state.status !== 'ready') {
      throw new Error('Export data is still loading.')
    }

    const dateSuffix = new Date().toISOString().slice(0, 10)

    if (presetId === 'USER_PICKS_WORKBOOK') {
      if (!selectedUser) {
        throw new Error('Select a user before exporting.')
      }

      const { resolvedPicks, resolvedPrediction, resolvedUserId } = resolveSelectedUserData(selectedUser)
      if (resolvedPicks.length === 0) {
        throw new NoDataError(`No picks found for ${selectedUser.name}.`)
      }
      const sheets = buildUserWorkbookSheets(
        state.bundle,
        resolvedUserId,
        selectedUser.name,
        {
          picks: resolvedPicks,
          prediction: resolvedPrediction
        }
      )
      const fileName = `user-picks-workbook-${sanitizeToken(selectedUser.name || selectedUser.id)}-${dateSuffix}.xlsx`
      return {
        presetLabel: 'User picks workbook',
        fileName,
        sheets,
        selectedUserId: selectedUser.id
      }
    }

    if (presetId === 'MATCHDAY_PICKS_WORKBOOK') {
      if (!selectedMatchday) {
        throw new Error('Select a matchday before exporting.')
      }
      if (buildMatchdayPicksRows(state.bundle, users, selectedMatchday).length === 0) {
        throw new NoDataError(`No picks found for ${selectedMatchday}.`)
      }
      const sheets = buildMatchdayWorkbookSheets(state.bundle, users, selectedMatchday, 'MATCHDAY_PICKS')
      return {
        presetLabel: 'Matchday picks workbook',
        fileName: `matchday-picks-workbook-${sanitizeToken(selectedMatchday)}-${dateSuffix}.xlsx`,
        sheets,
        selectedMatchday
      }
    }

    if (presetId === 'MATCHDAY_LEADERBOARD_SNAPSHOT') {
      if (!selectedMatchday) {
        throw new Error('Select a matchday before exporting.')
      }
      if (buildMatchdayPicksRows(state.bundle, users, selectedMatchday).length === 0) {
        throw new NoDataError(`No picks found for ${selectedMatchday}.`)
      }
      const sheets = buildMatchdayWorkbookSheets(state.bundle, users, selectedMatchday, 'MATCHDAY_LEADERBOARD')
      return {
        presetLabel: 'Matchday leaderboard snapshot',
        fileName: `matchday-leaderboard-snapshot-${sanitizeToken(selectedMatchday)}-${dateSuffix}.xlsx`,
        sheets,
        selectedMatchday
      }
    }

    if (!selectedUser || !selectedMatchday) {
      throw new Error('Select both user and matchday before exporting full audit pack.')
    }

    const { resolvedPicks, resolvedPrediction, resolvedUserId } = resolveSelectedUserData(selectedUser)
    const matchdayPicksCount = buildMatchdayPicksRows(state.bundle, users, selectedMatchday).length
    if (resolvedPicks.length === 0 && matchdayPicksCount === 0) {
      throw new NoDataError(`No picks found for ${selectedUser.name} or ${selectedMatchday}.`)
    }
    if (resolvedPicks.length === 0) {
      throw new NoDataError(`No picks found for ${selectedUser.name}.`)
    }
    if (matchdayPicksCount === 0) {
      throw new NoDataError(`No picks found for ${selectedMatchday}.`)
    }

    const userSheets = buildUserWorkbookSheets(
      state.bundle,
      resolvedUserId,
      selectedUser.name,
      {
        picks: resolvedPicks,
        prediction: resolvedPrediction
      }
    )
    const matchdaySheets = buildMatchdayWorkbookSheets(
      state.bundle,
      users,
      selectedMatchday,
      'MATCHDAY_PICKS'
    ).map((sheet) => {
      if (sheet.name === 'Picks') return { ...sheet, name: 'MatchdayPicks' }
      if (sheet.name === 'Metadata') return { ...sheet, name: 'MatchdayMeta' }
      return sheet
    })
    const leaderboardSheets = buildMatchdayWorkbookSheets(
      state.bundle,
      users,
      selectedMatchday,
      'MATCHDAY_LEADERBOARD'
    ).map((sheet) => {
      if (sheet.name === 'Leaderboard') return { ...sheet, name: 'MatchdayBoard' }
      if (sheet.name === 'Metadata') return { ...sheet, name: 'MatchdayBoardMeta' }
      return sheet
    })

    return {
      presetLabel: 'Full audit pack',
      fileName: `full-audit-pack-${sanitizeToken(selectedUser.name || selectedUser.id)}-${sanitizeToken(selectedMatchday)}-${dateSuffix}.xlsx`,
      sheets: [...userSheets, ...matchdaySheets, ...leaderboardSheets],
      selectedUserId: selectedUser.id,
      selectedMatchday
    }
  }

  async function runExport(presetId: ExportPresetId) {
    if (state.status !== 'ready') return
    if (!canExport) {
      showToast({
        tone: 'warning',
        title: 'Exports unavailable',
        message: exportGateMessage ?? 'Exports are currently unavailable.'
      })
      return
    }

    const startMs = performance.now()
    const presetLabel = EXPORT_PRESETS.find((preset) => preset.id === presetId)?.label ?? 'Workbook'
    let progressToastId = ''

    try {
      setExportStatus('exporting')
      setExportProgress(12)
      progressToastId = showToast({
        title: 'Preparing export',
        message: `${presetLabel}...`,
        tone: 'info',
        progress: { value: 12, intent: 'momentum' },
        durationMs: 45_000
      })

      setExportProgress(38)
      updateToast(progressToastId, {
        message: 'Compiling workbook sheets...',
        progress: { value: 38, intent: 'momentum' }
      })
      const prepared = buildExportWorkbook(presetId)

      setExportProgress(72)
      updateToast(progressToastId, {
        message: `Writing ${prepared.sheets.length} sheets...`,
        progress: { value: 72, intent: 'momentum' }
      })
      await downloadWorkbook(prepared.fileName, prepared.sheets)
      const durationMs = Math.max(1, Math.round(performance.now() - startMs))
      const rowCount = getWorkbookRowCount(prepared.sheets)
      setExportProgress(100)
      updateToast(progressToastId, {
        title: 'Export downloaded',
        message: `Exported ${rowCount} rows in ${(durationMs / 1000).toFixed(1)}s (${prepared.fileName}).`,
        tone: 'success',
        progress: { value: 100, intent: 'success' },
        durationMs: 7_500
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Export failed.'
      const isNoData = error instanceof NoDataError
      setExportProgress(100)
      if (progressToastId) {
        updateToast(progressToastId, {
          title: isNoData ? 'No data to export' : 'Export failed',
          message,
          tone: isNoData ? 'warning' : 'danger',
          progress: { value: 100, intent: 'warning' },
          durationMs: isNoData ? 7_000 : 9_000
        })
      } else {
        showToast({ title: isNoData ? 'No data to export' : 'Export failed', message, tone: isNoData ? 'warning' : 'danger' })
      }
      if (isNoData) return
    } finally {
      setExportStatus('idle')
      window.setTimeout(() => setExportProgress(0), 1_500)
    }
  }

  if (state.status === 'loading') {
    return (
      <AdminWorkspaceShellV2
        title="Exports"
        subtitle={isDemoMode ? 'Generate demo snapshot workbooks for testing.' : 'Generate tournament workbooks for league operations.'}
        metadata={headerMetadata}
        kicker={isDemoMode ? 'Admin Demo' : 'Admin'}
      >
        <div className="space-y-4">
          <Skeleton className="h-24 rounded-2xl" />
          <Skeleton className="h-80 rounded-2xl" />
        </div>
      </AdminWorkspaceShellV2>
    )
  }

  if (state.status === 'error') {
    return (
      <AdminWorkspaceShellV2
        title="Exports"
        subtitle={isDemoMode ? 'Generate demo snapshot workbooks for testing.' : 'Generate tournament workbooks for league operations.'}
        metadata={headerMetadata}
        kicker={isDemoMode ? 'Admin Demo' : 'Admin'}
      >
        <Alert tone="danger" title="Unable to load exports" className="admin-v2-inline-alert">
          {state.message}
        </Alert>
      </AdminWorkspaceShellV2>
    )
  }

  return (
    <AdminWorkspaceShellV2
      title="Exports"
      subtitle={isDemoMode ? 'Generate demo snapshot workbooks for testing.' : 'Generate tournament workbooks for league operations.'}
      metadata={headerMetadata}
      kicker={isDemoMode ? 'Admin Demo' : 'Admin'}
    >
      <div className="v2-section-flat">
        <div className="space-y-3.5">
          {isDemoMode ? (
            <Alert tone="warning" title="Demo testing export context" className="admin-v2-inline-alert py-2.5 text-[13px]">
              Demo exports use test snapshot data only and do not change live league data.
            </Alert>
          ) : null}

          <div className="admin-v2-section-label">Export</div>

          <div className={`admin-v2-controls grid gap-3 ${exportControlsDesktopClass}`}>
            <SelectField
              label="Export preset"
              value={selectedPresetId}
              onChange={(event) => setSelectedPresetId(event.target.value as ExportPresetId)}
              labelHidden
            >
              {EXPORT_PRESETS.map((preset) => (
                <option key={preset.id} value={preset.id}>
                  {preset.label}
                </option>
              ))}
            </SelectField>

            {requiresUser ? (
              <SelectField
                label="User"
                value={selectedUserId}
                onChange={(event) => setSelectedUserId(event.target.value)}
                labelHidden
              >
                {users.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.name} ({user.email ?? user.id})
                  </option>
                ))}
              </SelectField>
            ) : null}

            {requiresMatchday ? (
              <SelectField
                label="Matchday"
                value={selectedMatchday}
                onChange={(event) => setSelectedMatchday(event.target.value)}
                labelHidden
              >
                {matchdays.map((matchday) => (
                  <option key={matchday} value={matchday}>
                    {matchday}
                  </option>
                ))}
              </SelectField>
            ) : null}

            <div className="flex items-end">
              <Button
                size="md"
                className="admin-v2-action v2-action-prominent lg:min-w-[180px]"
                loading={exportStatus === 'exporting'}
                disabled={isExportActionDisabled}
                onClick={() => void runExport(selectedPresetId)}
              >
                {exportStatus === 'exporting' ? 'Preparing...' : 'Export'}
              </Button>
            </div>
          </div>

          <div className="admin-v2-row-meta">
            {exportDisabledReason ? `Export disabled: ${exportDisabledReason}` : 'Export enabled for current selection.'}
          </div>

          {exportDisabledReason ? (
            <Alert
              tone="warning"
              title={!canExport ? 'Export unavailable in current admin state' : 'Export blocked for current selection'}
              className="admin-v2-inline-alert py-2.5 text-[13px]"
            >
              {exportDisabledReason}
            </Alert>
          ) : null}

          <div className="admin-v2-divider" />

          <div className="text-[15px] leading-snug text-foreground">
            <span className="text-muted-foreground">Included:</span> {includedSheetsText}
          </div>

          {exportStatus === 'exporting' || exportProgress > 0 ? (
            <div className="space-y-1">
              <div className="text-[13px] text-muted-foreground">
                {exportStatus === 'exporting' ? 'Preparing workbook...' : 'Export complete'}
              </div>
              <Progress
                value={exportProgress}
                intent={exportStatus === 'exporting' ? 'momentum' : 'success'}
                size="sm"
                aria-label="Export batch progress"
              />
            </div>
          ) : null}
        </div>
      </div>
    </AdminWorkspaceShellV2>
  )
}
