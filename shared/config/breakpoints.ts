// A width of 768px belongs to tablet; desktop starts at 1200px.
export const breakpoints = {
  mobile: { min: 320, max: 768 },
  tablet: { min: 768, max: 1199 },
  desktop: { min: 1200 }
} as const
