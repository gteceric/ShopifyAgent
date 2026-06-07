import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  type CipherGCMTypes,
} from "node:crypto";

const SHOPIFY_TOKEN_ENCRYPTION_ALGORITHM: CipherGCMTypes = "aes-256-gcm";
const SHOPIFY_TOKEN_ENCRYPTION_VERSION = "v1";
const SHOPIFY_TOKEN_ENCRYPTION_KEY_BYTES = 32;
const SHOPIFY_TOKEN_ENCRYPTION_IV_BYTES = 12;
const SHOPIFY_TOKEN_ENCRYPTION_AUTH_TAG_BYTES = 16;

export const SHOPIFY_TOKEN_ENCRYPTION_KEY_ENV =
  "SHOPIFY_TOKEN_ENCRYPTION_KEY";

function invalidEncryptedTokenError(): Error {
  return new Error(
    "Encrypted Shopify token is invalid or could not be decrypted.",
  );
}

function decodeEncryptionKey(value: string): Buffer {
  const normalizedValue = value.trim();

  if (!normalizedValue) {
    throw new Error(`${SHOPIFY_TOKEN_ENCRYPTION_KEY_ENV} is required.`);
  }

  const key = Buffer.from(normalizedValue, "base64");

  if (
    key.length !== SHOPIFY_TOKEN_ENCRYPTION_KEY_BYTES ||
    key.toString("base64").replace(/=+$/, "") !==
      normalizedValue.replace(/=+$/, "")
  ) {
    throw new Error(
      `${SHOPIFY_TOKEN_ENCRYPTION_KEY_ENV} must be a base64-encoded 32-byte key.`,
    );
  }

  return key;
}

export function readShopifyTokenEncryptionKey(
  env: NodeJS.ProcessEnv = process.env,
): Buffer {
  return decodeEncryptionKey(env[SHOPIFY_TOKEN_ENCRYPTION_KEY_ENV] ?? "");
}

export function encryptShopifyToken(token: string, encryptionKey: Buffer): string {
  if (!token.trim()) {
    throw new Error("Shopify token is required.");
  }

  if (encryptionKey.length !== SHOPIFY_TOKEN_ENCRYPTION_KEY_BYTES) {
    throw new Error("Shopify token encryption key must contain 32 bytes.");
  }

  const iv = randomBytes(SHOPIFY_TOKEN_ENCRYPTION_IV_BYTES);
  const cipher = createCipheriv(
    SHOPIFY_TOKEN_ENCRYPTION_ALGORITHM,
    encryptionKey,
    iv,
    {
      authTagLength: SHOPIFY_TOKEN_ENCRYPTION_AUTH_TAG_BYTES,
    },
  );

  cipher.setAAD(Buffer.from(SHOPIFY_TOKEN_ENCRYPTION_VERSION, "utf8"));

  const ciphertext = Buffer.concat([
    cipher.update(token, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  return [
    SHOPIFY_TOKEN_ENCRYPTION_VERSION,
    iv.toString("base64url"),
    authTag.toString("base64url"),
    ciphertext.toString("base64url"),
  ].join(".");
}

export function decryptShopifyToken(
  encryptedToken: string,
  encryptionKey: Buffer,
): string {
  if (encryptionKey.length !== SHOPIFY_TOKEN_ENCRYPTION_KEY_BYTES) {
    throw new Error("Shopify token encryption key must contain 32 bytes.");
  }

  const [version, encodedIv, encodedAuthTag, encodedCiphertext, extraPart] =
    encryptedToken.split(".");

  if (
    version !== SHOPIFY_TOKEN_ENCRYPTION_VERSION ||
    !encodedIv ||
    !encodedAuthTag ||
    !encodedCiphertext ||
    extraPart !== undefined
  ) {
    throw invalidEncryptedTokenError();
  }

  try {
    const iv = Buffer.from(encodedIv, "base64url");
    const authTag = Buffer.from(encodedAuthTag, "base64url");
    const ciphertext = Buffer.from(encodedCiphertext, "base64url");

    if (
      iv.length !== SHOPIFY_TOKEN_ENCRYPTION_IV_BYTES ||
      authTag.length !== SHOPIFY_TOKEN_ENCRYPTION_AUTH_TAG_BYTES ||
      ciphertext.length === 0
    ) {
      throw invalidEncryptedTokenError();
    }

    const decipher = createDecipheriv(
      SHOPIFY_TOKEN_ENCRYPTION_ALGORITHM,
      encryptionKey,
      iv,
      {
        authTagLength: SHOPIFY_TOKEN_ENCRYPTION_AUTH_TAG_BYTES,
      },
    );

    decipher.setAAD(Buffer.from(SHOPIFY_TOKEN_ENCRYPTION_VERSION, "utf8"));
    decipher.setAuthTag(authTag);

    return Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    throw invalidEncryptedTokenError();
  }
}
