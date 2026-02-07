import { useEffect, useMemo, useState } from 'react'
import { collection, doc, getDocs, setDoc } from 'firebase/firestore'
import writeXlsxFile, { type Cell, type Columns, type SheetData } from 'write-excel-file'

import { combineBracketPredictions } from '../../lib/bracket'
import {
  fetchBestThirdQualifiers,
  fetchLeaderboard,
  fetchMatches,
  fetchScoring
} from '../../lib/data'
import { firebaseDb, getLeagueId, hasFirebase } from '../../lib/firebase'
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
import { Card } from '../components/ui/Card'
import { SelectField } from '../components/ui/Field'
import PageHeroPanel from '../components/ui/PageHeroPanel'
import Skeleton from '../components/ui/Skeleton'

type ExportMode = 'USER_ALL_MATCHDAYS' | 'MATCHDAY_ALL_USERS'
type ExportIntent =
  | 'USER_PICKS'
  | 'USER_RESULTS'
  | 'MATCHDAY_PICKS'
  | 'MATCHDAY_LEADERBOARD'

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
  uidBackfill: {
    updated: number
    unresolved: number
  }
}

type ExportMember = Member & {
  docId?: string
  uid?: string
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

const STAGE_ORDER: MatchStage[] = ['Group', 'R32', 'R16', 'QF', 'SF', 'Third', 'Final']

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

function toCell(value: string | number | boolean | Date | null | undefined): Cell {
  if (value === null || value === undefined || value === '') return null
  if (value instanceof Date) return { value }
  if (typeof value === 'number') return { value }
  if (typeof value === 'boolean') return { value }
  return { value: String(value) }
}

function toSheetData(headers: string[], rows: SheetSpec['rows']): SheetData {
  const headerRow = headers.map((header) => ({ value: header, fontWeight: 'bold' as const }))
  const dataRows = rows.map((row) => row.map((cell) => toCell(cell)))
  return [headerRow, ...dataRows]
}

async function downloadWorkbook(fileName: string, sheets: SheetSpec[]) {
  const sheetNames = sheets.map((sheet) => sheet.name)
  const data = sheets.map((sheet) => toSheetData(sheet.headers, sheet.rows))
  const columns: Columns[] = sheets.map((sheet) => {
    const widths = sheet.widths ?? sheet.headers.map(() => 20)
    return widths.map((width) => ({ width }))
  })

  await writeXlsxFile(data, {
    fileName,
    sheets: sheetNames,
    columns
  })
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

  // Prefer users with actual picks so Mode 1 default never lands on an empty user.
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

function buildModeOneSheets(
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
      (match) => match.status === 'FINISHED' && getDateKeyInTimeZone(match.kickoffUtc) <= matchday
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
      (match) => match.status === 'FINISHED' && getDateKeyInTimeZone(match.kickoffUtc) === matchday
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
    ['Export mode', 'Single user -> all matchdays'],
    ['Last updated (offline)', bundle.offlineLastUpdated],
    ['Export intent', intent === 'USER_PICKS' ? 'User Picks Export' : 'User Results Export'],
    ['Selected user', `${userName} (${userId})`],
    ['Export timestamp (UTC)', nowIso],
    ['Rows exported (Picks)', picksRows.length],
    ['Matches snapshot last updated', formatDateTime(bundle.matchesFile.lastUpdated)],
    ['Leaderboard snapshot last updated', formatDateTime(bundle.leaderboardFile.lastUpdated)],
    ['User picks count', picks.length],
    ['Group outcomes rows', groupRows.length + bestThirdRows.length],
    ['Bracket picks rows', bracketRows.length]
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

function buildModeTwoSheets(
  bundle: SnapshotBundle,
  users: UserOption[],
  selectedMatchday: string,
  intent: ExportIntent
): SheetSpec[] {
  const matches = bundle.matchesFile.matches
    .filter((match) => getDateKeyInTimeZone(match.kickoffUtc) === selectedMatchday)
    .sort((a, b) => new Date(a.kickoffUtc).getTime() - new Date(b.kickoffUtc).getTime())

  const picksByUser = new Map<string, Map<string, Pick>>()
  for (const doc of bundle.picksFile.picks) {
    const key = normalizeKey(doc.userId)
    const byMatch = new Map<string, Pick>()
    for (const pick of doc.picks ?? []) {
      byMatch.set(pick.matchId, pick)
    }
    picksByUser.set(key, byMatch)
  }

  const predictionsByUser = new Map<string, BracketPrediction>()
  for (const prediction of combineBracketPredictions(bundle.bracketFile)) {
    predictionsByUser.set(normalizeKey(prediction.userId), prediction)
  }

  const allUserMap = new Map<string, UserOption>()
  for (const user of users) {
    allUserMap.set(normalizeKey(user.id), user)
  }
  for (const doc of bundle.picksFile.picks) {
    const key = normalizeKey(doc.userId)
    if (allUserMap.has(key)) continue
    allUserMap.set(key, {
      id: doc.userId,
      name: doc.userId,
      candidateIds: [doc.userId],
      picksCount: doc.picks?.length ?? 0
    })
  }

  const sortedUsers = [...allUserMap.values()].sort((a, b) => a.name.localeCompare(b.name))

  const picksRows = sortedUsers.flatMap((user) => {
    const userPicks = picksByUser.get(normalizeKey(user.id))
    const prediction = predictionsByUser.get(normalizeKey(user.id))

    return matches.map((match) => {
      const pick = userPicks?.get(match.id)
      const outcome = pick ? getPickOutcome(pick) : ''
      const predictedWinner = pick ? getPredictedWinner(pick) : undefined

      const bracketWinner =
        match.stage === 'Group'
          ? ''
          : prediction?.knockout?.[match.stage as Exclude<MatchStage, 'Group'>]?.[match.id] ?? ''

      const bracketTeam =
        bracketWinner === 'HOME'
          ? match.homeTeam.code
          : bracketWinner === 'AWAY'
            ? match.awayTeam.code
            : ''

      return [
        selectedMatchday,
        user.id,
        user.name,
        match.id,
        match.stage,
        match.kickoffUtc,
        match.homeTeam.code,
        match.awayTeam.code,
        typeof pick?.homeScore === 'number' ? pick.homeScore : '',
        typeof pick?.awayScore === 'number' ? pick.awayScore : '',
        outcome,
        pick?.advances ?? predictedWinner ?? '',
        bracketWinner,
        bracketTeam,
        pick?.updatedAt ?? ''
      ]
    })
  })

  const memberPool = buildMemberPool(bundle)
  const finishedThroughMatchday = bundle.matchesFile.matches.filter(
    (match) => match.status === 'FINISHED' && getDateKeyInTimeZone(match.kickoffUtc) <= selectedMatchday
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
    ['Export mode', 'Single matchday -> all users'],
    ['Last updated (offline)', bundle.offlineLastUpdated],
    ['Export intent', intent === 'MATCHDAY_PICKS' ? 'Matchday Picks Export' : 'Matchday Leaderboard Snapshot Export'],
    ['Selected matchday', selectedMatchday],
    ['Export timestamp (UTC)', nowIso],
    ['Matches snapshot last updated', formatDateTime(bundle.matchesFile.lastUpdated)],
    ['Leaderboard snapshot last updated', formatDateTime(bundle.leaderboardFile.lastUpdated)],
    ['Users included', sortedUsers.length],
    ['Matches included', matches.length],
    ['Leaderboard rows', leaderboardRows.length]
  ]

  return [
    {
      name: 'Picks',
      headers: [
        'Matchday',
        'User ID',
        'User Name',
        'Match ID',
        'Stage',
        'Kickoff UTC',
        'Home Team',
        'Away Team',
        'Pick Home Score',
        'Pick Away Score',
        'Pick Outcome',
        'Advances',
        'Bracket Winner',
        'Bracket Team',
        'Pick Updated At UTC'
      ],
      rows: picksRows,
      widths: [14, 20, 20, 18, 12, 24, 14, 14, 14, 14, 14, 12, 16, 14, 24]
    },
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

async function loadExportPicksAndBracketData(): Promise<{
  picksFile: PicksFile
  bracketFile: BracketPredictionsFile
}> {
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

async function loadMembers(): Promise<ExportMember[]> {
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
        typeof data.uid === 'string' && data.uid.trim()
          ? data.uid
          : typeof data.id === 'string' && data.id.trim()
            ? data.id
            : email
        return {
          id,
          docId: docSnap.id,
          name: data.name ?? email,
          email,
          uid: typeof data.uid === 'string' && data.uid.trim() ? data.uid : undefined,
          isAdmin: data.isAdmin === true,
          isMember: true
      } satisfies ExportMember
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown Firestore error.'
    throw new Error(`Failed to read members from Firestore. ${message}`)
  }
}

function inferUidCandidate(
  member: ExportMember,
  picksFile: PicksFile,
  bracketFile: BracketPredictionsFile
): string | null {
  if (member.uid?.trim()) return null

  const signalIds = dedupeIds([
    member.id,
    member.docId,
    member.email
  ])

  // Deterministic: any non-email identity already attached to member metadata.
  for (const signal of signalIds) {
    if (!looksLikeEmail(signal)) {
      return signal
    }
  }

  // Deterministic: legacy picks doc keyed by email with picks whose userId is a uid.
  const emailSignals = signalIds.filter((value) => looksLikeEmail(value))
  const pickDocsByEmail = picksFile.picks.filter((docEntry) =>
    emailSignals.some((email) => sameUser(docEntry.userId, email))
  )
  const embeddedUserIds = dedupeIds(
    pickDocsByEmail.flatMap((docEntry) => (docEntry.picks ?? []).map((pick) => pick.userId))
  ).filter((value) => !looksLikeEmail(value))
  if (embeddedUserIds.length === 1) return embeddedUserIds[0]

  return null
}

async function autoBackfillMemberUids(
  members: ExportMember[],
  picksFile: PicksFile,
  bracketFile: BracketPredictionsFile
): Promise<{ members: ExportMember[]; updated: number; unresolved: number }> {
  if (!hasFirebase || !firebaseDb) return { members, updated: 0, unresolved: 0 }

  const leagueId = getLeagueId()
  const patchedMembers: ExportMember[] = []
  const writes: Array<Promise<void>> = []
  let updated = 0
  let unresolved = 0

  for (const member of members) {
    const candidateUid = inferUidCandidate(member, picksFile, bracketFile)
    if (!candidateUid) {
      if (!member.uid?.trim()) unresolved += 1
      patchedMembers.push(member)
      continue
    }

    const docId = member.docId ?? member.email ?? member.id
    const normalizedDocId = (docId ?? '').toLowerCase()
    if (!normalizedDocId) {
      unresolved += 1
      patchedMembers.push(member)
      continue
    }

    if (member.uid?.trim() === candidateUid) {
      patchedMembers.push(member)
      continue
    }

    updated += 1
    patchedMembers.push({ ...member, uid: candidateUid, id: candidateUid })
    writes.push(
      setDoc(
        doc(firebaseDb, 'leagues', leagueId, 'members', normalizedDocId),
        {
          uid: candidateUid,
          updatedAt: new Date().toISOString()
        },
        { merge: true }
      )
    )
  }

  if (writes.length > 0) {
    await Promise.all(writes)
  }

  return { members: patchedMembers, updated, unresolved }
}

async function loadBundle(): Promise<SnapshotBundle> {
  const [matchesFile, scoring, picksAndBracket, leaderboardFile, bestThirdFile, members] =
    await Promise.all([
      fetchMatches(),
      fetchScoring(),
      loadExportPicksAndBracketData(),
      fetchLeaderboard(),
      fetchBestThirdQualifiers(),
      loadMembers()
    ])
  const { picksFile, bracketFile } = picksAndBracket
  const uidBackfill = await autoBackfillMemberUids(members, picksFile, bracketFile)

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
    members: uidBackfill.members,
    bestThirdQualifiers: bestThirdFile.qualifiers,
    offlineLastUpdated,
    uidBackfill: {
      updated: uidBackfill.updated,
      unresolved: uidBackfill.unresolved
    }
  }
}

export default function AdminExportsPage() {
  const [state, setState] = useState<LoadState>({ status: 'loading' })
  const [mode, setMode] = useState<ExportMode>('USER_ALL_MATCHDAYS')
  const [selectedUserId, setSelectedUserId] = useState('')
  const [selectedMatchday, setSelectedMatchday] = useState('')
  const [exportStatus, setExportStatus] = useState<'idle' | 'exporting' | 'done' | 'error'>('idle')
  const [exportMessage, setExportMessage] = useState<string | null>(null)

  useEffect(() => {
    let canceled = false
    async function run() {
      setState({ status: 'loading' })
      try {
        const bundle = await loadBundle()
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
  }, [])

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

  async function handleExport(intent: ExportIntent) {
    if (state.status !== 'ready') return

    try {
      setExportStatus('exporting')
      setExportMessage(null)

      if (mode === 'USER_ALL_MATCHDAYS') {
        if (!selectedUser) {
          setExportStatus('error')
          setExportMessage('Select a user before exporting.')
          return
        }

        const candidateIds = dedupeIds([
          selectedUser.id,
          selectedUser.email,
          ...selectedUser.candidateIds
        ])
        const predictions = combineBracketPredictions(state.bundle.bracketFile)

        let resolvedPicks: Pick[] = []
        let resolvedPrediction: BracketPrediction | null = null
        let resolvedUserId = selectedUser.id

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

        const sheets = buildModeOneSheets(
          state.bundle,
          resolvedUserId,
          selectedUser.name,
          intent,
          {
            picks: resolvedPicks,
            prediction: resolvedPrediction
          }
        )
        const prefix = intent === 'USER_PICKS' ? 'user-picks-export' : 'user-results-export'
        const fileName = `${prefix}-${sanitizeToken(selectedUser.name || selectedUser.id)}-${new Date().toISOString().slice(0, 10)}.xlsx`
        await downloadWorkbook(fileName, sheets)
        setExportStatus('done')
        if (resolvedPicks.length === 0) {
          setExportMessage(
            `Downloaded ${fileName} (no picks found from Firestore for selected user).`
          )
        } else {
          setExportMessage(`Downloaded ${fileName}`)
        }
        return
      }

      if (!selectedMatchday) {
        setExportStatus('error')
        setExportMessage('Select a matchday before exporting.')
        return
      }

      const sheets = buildModeTwoSheets(state.bundle, users, selectedMatchday, intent)
      const prefix = intent === 'MATCHDAY_PICKS' ? 'matchday-picks-export' : 'matchday-leaderboard-export'
      const fileName = `${prefix}-${sanitizeToken(selectedMatchday)}-${new Date().toISOString().slice(0, 10)}.xlsx`
      await downloadWorkbook(fileName, sheets)
      setExportStatus('done')
      setExportMessage(`Downloaded ${fileName}`)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Export failed.'
      setExportStatus('error')
      setExportMessage(message)
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
    <div className="space-y-6">
      <PageHeroPanel
        kicker="Admin"
        title="Exports"
        subtitle="Excel-only exports from Firestore queries with Spark-safe reads."
        meta={
          <div className="text-right text-xs text-muted-foreground" data-last-updated="true">
            <div className="uppercase tracking-[0.2em]">Last updated (offline)</div>
            <div className="text-sm font-semibold text-foreground">
              {formatDateTime(state.bundle.offlineLastUpdated)}
            </div>
          </div>
        }
      >
        <div className="grid gap-4 md:grid-cols-2">
          <Card className="rounded-2xl border-border/60 p-4">
            <div className="flex items-center justify-between gap-2">
              <div>
                <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Mode</div>
                <div className="text-lg font-semibold text-foreground">Single user to all matchdays</div>
              </div>
              {mode === 'USER_ALL_MATCHDAYS' ? <Badge tone="info">Selected</Badge> : null}
            </div>
            <div className="mt-3 text-sm text-muted-foreground">
              Includes Picks, GroupOutcomes, Bracket, Results, and Metadata sheets.
            </div>
            <Button
              className="mt-4"
              variant={mode === 'USER_ALL_MATCHDAYS' ? 'primary' : 'secondary'}
              onClick={() => setMode('USER_ALL_MATCHDAYS')}
            >
              Use Mode 1
            </Button>
          </Card>

          <Card className="rounded-2xl border-border/60 p-4">
            <div className="flex items-center justify-between gap-2">
              <div>
                <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Mode</div>
                <div className="text-lg font-semibold text-foreground">Single matchday to all users</div>
              </div>
              {mode === 'MATCHDAY_ALL_USERS' ? <Badge tone="info">Selected</Badge> : null}
            </div>
            <div className="mt-3 text-sm text-muted-foreground">
              Includes Picks, Leaderboard, and Metadata sheets.
            </div>
            <Button
              className="mt-4"
              variant={mode === 'MATCHDAY_ALL_USERS' ? 'primary' : 'secondary'}
              onClick={() => setMode('MATCHDAY_ALL_USERS')}
            >
              Use Mode 2
            </Button>
          </Card>
        </div>
      </PageHeroPanel>

      {state.bundle.uidBackfill.updated > 0 ? (
        <Alert tone="success" title="UID mapping auto-fixed">
          Updated {state.bundle.uidBackfill.updated} member record(s) with inferred Firebase UID mappings.
        </Alert>
      ) : null}

      {mode === 'USER_ALL_MATCHDAYS' ? (
        <Card className="rounded-2xl border-border/60 p-4 sm:p-5">
          <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
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

            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                loading={exportStatus === 'exporting'}
                onClick={() => void handleExport('USER_PICKS')}
              >
                Download User Picks Export
              </Button>
              <Button
                size="sm"
                variant="secondary"
                loading={exportStatus === 'exporting'}
                onClick={() => void handleExport('USER_RESULTS')}
              >
                Download User Results Export
              </Button>
            </div>
          </div>
        </Card>
      ) : (
        <Card className="rounded-2xl border-border/60 p-4 sm:p-5">
          <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
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

            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                loading={exportStatus === 'exporting'}
                onClick={() => void handleExport('MATCHDAY_PICKS')}
              >
                Download Matchday Picks Export
              </Button>
              <Button
                size="sm"
                variant="secondary"
                loading={exportStatus === 'exporting'}
                onClick={() => void handleExport('MATCHDAY_LEADERBOARD')}
              >
                Download Matchday Leaderboard Snapshot
              </Button>
            </div>
          </div>
        </Card>
      )}

      {exportMessage ? (
        <Alert tone={exportStatus === 'error' ? 'danger' : 'success'} title="Export status">
          {exportMessage}
        </Alert>
      ) : null}
    </div>
  )
}
