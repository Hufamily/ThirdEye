import { useState } from 'react'
import { motion } from 'framer-motion'
import { ArrowRight, ArrowLeft } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'

const personaSchema = z.object({
  experience: z.enum(['beginner', 'intermediate', 'advanced', 'expert']),
  learningStyle: z.enum(['visual', 'auditory', 'reading', 'kinesthetic']),
  goals: z.array(z.string()).min(1, 'Select at least one goal'),
  timeCommitment: z.enum(['1-2h', '3-5h', '6-10h', '10h+']),
  preferredTopics: z.array(z.string()).optional(),
  challenges: z.array(z.string()).optional(),
})

type PersonaFormData = z.infer<typeof personaSchema>

interface PersonaSetupProps {
  onComplete: () => void
}

export function PersonaSetup({ onComplete }: PersonaSetupProps) {
  const [currentQuestion, setCurrentQuestion] = useState(0)
  const {
    handleSubmit,
    watch,
    setValue,
  } = useForm<PersonaFormData>({
    resolver: zodResolver(personaSchema),
    defaultValues: {
      goals: [],
      preferredTopics: [],
      challenges: [],
    },
  })

  const questions = [
    {
      id: 'experience',
      title: 'What is your experience level?',
      type: 'single',
      options: [
        { value: 'beginner', label: 'Beginner', description: 'Just starting out' },
        { value: 'intermediate', label: 'Intermediate', description: 'Some experience' },
        { value: 'advanced', label: 'Advanced', description: 'Comfortable with most concepts' },
        { value: 'expert', label: 'Expert', description: 'Deep expertise' },
      ],
    },
    {
      id: 'learningStyle',
      title: 'How do you learn best?',
      type: 'single',
      options: [
        { value: 'visual', label: 'Visual', description: 'Diagrams, charts, videos' },
        { value: 'auditory', label: 'Auditory', description: 'Listening, discussions' },
        { value: 'reading', label: 'Reading', description: 'Text, documentation' },
        { value: 'kinesthetic', label: 'Hands-on', description: 'Practice, experimentation' },
      ],
    },
    {
      id: 'goals',
      title: 'What are your learning goals?',
      type: 'multiple',
      options: [
        { value: 'master-fundamentals', label: 'Master Fundamentals' },
        { value: 'build-projects', label: 'Build Real Projects' },
        { value: 'advance-career', label: 'Advance Career' },
        { value: 'stay-updated', label: 'Stay Updated' },
        { value: 'solve-problems', label: 'Solve Complex Problems' },
      ],
    },
    {
      id: 'timeCommitment',
      title: 'How much time can you commit per week?',
      type: 'single',
      options: [
        { value: '1-2h', label: '1-2 hours' },
        { value: '3-5h', label: '3-5 hours' },
        { value: '6-10h', label: '6-10 hours' },
        { value: '10h+', label: '10+ hours' },
      ],
    },
  ]

  const selectedValues = watch()
  const currentQ = questions[currentQuestion]

  const handleNext = () => {
    if (currentQuestion < questions.length - 1) {
      setCurrentQuestion(currentQuestion + 1)
    } else {
      handleSubmit(onSubmit)()
    }
  }

  const handleBack = () => {
    if (currentQuestion > 0) {
      setCurrentQuestion(currentQuestion - 1)
    }
  }

  const onSubmit = (data: PersonaFormData) => {
    console.log('Persona data:', data)
    // Save persona data
    localStorage.setItem('persona', JSON.stringify(data))
    onComplete()
  }

  const toggleSelection = (value: string, isMultiple: boolean) => {
    if (isMultiple) {
      const current = selectedValues[currentQ.id as keyof PersonaFormData] as string[] || []
      if (current.includes(value)) {
        setValue(currentQ.id as keyof PersonaFormData, current.filter((v) => v !== value) as any)
      } else {
        setValue(currentQ.id as keyof PersonaFormData, [...current, value] as any)
      }
    } else {
      setValue(currentQ.id as keyof PersonaFormData, value as any)
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="min-h-screen flex items-center justify-center px-4 py-20"
    >
      <div className="max-w-2xl w-full">
        {/* Progress */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-muted-foreground">
              Question {currentQuestion + 1} of {questions.length}
            </span>
            <span className="text-sm text-muted-foreground">
              {Math.round(((currentQuestion + 1) / questions.length) * 100)}%
            </span>
          </div>
          <div className="h-2 bg-muted rounded-full overflow-hidden">
            <motion.div
              className="h-full bg-primary"
              initial={{ width: 0 }}
              animate={{ width: `${((currentQuestion + 1) / questions.length) * 100}%` }}
              transition={{ duration: 0.3 }}
            />
          </div>
        </div>

        {/* Question */}
        <div className="bg-muted/50 border border-border rounded-lg p-8 mb-6">
          <h2 className="text-2xl font-bold mb-6">{currentQ.title}</h2>
          <div className="space-y-3">
            {currentQ.options.map((option) => {
              const isSelected = currentQ.type === 'multiple'
                ? (selectedValues[currentQ.id as keyof PersonaFormData] as string[] || []).includes(option.value)
                : selectedValues[currentQ.id as keyof PersonaFormData] === option.value

              return (
                <button
                  key={option.value}
                  onClick={() => toggleSelection(option.value, currentQ.type === 'multiple')}
                  className={`
                    w-full p-4 text-left rounded-lg border transition-all
                    ${
                      isSelected
                        ? 'border-primary bg-primary/20'
                        : 'border-border bg-background hover:bg-muted'
                    }
                  `}
                >
                  <div className="font-medium">{option.label}</div>
                  {'description' in option && option.description && (
                    <div className="text-sm text-muted-foreground mt-1">
                      {option.description}
                    </div>
                  )}
                </button>
              )
            })}
          </div>
        </div>

        {/* Navigation */}
        <div className="flex items-center justify-between">
          <button
            onClick={handleBack}
            disabled={currentQuestion === 0}
            className="px-6 py-3 bg-muted hover:bg-muted/80 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            <ArrowLeft className="w-4 h-4" />
            Back
          </button>
          <button
            onClick={handleNext}
            className="px-6 py-3 bg-primary text-primary-foreground rounded-lg font-medium hover:bg-primary/90 transition-colors flex items-center gap-2"
          >
            {currentQuestion === questions.length - 1 ? 'Complete' : 'Next'}
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </motion.div>
  )
}
