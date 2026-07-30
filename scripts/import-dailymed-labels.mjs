import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, extname, resolve } from 'node:path';

const repoRoot = resolve(new URL('..', import.meta.url).pathname);
const seedPath = resolve(repoRoot, 'src/data/pediatricMedicationSeedList.ts');
const outputPath = resolve(repoRoot, 'src/data/dailymedProductImport.json');
const cacheRoot = resolve(repoRoot, 'src/data/dailymedImportCache');
const dailyMedBase = 'https://dailymed.nlm.nih.gov/dailymed/services/v2';
const rxNormBase = 'https://rxnav.nlm.nih.gov/REST';

const maxLabelsPerSeed = Number(process.env.MAX_LABELS_PER_SEED || 25);
const searchPageSize = Number(process.env.DAILYMED_SEARCH_PAGE_SIZE || 100);
const maxSearchPages = Number(process.env.DAILYMED_MAX_SEARCH_PAGES || 0);
const detailCandidateMultiplier = Number(process.env.DAILYMED_DETAIL_CANDIDATE_MULTIPLIER || 4);
const onlyMedicationNames = (process.env.DAILYMED_ONLY_MEDICATIONS || '')
  .split(',')
  .map((name) => name.trim().toLowerCase())
  .filter(Boolean);
const verbose = process.env.DAILYMED_VERBOSE === 'true';
const refreshCache = process.env.DAILYMED_REFRESH_CACHE === 'true';

const oralLiquidTerms = ['suspension', 'oral suspension', 'suspension, oral', 'liquid', 'oral liquid', 'solution', 'oral solution', 'syrup', 'elixir'];
const prioritizedFormTerms = [
  ...oralLiquidTerms,
  'chewable',
  'orally disintegrating',
  'disintegrating',
  'powder',
  'granule',
  'granules',
  'packet',
  'film',
  'sprinkle',
  'concentrate',
];
const excludedFormTerms = ['injection', 'injectable', 'topical', 'ophthalmic', 'otic', 'cream', 'ointment', 'gel', 'lotion'];
const pediatricProductTerms = ['childrens', "children's", 'children', 'infants', "infant's", 'infant', 'kids', 'pediatric', 'pain and fever'];
const acetaminophenExcludedCombinationActives = ['dextromethorphan', 'doxylamine', 'phenylephrine', 'diphenhydramine', 'guaifenesin'];
const targetedAcetaminophenOrganizationTerms = [
  'kenvue',
  'johnson & johnson',
  'mcneil',
  'tylenol',
];

function parseSeedList(source) {
  const match = source.match(/export const pediatricMedicationSeedList[^=]*=\s*(\[[\s\S]*?\]);/);
  if (!match) throw new Error('Could not find pediatricMedicationSeedList export.');
  return Function(`"use strict"; return (${match[1]});`)();
}

function cachePathForUrl(url, format) {
  return resolve(cacheRoot, `${createHash('sha256').update(url).digest('hex')}.${format}`);
}

async function fetchCached(url, format) {
  const cachePath = cachePathForUrl(url, format);
  if (!refreshCache) {
    try {
      return { cacheHit: true, cachePath, status: 200, text: await readFile(cachePath, 'utf8'), url };
    } catch {
      // Cache miss; fetch below.
    }
  }

  const response = await fetch(url, format === 'json' ? { headers: { accept: 'application/json' } } : undefined);
  const text = await response.text();
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}: ${url}`);
  await mkdir(dirname(cachePath), { recursive: true });
  await writeFile(cachePath, text);
  return { cacheHit: false, cachePath, status: response.status, text, url };
}

async function fetchJsonResponse(url) {
  const response = await fetchCached(url, 'json');
  return { ...response, data: JSON.parse(response.text) };
}

async function fetchJson(url) {
  return (await fetchJsonResponse(url)).data;
}

async function fetchText(url) {
  return (await fetchCached(url, extname(new URL(url).pathname).replace('.', '') || 'txt')).text;
}

async function resolveRxCui(seed) {
  if (seed.rxcui) return seed.rxcui;
  const params = new URLSearchParams({ name: seed.genericName, search: '2' });
  const data = await fetchJson(`${rxNormBase}/rxcui.json?${params.toString()}`);
  return data?.idGroup?.rxnormId?.[0] || '';
}

async function fetchRxNormNdcs(rxcui) {
  if (!rxcui) return [];
  try {
    const data = await fetchJson(`${rxNormBase}/rxcui/${encodeURIComponent(rxcui)}/ndcs.json`);
    return data?.ndcGroup?.ndcList?.ndc || [];
  } catch {
    return [];
  }
}

async function fetchDailyMedSearchPages(baseParams, type, searchTerm, results, searches) {
  let page = 1;
  let totalPages = 1;
  let totalElements = 0;

  do {
    const params = new URLSearchParams(baseParams);
    if (page > 1) params.set('page', String(page));
    const url = `${dailyMedBase}/spls.json?${params.toString()}`;
    const response = await fetchJsonResponse(url);
    const rows = Array.isArray(response.data.data) ? response.data.data : [];
    const metadata = response.data.metadata || {};
    totalPages = Number(metadata.total_pages || totalPages || 1);
    totalElements = Number(metadata.total_elements || totalElements || rows.length);
    results.push(...rows);
    searches.push({
      type,
      searchTerm,
      url,
      httpStatus: response.status,
      cacheHit: response.cacheHit,
      page,
      totalPagesReported: totalPages,
      totalResultsReported: totalElements,
      labelsReturned: rows.length,
    });
    page += 1;
  } while (page <= totalPages && (!maxSearchPages || page <= maxSearchPages));
}

async function fetchDailyMedSpls(seed, rxcui) {
  const results = [];
  const searches = [];

  if (rxcui) {
    await fetchDailyMedSearchPages(new URLSearchParams({ rxcui, pagesize: String(searchPageSize) }), 'rxcui', rxcui, results, searches);
  }
  await fetchDailyMedSearchPages(new URLSearchParams({
    drug_name: seed.genericName,
    name_type: 'both',
    pagesize: String(searchPageSize),
  }), 'drug_name', seed.genericName, results, searches);

  const unique = [...new Map(results.map((label) => [label.setid, label])).values()];
  return { labels: unique, searches, duplicatesRemoved: results.length - unique.length };
}

async function fetchLabelNdcs(setid) {
  try {
    const data = await fetchJson(`${dailyMedBase}/spls/${encodeURIComponent(setid)}/ndcs.json?pagesize=100`);
    return data?.data?.ndcs?.map((item) => item.ndc).filter(Boolean) || [];
  } catch {
    return [];
  }
}

async function fetchLabelPackaging(setid) {
  try {
    const data = await fetchJson(`${dailyMedBase}/spls/${encodeURIComponent(setid)}/packaging.json?pagesize=100`);
    const rows = data?.data?.packaging || [];
    return rows.map((item) => ({
      packageNdc: item.ndc || item.package_ndc || '',
      packageDescription: item.description || item.package_description || item.marketing_status || '',
    }));
  } catch {
    return [];
  }
}

function decodeXmlEntities(value) {
  return value
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function stripXml(xml) {
  return decodeXmlEntities(xml.replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeOrganizationName(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function titleLabeler(title) {
  return normalizeOrganizationName(String(title || '').match(/\[([^\]]+)\]\s*$/)?.[1] || '');
}

function uniqueValues(values) {
  const seen = new Set();
  const output = [];
  for (const value of values.map(normalizeOrganizationName).filter(Boolean)) {
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(value);
  }
  return output;
}

function firstOrganizationMatch(text, patterns) {
  for (const pattern of patterns) {
    for (const match of String(text || '').matchAll(new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`))) {
      const before = String(text || '').slice(Math.max(0, (match.index || 0) - 80), match.index || 0);
      const matchedText = match[0] || '';
      if (/\bnot\s+(?:manufactured|distributed)|not\s+manufactured\s+or\s+distributed/i.test(`${before} ${matchedText}`)) continue;
      const value = normalizeOrganizationName(match[1]
      .replace(/\s+(?:NDC|Questions|Principal Display Panel|Distributed By|Manufactured By)\b[\s\S]*$/i, '')
      .replace(/\s{2,}/g, ' ')
      .replace(/[.;,\s]+$/g, ''));
      if (/\b(?:trademark|tylenol|not manufactured|not distributed|not\s+manufactured\s+or\s+distributed)\b/i.test(value)) continue;
      if (value) return value;
    }
  }
  return '';
}

function extractOrganizationFields(xml, title) {
  const text = stripXml(xml);
  const orgSnippets = [];
  const orgPattern = /\b(?:Packager|Labeler|Manufactured by|Manufactured for|Manufacturer|Distributed by|Distributor|Marketed by|Brand owner)\b[:\s]+.{0,180}/gi;
  for (const match of text.matchAll(orgPattern)) {
    orgSnippets.push(match[0].replace(/\s+/g, ' ').trim());
  }

  const packagerName = firstOrganizationMatch(text, [
    /\bPackager\s*:\s*([^.;\n]{2,120})/i,
  ]);
  const manufacturerName = firstOrganizationMatch(text, [
    /\bManufactured by\s*:?\s*([^.;\n]{2,120})/i,
    /\bManufacturer\s*:\s*([^.;\n]{2,120})/i,
  ]);
  const distributorName = firstOrganizationMatch(text, [
    /\bDistributed by\s*:?\s*([^.;\n]{2,120})/i,
    /\bDistributor\s*:\s*([^.;\n]{2,120})/i,
    /\bMarketed by\s*:?\s*([^.;\n]{2,120})/i,
  ]);
  const brandOwnerName = firstOrganizationMatch(text, [
    /\bBrand owner\s*:\s*([^.;\n]{2,120})/i,
  ]);

  return {
    labelerName: titleLabeler(title),
    packagerName,
    manufacturerName,
    distributorName,
    brandOwnerName,
    organizationText: uniqueValues(orgSnippets).join(' | '),
  };
}

function displayManufacturerName(organizationFields) {
  return organizationFields.packagerName
    || organizationFields.labelerName
    || organizationFields.manufacturerName
    || organizationFields.distributorName
    || 'Organization not parsed';
}

function extractSectionText(xml, titlePattern) {
  const sections = xml.match(/<section[\s\S]*?<\/section>/gi) || [];
  return sections.filter((section) => titlePattern.test(section)).map(stripXml).join(' ').replace(/\s+/g, ' ').trim();
}

function extractInactiveIngredientText(xml) {
  return extractSectionText(xml, /inactive ingredients?|displayName="[^"]*inactive ingredient/i);
}

function extractActiveIngredientText(xml) {
  return extractSectionText(xml, /active ingredients?|displayName="[^"]*active ingredient/i);
}

function isHumanMedicationLabel(xml) {
  const displayNames = [...xml.matchAll(/displayName="([^"]+)"/gi)].map((match) => match[1].toLowerCase());
  return displayNames.some((name) => name.includes('human') && name.includes('drug label'));
}

function hasNonOralRouteContext(value) {
  return /\b(topical|ophthalmic|otic|nasal|injection|injectable|intramuscular|intravenous|subcutaneous|rectal|vaginal)\b/i.test(String(value || ''));
}

function hasOralRouteContext(value) {
  return /\b(oral|by mouth|for oral|children|childrens|infants|infant|kids|pain and fever|acetaminophen 160 mg per 5 ml|acetaminophen 160 mg\/5 ml)\b/i.test(String(value || ''));
}

function normalizeDosageForm(value, context = '') {
  const text = String(value || '').toLowerCase();
  const combined = `${value || ''} ${context || ''}`;
  const combinedText = combined.toLowerCase();
  if (/suspension\s*,\s*oral|oral suspension/.test(text)) return 'Oral suspension';
  if (/\bsuspension\b/.test(text)) {
    if (hasNonOralRouteContext(combined) && !hasOralRouteContext(combined)) return 'Suspension';
    return 'Oral suspension';
  }
  if (/oral solution/.test(text) || (/\bsolution\b/.test(text) && hasOralRouteContext(combined) && !hasNonOralRouteContext(combined))) return 'Oral solution';
  if (/\bsyrup\b|\belixir\b/.test(text)) return 'Syrup';
  if (/\bliquid\b/.test(text) && hasOralRouteContext(combined) && !hasNonOralRouteContext(combined)) return 'Oral solution';
  if (combinedText.includes('chewable')) return 'Chewable tablet';
  if (combinedText.includes('orally disintegrating') || combinedText.includes('disintegrating')) return 'Orally disintegrating tablet';
  if (/\b(powder|packet)\b/.test(combinedText)) return 'Powder';
  if (/\b(granule|granules)\b/.test(combinedText)) return 'Granules';
  if (combinedText.includes('film')) return 'Oral film';
  if (combinedText.includes('sprinkle')) return 'Sprinkle capsule';
  return 'Other';
}

function parseOriginalDosageForm(title) {
  return (String(title || '').match(/\b(TABLET[^,;[]*|CAPSULE[^,;[]*|SOLUTION[^,;[]*|SUSPENSION[^,;[]*|POWDER[^,;[]*|LIQUID[^,;[]*|ELIXIR[^,;[]*|SYRUP[^,;[]*|GRANULE[^,;[]*|FILM[^,;[]*|CONCENTRATE[^,;[]*|KIT[^,;[]*)/i)?.[1] || '').trim();
}

function extractStrengthFromText(text) {
  return String(text || '').match(/\b\d+(?:\.\d+)?\s*(?:mg|g|mcg|units?|unit)\s*(?:per|\/)\s*\d+(?:\.\d+)?\s*(?:mL|ml|tablet|capsule|dose)\b/i)?.[0]
    || String(text || '').match(/\b\d+(?:\.\d+)?\s*(?:mg|g|mcg|units?|unit)\b/i)?.[0]
    || '';
}

function scoreTitle(title, seed) {
  const haystack = String(title || '').toLowerCase();
  let score = 0;
  for (const term of prioritizedFormTerms) if (haystack.includes(term)) score += 8;
  for (const form of seed.relevantDosageForms || []) if (haystack.includes(form.toLowerCase())) score += 12;
  for (const term of pediatricProductTerms) if (haystack.includes(term)) score += 10;
  if (seed.genericName === 'acetaminophen') {
    for (const term of targetedAcetaminophenOrganizationTerms) if (haystack.includes(term)) score += 18;
  }
  for (const term of excludedFormTerms) if (haystack.includes(term)) score -= 30;
  if (/\b(tablet|capsule)\b/i.test(haystack) && !/\b(chewable|disintegrating|orally disintegrating|dispersible|sprinkle)\b/i.test(haystack)) score -= 20;
  return score;
}

function labelPriorityScore(label, seed) {
  const haystack = [label.title, label.activeIngredientText, label.inactiveIngredientText, label.completeRelevantLabelText.slice(0, 3000)].join(' ').toLowerCase();
  return scoreTitle(haystack, seed);
}

function normalizedWords(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/).filter(Boolean);
}

function matchesSeedIdentity(title, seed) {
  const haystack = ` ${normalizedWords(title).join(' ')} `;
  const genericWords = normalizedWords(seed.genericName).filter((word) => !['and', 'with'].includes(word));
  const aliasWords = (seed.aliases || []).flatMap(normalizedWords);
  return genericWords.every((word) => haystack.includes(` ${word} `))
    || aliasWords.some((word) => haystack.includes(` ${word} `));
}

function isExcludedConventionalSolid(title) {
  const haystack = String(title || '').toLowerCase();
  return /\b(tablet|capsule)\b/.test(haystack) && !/\b(chewable|disintegrating|orally disintegrating|dispersible|sprinkle)\b/.test(haystack);
}

function activeIngredientsFromTitle(title) {
  const genericMatch = String(title || '').match(/\(([^)]+)\)/);
  if (!genericMatch || !/acetaminophen/i.test(genericMatch[1])) return [];
  return genericMatch[1]
    .split(/\s*,\s*|\s+and\s+/i)
    .map((name) => name.toLowerCase().replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

function activeIngredientsFromText(activeText, title) {
  const text = `${activeText || ''} ${title || ''}`.toLowerCase();
  return [...new Set([
    ...activeIngredientsFromTitle(title),
    ...['acetaminophen', ...acetaminophenExcludedCombinationActives].filter((name) => text.includes(name)),
  ])];
}

function shouldRetainDetailedLabel(seed, label) {
  if (!isHumanMedicationLabel(label.xml)) return { retained: false, reason: 'not a human drug label' };
  if (!matchesSeedIdentity(label.title || '', seed)) return { retained: false, reason: 'generic name or alias did not match label title' };
  if (isExcludedConventionalSolid(label.title || '')) return { retained: false, reason: 'conventional tablet or capsule excluded from initial pilot' };

  if (seed.genericName === 'acetaminophen') {
    const activeIngredients = activeIngredientsFromText(label.activeIngredientText, label.title);
    const excluded = activeIngredients.filter((name) => name !== 'acetaminophen');
    if (!activeIngredients.includes('acetaminophen')) return { retained: false, reason: 'structured active ingredients do not include acetaminophen' };
    if (excluded.length) return { retained: false, reason: `combination product excluded for acetaminophen pilot: ${excluded.join(', ')}` };
  }

  return { retained: true, reason: '' };
}

function amazonAcetaminophenDiagnostic(label, decision, productNdcs, packaging) {
  const title = label.title || '';
  const organizationFields = label.organizationFields || {};
  if (!/amazon\.com services llc/i.test(displayManufacturerName(organizationFields))) return null;
  return {
    productTitle: title,
    activeIngredients: label.activeIngredientText,
    strength: extractStrengthFromText(label.activeIngredientText || label.completeRelevantLabelText),
    originalDosageForm: label.originalDosageForm,
    normalizedDosageForm: label.normalizedDosageForm,
    setId: label.setId,
    productNdc: productNdcs.join('; '),
    packageNdc: packaging.map((row) => row.packageNdc).filter(Boolean).join('; '),
    labeler: organizationFields.labelerName || '',
    packager: organizationFields.packagerName || '',
    manufacturer: organizationFields.manufacturerName || '',
    distributor: organizationFields.distributorName || '',
    brandOwner: organizationFields.brandOwnerName || '',
    retained: decision.retained,
    rejectionReason: decision.reason,
  };
}

function trackedAcetaminophenDiagnostic(spl, label, decision, productNdcs, packaging) {
  const title = label?.title || spl?.title || '';
  const organizationFields = label?.organizationFields || { labelerName: titleLabeler(title) };
  const haystack = [
    title,
    label?.activeIngredientText,
    organizationFields.labelerName,
    organizationFields.packagerName,
    organizationFields.manufacturerName,
    organizationFields.distributorName,
    organizationFields.brandOwnerName,
    organizationFields.organizationText,
  ].join(' ');
  if (!/(kenvue|johnson\s*&\s*johnson|mcneil|children.?s tylenol|childrens tylenol)/i.test(haystack)) return null;

  return {
    productTitle: title,
    activeIngredients: label?.activeIngredientText || '',
    strength: extractStrengthFromText(label?.activeIngredientText || label?.completeRelevantLabelText || title),
    originalDosageForm: label?.originalDosageForm || parseOriginalDosageForm(title),
    normalizedDosageForm: label?.normalizedDosageForm || normalizeDosageForm(parseOriginalDosageForm(title) || title, title),
    setId: label?.setId || spl?.setid || '',
    productNdc: productNdcs.join('; '),
    packageNdc: packaging.map((row) => row.packageNdc).filter(Boolean).join('; '),
    labeler: organizationFields.labelerName || '',
    packager: organizationFields.packagerName || '',
    manufacturer: organizationFields.manufacturerName || '',
    distributor: organizationFields.distributorName || '',
    brandOwner: organizationFields.brandOwnerName || '',
    status: 'current label search result',
    retained: decision.retained,
    rejectionReason: decision.reason,
  };
}

function isTargetedAcetaminophenLabel(label) {
  const haystack = [
    label.title,
    label.labelerName,
    label.packagerName,
    label.manufacturerName,
    label.distributorName,
    label.brandOwnerName,
    label.organizationText,
    label.displayManufacturerName,
  ].join(' ');
  return /(amazon\.com services llc|kenvue|johnson\s*&\s*johnson|mcneil|children.?s tylenol|childrens tylenol|infants tylenol)/i.test(haystack);
}

async function main() {
  const seedSource = await readFile(seedPath, 'utf8');
  const seedList = parseSeedList(seedSource)
    .filter((seed) => seed.enabled !== false)
    .filter((seed) => !onlyMedicationNames.length || onlyMedicationNames.includes(seed.genericName.toLowerCase()));
  const medications = [];
  const failedSearches = [];
  const importDiagnostics = [];
  const amazonAcetaminophenLabels = [];
  const acetaminophenOrganizationLabels = [];
  let duplicateLabelsRemoved = 0;

  for (const seed of seedList) {
    let rxcui = '';
    let rxNormActiveNdcs = [];
    const acceptedLabels = [];
    const rejectedLabels = [];
    const diagnostics = {
      genericName: seed.genericName,
      dailyMedSearches: [],
      totalResultsReported: 0,
      pagesRetrieved: 0,
      resultsProcessed: 0,
      resultsRetained: 0,
      resultsRejected: 0,
      rejectedReasons: {},
    };

    try {
      rxcui = await resolveRxCui(seed);
      rxNormActiveNdcs = await fetchRxNormNdcs(rxcui);
    } catch (error) {
      failedSearches.push({ genericName: seed.genericName, step: 'rxnorm', error: error.message });
    }

    let spls = [];
    try {
      const result = await fetchDailyMedSpls(seed, rxcui);
      spls = result.labels;
      diagnostics.dailyMedSearches = result.searches;
      diagnostics.totalResultsReported = Math.max(...result.searches.map((search) => search.totalResultsReported || 0), 0);
      diagnostics.pagesRetrieved = result.searches.length;
      diagnostics.resultsProcessed = spls.length;
      duplicateLabelsRemoved += result.duplicatesRemoved;
    } catch (error) {
      failedSearches.push({ genericName: seed.genericName, step: 'dailymed-search', error: error.message });
    }

    const prioritizedSpls = spls
      .map((spl) => ({ ...spl, pilotPriorityScore: scoreTitle(spl.title, seed) }))
      .sort((a, b) => b.pilotPriorityScore - a.pilotPriorityScore);
    const detailLimit = Math.max(maxLabelsPerSeed * detailCandidateMultiplier, maxLabelsPerSeed);

    const detailSetIds = new Set(prioritizedSpls.slice(0, detailLimit).map((spl) => spl.setid));
    if (seed.genericName === 'acetaminophen') {
      prioritizedSpls
      .filter((spl) => /amazon\.com services llc/i.test(spl.title || ''))
      .forEach((spl) => detailSetIds.add(spl.setid));
      prioritizedSpls
        .filter((spl) => /(kenvue|johnson\s*&\s*johnson|mcneil|children.?s tylenol|childrens tylenol)/i.test(spl.title || ''))
        .forEach((spl) => detailSetIds.add(spl.setid));
    }
    const detailSpls = prioritizedSpls.filter((spl) => detailSetIds.has(spl.setid));

    for (const spl of prioritizedSpls.filter((item) => !detailSetIds.has(item.setid))) {
      rejectedLabels.push({ setId: spl.setid || '', title: spl.title || '', reason: 'not selected for label-detail download after oral-dosage-form prioritization' });
    }

    for (const spl of detailSpls) {
      if (!spl.setid) continue;
      const sourceUrl = `https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=${encodeURIComponent(spl.setid)}`;
      try {
        const [productNdcs, packaging, xml] = await Promise.all([
          fetchLabelNdcs(spl.setid),
          fetchLabelPackaging(spl.setid),
          fetchText(`${dailyMedBase}/spls/${encodeURIComponent(spl.setid)}.xml`),
        ]);
        const originalDosageForm = parseOriginalDosageForm(spl.title || '');
        const activeIngredientText = extractActiveIngredientText(xml);
        const completeRelevantLabelText = stripXml(xml);
        const organizationFields = extractOrganizationFields(xml, spl.title || '');
        const label = {
          setId: spl.setid,
          title: spl.title || '',
          sourceUrl,
          sourceDate: spl.published_date || '',
          productNdcs,
          packaging,
          activeIngredientText,
          inactiveIngredientText: extractInactiveIngredientText(xml),
          completeRelevantLabelText,
          strength: extractStrengthFromText(activeIngredientText || completeRelevantLabelText),
          originalDosageForm,
          normalizedDosageForm: normalizeDosageForm(originalDosageForm || spl.title, `${spl.title || ''} ${activeIngredientText} ${completeRelevantLabelText.slice(0, 2000)}`),
          labelerName: organizationFields.labelerName,
          packagerName: organizationFields.packagerName,
          manufacturerName: organizationFields.manufacturerName,
          distributorName: organizationFields.distributorName,
          brandOwnerName: organizationFields.brandOwnerName,
          organizationText: organizationFields.organizationText,
          displayManufacturerName: displayManufacturerName(organizationFields),
          organizationFields,
          xml,
        };
        const decision = shouldRetainDetailedLabel(seed, label);
        if (seed.genericName === 'acetaminophen') {
          const amazonDiagnostic = amazonAcetaminophenDiagnostic(label, decision, productNdcs, packaging);
          if (amazonDiagnostic) amazonAcetaminophenLabels.push(amazonDiagnostic);
          const organizationDiagnostic = trackedAcetaminophenDiagnostic(spl, label, decision, productNdcs, packaging);
          if (organizationDiagnostic) acetaminophenOrganizationLabels.push(organizationDiagnostic);
        }
        if (decision.retained) {
          const { xml: _xml, ...recordLabel } = label;
          acceptedLabels.push(recordLabel);
        } else {
          rejectedLabels.push({ setId: spl.setid, title: spl.title || '', reason: decision.reason });
        }
      } catch (error) {
        failedSearches.push({ genericName: seed.genericName, setId: spl.setid, step: 'dailymed-label-detail', error: error.message });
        rejectedLabels.push({ setId: spl.setid, title: spl.title || '', reason: `label detail request failed: ${error.message}` });
      }
    }

    acceptedLabels.sort((a, b) => labelPriorityScore(b, seed) - labelPriorityScore(a, seed));
    const pinnedLabels = seed.genericName === 'acetaminophen'
      ? acceptedLabels.filter(isTargetedAcetaminophenLabel)
      : [];
    const pinnedSetIds = new Set(pinnedLabels.map((label) => label.setId));
    const labels = [
      ...pinnedLabels,
      ...acceptedLabels.filter((label) => !pinnedSetIds.has(label.setId)),
    ].slice(0, maxLabelsPerSeed);
    const selectedSetIds = new Set(labels.map((label) => label.setId));
    for (const label of acceptedLabels.filter((item) => !selectedSetIds.has(item.setId))) {
      rejectedLabels.push({ setId: label.setId, title: label.title, reason: 'human label retained for detail review but outside per-seed accepted label cap' });
    }

    diagnostics.resultsRetained = labels.length;
    diagnostics.resultsRejected = rejectedLabels.length;
    diagnostics.rejectedReasons = rejectedLabels.reduce((acc, item) => {
      acc[item.reason] = (acc[item.reason] || 0) + 1;
      return acc;
    }, {});
    importDiagnostics.push(diagnostics);
    medications.push({ seed, rxcui, rxNormActiveNdcs, labels, rejectedLabels });

    if (verbose) console.log(JSON.stringify(diagnostics, null, 2));
  }

  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify({
    importedAt: new Date().toISOString(),
    sourceApis: { dailyMed: dailyMedBase, rxNorm: rxNormBase },
    cacheRoot,
    selection: {
      enabledMedicationOnly: true,
      humanMedicationLabelsOnly: true,
      activeIngredientFiltering: true,
      onlyMedicationNames,
      maxLabelsPerSeed,
      searchPageSize,
      maxSearchPages,
      prioritizedFormTerms,
      excludedFormTerms,
    },
    failedSearches,
    importDiagnostics,
    amazonAcetaminophenLabels,
    acetaminophenOrganizationLabels,
    duplicateLabelsRemoved,
    medications,
  }, null, 2)}\n`);

  console.log(JSON.stringify({
    outputPath,
    cacheRoot,
    medications: medications.length,
    productLabelsImported: medications.reduce((sum, medication) => sum + medication.labels.length, 0),
    failedSearches: failedSearches.length,
    duplicateLabelsRemoved,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
