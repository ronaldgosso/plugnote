import crypto from "crypto";

// Derives a stable 32-byte buffer from the user's ENCRYPTION_KEY environment variable.
// Uses SHA-256 to ensure that any custom passphrase resolves to an exact 32-byte key.
const getEncryptionKey = (): Buffer => {
  const envKey = process.env.ENCRYPTION_KEY;
  if (!envKey) {
    console.warn("WARNING: ENCRYPTION_KEY is not defined in env. Generating temporary session key. API keys won't survive restarts.");
    if (!(global as any)._tempCryptoKey) {
      (global as any)._tempCryptoKey = crypto.randomBytes(32);
    }
    return (global as any)._tempCryptoKey;
  }
  return crypto.createHash("sha256").update(envKey).digest();
};

const IV_LENGTH = 12; // Standard 96 bits for GCM
const ALGORITHM = "aes-256-gcm";

export function encrypt(text: string): string {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  
  let encrypted = cipher.update(text, "utf8", "hex");
  encrypted += cipher.final("hex");
  
  const authTag = cipher.getAuthTag().toString("hex");
  
  // Format: iv_hex:auth_tag_hex:ciphertext_hex
  return `${iv.toString("hex")}:${authTag}:${encrypted}`;
}

export function decrypt(encryptedText: string): string {
  const key = getEncryptionKey();
  const parts = encryptedText.split(":");
  if (parts.length !== 3) {
    throw new Error("Invalid encrypted key format");
  }
  
  const [ivHex, authTagHex, ciphertextHex] = parts;
  const iv = Buffer.from(ivHex, "hex");
  const authTag = Buffer.from(authTagHex, "hex");
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  
  decipher.setAuthTag(authTag);
  
  let decrypted = decipher.update(ciphertextHex, "hex", "utf8");
  decrypted += decipher.final("utf8");
  
  return decrypted;
}
