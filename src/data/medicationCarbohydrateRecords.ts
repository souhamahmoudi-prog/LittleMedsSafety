import approvedRecords from './approvedMedicationCarbohydrateRecords.json';
import supplementalWorkbookRecords from './carbohydrateReferenceWorkbookRecords.json';
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

export type MedicationCarbohydrateFieldSource = {
  sourceName: string;
  sourceType: string;
  sourceUrl: string;
  sourceDate: string;
  sourceReference: string;
  workbookRow: number;
  matchType: 'package-ndc' | 'identity';
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
  carbohydrateDisplayValue: string;
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
  additionalReferences: string;
  fieldSourceProvenance?: {
    carbohydrateDisplayValue?: MedicationCarbohydrateFieldSource;
    carbohydrateIngredients?: MedicationCarbohydrateFieldSource;
    nonNutritiveSweeteners?: MedicationCarbohydrateFieldSource;
  };
  supplementalCarbohydrateReference?: MedicationCarbohydrateFieldSource & {
    carbohydrateDisplayValue: string;
    packageNdcs: string[];
  };
  reviewedBy: string;
  reviewedDate: string;
  approvalStatus: RecordApprovalStatus;
  notes: string;
};

type SupplementalWorkbookRecord = {
  workbookRow: number;
  genericMedication: string;
  brandName: string;
  manufacturerLabeler: string;
  strength: string;
  dosageForm: string;
  productNdc: string;
  packageNdc: string;
  packageNdcs?: string[];
  normalizedPackageNdcs?: string[];
  normalizedProductNdc?: string;
  normalizedIdentity?: {
    genericName: string;
    brandName: string;
    manufacturer: string;
    strength: string;
    dosageForm: string;
  };
  carbohydrateAmount: string;
  carbohydrateContributingIngredients: string;
  nonCarbohydrateSweeteners: string;
  primarySourceType: string;
  primarySourceUrl: string;
  additionalReferences: string;
  sourceDate: string;
  reviewedDate: string;
  reviewStatus: string;
  reviewerNotes: string;
};

const unavailableCarbohydrateValues = new Set(['', 'not published', 'unknown']);

function normalizeText(value: string | undefined) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function normalizeIdentity(value: string | undefined) {
  return normalizeText(value)
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeNdc(value: string | undefined) {
  return String(value || '').replace(/\D+/g, '');
}

function splitList(value: string | undefined) {
  return String(value || '')
    .split(/[;\n,]+/)
    .map((item) => normalizeText(item))
    .filter(Boolean);
}

function isQuantitativeCarbohydrateValue(value: string | undefined) {
  return !unavailableCarbohydrateValues.has(normalizeText(value).toLowerCase());
}

function recordNdcValues(record: MedicationCarbohydrateRecord) {
  return [
    record.packageNdc,
    record.productNdc,
  ].map(normalizeNdc).filter(Boolean);
}

function displayedManufacturer(record: MedicationCarbohydrateRecord) {
  return normalizeText(record.packagerName)
    || normalizeText(record.labelerName)
    || normalizeText(record.manufacturerName)
    || normalizeText(record.distributorName)
    || normalizeText(record.manufacturer);
}

function recordMatchesWorkbookIdentity(
  record: MedicationCarbohydrateRecord,
  workbookRecord: SupplementalWorkbookRecord,
) {
  const identity = workbookRecord.normalizedIdentity;
  if (!identity?.genericName || !identity.brandName || !identity.manufacturer || !identity.strength || !identity.dosageForm) {
    return false;
  }

  const recordIdentity = {
    genericName: normalizeIdentity(record.genericName),
    brandName: normalizeIdentity(record.brandName || record.sourceLabelTitle),
    manufacturer: normalizeIdentity(displayedManufacturer(record)),
    strength: normalizeIdentity(record.strength),
    dosageForm: normalizeIdentity(record.normalizedDosageForm || record.dosageForm),
  };

  return identity.genericName === recordIdentity.genericName
    && identity.brandName === recordIdentity.brandName
    && identity.manufacturer === recordIdentity.manufacturer
    && identity.strength === recordIdentity.strength
    && identity.dosageForm === recordIdentity.dosageForm;
}

function matchingSupplementalRecord(record: MedicationCarbohydrateRecord) {
  const recordNdcs = new Set(recordNdcValues(record));
  const workbookRecords = supplementalWorkbookRecords as SupplementalWorkbookRecord[];
  const packageNdcMatch = workbookRecords.find((workbookRecord) => (
    (workbookRecord.normalizedPackageNdcs || []).some((ndc) => recordNdcs.has(ndc))
  ));
  if (packageNdcMatch) return { workbookRecord: packageNdcMatch, matchType: 'package-ndc' as const };

  const identityMatch = workbookRecords.find((workbookRecord) => (
    !(workbookRecord.normalizedPackageNdcs || []).length
    && recordMatchesWorkbookIdentity(record, workbookRecord)
  ));
  return identityMatch ? { workbookRecord: identityMatch, matchType: 'identity' as const } : null;
}

function supplementalSource(workbookRecord: SupplementalWorkbookRecord, matchType: 'package-ndc' | 'identity') {
  const sourceReference = normalizeText(workbookRecord.additionalReferences)
    || normalizeText(workbookRecord.primarySourceType);

  return {
    sourceName: sourceReference || 'Supplemental carbohydrate reference workbook',
    sourceType: normalizeText(workbookRecord.primarySourceType),
    sourceUrl: normalizeText(workbookRecord.primarySourceUrl),
    sourceDate: normalizeText(workbookRecord.sourceDate),
    sourceReference,
    workbookRow: workbookRecord.workbookRow,
    matchType,
  };
}

function appendReference(existing: string, addition: string) {
  const normalizedExisting = normalizeText(existing);
  const normalizedAddition = normalizeText(addition);
  if (!normalizedAddition) return normalizedExisting;
  if (normalizedExisting.toLowerCase().includes(normalizedAddition.toLowerCase())) {
    return normalizedExisting;
  }
  return [normalizedExisting, normalizedAddition].filter(Boolean).join('\n');
}

function supplementalIngredientRecords(
  value: string | undefined,
  source: MedicationCarbohydrateFieldSource,
): MedicationCarbohydrateIngredient[] {
  return splitList(value).map((ingredient) => ({
    normalizedName: ingredient,
    sourceTerm: ingredient,
    sourceExcerpt: source.sourceReference || source.sourceName,
    amount: null,
    amountUnit: '',
    amountBasis: '',
    normalizedAmountMg: null,
    normalizedBasis: '',
    quantityStatus: 'quantity-unknown',
  }));
}

function supplementalSweetenerRecords(
  value: string | undefined,
  source: MedicationCarbohydrateFieldSource,
): MedicationNonNutritiveSweetener[] {
  return splitList(value).map((sweetener) => ({
    normalizedName: sweetener,
    sourceTerm: sweetener,
    sourceExcerpt: source.sourceReference || source.sourceName,
  }));
}

function withSupplementalCarbohydrateData(
  records: MedicationCarbohydrateRecord[],
): MedicationCarbohydrateRecord[] {
  return records.map((record) => {
    const match = matchingSupplementalRecord(record);
    if (!match) return record;

    const { workbookRecord, matchType } = match;
    const source = supplementalSource(workbookRecord, matchType);
    const carbohydrateDisplayValue = normalizeText(workbookRecord.carbohydrateAmount);
    const nextRecord: MedicationCarbohydrateRecord = {
      ...record,
      fieldSourceProvenance: {
        ...(record.fieldSourceProvenance || {}),
      },
      supplementalCarbohydrateReference: {
        ...source,
        carbohydrateDisplayValue,
        packageNdcs: workbookRecord.packageNdcs || [],
      },
    };

    const currentValue = normalizeText(record.carbohydrateDisplayValue);
    if (
      isQuantitativeCarbohydrateValue(carbohydrateDisplayValue)
      && unavailableCarbohydrateValues.has(currentValue.toLowerCase())
    ) {
      nextRecord.carbohydrateDisplayValue = carbohydrateDisplayValue;
      nextRecord.extractionStatus = 'quantitative-value-found';
      nextRecord.fieldSourceProvenance = {
        ...nextRecord.fieldSourceProvenance,
        carbohydrateDisplayValue: source,
      };
      nextRecord.additionalReferences = appendReference(
        nextRecord.additionalReferences,
        [
          `Supplemental carbohydrate amount: ${carbohydrateDisplayValue}.`,
          source.sourceReference ? `Source: ${source.sourceReference}.` : '',
          source.sourceUrl ? `URL: ${source.sourceUrl}.` : '',
          `Workbook row: ${source.workbookRow}.`,
        ].filter(Boolean).join(' '),
      );
    }

    if (!nextRecord.carbohydrateIngredients.length && workbookRecord.carbohydrateContributingIngredients) {
      nextRecord.carbohydrateIngredients = supplementalIngredientRecords(
        workbookRecord.carbohydrateContributingIngredients,
        source,
      );
      nextRecord.fieldSourceProvenance = {
        ...nextRecord.fieldSourceProvenance,
        carbohydrateIngredients: source,
      };
    }

    if (!(nextRecord.nonNutritiveSweeteners || []).length && workbookRecord.nonCarbohydrateSweeteners) {
      nextRecord.nonNutritiveSweeteners = supplementalSweetenerRecords(
        workbookRecord.nonCarbohydrateSweeteners,
        source,
      );
      nextRecord.fieldSourceProvenance = {
        ...nextRecord.fieldSourceProvenance,
        nonNutritiveSweeteners: source,
      };
    }

    return nextRecord;
  });
}

export const pendingMedicationCarbohydrateRecords =
  withSupplementalCarbohydrateData(pendingRecords as MedicationCarbohydrateRecord[]);

export const rejectedMedicationCarbohydrateRecords =
  withSupplementalCarbohydrateData(rejectedRecords as MedicationCarbohydrateRecord[]);

export const approvedMedicationCarbohydrateRecords = (
  withSupplementalCarbohydrateData(approvedRecords as MedicationCarbohydrateRecord[])
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
    ['carbohydrate amount', record.carbohydrateDisplayValue],
    ['reviewed by', record.reviewedBy],
    ['review date', record.reviewedDate],
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

  return errors;
}
