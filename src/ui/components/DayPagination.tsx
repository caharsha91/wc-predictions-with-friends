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
  const currentKey = activeDateKey ?? dateKeys[0]
  return (
    <div className="dayPagination" aria-label={ariaLabel}>
      <div className="dayPaginationSelect">
        <select
          className="dayPaginationDropdown"
          value={currentKey}
          onChange={(event) => onSelect(event.target.value)}
          aria-label={ariaLabel}
        >
          {dateKeys.map((dateKey) => (
            <option key={dateKey} value={dateKey}>
              {formatDayLabel(dateKey)}
            </option>
          ))}
        </select>
      </div>
      <div className="dayPaginationChips" role="tablist" aria-label={ariaLabel}>
        {dateKeys.map((dateKey) => {
          const isActive = dateKey === currentKey
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
    </div>
  )
}
