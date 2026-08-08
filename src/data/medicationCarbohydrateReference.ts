export const verificationStatuses = [
  'Published quantitative value',
  'Carbohydrate ingredient listed, quantity not published',
  'Manufacturer information pending',
  'No quantitative information located',
  'Archived or superseded product',
] as const;

export const sourceTypes = [
  'Manufacturer package insert or prescribing information',
  'DailyMed product label',
  'Manufacturer medical-information response',
  'Institution-approved ketogenic medication reference',
  'Other documented source with permitted reuse',
] as const;

export const carbohydrateBases = [
  'mg/mL',
  'mg/tablet',
  'mg/capsule',
  'mg/packet',
  'mg/dose',
  'other',
] as const;

export const dosageFormFilterOptions = [
  'Oral solution',
  'Oral suspension',
  'Tablets',
  'Capsules',
  'Powder',
  'Other',
] as const;

export const dosageFormFilterGroups = {
  Tablets: [
    'tablet',
    'chewable tablet',
    'orally disintegrating tablet',
    'dispersible tablet',
    'effervescent tablet',
    'delayed-release tablet',
    'extended-release tablet',
  ],
  Capsules: [
    'capsule',
    'softgel capsule',
    'sprinkle capsule',
    'delayed-release capsule',
    'extended-release capsule',
  ],
  Powder: [
    'powder',
    'powder for suspension',
    'powder for oral solution',
    'granules',
    'oral granules',
    'packet',
  ],
  'Oral solution': [
    'solution',
    'oral solution',
    'liquid',
    'oral liquid',
    'elixir',
  ],
  'Oral suspension': [
    'suspension',
    'oral suspension',
    'suspension, oral',
  ],
} as const;

export const recognizedDosageForms = [
  'Suspension',
  'Oral suspension',
  ...dosageFormFilterOptions,
] as const;

export const approvalStatuses = [
  'draft',
  'pending_review',
  'approved',
  'archived',
] as const;

export type VerificationStatus = (typeof verificationStatuses)[number];
export type SourceType = (typeof sourceTypes)[number];
export type CarbohydrateBasis = (typeof carbohydrateBases)[number];
export type DosageFormFilterOption = (typeof dosageFormFilterOptions)[number];
export type ApprovalStatus = (typeof approvalStatuses)[number];

export type MedicationCarbohydrateReferenceRecord = {
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
  ndc: string;
  packageDescription: string;
  carbohydrateDisplayValue: string;
  carbohydrateIngredients: {
    normalizedName: string;
    sourceTerm: string;
    sourceExcerpt: string;
    amount: number | null;
    amountUnit: string;
    amountBasis: string;
    normalizedAmountMg: number | null;
    normalizedBasis: string;
    quantityStatus: 'quantity-published' | 'quantity-unknown';
  }[];
  nonNutritiveSweeteners?: {
    normalizedName: string;
    sourceTerm: string;
    sourceExcerpt: string;
  }[];
  carbohydrateAmount: number | null;
  carbohydrateUnit: 'mg' | 'g' | 'other' | '';
  carbohydrateBasis: CarbohydrateBasis;
  quantifiedIngredient: string;
  sourceName: string;
  sourceType: SourceType;
  sourceReference: string;
  sourceUrl?: string;
  sourceDate: string;
  additionalReferences: string;
  verifiedDate: string;
  verifiedBy: string;
  verificationStatus: VerificationStatus;
  approvalStatus: ApprovalStatus;
  notes: string;
};

export type MedicationCarbohydrateEditorRecord = MedicationCarbohydrateReferenceRecord & {
  exactProductIdentity: {
    genericName: string;
    brandName: string;
    manufacturer: string;
    strength: string;
    dosageForm: string;
    ndcOrPackageIdentifier: string;
    packageDescription: string;
  };
  sourceCitation: string;
  reviewer: string;
};

export const unknownQuantityMessage =
  'Not published';

export const medicationCarbohydrateReferenceRecords: MedicationCarbohydrateReferenceRecord[] = [];

export const approvedMedicationCarbohydrateReferenceRecords =
  medicationCarbohydrateReferenceRecords.filter((record) => record.approvalStatus === 'approved');

export {
  approvedMedicationCarbohydrateRecords,
  medicationCarbohydrateRecords,
  pendingMedicationCarbohydrateRecords,
} from './medicationCarbohydrateRecords';

export type {
  ExtractionStatus,
  MedicationCarbohydrateRecord,
  RecordApprovalStatus,
} from './medicationCarbohydrateRecords';

export function validateMedicationCarbohydrateEditorRecord(
  record: MedicationCarbohydrateEditorRecord,
) {
  const errors: string[] = [];
  const identity = record.exactProductIdentity;

  [
    ['generic name', identity.genericName],
    ['manufacturer or labeler', identity.manufacturer],
    ['strength', identity.strength],
    ['dosage form', identity.dosageForm],
    ['NDC or package identifier', identity.ndcOrPackageIdentifier],
    ['source citation', record.sourceCitation || record.sourceReference],
    ['source date', record.sourceDate],
    ['carbohydrate amount', record.carbohydrateDisplayValue],
    ['verification date', record.verifiedDate],
    ['reviewer', record.reviewer || record.verifiedBy],
    ['approval status', record.approvalStatus],
  ].forEach(([label, value]) => {
    if (!String(value || '').trim()) errors.push(`${label} is required.`);
  });

  const displayValue = String(record.carbohydrateDisplayValue || '').trim();
  if (/^not\s+published$/i.test(displayValue) && displayValue !== 'Not published') {
    errors.push('Unavailable carbohydrate amount must be exactly Not published.');
  }
  if (/^(amount not available|exact amount unavailable|quantity unknown|amount unavailable|amount not published)$/i.test(displayValue)) {
    errors.push('Use Not published instead of alternate unavailable-amount wording.');
  }

  if (record.approvalStatus === 'approved' && (!record.sourceReference || !record.verifiedDate)) {
    errors.push('Approved publication requires a source and verification date.');
  }

  return errors;
}
