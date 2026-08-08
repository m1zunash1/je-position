import { readFile, writeFile } from 'node:fs/promises';

const [sourcePath = '/tmp/je-nichiei.csv', outputPath = 'sheet-data.js'] = process.argv.slice(2);
const csv = (await readFile(sourcePath, 'utf8')).replace(/`/g, '\\`').replace(/\$\{/g, '\\${');
await writeFile(outputPath, `const EMBEDDED_SHEET_CSV = \`${csv}\`;\n`, 'utf8');
