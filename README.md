# workflow-editor

> 🎨 Visual editor for the [GoCodeAlone/workflow](https://github.com/GoCodeAlone/workflow) engine.

[![License](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![npm](https://img.shields.io/npm/v/@gocodealone/workflow-editor.svg)](https://github.com/orgs/GoCodeAlone/packages?repo_name=workflow-editor)

Standalone npm package providing a visual workflow editor: 14 node types, 9 edge types, a ReactFlow canvas, property panel, node palette, toolbar, serialization, and auto-layout. Used by `workflow-vscode`, `workflow-jetbrains`, and embeddable in any TypeScript/React host.

## What it provides

- **WorkflowCanvas** — ReactFlow-based visual canvas
- **PropertyPanel** — type-specific node configuration
- **NodePalette** — drag-and-drop palette across all 90+ module types
- **Toolbar** — load, save, validate, deploy
- **Serialization** — YAML ↔ graph round-trip
- **autoLayout** — automatic graph layout
- **Zustand stores** — `loadSchemas()` / `loadPluginSchemas()` for host injection

## Install

```sh
npm install @gocodealone/workflow-editor
```

```ts
import { WorkflowCanvas, useWorkflowStore } from '@gocodealone/workflow-editor';
```

## Local development

```sh
git clone https://github.com/GoCodeAlone/workflow-editor.git
cd workflow-editor
npm install
npm run dev
npm test
```

Build: `npm run build` (Vite library mode).

## Documentation

- [workflow engine upstream](https://github.com/GoCodeAlone/workflow)
- [Design plan](https://github.com/GoCodeAlone/workflow/blob/main/docs/plans/2026-03-12-workflow-editor-design.md)
- [Host integrations](https://github.com/GoCodeAlone/workflow-vscode), [JetBrains](https://github.com/GoCodeAlone/workflow-jetbrains)

## CI

- `publish.yml` — tag → build → publish → dispatch editor-release
- `sync-schema.yml` — workflow-release → update types

## License

MIT. See [LICENSE](LICENSE).
