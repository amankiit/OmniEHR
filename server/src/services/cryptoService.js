import crypto from "crypto";
import env from "../config/env.js";

const algorithm = "aes-256-gcm";
const key = Buffer.from(env.phiEncryptionKey, "hex");

if (key.length !== 32) {
  throw new Error("PHI_ENCRYPTION_KEY must be a 64-char hex string (32 bytes)");
}

export const encryptPhi = (plaintext = "") => {
  if (!plaintext) {
    return { iv: "", authTag: "", content: "" };
  }

  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(algorithm, key, iv);
  const encrypted = Buffer.concat([cipher.update(String(plaintext), "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return {
    iv: iv.toString("hex"),
    authTag: authTag.toString("hex"),
    content: encrypted.toString("hex")
  };
};

export const decryptPhi = (encrypted) => {
  if (!encrypted?.content || !encrypted?.iv || !encrypted?.authTag) {
    return "";
  }

  const decipher = crypto.createDecipheriv(
    algorithm,
    key,
    Buffer.from(encrypted.iv, "hex")
  );
  decipher.setAuthTag(Buffer.from(encrypted.authTag, "hex"));

  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(encrypted.content, "hex")),
    decipher.final()
  ]);

  return decrypted.toString("utf8");
};
