const logger = require('./logger'); // Assuming logger is in the same directory or accessible
const FILENAME = 'services/hybrid-crypto-service.js';

class HybridCryptoService {
    constructor(forgeService, opensslService) {
        if (!forgeService) {
            throw new Error('ForgeCryptoService instance is required for HybridCryptoService.');
        }
        if (!opensslService) {
            throw new Error('OpenSSLWrapper instance is required for HybridCryptoService.');
        }
        this.forgeService = forgeService;
        this.opensslService = opensslService;
        this.renewalService = null; // For setRenewalService
        logger.info('HybridCryptoService initialized.', null, FILENAME);
    }

    /**
     * Helper to execute a method with fallback.
     * @param {string} methodName - The name of the method to call on primary and fallback services.
     * @param {Array} args - Arguments to pass to the method.
     * @param {string} [operationDescription] - A description of the operation for logging.
     * @returns {Promise<any>}
     * @private
     */
    async _executeWithFallback(methodName, args, operationDescription = methodName) {
        try {
            if (typeof this.forgeService[methodName] !== 'function') {
                logger.error(`Method ${methodName} does not exist on ForgeCryptoService.`, null, FILENAME);
                throw new Error(`Primary service (ForgeCryptoService) does not support ${methodName}.`);
            }
            logger.debug(`Attempting ${operationDescription} with ForgeCryptoService.`, { args }, FILENAME);
            return await this.forgeService[methodName](...args);
        } catch (forgeError) {
            logger.warn(`ForgeCryptoService failed for ${operationDescription}: ${forgeError.message}. Attempting OpenSSLWrapper fallback.`, forgeError, FILENAME);
            if (typeof this.opensslService[methodName] !== 'function') {
                logger.error(`Fallback method ${methodName} does not exist on OpenSSLWrapper. Re-throwing Forge error.`, forgeError, FILENAME);
                throw forgeError; // Re-throw original error if fallback method doesn't exist
            }
            try {
                logger.debug(`Attempting ${operationDescription} with OpenSSLWrapper as fallback.`, { args }, FILENAME);
                return await this.opensslService[methodName](...args);
            } catch (opensslError) {
                logger.error(`OpenSSLWrapper fallback also failed for ${operationDescription}: ${opensslError.message}`, opensslError, FILENAME);
                throw opensslError; // Re-throw the error from the fallback
            }
        }
    }

    async getCertificateInfo(certPath, certNameLog = null) {
        return this._executeWithFallback('getCertificateInfo', [certPath, certNameLog], `get certificate info for ${certNameLog || certPath}`);
    }

    async generateKeyPair(options = {}) {
        // OpenSSLWrapper might not have a direct equivalent or might be more complex to call.
        // For now, defaulting to forgeService or you can implement specific fallback.
        logger.debug('generateKeyPair called on HybridCryptoService, defaulting to ForgeCryptoService.', null, FILENAME);
        return this.forgeService.generateKeyPair(options);
        // If OpenSSLWrapper has a compatible generateKeyPair:
        // return this._executeWithFallback('generateKeyPair', [options], 'generate key pair');
    }

    async createCertificate(config = {}) {
        return this._executeWithFallback('createCertificate', [config], `create certificate for ${config.name || 'new certificate'}`);
    }

    async renewCertificate(config = {}) {
        return this._executeWithFallback('renewCertificate', [config], `renew certificate for ${config.name || config.existingCertPath}`);
    }

    async getPublicKeyFromCsr(csrPem) {
        return this._executeWithFallback('getPublicKeyFromCsr', [csrPem], 'get public key from CSR');
    }

    async getPublicKeyInfo(publicKey) {
        // This method's fallback might be tricky if OpenSSLWrapper expects a path vs. PEM string
        // For now, assuming signatures are compatible or primary is preferred.
        logger.debug('getPublicKeyInfo called on HybridCryptoService, attempting ForgeCryptoService first.', null, FILENAME);
        try {
            return await this.forgeService.getPublicKeyInfo(publicKey);
        } catch (forgeError) {
            logger.warn(`ForgeCryptoService failed for getPublicKeyInfo: ${forgeError.message}. Fallback to OpenSSL might not be directly applicable or implemented.`, forgeError, FILENAME);
            // If OpenSSLWrapper has a compatible getPublicKeyInfo:
            // try { return await this.opensslService.getPublicKeyInfo(publicKey); } catch (e) { throw e; }
            throw forgeError; // Or re-throw if no suitable fallback
        }
    }

    async getCsrInfo(csrPem) {
        return this._executeWithFallback('getCsrInfo', [csrPem], 'get CSR info');
    }

    async exportToPkcs12(config = {}) {
        return this._executeWithFallback('exportToPkcs12', [config], `export PKCS12 for ${config.name || 'certificate'}`);
    }

    async importFromPkcs12(options = {}) {
        return this._executeWithFallback('importFromPkcs12', [options], `import PKCS12 from ${options.p12Path}`);
    }

    async exportToPkcs7(certs, options = {}) {
        // OpenSSLWrapper might handle this differently (e.g. via command line args)
        logger.debug('exportToPkcs7 called on HybridCryptoService, defaulting to ForgeCryptoService.', null, FILENAME);
        return this.forgeService.exportToPkcs7(certs, options);
        // If OpenSSLWrapper has a compatible exportToPkcs7:
        // return this._executeWithFallback('exportToPkcs7', [certs, options], 'export PKCS7');
    }

    async importFromPkcs7(p7bPathOrPem, options = {}) {
        logger.debug('importFromPkcs7 called on HybridCryptoService, defaulting to ForgeCryptoService.', null, FILENAME);
        return this.forgeService.importFromPkcs7(p7bPathOrPem, options);
        // If OpenSSLWrapper has a compatible importFromPkcs7:
        // return this._executeWithFallback('importFromPkcs7', [p7bPathOrPem, options], `import PKCS7 from ${p7bPathOrPem}`);
    }
    
    async convertCertificatePemToDer(pemCertificate) {
        return this._executeWithFallback('convertCertificatePemToDer', [pemCertificate], 'convert PEM to DER');
    }

    async convertCertificateDerToPem(derCertificateBuffer) {
        return this._executeWithFallback('convertCertificateDerToPem', [derCertificateBuffer], 'convert DER to PEM');
    }

    setRenewalService(renewalService) {
        this.renewalService = renewalService;
        if (typeof this.forgeService.setRenewalService === 'function') {
            this.forgeService.setRenewalService(renewalService);
        }
        if (typeof this.opensslService.setRenewalService === 'function') {
            this.opensslService.setRenewalService(renewalService);
        }
        logger.debug('RenewalService set for HybridCryptoService and underlying services.', null, FILENAME);
    }
}

module.exports = HybridCryptoService;