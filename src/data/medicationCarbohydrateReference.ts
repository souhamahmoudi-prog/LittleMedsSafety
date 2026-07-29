export const verificationStatuses = [
  'Published quantitative value',
  'Carbohydrate ingredient listed, quantity not published',
  'Manufacturer information pending',
  'No quantitative information located',
  'Archived or superseded product',
] as const;

export const sourceTypes = [
  'Manufacturer prescribing information or package insert',
  'DailyMed',
  'Manufacturer medical-information response',
  'Licensed Lexidrug data',
  'Matthews Friends medication carbohydrate resource',
  'Institution-approved ketogenic medication reference',
  'Other documented source',
] as const;

export const carbohydrateBases = [
  'mg/mL',
  'mg/tablet',
  'mg/capsule',
  'mg/packet',
  'mg/dose',
  'other',
] as const;

export const approvalStatuses = [
  'Draft',
  'Pending review',
  'Approved',
  'Archived',
] as const;

export type VerificationStatus = (typeof verificationStatuses)[number];
export type SourceType = (typeof sourceTypes)[number];
export type CarbohydrateBasis = (typeof carbohydrateBases)[number];
export type ApprovalStatus = (typeof approvalStatuses)[number];

export type MedicationCarbohydrateReferenceRecord = {
  id: string;
  genericName: string;
  brandName: string;
  manufacturer: string;
  strength: string;
  dosageForm: string;
  ndc: string;
  packageDescription: string;
  carbohydrateAmount: number | null;
  carbohydrateUnit: 'mg' | 'other' | '';
  carbohydrateBasis: CarbohydrateBasis;
  carbohydrateIngredient: string;
  sourceName: string;
  sourceType: SourceType;
  sourceReference: string;
  sourceDate: string;
  verifiedDate: string;
  verificationStatus: VerificationStatus;
  notes: string;
  reviewer: string;
  approvalStatus: ApprovalStatus;
  isDemonstration: boolean;
};

export type MedicationCarbohydrateEditorRecord = MedicationCarbohydrateReferenceRecord & {
  exactProductIdentityConfirmed: boolean;
  hasPublishedCarbohydrateAmountOrExplicitUnknownStatus: boolean;
};

export const unknownQuantityMessage =
  'Carbohydrate-containing ingredient may be present, but a quantitative amount was not published in the reviewed source.';

export const medicationCarbohydrateReferenceRecords: MedicationCarbohydrateReferenceRecord[] = [
  {
    id: 'demo-acetaminophen-suspension-labeler-a-160mg-5ml',
    genericName: 'Acetaminophen',
    brandName: 'Demo Pain Relief Suspension',
    manufacturer: 'LittleMeds Demonstration Labeler A',
    strength: '160 mg/5 mL',
    dosageForm: 'Oral suspension',
    ndc: '00000-0001-01',
    packageDescription: '120 mL bottle',
    carbohydrateAmount: 180,
    carbohydrateUnit: 'mg',
    carbohydrateBasis: 'mg/mL',
    carbohydrateIngredient: 'sucrose',
    sourceName: 'LittleMeds demonstration reference - Not for clinical use',
    sourceType: 'Other documented source',
    sourceReference: 'Demonstration record for interface testing only',
    sourceDate: '2026-07-29',
    verifiedDate: '2026-07-29',
    verificationStatus: 'Published quantitative value',
    notes: 'Not for clinical use. Demonstrates an exact manufacturer-specific liquid record with a published quantitative value.',
    reviewer: 'LittleMeds demonstration reviewer',
    approvalStatus: 'Approved',
    isDemonstration: true,
  },
  {
    id: 'demo-acetaminophen-suspension-labeler-b-160mg-5ml',
    genericName: 'Acetaminophen',
    brandName: 'Demo Pain Relief Suspension',
    manufacturer: 'LittleMeds Demonstration Labeler B',
    strength: '160 mg/5 mL',
    dosageForm: 'Oral suspension',
    ndc: '00000-0001-02',
    packageDescription: '60 mL bottle',
    carbohydrateAmount: 75,
    carbohydrateUnit: 'mg',
    carbohydrateBasis: 'mg/mL',
    carbohydrateIngredient: 'sorbitol',
    sourceName: 'LittleMeds demonstration reference - Not for clinical use',
    sourceType: 'Other documented source',
    sourceReference: 'Demonstration record for interface testing only',
    sourceDate: '2026-07-29',
    verifiedDate: '2026-07-29',
    verificationStatus: 'Published quantitative value',
    notes: 'Not for clinical use. Demonstrates that one manufacturer-specific value must not be applied to another product.',
    reviewer: 'LittleMeds demonstration reviewer',
    approvalStatus: 'Approved',
    isDemonstration: true,
  },
  {
    id: 'demo-acetaminophen-chewable-labeler-a-80mg',
    genericName: 'Acetaminophen',
    brandName: 'Demo Pain Relief Chewable',
    manufacturer: 'LittleMeds Demonstration Labeler A',
    strength: '80 mg',
    dosageForm: 'Chewable tablet',
    ndc: '00000-0002-01',
    packageDescription: 'Bottle of 30 tablets',
    carbohydrateAmount: null,
    carbohydrateUnit: '',
    carbohydrateBasis: 'mg/tablet',
    carbohydrateIngredient: 'dextrose',
    sourceName: 'LittleMeds demonstration reference - Not for clinical use',
    sourceType: 'Other documented source',
    sourceReference: 'Demonstration record for interface testing only',
    sourceDate: '2026-07-29',
    verifiedDate: '2026-07-29',
    verificationStatus: 'Carbohydrate ingredient listed, quantity not published',
    notes: 'Not for clinical use. Demonstrates unknown quantity behavior without displaying zero, estimates, or ranges.',
    reviewer: 'LittleMeds demonstration reviewer',
    approvalStatus: 'Approved',
    isDemonstration: true,
  },
];
