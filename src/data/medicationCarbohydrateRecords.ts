import approvedRecords from './approvedMedicationCarbohydrateRecords.json';
import pendingRecords from './pendingMedicationCarbohydrateRecords.json';
import rejectedRecords from './rejectedMedicationCarbohydrateRecords.json';

export const extractionStatuses = [
  'quantitative-value-found',
  'carbohydrate-ingredient-found-quantity-unknown',
  'no-carbohydrate-ingredient-identified',
  'ambiguous-source-text',
  'manual-review-required',
] as const;

export const recordApprovalStatuses = [
  'pending',
  'approved',
  'rejected',
  'archived',
] as const;

export type ExtractionStatus = (typeof extractionStatuses)[number];
export type RecordApprovalStatus = (typeof recordApprovalStatuses)[number];
export type IngredientQuantityStatus = 'quantity-published' | 'quantity-unknown';

export type MedicationCarbohydrateIngredient = {
  normalizedName: string;
  sourceTerm: string;
  sourceExcerpt: string;
  amount: number | null;
  amountUnit: string;
  amountBasis: string;
  normalizedAmountMg: number | null;
  normalizedBasis: string;
  quantityStatus: IngredientQuantityStatus;
};

export type MedicationNonNutritiveSweetener = {
  normalizedName: string;
  sourceTerm: string;
  sourceExcerpt: string;
};

export type MedicationCarbohydrateRecord = {
  id: string;
  genericName: string;
  brandName: string;
  manufacturer: string;
  labelerName?: string;
  packagerName?: string;
  manufacturerName?: string;
  distributorName?: string;
  brandOwnerName?: string;
  organizationText?: string;
  strength: string;
  dosageForm: string;
  originalDosageForm: string;
  normalizedDosageForm: string;
  route: string;
  productNdc: string;
  packageNdc: string;
  packageDescription: string;
  carbohydrateIngredients: MedicationCarbohydrateIngredient[];
  nonNutritiveSweeteners?: MedicationNonNutritiveSweetener[];
  publishedAmount: number | null;
  publishedUnit: string;
  publishedBasis: string;
  normalizedAmountMg: number | null;
  normalizedBasis: string;
  extractionStatus: ExtractionStatus;
  sourceSetId: string;
  sourceLabelTitle: string;
  sourceUrl: string;
  sourceDate: string;
  inactiveIngredientText: string;
  sourceExcerpt: string;
  reviewedBy: string;
  reviewedDate: string;
  approvalStatus: RecordApprovalStatus;
  notes: string;
};

export const pendingMedicationCarbohydrateRecords =
  pendingRecords as MedicationCarbohydrateRecord[];

export const rejectedMedicationCarbohydrateRecords =
  rejectedRecords as MedicationCarbohydrateRecord[];

export const approvedMedicationCarbohydrateRecords = (
  approvedRecords as MedicationCarbohydrateRecord[]
).filter((record) => record.approvalStatus === 'approved');

export const medicationCarbohydrateRecords = [
  ...approvedMedicationCarbohydrateRecords,
  ...pendingMedicationCarbohydrateRecords,
  ...rejectedMedicationCarbohydrateRecords,
];

export function validateRecordForApproval(record: MedicationCarbohydrateRecord) {
  const errors: string[] = [];

  [
    ['generic name', record.genericName],
    ['manufacturer or labeler', record.manufacturer],
    ['dosage form', record.dosageForm],
    ['product NDC', record.productNdc],
    ['source set ID', record.sourceSetId],
    ['source URL', record.sourceUrl],
    ['source date', record.sourceDate],
    ['source excerpt', record.sourceExcerpt],
    ['reviewed by', record.reviewedBy],
    ['review date', record.reviewedDate],
  ].forEach(([label, value]) => {
    if (!String(value || '').trim()) errors.push(`${label} is required.`);
  });

  if (record.extractionStatus === 'quantitative-value-found') {
    const quantifiedIngredients = record.carbohydrateIngredients.filter(
      (ingredient) => ingredient.quantityStatus === 'quantity-published',
    );
    if (
      quantifiedIngredients.length === 0
      ||
      record.publishedAmount === null
      || record.normalizedAmountMg === null
      || !record.publishedUnit
      || !record.publishedBasis
      || !record.normalizedBasis
    ) {
      errors.push('A quantitative carbohydrate value requires amount, unit, basis, normalized value, and at least one quantified ingredient.');
    }
  }

  return errors;
}
