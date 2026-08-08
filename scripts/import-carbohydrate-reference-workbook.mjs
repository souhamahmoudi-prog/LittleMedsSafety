import { execFile } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const repoRoot = resolve(new URL('..', import.meta.url).pathname);
const workbookPath = resolve(repoRoot, 'src/data/carbohydrate-reference.xlsx');
const outputPath = resolve(repoRoot, 'src/data/carbohydrateReferenceWorkbookRecords.json');
const medicationDatabaseSheet = 'xl/worksheets/sheet1.xml';

const columnMap = {
  'generic medication': 'genericMedication',
  'brand name': 'brandName',
  'manufacturer / labeler': 'manufacturerLabeler',
  strength: 'strength',
  'dosage form': 'dosageForm',
  'product ndc': 'productNdc',
  'package ndc': 'packageNdc',
  'carbohydrate amount': 'carbohydrateAmount',
  'carbohydrate-contributing ingredients': 'carbohydrateContributingIngredients',
  'non-carbohydrate sweeteners': 'nonCarbohydrateSweeteners',
  'primary source type': 'primarySourceType',
  'primary source url': 'primarySourceUrl',
  'additional references': 'additionalReferences',
  'source date': 'sourceDate',
  'reviewed date': 'reviewedDate',
  'review status': 'reviewStatus',
  'reviewer notes': 'reviewerNotes',
};

async function readWorkbookEntry(entryPath) {
  const { stdout } = await execFileAsync('unzip', ['-p', workbookPath, entryPath], {
    maxBuffer: 32 * 1024 * 1024,
  });
  return stdout;
}

function decodeXml(value) {
  return String(value || '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

function parseSharedStrings(xml) {
  return [...xml.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)].map((match) => {
    const textRuns = [...match[1].matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)]
      .map((textMatch) => decodeXml(textMatch[1]));
    return textRuns.join('');
  });
}

function columnIndex(cellReference) {
  const letters = String(cellReference || '').match(/[A-Z]+/)?.[0] || '';
  return [...letters].reduce((index, letter) => index * 26 + letter.charCodeAt(0) - 64, 0) - 1;
}

function cellValue(cellXml, sharedStrings) {
  const type = cellXml.match(/\bt="([^"]+)"/)?.[1] || '';
  if (type === 'inlineStr') {
    return decodeXml([...cellXml.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map((match) => match[1]).join(''));
  }

  const rawValue = cellXml.match(/<v>([\s\S]*?)<\/v>/)?.[1] || '';
  if (!rawValue) return '';
  if (type === 's') return sharedStrings[Number(rawValue)] || '';
  return decodeXml(rawValue);
}

function parseRows(sheetXml, sharedStrings) {
  return [...sheetXml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)].map((rowMatch) => {
    const rowNumber = Number(rowMatch[0].match(/\br="(\d+)"/)?.[1] || 0);
    const cells = [];
    for (const cellMatch of rowMatch[1].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const ref = cellMatch[1].match(/\br="([^"]+)"/)?.[1] || '';
      cells[columnIndex(ref)] = cellValue(cellMatch[0], sharedStrings).replace(/\s+/g, ' ').trim();
    }
    return {
      rowNumber,
      cells: Array.from({ length: cells.length }, (_, index) => cells[index] || ''),
    };
  });
}

function normalizeHeader(value) {
  return String(value || '').toLowerCase().replace(/\s+/g, ' ').trim();
}

function mapMedicationDatabaseRows(rows) {
  const headerIndex = rows.findIndex((row) => row.cells.some((cell) => normalizeHeader(cell) === 'generic medication'));
  if (headerIndex === -1) {
    throw new Error('Could not find the Medication Database header row in carbohydrate-reference.xlsx.');
  }

  const headers = rows[headerIndex].cells.map((header) => columnMap[normalizeHeader(header)] || '');
  return rows.slice(headerIndex + 1).flatMap((row) => {
    const record = { workbookRow: row.rowNumber };
    headers.forEach((key, cellIndex) => {
      if (key) record[key] = row.cells[cellIndex] || '';
    });

    const hasMedication = String(record.genericMedication || '').trim();
    const hasReference = String(record.primarySourceUrl || record.carbohydrateAmount || record.carbohydrateContributingIngredients || '').trim();
    return hasMedication && hasReference ? [record] : [];
  });
}

async function main() {
  const [sharedStringsXml, sheetXml] = await Promise.all([
    readWorkbookEntry('xl/sharedStrings.xml'),
    readWorkbookEntry(medicationDatabaseSheet),
  ]);
  const rows = parseRows(sheetXml, parseSharedStrings(sharedStringsXml));
  const records = mapMedicationDatabaseRows(rows);

  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(records, null, 2)}\n`);

  const quantitativeRecords = records.filter((record) => {
    const value = String(record.carbohydrateAmount || '').trim();
    return value && value !== 'Not published';
  }).length;

  console.log(JSON.stringify({
    workbookPath,
    outputPath,
    recordsImported: records.length,
    quantitativeRecords,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
