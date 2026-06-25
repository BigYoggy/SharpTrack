const crypto = require('crypto');

/**
 * Validates if a string matches CUID format
 * @param {string} id 
 * @returns {boolean}
 */
function isValidCuid(id) {
    if (typeof id !== 'string') return false;
    return /^c[a-z0-9]{20,30}$/i.test(id);
}

/**
 * Validates if a string matches UUID format
 * @param {string} id 
 * @returns {boolean}
 */
function isValidUuid(id) {
    if (typeof id !== 'string') return false;
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
}

/**
 * Validates if a string is a valid ID (either CUID or UUID)
 * @param {string} id 
 * @returns {boolean}
 */
function isValidId(id) {
    return isValidCuid(id) || isValidUuid(id);
}

/**
 * Validates barcode format (alphanumeric and hyphens, 5-30 chars)
 * @param {string} code 
 * @returns {boolean}
 */
function isValidBarcode(code) {
    if (typeof code !== 'string') return false;
    return /^[a-zA-Z0-9-]{5,30}$/.test(code);
}

/**
 * Validates image size and magic bytes signature
 * Supports: JPEG (FF D8 FF), PNG (89 50 4E 47), WEBP (RIFF ... WEBP)
 * @param {string|Buffer} imageInput - Base64 string or raw Buffer
 * @param {number} maxSizeBytes - Default 5MB (5 * 1024 * 1024)
 * @returns {{valid: boolean, error?: string, mimeType?: string}}
 */
function validateImageContent(imageInput, maxSizeBytes = 5 * 1024 * 1024) {
    let buffer;

    try {
        if (Buffer.isBuffer(imageInput)) {
            buffer = imageInput;
        } else if (typeof imageInput === 'string') {
            // Remove data URI prefix if present
            const base64Str = imageInput.replace(/^data:image\/\w+;base64,/i, "");
            buffer = Buffer.from(base64Str, 'base64');
        } else {
            return { valid: false, error: 'Invalid image input type' };
        }
    } catch (e) {
        return { valid: false, error: 'Failed to parse image data' };
    }

    // Check size
    if (buffer.length > maxSizeBytes) {
        return { valid: false, error: `Image size exceeds the limit of ${Math.round(maxSizeBytes / (1024 * 1024))}MB` };
    }

    if (buffer.length < 4) {
        return { valid: false, error: 'Image file too small or corrupted' };
    }

    // Read magic bytes
    const isPng = buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47;
    const isJpeg = buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
    const isWebp = buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46 && // 'RIFF'
                   buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50; // 'WEBP'

    if (isPng) {
        return { valid: true, mimeType: 'image/png' };
    }
    if (isJpeg) {
        return { valid: true, mimeType: 'image/jpeg' };
    }
    if (isWebp) {
        return { valid: true, mimeType: 'image/webp' };
    }

    return { valid: false, error: 'Unsupported file signature or invalid image content' };
}

module.exports = {
    isValidCuid,
    isValidUuid,
    isValidId,
    isValidBarcode,
    validateImageContent
};
