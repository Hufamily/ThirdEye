import { useState, useEffect } from 'react'
import { X } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'

export interface Toast {
  id: string
  message: string
  type: 'success' | 'error' | 'info' | 'warning'
}

let toastId = 0
const toasts: Toast[] = []
const listeners: Array<() => void> = []

export const toast = {
  success: (message: string) => addToast(message, 'success'),
  error: (message: string) => addToast(message, 'error'),
  info: (message: string) => addToast(message, 'info'),
  warning: (message: string) => addToast(message, 'warning'),
}

function addToast(message: string, type: Toast['type']) {
  const id = `toast-${toastId++}`
  toasts.push({ id, message, type })
  listeners.forEach((listener) => listener())
  
  setTimeout(() => {
    removeToast(id)
  }, 5000)
}

function removeToast(id: string) {
  const index = toasts.findIndex((t) => t.id === id)
  if (index > -1) {
    toasts.splice(index, 1)
    listeners.forEach((listener) => listener())
  }
}

export function Toaster() {
  const [localToasts, setLocalToasts] = useState<Toast[]>([])

  useEffect(() => {
    const update = () => setLocalToasts([...toasts])
    listeners.push(update)
    update()
    return () => {
      const index = listeners.indexOf(update)
      if (index > -1) listeners.splice(index, 1)
    }
  }, [])

  return (
    <div className="fixed top-4 right-4 z-50 flex flex-col gap-2">
      <AnimatePresence>
        {localToasts.map((toast) => (
          <motion.div
            key={toast.id}
            initial={{ opacity: 0, y: -20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className={`
              flex items-center gap-3 px-4 py-3 rounded-lg shadow-lg min-w-[300px]
              ${
                toast.type === 'success'
                  ? 'bg-green-500/20 border border-green-500/50 text-green-400'
                  : toast.type === 'error'
                  ? 'bg-red-500/20 border border-red-500/50 text-red-400'
                  : toast.type === 'warning'
                  ? 'bg-yellow-500/20 border border-yellow-500/50 text-yellow-400'
                  : 'bg-blue-500/20 border border-blue-500/50 text-blue-400'
              }
            `}
          >
            <span className="flex-1 text-sm font-medium">{toast.message}</span>
            <button
              onClick={() => removeToast(toast.id)}
              className="hover:opacity-70 transition-opacity"
            >
              <X className="w-4 h-4" />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  )
}
