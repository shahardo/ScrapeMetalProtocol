import { useEffect, useState } from 'react'

const SERVER_URL = 'http://localhost:3001'

interface UserRow {
  _id:       string
  username:  string
  isAdmin:   boolean
  createdAt: string
}

interface AdminConsoleProps {
  token:   string
  onClose: () => void
}

export function AdminConsole({ token, onClose }: AdminConsoleProps) {
  const [users,   setUsers]   = useState<UserRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState<string | null>(null)
  const [busy,    setBusy]    = useState<string | null>(null)  // userId being acted on

  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }

  const loadUsers = () => {
    setLoading(true)
    fetch(`${SERVER_URL}/admin/users`, { headers })
      .then((r) => r.json())
      .then((data: { users?: UserRow[]; error?: string }) => {
        if (data.error) { setError(data.error); return }
        setUsers(data.users ?? [])
      })
      .catch(() => setError('Failed to load users.'))
      .finally(() => setLoading(false))
  }

  useEffect(loadUsers, [token])   // eslint-disable-line react-hooks/exhaustive-deps

  const deleteUser = async (userId: string) => {
    if (!confirm('Delete this user account? This cannot be undone.')) return
    setBusy(userId)
    await fetch(`${SERVER_URL}/admin/users/${userId}`, { method: 'DELETE', headers })
    setBusy(null)
    loadUsers()
  }

  const toggleAdmin = async (userId: string) => {
    setBusy(userId)
    await fetch(`${SERVER_URL}/admin/users/${userId}/promote`, { method: 'PATCH', headers })
    setBusy(null)
    loadUsers()
  }

  return (
    <div className="scoreboard-overlay" onClick={onClose}>
      <div className="scoreboard-panel admin-panel" onClick={(e) => e.stopPropagation()}>
        <div className="scoreboard-header">
          <span className="scoreboard-title">ADMIN CONSOLE</span>
          <button className="garage-close" onClick={onClose}>✕</button>
        </div>

        {loading && <p className="scoreboard-empty">LOADING...</p>}
        {error   && <p className="scoreboard-empty admin-error">{error}</p>}

        {!loading && !error && (
          <ul className="admin-user-list">
            {users.map((u) => (
              <li key={u._id} className="admin-user-row">
                <span className="admin-username">
                  {u.username}
                  {u.isAdmin && <span className="admin-badge">ADMIN</span>}
                </span>
                <span className="admin-date">{new Date(u.createdAt).toLocaleDateString()}</span>
                <div className="admin-actions">
                  <button
                    className="garage-btn"
                    disabled={busy === u._id}
                    onClick={() => void toggleAdmin(u._id)}
                  >
                    {u.isAdmin ? 'DEMOTE' : 'PROMOTE'}
                  </button>
                  <button
                    className="garage-btn garage-btn--danger"
                    disabled={busy === u._id}
                    onClick={() => void deleteUser(u._id)}
                  >
                    DELETE
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
