import type { Match, Team } from '../types/matches'

export type CsvValue = string | number | boolean | null | undefined

export type GroupStanding = {
  team: Team
  points: number
  goalsFor: number
  goalsAgainst: number
  goalDiff: number
}

export type GroupSummary = {
  complete: boolean
  standings: GroupStanding[]
}

export function escapeCsvValue(value: CsvValue): string {
  if (value === null || value === undefined) return ''
  const text = String(value)
  if (/[",\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`
  }
  return text
}

export function toCsv(headers: string[], rows: Array<Record<string, CsvValue>>): string {
  const headerLine = headers.join(',')
  const lines = rows.map((row) =>
    headers.map((header) => escapeCsvValue(row[header])).join(',')
  )
  return [headerLine, ...lines].join('\n')
}

export function downloadCsv(
  filename: string,
  headers: string[],
  rows: Array<Record<string, CsvValue>>
): void {
  if (typeof window === 'undefined') return
  const blob = new Blob([toCsv(headers, rows)], { type: 'text/csv;charset=utf-8;' })
  const url = window.URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  window.URL.revokeObjectURL(url)
}

export function formatExportFilename(prefix: string, matchScope: string): string {
  const date = new Date().toISOString().slice(0, 10)
  return `${prefix}-all-${matchScope}-${date}.csv`
}

function normalizeTeamCodes(codes: string[] | undefined): string[] {
  if (!codes) return []
  const normalized = codes
    .map((code) => String(code ?? '').trim().toUpperCase())
    .filter((code) => code.length > 0)
  return [...new Set(normalized)]
}

export function buildGroupStandingsSnapshot(matches: Match[]): Map<string, GroupSummary> {
  const groups = new Map<string, { complete: boolean; teams: Map<string, GroupStanding> }>()

  for (const match of matches) {
    if (match.stage !== 'Group' || !match.group) continue
    const group = groups.get(match.group) ?? {
      complete: true,
      teams: new Map<string, GroupStanding>()
    }

    const ensureTeam = (team: Team) => {
      const existing = group.teams.get(team.code)
      if (existing) return existing
      const created = {
        team,
        points: 0,
        goalsFor: 0,
        goalsAgainst: 0,
        goalDiff: 0
      }
      group.teams.set(team.code, created)
      return created
    }

    ensureTeam(match.homeTeam)
    ensureTeam(match.awayTeam)

    if (match.status !== 'FINISHED' || !match.score) {
      group.complete = false
      groups.set(match.group, group)
      continue
    }

    const home = ensureTeam(match.homeTeam)
    const away = ensureTeam(match.awayTeam)
    home.goalsFor += match.score.home
    home.goalsAgainst += match.score.away
    away.goalsFor += match.score.away
    away.goalsAgainst += match.score.home
    home.goalDiff = home.goalsFor - home.goalsAgainst
    away.goalDiff = away.goalsFor - away.goalsAgainst

    if (match.score.home > match.score.away) {
      home.points += 3
    } else if (match.score.home < match.score.away) {
      away.points += 3
    } else {
      home.points += 1
      away.points += 1
    }

    groups.set(match.group, group)
  }

  const summaries = new Map<string, GroupSummary>()
  for (const [groupId, group] of groups.entries()) {
    const standings = [...group.teams.values()].sort((a, b) => {
      if (b.points !== a.points) return b.points - a.points
      if (b.goalDiff !== a.goalDiff) return b.goalDiff - a.goalDiff
      if (b.goalsFor !== a.goalsFor) return b.goalsFor - a.goalsFor
      return a.team.code.localeCompare(b.team.code)
    })
    summaries.set(groupId, { complete: group.complete, standings })
  }

  return summaries
}

export function resolveBestThirdQualifiers(
  groupStandings: Map<string, GroupSummary>,
  overrides?: string[]
): string[] | undefined {
  const overrideCodes = normalizeTeamCodes(overrides)
  if (overrideCodes.length > 0) return overrideCodes

  const thirdPlaceTeams: Array<GroupStanding & { groupId: string }> = []
  for (const [groupId, summary] of groupStandings.entries()) {
    if (!summary.complete) return undefined
    const third = summary.standings[2]
    if (!third) return undefined
    thirdPlaceTeams.push({ ...third, groupId })
  }

  thirdPlaceTeams.sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points
    if (b.goalDiff !== a.goalDiff) return b.goalDiff - a.goalDiff
    if (b.goalsFor !== a.goalsFor) return b.goalsFor - a.goalsFor
    return a.team.code.localeCompare(b.team.code)
  })

  return thirdPlaceTeams.slice(0, 8).map((entry) => entry.team.code)
}
