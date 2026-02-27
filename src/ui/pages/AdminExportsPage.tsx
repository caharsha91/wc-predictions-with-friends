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
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import DetailsDisclosure from '../components/ui/DetailsDisclosure'
import { SelectField } from '../components/ui/Field'
import PanelState from '../components/ui/PanelState'
import Progress from '../components/ui/Progress'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle
} from '../components/ui/Sheet'
import Skeleton from '../components/ui/Skeleton'
import Table from '../components/ui/Table'
import PageHeaderV2 from '../components/v2/PageHeaderV2'
import SectionCardV2 from '../components/v2/SectionCardV2'
import SnapshotStamp from '../components/v2/SnapshotStamp'
import { useTournamentPhaseState } from '../context/TournamentPhaseContext'
import { useMediaQuery } from '../hooks/useMediaQuery'
import { useRouteDataMode } from '../hooks/useRouteDataMode'
import { useToast } from '../hooks/useToast'
import { downloadWorkbook } from '../lib/exportWorkbook'
import { cn } from '../lib/utils'

type ExportIntent =
  | 'USER_PICKS'
  | 'USER_RESULTS'
  | 'MATCHDAY_PICKS'
  | 'MATCHDAY_LEADERBOARD'

type ExportPresetId =
  | 'USER_PICKS_WORKBOOK'
  | 'MATCHDAY_PICKS_WORKBOOK'
  | 'MATCHDAY_LEADERBOARD_SNAPSHOT'
  | 'FULL_AUDIT_PACK'

type ExportHistoryEntry = {
  id: string
  presetId: ExportPresetId
  presetLabel: string
  status: 'success' | 'failed'
  fileName: string
  rowCount: number
  durationMs: number
  createdAt: string
  selectedUserId?: string
  selectedMatchday?: string
}

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
  scopeSummary: string
  outputSummary: string
  useCaseSummary: string
  requires: 'user' | 'matchday' | 'both'
}

const EXPORT_PRESETS: ExportPreset[] = [
  {
    id: 'USER_PICKS_WORKBOOK',
    label: 'User picks workbook',
    description: 'One user across all matchdays with picks, outcomes, bracket, and results.',
    scopeSummary: 'Single player, all submitted matchdays',
    outputSummary: 'XLSX workbook (5 sheets)',
    useCaseSummary: 'Player audit + support handoff',
    requires: 'user'
  },
  {
    id: 'MATCHDAY_PICKS_WORKBOOK',
    label: 'Matchday picks workbook',
    description: 'One matchday across all users with submitted pick rows only.',
    scopeSummary: 'Single matchday, all players',
    outputSummary: 'XLSX workbook (2 sheets)',
    useCaseSummary: 'Submission review for lock windows',
    requires: 'matchday'
  },
  {
    id: 'MATCHDAY_LEADERBOARD_SNAPSHOT',
    label: 'Matchday leaderboard snapshot',
    description: 'Standalone leaderboard snapshot for a selected matchday.',
    scopeSummary: 'Leaderboard through one matchday',
    outputSummary: 'XLSX workbook (2 sheets)',
    useCaseSummary: 'Snapshot verification and sharing',
    requires: 'matchday'
  },
  {
    id: 'FULL_AUDIT_PACK',
    label: 'Full audit pack',
    description: 'Combined workbook for one user and one matchday in one download.',
    scopeSummary: 'Single player + single matchday bundle',
    outputSummary: 'XLSX workbook (9 sheets)',
    useCaseSummary: 'Comprehensive dispute review',
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
  intent: ExportIntent,
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
  if (intent === 'USER_RESULTS') {
    const metadataRows = [
      ['Export preset', 'User results workbook'],
      ['Last updated (offline)', bundle.offlineLastUpdated],
      ['Export intent', 'User Results Export'],
      ['Selected user', `${userName} (${userId})`],
      ['Export timestamp (UTC)', nowIso],
      ['Results rows', resultsRows.length],
      ['User picks count', picks.length],
      ['Matches snapshot last updated', formatDateTime(bundle.matchesFile.lastUpdated)],
      ['Leaderboard snapshot last updated', formatDateTime(bundle.leaderboardFile.lastUpdated)]
    ]

    return [
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
  intent: ExportIntent
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
      'Admin exports require Firebase configuration. Set VITE_FIREBASE_* env vars and sign in as an admin.'
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
      'Admin exports require Firebase configuration. Set VITE_FIREBASE_* env vars and sign in as an admin.'
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

const PRESET_FIELD_PREVIEW: Record<
  ExportPresetId,
  Array<{ sheet: string; rowSource: string; dateScope: string; columns: string[] }>
> = {
  USER_PICKS_WORKBOOK: [
    {
      sheet: 'Picks',
      rowSource: 'Selected user picks',
      dateScope: 'All matchdays',
      columns: ['Matchday', 'Match ID', 'Stage', 'Home Team', 'Away Team', 'Pick scores', 'Advances']
    },
    {
      sheet: 'GroupOutcomes',
      rowSource: 'Selected user group outcomes',
      dateScope: 'Tournament scope',
      columns: ['Group', 'Predicted First', 'Predicted Second', 'Best Third Team']
    },
    {
      sheet: 'Bracket',
      rowSource: 'Selected user knockout picks',
      dateScope: 'Knockout rounds',
      columns: ['Stage', 'Match ID', 'Predicted Winner', 'Predicted Team']
    },
    {
      sheet: 'Results',
      rowSource: 'Computed scoring snapshots',
      dateScope: 'Matchday cumulative',
      columns: ['Matchday', 'Finished Matches', 'Matchday Total Points', 'Cumulative Total Points']
    },
    {
      sheet: 'Metadata',
      rowSource: 'Export diagnostics',
      dateScope: 'Export timestamp',
      columns: ['Field', 'Value']
    }
  ],
  MATCHDAY_PICKS_WORKBOOK: [
    {
      sheet: 'Picks',
      rowSource: 'Submitted picks for selected matchday',
      dateScope: 'Selected matchday',
      columns: ['Matchday', 'Match ID', 'Kickoff UTC', 'User ID', 'User Name', 'Pick scores', 'Advances']
    },
    {
      sheet: 'Metadata',
      rowSource: 'Export diagnostics',
      dateScope: 'Export timestamp',
      columns: ['Field', 'Value']
    }
  ],
  MATCHDAY_LEADERBOARD_SNAPSHOT: [
    {
      sheet: 'Leaderboard',
      rowSource: 'Computed leaderboard snapshot',
      dateScope: 'Through selected matchday',
      columns: ['Rank', 'User ID', 'Total Points', 'Exact Points', 'Outcome Points']
    },
    {
      sheet: 'Metadata',
      rowSource: 'Export diagnostics',
      dateScope: 'Export timestamp',
      columns: ['Field', 'Value']
    }
  ],
  FULL_AUDIT_PACK: [
    {
      sheet: 'User workbook sheets',
      rowSource: 'Selected user workbook',
      dateScope: 'All matchdays',
      columns: ['Picks', 'GroupOutcomes', 'Bracket', 'Results', 'Metadata']
    },
    {
      sheet: 'Matchday sheets',
      rowSource: 'Selected matchday exports',
      dateScope: 'Selected matchday',
      columns: ['MatchdayPicks', 'MatchdayBoard', 'MatchdayMeta']
    }
  ]
}

export default function AdminExportsPage() {
  // QA-SMOKE: route=/admin?tab=exports and /demo/admin?tab=exports ; checklist-id=smoke-admin-exports
  const dataMode = useRouteDataMode()
  const phaseState = useTournamentPhaseState()
  const isDesktopViewport = useMediaQuery('(min-width: 768px)')
  const { showToast, updateToast } = useToast()
  const [state, setState] = useState<LoadState>({ status: 'loading' })
  const [selectedPresetId, setSelectedPresetId] = useState<ExportPresetId>('USER_PICKS_WORKBOOK')
  const [selectedUserId, setSelectedUserId] = useState('')
  const [selectedMatchday, setSelectedMatchday] = useState('')
  const [exportStatus, setExportStatus] = useState<'idle' | 'exporting'>('idle')
  const [exportProgress, setExportProgress] = useState(0)
  const [fieldPreviewOpen, setFieldPreviewOpen] = useState(false)
  const [exportHistory, setExportHistory] = useState<ExportHistoryEntry[]>([])
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

  const selectedPresetFieldPreview = PRESET_FIELD_PREVIEW[selectedPresetId]
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
      return selectedUser ? `No data: ${selectedUser.name} has not submitted any picks yet.` : 'No data for selected user.'
    }
    if (selectedPreset.requires === 'matchday' && selectedMatchdayPickCount === 0) {
      return selectedMatchday ? `No data: no picks were submitted for ${selectedMatchday}.` : 'No data for selected matchday.'
    }
    if (selectedPreset.requires === 'both') {
      if (selectedUserPickCount === 0 && selectedMatchdayPickCount === 0) {
        return `No data: ${selectedUser?.name ?? 'selected user'} has no picks and ${selectedMatchday || 'selected matchday'} has no submitted picks.`
      }
      if (selectedUserPickCount === 0) {
        return `No data: ${selectedUser?.name ?? 'selected user'} has not submitted any picks yet.`
      }
      if (selectedMatchdayPickCount === 0) {
        return `No data: no picks were submitted for ${selectedMatchday || 'selected matchday'}.`
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
  const selectedPresetSheets = useMemo(
    () => selectedPresetFieldPreview.map((sheet) => sheet.sheet),
    [selectedPresetFieldPreview]
  )
  const requiresUser = selectedPreset.requires === 'user' || selectedPreset.requires === 'both'
  const requiresMatchday = selectedPreset.requires === 'matchday' || selectedPreset.requires === 'both'

  async function copyExportConfig() {
    const payload: Record<string, string> = {
      presetId: selectedPresetId
    }
    if (requiresUser && selectedUser?.id) payload.userId = selectedUser.id
    if (requiresMatchday && selectedMatchday) payload.matchday = selectedMatchday

    const serialized = JSON.stringify(payload, null, 2)
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(serialized)
        showToast({ tone: 'success', title: 'Config copied', message: 'Export config copied to clipboard.' })
        return
      }
    } catch {
      showToast({
        tone: 'warning',
        title: 'Copy failed',
        message: 'Unable to write export config to clipboard.'
      })
      return
    }

    showToast({
      tone: 'warning',
      title: 'Clipboard unavailable',
      message: 'Clipboard access is unavailable in this browser context.'
    })
  }

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

  function buildExportWorkbook(
    presetId: ExportPresetId,
    options?: { intentOverride?: ExportIntent }
  ): {
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
      const intent = options?.intentOverride === 'USER_RESULTS' ? 'USER_RESULTS' : 'USER_PICKS'
      if (resolvedPicks.length === 0) {
        throw new NoDataError(`No picks found for ${selectedUser.name}.`)
      }
      const sheets = buildUserWorkbookSheets(
        state.bundle,
        resolvedUserId,
        selectedUser.name,
        intent,
        {
          picks: resolvedPicks,
          prediction: resolvedPrediction
        }
      )
      const filePrefix = intent === 'USER_RESULTS' ? 'user-results-workbook' : 'user-picks-workbook'
      const fileName = `${filePrefix}-${sanitizeToken(selectedUser.name || selectedUser.id)}-${dateSuffix}.xlsx`
      return {
        presetLabel: intent === 'USER_RESULTS' ? 'User results workbook' : 'User picks workbook',
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
      'USER_PICKS',
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

  async function runExport(
    presetId: ExportPresetId,
    options?: { intentOverride?: ExportIntent; overrideLabel?: string }
  ) {
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
    const fallbackPreset =
      options?.overrideLabel ??
      EXPORT_PRESETS.find((preset) => preset.id === presetId)?.label ??
      'Workbook'
    let progressToastId = ''

    try {
      setExportStatus('exporting')
      setExportProgress(12)
      progressToastId = showToast({
        title: 'Preparing export',
        message: `${fallbackPreset}...`,
        tone: 'info',
        progress: { value: 12, intent: 'momentum' },
        durationMs: 45_000
      })

      setExportProgress(38)
      updateToast(progressToastId, {
        message: 'Compiling workbook sheets...',
        progress: { value: 38, intent: 'momentum' }
      })
      const prepared = buildExportWorkbook(presetId, { intentOverride: options?.intentOverride })

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
      setExportHistory((current) => [
        {
          id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
          presetId,
          presetLabel: prepared.presetLabel,
          status: 'success' as const,
          fileName: prepared.fileName,
          rowCount,
          durationMs,
          createdAt: new Date().toISOString(),
          selectedUserId: prepared.selectedUserId,
          selectedMatchday: prepared.selectedMatchday
        },
        ...current
      ].slice(0, 12))
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
      setExportHistory((current) => [
        {
          id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
          presetId,
          presetLabel: fallbackPreset,
          status: 'failed' as const,
          fileName: 'n/a',
          rowCount: 0,
          durationMs: Math.max(1, Math.round(performance.now() - startMs)),
          createdAt: new Date().toISOString(),
          selectedUserId: selectedUser?.id,
          selectedMatchday: selectedMatchday || undefined
        },
        ...current
      ].slice(0, 12))
    } finally {
      setExportStatus('idle')
      window.setTimeout(() => setExportProgress(0), 1_500)
    }
  }

  if (state.status === 'loading') {
    return (
      <div className="space-y-4">
        <Skeleton className="h-24 rounded-2xl" />
        <Skeleton className="h-80 rounded-2xl" />
      </div>
    )
  }

  if (state.status === 'error') {
    return (
      <Alert tone="danger" title="Unable to load exports">
        {state.message}
      </Alert>
    )
  }

  return (
    <div className="space-y-4">
      <PageHeaderV2
        variant="section"
        kicker="Admin exports"
        title="Exports"
        subtitle="Pick a preset, configure its scope, and download a workbook that matches the published snapshot."
        metadata={
          <>
            <SnapshotStamp timestamp={state.bundle.offlineLastUpdated} prefix="Offline " />
            <span className="h-3 w-px bg-border" aria-hidden="true" />
            <span>{canExport ? 'Export window active.' : exportGateMessage}</span>
            <span className="h-3 w-px bg-border" aria-hidden="true" />
            <span>{`Window ${phaseState.tournamentPhase === 'FINAL' ? 'Final' : 'Live'}`}</span>
          </>
        }
      />

      <SectionCardV2 tone="panel" density="none" className="p-4 md:p-5">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.08fr)_minmax(0,0.92fr)]">
          <div className="space-y-3">
            <div>
              <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Preset picker</div>
              <h2 className="mt-1 text-[length:var(--v2-h3-size)] font-semibold tracking-[0.01em] text-foreground">Choose export intent</h2>
              <p className="mt-1 text-sm text-muted-foreground">Single-select radio cards. Choose one preset, then configure scope on the right.</p>
            </div>

            <div role="radiogroup" aria-label="Export presets" className="grid gap-3 sm:grid-cols-2">
              {EXPORT_PRESETS.map((preset) => {
                const isSelected = selectedPresetId === preset.id
                return (
                  <button
                    key={preset.id}
                    type="button"
                    role="radio"
                    aria-checked={isSelected}
                    onClick={() => setSelectedPresetId(preset.id)}
                    className={cn(
                      'group rounded-2xl border p-3 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                      isSelected
                        ? 'border-[color:color-mix(in_srgb,var(--v2-border-medium)_80%,transparent)] bg-background/66 shadow-[var(--shadow0)]'
                        : 'border-border/45 bg-bg2/18 hover:border-border/60 hover:bg-bg2/30'
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="space-y-0.5">
                        <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Preset</div>
                        <div className="text-sm font-semibold text-foreground">{preset.label}</div>
                      </div>
                      <span
                        className={cn(
                          'inline-flex h-6 min-w-6 items-center justify-center rounded-full border px-2 text-[10px] font-semibold uppercase tracking-[0.1em]',
                          isSelected
                            ? 'border-transparent bg-[rgba(var(--primary-rgb),0.24)] text-foreground shadow-[var(--shadow0)]'
                            : 'border-transparent bg-background/45 text-muted-foreground'
                        )}
                      >
                        {isSelected ? '✓' : ''}
                      </span>
                    </div>
                    <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{preset.description}</p>
                    <div className="mt-3 space-y-1 text-[11px] leading-tight text-muted-foreground">
                      <div>
                        <span className="font-semibold uppercase tracking-[0.12em] text-foreground/90">Scope</span>{' '}
                        {preset.scopeSummary}
                      </div>
                      <div>
                        <span className="font-semibold uppercase tracking-[0.12em] text-foreground/90">Output</span>{' '}
                        {preset.outputSummary}
                      </div>
                      <div>
                        <span className="font-semibold uppercase tracking-[0.12em] text-foreground/90">Use</span>{' '}
                        {preset.useCaseSummary}
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>

          <SectionCardV2 tone="subtle" density="none" className="border-border/45 p-4">
            <div className="space-y-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Configuration</div>
                  <div className="mt-1 text-base font-semibold text-foreground">{selectedPreset.label}</div>
                  <div className="mt-1 text-sm text-muted-foreground">{selectedPreset.description}</div>
                </div>
                <Badge
                  tone={exportStatus === 'exporting' ? 'warning' : 'secondary'}
                  case="normal"
                  className="border-transparent bg-background/55 shadow-none"
                >
                  {exportStatus === 'exporting' ? 'Preparing...' : 'Ready'}
                </Badge>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                {requiresUser ? (
                  <SelectField
                    label="User"
                    value={selectedUserId}
                    onChange={(event) => setSelectedUserId(event.target.value)}
                  >
                    {users.map((user) => (
                      <option key={user.id} value={user.id}>
                        {user.name} ({user.email ?? user.id}) - {user.picksCount} picks
                      </option>
                    ))}
                  </SelectField>
                ) : null}

                {requiresMatchday ? (
                  <SelectField
                    label="Matchday"
                    value={selectedMatchday}
                    onChange={(event) => setSelectedMatchday(event.target.value)}
                  >
                    {matchdays.map((matchday) => (
                      <option key={matchday} value={matchday}>
                        {matchday}
                      </option>
                    ))}
                  </SelectField>
                ) : null}
              </div>

              <div className="rounded-xl bg-bg2/28 p-3">
                <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">What's included</div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {selectedPresetSheets.map((sheet) => (
                    <span
                      key={`${selectedPreset.id}-${sheet}`}
                      className="inline-flex items-center rounded-full bg-background/52 px-2.5 py-1 text-[11px] text-muted-foreground"
                    >
                      {sheet}
                    </span>
                  ))}
                </div>
              </div>

              {noDataHint ? (
                <Alert tone="warning" title="No data">
                  {noDataHint}
                </Alert>
              ) : (
                <PanelState
                  className="text-xs"
                  message="Data found for this preset. Download will include only rows that match this selection."
                  tone="loading"
                />
              )}

              {!canExport ? (
                <Alert tone="warning" title="Exports unavailable">
                  {exportGateMessage}
                </Alert>
              ) : (
                <>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      size="sm"
                      loading={exportStatus === 'exporting'}
                      disabled={exportStatus === 'exporting'}
                      onClick={() => void runExport(selectedPresetId)}
                    >
                      {exportStatus === 'exporting' ? 'Preparing...' : 'Download XLSX'}
                    </Button>
                    <Button size="sm" variant="secondary" onClick={() => setFieldPreviewOpen(true)}>
                      Preview fields
                    </Button>
                    <Button
                      size="sm"
                      variant="quiet"
                      disabled={exportStatus === 'exporting'}
                      onClick={() => void copyExportConfig()}
                    >
                      Copy export config
                    </Button>
                  </div>
                  {exportStatus === 'exporting' || exportProgress > 0 ? (
                    <div className="space-y-1">
                      <div className="text-xs text-muted-foreground">
                        {exportStatus === 'exporting' ? 'Batch export in progress...' : 'Batch export complete'}
                      </div>
                      <Progress
                        value={exportProgress}
                        intent={exportStatus === 'exporting' ? 'momentum' : 'success'}
                        size="sm"
                        aria-label="Export batch progress"
                      />
                    </div>
                  ) : null}
                </>
              )}
            </div>
          </SectionCardV2>
        </div>
      </SectionCardV2>

      {canExport ? (
        <DetailsDisclosure title="Advanced exports" meta="Optional" className="border-border/45 bg-bg2/18">
          <div className="grid gap-3 sm:grid-cols-2">
            {requiresUser ? (
              <Button
                size="sm"
                variant="secondary"
                disabled={exportStatus === 'exporting'}
                onClick={() =>
                  void runExport('USER_PICKS_WORKBOOK', {
                    intentOverride: 'USER_RESULTS',
                    overrideLabel: 'User results workbook'
                  })
                }
              >
                Download user results workbook
              </Button>
            ) : null}

            {requiresMatchday && selectedPresetId !== 'MATCHDAY_LEADERBOARD_SNAPSHOT' ? (
              <Button
                size="sm"
                variant="secondary"
                disabled={exportStatus === 'exporting'}
                onClick={() => void runExport('MATCHDAY_LEADERBOARD_SNAPSHOT')}
              >
                Download matchday leaderboard snapshot
              </Button>
            ) : null}

            {requiresMatchday && selectedPresetId === 'MATCHDAY_LEADERBOARD_SNAPSHOT' ? (
              <Button
                size="sm"
                variant="secondary"
                disabled={exportStatus === 'exporting'}
                onClick={() => void runExport('MATCHDAY_PICKS_WORKBOOK')}
              >
                Download matchday picks workbook
              </Button>
            ) : null}
          </div>
        </DetailsDisclosure>
      ) : null}

      <SectionCardV2 tone="panel" density="none" className="p-4 sm:p-5">
        <div className="mb-3 flex items-center justify-between gap-2">
          <div>
            <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Export history</div>
            <div className="text-sm text-muted-foreground">Current browser session only.</div>
          </div>
          {exportHistory.length > 0 ? (
            <Badge tone="secondary" className="border-transparent bg-background/55 shadow-none">
              {exportHistory.length} runs
            </Badge>
          ) : null}
        </div>

        {exportHistory.length === 0 ? (
          <PanelState message="No exports yet in this session." tone="empty" />
        ) : (
          <Table
            unframed
            className="[&_th]:border-b-[color:color-mix(in_srgb,var(--border)_45%,transparent)] [&_td]:border-b-[color:color-mix(in_srgb,var(--border)_30%,transparent)]"
          >
            <thead>
              <tr>
                <th>Time</th>
                <th>Preset</th>
                <th>Status</th>
                <th>Rows</th>
                <th>Duration</th>
                <th>File</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {exportHistory.map((entry) => (
                <tr key={entry.id}>
                  <td>{new Date(entry.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</td>
                  <td className="font-semibold text-foreground">{entry.presetLabel}</td>
                  <td>
                    <Badge tone={entry.status === 'success' ? 'success' : 'danger'}>
                      {entry.status === 'success' ? 'Success' : 'Failed'}
                    </Badge>
                  </td>
                  <td>{entry.rowCount}</td>
                  <td>{(entry.durationMs / 1000).toFixed(1)}s</td>
                  <td className="max-w-[260px] truncate">{entry.fileName}</td>
                  <td>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => {
                        setSelectedPresetId(entry.presetId)
                        if (entry.selectedUserId) setSelectedUserId(entry.selectedUserId)
                        if (entry.selectedMatchday) setSelectedMatchday(entry.selectedMatchday)
                      }}
                    >
                      Reuse preset
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </SectionCardV2>

      <Sheet open={fieldPreviewOpen} onOpenChange={setFieldPreviewOpen}>
        <SheetContent side="right" className="w-[96vw] max-w-3xl">
          <SheetHeader>
            <SheetTitle>Field Preview</SheetTitle>
            <SheetDescription>{selectedPreset.label}</SheetDescription>
          </SheetHeader>
          <div className="space-y-3 px-4 py-3">
            {selectedPresetFieldPreview.length === 0 ? (
              <PanelState message="No field preview is available for this preset." tone="empty" />
            ) : (
              <Table>
                <thead>
                  <tr>
                    <th>Sheet</th>
                    <th>Columns included</th>
                    <th>Row source</th>
                    <th>Date scope</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedPresetFieldPreview.map((sheet) => (
                    <tr key={`${selectedPreset.id}-${sheet.sheet}`}>
                      <td className="font-semibold text-foreground">{sheet.sheet}</td>
                      <td>{sheet.columns.join(', ')}</td>
                      <td>{sheet.rowSource}</td>
                      <td>{sheet.dateScope}</td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </div>
          <SheetFooter>
            <div className="flex w-full justify-end">
              <Button
                size="sm"
                variant="secondary"
                onClick={() => setFieldPreviewOpen(false)}
              >
                Close
              </Button>
            </div>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  )
}
