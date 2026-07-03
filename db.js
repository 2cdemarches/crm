const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 10,
});

// Convertit ? en $1, $2... (SQLite → PostgreSQL)
function pgify(sql) {
  let i = 0;
  return sql.replace(/\?/g, () => `$${++i}`);
}

function toArr(args) {
  if (!args || args.length === 0) return [];
  if (args.length === 1 && Array.isArray(args[0])) return args[0];
  return Array.from(args);
}

const db = {
  prepare(sql) {
    const pgSql = pgify(sql);
    const isInsert = sql.trim().toUpperCase().startsWith('INSERT');
    return {
      async get(...args) {
        const { rows } = await pool.query(pgSql, toArr(args));
        return rows[0] || null;
      },
      async all(...args) {
        const { rows } = await pool.query(pgSql, toArr(args));
        return rows;
      },
      async run(...args) {
        const q = isInsert ? pgSql + ' RETURNING id' : pgSql;
        const { rows, rowCount } = await pool.query(q, toArr(args));
        return { changes: rowCount, lastInsertRowid: rows[0]?.id };
      },
    };
  },
  async exec(sql) { await pool.query(sql); },
  async get(sql, params) {
    const { rows } = await pool.query(pgify(sql), params || []);
    return rows[0] || null;
  },
  async all(sql, params) {
    const { rows } = await pool.query(pgify(sql), params || []);
    return rows;
  },
  pool,
};

module.exports = db;
