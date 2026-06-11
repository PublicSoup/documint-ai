// Shared file tree utilities used by both the dashboard file tree and the IDE.
// Extracted from src/components/ide/enhanced-file-tree.tsx to avoid duplication.

export interface TreeNode {
    id: string;
    name: string;
    path: string;
    type: "file" | "folder";
    children?: TreeNode[];
    /** Only present on leaf nodes that map to a real DB file */
    fileId?: string;
}

interface FileLike {
    id: string;
    name: string;
    language?: string | null;
}

/**
 * Normalize a file path: strip leading slashes, collapse `..` and `.`, remove
 * trailing slashes.
 */
function normalizePath(p: string): string {
    return p.replace(/^\/+/, "").replace(/\/+$/, "");
}

/**
 * Build a nested tree structure from a flat array of files whose `name` field
 * is a slash-delimited path (e.g. `src/components/App.tsx`).
 *
 * Files that look like folders (ending in `/` or with language `"folder"`) are
 * treated as folder nodes; all others are leaves.
 */
export function buildFileTree(files: FileLike[]): TreeNode[] {
    const tree: TreeNode[] = [];
    const folderMap = new Map<string, TreeNode>();

    const getOrCreateFolder = (path: string, parentPath = ""): TreeNode => {
        const fullPath = parentPath ? `${parentPath}/${path}` : path;

        if (folderMap.has(fullPath)) {
            return folderMap.get(fullPath)!;
        }

        const folder: TreeNode = {
            id: fullPath,
            name: path,
            path: fullPath,
            type: "folder",
            children: [],
        };
        folderMap.set(fullPath, folder);

        if (parentPath) {
            const parent = folderMap.get(parentPath);
            if (parent && parent.children) {
                parent.children.push(folder);
            }
        } else {
            tree.push(folder);
        }

        return folder;
    };

    // Root folder
    const rootFolder = getOrCreateFolder("Project");

    files.forEach((file) => {
        const rawName = file.name.endsWith("/") ? file.name.slice(0, -1) : file.name;
        const normalizedName = normalizePath(rawName);
        const pathParts = normalizedName.split("/").filter(Boolean);
        if (pathParts.length === 0) return;

        const fileName = pathParts[pathParts.length - 1];
        const folderParts = pathParts.slice(0, -1);

        let currentFolder = rootFolder;
        let currentPath = "Project";

        for (const folderName of folderParts) {
            const existingFolder = currentFolder.children?.find(
                (child) => child.type === "folder" && child.name === folderName
            );

            if (existingFolder) {
                currentFolder = existingFolder;
                currentPath = existingFolder.id;
            } else {
                currentFolder = getOrCreateFolder(folderName, currentPath);
                currentPath = currentFolder.id;
            }
        }

        if (file.language === "folder" || file.name.endsWith("/")) {
            getOrCreateFolder(fileName, currentPath);
            return;
        }

        const fileNode: TreeNode = {
            id: file.id,
            name: fileName,
            path: normalizedName,
            type: "file",
            fileId: file.id,
        };

        if (currentFolder.children) {
            currentFolder.children.push(fileNode);
        }
    });

    return sortTree(tree);
}

/**
 * Sort a tree: folders first, then alphabetical within each group.
 */
export function sortTree(nodes: TreeNode[]): TreeNode[] {
    return nodes
        .map((node) => ({
            ...node,
            children: node.children ? sortTree(node.children) : undefined,
        }))
        .sort((a, b) => {
            if (a.type !== b.type) return a.type === "folder" ? -1 : 1;
            return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
        });
}

/**
 * Find a node in the tree by its `id`.
 */
export function findNodeById(tree: TreeNode[], id: string): TreeNode | null {
    for (const node of tree) {
        if (node.id === id) return node;
        if (node.children) {
            const found = findNodeById(node.children, id);
            if (found) return found;
        }
    }
    return null;
}

/**
 * Find a node in the tree by its `path`.
 */
export function findNodeByPath(tree: TreeNode[], path: string): TreeNode | null {
    for (const node of tree) {
        if (node.path === path) return node;
        if (node.children) {
            const found = findNodeByPath(node.children, path);
            if (found) return found;
        }
    }
    return null;
}

/**
 * Count total files in a tree.
 */
export function countTreeFiles(tree: TreeNode[]): number {
    let count = 0;
    for (const node of tree) {
        if (node.type === "file") count++;
        if (node.children) count += countTreeFiles(node.children);
    }
    return count;
}

/**
 * Get the base file name from a slash-delimited path.
 */
export function getFileBaseName(filePath: string): string {
    return normalizePath(filePath).split("/").pop() || filePath;
}

/**
 * Filter a list of tree nodes by a search query.
 * Matches file names case-insensitively. Keeps parent folders that contain matches.
 */
export function filterTree(tree: TreeNode[], query: string): TreeNode[] {
    if (!query) return tree;

    const lowerQuery = query.toLowerCase();

    const filterNode = (node: TreeNode): TreeNode | null => {
        if (node.type === "file") {
            if (node.name.toLowerCase().includes(lowerQuery)) {
                return node;
            }
            return null;
        }

        if (node.children) {
            const filteredChildren = node.children
                .map((child) => filterNode(child))
                .filter(Boolean) as TreeNode[];

            if (filteredChildren.length > 0 || node.name.toLowerCase().includes(lowerQuery)) {
                return {
                    ...node,
                    children: filteredChildren,
                };
            }
        }

        return null;
    };

    return tree.map((node) => filterNode(node)).filter(Boolean) as TreeNode[];
}