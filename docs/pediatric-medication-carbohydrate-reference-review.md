# Pediatric Medication Carbohydrate Reference Review

## Purpose

The Pediatric Medication Carbohydrate Reference uses an offline review pipeline:

DailyMed label data -> local Node import script -> carbohydrate extraction -> pharmacist review -> approved local JSON records -> public static lookup tool.

The public website searches approved local records only. It must not call DailyMed from a visitor's browser, estimate carbohydrate content, or publish unreviewed extraction records.

## Data Sources

Permitted sources for this foundation:

- DailyMed Version 2 REST services for current SPL product labels, label set IDs, NDCs, package descriptions, source dates, inactive ingredient text, and relevant label text.
- RxNorm REST API for normalized medication names and active NDC context.

Do not use Lexidrug or other licensed clinical-data sources in this pipeline. Do not use the FDA Inactive Ingredient Database potency as the selected product's carbohydrate amount.

## Seed List

The editable starter list is stored in `src/data/pediatricMedicationSeedList.ts`.

This list is for validation and scaling. It is not an authoritative ranking of the most commonly used pediatric medications. Prioritize oral solutions, oral suspensions, syrups, chewable tablets, orally disintegrating tablets, powders, granules, and compounded oral products.

## Import Workflow

1. Edit `src/data/pediatricMedicationSeedList.ts`.
2. Run `npm run import:dailymed` to retrieve current matching DailyMed labels with RxNorm context.
3. Run `npm run extract:carbohydrates` to create candidate records.
4. Review pending records at `/internal/carbohydrate-record-review`.
5. Export reviewed JSON and commit approved records to `src/data/approvedMedicationCarbohydrateRecords.json`.
6. Run `npm run validate:carbohydrates` before publication.

## Review Stores

Records are separated by approval status:

- `src/data/pendingMedicationCarbohydrateRecords.json`
- `src/data/approvedMedicationCarbohydrateRecords.json`
- `src/data/rejectedMedicationCarbohydrateRecords.json`

Only records in `approvedMedicationCarbohydrateRecords.json` with `approvalStatus: "approved"` are visible in the public lookup.

## Approval Rules

Approval requires:

- exact manufacturer-specific product identity
- product NDC and package NDC when available
- strength, dosage form, and route when available in the label
- published carbohydrate amount or explicit unknown status
- exact source excerpt
- DailyMed set ID and public source link
- source date
- reviewer
- review date

Do not approve a quantitative record unless the source excerpt explicitly connects a numeric amount, a unit, an ingredient or total carbohydrate, and a product basis such as per mL, tablet, 5 mL, packet, or dose.

## Quantitative Extraction Rules

Extract and normalize a quantitative carbohydrate amount only when the label explicitly associates:

- a numeric amount
- a unit
- an ingredient or total carbohydrate
- a product basis

Preserve the exact supporting source excerpt.

Never infer quantities from:

- ingredient order
- another product
- another manufacturer
- another strength
- another dosage form
- product taste
- sugar-free wording
- FDA Inactive Ingredient Database potency

## Status Meanings

- `quantitative-value-found`: automation found candidate text with ingredient or total carbohydrate plus number, unit, and basis.
- `carbohydrate-ingredient-found-quantity-unknown`: a configured carbohydrate-related ingredient was found, but no quantity was published in the extracted source text.
- `no-carbohydrate-ingredient-identified`: no configured carbohydrate-related term was found in extracted text. This is not a confirmed zero carbohydrate result.
- `ambiguous-source-text`: automated parsing found unclear text that needs pharmacist interpretation.
- `manual-review-required`: the record needs pharmacist or manufacturer confirmation before classification.

All statuses require pharmacist review before approval.
