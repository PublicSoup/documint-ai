import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

// Ensure this is set in your .env file
// It must be a 32-byte hex string (64 characters)
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16; // For AES, this is always 16
const KEY = process.env.ENCRYPTION_KEY ? Buffer.from(process.env.ENCRYPTION_KEY, 'hex') : null;

/** Whether key storage is usable — ENCRYPTION_KEY present and exactly 32 bytes. */
export function isEncryptionConfigured(): boolean {
    return KEY !== null && KEY.length === 32;
}

export function encrypt(text: string): string {
    if (!KEY) {
        throw new Error('ENCRYPTION_KEY is not defined in environment variables');
    }
    if (KEY.length !== 32) {
        throw new Error('ENCRYPTION_KEY must be 32 bytes (64 hex characters)');
    }

    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv(ALGORITHM, KEY, iv);

    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    const authTag = cipher.getAuthTag();

    // Format: iv:authTag:encrypted
    return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
}

export function decrypt(text: string): string {
    if (!KEY) {
        throw new Error('ENCRYPTION_KEY is not defined in environment variables');
    }

    const parts = text.split(':');
    if (parts.length !== 3) {
        throw new Error('Invalid encrypted text format');
    }

    const [ivHex, authTagHex, encryptedHex] = parts;
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    const decipher = createDecipheriv(ALGORITHM, KEY, iv);

    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
}
