import { useNavigate } from 'react-router-dom'
import { motion, useScroll, useTransform } from 'framer-motion'
import { ArrowRight, Sparkles, Zap, Brain, Search, BookOpen, Download } from 'lucide-react'
import { useRef, useEffect, useState } from 'react'
import { Navigation } from '../components/ui/Navigation'
import { LoginModal } from '../components/auth/LoginModal'
import logoImage from '../assets/logo.png'

declare global {
  interface Window {
    VANTA: {
      GLOBE: (options: {
        el: string | HTMLElement
        mouseControls?: boolean
        touchControls?: boolean
        gyroControls?: boolean
        minHeight?: number
        minWidth?: number
        scale?: number
        scaleMobile?: number
        color?: number
        color2?: number
        size?: number
        backgroundColor?: number
      }) => {
        destroy: () => void
      }
    }
  }
}

export default function LandingPage() {
  const navigate = useNavigate()
  const containerRef = useRef<HTMLDivElement>(null)
  const vantaRef = useRef<HTMLDivElement>(null)
  const vantaEffect = useRef<any>(null)
  const [loginModalOpen, setLoginModalOpen] = useState(false)
  const [loginAccountType, setLoginAccountType] = useState<'personal' | 'enterprise' | undefined>()
  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ['start start', 'end end'],
  })

  const opacity = useTransform(scrollYProgress, [0, 0.2], [1, 0])
  const y = useTransform(scrollYProgress, [0, 0.2], [0, -50])

  const handlePersonalLogin = () => {
    setLoginAccountType('personal')
    setLoginModalOpen(true)
  }

  const handleEnterpriseLogin = () => {
    setLoginAccountType('enterprise')
    setLoginModalOpen(true)
  }

  useEffect(() => {
    if (vantaRef.current && window.VANTA) {
      vantaEffect.current = window.VANTA.GLOBE({
        el: vantaRef.current,
        mouseControls: true,
        touchControls: true,
        gyroControls: false,
        minHeight: 200.0,
        minWidth: 200.0,
        scale: 1.0,
        scaleMobile: 1.0,
        color: 0x6e6e6e,
        color2: 0x282626,
        size: 2.0,
        backgroundColor: 0x201f20,
      })
    }

    return () => {
      if (vantaEffect.current) {
        vantaEffect.current.destroy()
      }
    }
  }, [])

  return (
    <div ref={containerRef} className="min-h-screen bg-background overflow-x-hidden relative">
      <Navigation />
      {/* Vanta Globe Background - Extends across all sections */}
      <div ref={vantaRef} className="fixed inset-0 w-full h-full z-0" />
      
      {/* Hero Section */}
      <div className="h-screen flex items-center justify-center px-4 relative pt-24 z-10">
        <motion.div
          style={{ opacity, y }}
          className="max-w-5xl mx-auto text-center relative z-10"
        >
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
            className="mb-8"
          >
            <div className="flex flex-col items-center justify-center gap-4 mb-6">
              <img 
                src={logoImage} 
                alt="Third Eye Logo" 
                className="h-24 w-24 md:h-32 md:w-32 object-contain"
              />
              <h1 className="text-6xl md:text-8xl font-bold bg-gradient-to-r from-primary via-white to-primary bg-clip-text text-transparent">
                Third Eye
              </h1>
            </div>
            <p className="text-2xl md:text-4xl font-medium text-foreground mb-6 leading-tight">
              An intelligent agent that lives within your browser
            </p>
            <p className="text-lg md:text-xl text-muted-foreground max-w-3xl mx-auto leading-relaxed">
              A high-performance AI Learning & Enterprise OS that utilizes cutting-edge gaze tracking
              and agentic workflows to eliminate context-switching. Understands every interaction,
              provides clarity and full understanding of your text without ever leaving your screen.
            </p>
          </motion.div>
        </motion.div>
      </div>

      {/* Scrollable Interactive Sections */}
      <div className="relative z-10">
        {/* Section 1: Understanding */}
        <section className="h-screen flex items-center justify-center px-4 sticky top-0 -mt-[50vh] pt-[50vh]">
          <motion.div
            initial={{ opacity: 0, x: -100 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: false, amount: 0.3 }}
            transition={{ duration: 0.8 }}
            className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-12 items-center"
          >
            <div>
              <div className="inline-flex items-center gap-2 px-4 py-2 bg-muted/50 rounded-full mb-6">
                <Brain className="w-5 h-5 text-primary" />
                <span className="text-sm font-medium">CVOps - Intent Trigger System</span>
              </div>
              <h2 className="text-4xl md:text-5xl font-bold mb-6">
                Zero-friction learning through gaze
              </h2>
              <p className="text-xl text-muted-foreground leading-relaxed mb-4">
                Third Eye operates on a deterministic "Intent Trigger" instead of passive inference.
                When your gaze remains stable within a 45px radius for 2 seconds, the system locks
                onto your target. A double blink within 1.2 seconds confirms your intent to learn,
                triggering the AI instantly.
              </p>
              <p className="text-lg text-muted-foreground/80 leading-relaxed">
                This allows you to learn everything on your page without touching your screen or
                leaving the current tab—true zero-friction interaction.
              </p>
            </div>
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: false, amount: 0.3 }}
              transition={{ duration: 0.8, delay: 0.2 }}
              className="relative"
            >
              <div className="p-8 bg-muted/30 rounded-2xl border border-border backdrop-blur-sm">
                <div className="space-y-4">
                  {[1, 2, 3].map((i) => (
                    <motion.div
                      key={i}
                      initial={{ x: -20, opacity: 0 }}
                      whileInView={{ x: 0, opacity: 1 }}
                      viewport={{ once: false }}
                      transition={{ delay: i * 0.1 }}
                      className="p-4 bg-background/50 rounded-lg border border-border"
                    >
                      <div className="h-4 bg-primary/20 rounded w-3/4 mb-2" />
                      <div className="h-3 bg-muted-foreground/20 rounded w-1/2" />
                    </motion.div>
                  ))}
                </div>
              </div>
            </motion.div>
          </motion.div>
        </section>

        {/* Section 2: Clarity */}
        <section className="h-screen flex items-center justify-center px-4 sticky top-0 -mt-[50vh] pt-[50vh]">
          <motion.div
            initial={{ opacity: 0, x: 100 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: false, amount: 0.3 }}
            transition={{ duration: 0.8 }}
            className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-12 items-center"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: false, amount: 0.3 }}
              transition={{ duration: 0.8 }}
              className="relative order-2 lg:order-1"
            >
              <div className="p-8 bg-muted/30 rounded-2xl border border-border backdrop-blur-sm">
                <div className="flex items-center gap-4 mb-6">
                  <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center">
                    <Search className="w-6 h-6 text-primary" />
                  </div>
                  <div className="flex-1">
                    <div className="h-4 bg-primary/20 rounded w-full mb-2" />
                    <div className="h-3 bg-muted-foreground/20 rounded w-2/3" />
                  </div>
                </div>
                <div className="space-y-3">
                  <div className="h-3 bg-muted-foreground/10 rounded w-full" />
                  <div className="h-3 bg-muted-foreground/10 rounded w-5/6" />
                  <div className="h-3 bg-muted-foreground/10 rounded w-4/6" />
                </div>
              </div>
            </motion.div>
            <div className="order-1 lg:order-2">
              <div className="inline-flex items-center gap-2 px-4 py-2 bg-muted/50 rounded-full mb-6">
                <Sparkles className="w-5 h-5 text-primary" />
                <span className="text-sm font-medium">Multi-Agent Pipeline</span>
              </div>
              <h2 className="text-4xl md:text-5xl font-bold mb-6">
                Powered by intelligent agents
              </h2>
              <p className="text-xl text-muted-foreground leading-relaxed mb-4">
                A sophisticated 6-agent pipeline processes every trigger: Router, Capture, Interpreter,
                Hypothesis, Composer, and Logger work together to provide instant clarity and understanding.
              </p>
              <p className="text-lg text-muted-foreground/80 leading-relaxed">
                Our extensible scraper uses a staged "Escalation Ladder" (Visible → Outline → Full Text)
                to maintain privacy and performance, only accessing what's necessary.
              </p>
            </div>
          </motion.div>
        </section>

        {/* Section 3: Seamless */}
        <section className="h-screen flex items-center justify-center px-4 sticky top-0">
          <motion.div
            initial={{ opacity: 0, y: 50 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: false, amount: 0.3 }}
            transition={{ duration: 0.8 }}
            className="max-w-6xl mx-auto text-center"
          >
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-muted/50 rounded-full mb-6">
              <Zap className="w-5 h-5 text-primary" />
              <span className="text-sm font-medium">Two Powerful Layers</span>
            </div>
            <h2 className="text-4xl md:text-5xl font-bold mb-6">
              Personal OS & Enterprise Engine
            </h2>
            <p className="text-xl text-muted-foreground max-w-3xl mx-auto leading-relaxed mb-12">
              Third Eye operates on two integrated layers: Your personal "Learning OS" and the
              enterprise "Clarity Engine" for organizations.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-5xl mx-auto">
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: false }}
                transition={{ delay: 0.1 }}
                className="p-8 bg-muted/30 rounded-xl border border-border"
              >
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center">
                    <BookOpen className="w-6 h-6 text-primary" />
                  </div>
                  <h3 className="text-2xl font-bold">My Learning OS</h3>
                </div>
                <p className="text-muted-foreground mb-4">
                  Your durable, searchable memory base with a 3-panel dashboard:
                </p>
                <ul className="space-y-2 text-sm text-muted-foreground/80 mb-4">
                  <li>• Session Timeline for tracking your journey</li>
                  <li>• Notion-like Editor for rich notes</li>
                  <li>• Notebook for granular trigger entries</li>
                </ul>
                <div className="pt-4 border-t border-border">
                  <p className="text-sm font-medium mb-1">Time Saved Metrics</p>
                  <p className="text-xs text-muted-foreground">
                    Compares our 2-second speed against the 7-second average of traditional searching
                  </p>
                </div>
                <div className="pt-4 border-t border-border mt-4">
                  <p className="text-sm font-medium mb-1">Auto-Built Persona</p>
                  <p className="text-xs text-muted-foreground">
                    Evolves automatically from your interactions, document domains, and gap labels
                  </p>
                </div>
              </motion.div>
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: false }}
                transition={{ delay: 0.2 }}
                className="p-8 bg-muted/30 rounded-xl border border-border"
              >
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center">
                    <Search className="w-6 h-6 text-primary" />
                  </div>
                  <h3 className="text-2xl font-bold">Clarity Analytics</h3>
                </div>
                <p className="text-muted-foreground mb-4">
                  Helps organizations identify where their documentation is failing:
                </p>
                <ul className="space-y-2 text-sm text-muted-foreground/80 mb-4">
                  <li>• Deterministic Gating: Enterprise content from Google Shared Drives, Enterprise Folders, or Approved Domains</li>
                  <li>• Hotspot Detection: Identifies gaps where 5+ users or 12+ events occur</li>
                  <li>• Agentic Rewrites: AI-generated suggestions for confusing sections</li>
                </ul>
                <div className="pt-4 border-t border-border">
                  <p className="text-sm font-medium mb-1">Hybrid Storage</p>
                  <p className="text-xs text-muted-foreground">
                    Transactional data in Postgres, anonymized enterprise telemetry in Snowflake
                  </p>
                </div>
              </motion.div>
            </div>
          </motion.div>
        </section>

        {/* Section 4: CTA Buttons */}
        <section className="h-screen flex items-center justify-center px-4 sticky top-0 -mt-[50vh] pt-[50vh] pb-[10vh]">
          <motion.div
            initial={{ opacity: 0, y: 50 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: false, amount: 0.3 }}
            transition={{ duration: 0.8 }}
            className="max-w-4xl mx-auto text-center"
          >
            <h2 className="text-4xl md:text-6xl font-bold mb-6">
              Ready to get started?
            </h2>
            <p className="text-xl text-muted-foreground mb-12 max-w-2xl mx-auto">
              Choose your account type and begin your journey with Third Eye
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => {
                  window.open('https://chrome.google.com/webstore', '_blank')
                }}
                className="px-8 py-4 bg-primary text-primary-foreground rounded-lg font-semibold hover:bg-primary/90 transition-all flex items-center gap-2 group w-full sm:w-auto"
              >
                <Download className="w-5 h-5" />
                Download Extension
              </motion.button>
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={handlePersonalLogin}
                className="px-8 py-4 bg-muted hover:bg-muted/80 rounded-lg font-semibold transition-colors flex items-center gap-2 group w-full sm:w-auto"
              >
                Login to Personal Account
                <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </motion.button>
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={handleEnterpriseLogin}
                className="px-8 py-4 bg-muted hover:bg-muted/80 rounded-lg font-semibold transition-colors w-full sm:w-auto"
              >
                Login to Enterprise Account
              </motion.button>
            </div>
          </motion.div>
        </section>
      </div>

      {/* Footer */}
      <div className="border-t border-border py-6 px-4">
        <div className="max-w-4xl mx-auto text-center text-sm text-muted-foreground">
          <p>© 2026 Third Eye. Built with AI for better understanding.</p>
        </div>
      </div>

      {/* Login Modal */}
      <LoginModal
        isOpen={loginModalOpen}
        onClose={() => setLoginModalOpen(false)}
        initialAccountType={loginAccountType}
      />
    </div>
  )
}
