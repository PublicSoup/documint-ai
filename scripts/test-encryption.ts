import { env } from 'process';

// Mock env var for testing BEFORE importing the module
process.env.ENCRYPTION_KEY = '00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff';

console.log("Testing Encryption Utility...");

async function runTest() {
    try {
        const { encrypt, decrypt } = await import('../src/lib/security/encryption');

        const original = "gho_SuperSecretToken12345";
        console.log(`Original: ${original}`);

        const encrypted = encrypt(original);
        console.log(`Encrypted: ${encrypted}`);

        if (encrypted === original) {
            throw new Error("Encryption failed: Output equals input");
        }

        const decrypted = decrypt(encrypted);
        console.log(`Decrypted: ${decrypted}`);

        if (decrypted !== original) {
            throw new Error(`Decryption failed: Expected ${original}, got ${decrypted}`);
        }

        console.log("✅ Encryption/Decryption Roundtrip Success!");
    } catch (error) {
        console.error("❌ Test Failed:", error);
        process.exit(1);
    }
}

runTest();
