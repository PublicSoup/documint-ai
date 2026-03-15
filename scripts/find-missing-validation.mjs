
import fs from 'fs/promises';
import path from 'path';

async function findMissingValidation(dir) {
    const results = [];
    const entries = await fs.readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            results.push(...await findMissingValidation(fullPath));
        } else if (entry.name === 'route.ts' || entry.name === 'route.tsx') {
            try {
                const content = await fs.readFile(fullPath, 'utf-8');
                const hasPost = /export\s+async\s+function\s+POST/.test(content);
                const hasPut = /export\s+async\s+function\s+PUT/.test(content);
                const hasZod = /from\s+['"]zod['"]/.test(content) || /import\s+\{\s*z\s*\}\s+from\s+['"]zod['"]/.test(content);

                if ((hasPost || hasPut) && !hasZod) {
                    results.push(fullPath);
                }
            } catch (error) {
                console.error(`Error reading file ${fullPath}:`, error);
            }
        }
    }
    return results;
}

const targetDir = process.argv[2] || 'src/app/api';

findMissingValidation(path.resolve(targetDir))
    .then(files => {
        if (files.length > 0) {
            console.log('Files with POST/PUT handlers but no Zod import:');
            files.forEach(file => console.log(file));
        } else {
            console.log('No files found with missing Zod validation.');
        }
    })
    .catch(err => {
        console.error('An error occurred:', err);
        process.exit(1);
    });
