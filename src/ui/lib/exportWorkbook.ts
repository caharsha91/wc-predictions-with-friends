import writeXlsxFile, { type Cell, type Columns, type SheetData } from 'write-excel-file'

export type ExportWorkbookValue = string | number | boolean | Date | null | undefined

type ExportWorkbookBaseSheet = {
  name: string
  widths?: number[]
}

export type ExportWorkbookTableSheet = ExportWorkbookBaseSheet & {
  headers: string[]
  rows: ExportWorkbookValue[][]
}

export type ExportWorkbookRowsSheet = ExportWorkbookBaseSheet & {
  rows: ExportWorkbookValue[][]
  headerRowIndices?: number[]
}

export type ExportWorkbookSheet = ExportWorkbookTableSheet | ExportWorkbookRowsSheet

function toCell(value: ExportWorkbookValue, bold = false): Cell {
  if (value === null || value === undefined || value === '') {
    return bold ? { value: '', fontWeight: 'bold' } : null
  }
  if (value instanceof Date) {
    return bold ? { value, fontWeight: 'bold' } : { value }
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return bold ? { value, fontWeight: 'bold' } : { value }
  }
  return bold ? { value: String(value), fontWeight: 'bold' } : { value: String(value) }
}

function isTableSheet(sheet: ExportWorkbookSheet): sheet is ExportWorkbookTableSheet {
  return 'headers' in sheet
}

function toSheetData(sheet: ExportWorkbookSheet): SheetData {
  if (isTableSheet(sheet)) {
    const headerRow = sheet.headers.map((header) => toCell(header, true))
    const dataRows = sheet.rows.map((row) => row.map((cell) => toCell(cell)))
    return [headerRow, ...dataRows]
  }

  const headerRowIndices = new Set(sheet.headerRowIndices ?? [])
  return sheet.rows.map((row, rowIndex) => row.map((cell) => toCell(cell, headerRowIndices.has(rowIndex))))
}

function toColumns(sheet: ExportWorkbookSheet): Columns {
  const columnCount = isTableSheet(sheet)
    ? sheet.headers.length
    : Math.max(1, ...sheet.rows.map((row) => row.length))
  const widths = sheet.widths ?? Array.from({ length: columnCount }, () => 20)
  return widths.map((width) => ({ width }))
}

export async function downloadWorkbook(fileName: string, sheets: ExportWorkbookSheet[]): Promise<void> {
  if (sheets.length === 0) return
  await writeXlsxFile(
    sheets.map((sheet) => toSheetData(sheet)),
    {
      fileName,
      sheets: sheets.map((sheet) => sheet.name),
      columns: sheets.map((sheet) => toColumns(sheet))
    }
  )
}
