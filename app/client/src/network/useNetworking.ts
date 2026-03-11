import { useCallback, useEffect, useRef, useState } from 'react'
import { io, type Socket } from 'socket.io-client'
import type { RobotSnapshot } from '../types/game'
import type { LobbyEntry, LiveScoreEntry } from '../types/auth'
import { useGameStore } from '../store/gameStore'

export type NetworkStatus = 'disconnected' | 'queued' | 'connecting' | 'matched'
/** idle = not in a match; muted/active = in match; unavailable = mic denied */
export type MicStatus    = 'idle' | 'muted' | 'active' | 'unavailable'

const SERVER_URL = 'http://localhost:3001'
const ICE_SERVERS: RTCIceServer[] = [{ urls: 'stun:stun.l.google.com:19302' }]

// Snapshot channel: unordered, no retransmits — we want latest-only delivery.
// A dropped snapshot is better than a stale one delivered late.
const DC_INIT: RTCDataChannelInit = { ordered: false, maxRetransmits: 0 }

interface MatchFoundPayload {
  roomId: string
  players: [string, string]
}

interface WebRTCSignalIn {
  from: string
  sdp?: RTCSessionDescriptionInit
  candidate?: RTCIceCandidateInit
}

export type MatchResult = 'none' | 'victory' | 'defeat'

export interface NetworkingAPI {
  status: NetworkStatus
  isHost: boolean
  lobby:  LobbyEntry[]
  /** Seconds remaining in the pre-match countdown, or null when not counting. */
  countdown: number | null
  joinQueue: () => void
  leaveQueue: () => void
  /** Skip the current countdown and start the match immediately (requires 2+ players in queue). */
  skipCountdown: () => void
  sendSnapshot: (snap: RobotSnapshot) => void
  /** Emit the local player's current score to the server for live broadcast. */
  reportScore: (score: number) => void
  /** Signal to the opponent that our health hit zero; triggers end-of-match. */
  sendMatchEnd: () => void
  /** 'none' during an active match; 'defeat' / 'victory' for 5 s after match ends. */
  matchResult: MatchResult
  latestRemoteSnapshot: React.RefObject<RobotSnapshot | null>
  /** Holds the most recent weapon-fire event from the remote player.
   *  Set by the network layer; cleared by the consumer (RemoteRobotEntity)
   *  after reading, so it is never overwritten by a subsequent position snapshot. */
  pendingRemoteWeaponEvent: React.MutableRefObject<NonNullable<RobotSnapshot['weaponFired']> | null>
  /** Holds the most recent confirmed hit from the remote player (shooter's POV).
   *  The defender uses this to render sparks + damage numbers on their own screen. */
  pendingRemoteWeaponHit: React.MutableRefObject<NonNullable<RobotSnapshot['weaponHit']> | null>
  micStatus: MicStatus
  toggleMic: () => void
}

export function useNetworking(authToken?: string): NetworkingAPI {
  const [status,      setStatus]      = useState<NetworkStatus>('disconnected')
  const [isHost,      setIsHost]      = useState(false)
  const [micStatus,   setMicStatus]   = useState<MicStatus>('idle')
  const [lobby,       setLobby]       = useState<LobbyEntry[]>([])
  const [countdown,   setCountdown]   = useState<number | null>(null)
  const [matchResult, setMatchResult] = useState<MatchResult>('none')

  const setLiveScores = useGameStore((s) => s.setLiveScores)

  const socketRef    = useRef<Socket | null>(null)
  const pcRef        = useRef<RTCPeerConnection | null>(null)
  const channelRef   = useRef<RTCDataChannel | null>(null)
  const myIdRef      = useRef('')
  const opponentRef  = useRef('')
  const latestRemoteSnapshot      = useRef<RobotSnapshot | null>(null)
  const pendingRemoteWeaponEvent  = useRef<NonNullable<RobotSnapshot['weaponFired']> | null>(null)
  const pendingRemoteWeaponHit    = useRef<NonNullable<RobotSnapshot['weaponHit']>   | null>(null)

  // Voice chat refs
  const micStreamRef   = useRef<MediaStream | null>(null)
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null)

  // ── Helpers ──────────────────────────────────────────────────────────────────

  // Shared end-of-match transition: show result overlay, then reset after 5 s.
  const triggerMatchEnd = useCallback((result: 'victory' | 'defeat') => {
    setMatchResult(result)
    setTimeout(() => {
      pcRef.current?.close()
      pcRef.current      = null
      channelRef.current = null
      latestRemoteSnapshot.current     = null
      pendingRemoteWeaponEvent.current = null
      pendingRemoteWeaponHit.current   = null
      setMatchResult('none')
      setStatus('disconnected')
    }, 5000)
  }, [])

  const cleanupVoice = useCallback(() => {
    micStreamRef.current?.getTracks().forEach((t) => t.stop())
    micStreamRef.current = null
    if (remoteAudioRef.current) {
      remoteAudioRef.current.pause()
      remoteAudioRef.current.srcObject = null
      remoteAudioRef.current = null
    }
    setMicStatus('idle')
  }, [])

  // ── DataChannel setup (shared by host and guest paths) ──────────────────────
  const setupChannel = useCallback((dc: RTCDataChannel) => {
    channelRef.current = dc
    dc.onmessage = (e: MessageEvent<string>) => {
      try {
        const snap = JSON.parse(e.data) as RobotSnapshot
        // Opponent's health hit zero — we won.
        if (snap.matchEnd) {
          triggerMatchEnd('victory')
          return
        }
        // Store weapon events in a dedicated ref so they survive subsequent
        // position-only snapshots arriving before RemoteRobotEntity reads them.
        if (snap.weaponFired) {
          pendingRemoteWeaponEvent.current = snap.weaponFired
        }
        if (snap.weaponHit) {
          pendingRemoteWeaponHit.current = snap.weaponHit
        }
        latestRemoteSnapshot.current = snap
      } catch {
        // malformed snapshot — discard silently
      }
    }
    dc.onopen = () => {
      setStatus('matched')
      setMicStatus('muted')

      // Set up renegotiation AFTER the initial DC negotiation completes.
      // This handler fires when the user later adds a mic track.
      const pc     = pcRef.current
      const socket = socketRef.current
      if (!pc || !socket) return

      pc.onnegotiationneeded = async () => {
        if (pc.signalingState !== 'stable') return // avoid mid-negotiation races
        try {
          await pc.setLocalDescription(await pc.createOffer())
          socket.emit('webrtc_offer', { to: opponentRef.current, sdp: pc.localDescription })
        } catch {
          // Non-fatal: renegotiation can fail if the peer connection closed
        }
      }

      // Play remote audio (opponent's mic) when a track arrives
      pc.ontrack = (e) => {
        const audio = new Audio()
        audio.srcObject = e.streams[0] ?? null
        audio.autoplay  = true
        remoteAudioRef.current = audio
      }
    }
    dc.onclose = () => {
      cleanupVoice()
      setStatus('disconnected')
    }
  }, [cleanupVoice])

  // ── Peer connection factory ──────────────────────────────────────────────────
  const makePeerConnection = useCallback((socket: Socket): RTCPeerConnection => {
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS })
    pcRef.current = pc

    pc.onicecandidate = ({ candidate }) => {
      if (candidate) {
        socket.emit('webrtc_ice', { to: opponentRef.current, candidate: candidate.toJSON() })
      }
    }

    // Guest receives the DataChannel opened by the host
    pc.ondatachannel = (e) => { setupChannel(e.channel) }

    return pc
  }, [setupChannel])

  // ── Effect: socket lifecycle ─────────────────────────────────────────────────
  useEffect(() => {
    const socket = io(SERVER_URL, { autoConnect: false })
    socketRef.current = socket

    socket.on('connect', () => {
      myIdRef.current = socket.id ?? ''
      setStatus('disconnected')
      // Send JWT so the server knows our username for the lobby display
      if (authToken) socket.emit('authenticate', authToken)
    })

    socket.on('lobby_update', (entries: LobbyEntry[]) => {
      setLobby(entries)
    })

    socket.on('match_countdown', ({ secondsLeft }: { secondsLeft: number | null }) => {
      setCountdown(secondsLeft)
    })

    socket.on('live_scores', (scores: LiveScoreEntry[]) => {
      setLiveScores(scores)
    })

    socket.on('match_found', async (payload: MatchFoundPayload) => {
      setCountdown(null)
      const host = payload.players[0] === myIdRef.current
      setIsHost(host)
      setStatus('connecting')
      opponentRef.current = host ? payload.players[1] : payload.players[0]

      const pc = makePeerConnection(socket)

      if (host) {
        setupChannel(pc.createDataChannel('snapshots', DC_INIT))
        const offer = await pc.createOffer()
        await pc.setLocalDescription(offer)
        socket.emit('webrtc_offer', { to: opponentRef.current, sdp: pc.localDescription })
      }
    })

    socket.on('webrtc_offer', async ({ sdp }: WebRTCSignalIn) => {
      const pc = pcRef.current
      if (!pc || !sdp) return
      await pc.setRemoteDescription(new RTCSessionDescription(sdp))
      const answer = await pc.createAnswer()
      await pc.setLocalDescription(answer)
      socket.emit('webrtc_answer', { to: opponentRef.current, sdp: pc.localDescription })
    })

    socket.on('webrtc_answer', async ({ sdp }: WebRTCSignalIn) => {
      const pc = pcRef.current
      if (!pc || !sdp) return
      await pc.setRemoteDescription(new RTCSessionDescription(sdp))
    })

    socket.on('webrtc_ice', async ({ candidate }: WebRTCSignalIn) => {
      const pc = pcRef.current
      if (!pc || !candidate) return
      try {
        await pc.addIceCandidate(new RTCIceCandidate(candidate))
      } catch {
        // stale candidate — safe to ignore
      }
    })

    socket.on('opponent_disconnected', () => {
      pcRef.current?.close()
      pcRef.current  = null
      channelRef.current = null
      latestRemoteSnapshot.current = null
      pendingRemoteWeaponEvent.current = null
      pendingRemoteWeaponHit.current = null
      cleanupVoice()
      setStatus('disconnected')
    })

    socket.connect()

    return () => {
      cleanupVoice()
      pcRef.current?.close()
      socket.disconnect()
    }
  }, [authToken, makePeerConnection, setupChannel, cleanupVoice, setLiveScores])

  // ── Public API ───────────────────────────────────────────────────────────────
  const joinQueue = useCallback(() => {
    socketRef.current?.emit('join_queue')
    setStatus('queued')
  }, [])

  const leaveQueue = useCallback(() => {
    socketRef.current?.emit('leave_queue')
    setStatus('disconnected')
  }, [])

  const skipCountdown = useCallback(() => {
    socketRef.current?.emit('skip_countdown')
  }, [])

  const sendSnapshot = useCallback((snap: RobotSnapshot) => {
    const ch = channelRef.current
    if (!ch || ch.readyState !== 'open') return
    ch.send(JSON.stringify(snap))
  }, [])

  const sendMatchEnd = useCallback(() => {
    const ch = channelRef.current
    if (ch?.readyState === 'open') ch.send(JSON.stringify({ matchEnd: true }))
    triggerMatchEnd('defeat')
  }, [triggerMatchEnd])

  const reportScore = useCallback((score: number) => {
    socketRef.current?.emit('score_update', score)
  }, [])

  /**
   * Activate or mute the local microphone.
   *
   * First call: requests getUserMedia; on denial sets status to 'unavailable'
   * and the match continues silently (per PDD error handling spec).
   * Subsequent calls toggle the track's enabled flag — no renegotiation needed.
   */
  const toggleMic = useCallback(async () => {
    const pc = pcRef.current
    if (!pc) return

    // Already have a stream — just toggle the track's enabled flag
    if (micStreamRef.current) {
      const tracks = micStreamRef.current.getAudioTracks()
      const nowEnabled = !tracks[0]?.enabled
      tracks.forEach((t) => { t.enabled = nowEnabled })
      setMicStatus(nowEnabled ? 'active' : 'muted')
      return
    }

    // First activation: request mic access
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false })
      micStreamRef.current = stream
      for (const track of stream.getAudioTracks()) {
        pc.addTrack(track, stream)
      }
      setMicStatus('active')
      // pc.onnegotiationneeded fires automatically to renegotiate with the opponent
    } catch {
      // Mic denied or unavailable — match continues without voice chat
      setMicStatus('unavailable')
    }
  }, [])

  return {
    status, isHost, lobby, countdown, matchResult,
    joinQueue, leaveQueue, skipCountdown,
    sendSnapshot, reportScore, sendMatchEnd,
    latestRemoteSnapshot, pendingRemoteWeaponEvent, pendingRemoteWeaponHit,
    micStatus, toggleMic,
  }
}
