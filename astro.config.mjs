import { writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'astro/config';

const repoRoot = dirname(fileURLToPath(import.meta.url));
const dataDir = resolve(repoRoot, 'src/data');

function jsonResponse(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader('content-type', 'application/json');
  res.end(JSON.stringify(payload));
}

async function readRequestBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
}

function assertRecordArray(value, name) {
  if (!Array.isArray(value)) throw new Error(`${name} must be an array.`);
  for (const record of value) {
    if (!record || typeof record !== 'object' || Array.isArray(record)) {
      throw new Error(`${name} contains an invalid record.`);
    }
  }
}

function carbohydrateReviewPersistencePlugin() {
  return {
    name: 'littlemeds-carbohydrate-review-persistence',
    configureServer(server) {
      server.middlewares.use('/internal/api/carbohydrate-record-review/persist', async (req, res) => {
        if (req.method !== 'POST') {
          jsonResponse(res, 405, { ok: false, error: 'Method not allowed.' });
          return;
        }

        try {
          const payload = JSON.parse(await readRequestBody(req));
          const approved = payload?.approvedRecords;
          const pending = payload?.pendingRecords;
          const rejected = payload?.rejectedRecords;

          assertRecordArray(approved, 'approvedRecords');
          assertRecordArray(pending, 'pendingRecords');
          assertRecordArray(rejected, 'rejectedRecords');

          await Promise.all([
            writeFile(resolve(dataDir, 'approvedMedicationCarbohydrateRecords.json'), `${JSON.stringify(approved, null, 2)}\n`),
            writeFile(resolve(dataDir, 'pendingMedicationCarbohydrateRecords.json'), `${JSON.stringify(pending, null, 2)}\n`),
            writeFile(resolve(dataDir, 'rejectedMedicationCarbohydrateRecords.json'), `${JSON.stringify(rejected, null, 2)}\n`),
          ]);

          jsonResponse(res, 200, {
            ok: true,
            approvedCount: approved.length,
            pendingCount: pending.length,
            rejectedCount: rejected.length,
          });
        } catch (error) {
          jsonResponse(res, 400, {
            ok: false,
            error: error instanceof Error ? error.message : 'Unable to persist reviewed records.',
          });
        }
      });
    },
  };
}

export default defineConfig({
  vite: {
    plugins: [carbohydrateReviewPersistencePlugin()],
  },
});
