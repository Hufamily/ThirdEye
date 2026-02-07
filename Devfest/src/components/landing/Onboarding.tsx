import { motion } from 'framer-motion'
import { CheckCircle, ArrowRight } from 'lucide-react'
import { useState } from 'react'

interface OnboardingProps {
  onComplete: () => void
}

export function Onboarding({ onComplete }: OnboardingProps) {
  const [currentSlide, setCurrentSlide] = useState(0)

  const slides = [
    {
      title: 'Welcome to Devfest!',
      description: 'Your AI-powered learning assistant is ready to help you learn more effectively.',
      features: [
        'Track your learning in real-time',
        'Get instant explanations',
        'Build your knowledge base',
      ],
    },
    {
      title: 'How It Works',
      description: 'Devfest monitors your browsing and provides contextual learning assistance.',
      features: [
        'Browse documentation and tutorials',
        'Get AI-powered explanations',
        'Save concepts to your notebook',
      ],
    },
    {
      title: 'You\'re All Set!',
      description: 'Start learning and let Devfest help you build knowledge that sticks.',
      features: [
        'Click the extension icon to get started',
        'Visit your personal dashboard',
        'Explore enterprise features',
      ],
    },
  ]

  const handleNext = () => {
    if (currentSlide < slides.length - 1) {
      setCurrentSlide(currentSlide + 1)
    } else {
      onComplete()
    }
  }

  const handleSkip = () => {
    onComplete()
  }

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="min-h-screen flex items-center justify-center px-4 py-20"
    >
      <div className="max-w-2xl w-full">
        {/* Progress Dots */}
        <div className="flex items-center justify-center gap-2 mb-12">
          {slides.map((_, index) => (
            <div
              key={index}
              className={`
                w-2 h-2 rounded-full transition-all
                ${index === currentSlide ? 'w-8 bg-primary' : 'bg-muted'}
              `}
            />
          ))}
        </div>

        {/* Slide Content */}
        <motion.div
          key={currentSlide}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-12"
        >
          <div className="mb-8">
            <div className="w-20 h-20 bg-primary/20 rounded-full flex items-center justify-center mx-auto mb-6">
              <CheckCircle className="w-10 h-10 text-primary" />
            </div>
            <h2 className="text-3xl font-bold mb-4">{slides[currentSlide].title}</h2>
            <p className="text-lg text-muted-foreground mb-8">
              {slides[currentSlide].description}
            </p>
          </div>

          <div className="space-y-4">
            {slides[currentSlide].features.map((feature, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.1 }}
                className="flex items-center gap-3 p-4 bg-muted/50 border border-border rounded-lg text-left"
              >
                <CheckCircle className="w-5 h-5 text-primary flex-shrink-0" />
                <span>{feature}</span>
              </motion.div>
            ))}
          </div>
        </motion.div>

        {/* Navigation */}
        <div className="flex items-center justify-between">
          <button
            onClick={handleSkip}
            className="px-6 py-3 text-muted-foreground hover:text-foreground transition-colors"
          >
            Skip
          </button>
          <button
            onClick={handleNext}
            className="px-6 py-3 bg-primary text-primary-foreground rounded-lg font-medium hover:bg-primary/90 transition-colors flex items-center gap-2"
          >
            {currentSlide === slides.length - 1 ? 'Get Started' : 'Next'}
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </motion.div>
  )
}
