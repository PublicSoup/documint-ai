import fs from 'fs';
import path from 'path';

function getFiles(dir, fileList = []) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    if (file.startsWith('.') || ['node_modules', 'public'].includes(file)) continue;

    const fullPath = path.join(dir, file);
    try {
      if (fs.statSync(fullPath).isDirectory()) {
        getFiles(fullPath, fileList);
      } else {
        if (['.ts', '.tsx', '.js', '.jsx', '.json', '.prisma', '.md'].includes(path.extname(file))) {
          fileList.push(fullPath);
        }
      }
    } catch (e) {
      // Ignore EPERM or other errors on files
    }
  }
  return fileList;
}

const rootDir = process.cwd();
const files = getFiles(rootDir);

let indexContent = '# Codebase Index\n\nGenerated automatically to simulate IDE indexing.\n\n';

for (const file of files) {
  const relativePath = path.relative(rootDir, file);
  const ext = path.extname(file);
  let summary = '';

  if (ext === '.ts' || ext === '.tsx' || ext === '.js' || ext === '.jsx') {
    const content = fs.readFileSync(file, 'utf-8');
    const exports = [...content.matchAll(/export\s+(?:default\s+)?(?:const|function|class|interface|type)\s+([a-zA-Z0-9_]+)/g)].map(m => m[1]);
    const imports = [...content.matchAll(/import\s+.*?\s+from\s+['"]([^'"]+)['"]/g)].map(m => m[1]).filter(i => i.startsWith('.') || i.startsWith('@/'));

    if (exports.length > 0) summary += `- **Exports**: ${exports.join(', ')}\n`;
    if (imports.length > 0) summary += `- **Internal Imports**: ${imports.join(', ')}\n`;
  }

  indexContent += `## \`${relativePath}\`\n${summary || '- (Data or descriptive file)\n'}\n`;
}

fs.writeFileSync('CODEBASE_INDEX.md', indexContent);
console.log('Successfully generated CODEBASE_INDEX.md');
