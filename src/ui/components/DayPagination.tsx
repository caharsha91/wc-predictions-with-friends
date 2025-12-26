import { PACIFIC_TIME_ZONE } from '../../lib/matches'

type DayPaginationProps = {
  dateKeys: string[]
  activeDateKey: string | null
  onSelect: (dateKey: string) => void
  ariaLabel: string
}

function formatDayLabel(dateKey: string) {
  const [year, month, day] = dateKey.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day, 12, 0, 0))
  return new Intl.DateTimeFormat('en-US', {
    timeZone: PACIFIC_TIME_ZONE,
    month: 'short',
    day: 'numeric'
  }).format(date)
}

export default function DayPagination({
  dateKeys,
  activeDateKey,
  onSelect,
  ariaLabel
}: DayPaginationProps) {
  if (dateKeys.length <= 1) return null
  return (
    <div className="dayPagination" role="tablist" aria-label={ariaLabel}>
      {dateKeys.map((dateKey) => {
        const isActive = dateKey === activeDateKey
        return (
          <button
            key={dateKey}
            type="button"
            role="tab"
            aria-selected={isActive}
            className={isActive ? 'dayPaginationButton active' : 'dayPaginationButton'}
            onClick={() => onSelect(dateKey)}
          >
            {formatDayLabel(dateKey)}
          </button>
        )
      })}
    </div>
  )
}
