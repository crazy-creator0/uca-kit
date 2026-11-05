"use strict";

function validateCustomer(input) {
  const errors = [];
  if (!input.name || input.name.trim().length < 2) errors.push("name is too short");
  if (!input.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email)) errors.push("email is invalid");
  if (!input.country) errors.push("country is required");
  return { valid: errors.length === 0, errors };
}

function validateSupplier(input) {
  const errors = [];
  if (!input.name || input.name.trim().length < 2) errors.push("name is too short");
  if (!input.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email)) errors.push("email is invalid");
  if (!input.taxId) errors.push("taxId is required");
  return { valid: errors.length === 0, errors };
}

module.exports = { validateCustomer, validateSupplier };
