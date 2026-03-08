import { useState, type FormEvent } from 'react'

interface AuthModalProps {
  onLogin:    (username: string, password: string) => Promise<string | null>
  onRegister: (username: string, password: string) => Promise<string | null>
}

export function AuthModal({ onLogin, onRegister }: AuthModalProps) {
  const [mode,     setMode]     = useState<'login' | 'register'>('login')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error,    setError]    = useState<string | null>(null)
  const [busy,     setBusy]     = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (busy) return
    setError(null)
    setBusy(true)

    const fn  = mode === 'login' ? onLogin : onRegister
    const err = await fn(username.trim(), password)

    setBusy(false)
    if (err) setError(err)
  }

  return (
    <div className="auth-overlay">
      <div className="auth-panel">
        <h1 className="auth-title">SCRAP METAL PROTOCOL</h1>
        <p className="auth-subtitle">PILOT AUTHENTICATION REQUIRED</p>

        <div className="auth-tabs">
          <button
            className={`auth-tab${mode === 'login' ? ' auth-tab--active' : ''}`}
            onClick={() => { setMode('login'); setError(null) }}
          >LOGIN</button>
          <button
            className={`auth-tab${mode === 'register' ? ' auth-tab--active' : ''}`}
            onClick={() => { setMode('register'); setError(null) }}
          >REGISTER</button>
        </div>

        <form className="auth-form" onSubmit={(e) => void submit(e)}>
          <input
            className="auth-input"
            type="text"
            placeholder="USERNAME"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoFocus
            autoComplete="username"
          />
          <input
            className="auth-input"
            type="password"
            placeholder="PASSWORD"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
          />

          {error && <p className="auth-error">{error}</p>}

          <button className="auth-submit" type="submit" disabled={busy}>
            {busy ? 'CONNECTING...' : mode === 'login' ? 'LOGIN' : 'CREATE ACCOUNT'}
          </button>
        </form>
      </div>
    </div>
  )
}
