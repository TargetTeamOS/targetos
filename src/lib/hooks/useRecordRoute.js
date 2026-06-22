/**
 * useRecordRoute — Universal hook for URL-based record routing
 * 
 * Every page that shows a list of records uses this hook.
 * It handles:
 *   - Reading :id from URL → auto-opens that record
 *   - Navigating to /page/:id when a record is clicked
 *   - Navigating back to /page when closing a record
 *   - Any new page/record type automatically works
 * 
 * Usage:
 *   const { selectedId, openRecord, closeRecord } = useRecordRoute('/contacts')
 */
import { useNavigate, useParams } from 'react-router-dom'

export function useRecordRoute(basePath) {
  const navigate   = useNavigate()
  const { id }     = useParams()

  function openRecord(record) {
    if (record?.id) navigate(`${basePath}/${record.id}`)
  }

  function closeRecord() {
    navigate(basePath)
  }

  function navigateToNew() {
    navigate(`${basePath}/new`)
  }

  return {
    selectedId:   id || null,
    openRecord,
    closeRecord,
    navigateToNew,
    isNew:        id === 'new',
  }
}
