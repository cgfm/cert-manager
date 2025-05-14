const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const logger = require('./logger');

const FILENAME = 'services/PassphraseManager.js';

/**
 * Manages certificate passphrases securely
 */
class PassphraseManager {
    /**
     * Create a new PassphraseManager instance
     * @param {string} configDir - Directory for storing encryption key
     */
    constructor(configDir) {
        this.configDir = configDir;
        this.passphraseStoreFile = path.join(configDir, '.passphrases.enc');
        
        // Ensure the config directory exists
        if (!fs.existsSync(configDir)) {
            fs.mkdirSync(configDir, { recursive: true });
        }
        
        // Initialize in-memory passphrases cache
        this.passphrases = {};
        
        // Load any stored passphrases
        this.loadPassphrases();
    }
    
    /**
     * Load encrypted passphrases from file
     * @private
     */
    loadPassphrases() {
        try {
            if (fs.existsSync(this.passphraseStoreFile)) {
                const encryptedData = fs.readFileSync(this.passphraseStoreFile, 'utf8');
                const [ivHex, authTagHex, encryptedContent] = encryptedData.split(':');
                
                const key = this.getEncryptionKey();
                const iv = Buffer.from(ivHex, 'hex');
                const authTag = Buffer.from(authTagHex, 'hex');
                
                const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
                decipher.setAuthTag(authTag);
                
                let decrypted = decipher.update(encryptedContent, 'hex', 'utf8');
                decrypted += decipher.final('utf8');
                
                const passphraseStore = JSON.parse(decrypted);
                
                // Store the information about which certificates have passphrases
                // but don't load the actual passphrases into memory yet
                for (const fingerprint of Object.keys(passphraseStore)) {
                    this.passphrases[fingerprint] = {
                        hasStoredPassphrase: true,
                        passphrase: null // Will be loaded on demand
                    };
                }
                
                logger.info(`Loaded passphrase metadata for ${Object.keys(passphraseStore).length} certificates`, null, FILENAME);
            }
        } catch (error) {
            logger.error(`Error loading passphrases: ${error.message}`, null, FILENAME);
            this.passphrases = {};
        }
    }
    
    /**
     * Save passphrases to encrypted file
     * @private
     */
    savePassphrases() {
        try {
            const key = this.getEncryptionKey();
            const iv = crypto.randomBytes(16);
            const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
            
            // Create a store object with just the passphrases
            const passphraseStore = {};
            for (const [fingerprint, data] of Object.entries(this.passphrases)) {
                if (data.hasStoredPassphrase) {
                    passphraseStore[fingerprint] = data.passphrase || '';
                }
            }
            
            const data = JSON.stringify(passphraseStore);
            let encrypted = cipher.update(data, 'utf8', 'hex');
            encrypted += cipher.final('hex');
            const authTag = cipher.getAuthTag();
            
            // Format: iv:authTag:encryptedContent
            const encryptedData = `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
            
            fs.writeFileSync(this.passphraseStoreFile, encryptedData, { mode: 0o600 });
            
            logger.info('Passphrases saved securely', null, FILENAME);
        } catch (error) {
            logger.error(`Error saving passphrases: ${error.message}`, null, FILENAME);
            throw error;
        }
    }
    
    /**
     * Check if a stored passphrase exists for a certificate
     * @param {string} fingerprint - The certificate fingerprint
     * @returns {boolean} True if a passphrase is stored
     */
    hasPassphrase(fingerprint) {
        if (!fingerprint) return false;
        
        // Check if we have info about this certificate's passphrase
        return this.passphrases[fingerprint]?.hasStoredPassphrase === true;
    }
    
    /**
     * Get the passphrase for a certificate
     * @param {string} fingerprint - The certificate fingerprint
     * @returns {string|null} The passphrase or null if not found
     */
    getPassphrase(fingerprint) {
        if (!fingerprint) return null;
        
        // Check if we have this passphrase
        const entry = this.passphrases[fingerprint];
        if (!entry || !entry.hasStoredPassphrase) {
            return null;
        }
        
        // If we haven't loaded the actual passphrase yet, load the entire store
        if (entry.passphrase === null) {
            this.loadPassphraseContent(fingerprint);
        }
        
        return this.passphrases[fingerprint]?.passphrase || null;
    }
    
    /**
     * Load the actual passphrase content for a specific certificate
     * @private
     * @param {string} fingerprint - The certificate fingerprint
     */
    loadPassphraseContent(fingerprint) {
        try {
            if (fs.existsSync(this.passphraseStoreFile)) {
                const encryptedData = fs.readFileSync(this.passphraseStoreFile, 'utf8');
                const [ivHex, authTagHex, encryptedContent] = encryptedData.split(':');
                
                const key = this.getEncryptionKey();
                const iv = Buffer.from(ivHex, 'hex');
                const authTag = Buffer.from(authTagHex, 'hex');
                
                const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
                decipher.setAuthTag(authTag);
                
                let decrypted = decipher.update(encryptedContent, 'hex', 'utf8');
                decrypted += decipher.final('utf8');
                
                const passphraseStore = JSON.parse(decrypted);
                
                // Get the specific passphrase
                if (passphraseStore[fingerprint]) {
                    this.passphrases[fingerprint] = {
                        hasStoredPassphrase: true,
                        passphrase: passphraseStore[fingerprint]
                    };
                }
            }
        } catch (error) {
            logger.error(`Error loading passphrase for ${fingerprint}: ${error.message}`, null, FILENAME);
        }
    }
    
    /**
     * Store a certificate passphrase
     * @param {string} fingerprint - The certificate fingerprint
     * @param {string} passphrase - The passphrase to store
     */
    storePassphrase(fingerprint, passphrase) {
        if (!fingerprint) {
            throw new Error('Fingerprint is required to store a passphrase');
        }
        
        this.passphrases[fingerprint] = {
            hasStoredPassphrase: true,
            passphrase: passphrase
        };
        
        this.savePassphrases();
        logger.info(`Passphrase stored for certificate: ${fingerprint}`, null, FILENAME);
    }
    
    /**
     * Delete a stored passphrase
     * @param {string} fingerprint - The certificate fingerprint
     * @returns {boolean} Success status
     */
    deletePassphrase(fingerprint) {
        if (!fingerprint || !this.passphrases[fingerprint]) {
            return false;
        }
        
        delete this.passphrases[fingerprint];
        this.savePassphrases();
        logger.info(`Passphrase deleted for certificate: ${fingerprint}`, null, FILENAME);
        
        return true;
    }
    
    /**
     * Get encryption key for passphrase storage
     * @private
     * @returns {Buffer} 32-byte encryption key
     */
    getEncryptionKey() {
        // Check if we already have a key in memory
        if (this.encryptionKey) {
            return this.encryptionKey;
        }
        
        // Get the key file path
        const keyFilePath = path.join(this.configDir, '.encryption-key');
        
        // Check if the key file exists
        if (fs.existsSync(keyFilePath)) {
            // Read the existing key
            this.encryptionKey = fs.readFileSync(keyFilePath);
            return this.encryptionKey;
        }
        
        // Generate a new encryption key
        this.encryptionKey = crypto.randomBytes(32);
        
        // Save the key to file with restrictive permissions
        fs.writeFileSync(keyFilePath, this.encryptionKey, { mode: 0o600 });
        
        return this.encryptionKey;
    }
    
    /**
     * Rotate the encryption key and re-encrypt all passphrases
     * @returns {boolean} Success status
     */
    rotateEncryptionKey() {
        try {
            // Load all passphrases into memory first
            for (const fingerprint of Object.keys(this.passphrases)) {
                if (this.passphrases[fingerprint].hasStoredPassphrase && 
                    this.passphrases[fingerprint].passphrase === null) {
                    this.loadPassphraseContent(fingerprint);
                }
            }
            
            // Keep old key for backup
            const oldKeyPath = path.join(this.configDir, '.encryption-key.bak');
            fs.copyFileSync(path.join(this.configDir, '.encryption-key'), oldKeyPath);
            
            // Generate new key
            this.encryptionKey = crypto.randomBytes(32);
            
            // Save the new key
            fs.writeFileSync(
                path.join(this.configDir, '.encryption-key'), 
                this.encryptionKey, 
                { mode: 0o600 }
            );
            
            // Re-encrypt passphrases with new key
            this.savePassphrases();
            
            logger.info('Encryption key rotated successfully', null, FILENAME);
            return true;
        } catch (error) {
            logger.error(`Error rotating encryption key: ${error.message}`, null, FILENAME);
            return false;
        }
    }
    
    /**
     * Import passphrases from legacy storage (from ConfigManager)
     * @param {Object} legacyPassphrases - Object with fingerprint -> passphrase mappings
     * @returns {number} Number of imported passphrases
     */
    importLegacyPassphrases(legacyPassphrases) {
        if (!legacyPassphrases || typeof legacyPassphrases !== 'object') {
            return 0;
        }
        
        let importCount = 0;
        
        for (const [fingerprint, passphrase] of Object.entries(legacyPassphrases)) {
            if (fingerprint && passphrase) {
                this.storePassphrase(fingerprint, passphrase);
                importCount++;
            }
        }
        
        if (importCount > 0) {
            logger.info(`Imported ${importCount} passphrases from legacy storage`, null, FILENAME);
        }
        
        return importCount;
    }
}

module.exports = PassphraseManager;