# Developer & Agent Instructions
## Forge: Semantic Image Infrastructure

Welcome to the development guidelines for **Forge: Semantic Image Infrastructure**. This document serves as the absolute source of truth for all human and AI-agent-driven code additions, modifications, and bug fixes. 

Adherence to these standards is strictly mandatory to preserve architectural safety, performance under quota limits, and pristine design quality.

---

## 1. Project Reference & Tech Stack

- **Application Name**: Forge: Semantic Image Infrastructure
- **Core Concept**: A high-efficiency, context-aware image resolution engine that translates natural language UI/UX contexts into relevant image candidate queries, scores candidates semantically, and resolves the best candidate with absolute safety.
- **Key Technical Stack**:
  - **Frontend**: React 19 (SPA), Vite 6, Tailwind CSS v4, `motion` (by `motion/react`)
  - **Backend**: Express v4 Server, tsx (dev runtime), esbuild (production bundling)
  - **AI / Semantic Parsing**: Google Gen AI SDK (`@google/genai` v1.29.0)
  - **Persistence**: Firebase Client SDK, Firebase Admin SDK, and Firestore DB
- **Access Control & Port**: Port `3000` bound to host `0.0.0.0` (production and dev container ingress).

---

## 2. Directory & Module Reference Map

To prevent file-path typos or modular overlaps, follow this exact layout:

```text
/
├── server.ts                       # Entry point: registers API proxies, dev/prod servers
├── CODE_REVIEW.md                  # Comprehensive security, performance, & styling checklists
├── metadata.json                   # App capabilities, iframe permissions, and naming
├── firebase-blueprint.json         # Firestore collection schema definitions
├── firestore.rules                 # Firestore database access control rules
├── package.json                    # Bundler scripts and npm dependency definitions
└── src/
    ├── App.tsx                     # Main frontend component & responsive dashboard
    ├── index.css                   # Tailwind CSS v4 theme variables, fonts, and directives
    ├── main.tsx                    # React 19 DOM bootstrap hook
    └── lib/
        └── forge/
            ├── types.ts            # Shared TypeScript interfaces (Audits, Tags, Candidates)
            ├── api/                # Express API router definitions
            │   ├── ai.route.ts          # Proxy endpoints for semantic tags and audits
            │   ├── evaluation.route.ts  # Endpoints for running live evaluators
            │   └── images.route.ts      # Unsplash/external image query proxies
            ├── middleware/         # Server authentication/security middleware
            ├── providers/          # External provider bindings (Unsplash, etc.)
            ├── services/           # Long-running singleton classes
            │   ├── ai.service.ts        # Gemini SDK initialization & completion logic
            │   └── config.service.ts    # Secure credential validation
            └── core/               # Pure heuristic and calculation engines
                ├── context-parser.ts    # UI-context semantic parser
                ├── evaluation.ts        # Automated target/candidate correctness tester
                ├── fallback.ts          # Heuristic tag/audit generation rules (offline fallback)
                ├── query-builder.ts     # Multi-agent keyword expansion engine
                ├── resolve-image.ts     # Main integration resolver pipeline
                └── scorer.ts            # Semantic weight & metric calculator
```

---

## 3. High-Priority Directives (The Absolute Rules)

### Rule A: Mandatory Code Review Alignment & Verification
- **Audit Against Code Review Checklist**: Before finalizing any turn or committing any change, you MUST self-audit your code against the **[CODE_REVIEW.md](./CODE_REVIEW.md)** guidelines. This includes checking React 19 hook dependency arrays, checking esbuild bundles for path resolution, and validating CSS classes for Tailwind v4 compatibility.
- **Diff-Based Review & Active Probing**: Code reviews (such as any `/codereview` requests or workflows) MUST be performed on the active file diffs since the last stable commit. They must be actively probed and executed rather than merely reading the syntax or code structure.
- **Deep Connection & Testing Checks**: Reviews must look beyond compile-time correctness to identify integration defects, missing connection stubs, or testing gaps. Implement negative gating tests (tests that intentionally assert failure or fallback paths under extreme conditions) to ensure absolute system resilience.
- **Strengthen Approach via External/Community Wisdom**: Always strengthen your technical decisions and troubleshooting by searching official documentations, community blogs, and trusted industry sources.

### Rule B: API Secret Isolation & Proxy Routing
- **Never expose `GEMINI_API_KEY` to the client browser.**
- All calls utilizing the `@google/genai` SDK or requesting external APIs (such as image provider query keys) MUST be proxied through the server-side `/api/*` endpoints. 
- Only client-safe variables (such as public Firestore database IDs) may exist on the client side.

### Rule C: Quota Resilience (Local Heuristic Engine)
Because this application is designed for developer sandboxes, the Gemini API may be rate-limited, quota-restricted (e.g. 20 requests per day on free tier), or missing keys entirely. 
- All AI completions and analysis in `ai.service.ts` must be wrapped in strong, safe try-catch blocks.
- On catch, the application MUST automatically fall back to the **Local Heuristic Engine** (`src/lib/forge/core/fallback.ts`) to calculate tags, audits, and semantic ratings locally.
- Any fallback output MUST be returned with `is_fallback: true` and a detailed `fallback_reason` so the UI can accurately present warning indicators.

### Rule D: Strict Database Rules Compliance
Client-side Firestore queries must align perfectly with:
1. `firebase-blueprint.json` (schemas)
2. `firestore.rules` (auth restrictions)
Always ensure that component subscriptions to real-time collections are properly cleaned up upon component unmount by returning their `unsubscribe` function.

### Rule E: Verify by Probing & Avoid Prose Overstatement
- **Never Assume — Probe & Execute**: Never assume anything about the file structure, contents, or state. Always verify by probing, analyzing files, and testing execution.
- **Never Trust Prose Without Probe Verification**: Never trust descriptions, comments, or documentation without verification via direct inspection or workspace execution.
- **Precision in Wording & Scope Verification**: Wording matters. If existing documentation or prose overstates the current capabilities or state of the system, document and state the actual system state correctly. For any overstated claims, proactively ask the user whether they want the overstated features to be explicitly tracked/implemented or dropped entirely if they are not needed.

---

## 4. Specific Code Recipes & Best Practices

### A. Lazy-Initializing Google Gen AI SDK
Always initialize the Google Gen AI SDK lazily inside route handlers or safe service methods to avoid module-load failures:
```typescript
import { GoogleGenAI } from "@google/genai";

let aiInstance: GoogleGenAI | null = null;

export function getAIService() {
  if (!aiInstance) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.warn("GEMINI_API_KEY is not defined. Falling back to Heuristic Engine.");
    }
    aiInstance = new GoogleGenAI({ apiKey: apiKey || "dummy_key" });
  }
  return aiInstance;
}
```

### B. Safe CJS Fallbacks in compiled Server Bundles
Because `esbuild` transpiles `server.ts` into a CommonJS bundle, always define safe absolute paths for assets and HTML static routing:
```typescript
import path from "path";
import { fileURLToPath } from "url";

let safeDirname = process.cwd();
try {
  if (typeof __dirname !== "undefined") {
    safeDirname = __dirname;
  } else if (import.meta.url) {
    safeDirname = path.dirname(fileURLToPath(import.meta.url));
  }
} catch (e) {
  // safe fallback to process current working directory
}
```

### C. Tailwind CSS v4 Typography & Colors
Ensure `src/index.css` defines unified CSS-based `@theme` parameters:
```css
@import "tailwindcss";

@theme {
  --font-sans: "Inter", ui-sans-serif, system-ui;
  --font-mono: "JetBrains Mono", monospace;
  --color-forge-slate: #0a0b10;
  --color-forge-purple: #8b5cf6;
}
```
In React, leverage classes like `bg-forge-slate text-neutral-200 font-sans tracking-tight` to build a clean, unified, high-contrast display.

---

## 5. Deployment Verification Pipeline

Before marking any task as complete:
1. **Lint Check**: Run `npm run lint` and verify there are zero TypeScript syntax errors or missing imports.
2. **Build Check**: Run `npm run build` to confirm both the client bundle (Vite) and the server bundle (esbuild to `dist/server.cjs`) compile without issue.
3. **Verify Server Binding**: Confirm the server correctly listens to `PORT 3000` on host `0.0.0.0` for valid dev container traffic.
