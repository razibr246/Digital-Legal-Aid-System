-- Migration: Create Citizen Table
CREATE TABLE IF NOT EXISTS citizens (
  Citizen_ID TEXT PRIMARY KEY,
  Name TEXT NOT NULL,
  NID TEXT NOT NULL,
  Address TEXT NOT NULL,
  Phone TEXT NOT NULL,
  approx_income REAL NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_citizens_phone ON citizens(Phone);
CREATE INDEX IF NOT EXISTS idx_citizens_nid ON citizens(NID);
