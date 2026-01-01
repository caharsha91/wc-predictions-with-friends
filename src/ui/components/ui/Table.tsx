import type { TableHTMLAttributes } from 'react'

type TableProps = TableHTMLAttributes<HTMLTableElement>

export default function Table({ className, ...props }: TableProps) {
  return <table {...props} className={['table', className].filter(Boolean).join(' ')} />
}
