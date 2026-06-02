# Requirements Document

## Introduction

Migrate the MoMath Math Square Electron app's build system from the deprecated SystemJS/jspm module loader (which performs runtime TypeScript transpilation in the browser) to esbuild. The new system bundles all TypeScript and JavaScript at build time into a single `bundle.js` file, eliminating the runtime transpiler, the 300-line SystemJS config, and the `packages/` directory. All existing functionality — sensors, floor tracking, behaviors, BLAST semaphore, and BL server connection — is preserved.

## Glossary

- **Build_System**: The esbuild-based toolchain that compiles TypeScript and bundles all renderer-process modules into a single output file
- **Bundle**: The single JavaScript file (`bundle.js`) produced by the Build_System, loaded directly by the HTML page
- **Renderer_Entry**: The main TypeScript entry point (`main.ts`) for the Electron renderer process
- **Behavior**: A JavaScript module in `behs/` that exports a `behavior` object with `title`, `frameRate`, `init`, and `render` properties
- **Core_Module**: One of the shared modules (`sensors.ts`, `display.ts`, `floor.ts`) imported by behaviors and main
- **Electron_Main**: The main process script (`app.js`) that creates the BrowserWindow and manages the application lifecycle
- **Dev_Mode**: A development workflow where esbuild rebuilds the Bundle on file changes and launches Electron with `--dev`
- **Production_Mode**: A workflow where esbuild produces an optimized Bundle for deployment
- **Dynamic_Import**: A runtime `import()` expression used to load a Behavior module by path
- **BL_Server**: The Bright Logic sensor server that provides floor sensor data via XML over HTTP
- **BLAST_Semaphore**: A callback system that notifies a launcher URL when the app has started

## Requirements

### Requirement 1: esbuild Bundling of Renderer Code

**User Story:** As a developer, I want all renderer-process TypeScript and JavaScript compiled and bundled at build time, so that the browser no longer needs a runtime transpiler or module loader.

#### Acceptance Criteria

1. WHEN the build script is executed, THE Build_System SHALL compile all TypeScript files (main.ts, sensors.ts, display.ts, floor.ts) using main.ts as the entry point and produce a single JavaScript Bundle file
2. THE Build_System SHALL resolve bare module specifiers (`'sensors'`, `'display'`, `'floor'`) used by Behaviors to the corresponding Core_Module source files (sensors.ts, display.ts, floor.ts)
3. THE Build_System SHALL resolve `'prod'` imports to the `prod.json` file and inline its contents as a JavaScript module exposing the JSON properties as named exports
4. THE Build_System SHALL resolve `'lib/noise'` imports to the `lib/noise.js` file and include it in the Bundle
5. THE Build_System SHALL target ES2020 or later, compatible with the Electron 31+ Chromium engine, and SHALL treat Electron and Node.js built-in modules as external dependencies excluded from the Bundle
6. WHEN the build completes, THE Build_System SHALL produce an external source-map file alongside the Bundle
7. IF a TypeScript compilation error is encountered during the build, THEN THE Build_System SHALL terminate with a non-zero exit code and output a diagnostic message indicating the file and location of the error
8. THE Build_System SHALL complete the full bundle production in no more than 30 seconds on a standard development machine

### Requirement 2: Dynamic Behavior Loading

**User Story:** As a developer, I want behaviors loaded dynamically at runtime, so that new behaviors can be added without modifying the core bundle.

#### Acceptance Criteria

1. WHEN the Renderer_Entry needs to load a Behavior, THE Build_System SHALL support dynamic `import()` expressions for `.js` files in the `behs/` directory, producing each Behavior as a separate loadable asset outside the core bundle
2. THE Build_System SHALL configure module resolution so that Behavior files importing `'display'`, `'sensors'`, or `'floor'` resolve to the same Core_Module instances used by the core bundle (no duplicate module copies)
3. WHEN a Behavior is loaded via dynamic import, THE Bundle SHALL provide the Behavior access to Core_Module exports using only the built-in module system without requiring an additional runtime module loader in the browser
4. IF a Behavior file does not exist at the specified path, THEN THE Bundle SHALL reject the import promise with an error that includes the requested file path
5. WHEN a Behavior is loaded via dynamic import, THE Bundle SHALL resolve the import within 5 seconds on a local network, or reject with a timeout error

### Requirement 3: HTML Page Simplification

**User Story:** As a developer, I want the HTML pages to load a single bundle script directly, so that SystemJS, config.js, and the packages directory are no longer needed.

#### Acceptance Criteria

1. THE Build_System SHALL produce HTML files (dev.html, index.html) that each contain exactly one `<script>` tag referencing the Bundle file
2. THE Build_System SHALL produce HTML files that contain no references to `packages/system.js`, `config.js`, SystemJS API calls, or `body onload` attributes
3. THE Build_System SHALL preserve the `<div id="scene">` container element in both HTML files
4. THE Build_System SHALL preserve the dev-mode form controls (sensor selector, mouse checkbox) in `dev.html`
5. WHEN the browser evaluates the Bundle `<script>`, THE Bundle SHALL begin application initialization without requiring an external trigger such as an `onload` handler or explicit function call from the HTML
6. THE Build_System SHALL preserve the existing `<link rel="stylesheet">` reference to the project stylesheet in both HTML files

### Requirement 4: Electron Main Process Preservation

**User Story:** As a developer, I want the Electron main process (`app.js`) to remain as plain CommonJS and not be bundled, so that Electron's native module loading continues to work unchanged.

#### Acceptance Criteria

1. THE Build_System SHALL exclude `app.js` from bundler processing such that the output `app.js` retains its original `require()` calls and is not concatenated with other modules
2. THE Build_System SHALL place both `dev.html` and `index.html` in the same directory as `app.js` in the build output so that `path.join(__dirname, 'dev.html')` and `path.join(__dirname, 'index.html')` resolve correctly at runtime
3. WHEN the Electron_Main creates a BrowserWindow, THE Electron_Main SHALL use `nodeIntegration: true` in web preferences
4. IF the `--dev` flag is passed to the Electron_Main, THEN THE Electron_Main SHALL load `dev.html`; IF the `--dev` flag is not passed, THEN THE Electron_Main SHALL load `index.html`
5. THE Build_System SHALL preserve `app.js` as a CommonJS module so that Node.js native module resolution (e.g., `require('electron')`, `require('electron-log')`) functions without additional configuration

### Requirement 5: Development Workflow

**User Story:** As a developer, I want a fast development workflow with automatic rebuilds and Electron relaunch, so that I can iterate quickly on behaviors and core modules.

#### Acceptance Criteria

1. WHEN a `.ts` or `.js` source file in the project directory changes, THE Build_System SHALL rebuild the Bundle in under 500ms for incremental rebuilds
2. THE Build_System SHALL provide a single `npm run dev` command that watches for file changes, rebuilds the Bundle, and automatically reloads the Electron renderer window without requiring manual intervention
3. WHEN the Bundle is rebuilt during development, THE Build_System SHALL produce source maps that map bundled code back to the original source file paths and line numbers
4. WHILE Dev_Mode is active, THE Build_System SHALL include a "Toggle DevTools" item in the Electron tray context menu that opens or closes the Chromium DevTools for the renderer window
5. IF a rebuild fails due to a syntax or compilation error, THEN THE Build_System SHALL display the error location (file path and line number) and error message in the terminal where `npm run dev` is running, and SHALL not replace the last successful Bundle

### Requirement 6: Production Build

**User Story:** As a developer, I want a production build command that produces an optimized bundle for deployment, so that the app runs efficiently on the museum floor.

#### Acceptance Criteria

1. WHEN `npm run build` is executed, THE Build_System SHALL compile all TypeScript and JavaScript source files into a minified production Bundle in a designated output directory, with dead code elimination applied, and exit with code 0 on success
2. WHEN `npm run build` is executed, THE Build_System SHALL produce the production Bundle without source maps
3. WHEN `electron-forge package` or `electron-forge make` is executed after a successful build, THE Build_System SHALL produce a distributable Electron package that includes the production Bundle
4. IF `npm run build` encounters a compilation or bundling error, THEN THE Build_System SHALL exit with a non-zero exit code and output an error message indicating the failure reason

### Requirement 7: Modern TypeScript Compilation

**User Story:** As a developer, I want to use modern TypeScript (5.x) for type checking, so that I get better IDE support and can use current language features.

#### Acceptance Criteria

1. THE Build_System SHALL use TypeScript 5.x (version 5.0.0 or higher) for type checking via `tsc --noEmit`
2. THE Build_System SHALL configure `tsconfig.json` with `strict` mode enabled and `module` set to ESNext
3. WHEN `tsc --noEmit` is executed against the project's TypeScript files, THE Build_System SHALL complete with zero type-checking errors
4. WHEN esbuild bundles TypeScript files, THE Build_System SHALL strip type annotations without performing type checking (esbuild's default behavior)
5. IF `tsc --noEmit` reports one or more type errors, THEN THE Build_System SHALL fail the type-check step and output the count of errors along with their file paths and line numbers

### Requirement 8: Dependency Management Simplification

**User Story:** As a developer, I want `npm install` to be the only package management step, so that the fragile jspm/SystemJS package infrastructure is eliminated.

#### Acceptance Criteria

1. THE Build_System SHALL declare all runtime and build dependencies in `package.json` under `dependencies` or `devDependencies`
2. THE Build_System SHALL remove `jspm` from `package.json` `dependencies` and `devDependencies`
3. THE Build_System SHALL remove the `jspm` configuration section from `package.json`
4. IF the `packages/` directory and `config.js` are absent from the repository, THEN THE Build_System SHALL complete all build scripts (`npm run start`, `npm run package`, `npm run make`) with exit code 0
5. WHEN a developer runs `npm install` on a fresh clone, THE Build_System SHALL install all packages required for the `npm run start` and `npm run package` scripts to complete with exit code 0
6. THE Build_System SHALL contain no source file references to `SystemJS`, `System.config`, or `System.import` at runtime

### Requirement 9: Existing Functionality Preservation

**User Story:** As a developer, I want all existing runtime functionality preserved after the migration, so that the interactive floor continues to work.

#### Acceptance Criteria

1. THE Bundle SHALL export sensor grid functionality (80x80 grid, sources including NullSource/BLSource/RaindropSource/MouseSource/FilterSource/PlaybackSource, Reader, and Blobber) with the same public exports (types, classes, functions, and constants) and equivalent signatures as the current sensors.ts module
2. THE Bundle SHALL export floor user tracking (Floor class with user blobbing, Ghost users with noise-based movement, and user lifecycle callbacks for new/deleted/updated users) with the same public exports and equivalent signatures as the current floor.ts module
3. THE Bundle SHALL export display geometry constants (width=1024, height=1024, sensorWidth, sensorHeight, sensor-to-pixel conversion functions toSensor/fromSensor, teamColors array of 12 entries, and Canvas2DContext) with the same public exports and equivalent signatures as the current display.ts module
4. WHEN the BLAST_Semaphore GUID is provided via query parameters and the behavior initialization completes, THE Bundle SHALL send the semaphore callback exactly once to the launcher URL (using the provided launcher_callback_url parameter, or the default launcher URL if none is provided)
5. IF the BLAST_Semaphore GUID is not provided via query parameters, THEN THE Bundle SHALL skip the semaphore callback without error
6. WHILE in Production_Mode with a BL_Server URL configured in prod.json, THE Bundle SHALL poll the BL_Server for sensor data at the configured refresh rate (20 Hz)
7. IF the BL_Server is unreachable or returns invalid data during a sensor read, THEN THE Bundle SHALL invoke the error callback, treat the reading as an all-off (zeroed) grid, and continue polling after a minimum 500 ms delay
8. IF the app is in Dev_Mode, THEN THE Bundle SHALL default to the raindrop (random) sensor source
9. WHEN a sensor source type is specified via the "sensors" query parameter, THE Bundle SHALL use the specified source type regardless of the current mode (Dev_Mode or Production_Mode)

### Requirement 10: Node.js and Electron Compatibility

**User Story:** As a developer, I want the app to run on Node.js 22 and Electron 31+, so that the platform is current and maintained.

#### Acceptance Criteria

1. THE Build_System SHALL produce a renderer Bundle with esbuild `target` set to `chrome126` to ensure compatibility with Electron 31+ (Chromium 126+)
2. THE Build_System SHALL specify an `engines.node` value of `>=22` in package.json, and the build SHALL complete without Node.js version compatibility errors when run on Node.js 22
3. THE Build_System SHALL configure esbuild's `platform` to `browser` for the renderer bundle since code runs in the Chromium renderer process
4. IF the renderer Bundle requires Node.js APIs (via `nodeIntegration: true`), THEN THE Build_System SHALL configure esbuild to treat Node.js built-in modules as external dependencies
5. THE Build_System SHALL configure esbuild's `platform` to `node` and `target` to `node22` for the main-process bundle
