import assert from "node:assert/strict";
import test from "node:test";
import {
  decryptCredential,
  encryptCredential,
  readCredentialEncryptionKey,
} from "../src/security/credential-encryption.js";

const TEST_ENCRYPTION_KEY = Buffer.alloc(32, 7);
const OTHER_ENCRYPTION_KEY = Buffer.alloc(32, 8);
const TEST_CREDENTIAL_ENCRYPTION_KEY_ENV = "TEST_CREDENTIAL_ENCRYPTION_KEY";

function tamperWithCiphertext(encryptedCredential: string): string {
  const parts = encryptedCredential.split(".");
  const ciphertext = parts[3];

  assert.ok(ciphertext);

  parts[3] = `${ciphertext[0] === "A" ? "B" : "A"}${ciphertext.slice(1)}`;

  return parts.join(".");
}

test("encrypts and decrypts a credential without changing its contents", () => {
  const plaintext = "  secret-credential-value  ";
  const encryptedCredential = encryptCredential(
    plaintext,
    TEST_ENCRYPTION_KEY,
  );

  assert.match(encryptedCredential, /^v1\.[^.]+\.[^.]+\.[^.]+$/);
  assert.equal(encryptedCredential.includes(plaintext), false);
  assert.equal(
    decryptCredential(encryptedCredential, TEST_ENCRYPTION_KEY),
    plaintext,
  );
});

test("uses a fresh IV each time a credential is encrypted", () => {
  const firstEncryptedCredential = encryptCredential(
    "secret-credential-value",
    TEST_ENCRYPTION_KEY,
  );
  const secondEncryptedCredential = encryptCredential(
    "secret-credential-value",
    TEST_ENCRYPTION_KEY,
  );

  assert.notEqual(firstEncryptedCredential, secondEncryptedCredential);
  assert.equal(
    decryptCredential(firstEncryptedCredential, TEST_ENCRYPTION_KEY),
    "secret-credential-value",
  );
  assert.equal(
    decryptCredential(secondEncryptedCredential, TEST_ENCRYPTION_KEY),
    "secret-credential-value",
  );
});

test("rejects modified encrypted credentials and incorrect keys", () => {
  const encryptedCredential = encryptCredential(
    "secret-credential-value",
    TEST_ENCRYPTION_KEY,
  );

  assert.throws(
    () =>
      decryptCredential(
        tamperWithCiphertext(encryptedCredential),
        TEST_ENCRYPTION_KEY,
      ),
    /Encrypted credential is invalid or could not be decrypted\./,
  );
  assert.throws(
    () => decryptCredential(encryptedCredential, OTHER_ENCRYPTION_KEY),
    /Encrypted credential is invalid or could not be decrypted\./,
  );
  assert.throws(
    () => decryptCredential("not-an-encrypted-credential", TEST_ENCRYPTION_KEY),
    /Encrypted credential is invalid or could not be decrypted\./,
  );
});

test("loads a base64-encoded 32-byte credential encryption key", () => {
  const encodedKey = TEST_ENCRYPTION_KEY.toString("base64");

  assert.deepEqual(
    readCredentialEncryptionKey(TEST_CREDENTIAL_ENCRYPTION_KEY_ENV, {
      [TEST_CREDENTIAL_ENCRYPTION_KEY_ENV]: encodedKey,
    }),
    TEST_ENCRYPTION_KEY,
  );
  assert.throws(
    () => readCredentialEncryptionKey(TEST_CREDENTIAL_ENCRYPTION_KEY_ENV, {}),
    new RegExp(`${TEST_CREDENTIAL_ENCRYPTION_KEY_ENV} is required\\.`),
  );
  assert.throws(
    () =>
      readCredentialEncryptionKey(TEST_CREDENTIAL_ENCRYPTION_KEY_ENV, {
        [TEST_CREDENTIAL_ENCRYPTION_KEY_ENV]: "not-a-valid-key",
      }),
    new RegExp(
      `${TEST_CREDENTIAL_ENCRYPTION_KEY_ENV} must be a base64-encoded 32-byte key\\.`,
    ),
  );
  assert.throws(
    () => readCredentialEncryptionKey("   ", {}),
    /Credential encryption key environment variable name is required\./,
  );
});

test("rejects blank credentials and incorrectly sized encryption keys", () => {
  assert.throws(
    () => encryptCredential("   ", TEST_ENCRYPTION_KEY),
    /Credential plaintext is required\./,
  );
  assert.throws(
    () => encryptCredential("secret-credential-value", Buffer.alloc(16)),
    /Credential encryption key must contain 32 bytes\./,
  );
  assert.throws(
    () => decryptCredential("v1.a.b.c", Buffer.alloc(16)),
    /Credential encryption key must contain 32 bytes\./,
  );
});
