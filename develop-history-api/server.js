#!/usr/bin/env node
/**
 * RedBulb Develop History API — lightweight sidecar for version history.
 * Runs alongside stock Immich server, handles /api/assets/:id/develop-history/* routes.
 * 
 * Environment:
 *   DB_HOST (default: localhost)
 *   DB_PORT (default: 5432)
 *   DB_NAME (default: immich)
 *   DB_USER (default: immich)
 *   DB_PASS (default: immich_dev_2026)
 *   PORT (default: 3333)
 */

const http = require('http');
const { Pool } = require('pg');

const MAX_VERSIONS = 30;
const MAX_THUMBNAIL_BYTES = 50 * 1024;

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  database: process.env.DB_NAME || 'immich',
  user: process.env.DB_USER || 'immich',
  password: process.env.DB_PASS || 'immich_dev_2026',
});

function json(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
  res.end(JSON.stringify(data));
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString()));
      } catch {
        resolve({});
      }
    });
    req.on('error', reject);
  });
}

// Extract a dummy userId — in production this would come from auth
// For now, query the first user in the DB
let defaultUserId = null;
async function getDefaultUserId() {
  if (defaultUserId) return defaultUserId;
  const { rows } = await pool.query('SELECT id FROM "user" LIMIT 1');
  defaultUserId = rows[0]?.id || '00000000-0000-0000-0000-000000000000';
  return defaultUserId;
}

async function pruneVersions(assetId) {
  const { rows: [{ count }] } = await pool.query(
    'SELECT count(*)::int as count FROM asset_develop_history WHERE "assetId" = $1', [assetId]
  );
  if (count <= MAX_VERSIONS) return;

  const excess = count - MAX_VERSIONS;

  // Delete oldest auto-checkpoints first (not current)
  await pool.query(`
    DELETE FROM asset_develop_history WHERE id IN (
      SELECT id FROM asset_develop_history
      WHERE "assetId" = $1 AND "isAutoCheckpoint" = true AND "isCurrent" = false
      ORDER BY version ASC LIMIT $2
    )
  `, [assetId, excess]);

  // Check again
  const { rows: [{ count: remaining }] } = await pool.query(
    'SELECT count(*)::int as count FROM asset_develop_history WHERE "assetId" = $1', [assetId]
  );
  if (remaining <= MAX_VERSIONS) return;

  const stillExcess = remaining - MAX_VERSIONS;
  await pool.query(`
    DELETE FROM asset_develop_history WHERE id IN (
      SELECT id FROM asset_develop_history
      WHERE "assetId" = $1 AND "isCurrent" = false
      ORDER BY version ASC LIMIT $2
    )
  `, [assetId, stillExcess]);
}

function mapRow(row) {
  return {
    id: row.id,
    assetId: row.assetId,
    userId: row.userId,
    version: row.version,
    label: row.label,
    state: row.state || {},
    isCurrent: row.isCurrent,
    isAutoCheckpoint: row.isAutoCheckpoint,
    hasThumbnail: row.thumbnail != null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

// Route: GET /api/assets/:id/develop-history
async function listVersions(assetId) {
  const { rows } = await pool.query(
    `SELECT id, "assetId", "userId", version, label, "isCurrent", "isAutoCheckpoint",
            (thumbnail IS NOT NULL) as "hasThumbnail", "createdAt", "updatedAt"
     FROM asset_develop_history WHERE "assetId" = $1 ORDER BY version DESC`,
    [assetId]
  );
  return {
    assetId,
    total: rows.length,
    versions: rows.map(r => ({
      ...r,
      state: {},
      hasThumbnail: r.hasThumbnail,
    })),
  };
}

// Route: GET /api/assets/:id/develop-history/current
async function getCurrent(assetId) {
  const { rows } = await pool.query(
    `SELECT * FROM asset_develop_history WHERE "assetId" = $1 AND "isCurrent" = true`,
    [assetId]
  );
  return rows[0] ? mapRow(rows[0]) : null;
}

// Route: GET /api/assets/:id/develop-history/:version
async function getVersion(assetId, version) {
  const { rows } = await pool.query(
    `SELECT * FROM asset_develop_history WHERE "assetId" = $1 AND version = $2`,
    [assetId, version]
  );
  return rows[0] ? mapRow(rows[0]) : null;
}

// Route: POST /api/assets/:id/develop-history
async function createVersion(assetId, body) {
  const userId = await getDefaultUserId();
  const { rows: [{ nextVersion }] } = await pool.query(
    `SELECT coalesce(max(version), 0) + 1 as "nextVersion" FROM asset_develop_history WHERE "assetId" = $1`,
    [assetId]
  );

  let thumbnail = null;
  if (body.thumbnailBase64) {
    thumbnail = Buffer.from(body.thumbnailBase64, 'base64');
    if (thumbnail.length > MAX_THUMBNAIL_BYTES) {
      throw new Error('Thumbnail exceeds 50KB limit');
    }
  }

  // Unset current
  await pool.query(
    `UPDATE asset_develop_history SET "isCurrent" = false WHERE "assetId" = $1 AND "isCurrent" = true`,
    [assetId]
  );

  const { rows } = await pool.query(
    `INSERT INTO asset_develop_history ("assetId", "userId", version, label, state, "isCurrent", "isAutoCheckpoint", thumbnail)
     VALUES ($1, $2, $3, $4, $5, true, $6, $7) RETURNING *`,
    [assetId, userId, nextVersion, body.label || '', JSON.stringify(body.state), body.isAutoCheckpoint || false, thumbnail]
  );

  await pruneVersions(assetId);
  return mapRow(rows[0]);
}

// Route: POST /api/assets/:id/develop-history/:version/restore
async function restoreVersion(assetId, version, body) {
  const existing = await getVersion(assetId, version);
  if (!existing) throw new Error(`Version ${version} not found`);

  return createVersion(assetId, {
    state: existing.state,
    label: body?.label || `Restored from v${version}`,
    isAutoCheckpoint: false,
  });
}

// Route: PUT /api/assets/:id/develop-history/:version/label
async function updateLabel(assetId, version, label) {
  await pool.query(
    `UPDATE asset_develop_history SET label = $1 WHERE "assetId" = $2 AND version = $3`,
    [label, assetId, version]
  );
}

// Route: DELETE /api/assets/:id/develop-history/:version
async function deleteVersionHandler(assetId, version) {
  const { rows } = await pool.query(
    `SELECT "isCurrent" FROM asset_develop_history WHERE "assetId" = $1 AND version = $2`,
    [assetId, version]
  );
  if (!rows[0]) throw new Error(`Version ${version} not found`);
  if (rows[0].isCurrent) throw new Error('Cannot delete the current version');
  await pool.query(
    `DELETE FROM asset_develop_history WHERE "assetId" = $1 AND version = $2`,
    [assetId, version]
  );
}

// Route: GET /api/assets/:id/develop-history/:version/thumbnail
async function getThumbnail(assetId, version) {
  const { rows } = await pool.query(
    `SELECT thumbnail FROM asset_develop_history WHERE "assetId" = $1 AND version = $2`,
    [assetId, version]
  );
  return rows[0]?.thumbnail || null;
}

// Router
async function handleRequest(req, res) {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    });
    return res.end();
  }

  const url = new URL(req.url, `http://${req.headers.host}`);
  const path = url.pathname;

  // Match /api/assets/:id/develop-history[/:version[/action]]
  const match = path.match(/^\/api\/assets\/([0-9a-f-]+)\/develop-history(?:\/(.+))?$/);
  if (!match) {
    return json(res, 404, { error: 'Not found' });
  }

  const assetId = match[1];
  const rest = match[2] || '';

  try {
    // GET /api/assets/:id/develop-history
    if (req.method === 'GET' && rest === '') {
      return json(res, 200, await listVersions(assetId));
    }

    // GET /api/assets/:id/develop-history/current
    if (req.method === 'GET' && rest === 'current') {
      const result = await getCurrent(assetId);
      return json(res, 200, result);
    }

    // GET /api/assets/:id/develop-history/:version
    if (req.method === 'GET' && /^\d+$/.test(rest)) {
      const result = await getVersion(assetId, parseInt(rest, 10));
      if (!result) return json(res, 404, { error: 'Version not found' });
      return json(res, 200, result);
    }

    // GET /api/assets/:id/develop-history/:version/thumbnail
    const thumbMatch = rest.match(/^(\d+)\/thumbnail$/);
    if (req.method === 'GET' && thumbMatch) {
      const thumb = await getThumbnail(assetId, parseInt(thumbMatch[1], 10));
      if (!thumb) return json(res, 404, { error: 'No thumbnail' });
      res.writeHead(200, { 'Content-Type': 'image/jpeg', 'Access-Control-Allow-Origin': '*' });
      return res.end(thumb);
    }

    // POST /api/assets/:id/develop-history
    if (req.method === 'POST' && rest === '') {
      const body = await parseBody(req);
      if (!body.state) return json(res, 400, { error: 'state is required' });
      return json(res, 201, await createVersion(assetId, body));
    }

    // POST /api/assets/:id/develop-history/:version/restore
    const restoreMatch = rest.match(/^(\d+)\/restore$/);
    if (req.method === 'POST' && restoreMatch) {
      const body = await parseBody(req);
      return json(res, 201, await restoreVersion(assetId, parseInt(restoreMatch[1], 10), body));
    }

    // PUT /api/assets/:id/develop-history/:version/label
    const labelMatch = rest.match(/^(\d+)\/label$/);
    if (req.method === 'PUT' && labelMatch) {
      const body = await parseBody(req);
      await updateLabel(assetId, parseInt(labelMatch[1], 10), body.label || '');
      res.writeHead(204, { 'Access-Control-Allow-Origin': '*' });
      return res.end();
    }

    // DELETE /api/assets/:id/develop-history/:version
    if (req.method === 'DELETE' && /^\d+$/.test(rest)) {
      await deleteVersionHandler(assetId, parseInt(rest, 10));
      res.writeHead(204, { 'Access-Control-Allow-Origin': '*' });
      return res.end();
    }

    return json(res, 404, { error: 'Not found' });
  } catch (err) {
    console.error('Error:', err.message);
    return json(res, 400, { error: err.message });
  }
}

const PORT = parseInt(process.env.PORT || '3333', 10);
const server = http.createServer(handleRequest);
server.listen(PORT, '0.0.0.0', () => {
  console.log(`RedBulb Develop History API running on port ${PORT}`);
});
