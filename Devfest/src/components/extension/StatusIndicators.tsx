import { Eye, Video, Circle } from 'lucide-react'
import { useSessionStore } from '../../store/useStore'

export function StatusIndicators() {
  const { isGazeTracking, hasWebcamAccess, isActive } = useSessionStore()

  return (
    <div className="flex items-center gap-2">
      <div className="relative" title="Gaze Tracking">
        <Eye
          className={`w-4 h-4 ${
            isGazeTracking ? 'text-green-400' : 'text-muted-foreground'
          }`}
        />
        {isGazeTracking && (
          <Circle className="absolute -top-1 -right-1 w-2 h-2 text-green-400 fill-green-400" />
        )}
      </div>
      <div className="relative" title="Webcam Access">
        <Video
          className={`w-4 h-4 ${
            hasWebcamAccess ? 'text-green-400' : 'text-muted-foreground'
          }`}
        />
        {hasWebcamAccess && (
          <Circle className="absolute -top-1 -right-1 w-2 h-2 text-green-400 fill-green-400" />
        )}
      </div>
      <div className="relative" title="Session Status">
        <Circle
          className={`w-3 h-3 ${
            isActive ? 'text-green-400 fill-green-400' : 'text-muted-foreground'
          }`}
        />
      </div>
    </div>
  )
}
