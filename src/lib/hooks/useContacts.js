import { useState, useEffect, useCallback } from 'react'
import { getContacts, createContact, updateContact, deleteContact } from '../db/contacts'
import { supabase } from '../supabase'

export function useContacts(filters = {}) {
  const [contacts, setContacts] = useState([])
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await getContacts(filters)
      setContacts(data)
    } catch(e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [JSON.stringify(filters)])

  useEffect(() => { load() }, [load])

  // Supabase Realtime subscription
  useEffect(() => {
    const channel = supabase
      .channel('contacts-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'contacts' }, () => {
        load() // reload when any contact changes
      })
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [load])

  const add = async (contact) => {
    const created = await createContact(contact)
    setContacts(prev => [created, ...prev])
    return created
  }

  const update = async (id, changes) => {
    const updated = await updateContact(id, changes)
    setContacts(prev => prev.map(c => c.id === id ? updated : c))
    return updated
  }

  const remove = async (id) => {
    await deleteContact(id)
    setContacts(prev => prev.filter(c => c.id !== id))
  }

  return { contacts, loading, error, reload: load, add, update, remove }
}
