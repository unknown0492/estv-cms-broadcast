const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const TOKEN_FILE = '.tokens';
const TOKEN_PATH = path.join(__dirname, TOKEN_FILE);
// Generate a proper 32-byte key from the string
const ENCRYPTION_KEY = crypto.createHash('sha256').update('EstVAuth2024SecureKey123456789012').digest();

class AuthManager {
    constructor() {
        this.accessToken = null;
        this.refreshToken = null;
    }

    // Encrypt sensitive data
    encrypt(text) {
        const iv = crypto.randomBytes(16);
        const cipher = crypto.createCipheriv('aes-256-cbc', ENCRYPTION_KEY, iv);
        let encrypted = cipher.update(text, 'utf8', 'hex');
        encrypted += cipher.final('hex');
        return iv.toString('hex') + ':' + encrypted;
    }

    // Decrypt sensitive data
    decrypt(text) {
        try {
            const textParts = text.split(':');
            const iv = Buffer.from(textParts.shift(), 'hex');
            const encryptedText = textParts.join(':');
            const decipher = crypto.createDecipheriv('aes-256-cbc', ENCRYPTION_KEY, iv);
            let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
            decrypted += decipher.final('utf8');
            return decrypted;
        } catch (error) {
            console.error('✗ Failed to decrypt token data:', error.message);
            return null;
        }
    }

    // Load stored tokens from file
    loadStoredTokens() {
        try {
            if (!fs.existsSync(TOKEN_PATH)) {
                console.log('  No stored tokens found');
                return false;
            }

            const encryptedData = fs.readFileSync(TOKEN_PATH, 'utf8');
            const decryptedData = this.decrypt(encryptedData);
            
            if (!decryptedData) {
                console.log('  Failed to decrypt stored tokens');
                return false;
            }

            const tokenData = JSON.parse(decryptedData);
            this.accessToken = tokenData.access_token;
            this.refreshToken = tokenData.refresh_token;
            
            console.log('✓ Stored tokens loaded successfully');
            return true;
        } catch (error) {
            console.error('✗ Error loading stored tokens:', error.message);
            return false;
        }
    }

    // Save tokens to encrypted file
    saveTokens(accessToken, refreshToken) {
        try {
            //console.log( accessToken );
            const tokenData = {
                access_token: accessToken,
                refresh_token: refreshToken,
                saved_at: new Date().toISOString()
            };

            const jsonData = JSON.stringify(tokenData);
            const encryptedData = this.encrypt(jsonData);
            
            fs.writeFileSync(TOKEN_PATH, encryptedData, 'utf8');
            
            this.accessToken = accessToken;
            this.refreshToken = refreshToken;
            
            console.log('✓ Tokens saved securely');
        } catch (error) {
            console.error('✗ Error saving tokens:', error.message);
        }
    }

    // Clear stored tokens
    clearTokens() {
        try {
            if (fs.existsSync(TOKEN_PATH)) {
                fs.unlinkSync(TOKEN_PATH);
            }
            this.accessToken = null;
            this.refreshToken = null;
            console.log('✓ Tokens cleared');
        } catch (error) {
            console.error('✗ Error clearing tokens:', error.message);
        }
    }

    // Get current access token
    getAccessToken() {
        return this.accessToken;
    }

    // Check if we have valid tokens
    hasValidTokens() {
        return this.accessToken && this.refreshToken;
    }

    // Handle token refresh scenario
    handleTokenRefresh() {
        console.log('⚠ Access token expired, clearing stored tokens');
        this.clearTokens();
        return false;
    }

    // Handle unauthorized access
    handleUnauthorizedAccess(message) {
        console.error('✗ UNAUTHORIZED ACCESS:');
        console.error(`  ${message}`);
        console.error('  The application is not authorized to access the API.');
        console.error('  Please contact your administrator to verify your app credentials.');
        this.clearTokens();
        process.exit(1);
    }
}

module.exports = AuthManager;