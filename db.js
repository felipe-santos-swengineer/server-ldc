const Pool = require("pg").Pool;

const pool = new Pool({
  user: "oftpmjnzebtlvz",
  password: "f685c59b1903677619a4b96cb48b9bc8ee97161727b7e157707beb15c28e048d",
  host: "ec2-3-218-47-9.compute-1.amazonaws.com",
  port: 5432,
  database: "dd5eadh7qfh579",
  ssl: {
    rejectUnauthorized: false
  }
});

module.exports = pool;