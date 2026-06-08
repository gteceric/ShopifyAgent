import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  type CipherGCMTypes,
} from "node:crypto";

const CREDENTIAL_ENCRYPTION_ALGORITHM: CipherGCMTypes = "aes-256-gcm";
const CREDENTIAL_ENCRYPTION_VERSION = "v1";
const CREDENTIAL_ENCRYPTION_KEY_BYTES = 32;
const CREDENTIAL_ENCRYPTION_IV_BYTES = 12;
const CREDENTIAL_ENCRYPTION_AUTH_TAG_BYTES = 16;

function invalidEncryptedCredentialError(): Error {
  return new Error(
    "Encrypted credential is invalid or could not be decrypted.",
  );
}

function decodeEncryptionKey(
  value: string,
  environmentVariableName: string,
): Buffer {
  const normalizedValue = value.trim();

  if (!normalizedValue) {
    throw new Error(`${environmentVariableName} is required.`);
  }

  const key = Buffer.from(normalizedValue, "base64");

  if (
    key.length !== CREDENTIAL_ENCRYPTION_KEY_BYTES ||
    key.toString("base64").replace(/=+$/, "") !==
      normalizedValue.replace(/=+$/, "")
  ) {
    throw new Error(
      `${environmentVariableName} must be a base64-encoded 32-byte key.`,
    );
  }

  return key;
}

export function readCredentialEncryptionKey(
  environmentVariableName: string,
  env: NodeJS.ProcessEnv = process.env,
): Buffer {
  const normalizedEnvironmentVariableName = environmentVariableName.trim();

  if (!normalizedEnvironmentVariableName) {
    throw new Error(
      "Credential encryption key environment variable name is required.",
    );
  }

  return decodeEncryptionKey(
    env[normalizedEnvironmentVariableName] ?? "",
    normalizedEnvironmentVariableName,
  );
}

export function encryptCredential(
  plaintext: string,
  encryptionKey: Buffer,
): string {
  if (!plaintext.trim()) {
    throw new Error("Credential plaintext is required.");
  }

  if (encryptionKey.length !== CREDENTIAL_ENCRYPTION_KEY_BYTES) {
    throw new Error("Credential encryption key must contain 32 bytes.");
  }

  const iv = randomBytes(CREDENTIAL_ENCRYPTION_IV_BYTES);
  const cipher = createCipheriv(
    CREDENTIAL_ENCRYPTION_ALGORITHM,
    encryptionKey,
    iv,
    {
      authTagLength: CREDENTIAL_ENCRYPTION_AUTH_TAG_BYTES,
    },
  );

  cipher.setAAD(Buffer.from(CREDENTIAL_ENCRYPTION_VERSION, "utf8"));

  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  return [
    CREDENTIAL_ENCRYPTION_VERSION,
    iv.toString("base64url"),
    authTag.toString("base64url"),
    ciphertext.toString("base64url"),
  ].join(".");
}

export function decryptCredential(
  encryptedCredential: string,
  encryptionKey: Buffer,
): string {
  if (encryptionKey.length !== CREDENTIAL_ENCRYPTION_KEY_BYTES) {
    throw new Error("Credential encryption key must contain 32 bytes.");
  }

  const [version, encodedIv, encodedAuthTag, encodedCiphertext, extraPart] =
    encryptedCredential.split(".");

  if (
    version !== CREDENTIAL_ENCRYPTION_VERSION ||
    !encodedIv ||
    !encodedAuthTag ||
    !encodedCiphertext ||
    extraPart !== undefined
  ) {
    throw invalidEncryptedCredentialError();
  }

  try {
    const iv = Buffer.from(encodedIv, "base64url");
    const authTag = Buffer.from(encodedAuthTag, "base64url");
    const ciphertext = Buffer.from(encodedCiphertext, "base64url");

    if (
      iv.length !== CREDENTIAL_ENCRYPTION_IV_BYTES ||
      authTag.length !== CREDENTIAL_ENCRYPTION_AUTH_TAG_BYTES ||
      ciphertext.length === 0
    ) {
      throw invalidEncryptedCredentialError();
    }

    const decipher = createDecipheriv(
      CREDENTIAL_ENCRYPTION_ALGORITHM,
      encryptionKey,
      iv,
      {
        authTagLength: CREDENTIAL_ENCRYPTION_AUTH_TAG_BYTES,
      },
    );

    decipher.setAAD(Buffer.from(CREDENTIAL_ENCRYPTION_VERSION, "utf8"));
    decipher.setAuthTag(authTag);

    return Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    throw invalidEncryptedCredentialError();
  }
}
