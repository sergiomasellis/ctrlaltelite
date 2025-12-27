# Commands
- `npm run build` - Build TypeScript + Vite (runs tsc -b && vite build)
- `npm run lint` - Run ESLint
- `npm run dev` - Start Vite dev server (web only)
- `npm run preview` - Preview production build
- `npm run tauri:dev` - Run Tauri app in development mode
- `npm run tauri:build` - Build desktop app for production
- `npm run convert-ibt` - Run iBT to CSV/NDJSON converter utility
- `bun scripts/convert-ibt.mjs -- --input "path/to/file.ibt" --format csv` - Convert specific .ibt file

# Testing
- **Current status**: No automated tests configured
- When adding tests: place next to source files as `.test.ts` or `.test.tsx`
- No single test runner command currently available

# Code Style

## Imports & Paths
- **Path alias**: Use `@/*` for src/ imports (e.g., `import { cn } from "@/lib/utils"`)
- **TypeScript modules**: Prefer named exports over default exports
- **No default imports**: Use `import { Component } from "./Component"` not `import Component from "./Component"`

## Components
- **Functional components only**: No class components
- **Export**: Named functions (e.g., `export function MyComponent()`)
- **TypeScript**: All components must be typed with explicit prop interfaces
- **Performance**: Wrap with `React.memo` when props don't change frequently
- **Naming**: PascalCase for components (e.g., `LapAnalysis`, `TelemetryChart`)

## Styling
- **Tailwind CSS 4**: Use utility classes directly
- **Class merging**: Use `cn()` from `@/lib/utils` for conditional class merging
- **UI components**: Use shadcn/ui (base-mira style) from `@/components/ui`
- **Theming**: Use CSS variables like `hsl(var(--foreground))`
- **Responsive**: Apply responsive variants (e.g., `md:w-1/2`, `lg:w-1/3`)

## State & Hooks
- **React hooks**: `useState`, `useCallback`, `useMemo`, `useRef`, `useEffect`
- **Throttling**: Use `requestAnimationFrame` for performance-critical updates (e.g., cursor movement)
- **Cursors**: Use cursor store (`@/lib/cursorStore`) for synced charts
- **Cleanup**: Always clean up event listeners, timers, and subscriptions in useEffect returns

## Types
- **Location**: Define types in `types.ts` alongside component files
- **Interfaces**: Use PascalCase for interfaces (e.g., `IbtLapData`, `ChartSeries`)
- **Type aliases**: Use `type` for unions and simple types (e.g., `type IbtVarType = 0 | 1 | 2`)
- **Explicit types**: Never use `any`; prefer `unknown` with type guards when type is unknown
- **Nullable types**: Explicitly mark nullable fields (e.g., `speedKmh: number | null`)

## Functions & Methods
- **Naming**: camelCase (e.g., `calculateLapDelta`, `handleFileSelect`)
- **Async**: Use async/await for all async operations
- **Callbacks**: Wrap in `useCallback` when passed as props to avoid recreation

## Constants
- **Naming**: UPPER_SNAKE_CASE (e.g., `VAR_HEADER_SIZE`, `MAX_LAPS`)
- **Location**: Define at module level, use `const` with proper typing

## Error Handling
- **Throw descriptive errors**: `throw new Error("Invalid range: x must be between 0 and 100")`
- **Never use** `any`, `@ts-ignore`, or `@ts-expect-error` to suppress errors
- **Validation**: Check for null/undefined before accessing properties
- **Type guards**: Use `typeof`, `instanceof`, and custom type guards

## Performance
- **Memoization**: Use `useMemo` for expensive calculations
- **Callback memoization**: Use `useCallback` for functions passed to child components
- **Component memo**: Use `React.memo` to prevent unnecessary re-renders
- **Lazy evaluation**: Defer heavy computations until needed

## Formatting
- **No code comments** unless explicitly requested
- **Bracket style**: No braces for single-statement blocks where idiomatic
- **Trailing commas**: Enabled
- **Semicolons**: Required
- **Quotes**: Use double quotes for strings

## File Organization
- **Components**: Group by feature in `src/components/` (e.g., `lap-analysis/`, `telemetry/`, `track/`)
- **Shared UI**: Place reusable UI components in `src/components/ui/`
- **Utilities**: Place in `src/lib/` (e.g., `utils.ts`, `telemetry-utils.ts`)
- **Types**: Keep types alongside components or in dedicated `types.ts` files

## Rust Backend (src-tauri/)
- **Entry point**: `src-tauri/src/main.rs`
- **Minimal**: Currently just initializes Tauri with fs plugin
- **Keep simple**: Add commands only when absolutely necessary (prefer web APIs)

## Platform-Specific
- **Tauri integration**: Use `@tauri-apps/api` for native features
- **Dev server**: Runs on port 1420 by default
- **Build targets**: Windows (chrome105), macOS/Linux (safari13)
- **Source maps**: Enabled in dev mode only

## Conventions from Codebase
- **Telemetry charts**: Use `syncId="telemetry"` for cursor synchronization
- **Chart types**: "monotone" (smooth) or "stepAfter" (stepped) lines
- **Distance units**: Kilometers (km) for track position
- **Time units**: Seconds (sec) for lap times
- **Speed units**: km/h for speed display

## Anti-Patterns
- **Never**: Suppress type errors
- **Never**: Leave console.log statements in production code
- **Never**: Use empty catch blocks
- **Never**: Delete tests to "pass" CI
- **Avoid**: Large components (split into smaller, focused ones)
- **Avoid**: Direct DOM manipulation (use refs sparingly)
