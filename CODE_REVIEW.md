# Code Review Framework & Checklist
## Forge: Semantic Image Infrastructure

This framework defines the official guidelines and checklist for conducting code reviews within the **Forge: Semantic Image Infrastructure** repository. It leverages trusted developer community standards (e.g., OWASP Top 10, Google’s Code Review Guide, Snyk Security Best Practices, and React/Express community standards) and is customized for this project's full-stack architecture (**React 19, Vite 6, Tailwind CSS v4, Express API, Firebase SDK, and `@google/genai`**).

---

## 1. Architectural Integrity & Scope Enforcement

We maintain a strict boundary between our client-side SPA presentation and our secure backend proxy services.

### 🔍 Code Review Focus Areas:
- **Zero API Key Leaks on Client**: Ensure that NO server secrets (e.g., `GEMINI_API_KEY`, `FIREBASE_ADMIN_CREDENTIALS`) are exposed to the client. They must NEVER be prefixed with `VITE_` or loaded in `src/`.
- **Express-Server Proxy Rule**: All semantic analysis, image downloads, and external AI completions must run server-side under the `/api/*` endpoints (defined in `server.ts`).
- **Single-View & UX Density**: Unless a multi-screen route is explicitly requested, UI components must be rendered in a cohesive single-page presentation focusing on layout density, high information clarity, and responsive canvas sizing.
- **Spec Traceability**: Verify that all modified or new features align directly with requested goals, avoiding speculative features ("over-engineering") or mock placeholder data.

---

## 2. Frontend Review: React 19, Vite 6, & Tailwind CSS v4

React 19 introduces structural changes to hook behaviors and compiler optimizations. Tailwind CSS v4 moves config entirely into CSS via `@import "tailwindcss";` and `@theme`.

### 🔍 Code Review Focus Areas:

#### A. React 19 Hooks & Rendering Stability
- **No Direct State Updates in Render Loops**: Ensure state setters are never called directly in the body of a functional component.
- **Strict `useEffect` Dependency Chains**:
  - Never include un-stabilized arrays, objects, or functions in a `useEffect` dependency array.
  - Prefer primitive types (strings, numbers, booleans) to avoid infinite rendering cycles.
- **Resource Cleanup**: Verify that subscriptions (such as Firestore real-time snapshots or event listeners) are properly returned as cleanup functions inside `useEffect`.
- **Async Action Handlers**: Use React 19 transitions or try-catch bounds for async event handlers (e.g., form submissions, trigger buttons) to prevent unhandled promise rejections and keep the UI responsive.

#### B. Tailwind CSS v4 Style Standards
- **CSS-Based Configuration**: Custom themes and utility mappings must be declared using the `@theme` directive in `src/index.css`. Standard `tailwind.config.js` is deprecated in v4.
- **Contrast & Accessiblity**: Ensure sufficient contrast ratios on all text and button overlays (e.g., keeping dark slate neutral backgrounds aligned with bright, clear typography colors).
- **Responsive Fluidity**: Implement responsive prefixes (`sm:`, `md:`, `lg:`) with layout constraints like `w-full max-w-7xl mx-auto px-4`.
- **Touch Targets**: All interactive elements (such as buttons, toggles, list items) must maintain at least a `44px` touch target size (`min-h-[44px]` or adequate padding) on mobile.

#### C. Animation Quality (`motion`)
- Animations must be powered by the modern `motion` package (imported from `motion/react`).
- Enforce visual constraint: use subtle transition curves (e.g., `easeOut` or layout-staggering effects) to reinforce view changes. Avoid jarring or over-animated visuals.

---

## 3. Backend Review: Node.js, Express v4, & esbuild Compilation

Our custom backend uses `server.ts` to serve API routes and proxies incoming AI requests. It is compiled to CommonJS (`dist/server.cjs`) for clean production deployment.

### 🔍 Code Review Focus Areas:

#### A. Production Compilation Compatibility
- **CJS File-System Access**: Because `esbuild` compiles `server.ts` into a bundled CommonJS module (`dist/server.cjs`), always use resilient path fallbacks for `__dirname` and `__filename`:
  ```typescript
  let safeDirname = process.cwd();
  try {
    if (typeof __dirname !== "undefined") {
      safeDirname = __dirname;
    } else if (import.meta.url) {
      safeDirname = path.dirname(fileURLToPath(import.meta.url));
    }
  } catch (e) {
    // safe fallback
  }
  ```
- **External Package Declarations**: Make sure any newly added server package is properly classified in `package.json` under `dependencies` rather than `devDependencies`, ensuring esbuild's `--packages=external` bundler script resolves it successfully at launch.

#### B. API Routing & Error Handling
- **Route Registration Order**: Vite middleware MUST be registered AFTER Express API routes to avoid asset collision and routing intercept issues:
  ```typescript
  // 1. API routes
  app.use("/api/images", imageRoutes);
  
  // 2. Vite middleware (dev) or express.static (prod)
  if (process.env.NODE_ENV !== "production") { ... }
  ```
- **Centralized Safe Try-Catch**: All API handlers must wrap their execution logic in standard `try-catch` blocks and return uniform JSON error responses (e.g., `{ error: string, code: number }`) with correct HTTP status codes.
- **Input Sanitization & Validation**:
  - Strictly check `req.body` and `req.query` types.
  - Restrict incoming payloads to prevent Denial of Service (DoS) from extremely large inputs.

#### C. Secrets & Environment Validation
- Ensure new environment variables are documented inside `.env.example` as blank keys.
- On startup, validate critical secrets (e.g. `GEMINI_API_KEY`) and fail fast with meaningful server-side logs if they are missing, rather than crashing silently.

---

## 4. AI Resilience: Google Gen AI SDK & Offline Fallbacks

Forge runs semantic analysis with Gemini, but maintains robust offline heuristic classifiers to respect API quotas (such as free-tier limits or missing credentials).

### 🔍 Code Review Focus Areas:
- **SDK Import Rules**: We use the modern `@google/genai` TypeScript SDK. Do NOT use legacy `@google/generative-ai` packages.
- **Lazy Initialization**: Initialize the `GoogleGenAI` instance only within active requests or lazy getters, guarding against missing environment keys.
- **Offline Fallback Enforcement**:
  - Always review catch-blocks for AI services (such as `/src/lib/forge/services/ai.service.ts`).
  - If a Gemini request fails (due to quota, network, or authentication issues), the service **MUST** gracefully fallback to a **Local Heuristic Engine**.
  - The fallback mechanism must mark the returned payload with `is_fallback = true` and log the fallback reason.
- **Structured JSON Completions**: Ensure prompts include strict JSON schemas to guarantee predictable outputs from model inference.

---

## 5. Security & Persistence: Firebase Client & Admin SDK

We utilize Firebase Client (Firestore & Auth) and Firebase Admin SDK on the server for secure data storage.

### 🔍 Code Review Focus Areas:

#### A. Database Schema Alignment
- Always verify that Firestore read/write operations strictly follow the schemas outlined in `firebase-blueprint.json`.

#### B. Firestore Security Rules (`firestore.rules`)
- Check that all write operations are guarded by explicit user authenticity checks:
  ```javascript
  allow write: if request.auth != null && request.auth.uid == userId;
  ```
- Avoid unrestricted global wildcards (`allow read, write: if true;`) under any production collections.

#### C. Real-Time Snapshot Lifecycle
- When registering client-side Firestore listeners via `onSnapshot`, ensure the returning unsubscribe handler is invoked on component unmount:
  ```typescript
  useEffect(() => {
    const unsubscribe = onSnapshot(docRef, (doc) => { ... });
    return () => unsubscribe();
  }, [docId]);
  ```

---

## 6. Code Review Execution Pipeline

To conduct a code review on changes:

1. **Verify Formatting & Types**: Run the non-emitting compiler check:
   ```bash
   npm run lint
   ```
2. **Verify Production Bundle**: Test the build process to guarantee esbuild and Vite configurations are unbroken:
   ```bash
   npm run build
   ```
3. **Review Differential Changes**: Inspect file additions and changes line-by-line, matching them against the focus areas in this document.
4. **Deploy Verification**: Run a quick validation to ensure the serverboots up correctly on port `3000`.
