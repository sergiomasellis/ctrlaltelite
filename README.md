# React + TypeScript + Vite + shadcn/ui

This is a template for a new Vite project with React, TypeScript, and shadcn/ui.

## iRacing .ibt telemetry converter (CSV / JSON)

This repo includes a small CLI utility to convert iRacing `.ibt` telemetry files into CSV, NDJSON, or JSON arrays.

### Convert the sample file to CSV

```bash
bun run convert-ibt -- --input "public/telemtry/acuransxevo22gt3_virginia 2022 full 2025-12-20 22-57-02.ibt" --format csv
```

This will write a `.csv` next to the input file by default.

### Convert to NDJSON (recommended for large files)

```bash
bun run convert-ibt -- --input "public/telemtry/acuransxevo22gt3_virginia 2022 full 2025-12-20 22-57-02.ibt" --format ndjson --vars "SessionTime,Speed,RPM,Gear,Throttle,Brake,SteeringWheelAngle" --stride 2
```

### List available channels

```bash
bun run convert-ibt -- --input "public/telemtry/acuransxevo22gt3_virginia 2022 full 2025-12-20 22-57-02.ibt" --list-vars
```

### Export metadata and session info YAML

```bash
bun run convert-ibt -- --input "public/telemtry/acuransxevo22gt3_virginia 2022 full 2025-12-20 22-57-02.ibt" --format csv --meta "public/telemtry/sample.meta.json" --session-yaml "public/telemtry/sample.session.yaml"
```
