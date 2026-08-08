import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const repoRoot = resolve(new URL('..', import.meta.url).pathname);
const pendingPath = resolve(repoRoot, 'src/data/pendingMedicationCarbohydrateRecords.json');
const approvedPath = resolve(repoRoot, 'src/data/approvedMedicationCarbohydrateRecords.json');
const rejectedPath = resolve(repoRoot, 'src/data/rejectedMedicationCarbohydrateRecords.json');

const extractionStatuses = new Set([
  'quantitative-value-found',
  'carbohydrate-ingredient-found-quantity-unknown',
  'no-carbohydrate-ingredient-identified',
  'ambiguous-source-text',
  'manual-review-required',
]);

const approvalStatuses = new Set(['pending', 'approved', 'rejected', 'archived']);
const normalizedDosageForms = new Set([
  'Oral solution',
  'Oral suspension',
  'Syrup',
  'Chewable tablet',
  'Orally disintegrating tablet',
  'Powder',
  'Granules',
  'Other',
  'Suspension',
]);
const ingredientQuantityStatuses = new Set(['quantity-published', 'quantity-unknown']);
const nonNutritiveSweetenerNames = new Set([
  'sucralose',
  'aspartame',
  'acesulfame potassium',
  'acesulfame k',
  'saccharin',
  'sodium saccharin',
  'stevia',
  'steviol glycosides',
  'neotame',
  'advantame',
]);

async function readRecords(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}

function requireField(errors, record, field) {
  if (!String(record[field] ?? '').trim()) errors.push(`${record.id || 'record'}: ${field} is required.`);
}

function validateCarbohydrateDisplayValue(errors, record) {
  const value = String(record.carbohydrateDisplayValue ?? '').trim();
  if (!value) {
    errors.push(`${record.id}: carbohydrateDisplayValue is required. Use Not published when no quantitative amount is provided.`);
    return;
  }
  if (/^not\s+published$/i.test(value) && value !== 'Not published') {
    errors.push(`${record.id}: unavailable carbohydrate amount must be exactly Not published.`);
  }
  if (/^(amount not available|exact amount unavailable|quantity unknown|amount unavailable|amount not published)$/i.test(value)) {
    errors.push(`${record.id}: use Not published instead of alternate unavailable-amount wording.`);
  }
}

function validateRecord(record, expectedApprovalStatus) {
  const errors = [];
  [
    'id',
    'genericName',
    'manufacturer',
    'dosageForm',
    'originalDosageForm',
    'normalizedDosageForm',
    'productNdc',
    'sourceSetId',
    'sourceUrl',
    'sourceDate',
    'carbohydrateDisplayValue',
    'approvalStatus',
  ].forEach((field) => requireField(errors, record, field));
  validateCarbohydrateDisplayValue(errors, record);
  if (record.additionalReferences !== undefined && typeof record.additionalReferences !== 'string') {
    errors.push(`${record.id}: additionalReferences must be a string when provided.`);
  }

  if (!extractionStatuses.has(record.extractionStatus)) {
    errors.push(`${record.id}: invalid extractionStatus ${record.extractionStatus}.`);
  }

  if (!approvalStatuses.has(record.approvalStatus)) {
    errors.push(`${record.id}: invalid approvalStatus ${record.approvalStatus}.`);
  }

  if (!normalizedDosageForms.has(record.normalizedDosageForm)) {
    errors.push(`${record.id}: invalid normalizedDosageForm ${record.normalizedDosageForm}.`);
  }

  if (record.approvalStatus !== expectedApprovalStatus) {
    errors.push(`${record.id}: expected approvalStatus ${expectedApprovalStatus}.`);
  }

  if (!Array.isArray(record.carbohydrateIngredients)) {
    errors.push(`${record.id}: carbohydrateIngredients must be an array.`);
  } else {
    record.carbohydrateIngredients.forEach((ingredient, index) => {
      const prefix = `${record.id}: carbohydrateIngredients[${index}]`;
      ['normalizedName', 'sourceTerm', 'quantityStatus'].forEach((field) => {
        if (!String(ingredient[field] ?? '').trim()) errors.push(`${prefix}.${field} is required.`);
      });
      const ingredientNames = [
        ingredient.normalizedName,
        ingredient.sourceTerm,
      ].map((value) => String(value || '').toLowerCase().replace(/\s+/g, ' ').trim());
      if (ingredientNames.some((name) => nonNutritiveSweetenerNames.has(name))) {
        errors.push(`${prefix}: non-nutritive sweeteners must not be stored in carbohydrateIngredients.`);
      }
      if (!ingredientQuantityStatuses.has(ingredient.quantityStatus)) {
        errors.push(`${prefix}.quantityStatus is invalid.`);
      }
      if (ingredient.quantityStatus === 'quantity-unknown' && (ingredient.amount !== null || ingredient.normalizedAmountMg !== null)) {
        errors.push(`${prefix}: unknown quantity ingredients must not store numeric amounts.`);
      }
    });
  }

  if (record.nonNutritiveSweeteners !== undefined) {
    if (!Array.isArray(record.nonNutritiveSweeteners)) {
      errors.push(`${record.id}: nonNutritiveSweeteners must be an array when present.`);
    } else {
      record.nonNutritiveSweeteners.forEach((sweetener, index) => {
        const prefix = `${record.id}: nonNutritiveSweeteners[${index}]`;
        ['normalizedName', 'sourceTerm'].forEach((field) => {
          if (!String(sweetener[field] ?? '').trim()) errors.push(`${prefix}.${field} is required.`);
        });
      });
    }
  }

  if (record.extractionStatus === 'quantitative-value-found') {
    const quantifiedIngredients = Array.isArray(record.carbohydrateIngredients)
      ? record.carbohydrateIngredients.filter((ingredient) => ingredient.quantityStatus === 'quantity-published')
      : [];
    if (!quantifiedIngredients.length && record.carbohydrateDisplayValue === 'Not published') {
      errors.push(`${record.id}: quantitative-value-found requires a published carbohydrateDisplayValue.`);
    }
  } else {
    if (record.publishedAmount !== null || record.normalizedAmountMg !== null) {
      errors.push(`${record.id}: unknown quantity statuses must not store numeric carbohydrate amounts.`);
    }
  }

  if (record.approvalStatus === 'approved') {
    ['reviewedBy', 'reviewedDate', 'sourceExcerpt'].forEach((field) => requireField(errors, record, field));
  }

  return errors;
}

async function main() {
  const [pending, approved, rejected] = await Promise.all([
    readRecords(pendingPath),
    readRecords(approvedPath),
    readRecords(rejectedPath),
  ]);

  const errors = [
    ...pending.flatMap((record) => validateRecord(record, 'pending')),
    ...approved.flatMap((record) => validateRecord(record, 'approved')),
    ...rejected.flatMap((record) => validateRecord(record, 'rejected')),
  ];

  const publicQuantitativeWithoutSource = approved.filter((record) => (
    record.extractionStatus === 'quantitative-value-found'
    && (!record.sourceUrl || !record.sourceDate || !record.sourceExcerpt)
  )).length;

  const summary = {
    pendingRecords: pending.length,
    approvedRecords: approved.length,
    rejectedRecords: rejected.length,
    publicQuantitativeWithoutSource,
    errors,
  };

  console.log(JSON.stringify(summary, null, 2));
  if (errors.length) process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
