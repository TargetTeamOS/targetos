import { useState, useEffect } from 'react'
import { getAgents } from '../db/agents'

export function useAgents() {
  const [agents, setAgents] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    getAgents()
      .then(setAgents)
      .catch(setError)
      .finally(() => setLoading(false))
  }, [])

  return { agents, loading, error }
}
