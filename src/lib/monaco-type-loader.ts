import { Monaco } from "@monaco-editor/react";

/**
 * Loads type definitions from WebContainer's node_modules into Monaco's
 * TypeScript language service, enabling real IntelliSense and type checking.
 * 
 * After npm install completes in the WebContainer, this reads .d.ts files
 * from common packages and feeds them to Monaco via addExtraLib().
 */

// Common packages whose types we should load
const TYPE_PACKAGES = [
    // @types/* packages (DefinitelyTyped)
    { typesPath: "node_modules/@types/react/index.d.ts", module: "react" },
    { typesPath: "node_modules/@types/react/global.d.ts", module: "react/global" },
    { typesPath: "node_modules/@types/react/jsx-runtime.d.ts", module: "react/jsx-runtime" },
    { typesPath: "node_modules/@types/react-dom/index.d.ts", module: "react-dom" },
    { typesPath: "node_modules/@types/react-dom/client.d.ts", module: "react-dom/client" },
    { typesPath: "node_modules/@types/node/index.d.ts", module: "node" },
    { typesPath: "node_modules/@types/node/fs.d.ts", module: "fs" },
    { typesPath: "node_modules/@types/node/path.d.ts", module: "path" },
    { typesPath: "node_modules/@types/node/http.d.ts", module: "http" },
    // Bundled types from packages themselves
    { typesPath: "node_modules/next/types/index.d.ts", module: "next" },
    { typesPath: "node_modules/next/image.d.ts", module: "next/image" },
    { typesPath: "node_modules/next/link.d.ts", module: "next/link" },
    { typesPath: "node_modules/next/router.d.ts", module: "next/router" },
    { typesPath: "node_modules/next/navigation.d.ts", module: "next/navigation" },
    { typesPath: "node_modules/typescript/lib/lib.es2015.d.ts", module: "lib.es2015" },
    { typesPath: "node_modules/typescript/lib/lib.dom.d.ts", module: "lib.dom" },
];

/**
 * Reads a file from the WebContainer filesystem, returning null if not found.
 */
async function safeReadFile(wc: any, path: string): Promise<string | null> {
    try {
        return await wc.fs.readFile(path, "utf-8");
    } catch {
        return null;
    }
}

/**
 * Lists entries in a WebContainer directory, returning empty array if not found.
 */
async function safeReadDir(wc: any, path: string): Promise<string[]> {
    try {
        const entries = await wc.fs.readdir(path);
        return entries;
    } catch {
        return [];
    }
}

/**
 * Recursively reads all .d.ts files from a directory in the WebContainer.
 * Returns an array of { path, content } objects.
 */
async function readDtsFilesRecursively(
    wc: any,
    basePath: string,
    maxDepth: number = 3,
    currentDepth: number = 0
): Promise<{ path: string; content: string }[]> {
    if (currentDepth >= maxDepth) return [];

    const results: { path: string; content: string }[] = [];
    const entries = await safeReadDir(wc, basePath);

    for (const entry of entries) {
        const fullPath = `${basePath}/${entry}`;

        if (entry.endsWith(".d.ts")) {
            const content = await safeReadFile(wc, fullPath);
            if (content) {
                results.push({ path: fullPath, content });
            }
        } else if (!entry.includes(".") && entry !== "node_modules") {
            // Likely a directory — recurse
            const subResults = await readDtsFilesRecursively(wc, fullPath, maxDepth, currentDepth + 1);
            results.push(...subResults);
        }
    }

    return results;
}

/**
 * Main function: loads type definitions from WebContainer node_modules into Monaco.
 * Call this after `npm install` completes successfully.
 * 
 * @param wc - The WebContainer instance
 * @param monaco - The Monaco editor instance
 * @returns Number of type files loaded
 */
export async function loadTypesFromWebContainer(
    wc: any,
    monaco: Monaco
): Promise<number> {
    const tsDefaults = monaco.languages.typescript.typescriptDefaults;
    const jsDefaults = monaco.languages.typescript.javascriptDefaults;
    let loadedCount = 0;

    console.log("🔧 [TypeLoader] Loading type definitions from WebContainer...");

    // 1. Load known type packages
    for (const pkg of TYPE_PACKAGES) {
        const content = await safeReadFile(wc, pkg.typesPath);
        if (content) {
            const uri = `file:///node_modules/${pkg.module}/index.d.ts`;
            tsDefaults.addExtraLib(content, uri);
            jsDefaults.addExtraLib(content, uri);
            loadedCount++;
        }
    }

    // 2. Scan @types directory for any additional type packages
    const typesPackages = await safeReadDir(wc, "node_modules/@types");
    for (const pkg of typesPackages) {
        // Skip if we already loaded it above
        if (["react", "react-dom", "node"].includes(pkg)) continue;

        const indexPath = `node_modules/@types/${pkg}/index.d.ts`;
        const content = await safeReadFile(wc, indexPath);
        if (content) {
            const uri = `file:///node_modules/@types/${pkg}/index.d.ts`;
            tsDefaults.addExtraLib(content, uri);
            jsDefaults.addExtraLib(content, uri);
            loadedCount++;
        }
    }

    // 3. Scan top-level node_modules for packages with bundled types
    const topPackages = await safeReadDir(wc, "node_modules");
    for (const pkg of topPackages) {
        // Skip special dirs and @types (already handled)
        if (pkg.startsWith(".") || pkg.startsWith("@") || pkg === "typescript") continue;

        // Check if package has a types field in package.json
        const pkgJsonStr = await safeReadFile(wc, `node_modules/${pkg}/package.json`);
        if (pkgJsonStr) {
            try {
                const pkgJson = JSON.parse(pkgJsonStr);
                const typesFile = pkgJson.types || pkgJson.typings;
                if (typesFile) {
                    const typesPath = `node_modules/${pkg}/${typesFile}`;
                    const content = await safeReadFile(wc, typesPath);
                    if (content) {
                        const uri = `file:///node_modules/${pkg}/index.d.ts`;
                        tsDefaults.addExtraLib(content, uri);
                        jsDefaults.addExtraLib(content, uri);
                        loadedCount++;
                    }
                }
            } catch {
                // Invalid package.json, skip
            }
        }
    }

    // 4. Now that types are loaded, enable semantic validation
    tsDefaults.setDiagnosticsOptions({
        noSemanticValidation: false,  // Enable — we have types now!
        noSyntaxValidation: false,
        noSuggestionDiagnostics: false,
    });
    jsDefaults.setDiagnosticsOptions({
        noSemanticValidation: false,
        noSyntaxValidation: false,
        noSuggestionDiagnostics: false,
    });

    console.log(`✅ [TypeLoader] Loaded ${loadedCount} type definition files`);
    return loadedCount;
}

/**
 * Resets Monaco diagnostics back to suppressed mode (before types are loaded).
 */
export function suppressMonacoDiagnostics(monaco: Monaco) {
    const diagnosticsOptions = {
        noSemanticValidation: true,
        noSyntaxValidation: false,
        noSuggestionDiagnostics: true,
    };
    monaco.languages.typescript.typescriptDefaults.setDiagnosticsOptions(diagnosticsOptions);
    monaco.languages.typescript.javascriptDefaults.setDiagnosticsOptions(diagnosticsOptions);
}
