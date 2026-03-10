import { useEffect, useRef } from 'react'

export interface Controls {
  forward: boolean   // W — walk forward
  backward: boolean  // S — walk backward
  left: boolean      // A — rotate left
  right: boolean     // D — rotate right
  jump: boolean      // Space — jump
  attack: boolean    // J / Z — attack
  fireGun: boolean   // E — fire right-arm weapon
  fireLaser: boolean // Q — fire left-arm weapon
}

/**
 * Tracks WASD + Space input as a mutable ref rather than React state.
 *
 * Why a ref and not useState: the game loop reads controls every frame
 * (60 fps). Storing them in state would schedule a re-render on every
 * keydown/keyup, flooding React's reconciler. The ref gives the frame
 * loop direct, synchronous access with zero render overhead.
 *
 * Arrow keys are intentionally excluded — they are consumed by CameraController.
 */
export function useControls(): React.RefObject<Controls> {
  const controls = useRef<Controls>({
    forward: false,
    backward: false,
    left: false,
    right: false,
    jump: false,
    attack: false,
    fireGun: false,
    fireLaser: false,
  })

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space') e.preventDefault()
      switch (e.code) {
        case 'KeyW': controls.current.forward  = true;  break
        case 'KeyS': controls.current.backward = true;  break
        case 'KeyA': controls.current.left     = true;  break
        case 'KeyD': controls.current.right    = true;  break
        case 'Space': controls.current.jump    = true;  break
        case 'KeyJ':
        case 'KeyZ': controls.current.attack     = true;  break
        case 'KeyE': controls.current.fireGun    = true;  break
        case 'KeyQ': controls.current.fireLaser  = true;  break
      }
    }

    const onKeyUp = (e: KeyboardEvent) => {
      switch (e.code) {
        case 'KeyW': controls.current.forward    = false; break
        case 'KeyS': controls.current.backward   = false; break
        case 'KeyA': controls.current.left       = false; break
        case 'KeyD': controls.current.right      = false; break
        case 'Space': controls.current.jump      = false; break
        case 'KeyJ':
        case 'KeyZ': controls.current.attack     = false; break
        case 'KeyE': controls.current.fireGun    = false; break
        case 'KeyQ': controls.current.fireLaser  = false; break
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
