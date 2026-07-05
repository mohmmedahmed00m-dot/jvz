#!/bin/sh
set -e

# ── 1. انتظر DB تكون جاهزة (max 60s) ────────────────────────────────────────
echo "→ Waiting for database..."
i=0
until node -e "
const { Client } = require('pg');
const c = new Client({ connectionString: process.env.DATABASE_URL });
c.connect().then(() => { c.end(); }).catch(() => process.exit(1));
" 2>/dev/null; do
  i=$((i + 1))
  if [ "$i" -ge 30 ]; then
    echo "✗ Database not ready after 60s — aborting"
    exit 1
  fi
  echo "  retrying ($i/30)..."
  sleep 2
done
echo "✓ Database ready"

# ── 2. شغّل Migrations ───────────────────────────────────────────────────────
echo "→ Running migrations..."
node -e "
const ds = require('./dist/database/data-source').default;
ds.initialize()
  .then(() => ds.runMigrations())
  .then(migs => {
    console.log('✓ Migrations done (' + migs.length + ' applied)');
    return ds.destroy();
  })
  .catch(e => {
    console.error('✗ Migration failed:', e.message);
    process.exit(1);
  });
"

# ── 3. شغّل Seed (idempotent — آمن تشغيله أكثر من مرة) ──────────────────────
echo "→ Running seed..."
node dist/database/seed/index.js && echo "✓ Seed done" || echo "⚠ Seed warning (non-fatal, continuing)"

# ── 4. ابدأ التطبيق ──────────────────────────────────────────────────────────
echo "→ Starting app..."
exec node dist/main.js
