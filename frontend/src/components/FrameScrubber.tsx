import { useEffect, useRef } from 'react'

/**
 * Image-sequence canvas scrubber (the Apple-product-page technique).
 *
 * Instead of seeking a <video> (which re-decodes from a keyframe on every
 * `currentTime` write — the cause of the jank), we pre-decode a numbered JPEG
 * sequence into Image objects and paint one to a <canvas> per frame. Painting a
 * decoded image is O(1), so scrubbing is smooth regardless of the source codec.
 *
 *  • Desktop (>= 1024px): cursor movement scrubs the sequence.
 *  • Mobile  (<  1024px): the sequence auto-plays at the source fps
 *                         (suppressed under prefers-reduced-motion).
 *
 * Smoothness comes from an rAF lerp that eases the drawn frame toward the
 * target (inertial motion, not 1:1 cursor jitter); the loop stops when settled
 * so it never burns CPU idle.
 *
 * All config props are optional — rendered bare (`<FrameScrubber />`) it plays
 * the 97-frame /frames/f_NNN.jpg sequence extracted from the original hero clip.
 */
interface FrameScrubberProps {
  /** Number of frames in the sequence (N). */
  frameCount?: number
  /** Source fps — drives the mobile auto-play cadence. */
  fps?: number
  /** Builds the URL for a 0-based frame index. Keep this referentially stable
   *  (define it at module scope) so the effect doesn't re-run each render. */
  frameUrl?: (index: number) => string
  className?: string
  /** Cover-fit anchor in [0,1]: 0 = left/top, 1 = right/bottom. Default bottom-right. */
  anchorX?: number
  anchorY?: number
}

// Default sequence: f_001.jpg … f_097.jpg in public/frames/, served at /frames/.
const DEFAULT_FRAME_COUNT = 97
const DEFAULT_FPS = 24
const defaultFrameUrl = (i: number) =>
  `/frames/f_${String(i + 1).padStart(3, '0')}.jpg`

export function FrameScrubber({
  frameCount: N = DEFAULT_FRAME_COUNT,
  fps = DEFAULT_FPS,
  frameUrl = defaultFrameUrl,
  className,
  anchorX = 1,
  anchorY = 1,
}: FrameScrubberProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // ── Scrub state ─────────────────────────────────────────────────────
    let target = 0 // desired frame index
    let current = 0 // eased index actually drawn
    let rafId = 0
    let running = false
    let mobileTimer: number | undefined

    const isDesktop = () => window.innerWidth >= 1024
    const prefersReducedMotion = () =>
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const dpr = () => Math.min(window.devicePixelRatio || 1, 2)

    // ── draw(idx): cover-fit a single decoded frame ─────────────────────
    const draw = (idx: number) => {
      const i = Math.max(0, Math.min(N - 1, Math.round(idx)))
      const img = images[i]
      // Not decoded yet → bail so the last good frame stays on screen.
      if (!img || !img.complete || img.naturalWidth === 0) return

      const cw = canvas.clientWidth
      const ch = canvas.clientHeight
      const iw = img.naturalWidth
      const ih = img.naturalHeight
      const scale = Math.max(cw / iw, ch / ih) // "cover"
      const w = iw * scale
      const h = ih * scale
      const x = (cw - w) * anchorX // anchorX=1 → flush right
      const y = (ch - h) * anchorY // anchorY=1 → flush bottom

      ctx.clearRect(0, 0, cw, ch)
      ctx.drawImage(img, x, y, w, h)
    }

    // ── DPR-crisp sizing (backing store in device px, draw in CSS px) ────
    const resize = () => {
      const ratio = dpr()
      canvas.width = Math.round(canvas.clientWidth * ratio)
      canvas.height = Math.round(canvas.clientHeight * ratio)
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0)
      draw(current)
    }

    // ── Preload all N frames ────────────────────────────────────────────
    const images: HTMLImageElement[] = new Array(N)
    for (let i = 0; i < N; i++) {
      const img = new Image()
      img.decoding = 'async'
      img.src = frameUrl(i)
      images[i] = img
    }
    // First paint as soon as frame 0 is ready (size + draw).
    if (images[0].complete && images[0].naturalWidth > 0) {
      resize()
    } else {
      images[0].onload = () => resize()
    }

    // ── rAF easing loop: ease `current` toward `target`, stop when settled ─
    const tick = () => {
      current += (target - current) * 0.18
      if (Math.abs(target - current) < 0.01) {
        current = target
        draw(current)
        running = false
        return // park the loop — no idle rAF
      }
      draw(current)
      rafId = requestAnimationFrame(tick)
    }
    const ensureRunning = () => {
      if (!running) {
        running = true
        rafId = requestAnimationFrame(tick)
      }
    }

    // ── Desktop input: cursor delta → target ────────────────────────────
    const onMouseMove = (e: MouseEvent) => {
      if (!isDesktop()) return
      target += (e.movementX / window.innerWidth) * 0.8 * N
      target = Math.max(0, Math.min(N - 1, target))
      ensureRunning()
    }

    // ── Mobile auto-play: advance one frame every 1000/fps ms ───────────
    const startMobile = () => {
      stopMobile()
      // Respect reduced-motion: show a single static frame, no autoplay loop
      // (a perpetual background animation is a WCAG 2.2.2 Pause/Stop/Hide issue).
      if (prefersReducedMotion()) {
        draw(0)
        return
      }
      mobileTimer = window.setInterval(() => {
        current = (current + 1) % N
        draw(current)
      }, 1000 / fps)
    }
    const stopMobile = () => {
      if (mobileTimer !== undefined) {
        clearInterval(mobileTimer)
        mobileTimer = undefined
      }
    }

    // Pick the input mode for the current viewport.
    const applyMode = () => (isDesktop() ? stopMobile() : startMobile())

    const onResize = () => {
      resize()
      applyMode()
    }

    resize()
    applyMode()
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('resize', onResize)

    // ── Cleanup ─────────────────────────────────────────────────────────
    return () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('resize', onResize)
      cancelAnimationFrame(rafId)
      stopMobile()
    }
  }, [N, fps, frameUrl, anchorX, anchorY])

  return <canvas ref={canvasRef} className={className} aria-hidden="true" />
}

export default FrameScrubber
