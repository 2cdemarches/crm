// Crée le compte admin dans Supabase
// Usage : DATABASE_URL=... node scripts/seed.js

require('dotenv').config();
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function seed() {
  const hash = bcrypt.hashSync('Admin1234!', 10);
  await pool.query(
    `INSERT INTO users (nom,prenom,email,password_hash,role) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (email) DO NOTHING`,
    ['Admin', 'Cabinet', 'admin@cabinet.fr', hash, 'admin']
  );
  console.log('Admin cree : admin@cabinet.fr / Admin1234!');
  await pool.end();
}

seed().catch(e => { console.error(e); process.exit(1); });
