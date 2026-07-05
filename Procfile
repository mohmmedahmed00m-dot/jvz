web: cd backend && node dist/main.js
release: cd backend && npx typeorm-ts-node-commonjs -d src/database/data-source.ts migration:run
