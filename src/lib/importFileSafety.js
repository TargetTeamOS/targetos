const MAX_CSV_IMPORT_BYTES = 10 * 1024 * 1024
const SAFE_CSV_MIME_TYPES = new Set(['', 'text/csv', 'application/csv', 'text/plain'])

export function validateCsvImportFile(file) {
  if (!file || typeof file.name !== 'string') {
    return { ok: false, message: 'Select a CSV file to import.' }
  }

  if (!file.name.toLowerCase().endsWith('.csv')) {
    return {
      ok: false,
      message: 'Only CSV imports are currently supported. Save Excel files as CSV before importing.',
    }
  }

  const size = Number(file.size || 0)
  if (size > MAX_CSV_IMPORT_BYTES) {
    return { ok: false, message: 'CSV imports must be 10 MB or smaller.' }
  }

  const type = String(file.type || '').toLowerCase()
  if (!SAFE_CSV_MIME_TYPES.has(type)) {
    return { ok: false, message: 'The selected file is not recognized as a safe CSV file.' }
  }

  return { ok: true, message: '' }
}

export { MAX_CSV_IMPORT_BYTES }
