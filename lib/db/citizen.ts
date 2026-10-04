/**
 * Citizen Entity Model and Types for Cloudflare D1
 */

export interface Citizen {
  Citizen_ID: string; // Primary Key
  Name: string;
  NID: string;
  Address: string;
  Phone: string;
  approx_income: number;
  created_at?: string;
  updated_at?: string;
}

export interface CreateCitizenInput {
  Citizen_ID?: string;
  Name: string;
  NID: string;
  Address: string;
  Phone: string;
  approx_income: number;
}
