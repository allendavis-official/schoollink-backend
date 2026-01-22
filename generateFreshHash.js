const bcrypt = require("bcryptjs");

async function generateHash() {
  const password = "Admin@123";

  console.log("Generating fresh hash for password:", password);
  console.log("");

  // Generate hash with salt rounds = 10
  const salt = await bcrypt.genSalt(10);
  const hash = await bcrypt.hash(password, salt);

  console.log("Generated hash:");
  console.log(hash);
  console.log("");

  // Verify it works
  const isValid = await bcrypt.compare(password, hash);
  console.log("Verification test:", isValid ? "✅ PASS" : "❌ FAIL");
  console.log("");

  console.log("Copy this SQL query and run it in pgAdmin:");
  console.log("");
  console.log(
    `UPDATE users SET password_hash = '${hash}' WHERE email = 'admin@schoollink.lr';`
  );
}

generateHash();
