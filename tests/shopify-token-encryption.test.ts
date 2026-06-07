import assert from "node:assert/strict";
import test from "node:test";
import {
  decryptShopifyToken,
  encryptShopifyToken,
  readShopifyTokenEncryptionKey,
  SHOPIFY_TOKEN_ENCRYPTION_KEY_ENV,
} from "../src/platforms/shopify/auth/token-encryption.js";

const TEST_ENCRYPTION_KEY = Buffer.alloc(32, 7);
const OTHER_ENCRYPTION_KEY = Buffer.alloc(32, 8);

function tamperWithCiphertext(encryptedToken: string): string {
  const parts = encryptedToken.split(".");
  const ciphertext = parts[3];

  assert.ok(ciphertext);

  parts[3] = `${ciphertext[0] === "A" ? "B" : "A"}${ciphertext.slice(1)}`;

  return parts.join(".");
}

test("encrypts and decrypts a Shopify token without changing its contents", () => {
  const token = "  shpat_test-token-value  ";
  const encryptedToken = encryptShopifyToken(token, TEST_ENCRYPTION_KEY);

  assert.match(encryptedToken, /^v1\.[^.]+\.[^.]+\.[^.]+$/);
  assert.equal(encryptedToken.includes(token), false);
  assert.equal(
    decryptShopifyToken(encryptedToken, TEST_ENCRYPTION_KEY),
    token,
  );
});

test("uses a fresh IV each time a Shopify token is encrypted", () => {
  const firstEncryptedToken = encryptShopifyToken(
    "shpat_test-token-value",
    TEST_ENCRYPTION_KEY,
  );
  const secondEncryptedToken = encryptShopifyToken(
    "shpat_test-token-value",
    TEST_ENCRYPTION_KEY,
  );

  assert.notEqual(firstEncryptedToken, secondEncryptedToken);
  assert.equal(
    decryptShopifyToken(firstEncryptedToken, TEST_ENCRYPTION_KEY),
    "shpat_test-token-value",
  );
  assert.equal(
    decryptShopifyToken(secondEncryptedToken, TEST_ENCRYPTION_KEY),
    "shpat_test-token-value",
  );
});

test("rejects modified encrypted Shopify tokens and incorrect keys", () => {
  const encryptedToken = encryptShopifyToken(
    "shpat_test-token-value",
    TEST_ENCRYPTION_KEY,
  );

  assert.throws(
    () =>
      decryptShopifyToken(
        tamperWithCiphertext(encryptedToken),
        TEST_ENCRYPTION_KEY,
      ),
    /Encrypted Shopify token is invalid or could not be decrypted\./,
  );
  assert.throws(
    () => decryptShopifyToken(encryptedToken, OTHER_ENCRYPTION_KEY),
    /Encrypted Shopify token is invalid or could not be decrypted\./,
  );
  assert.throws(
    () => decryptShopifyToken("not-an-encrypted-token", TEST_ENCRYPTION_KEY),
    /Encrypted Shopify token is invalid or could not be decrypted\./,
  );
});

test("loads a base64-encoded 32-byte Shopify token encryption key", () => {
  const encodedKey = TEST_ENCRYPTION_KEY.toString("base64");

  assert.deepEqual(
    readShopifyTokenEncryptionKey({
      [SHOPIFY_TOKEN_ENCRYPTION_KEY_ENV]: encodedKey,
    }),
    TEST_ENCRYPTION_KEY,
  );
  assert.throws(
    () => readShopifyTokenEncryptionKey({}),
    new RegExp(`${SHOPIFY_TOKEN_ENCRYPTION_KEY_ENV} is required\\.`),
  );
  assert.throws(
    () =>
      readShopifyTokenEncryptionKey({
        [SHOPIFY_TOKEN_ENCRYPTION_KEY_ENV]: "not-a-valid-key",
      }),
    new RegExp(
      `${SHOPIFY_TOKEN_ENCRYPTION_KEY_ENV} must be a base64-encoded 32-byte key\\.`,
    ),
  );
});

test("rejects blank Shopify tokens and incorrectly sized encryption keys", () => {
  assert.throws(
    () => encryptShopifyToken("   ", TEST_ENCRYPTION_KEY),
    /Shopify token is required\./,
  );
  assert.throws(
    () => encryptShopifyToken("shpat_test-token-value", Buffer.alloc(16)),
    /Shopify token encryption key must contain 32 bytes\./,
  );
  assert.throws(
    () => decryptShopifyToken("v1.a.b.c", Buffer.alloc(16)),
    /Shopify token encryption key must contain 32 bytes\./,
  );
});
