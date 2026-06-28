import { useState, useEffect, useCallback } from 'react'
import { getTasks, createTask, updateTask, deleteTask } from '../db/tasks'

export function useTasks(filters = {}) {
  const [tasks, setTasks]     = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await getTasks(filters)
      setTasks(data)
    } catch(e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [JSON.stringify(filters)])

  useEffect(() => { load() }, [load])


  const add    = async (t)     => { const d = await createTask(t); setTasks(prev => [...prev, d]); return d }
  const update = async (id,ch) => { const d = await updateTask(id,ch); setTasks(prev => prev.map(x=>x.id===id?d:x)); return d }
  const remove = async (id)    => { await deleteTask(id); setTasks(prev => prev.filter(x=>x.id!==id)) }

  return { tasks, loading, error, reload: load, add, update, remove }
}
