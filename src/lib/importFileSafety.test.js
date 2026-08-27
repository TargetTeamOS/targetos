import { describe, expect, it } from 'vitest'
import { MAX_CSV_IMPORT_BYTES, validateCsvImportFile } from './importFileSafety'

describe('CSV import safety', () => {
  it('accepts ordinary CSV files', () => {
    expect(validateCsvImportFile({ name: 'contacts.CSV', type: 'text/csv', size: 128 })).toEqual({ ok: true, message: '' })
  })

  it('rejects Excel workbooks instead of parsing them in the browser', () => {
    expect(validateCsvImportFile({ name: 'contacts.xlsx', type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', size: 128 }).ok).toBe(false)
  })

  it('rejects files with a CSV name but an unsafe content type', () => {
    expect(validateCsvImportFile({ name: 'contacts.csv', type: 'application/vnd.ms-excel', size: 128 }).ok).toBe(false)
  })

  it('rejects oversized CSV files', () => {
    expect(validateCsvImportFile({ name: 'contacts.csv', type: 'text/csv', size: MAX_CSV_IMPORT_BYTES + 1 }).ok).toBe(false)
  })
})
