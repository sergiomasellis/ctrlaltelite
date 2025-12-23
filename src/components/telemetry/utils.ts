export function sanitizeSvgId(id: string) {
  return id.replace(/[^a-zA-Z0-9_-]/g, "_")
}

// Format Y-axis tick values intelligently
export function formatYAxisTick(value: number, yDomain?: [number, number]): string {
  if (!Number.isFinite(value)) return ""
  
  // If domain is provided, use it to determine appropriate precision
  if (yDomain) {
    const [min, max] = yDomain
    const range = Math.abs(max - min)
    
    // For very large ranges, use no decimals
    if (range > 1000) {
      return Math.round(value).toString()
    }
    // For large ranges, use 0-1 decimals
    if (range > 100) {
      return value.toFixed(0)
    }
    // For medium ranges, use 1 decimal
    if (range > 10) {
      return value.toFixed(1)
    }
    // For small ranges, use 2 decimals
    if (range > 1) {
      return value.toFixed(2)
    }
    // For very small ranges, use 3 decimals
    return value.toFixed(3)
  }
  
  // Fallback: format based on value magnitude
  const absValue = Math.abs(value)
  if (absValue >= 1000) {
    return Math.round(value).toString()
  }
  if (absValue >= 100) {
    return value.toFixed(0)
  }
  if (absValue >= 10) {
    return value.toFixed(1)
  }
  if (absValue >= 1) {
    return value.toFixed(2)
  }
  return value.toFixed(3)
}

