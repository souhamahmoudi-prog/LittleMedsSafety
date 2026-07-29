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
  'Licensed Lexidrug data',
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

export const approvalStatuses = [
  'draft',
  'pending_review',
  'approved',
  'archived',
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
  carbohydrateUnit: 'mg' | 'g' | 'other' | '';
  carbohydrateBasis: CarbohydrateBasis;
  quantifiedIngredient: string;
  sourceName: string;
  sourceType: SourceType;
  sourceReference: string;
  sourceUrl?: string;
  sourceDate: string;
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
  'Carbohydrate-related ingredient listed, but no quantitative amount was published in the reviewed source.';

export const licensedClinicalDataIntegrationStatus =
  'Licensed clinical-data integration not configured.';

export const medicationCarbohydrateReferenceRecords: MedicationCarbohydrateReferenceRecord[] = [];

export const approvedMedicationCarbohydrateReferenceRecords =
  medicationCarbohydrateReferenceRecords.filter((record) => record.approvalStatus === 'approved');

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
    ['verification date', record.verifiedDate],
    ['reviewer', record.reviewer || record.verifiedBy],
    ['approval status', record.approvalStatus],
  ].forEach(([label, value]) => {
    if (!String(value || '').trim()) errors.push(`${label} is required.`);
  });

  const hasQuantity = record.carbohydrateAmount !== null
    && Number.isFinite(record.carbohydrateAmount)
    && record.carbohydrateAmount >= 0
    && record.carbohydrateUnit
    && record.carbohydrateBasis
    && record.quantifiedIngredient;

  const hasExplicitUnknownStatus = record.verificationStatus !== 'Published quantitative value'
    && record.carbohydrateAmount === null;

  if (!hasQuantity && !hasExplicitUnknownStatus) {
    errors.push('A published carbohydrate amount or explicit unknown status is required.');
  }

  if (record.approvalStatus === 'approved' && (!record.sourceReference || !record.verifiedDate)) {
    errors.push('Approved publication requires a source and verification date.');
  }

  return errors;
}
