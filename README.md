# 🏎️ Ctrl Alt Elite

<div align="center">

**Professional racing telemetry analysis for iRacing**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-20232A?logo=react&logoColor=61DAFB)](https://reactjs.org/)
[![Tauri](https://img.shields.io/badge/Tauri-FFC131?logo=tauri&logoColor=black)](https://tauri.app/)

</div>

---

Ctrl Alt Elite is a modern desktop application for analyzing iRacing telemetry data. Transform your `.ibt` telemetry files into actionable insights with beautiful visualizations, detailed lap comparisons, and comprehensive track analysis.

![Telemetry Analysis](https://github.com/user-attachments/assets/7ddfe491-15bd-4c3b-9aff-4747a5dae371)

![Dashboard Overview](https://github.com/user-attachments/assets/fda651a5-7cfc-415a-b557-2e9898f094f8)

## ✨ Features

### 📊 Telemetry Visualization
- **Interactive Charts**: Multi-parameter telemetry visualization with synchronized cursors
- **Customizable Views**: Drag and resize panels to fit your workflow
- **Multiple Parameters**: Analyze speed, RPM, throttle, brake, steering, and more simultaneously

### 🏁 Lap Analysis
- **Lap Comparison**: Compare multiple laps side-by-side to identify performance differences
- **Sector Analysis**: Detailed sector-by-sector breakdown with time deltas
- **Best Lap Detection**: Automatically identifies and highlights your fastest lap
- **Lap Statistics**: Comprehensive stats including min/max values, averages, and deltas

### 🗺️ Track Visualization
- **2D Track Map**: Visualize your position and speed on track
- **3D Track Map**: Immersive three-dimensional track representation
- **Sector Markers**: Clear visualization of sector boundaries

### 📁 Session Management
- **Auto-Detection**: Automatically scans your iRacing telemetry directory
- **Session Overview**: Quick access to all your telemetry files
- **Metadata Extraction**: Displays track, car, session type, and date information
- **File Import**: Drag-and-drop or browse to import `.ibt` files

### 🎨 Modern UI
- **Dark Theme**: Easy on the eyes for extended analysis sessions
- **Responsive Design**: Adapts to different window sizes
- **Smooth Animations**: Polished user experience throughout

## 🚀 Getting Started

### Prerequisites

- **Node.js** (v18 or higher) - [Download](https://nodejs.org/)
- **Rust** (latest stable) - [Install via rustup](https://rustup.rs/)
- **System Dependencies** for Tauri:
  - **Windows**: Microsoft Visual Studio C++ Build Tools
  - **macOS**: Xcode Command Line Tools (`xcode-select --install`)
  - **Linux**: See [Tauri Prerequisites](https://tauri.app/v1/guides/getting-started/prerequisites)

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/yourusername/ctrlaltelite.git
   cd ctrlaltelite
   ```

2. **Install dependencies**
   ```bash
   npm install
   # or
   bun install
   ```

3. **Run in development mode**
   ```bash
   npm run tauri:dev
   # or
   bun run tauri:dev
   ```

### Building for Production

Build the application for your platform:

```bash
npm run tauri:build
# or
bun run tauri:build
```

The compiled application will be in `src-tauri/target/release/` (or `target/debug/` for debug builds).

## 📖 Usage

### Loading Telemetry Files

1. **Auto-detection**: The app automatically scans `Documents/iRacing/telemetry/` for `.ibt` files
2. **Manual Import**: Click the "Import" button or drag-and-drop `.ibt` files into the app
3. **Select a Session**: Click on any session from the overview to begin analysis

### Analyzing Laps

- **Select Laps**: Use the lap selector to choose which laps to compare
- **View Telemetry**: Scroll through synchronized charts to analyze performance
- **Track Position**: Hover over charts to see your position on the track map
- **Sector Breakdown**: Review sector times and identify improvement areas

### Converting .ibt Files

The project includes a CLI utility for converting `.ibt` files to other formats:

```bash
# Convert to CSV
npm run convert-ibt -- --input "path/to/file.ibt" --format csv

# Convert to NDJSON (recommended for large files)
npm run convert-ibt -- --input "path/to/file.ibt" --format ndjson --vars "SessionTime,Speed,RPM,Gear" --stride 2

# List available channels
npm run convert-ibt -- --input "path/to/file.ibt" --list-vars

# Export metadata and session info
npm run convert-ibt -- --input "path/to/file.ibt" --format csv --meta "metadata.json" --session-yaml "session.yaml"
```

## 🛠️ Technology Stack

- **Frontend Framework**: React 19 with TypeScript
- **Desktop Framework**: Tauri 2
- **UI Components**: shadcn/ui
- **Styling**: Tailwind CSS 4
- **Charts**: Recharts
- **3D Graphics**: Three.js
- **Build Tool**: Vite
- **Icons**: Lucide React

## 📁 Project Structure

```
ctrlaltelite/
├── src/                      # Frontend source code
│   ├── components/          # React components
│   │   ├── lap-analysis/   # Lap analysis components
│   │   ├── telemetry/      # Telemetry chart components
│   │   ├── track/          # Track map components
│   │   └── ui/             # UI components (shadcn/ui)
│   └── lib/                # Utility functions
│       ├── ibt.ts          # iBT file parser
│       ├── telemetry-utils.ts
│       └── sector-utils.ts
├── src-tauri/              # Tauri backend (Rust)
├── scripts/                # Utility scripts
│   └── convert-ibt.mjs    # iBT converter CLI
└── public/                 # Static assets
```

## 🤝 Contributing

We welcome contributions! Please see our [Contributing Guide](CONTRIBUTING.md) for details on:

- Code of conduct
- Development setup
- Pull request process
- Coding standards

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- Built with [Tauri](https://tauri.app/) for native desktop performance
- UI components from [shadcn/ui](https://ui.shadcn.com/)
- Charts powered by [Recharts](https://recharts.org/)
- 3D visualization with [Three.js](https://threejs.org/)

## 📮 Support

- **Issues**: [GitHub Issues](https://github.com/yourusername/ctrlaltelite/issues)
- **Discussions**: [GitHub Discussions](https://github.com/yourusername/ctrlaltelite/discussions)

---

<div align="center">

Made with ❤️ for the iRacing community

**Ctrl Alt Elite** - Elevate Your Racing Performance

</div>