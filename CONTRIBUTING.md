# Contributing to Ctrl Alt Elite

Thank you for your interest in contributing to Ctrl Alt Elite! This document provides guidelines and instructions for contributing to the project.

## 📋 Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Setup](#development-setup)
- [Making Changes](#making-changes)
- [Pull Request Process](#pull-request-process)
- [Coding Standards](#coding-standards)
- [Testing](#testing)
- [Documentation](#documentation)

## Code of Conduct

By participating in this project, you agree to maintain a respectful and inclusive environment for all contributors. We expect all participants to:

- Be respectful and considerate
- Welcome newcomers and help them learn
- Focus on constructive feedback
- Respect different viewpoints and experiences

## Getting Started

1. **Fork the repository** on GitHub
2. **Clone your fork** locally:
   ```bash
   git clone https://github.com/yourusername/ctrlaltelite.git
   cd ctrlaltelite
   ```
3. **Add the upstream remote**:
   ```bash
   git remote add upstream https://github.com/original-owner/ctrlaltelite.git
   ```
4. **Create a branch** for your changes:
   ```bash
   git checkout -b feature/your-feature-name
   # or
   git checkout -b fix/your-bug-fix
   ```

## Development Setup

### Prerequisites

- Node.js (v18 or higher)
- Rust (latest stable)
- npm, yarn, pnpm, or bun

### Installation

```bash
# Install dependencies
npm install

# Run the development server
npm run tauri:dev
```

### Available Scripts

- `npm run dev` - Start Vite dev server (web only)
- `npm run tauri:dev` - Run Tauri app in development mode
- `npm run build` - Build the web app
- `npm run tauri:build` - Build the desktop app
- `npm run lint` - Run ESLint
- `npm run convert-ibt` - Run the iBT converter utility

## Making Changes

### Branch Naming

Use descriptive branch names that indicate the type of change:

- `feature/` - New features
- `fix/` - Bug fixes
- `docs/` - Documentation changes
- `refactor/` - Code refactoring
- `test/` - Test additions/changes
- `chore/` - Maintenance tasks

### Commit Messages

Write clear, descriptive commit messages:

```
feat: Add lap comparison export functionality
fix: Resolve track map rendering issue on high DPI displays
docs: Update README with new installation steps
refactor: Optimize telemetry data parsing
```

Follow the [Conventional Commits](https://www.conventionalcommits.org/) specification when possible.

### Code Changes

1. **Make your changes** in your feature branch
2. **Test thoroughly** - Ensure your changes work as expected
3. **Run linter** - `npm run lint` should pass without errors
4. **Update tests** - Add or update tests if applicable
5. **Update documentation** - Keep README and code comments up to date

## Pull Request Process

1. **Keep your branch updated**:
   ```bash
   git fetch upstream
   git rebase upstream/main
   ```

2. **Push your changes**:
   ```bash
   git push origin feature/your-feature-name
   ```

3. **Create a Pull Request** on GitHub with:
   - Clear title and description
   - Reference to related issues (if any)
   - Screenshots (for UI changes)
   - Description of changes and rationale

4. **Respond to feedback** - Address review comments promptly

5. **Keep commits clean** - Squash commits if requested during review

### PR Checklist

Before submitting a PR, ensure:

- [ ] Code follows the project's coding standards
- [ ] All tests pass (if applicable)
- [ ] Linter passes (`npm run lint`)
- [ ] Documentation is updated
- [ ] Commit messages are clear and descriptive
- [ ] No console.logs or debug code left behind
- [ ] Changes are tested on the target platform(s)

## Coding Standards

### TypeScript

- Use TypeScript for all new code
- Prefer explicit types over `any`
- Use interfaces for object shapes
- Enable strict mode checks

### React

- Use functional components with hooks
- Follow React best practices
- Use meaningful component and variable names
- Keep components focused and reusable

### Styling

- Use Tailwind CSS utility classes
- Follow the existing design system
- Use CSS variables for theming
- Ensure responsive design where applicable

### File Organization

- Group related files together
- Use clear, descriptive file names
- Keep components in appropriate directories
- Follow the existing project structure

### Example Code Style

```typescript
// Good: Clear, typed, and well-structured
interface LapData {
  lapNumber: number
  lapTime: number
  sectors: number[]
}

function calculateLapDelta(reference: LapData, current: LapData): number {
  return current.lapTime - reference.lapTime
}

// Avoid: Unclear types, poor naming
function calc(a: any, b: any) {
  return b - a
}
```

## Testing

While automated tests are not yet fully implemented, please:

- Manually test your changes thoroughly
- Test on different platforms if possible (Windows, macOS, Linux)
- Test with various `.ibt` file sizes and formats
- Verify UI responsiveness and performance

When adding tests:

- Place test files next to the code they test (`.test.ts` or `.test.tsx`)
- Use descriptive test names
- Test both happy paths and edge cases

## Documentation

### Code Comments

- Add comments for complex logic
- Use JSDoc for public functions and components
- Keep comments up to date with code changes

### README Updates

Update the README if your changes:

- Add new features that should be documented
- Change installation or build steps
- Modify command-line usage
- Add new dependencies or requirements

### Component Documentation

For new components, include:

- Purpose and usage
- Props/types documentation
- Usage examples if needed

## Areas for Contribution

We welcome contributions in these areas:

- 🐛 **Bug fixes** - Report and fix issues
- ✨ **Features** - New functionality ideas
- 📚 **Documentation** - Improve docs and examples
- 🎨 **UI/UX** - Enhance the user interface
- ⚡ **Performance** - Optimize rendering and data processing
- 🧪 **Testing** - Add test coverage
- 🌐 **Internationalization** - Translate the app

## Questions?

If you have questions or need help:

- Open an issue with the `question` label
- Start a discussion in GitHub Discussions
- Check existing issues and discussions first

Thank you for contributing to Ctrl Alt Elite! 🏎️