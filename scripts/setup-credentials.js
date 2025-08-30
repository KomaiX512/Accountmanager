#!/usr/bin/env node

/**
 * Setup R2 Credentials for Migration
 */

process.env.NEW_R2_ACCESS_KEY = "7e15d4a51abb43fff3a7da4a8813044f";
process.env.NEW_R2_SECRET_KEY = "8fccd5540c85304347cbbd25d8e1f67776a8473c73c4a8811e83d0970bd461e2";

console.log("✅ R2 credentials set for migration");
console.log("Access Key:", process.env.NEW_R2_ACCESS_KEY.substring(0, 8) + "...");
console.log("Secret Key:", process.env.NEW_R2_SECRET_KEY.substring(0, 8) + "...");
