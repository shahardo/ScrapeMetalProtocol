import { useEffect, useRef } from 'react'

export interface Controls {
  left: boolean
  right: boolean
  jump: boolean
  attack: boolean
}

/**
 * Tracks WASD + Space robot input as a mutable ref rather than React state.
 *
 * Why a ref and not useState: the game loop reads controls every frame
 * (60 fps). Storing them in state would schedule a re-render on every
 * keydown/keyup, flooding React's reconciler. The ref gives the frame
 * loop direct, synchronous access with zero render overhead.
 *
 * Arrow keys are intentionally excluded — they are consumed by CameraController
 * for POV rotation and must not also trigger robot movement.
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
      if (e.code === 'Space') e.preventDefault()

      switch (e.code) {
        case 'KeyA':
          controls.current.left = true
          break
        case 'KeyD':
          controls.current.right = true
          break
        case 'KeyW':
        case 'Space':
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
        case 'KeyA':
          controls.current.left = false
          break
        case 'KeyD':
          controls.current.right = false
          break
        case 'KeyW':
        case 'Space':
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
