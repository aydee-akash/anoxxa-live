import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion, AnimatePresence } from 'motion/react'
import {
  Room,
  RoomEvent,
  Track,
  type LocalVideoTrack,
  type RemoteTrack,
} from 'livekit-client'
import {
  Video,
  Mic,
  MicOff,
  VideoOff,
  PhoneOff,
  ArrowRight,
  ShieldCheck,
  Loader2,
} from 'lucide-react'
import { fetchToken, formatDuration } from '../lib/livekit'

type Phase = 'idle' | 'connecting' | 'live' | 'ended' | 'error'

interface TranscriptEntry {
  id: string
  speaker: 'You' | 'Ken'
  text: string
  final: boolean
}

const AGENT_NAME = 'Ken'

export default function CallExperience() {
  const [phase, setPhase] = useState<Phase>('idle')
  const [errorMsg, setErrorMsg] = useState('')
  const [elapsed, setElapsed] = useState(0)
  const [micOn, setMicOn] = useState(true)
  const [camOn, setCamOn] = useState(true)
  const [agentSpeaking, setAgentSpeaking] = useState(false)
  const [agentJoined, setAgentJoined] = useState(false)
  const [agentVideo, setAgentVideo] = useState(false)
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([])

  const roomRef = useRef<Room | null>(null)
  const localVideoRef = useRef<HTMLVideoElement | null>(null)
  const agentVideoRef = useRef<HTMLVideoElement | null>(null)
  const agentVideoTrackRef = useRef<RemoteTrack | null>(null)
  const agentAudioTrackRef = useRef<RemoteTrack | null>(null)
  const localCamTrackRef = useRef<LocalVideoTrack | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const transcriptEndRef = useRef<HTMLDivElement | null>(null)

  // ── Timer ────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (phase !== 'live') return
    const t = setInterval(() => setElapsed((e) => e + 1), 1000)
    return () => clearInterval(t)
  }, [phase])

  // Auto-scroll transcript
  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [transcript])

  // Attach the avatar video once both the track and the in-call <video> exist.
  useEffect(() => {
    if (phase === 'live' && agentVideo && agentVideoTrackRef.current && agentVideoRef.current) {
      agentVideoTrackRef.current.attach(agentVideoRef.current)
    }
  }, [phase, agentVideo])

  // Re-attach the local camera when it's toggled back on (the track changes).
  useEffect(() => {
    if (phase === 'live' && camOn && localCamTrackRef.current && localVideoRef.current) {
      localCamTrackRef.current.attach(localVideoRef.current)
    }
  }, [phase, camOn])

  // Callback ref for the self-view <video>. The phase swap uses AnimatePresence
  // mode="wait", so the in-call view isn't mounted yet when the camera is
  // enabled or when the effect above first runs — the track was never attached
  // and the first frame showed black (until a manual off/on re-ran the effect).
  // A callback ref fires exactly when the element mounts, so we attach right then.
  const setLocalVideoEl = useCallback((node: HTMLVideoElement | null) => {
    localVideoRef.current = node
    if (node && localCamTrackRef.current) {
      localCamTrackRef.current.attach(node)
    }
  }, [])

  const upsertTranscript = useCallback(
    (id: string, speaker: 'You' | 'Ken', text: string, final: boolean) => {
      const clean = text.trim()
      if (!clean) return
      setTranscript((prev) => {
        // Same utterance already on screen → update it in place (interim → final).
        const byId = prev.findIndex((e) => e.id === id)
        if (byId !== -1) {
          const next = [...prev]
          next[byId] = { ...next[byId], text, final }
          return next
        }
        // Fallback for when interim refinements of the same utterance arrive
        // under fresh ids: the text grows ("Yes." → "Yes. My name is Akash.").
        // If the last line is the same speaker and one text is a prefix of the
        // other, it's the same utterance — replace it instead of duplicating.
        const last = prev[prev.length - 1]
        if (last && last.speaker === speaker) {
          const prevClean = last.text.trim()
          if (clean.startsWith(prevClean) || prevClean.startsWith(clean)) {
            const next = [...prev]
            next[next.length - 1] = { id, speaker, text, final }
            return next
          }
        }
        return [...prev, { id, speaker, text, final }]
      })
    },
    [],
  )

  const cleanup = useCallback(() => {
    const room = roomRef.current
    if (room) {
      room.disconnect()
      roomRef.current = null
    }
  }, [])

  useEffect(() => () => cleanup(), [cleanup])

  const startCall = useCallback(async () => {
    setPhase('connecting')
    setErrorMsg('')
    setTranscript([])
    setElapsed(0)
    try {
      const identity = `user-${Math.random().toString(36).slice(2, 8)}`
      const roomName = `loan-${Math.random().toString(36).slice(2, 8)}`
      const { token, url } = await fetchToken(roomName, identity)

      const room = new Room({
        adaptiveStream: true,
        dynacast: true,
        // Browser AEC on the mic so the agent never hears itself.
        audioCaptureDefaults: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      })
      roomRef.current = room

      room.on(RoomEvent.TrackSubscribed, (track: RemoteTrack) => {
        if (track.kind === Track.Kind.Audio) {
          // Exactly one audio sink (the hidden <audio>) to avoid double playback.
          if (agentAudioTrackRef.current && agentAudioTrackRef.current !== track) {
            agentAudioTrackRef.current.detach()
          }
          agentAudioTrackRef.current = track
          if (audioRef.current) track.attach(audioRef.current)
        }
        if (track.kind === Track.Kind.Video) {
          // The Beyond Presence avatar publishes a talking-head video track.
          agentVideoTrackRef.current = track
          setAgentVideo(true)
          if (agentVideoRef.current) track.attach(agentVideoRef.current)
        }
      })

      room.on(RoomEvent.ParticipantConnected, () => setAgentJoined(true))
      room.on(RoomEvent.ActiveSpeakersChanged, (speakers) => {
        setAgentSpeaking(speakers.some((s) => !s.isLocal))
      })
      room.on(RoomEvent.Disconnected, () => setPhase('ended'))

      // Live transcript via LiveKit Agents text streams (topic: lk.transcription).
      // Key entries by the stable transcription SEGMENT id (not the per-message
      // stream id) so a segment's interim refinements coalesce into one line
      // instead of appending a duplicate on every update.
      room.registerTextStreamHandler(
        'lk.transcription',
        async (reader, participantInfo) => {
          const isUser = participantInfo?.identity === room.localParticipant.identity
          const speaker = isUser ? 'You' : AGENT_NAME
          const attrs = reader.info.attributes ?? {}
          const segmentId = attrs['lk.segment_id'] || reader.info.id
          const finalAttr = attrs['lk.transcription_final']
          let text = ''
          for await (const chunk of reader) {
            text += chunk
            upsertTranscript(segmentId, speaker, text, false)
          }
          // Prefer the protocol's final flag; fall back to "stream finished".
          const isFinal = finalAttr !== undefined ? finalAttr === 'true' : true
          upsertTranscript(segmentId, speaker, text, isFinal)
        },
      )

      await room.connect(url, token)

      // Managed camera + mic so the toggle buttons control the SAME tracks that
      // are published (mixing manual publish with setCameraEnabled inverts toggles).
      await room.localParticipant.setMicrophoneEnabled(true)
      await room.localParticipant.setCameraEnabled(true)
      const camPub = room.localParticipant.getTrackPublication(Track.Source.Camera)
      const camTrack = camPub?.videoTrack as LocalVideoTrack | undefined
      if (camTrack) {
        localCamTrackRef.current = camTrack
        if (localVideoRef.current) camTrack.attach(localVideoRef.current)
      }

      setPhase('live')
    } catch (err) {
      console.error(err)
      setErrorMsg(
        err instanceof Error ? err.message : 'Could not start the call. Check camera/mic permissions.',
      )
      setPhase('error')
      cleanup()
    }
  }, [cleanup, upsertTranscript])

  const endCall = useCallback(() => {
    cleanup()
    setPhase('ended')
  }, [cleanup])

  const toggleMic = useCallback(async () => {
    const room = roomRef.current
    if (!room) return
    const next = !micOn
    await room.localParticipant.setMicrophoneEnabled(next)
    setMicOn(next)
  }, [micOn])

  const toggleCam = useCallback(async () => {
    const room = roomRef.current
    if (!room) return
    const next = !camOn
    await room.localParticipant.setCameraEnabled(next)
    setCamOn(next)
    if (next) {
      const camTrack = room.localParticipant.getTrackPublication(Track.Source.Camera)
        ?.videoTrack as LocalVideoTrack | undefined
      if (camTrack) {
        localCamTrackRef.current = camTrack
        if (localVideoRef.current) camTrack.attach(localVideoRef.current)
      }
    }
  }, [camOn])

  return (
    <div className="min-h-dvh bg-[#0A0F0D] text-white font-sans antialiased flex flex-col">
      <audio ref={audioRef} autoPlay className="hidden" />

      <AnimatePresence mode="wait">
        {(phase === 'idle' || phase === 'connecting' || phase === 'error') && (
          <Lobby
            key="lobby"
            phase={phase}
            errorMsg={errorMsg}
            onStart={startCall}
          />
        )}

        {phase === 'live' && (
          <InCall
            key="live"
            elapsed={elapsed}
            micOn={micOn}
            camOn={camOn}
            agentSpeaking={agentSpeaking}
            agentJoined={agentJoined}
            agentVideo={agentVideo}
            transcript={transcript}
            localVideoRef={setLocalVideoEl}
            agentVideoRef={agentVideoRef}
            transcriptEndRef={transcriptEndRef}
            onToggleMic={toggleMic}
            onToggleCam={toggleCam}
            onEnd={endCall}
          />
        )}

        {phase === 'ended' && (
          <Ended key="ended" elapsed={elapsed} transcript={transcript} />
        )}
      </AnimatePresence>
    </div>
  )
}

/* ── Lobby (pre-call) ──────────────────────────────────────────────────── */
function Lobby({
  phase,
  errorMsg,
  onStart,
}: {
  phase: Phase
  errorMsg: string
  onStart: () => void
}) {
  const connecting = phase === 'connecting'
  return (
    <motion.main
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="flex-1 flex flex-col items-center justify-center px-6 py-16"
    >
      <div className="w-full max-w-xl text-center">
        {/* Brand */}
        <div className="flex items-center justify-center gap-3 mb-12">
          <div className="w-11 h-11 rounded-xl bg-[#58C896] flex items-center justify-center">
            <Video className="w-5 h-5 text-[#0A0F0D]" strokeWidth={2.2} />
          </div>
          <div className="text-left leading-tight">
            <div className="text-[17px] font-semibold tracking-tight">Anoxaa</div>
            <div className="text-[11px] tracking-[0.18em] text-[#58C896] font-semibold">
              AI LOAN OFFICER
            </div>
          </div>
        </div>

        {/* Headline */}
        <h1 className="text-4xl md:text-5xl font-light tracking-tight leading-[1.1] mb-6">
          Your personal loan,
          <br />
          <span className="font-semibold">one conversation away</span>
        </h1>

        <p className="text-[#9AA3B2] text-lg leading-relaxed max-w-md mx-auto mb-10">
          Talk to {AGENT_NAME}, our AI loan officer. Show your PAN on camera and
          walk away with a personalized offer in minutes. No forms, no queues.
        </p>

        {/* CTA */}
        <button
          type="button"
          onClick={onStart}
          disabled={connecting}
          className="w-full max-w-md mx-auto flex items-center justify-center gap-2 bg-[#58C896] hover:bg-[#6BD6A6] disabled:opacity-70 text-[#0A0F0D] text-lg font-semibold rounded-2xl px-8 py-4 transition-colors"
        >
          {connecting ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              Connecting to {AGENT_NAME}…
            </>
          ) : (
            <>
              Start Video Call
              <ArrowRight className="w-5 h-5" />
            </>
          )}
        </button>

        {errorMsg && (
          <p className="mt-4 text-sm text-red-400">{errorMsg}</p>
        )}

        {/* Divider */}
        <div className="h-px bg-white/10 my-10" />

        {/* Requirement chips */}
        <div className="flex items-center justify-center gap-8 text-sm text-[#9AA3B2] mb-6">
          <span className="flex items-center gap-2">
            <Mic className="w-4 h-4" /> Camera + Mic
          </span>
          <span className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4" /> PAN Card
          </span>
          <span>5–7 min</span>
        </div>

        <p className="text-[11px] tracking-[0.14em] text-[#5A6273] font-medium">
          END-TO-END ENCRYPTED · VIDEO RECORDED FOR COMPLIANCE · RBI COMPLIANT
        </p>

        <Link
          to="/"
          className="inline-block mt-8 text-sm text-[#5A6273] hover:text-[#9AA3B2] transition-colors"
        >
          ← Back to home
        </Link>
      </div>
    </motion.main>
  )
}

/* ── In-call ───────────────────────────────────────────────────────────── */
function InCall({
  elapsed,
  micOn,
  camOn,
  agentSpeaking,
  agentJoined,
  agentVideo,
  transcript,
  localVideoRef,
  agentVideoRef,
  transcriptEndRef,
  onToggleMic,
  onToggleCam,
  onEnd,
}: {
  elapsed: number
  micOn: boolean
  camOn: boolean
  agentSpeaking: boolean
  agentJoined: boolean
  agentVideo: boolean
  transcript: TranscriptEntry[]
  localVideoRef: React.Ref<HTMLVideoElement>
  agentVideoRef: React.RefObject<HTMLVideoElement | null>
  transcriptEndRef: React.RefObject<HTMLDivElement | null>
  onToggleMic: () => void
  onToggleCam: () => void
  onEnd: () => void
}) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="h-dvh flex flex-col overflow-hidden"
    >
      {/* Header */}
      <header className="flex items-center justify-between px-5 sm:px-8 py-4 border-b border-white/10">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-[#58C896] flex items-center justify-center">
            <Video className="w-4 h-4 text-[#0A0F0D]" strokeWidth={2.2} />
          </div>
          <span className="font-semibold tracking-tight">
            Anoxaa <span className="text-[#5A6273] font-normal">· Loan Application</span>
          </span>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-sm tabular-nums text-[#9AA3B2]">
            {formatDuration(elapsed)}
          </span>
          <button
            type="button"
            onClick={onEnd}
            className="flex items-center gap-2 text-sm font-medium text-red-400 border border-red-400/30 hover:bg-red-400/10 rounded-lg px-4 py-2 transition-colors"
          >
            <PhoneOff className="w-4 h-4" />
            End Call
          </button>
        </div>
      </header>

      {/* Body */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-[1fr_360px] grid-rows-[auto_minmax(0,1fr)] lg:grid-rows-[minmax(0,1fr)] gap-4 p-4 sm:p-6 min-h-0">
        {/* Video area: one main agent tile + small self-view PiP */}
        <div
          className={`relative rounded-2xl border bg-[#12151C] overflow-hidden flex items-center justify-center transition-colors min-h-[320px] lg:min-h-0 ${
            agentSpeaking ? 'border-[#58C896]/70' : 'border-white/10'
          }`}
        >
          {/* Avatar video (muted: audio plays via the single hidden <audio>) */}
          <video
            ref={agentVideoRef}
            autoPlay
            playsInline
            muted
            className={`absolute inset-0 w-full h-full object-cover ${agentVideo ? '' : 'hidden'}`}
          />

          {/* Fallback (no avatar video yet) */}
          {!agentVideo && (
            <div className="flex flex-col items-center gap-3">
              <div
                className={`w-20 h-20 rounded-full bg-[#58C896] flex items-center justify-center text-2xl font-semibold text-[#0A0F0D] transition-transform ${
                  agentSpeaking ? 'scale-105' : 'scale-100'
                }`}
              >
                {AGENT_NAME[0]}
              </div>
              <div className="flex items-end gap-1 h-5">
                {[0, 1, 2, 3, 4].map((i) => (
                  <span
                    key={i}
                    className={`w-1 rounded-full bg-[#58C896] ${
                      agentSpeaking ? 'animate-pulse' : 'opacity-30'
                    }`}
                    style={{ height: agentSpeaking ? `${8 + ((i * 7) % 16)}px` : '6px' }}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Agent name + status (top-left) */}
          <div className="absolute top-3 left-3 flex items-center gap-2 bg-black/50 backdrop-blur px-3 py-1.5 rounded-lg">
            <span className="font-semibold text-sm">{AGENT_NAME}</span>
            <span className="text-xs text-[#9AA3B2]">
              {!agentJoined ? 'Connecting…' : agentSpeaking ? 'Speaking…' : 'Listening'}
            </span>
          </div>

          {/* Self-view PiP (bottom-right) */}
          <div className="absolute bottom-3 right-3 w-32 sm:w-44 aspect-video rounded-xl overflow-hidden border border-white/20 bg-black shadow-lg">
            <video
              ref={localVideoRef}
              autoPlay
              muted
              playsInline
              className={`w-full h-full object-cover ${camOn ? '' : 'hidden'}`}
            />
            {!camOn && (
              <div className="absolute inset-0 flex items-center justify-center text-[#5A6273]">
                <VideoOff className="w-6 h-6" />
              </div>
            )}
            <span className="absolute bottom-1 left-1.5 text-[10px] bg-black/50 px-1.5 py-0.5 rounded">
              You
            </span>
          </div>

          {/* Controls (bottom-left) */}
          <div className="absolute bottom-3 left-3 flex gap-2">
            <button
              type="button"
              onClick={onToggleMic}
              className={`w-10 h-10 rounded-full flex items-center justify-center transition-colors ${
                micOn ? 'bg-white/10 hover:bg-white/20' : 'bg-red-500 hover:bg-red-600'
              }`}
              aria-label={micOn ? 'Mute' : 'Unmute'}
            >
              {micOn ? <Mic className="w-4 h-4" /> : <MicOff className="w-4 h-4" />}
            </button>
            <button
              type="button"
              onClick={onToggleCam}
              className={`w-10 h-10 rounded-full flex items-center justify-center transition-colors ${
                camOn ? 'bg-white/10 hover:bg-white/20' : 'bg-red-500 hover:bg-red-600'
              }`}
              aria-label={camOn ? 'Turn camera off' : 'Turn camera on'}
            >
              {camOn ? <Video className="w-4 h-4" /> : <VideoOff className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* Transcript */}
        <aside className="rounded-2xl border border-white/10 bg-[#0E1117] flex flex-col min-h-0">
          <div className="px-5 py-4 border-b border-white/10">
            <span className="text-xs tracking-[0.16em] text-[#9AA3B2] font-semibold">
              LIVE TRANSCRIPT
            </span>
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto no-scrollbar px-5 py-4 space-y-4">
            {transcript.length === 0 ? (
              <p className="text-sm italic text-[#5A6273]">
                Waiting for conversation…
              </p>
            ) : (
              <TranscriptLines transcript={transcript} />
            )}
            <div ref={transcriptEndRef} />
          </div>
        </aside>
      </div>
    </motion.div>
  )
}

/* ── Shared transcript line rendering (live view + ended summary) ───────── */
function TranscriptLines({ transcript }: { transcript: TranscriptEntry[] }) {
  return (
    <>
      {transcript.map((entry) => (
        <div key={entry.id} className="flex flex-col gap-1">
          <span
            className={`text-[11px] font-semibold uppercase tracking-wide ${
              entry.speaker === AGENT_NAME ? 'text-[#58C896]' : 'text-[#8AB4F8]'
            }`}
          >
            {entry.speaker}
          </span>
          <span
            className={`text-sm leading-relaxed ${
              entry.final ? 'text-[#D6DAE2]' : 'text-[#9AA3B2]'
            }`}
          >
            {entry.text}
          </span>
        </div>
      ))}
    </>
  )
}

/* ── Ended ─────────────────────────────────────────────────────────────── */
function Ended({
  elapsed,
  transcript,
}: {
  elapsed: number
  transcript: TranscriptEntry[]
}) {
  const hasTranscript = transcript.length > 0
  return (
    <motion.main
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className={`h-dvh flex flex-col items-center px-6 py-10 overflow-hidden ${
        hasTranscript ? '' : 'justify-center'
      }`}
    >
      {/* Summary */}
      <div className="flex flex-col items-center text-center shrink-0">
        <div className="w-16 h-16 rounded-full bg-[#12151C] border border-white/10 flex items-center justify-center mb-6">
          <PhoneOff className="w-7 h-7 text-[#9AA3B2]" />
        </div>
        <h1 className="text-3xl font-semibold tracking-tight mb-2">Call ended</h1>
        <p className="text-[#9AA3B2]">
          Your session lasted {formatDuration(elapsed)}. Thanks for talking with{' '}
          {AGENT_NAME}.
        </p>
      </div>

      {/* Full transcript record (scrolls inside its own panel) */}
      {hasTranscript && (
        <div className="w-full max-w-2xl mt-8 flex-1 min-h-0 rounded-2xl border border-white/10 bg-[#0E1117] flex flex-col">
          <div className="px-5 py-3 border-b border-white/10 shrink-0">
            <span className="text-xs tracking-[0.16em] text-[#9AA3B2] font-semibold">
              CALL TRANSCRIPT
            </span>
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto no-scrollbar px-5 py-4 space-y-4 text-left">
            <TranscriptLines transcript={transcript} />
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-3 mt-8 shrink-0">
        <Link
          to="/"
          className="rounded-xl border border-white/15 hover:bg-white/5 px-6 py-3 text-sm font-medium transition-colors"
        >
          Back to home
        </Link>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="rounded-xl bg-[#58C896] hover:bg-[#6BD6A6] text-[#0A0F0D] px-6 py-3 text-sm font-semibold transition-colors"
        >
          Start another call
        </button>
      </div>
    </motion.main>
  )
}
