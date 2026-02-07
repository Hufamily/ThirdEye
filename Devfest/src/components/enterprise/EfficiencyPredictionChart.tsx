import { useState, useEffect, useRef } from 'react'
import { TrendingUp, Target } from 'lucide-react'
import { motion } from 'framer-motion'

interface EfficiencyDataPoint {
  date: string
  actual: number
  predicted?: number
}

interface EfficiencyPredictionChartProps {
  data: EfficiencyDataPoint[]
  currentEfficiency: number
  predictedEfficiency: number
  timeframe: string // e.g., "30 days", "90 days"
}

export function EfficiencyPredictionChart({
  data,
  currentEfficiency,
  predictedEfficiency,
  timeframe,
}: EfficiencyPredictionChartProps) {
  const svgRef = useRef<SVGSVGElement>(null)
  const [dimensions, setDimensions] = useState({ width: 800, height: 300 })

  useEffect(() => {
    const updateDimensions = () => {
      if (svgRef.current) {
        const rect = svgRef.current.getBoundingClientRect()
        setDimensions({ width: rect.width || 800, height: 300 })
      }
    }

    updateDimensions()
    window.addEventListener('resize', updateDimensions)
    return () => window.removeEventListener('resize', updateDimensions)
  }, [])

  // Calculate min and max for scaling
  const allValues = data.flatMap((d) => [d.actual, d.predicted || 0]).filter((v) => v > 0)
  const minValue = Math.min(...allValues) * 0.95 // Add some padding
  const maxValue = Math.max(...allValues) * 1.05
  const range = maxValue - minValue || 1

  // Chart dimensions - compact version with space for axes
  const chartHeight = 180
  const leftPadding = 55 // Increased space for Y-axis labels and title
  const rightPadding = 15
  const topPadding = 10
  const bottomPadding = 40 // Increased space for X-axis labels and title
  const svgWidth = dimensions.width
  const svgHeight = chartHeight + topPadding + bottomPadding
  const chartAreaHeight = chartHeight - topPadding - bottomPadding
  const chartAreaWidth = svgWidth - leftPadding - rightPadding

  const getYPosition = (value: number) => {
    const normalized = (value - minValue) / range
    return topPadding + chartAreaHeight - normalized * chartAreaHeight
  }

  const getXPosition = (index: number, total: number) => {
    return leftPadding + (index / (total - 1 || 1)) * chartAreaWidth
  }

  // Generate path for actual data
  const actualPath = data
    .map((point, index) => {
      const x = getXPosition(index, data.length)
      const y = getYPosition(point.actual)
      return `${index === 0 ? 'M' : 'L'} ${x} ${y}`
    })
    .join(' ')

  // Generate path for predicted data (only for points with predictions)
  const predictedPoints = data.filter((d) => d.predicted !== undefined)
  const predictedPath =
    predictedPoints.length > 0
      ? predictedPoints
          .map((point, index) => {
            const originalIndex = data.findIndex((d) => d === point)
            const x = getXPosition(originalIndex, data.length)
            const y = getYPosition(point.predicted!)
            return `${index === 0 ? 'M' : 'L'} ${x} ${y}`
          })
          .join(' ')
      : ''

  const improvement = predictedEfficiency - currentEfficiency
  const improvementPercent = ((improvement / currentEfficiency) * 100).toFixed(1)

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="p-4 bg-muted/50 rounded-lg border border-border"
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="p-1.5 bg-primary/20 rounded-lg">
            <TrendingUp className="w-4 h-4 text-primary" />
          </div>
          <div>
            <h3 className="text-xs font-medium text-muted-foreground">Efficiency Prediction</h3>
          </div>
        </div>
        <div className="text-right">
          <div className="text-lg font-bold text-primary">{predictedEfficiency.toFixed(1)}%</div>
          <div className="text-xs text-green-500 flex items-center gap-1">
            <Target className="w-3 h-3" />
            +{improvementPercent}%
          </div>
        </div>
      </div>

      {/* Chart */}
      <div className="relative w-full" style={{ height: svgHeight }}>
        <svg
          ref={svgRef}
          width="100%"
          height={svgHeight}
          className="overflow-visible"
          viewBox={`0 0 ${svgWidth} ${svgHeight}`}
          preserveAspectRatio="xMidYMid meet"
        >
          {/* Y-Axis line */}
          <line
            x1={leftPadding}
            y1={topPadding}
            x2={leftPadding}
            y2={topPadding + chartAreaHeight}
            stroke="currentColor"
            strokeWidth="1.5"
            strokeOpacity={0.3}
          />

          {/* X-Axis line */}
          <line
            x1={leftPadding}
            y1={topPadding + chartAreaHeight}
            x2={leftPadding + chartAreaWidth}
            y2={topPadding + chartAreaHeight}
            stroke="currentColor"
            strokeWidth="1.5"
            strokeOpacity={0.3}
          />

          {/* Y-Axis labels */}
          {[0, 25, 50, 75, 100].map((percent) => {
            const value = minValue + (range * percent) / 100
            const y = getYPosition(value)
            return (
              <g key={percent}>
                {/* Grid line */}
                <line
                  x1={leftPadding}
                  y1={y}
                  x2={leftPadding + chartAreaWidth}
                  y2={y}
                  stroke="currentColor"
                  strokeOpacity={0.1}
                  strokeWidth={0.5}
                />
                {/* Y-axis label */}
                <text
                  x={leftPadding - 12}
                  y={y + 4}
                  fontSize="10"
                  fill="currentColor"
                  opacity={0.7}
                  textAnchor="end"
                  className="font-medium"
                >
                  {value.toFixed(1)}%
                </text>
                {/* Tick mark */}
                <line
                  x1={leftPadding}
                  y1={y}
                  x2={leftPadding - 5}
                  y2={y}
                  stroke="currentColor"
                  strokeWidth="1"
                  strokeOpacity={0.4}
                />
              </g>
            )
          })}

          {/* X-Axis labels */}
          {data.map((point, index) => {
            const x = getXPosition(index, data.length)
            // Show every other label or first/last to avoid crowding
            const shouldShowLabel =
              index === 0 ||
              index === data.length - 1 ||
              index % Math.ceil(data.length / 4) === 0
            return (
              <g key={`x-label-${index}`}>
                {shouldShowLabel && (
                  <>
                    <text
                      x={x}
                      y={topPadding + chartAreaHeight + 20}
                      fontSize="9"
                      fill="currentColor"
                      opacity={0.7}
                      textAnchor="middle"
                      className="font-medium"
                    >
                      {point.date}
                    </text>
                    {/* Tick mark */}
                    <line
                      x1={x}
                      y1={topPadding + chartAreaHeight}
                      x2={x}
                      y2={topPadding + chartAreaHeight + 5}
                      stroke="currentColor"
                      strokeWidth="1"
                      strokeOpacity={0.4}
                    />
                  </>
                )}
              </g>
            )
          })}

          {/* Y-Axis title - positioned further left to avoid overlap */}
          <text
            x={8}
            y={topPadding + chartAreaHeight / 2}
            fontSize="10"
            fill="currentColor"
            opacity={0.7}
            textAnchor="middle"
            className="font-semibold"
            transform={`rotate(-90, 8, ${topPadding + chartAreaHeight / 2})`}
          >
            Efficiency (%)
          </text>

          {/* X-Axis title */}
          <text
            x={leftPadding + chartAreaWidth / 2}
            y={svgHeight - 8}
            fontSize="10"
            fill="currentColor"
            opacity={0.7}
            textAnchor="middle"
            className="font-semibold"
          >
            Time Period
          </text>

          {/* Actual data line */}
          <path
            d={data
              .filter((d) => d.actual > 0)
              .map((point, index, filteredArray) => {
                const originalIndex = data.indexOf(point)
                const x = getXPosition(originalIndex, data.length)
                const y = getYPosition(point.actual)
                return `${index === 0 ? 'M' : 'L'} ${x} ${y}`
              })
              .join(' ')}
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeOpacity={0.8}
            className="text-primary"
          />

          {/* Predicted data line (dashed) */}
          {predictedPath && (
            <path
              d={predictedPath}
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeDasharray="6 4"
              className="text-green-500"
            />
          )}

          {/* Data points - smaller for compact view */}
          {data.map((point, index) => {
            const x = getXPosition(index, data.length)
            return (
              <g key={index}>
                {point.actual > 0 && (
                  <circle
                    cx={x}
                    cy={getYPosition(point.actual)}
                    r="3"
                    fill="currentColor"
                    className="text-primary"
                  />
                )}
                {point.predicted !== undefined && (
                  <circle
                    cx={x}
                    cy={getYPosition(point.predicted)}
                    r="3"
                    fill="currentColor"
                    className="text-green-500"
                  />
                )}
              </g>
            )
          })}

          {/* Current efficiency marker */}
          <line
            x1={leftPadding}
            y1={getYPosition(currentEfficiency)}
            x2={leftPadding + chartAreaWidth}
            y2={getYPosition(currentEfficiency)}
            stroke="currentColor"
            strokeWidth="1.5"
            strokeDasharray="4 4"
            className="text-yellow-500"
            opacity={0.6}
          />
        </svg>

        {/* Legend - compact */}
        <div
          className="absolute left-0 right-0 flex items-center justify-center gap-2 text-[10px]"
          style={{ bottom: bottomPadding - 20 }}
        >
          <div className="flex items-center gap-1">
            <div className="w-2 h-0.5 bg-primary" />
            <span className="text-muted-foreground">Actual</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-2 h-0.5 bg-green-500 border-dashed border-t-2" />
            <span className="text-muted-foreground">Predicted</span>
          </div>
        </div>
      </div>

      {/* Key Metrics - compact */}
      <div className="flex items-center justify-between mt-3 pt-2 border-t border-border text-xs">
        <div>
          <span className="text-muted-foreground">Current: </span>
          <span className="font-semibold">{currentEfficiency.toFixed(1)}%</span>
        </div>
        <div>
          <span className="text-muted-foreground">Target: </span>
          <span className="font-semibold text-green-500">{predictedEfficiency.toFixed(1)}%</span>
        </div>
      </div>
    </motion.div>
  )
}
