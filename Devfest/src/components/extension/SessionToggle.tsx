import { Play, Square } from 'lucide-react'
import { useSessionStore } from '../../store/useStore'
import { motion } from 'framer-motion'

export function SessionToggle() {
  const { isActive, startSession, stopSession } = useSessionStore()

  return (
    <motion.button
      onClick={isActive ? stopSession : startSession}
      className={`
        w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg
        font-medium text-sm transition-all
        ${
          isActive
            ? 'bg-red-500/20 text-red-400 border border-red-500/50 hover:bg-red-500/30'
            : 'bg-primary text-primary-foreground hover:bg-primary/90'
        }
      `}
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
    >
      {isActive ? (
        <>
          <Square className="w-4 h-4" />
          Stop Session
        </>
      ) : (
        <>
          <Play className="w-4 h-4" />
          Start Session
        </>
      )}
    </motion.button>
  )
}
