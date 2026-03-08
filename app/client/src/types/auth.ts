/** Authenticated user stored in memory and localStorage. */
export interface AuthUser {
  userId:   string
  username: string
  isAdmin:  boolean
  token:    string
}

/** One entry in the server-broadcast waiting-room list. */
export interface LobbyEntry {
  socketId: string
  username: string
}

/** Score entry returned by GET /scores. */
export interface ScoreEntry {
  _id:       string
  userId:    string
  username:  string
  score:     number
  createdAt: string
}

/** Live in-session score broadcast by the server over Socket.io. */
export interface LiveScoreEntry {
  username: string
  score:    number
}
