import { useState, useEffect, useCallback } from 'react'
import { getTransactions, createTransaction, updateTransaction, deleteTransaction } from '../db/transactions'
import { supabase } from '../supabase'
export function useTransactions(filters = {}) {
  const [transactions, setTransactions] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState(null)
  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try { setTransactions(await getTransactions(filters)) } catch(e) { setError(e.message) } finally { setLoading(false) }
  }, [JSON.stringify(filters)])
  useEffect(() => { load() }, [load])
  useEffect(() => {
    const ch = supabase.channel('tx-rt').on('postgres_changes',{event:'*',schema:'public',table:'transactions'},(p)=>{
      if(p.eventType==='INSERT') setTransactions(prev=>[p.new,...prev])
      else if(p.eventType==='UPDATE') setTransactions(prev=>prev.map(t=>t.id===p.new.id?p.new:t))
      else if(p.eventType==='DELETE') setTransactions(prev=>prev.filter(t=>t.id!==p.old.id))
    }).subscribe()
    return () => supabase.removeChannel(ch)
  }, [])
  const add    = async (t)    => { const d = await createTransaction(t); setTransactions(p=>[d,...p]); return d }
  const update = async (id,c) => { const d = await updateTransaction(id,c); setTransactions(p=>p.map(x=>x.id===id?d:x)); return d }
  const remove = async (id)   => { await deleteTransaction(id); setTransactions(p=>p.filter(x=>x.id!==id)) }
  return { transactions, loading, error, reload: load, add, update, remove }
}
