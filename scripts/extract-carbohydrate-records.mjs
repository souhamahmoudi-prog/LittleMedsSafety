import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const repoRoot = resolve(new URL('..', import.meta.url).pathname);
const inputPath = resolve(repoRoot, 'src/data/dailymedProductImport.json');
const pendingPath = resolve(repoRoot, 'src/data/pendingMedicationCarbohydrateRecords.json');
const approvedPath = resolve(repoRoot, 'src/data/approvedMedicationCarbohydrateRecords.json');
const rejectedPath = resolve(repoRoot, 'src/data/rejectedMedicationCarbohydrateRecords.json');

const carbohydrateIngredientDefinitions = [
  ['High fructose corn syrup', ['high fructose corn syrup']],
  ['Sorbitol', ['sorbitol solution', 'sorbitol']],
  ['Pregelatinized starch', ['pregelatinized starch']],
  ['Sodium starch glycolate', ['sodium starch glycolate']],
  ['Corn starch', ['corn starch', 'cornstarch']],
  ['Corn syrup', ['corn syrup']],
  ['Maltodextrin', ['maltodextrin']],
  ['Polydextrose', ['polydextrose']],
  ['Fructose', ['fructose']],
  ['Glucose', ['glucose']],
  ['Dextrose', ['dextrose']],
  ['Sucrose', ['sucrose']],
  ['Lactose', ['lactose']],
  ['Maltose', ['maltose']],
  ['Galactose', ['galactose']],
  ['Glycerin', ['glycerin', 'glycerine', 'glycerol']],
  ['Maltitol', ['maltitol']],
  ['Xylitol', ['xylitol']],
  ['Erythritol', ['erythritol']],
  ['Isomalt', ['isomalt']],
  ['Lactitol', ['lactitol']],
  ['Mannitol', ['mannitol']],
  ['Starch', ['starch']],
  ['Dextrin', ['dextrin']],
];

const nonNutritiveSweetenerDefinitions = [
  ['Acesulfame potassium', ['acesulfame potassium', 'acesulfame k']],
  ['Sodium saccharin', ['sodium saccharin']],
  ['Steviol glycosides', ['steviol glycosides']],
  ['Sucralose', ['sucralose']],
  ['Aspartame', ['aspartame']],
  ['Saccharin', ['saccharin']],
  ['Stevia', ['stevia']],
  ['Neotame', ['neotame']],
  ['Advantame', ['advantame']],
];

const carbohydrateTerms = carbohydrateIngredientDefinitions.flatMap(([, terms]) => terms);
const escapedTerms = carbohydrateTerms
  .sort((a, b) => b.length - a.length)
  .map(escapeRegExp)
  .join('|');
const termPattern = new RegExp(`\\b(${escapedTerms})\\b`, 'i');
const globalTermPattern = new RegExp(`\\b(${escapedTerms})\\b`, 'gi');
const nonNutritiveSweetenerTerms = nonNutritiveSweetenerDefinitions.flatMap(([, terms]) => terms);
const escapedSweetenerTerms = nonNutritiveSweetenerTerms
  .sort((a, b) => b.length - a.length)
  .map(escapeRegExp)
  .join('|');
const globalSweetenerPattern = new RegExp(`\\b(${escapedSweetenerTerms})\\b`, 'gi');
const quantitativePatterns = [
  new RegExp(`(?:contains|contain|containing|each|per)\\s+[^.]{0,140}?\\b(\\d+(?:\\.\\d+)?)\\s*(mg|g|mcg)\\b[^.]{0,140}?\\b(${escapedTerms}|total carbohydrate)\\b[^.]{0,120}?\\b(per|/|in each|each)\\s*([^.;]{1,80})`, 'i'),
  new RegExp(`\\b(${escapedTerms}|total carbohydrate)\\b[^.]{0,140}?\\b(\\d+(?:\\.\\d+)?)\\s*(mg|g|mcg)\\b[^.]{0,120}?\\b(per|/|in each|each)\\s*([^.;]{1,80})`, 'i'),
  new RegExp(`\\b(each\\s+[^.]{1,80}?)\\s+(?:contains|contain)\\s+(\\d+(?:\\.\\d+)?)\\s*(mg|g|mcg)\\b\\s*(?:of\\s+)?\\b(${escapedTerms}|total carbohydrate)\\b`, 'i'),
];

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function slug(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 130);
}

function parseTitle(title) {
  const labelerMatch = title.match(/\[([^\]]+)\]\s*$/);
  const manufacturer = labelerMatch?.[1] || '';
  const productTitle = title.replace(/\s*\[[^\]]+\]\s*$/, '').trim();
  const genericMatch = productTitle.match(/\(([^)]+)\)/);
  const genericName = genericMatch?.[1]?.split(',')[0]?.trim() || productTitle.split(/\s+/)[0] || '';
  const brandName = productTitle
    .replace(/\s*\([^)]+\)/, '')
    .split(/\s+(TABLET|CAPSULE|SOLUTION|SUSPENSION|POWDER|LIQUID|ELIXIR|SYRUP|GRANULE|FILM|CONCENTRATE|KIT)/i)[0]
    .trim();
  const dosageForm = (productTitle.match(/\b(TABLET[^,;]*|CAPSULE[^,;]*|SOLUTION[^,;]*|SUSPENSION[^,;]*|POWDER[^,;]*|LIQUID[^,;]*|ELIXIR[^,;]*|SYRUP[^,;]*|GRANULE[^,;]*|FILM[^,;]*|CONCENTRATE[^,;]*|KIT[^,;]*)/i)?.[1] || 'unparsed').toLowerCase();
  const route = (productTitle.match(/\b(ORAL|INTRAVENOUS|TOPICAL|RECTAL|INHALATION|NASAL|OPHTHALMIC|OTIC)\b/i)?.[1] || '').toLowerCase();
  const strength = productTitle.match(/\b\d+(?:\.\d+)?\s*(?:mg|g|mcg|units?|unit)\s*(?:\/\s*\d+(?:\.\d+)?\s*(?:mL|tablet|capsule|dose))?/i)?.[0] || '';
  return { genericName, brandName, manufacturer, dosageForm, route, strength };
}

function normalizeOrganizationName(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function displayManufacturerName(label, titleFields) {
  return normalizeOrganizationName(label.packagerName)
    || normalizeOrganizationName(label.labelerName)
    || normalizeOrganizationName(label.manufacturerName)
    || normalizeOrganizationName(label.distributorName)
    || normalizeOrganizationName(label.displayManufacturerName)
    || normalizeOrganizationName(titleFields.manufacturer)
    || 'Organization not parsed';
}

function excerptAround(text, matchIndex) {
  const start = Math.max(0, matchIndex - 260);
  const end = Math.min(text.length, matchIndex + 520);
  return text.slice(start, end).replace(/\s+/g, ' ').trim();
}

function normalizeIngredientName(sourceTerm) {
  const normalizedTerm = String(sourceTerm || '').toLowerCase().replace(/\s+/g, ' ').trim();
  for (const [normalizedName, terms] of carbohydrateIngredientDefinitions) {
    if (terms.includes(normalizedTerm)) return normalizedName;
  }
  return normalizedTerm.replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function normalizeSweetenerName(sourceTerm) {
  const normalizedTerm = String(sourceTerm || '').toLowerCase().replace(/\s+/g, ' ').trim();
  for (const [normalizedName, terms] of nonNutritiveSweetenerDefinitions) {
    if (terms.includes(normalizedTerm)) return normalizedName;
  }
  return normalizedTerm.replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function findQuantitativeMatch(text) {
  for (const pattern of quantitativePatterns) {
    const match = text.match(pattern);
    if (!match) continue;

    if (pattern === quantitativePatterns[2]) {
      return {
        index: match.index || 0,
        ingredient: match[4],
        amount: Number(match[2]),
        unit: match[3],
        basis: match[1],
      };
    }

    const firstGroupIsAmount = /^\d/.test(match[1]);
    return {
      index: match.index || 0,
      ingredient: firstGroupIsAmount ? match[3] : match[1],
      amount: Number(firstGroupIsAmount ? match[1] : match[2]),
      unit: firstGroupIsAmount ? match[2] : match[3],
      basis: firstGroupIsAmount ? `${match[4]} ${match[5]}` : `${match[4]} ${match[5]}`,
    };
  }
  return null;
}

function findQuantitativeMatchForIngredient(text, sourceTerm) {
  const escapedSourceTerm = escapeRegExp(sourceTerm);
  const patterns = [
    new RegExp(`\\b(${escapedSourceTerm})\\b[^.]{0,140}?\\b(\\d+(?:\\.\\d+)?)\\s*(mg|g|mcg)\\b[^.]{0,120}?\\b(per|/|in each|each)\\s*([^.;]{1,80})`, 'i'),
    new RegExp(`(?:contains|contain|containing|each|per)\\s+[^.]{0,140}?\\b(\\d+(?:\\.\\d+)?)\\s*(mg|g|mcg)\\b[^.]{0,140}?\\b(${escapedSourceTerm})\\b[^.]{0,120}?\\b(per|/|in each|each)\\s*([^.;]{1,80})`, 'i'),
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (!match) continue;
    const termFirst = match[1]?.toLowerCase() === sourceTerm.toLowerCase();
    return {
      index: match.index || 0,
      amount: Number(termFirst ? match[2] : match[1]),
      unit: termFirst ? match[3] : match[2],
      basis: termFirst ? `${match[4]} ${match[5]}` : `${match[4]} ${match[5]}`,
    };
  }

  return null;
}

function normalizeAmountMg(amount, unit) {
  if (!Number.isFinite(amount)) return null;
  if (unit.toLowerCase() === 'g') return amount * 1000;
  if (unit.toLowerCase() === 'mcg') return amount / 1000;
  if (unit.toLowerCase() === 'mg') return amount;
  return null;
}

function extractCarbohydrateIngredients(text) {
  const matches = [];
  const seen = new Set();

  for (const match of String(text || '').matchAll(globalTermPattern)) {
    const sourceTerm = match[0];
    const normalizedName = normalizeIngredientName(sourceTerm);
    const key = `${normalizedName.toLowerCase()}|${sourceTerm.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const quantitative = findQuantitativeMatchForIngredient(text, sourceTerm);
    matches.push({
      normalizedName,
      sourceTerm,
      sourceExcerpt: excerptAround(text, match.index || 0),
      amount: quantitative?.amount ?? null,
      amountUnit: quantitative?.unit || '',
      amountBasis: quantitative?.basis?.replace(/\s+/g, ' ').trim() || '',
      normalizedAmountMg: quantitative ? normalizeAmountMg(quantitative.amount, quantitative.unit) : null,
      normalizedBasis: quantitative?.basis?.replace(/\s+/g, ' ').trim() || '',
      quantityStatus: quantitative ? 'quantity-published' : 'quantity-unknown',
    });
  }

  return matches;
}

function extractNonNutritiveSweeteners(text) {
  const matches = [];
  const seen = new Set();

  for (const match of String(text || '').matchAll(globalSweetenerPattern)) {
    const sourceTerm = match[0];
    const normalizedName = normalizeSweetenerName(sourceTerm);
    const key = `${normalizedName.toLowerCase()}|${sourceTerm.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);

    matches.push({
      normalizedName,
      sourceTerm,
      sourceExcerpt: excerptAround(text, match.index || 0),
    });
  }

  return matches;
}

function recordForProduct({ seed, label, titleFields, productNdc, packageRow, extraction }) {
  const setId = label.setId || label.setid || '';
  const sourceUrl = label.sourceUrl || label.labelUrl || '';
  const sourceDate = label.sourceDate || label.publishedDate || '';
  const text = label.completeRelevantLabelText || label.labelText || '';
  const quantitativeSearchText = label.inactiveIngredientText || '';
  const carbohydrateIngredients = extractCarbohydrateIngredients(quantitativeSearchText);
  const nonNutritiveSweeteners = extractNonNutritiveSweeteners(quantitativeSearchText);
  let quantitativeIngredient = null;
  for (const ingredient of carbohydrateIngredients) {
    if (ingredient.quantityStatus === 'quantity-published') {
      quantitativeIngredient = ingredient;
      break;
    }
  }
  const sourceExcerpt = [
    ...carbohydrateIngredients.map((ingredient) => ingredient.sourceExcerpt),
    ...nonNutritiveSweeteners.map((sweetener) => sweetener.sourceExcerpt),
  ].filter(Boolean).join('\n\n');

  const displayManufacturer = displayManufacturerName(label, titleFields);
  const extractionStatus = carbohydrateIngredients.some((ingredient) => ingredient.quantityStatus === 'quantity-published')
    ? 'quantitative-value-found'
    : carbohydrateIngredients.length
      ? 'carbohydrate-ingredient-found-quantity-unknown'
      : 'manual-review-required';

  return {
    id: slug([
      seed.genericName,
      displayManufacturer,
      titleFields.brandName,
      titleFields.strength,
      titleFields.dosageForm,
      productNdc,
      packageRow.packageNdc,
      setId,
    ].filter(Boolean).join('-')),
    genericName: seed.genericName,
    brandName: titleFields.brandName,
    manufacturer: displayManufacturer,
    labelerName: normalizeOrganizationName(label.labelerName),
    packagerName: normalizeOrganizationName(label.packagerName),
    manufacturerName: normalizeOrganizationName(label.manufacturerName),
    distributorName: normalizeOrganizationName(label.distributorName),
    brandOwnerName: normalizeOrganizationName(label.brandOwnerName),
    organizationText: label.organizationText || '',
    strength: label.strength || titleFields.strength,
    dosageForm: label.originalDosageForm || titleFields.dosageForm,
    originalDosageForm: label.originalDosageForm || titleFields.dosageForm,
    normalizedDosageForm: label.normalizedDosageForm || titleFields.dosageForm,
    route: titleFields.route,
    productNdc,
    packageNdc: packageRow.packageNdc || '',
    packageDescription: packageRow.packageDescription || '',
    carbohydrateIngredients,
    nonNutritiveSweeteners,
    publishedAmount: quantitativeIngredient?.amount ?? null,
    publishedUnit: quantitativeIngredient?.amountUnit || '',
    publishedBasis: quantitativeIngredient?.amountBasis || '',
    normalizedAmountMg: quantitativeIngredient?.normalizedAmountMg ?? null,
    normalizedBasis: quantitativeIngredient?.normalizedBasis || '',
    extractionStatus,
    sourceSetId: setId,
    sourceLabelTitle: label.title || '',
    sourceUrl,
    sourceDate,
    inactiveIngredientText: label.inactiveIngredientText || '',
    sourceExcerpt,
    reviewedBy: '',
    reviewedDate: '',
    approvalStatus: 'pending',
    notes: quantitativeIngredient
      ? 'Automated candidate only. Pharmacist must verify the exact source text before approval.'
      : 'Automated extraction only. No quantity was inferred.',
  };
}

async function readJsonIfExists(path, fallback) {
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch {
    return fallback;
  }
}

function defaultPendingNotes(record) {
  return record.extractionStatus === 'quantitative-value-found'
    ? 'Automated candidate only. Pharmacist must verify the exact source text before approval.'
    : 'Automated extraction only. No quantity was inferred.';
}

function preservePendingReviewFields(generatedRecord, existingRecord) {
  if (!existingRecord || existingRecord.approvalStatus !== 'pending') return generatedRecord;
  const generatedNotes = defaultPendingNotes(generatedRecord);
  const preserved = { ...generatedRecord };

  for (const field of ['reviewedBy', 'reviewedDate']) {
    if (String(existingRecord[field] || '').trim()) preserved[field] = existingRecord[field];
  }

  if (
    String(existingRecord.notes || '').trim()
    && existingRecord.notes !== generatedNotes
    && !/^Automated (candidate|extraction) only\./.test(existingRecord.notes)
  ) {
    preserved.notes = existingRecord.notes;
  }

  if (Array.isArray(existingRecord.carbohydrateIngredients) && existingRecord.carbohydrateIngredients.length) {
    preserved.carbohydrateIngredients = existingRecord.carbohydrateIngredients;
    const quantifiedIngredient = preserved.carbohydrateIngredients.find((ingredient) => ingredient.quantityStatus === 'quantity-published');
    preserved.publishedAmount = quantifiedIngredient?.amount ?? null;
    preserved.publishedUnit = quantifiedIngredient?.amountUnit || '';
    preserved.publishedBasis = quantifiedIngredient?.amountBasis || '';
    preserved.normalizedAmountMg = quantifiedIngredient?.normalizedAmountMg ?? null;
    preserved.normalizedBasis = quantifiedIngredient?.normalizedBasis || '';
    preserved.extractionStatus = quantifiedIngredient
      ? 'quantitative-value-found'
      : preserved.carbohydrateIngredients.length
        ? 'carbohydrate-ingredient-found-quantity-unknown'
        : generatedRecord.extractionStatus;
    preserved.sourceExcerpt = preserved.carbohydrateIngredients
      .map((ingredient) => ingredient.sourceExcerpt)
      .filter(Boolean)
      .join('\n\n') || generatedRecord.sourceExcerpt;
  }

  return preserved;
}

async function main() {
  const imported = JSON.parse(await readFile(inputPath, 'utf8'));
  const existingPending = await readJsonIfExists(pendingPath, []);
  const existingPendingById = new Map(existingPending.map((record) => [record.id, record]));
  const pending = [];

  for (const medication of imported.medications || []) {
    for (const label of medication.labels || []) {
      const titleFields = parseTitle(label.title || '');
      const productNdcs = label.productNdcs?.length ? label.productNdcs : label.ndcs?.length ? label.ndcs : [''];
      const packages = label.packaging?.length
        ? label.packaging.map((row) => ({
            packageNdc: row.packageNdc || row.ndc || '',
            packageDescription: row.packageDescription || row.description || '',
          }))
        : [{ packageNdc: '', packageDescription: '' }];

      for (const productNdc of productNdcs) {
        const matchingPackage = packages.find((row) => row.packageNdc?.startsWith(productNdc)) || packages[0];
        const generatedRecord = recordForProduct({
          seed: medication.seed,
          label,
          titleFields,
          productNdc,
          packageRow: matchingPackage,
        });
        pending.push(preservePendingReviewFields(generatedRecord, existingPendingById.get(generatedRecord.id)));
      }
    }
  }

  const approved = await readJsonIfExists(approvedPath, []);
  const rejected = await readJsonIfExists(rejectedPath, []);

  await mkdir(dirname(pendingPath), { recursive: true });
  await writeFile(pendingPath, `${JSON.stringify(pending, null, 2)}\n`);
  await writeFile(approvedPath, `${JSON.stringify(approved.filter((record) => record.approvalStatus === 'approved'), null, 2)}\n`);
  await writeFile(rejectedPath, `${JSON.stringify(rejected, null, 2)}\n`);

  const extractionStatusCounts = pending.reduce((counts, record) => {
    counts[record.extractionStatus] = (counts[record.extractionStatus] || 0) + 1;
    return counts;
  }, {});

  console.log(JSON.stringify({
    pendingPath,
    approvedPath,
    rejectedPath,
    productLabelsImported: (imported.medications || []).reduce((sum, medication) => sum + (medication.labels || []).length, 0),
    recordsExtracted: pending.length,
    extractionStatusCounts,
    approvedRecordsPublished: approved.filter((record) => record.approvalStatus === 'approved').length,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
