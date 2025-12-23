# Commands
- `npm run build` - Build (TypeScript + Vite)
- `npm run lint` - Run ESLint
- `npm run dev` - Start dev server
- `npm run preview` - Preview production build

# Code Style
- **Imports**: Use `@/*` alias for src/ (e.g., `import { cn } from "@/lib/utils"`)
- **Components**: Functional components with TypeScript, export named functions
- **Styling**: Tailwind CSS with `cn()` utility from @/lib/utils for class merging
- **State**: React hooks (useState, useCallback, useMemo, useRef, memo)
- **Types**: Define in `types.ts` alongside component files, use PascalCase for interfaces
- **Functions**: camelCase, async/await for async operations
- **Constants**: UPPER_SNAKE_CASE (e.g., `VAR_HEADER_SIZE`)
- **Error handling**: Throw descriptive Error objects (e.g., `throw new Error("Invalid range")`)
- **UI Components**: Use shadcn/ui (base-mira style) from @/components/ui
- **Performance**: Use React.memo for optimization, requestAnimationFrame for throttling
- **Formatting**: No code comments unless explicitly requested