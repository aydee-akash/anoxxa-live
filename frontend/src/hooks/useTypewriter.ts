import { useEffect, useState } from 'react'

export interface TypewriterState {
  displayed: string
  done: boolean
}

/**
 * Iteratively builds `text` slice-by-slice for a typewriter effect.
 * Starts after `startDelay` ms, then reveals one character every `speed` ms.
 */
export function useTypewriter(
  text: string,
  speed = 38,
  startDelay = 600,
): TypewriterState {
  const [displayed, setDisplayed] = useState('')
  const [done, setDone] = useState(false)

  useEffect(() => {
    setDisplayed('')
    setDone(false)

    let interval: ReturnType<typeof setInterval>
    const startTimer = setTimeout(() => {
      let i = 0
      interval = setInterval(() => {
        i += 1
        setDisplayed(text.slice(0, i))
        if (i >= text.length) {
          clearInterval(interval)
          setDone(true)
        }
      }, speed)
    }, startDelay)

    return () => {
      clearTimeout(startTimer)
      clearInterval(interval)
    }
  }, [text, speed, startDelay])

  return { displayed, done }
}
