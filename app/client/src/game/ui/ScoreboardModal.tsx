import { useEffect, useState } from 'react'
import type { ScoreEntry } from '../../types/auth'
import { useGameStore } from '../../store/gameStore'

const SERVER_URL = 'http://localhost:3001'

interface ScoreboardModalProps {
  onClose: () => void
}

export function ScoreboardModal({ onClose }: ScoreboardModalProps) {
  const [scores,  setScores]  = useState<ScoreEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState<string | null>(null)

  const liveScores = useGameStore((s) => s.liveScores)

  useEffect(() => {
    let cancelled = false

    fetch(`${SERVER_URL}/scores`)
      .then((r) => r.json())
      .then((data: { scores?: ScoreEntry[] }) => {
        if (!cancelled) {
          setScores(data.scores ?? [])
          setLoading(false)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setError('Could not load scores.')
          setLoading(false)
        }
      })

    return () => { cancelled = true }
  }, [])

  return (
    <div className="scoreboard-overlay" onClick={onClose}>
      <div className="scoreboard-panel" onClick={(e) => e.stopPropagation()}>
        <div className="scoreboard-header">
          <span className="scoreboard-title">LEADERBOARD</span>
          <button className="garage-close" onClick={onClose}>✕</button>
        </div>

        {/* ── Live session scores (present while a match is active) ── */}
        {liveScores.length > 0 && (
          <section className="scoreboard-section">
            <p className="scoreboard-section-label">LIVE — THIS SESSION</p>
            <ol className="scoreboard-list">
              {liveScores.map((s, i) => (
                <li key={s.username} className={`scoreboard-row${i < 3 ? ' scoreboard-row--top' : ''}`}>
                  <span className="scoreboard-rank">#{i + 1}</span>
                  <span className="scoreboard-name">{s.username}</span>
                  <span className="scoreboard-score">{s.score}</span>
                </li>
              ))}
            </ol>
          </section>
        )}

        {/* ── All-time leaderboard from DB ── */}
        <section className="scoreboard-section">
          {liveScores.length > 0 && <p className="scoreboard-section-label">ALL-TIME</p>}

          {loading && <p className="scoreboard-empty">LOADING...</p>}
          {error   && <p className="scoreboard-empty">{error}</p>}

          {!loading && !error && scores.length === 0 && (
            <p className="scoreboard-empty">NO SCORES YET — BE THE FIRST TO FIGHT</p>
          )}

          {!loading && !error && scores.length > 0 && (
            <ol className="scoreboard-list">
              {scores.map((s, i) => (
                <li key={s._id} className={`scoreboard-row${i < 3 ? ' scoreboard-row--top' : ''}`}>
                  <span className="scoreboard-rank">#{i + 1}</span>
                  <span className="scoreboard-name">{s.username}</span>
                  <span className="scoreboard-score">{s.score}</span>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>
    </div>
  )
}
