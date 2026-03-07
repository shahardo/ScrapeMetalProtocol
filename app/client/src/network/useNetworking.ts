import { useCallback, useEffect, useRef, useState } from 'react'
import { io, type Socket } from 'socket.io-client'
import type { RobotSnapshot } from '../types/game'

export type NetworkStatus = 'disconnected' | 'queued' | 'connecting' | 'matched'

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

export interface NetworkingAPI {
  status: NetworkStatus
  isHost: boolean
  joinQueue: () => void
  leaveQueue: () => void
  sendSnapshot: (snap: RobotSnapshot) => void
  latestRemoteSnapshot: React.RefObject<RobotSnapshot | null>
}

export function useNetworking(): NetworkingAPI {
  const [status, setStatus] = useState<NetworkStatus>('disconnected')
  const [isHost, setIsHost] = useState(false)

  const socketRef    = useRef<Socket | null>(null)
  const pcRef        = useRef<RTCPeerConnection | null>(null)
  const channelRef   = useRef<RTCDataChannel | null>(null)
  const myIdRef      = useRef('')
  const opponentRef  = useRef('')
  const latestRemoteSnapshot = useRef<RobotSnapshot | null>(null)

  // ── DataChannel setup (shared by host and guest paths) ──────────────────────
  const setupChannel = useCallback((dc: RTCDataChannel) => {
    channelRef.current = dc
    dc.onmessage = (e: MessageEvent<string>) => {
      try {
        latestRemoteSnapshot.current = JSON.parse(e.data) as RobotSnapshot
      } catch {
        // malformed snapshot — discard silently
      }
    }
    dc.onopen  = () => { setStatus('matched') }
    dc.onclose = () => { setStatus('disconnected') }
  }, [])

  // ── Peer connection factory ──────────────────────────────────────────────────
  const makePeerConnection = useCallback((socket: Socket): RTCPeerConnection => {
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS })
    pcRef.current = pc

    // Relay our ICE candidates to the opponent via the signaling server
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
    })

    socket.on('match_found', async (payload: MatchFoundPayload) => {
      const host = payload.players[0] === myIdRef.current
      setIsHost(host)
      setStatus('connecting')
      opponentRef.current = host ? payload.players[1] : payload.players[0]

      const pc = makePeerConnection(socket)

      if (host) {
        // Host opens the DataChannel and initiates the offer
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
        // stale candidate after connection — safe to ignore
      }
    })

    socket.on('opponent_disconnected', () => {
      pcRef.current?.close()
      pcRef.current = null
      channelRef.current = null
      latestRemoteSnapshot.current = null
      setStatus('disconnected')
    })

    socket.connect()

    return () => {
      pcRef.current?.close()
      socket.disconnect()
    }
  }, [makePeerConnection, setupChannel])

  // ── Public API ───────────────────────────────────────────────────────────────
  const joinQueue = useCallback(() => {
    socketRef.current?.emit('join_queue')
    setStatus('queued')
  }, [])

  const leaveQueue = useCallback(() => {
    socketRef.current?.emit('leave_queue')
    setStatus('disconnected')
  }, [])

  const sendSnapshot = useCallback((snap: RobotSnapshot) => {
    const ch = channelRef.current
    if (!ch || ch.readyState !== 'open') return
    ch.send(JSON.stringify(snap))
  }, [])

  return { status, isHost, joinQueue, leaveQueue, sendSnapshot, latestRemoteSnapshot }
}
