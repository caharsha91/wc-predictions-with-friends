import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'

import { combineBracketPredictions } from '../src/lib/bracket'
import { flattenPicksFile } from '../src/lib/picks'
import { buildLeaderboard } from '../src/lib/scoring'
import type { BracketPredictionsFile } from '../src/types/bracket'
import type { LeaderboardFile } from '../src/types/leaderboard'
import type { MatchesFile } from '../src/types/matches'
import type { MembersFile } from '../src/types/members'
import type { PicksFile } from '../src/types/picks'
import type { BestThirdQualifiersFile } from '../src/types/qualifiers'
import type { ScoringConfig } from '../src/types/scoring'

const DATA_DIR = path.join(process.cwd(), 'public', 'data')

async function readJson<T>(filename: string): Promise<T> {
  const raw = await fs.readFile(path.join(DATA_DIR, filename), 'utf8')
  return JSON.parse(raw) as T
}

async function main() {
  const matchesFile = await readJson<MatchesFile>('matches.json')
  const membersFile = await readJson<MembersFile>('members.json')
  const picksFile = await readJson<PicksFile>('picks.json')
  const scoringFile = await readJson<ScoringConfig>('scoring.json')
  const bracketFile = await readJson<BracketPredictionsFile>('bracket-predictions.json')
  const bestThirdFile = await readJson<BestThirdQualifiersFile>('best-third-qualifiers.json')

  const picks = flattenPicksFile(picksFile)
  const bracketPredictions = combineBracketPredictions(bracketFile)

  const entries = buildLeaderboard(
    membersFile.members,
    matchesFile.matches,
    picks,
    bracketPredictions,
    scoringFile,
    bestThirdFile.qualifiers
  )

  const output: LeaderboardFile = {
    lastUpdated: matchesFile.lastUpdated ?? new Date().toISOString(),
    entries
  }

  await fs.writeFile(
    path.join(DATA_DIR, 'leaderboard.json'),
    `${JSON.stringify(output, null, 2)}\n`
  )
  console.log(`Updated leaderboard.json (${entries.length} entries).`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
