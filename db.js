const { Pool } = require('pg');

const pool = new Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'demo_drive',
  password: '3232',
  port: 5432
});

module.exports = pool;
