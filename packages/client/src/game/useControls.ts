import { useEffect, useRef } from 'react'

export interface Controls {
  left: boolean
  right: boolean
  jump: boolean
  attack: boolean
}

/**
 * Tracks raw keyboard input as a mutable ref rather than React state.
 *
 * Why a ref and not useState: the game loop reads controls every frame
 * (60 fps). Storing them in state would schedule a re-render on every
 * keydown/keyup, flooding React's reconciler. The ref gives the frame
 * loop direct, synchronous access with zero render overhead.
 */
export function useControls(): React.RefObject<Controls> {
  const controls = useRef<Controls>({
    left: false,
    right: false,
    jump: false,
    attack: false,
  })

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      // Prevent space from scrolling the page while playing
      if (e.code === 'Space') e.preventDefault()

      switch (e.code) {
        case 'ArrowLeft':
        case 'KeyA':
          controls.current.left = true
          break
        case 'ArrowRight':
        case 'KeyD':
          controls.current.right = true
          break
        case 'Space':
        case 'ArrowUp':
        case 'KeyW':
          controls.current.jump = true
          break
        case 'KeyJ':
        case 'KeyZ':
          controls.current.attack = true
          break
      }
    }

    const onKeyUp = (e: KeyboardEvent) => {
      switch (e.code) {
        case 'ArrowLeft':
        case 'KeyA':
          controls.current.left = false
          break
        case 'ArrowRight':
        case 'KeyD':
          controls.current.right = false
          break
        case 'Space':
        case 'ArrowUp':
        case 'KeyW':
          controls.current.jump = false
          break
        case 'KeyJ':
        case 'KeyZ':
          controls.current.attack = false
          break
      }
    }

    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
    }
  }, [])

  return controls
}
