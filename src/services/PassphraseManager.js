/**
 * @fileoverview Passphrase Manager - Securely manages certificate passphrases with encryption
 * @module services/PassphraseManager
 * @requires fs
 * @requires path
 * @requires crypto
 * @requires ./logger
 * @author Certificate Manager
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const logger = require('./logger');

const FILENAME = 'services/PassphraseManager.js';

/**
 * Passphrase Manager for securely storing and retrieving certificate passphrases.
 * Uses AES-256-GCM encryption to protect passphrases at rest.
 */
class PassphraseManager {
    /**
     * Create a new PassphraseManager instance
     * @param {string} configDir - Directory path for storing encrypted passphrase file and encryption key
     */
    constructor(configDir) {
        this.configDir = configDir;
        this.passphraseStoreFile = path.join(configDir, '.passphrases.enc');
        
        logger.debug(`Initializing PassphraseManager with config dir: ${configDir}`, null, FILENAME);
        
        // Ensure the config directory exists
        if (!fs.existsSync(configDir)) {
            logger.fine(`Config directory doesn't exist, creating: ${configDir}`, null, FILENAME);
            fs.mkdirSync(configDir, { recursive: true });
        }
        
        // Initialize in-memory passphrases cache
        this.passphrases = {};
        
        // Load any stored passphrases
        this.loadPassphrases();
        logger.fine('PassphraseManager initialization complete', null, FILENAME);
    }
      /**
     * Load and decrypt passphrases from the encrypted storage file.
     * Populates the in-memory passphrases cache with decrypted data.
     * @private
     * @throws {Error} Throws error if decryption fails or file is corrupted
     */
    loadPassphrases() {
        try {
            if (fs.existsSync(this.passphraseStoreFile)) {
                logger.fine(`Loading encrypted passphrases from: ${this.passphraseStoreFile}`, null, FILENAME);
                const encryptedData = fs.readFileSync(this.passphraseStoreFile, 'utf8');
                
                logger.finest('Parsing encrypted data structure', null, FILENAME);
                const [ivHex, authTagHex, encryptedContent] = encryptedData.split(':');
                
                logger.finest('Retrieving encryption key', null, FILENAME);
                const key = this.getEncryptionKey();
                const iv = Buffer.from(ivHex, 'hex');
                const authTag = Buffer.from(authTagHex, 'hex');
                
                logger.finest('Creating decipher for passphrase decryption', null, FILENAME);
                const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
                decipher.setAuthTag(authTag);
                
                let decrypted = decipher.update(encryptedContent, 'hex', 'utf8');
                decrypted += decipher.final('utf8');
                
                const passphraseStore = JSON.parse(decrypted);
                logger.fine(`Decrypted passphrase store contains ${Object.keys(passphraseStore).length} entries`, null, FILENAME);
                
                // Store the information about which certificates have passphrases
                // but don't load the actual passphrases into memory yet
                for (const fingerprint of Object.keys(passphraseStore)) {
                    this.passphrases[fingerprint] = {
                        hasStoredPassphrase: true,
                        passphrase: null // Will be loaded on demand
                    };
                    logger.finest(`Registered passphrase metadata for certificate: ${fingerprint}`, null, FILENAME);
                }
                
                logger.info(`Loaded passphrase metadata for ${Object.keys(passphraseStore).length} certificates`, null, FILENAME);
            } else {
                logger.debug('No passphrase store file found, starting with empty store', null, FILENAME);
            }
        } catch (error) {
            logger.error(`Error loading passphrases: ${error.message}`, error, FILENAME);
            this.passphrases = {};
        }
    }
    
    /**
     * Save passphrases to encrypted file
     * @private
     */
    savePassphrases() {
        try {
            logger.fine('Preparing to save passphrases to encrypted file', null, FILENAME);
            const key = this.getEncryptionKey();
            const iv = crypto.randomBytes(16);
            
            logger.finest('Creating cipher for passphrase encryption', null, FILENAME);
            const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
            
            // Create a store object with just the passphrases
            const passphraseStore = {};
            let count = 0;
            for (const [fingerprint, data] of Object.entries(this.passphrases)) {
                if (data.hasStoredPassphrase) {
                    passphraseStore[fingerprint] = data.passphrase || '';
                    count++;
                    logger.finest(`Including passphrase for: ${fingerprint}`, null, FILENAME);
                }
            }
            logger.fine(`Preparing to save ${count} passphrases`, null, FILENAME);
            
            const data = JSON.stringify(passphraseStore);
            let encrypted = cipher.update(data, 'utf8', 'hex');
            encrypted += cipher.final('hex');
            const authTag = cipher.getAuthTag();
            
            // Format: iv:authTag:encryptedContent
            const encryptedData = `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
            
            logger.finest(`Writing encrypted data to: ${this.passphraseStoreFile}`, null, FILENAME);
            fs.writeFileSync(this.passphraseStoreFile, encryptedData, { mode: 0o600 });
            
            logger.info(`Passphrases saved securely (${count} entries)`, null, FILENAME);
        } catch (error) {
            logger.error(`Error saving passphrases: ${error.message}`, error, FILENAME);
            throw error;
        }
    }
    
    /**
     * Check if a stored passphrase exists for a certificate
     * @param {string} fingerprint - The certificate fingerprint
     * @returns {boolean} True if a passphrase is stored
     */
    hasPassphrase(fingerprint) {
        if (!fingerprint) {
            logger.fine('hasPassphrase called with empty fingerprint', null, FILENAME);
            return false;
        }
        
        logger.finest(`Checking for stored passphrase for: ${fingerprint}`, null, FILENAME);
        // Check if we have info about this certificate's passphrase
        const result = this.passphrases[fingerprint]?.hasStoredPassphrase === true;
        logger.fine(`Certificate ${fingerprint} has stored passphrase: ${result}`, null, FILENAME);
        return result;
    }
    
    /**
     * Get the passphrase for a certificate
     * @param {string} fingerprint - The certificate fingerprint
     * @returns {string|null} The passphrase or null if not found
     */
    getPassphrase(fingerprint) {
        if (!fingerprint) {
            logger.fine('getPassphrase called with empty fingerprint', null, FILENAME);
            return null;
        }
        
        logger.finest(`Attempting to retrieve passphrase for: ${fingerprint}`, null, FILENAME);
        
        // Check if we have this passphrase
        const entry = this.passphrases[fingerprint];
        if (!entry || !entry.hasStoredPassphrase) {
            logger.fine(`No passphrase found for certificate: ${fingerprint}`, null, FILENAME);
            return null;
        }
        
        // If we haven't loaded the actual passphrase yet, load the entire store
        if (entry.passphrase === null) {
            logger.fine(`Passphrase not loaded in memory, loading for: ${fingerprint}`, null, FILENAME);
            this.loadPassphraseContent(fingerprint);
        }
        
        const hasPassphrase = !!this.passphrases[fingerprint]?.passphrase;
        logger.fine(`Passphrase ${hasPassphrase ? 'retrieved' : 'not available'} for: ${fingerprint}`, null, FILENAME);
        return this.passphrases[fingerprint]?.passphrase || null;
    }
    
    /**
     * Load the actual passphrase content for a specific certificate
     * @private
     * @param {string} fingerprint - The certificate fingerprint
     */
    loadPassphraseContent(fingerprint) {
        try {
            logger.fine(`Loading passphrase content for: ${fingerprint}`, null, FILENAME);
            
            if (fs.existsSync(this.passphraseStoreFile)) {
                logger.finest(`Reading encrypted passphrase file: ${this.passphraseStoreFile}`, null, FILENAME);
                const encryptedData = fs.readFileSync(this.passphraseStoreFile, 'utf8');
                const [ivHex, authTagHex, encryptedContent] = encryptedData.split(':');
                
                logger.finest('Retrieving encryption key for decryption', null, FILENAME);
                const key = this.getEncryptionKey();
                const iv = Buffer.from(ivHex, 'hex');
                const authTag = Buffer.from(authTagHex, 'hex');
                
                logger.finest('Creating decipher for specific passphrase', null, FILENAME);
                const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
                decipher.setAuthTag(authTag);
                
                let decrypted = decipher.update(encryptedContent, 'hex', 'utf8');
                decrypted += decipher.final('utf8');
                
                const passphraseStore = JSON.parse(decrypted);
                
                // Get the specific passphrase
                if (passphraseStore[fingerprint]) {
                    logger.fine(`Found and loaded passphrase for: ${fingerprint}`, null, FILENAME);
                    this.passphrases[fingerprint] = {
                        hasStoredPassphrase: true,
                        passphrase: passphraseStore[fingerprint]
                    };
                } else {
                    logger.fine(`No passphrase found in store for: ${fingerprint}`, null, FILENAME);
                }
            } else {
                logger.fine('Passphrase store file does not exist', null, FILENAME);
            }
        } catch (error) {
            logger.error(`Error loading passphrase for ${fingerprint}: ${error.message}`, error, FILENAME);
        }
    }
    
    /**
     * Store a certificate passphrase
     * @param {string} fingerprint - The certificate fingerprint
     * @param {string} passphrase - The passphrase to store
     */
    storePassphrase(fingerprint, passphrase) {
        if (!fingerprint) {
            logger.error('Attempted to store passphrase with empty fingerprint', null, FILENAME);
            throw new Error('Fingerprint is required to store a passphrase');
        }
        
        logger.fine(`Storing passphrase for certificate: ${fingerprint}`, null, FILENAME);
        this.passphrases[fingerprint] = {
            hasStoredPassphrase: true,
            passphrase: passphrase
        };
        
        logger.finest('Saving updated passphrase store', null, FILENAME);
        this.savePassphrases();
        logger.info(`Passphrase stored for certificate: ${fingerprint}`, null, FILENAME);
    }
    
    /**
     * Delete a stored passphrase
     * @param {string} fingerprint - The certificate fingerprint
     * @returns {boolean} Success status
     */
    deletePassphrase(fingerprint) {
        if (!fingerprint) {
            logger.fine('Attempted to delete passphrase with empty fingerprint', null, FILENAME);
            return false;
        }
        
        if (!this.passphrases[fingerprint]) {
            logger.fine(`No passphrase found to delete for: ${fingerprint}`, null, FILENAME);
            return false;
        }
        
        logger.fine(`Deleting passphrase for certificate: ${fingerprint}`, null, FILENAME);
        delete this.passphrases[fingerprint];
        
        logger.finest('Saving updated passphrase store after deletion', null, FILENAME);
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
            logger.finest('Using cached encryption key from memory', null, FILENAME);
            return this.encryptionKey;
        }
        
        // Get the key file path
        const keyFilePath = path.join(this.configDir, '.encryption-key');
        logger.finest(`Encryption key path: ${keyFilePath}`, null, FILENAME);
        
        // Check if the key file exists
        if (fs.existsSync(keyFilePath)) {
            // Read the existing key
            logger.fine('Reading existing encryption key from file', null, FILENAME);
            this.encryptionKey = fs.readFileSync(keyFilePath);
            return this.encryptionKey;
        }
        
        // Generate a new encryption key
        logger.fine('No existing encryption key found, generating new key', null, FILENAME);
        this.encryptionKey = crypto.randomBytes(32);
        
        // Save the key to file with restrictive permissions
        logger.finest(`Saving new encryption key to: ${keyFilePath}`, null, FILENAME);
        fs.writeFileSync(keyFilePath, this.encryptionKey, { mode: 0o600 });
        logger.info('New encryption key generated and saved', null, FILENAME);
        
        return this.encryptionKey;
    }
    
    /**
     * Rotate the encryption key and re-encrypt all passphrases
     * @returns {boolean} Success status
     */
    rotateEncryptionKey() {
        try {
            logger.info('Starting encryption key rotation process', null, FILENAME);
            
            // Load all passphrases into memory first
            logger.fine('Loading all passphrases into memory before key rotation', null, FILENAME);
            for (const fingerprint of Object.keys(this.passphrases)) {
                if (this.passphrases[fingerprint].hasStoredPassphrase && 
                    this.passphrases[fingerprint].passphrase === null) {
                    logger.finest(`Loading passphrase for ${fingerprint} before rotation`, null, FILENAME);
                    this.loadPassphraseContent(fingerprint);
                }
            }
            
            // Keep old key for backup
            const oldKeyPath = path.join(this.configDir, '.encryption-key.bak');
            logger.fine(`Backing up old encryption key to: ${oldKeyPath}`, null, FILENAME);
            fs.copyFileSync(path.join(this.configDir, '.encryption-key'), oldKeyPath);
            
            // Generate new key
            logger.fine('Generating new encryption key', null, FILENAME);
            this.encryptionKey = crypto.randomBytes(32);
            
            // Save the new key
            const keyPath = path.join(this.configDir, '.encryption-key');
            logger.finest(`Saving new encryption key to: ${keyPath}`, null, FILENAME);
            fs.writeFileSync(
                keyPath, 
                this.encryptionKey, 
                { mode: 0o600 }
            );
            
            // Re-encrypt passphrases with new key
            logger.fine('Re-encrypting passphrases with new key', null, FILENAME);
            this.savePassphrases();
            
            logger.info('Encryption key rotated successfully', null, FILENAME);
            return true;
        } catch (error) {
            logger.error(`Error rotating encryption key: ${error.message}`, error, FILENAME);
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
            logger.fine('No valid legacy passphrases provided for import', null, FILENAME);
            return 0;
        }
        
        logger.info(`Starting import of legacy passphrases, ${Object.keys(legacyPassphrases).length} candidates found`, null, FILENAME);
        let importCount = 0;
        
        for (const [fingerprint, passphrase] of Object.entries(legacyPassphrases)) {
            if (fingerprint && passphrase) {
                logger.fine(`Importing legacy passphrase for: ${fingerprint}`, null, FILENAME);
                this.storePassphrase(fingerprint, passphrase);
                importCount++;
            } else {
                logger.finest(`Skipping invalid legacy passphrase entry for: ${fingerprint || 'unknown'}`, null, FILENAME);
            }
        }
        
        if (importCount > 0) {
            logger.info(`Successfully imported ${importCount} passphrases from legacy storage`, null, FILENAME);
        } else {
            logger.fine('No valid passphrases were imported from legacy storage', null, FILENAME);
        }
        
        return importCount;
    }
}

module.exports = PassphraseManager;