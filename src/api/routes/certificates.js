/**
 * Certificates API Router
 * This module defines the routes for managing certificates in the application.
 * It includes endpoints for creating, updating, deleting, and retrieving certificates,
 * as well as converting them to different formats and managing passphrases.
 * @module api/routes/certificates
 * @requires express
 * @requires ../../services/logger
 * @requires ../../models/Certificate
 * @requires ../../services/OpenSSLWrapper
 * @requires ../../services/CertificateManager
 * @requires ../../services/PassphraseManager
 * @version 0.0.2
 * @author Christian Meiners
 * @license MIT
 * @description This module provides an Express router for managing certificates.
 */

const express = require('express');
const logger = require('../../services/logger');
const initDeploymentActionsRouter = require('./deployment-actions');
const fs = require('fs');
const path = require('path');
const DomainValidator = require('../../utils/DomainValidator');

/**
 * Initialize the certificates router with dependencies
 * @param {Object} deps - Dependencies
 * @param {CertificateManager} deps.certificateManager - Certificate manager instance
 * @param {OpenSSLWrapper} deps.openSSL - OpenSSL wrapper instance
 * @returns {express.Router} Express router
 */
function initCertificatesRouter(deps) {
  const router = express.Router();
  const { certificateManager, openSSL } = deps;

  // Get all certificates
  router.get('/', async (req, res) => {
    try {
      // Check if we need to force refresh
      const forceRefresh = req.query.refresh === 'true';
      
      // Load certificates with cache
      const certificates = await deps.certificateManager.loadCertificates(forceRefresh);
      
      // Format certificates for API response
      const response = Array.from(certificates.values()).map(cert => 
        cert.toApiResponse(deps.certificateManager.passphraseManager)
      );
      
      res.json(response);
    } catch (error) {
      logger.error('Error getting certificates:', error);
      res.status(500).json({ 
        message: `Failed to get certificates: ${error.message}`,
        statusCode: 500 
      });
    }
  });
  
  // Create a new certificate
  router.post('/', async (req, res) => {
    try {
      const { 
        name, domains, ips, certType = 'standard', signWithCA = false,
        caFingerprint, autoRenew = false, renewDaysBeforeExpiry = 30,
        passphrase, storePassphrase = false
      } = req.body;
      
      // Validate required fields
      if (!name) {
        return res.status(400).json({ message: 'Certificate name is required', statusCode: 400 });
      }
      
      if (!domains || !Array.isArray(domains) || domains.length === 0) {
        return res.status(400).json({ message: 'At least one domain is required', statusCode: 400 });
      }
      
      // Create certificate object
      const Certificate = require('../../models/Certificate');
      const cert = new Certificate({
        name,
        san: {
          domains,
          ips: ips || []
        },
        certType,
        config: {
          autoRenew,
          renewDaysBeforeExpiry,
          signWithCA,
          caFingerprint
        }
      });
      
      // Generate paths
      cert.generatePaths(certificateManager.certsDir);
      
      // Find signing CA if needed
      let signingCA = null;
      if (signWithCA && caFingerprint) {
        signingCA = certificateManager.getCertificate(caFingerprint);
        if (!signingCA) {
          return res.status(400).json({ message: 'Specified CA certificate not found', statusCode: 400 });
        }
      }
      
      // Create the certificate
      const result = await cert.createOrRenew(openSSL, {
        certsDir: certificateManager.certsDir,
        signingCA,
        passphrase
      });
      
      // Store passphrase if requested
      if (passphrase && storePassphrase && cert.fingerprint) {
        certificateManager.storePassphrase(cert.fingerprint, passphrase);
      }
      
      // Add to certificate manager and save config
      certificateManager.certificates.set(cert.fingerprint, cert);
      await certificateManager.saveCertificateConfigs();
      
      res.status(201).json(cert.toApiResponse(certificateManager.passphraseManager));
    } catch (error) {
      logger.error('Error creating certificate', error);
      res.status(500).json({ message: `Failed to create certificate: ${error.message}`, statusCode: 500 });
    }
  });
  
  // Get certificate by fingerprint
  router.get('/:fingerprint', async (req, res) => {
    try {
      const { fingerprint } = req.params;
      await certificateManager.loadCertificates();
      
      const cert = certificateManager.getCertificate(fingerprint);
      if (!cert) {
        return res.status(404).json({ message: 'Certificate not found', statusCode: 404 });
      }
      
      res.json(cert.toApiResponse(certificateManager.passphraseManager));
    } catch (error) {
      logger.error(`Error getting certificate ${req.params.fingerprint}`, error);
      res.status(500).json({ message: 'Failed to retrieve certificate', statusCode: 500 });
    }
  });
  
  // Update certificate
  router.put('/:fingerprint', async (req, res) => {
    try {
      const { fingerprint } = req.params;
      const { autoRenew, renewDaysBeforeExpiry, signWithCA, caFingerprint, deployActions } = req.body;
      
      // Get the certificate
      const cert = certificateManager.getCertificate(fingerprint);
      if (!cert) {
        return res.status(404).json({ message: 'Certificate not found', statusCode: 404 });
      }
      
      // Update the configuration
      const updateResult = await certificateManager.updateCertificateConfig(fingerprint, {
        autoRenew,
        renewDaysBeforeExpiry,
        signWithCA,
        caFingerprint,
        deployActions
      });
      
      if (!updateResult) {
        return res.status(500).json({ message: 'Failed to update certificate configuration', statusCode: 500 });
      }
      
      res.json(cert.toApiResponse(certificateManager.passphraseManager));
    } catch (error) {
      logger.error(`Error updating certificate ${req.params.fingerprint}`, error);
      res.status(500).json({ message: 'Failed to update certificate', statusCode: 500 });
    }
  });
  
  // Update certificate metadata (PATCH)
  router.patch('/:fingerprint', async (req, res) => {
    try {
      const { fingerprint } = req.params;
      const { name, description, group, tags, metadata } = req.body;
      
      // Validate input
      if (name !== undefined && (!name || name.trim() === '')) {
        return res.status(400).json({
          message: 'Certificate name cannot be empty',
          statusCode: 400
        });
      }
      
      // Get the certificate
      const cert = certificateManager.getCertificate(fingerprint);
      if (!cert) {
        return res.status(404).json({
          message: `Certificate with fingerprint ${fingerprint} not found`,
          statusCode: 404
        });
      }
      
      // Only update fields that were provided
      const updateData = {};
      
      if (name !== undefined) updateData.name = name;
      if (description !== undefined) updateData.description = description;
      if (group !== undefined) updateData.group = group;
      if (tags !== undefined) updateData.tags = tags;
      if (metadata !== undefined) updateData.metadata = metadata;
      
      // Update the certificate
      const success = await certificateManager.updateCertificateConfig(fingerprint, updateData);
      
      if (!success) {
        return res.status(500).json({
          message: 'Failed to update certificate configuration',
          statusCode: 500
        });
      }
      
      // Get the updated certificate
      const updatedCert = certificateManager.getCertificate(fingerprint);
      
      // Add entry to activity log
      try {
        // Check if activity service exists and has the required function
        const activityServicePath = '../../services/activity-service';
        let activityService;
        
        try {
          activityService = require(activityServicePath);
        } catch (moduleError) {
          logger.debug(`Activity service module not found: ${moduleError.message}`);
          activityService = null;
        }
        
        if (activityService && typeof activityService.addActivity === 'function') {
          await activityService.addActivity({
            action: `Updated metadata for certificate '${updatedCert.name}'`,
            type: 'update',
            target: updatedCert.name,
            metadata: {
              fingerprint: updatedCert.fingerprint,
              fields: Object.keys(updateData)
            }
          });
          logger.debug(`Logged activity for certificate update: ${updatedCert.name}`);
        } else {
          logger.debug('Activity logging skipped: service not available or missing addActivity function');
        }
      } catch (error) {
        logger.warn('Failed to log certificate update activity:', error);
      }
      
      // Return the updated certificate
      res.json(updatedCert.toApiResponse(certificateManager.passphraseManager));
    } catch (error) {
      logger.error(`Error updating certificate metadata for ${req.params.fingerprint}:`, error);
      res.status(500).json({
        message: `Failed to update certificate: ${error.message}`,
        statusCode: 500
      });
    }
  });
  
  // Delete certificate
  router.delete('/:fingerprint', async (req, res) => {
    try {
      const { fingerprint } = req.params;
      
      const result = await certificateManager.deleteCertificate(fingerprint);
      
      if (!result.success) {
        return res.status(404).json({ message: result.error || 'Certificate not found', statusCode: 404 });
      }
      
      res.json({ success: true });
    } catch (error) {
      logger.error(`Error deleting certificate ${req.params.fingerprint}`, error);
      res.status(500).json({ message: 'Failed to delete certificate', statusCode: 500 });
    }
  });
  
  // Get all backups for a certificate
  router.get('/:fingerprint/backups', async (req, res) => {
    try {
      const { fingerprint } = req.params;
      
      // Get certificate
      const certificate = deps.certificateManager.getCertificate(fingerprint);
      if (!certificate) {
        return res.status(404).json({
          message: `Certificate with fingerprint ${fingerprint} not found`,
          statusCode: 404
        });
      }
      
      // Get backups
      const backups = await deps.certificateManager.getCertificateBackups(fingerprint);
      
      // Format response
      const formattedBackups = backups.map(backup => ({
        id: backup.id,
        date: backup.date,
        size: backup.size,
        filename: backup.filename
      }));
      
      res.json(formattedBackups);
    } catch (error) {
      logger.error(`Error getting backups for certificate ${req.params.fingerprint}:`, error);
      res.status(500).json({
        message: `Failed to get backups: ${error.message}`,
        statusCode: 500
      });
    }
  });

  // Create a backup of a certificate
  router.post('/:fingerprint/backups', async (req, res) => {
    try {
      const { fingerprint } = req.params;
      
      // Get certificate
      const certificate = deps.certificateManager.getCertificate(fingerprint);
      if (!certificate) {
        return res.status(404).json({
          message: `Certificate with fingerprint ${fingerprint} not found`,
          statusCode: 404
        });
      }
      
      // Create backup
      const backup = await deps.certificateManager.createCertificateBackup(fingerprint);
      
      res.status(201).json({
        message: 'Backup created successfully',
        backup: {
          id: backup.id,
          date: backup.date,
          size: backup.size,
          filename: backup.filename
        }
      });
    } catch (error) {
      logger.error(`Error creating backup for certificate ${req.params.fingerprint}:`, error);
      res.status(500).json({
        message: `Failed to create backup: ${error.message}`,
        statusCode: 500
      });
    }
  });

  // Delete a backup
  router.delete('/:fingerprint/backups/:backupId', async (req, res) => {
    try {
      const { fingerprint, backupId } = req.params;
      
      // Get certificate
      const certificate = deps.certificateManager.getCertificate(fingerprint);
      if (!certificate) {
        return res.status(404).json({
          message: `Certificate with fingerprint ${fingerprint} not found`,
          statusCode: 404
        });
      }
      
      // Delete backup
      await deps.certificateManager.deleteCertificateBackup(fingerprint, backupId);
      
      res.json({
        message: 'Backup deleted successfully'
      });
    } catch (error) {
      logger.error(`Error deleting backup ${req.params.backupId} for certificate ${req.params.fingerprint}:`, error);
      res.status(500).json({
        message: `Failed to delete backup: ${error.message}`,
        statusCode: 500
      });
    }
  });

  // Download a backup
  router.get('/:fingerprint/backups/:backupId/download', async (req, res) => {
    try {
      const { fingerprint, backupId } = req.params;
      
      // Get certificate
      const certificate = deps.certificateManager.getCertificate(fingerprint);
      if (!certificate) {
        return res.status(404).json({
          message: `Certificate with fingerprint ${fingerprint} not found`,
          statusCode: 404
        });
      }
      
      // Get backup
      const backup = await deps.certificateManager.getCertificateBackup(fingerprint, backupId);
      if (!backup || !backup.filePath) {
        return res.status(404).json({
          message: `Backup ${backupId} not found`,
          statusCode: 404
        });
      }
      
      // Check if file exists
      if (!fs.existsSync(backup.filePath)) {
        return res.status(404).json({
          message: `Backup file not found on disk`,
          statusCode: 404
        });
      }
      
      // Set headers
      res.setHeader('Content-Disposition', `attachment; filename="${backup.filename || 'certificate-backup.zip'}"`);
      res.setHeader('Content-Type', 'application/zip');
      
      // Stream the file
      fs.createReadStream(backup.filePath).pipe(res);
    } catch (error) {
      logger.error(`Error downloading backup ${req.params.backupId} for certificate ${req.params.fingerprint}:`, error);
      res.status(500).json({
        message: `Failed to download backup: ${error.message}`,
        statusCode: 500
      });
    }
  });

  // Restore a backup
  router.post('/:fingerprint/backups/:backupId/restore', async (req, res) => {
    try {
      const { fingerprint, backupId } = req.params;
      
      // Get certificate
      const certificate = deps.certificateManager.getCertificate(fingerprint);
      if (!certificate) {
        return res.status(404).json({
          message: `Certificate with fingerprint ${fingerprint} not found`,
          statusCode: 404
        });
      }
      
      // Restore backup
      await deps.certificateManager.restoreCertificateBackup(fingerprint, backupId);
      
      res.json({
        message: 'Backup restored successfully'
      });
    } catch (error) {
      logger.error(`Error restoring backup ${req.params.backupId} for certificate ${req.params.fingerprint}:`, error);
      res.status(500).json({
        message: `Failed to restore backup: ${error.message}`,
        statusCode: 500
      });
    }
  });

  // Convert certificate to different format
  router.post('/:fingerprint/convert', async (req, res) => {
    try {
      const { fingerprint } = req.params;
      const { format, password } = req.body;
      
      if (!format) {
        return res.status(400).json({
          success: false,
          message: 'Target format is required',
          statusCode: 400
        });
      }
      
      // Get certificate
      const certificate = deps.certificateManager.getCertificate(fingerprint);
      if (!certificate) {
        return res.status(404).json({
          success: false,
          message: `Certificate with fingerprint ${fingerprint} not found`,
          statusCode: 404
        });
      }
      
      // Validate format
      const supportedFormats = ['pem', 'der', 'p12', 'pfx', 'p7b', 'crt', 'cer'];
      if (!supportedFormats.includes(format)) {
        return res.status(400).json({
          success: false,
          message: `Unsupported format: ${format}. Supported formats are: ${supportedFormats.join(', ')}`,
          statusCode: 400
        });
      }
      
      // Check if password is provided for formats that require it
      if (['p12', 'pfx'].includes(format) && !password) {
        return res.status(400).json({
          success: false,
          message: `Password is required for ${format.toUpperCase()} format`,
          statusCode: 400
        });
      }
      
      // Create a certificate object structure compatible with the OpenSSLWrapper
      // FIXED: Use consistent path keys from certificate paths property
      const paths = certificate.paths || {};
      const certObj = {
        paths: {
          crtPath: paths.crtPath,
          cerPath: paths.cerPath,
          keyPath: paths.keyPath, 
          csrPath: paths.csrPath,
          pemPath: paths.pemPath,
          p12Path: paths.p12Path,
          pfxPath: paths.pfxPath,
          derPath: paths.derPath,
          p7bPath: paths.p7bPath,
          chainPath: paths.chainPath,
          fullchainPath: paths.fullchainPath,
          extPath: paths.extPath
        }
      };
      
      // Use OpenSSLWrapper to convert certificate with enhanced method
      let result;
      try {
        result = await deps.openSSL.convertCertificate(certObj, format, { password });
      } catch (error) {
        logger.error(`Error converting certificate to ${format}:`, error);
        return res.status(500).json({
          success: false,
          message: `Failed to convert certificate: ${error.message}`,
          statusCode: 500
        });
      }
      
      // Update certificate with new file paths
      if (result.outputPath || result.p12Path || result.pemPath) {
        const updateData = {};
        
        // Get the output path from any of the possible properties
        const outputPath = result.outputPath || result.p12Path || result.pemPath;
        
        // Create property name based on format
        const pathKey = `${format}Path`;
        updateData[pathKey] = outputPath;
        
        await deps.certificateManager.updateCertificateConfig(fingerprint, updateData);
      }
      
      res.json({
        success: true,
        message: `Certificate converted to ${format.toUpperCase()} format successfully`,
        filePath: result.outputPath || result.p12Path || result.pemPath
      });
    } catch (error) {
      logger.error(`Error converting certificate ${req.params.fingerprint}:`, error);
      res.status(500).json({
        success: false,
        message: `Failed to convert certificate: ${error.message}`,
        statusCode: 500
      });
    }
  });

  // Import the deployment actions router
  const deploymentRouter = initDeploymentActionsRouter({
    certificateManager: deps.certificateManager,
    deployService: require('../../services/deploy-service')
  });

  // Mount deployment actions routes
  router.use('/:fingerprint/deploy-actions', deploymentRouter);

  // Add direct deploy endpoint
  router.post('/:fingerprint/deploy', async (req, res) => {
    try {
      const { fingerprint } = req.params;
      
      // Get certificate
      const cert = deps.certificateManager.getCertificate(fingerprint);
      if (!cert) {
        return res.status(404).json({ 
          message: `Certificate with fingerprint ${fingerprint} not found`,
          statusCode: 404 
        });
      }
      
      // Execute deployment actions
      const deployService = require('../../services/deploy-service');
      const result = await cert.executeDeployActions(deployService);
      
      res.json(result);
    } catch (error) {
      logger.error(`Error deploying certificate ${req.params.fingerprint}:`, error);
      res.status(500).json({ 
        success: false,
        message: `Failed to deploy certificate: ${error.message}`,
        statusCode: 500 
      });
    }
  });

  // Download specific certificate file
  router.get('/:fingerprint/download/:fileType', async (req, res) => {
    try {
      const { fingerprint, fileType } = req.params;
      
      // Get certificate
      const certificate = deps.certificateManager.getCertificate(fingerprint);
      if (!certificate) {
        return res.status(404).json({ 
          message: `Certificate with fingerprint ${fingerprint} not found`,
          statusCode: 404 
        });
      }
      
      // Map fileType to path property based on Certificate class properties
      const fileTypeMap = {
        crt: 'crtPath',
        key: 'keyPath',
        chain: 'chainPath',
        fullchain: 'fullchainPath',
        p12: 'p12Path',
        pfx: 'pfxPath',
        pem: 'pemPath',
        p7b: 'p7bPath',
        csr: 'csrPath',
        cer: 'cerPath',
        der: 'derPath',
        ext: 'extPath'
      };
      
      const pathKey = fileTypeMap[fileType];
      if (!pathKey) {
        return res.status(400).json({
          message: `Invalid file type: ${fileType}`,
          statusCode: 400
        });
      }
      
      // Get the file path from the certificate
      const filePath = certificate.getPath(pathKey.replace('Path', ''));
      
      if (!filePath) {
        return res.status(404).json({
          message: `No ${fileType} file found for certificate ${fingerprint}`,
          statusCode: 404
        });
      }
      
      // Check if file exists
      if (!fs.existsSync(filePath)) {
        return res.status(404).json({
          message: `File ${filePath} does not exist`,
          statusCode: 404
        });
      }
      
      // Generate download filename based on certificate name
      const safeName = certificate.name.replace(/[^\w.-]/g, '_');
      let downloadFilename = `${safeName}.${fileType}`;
      
      // Special case handling for certain file types
      switch (fileType) {
        case 'crt':
          downloadFilename = `${safeName}.crt`;
          break;
        case 'chain':
          downloadFilename = `${safeName}.chain.pem`;
          break;
        case 'fullchain':
          downloadFilename = `${safeName}.fullchain.pem`;
          break;
      }
      
      // Set appropriate content type based on file extension
      const mimeTypes = {
        'crt': 'application/x-x509-ca-cert',
        'cer': 'application/x-x509-ca-cert',
        'key': 'application/pkcs8',
        'pem': 'application/x-pem-file',
        'p12': 'application/x-pkcs12',
        'pfx': 'application/x-pkcs12',
        'p7b': 'application/x-pkcs7-certificates',
        'der': 'application/x-x509-ca-cert',
        'csr': 'application/pkcs10',
        'ext': 'text/plain',
        'chain': 'application/x-pem-file',
        'fullchain': 'application/x-pem-file'
      };
      
      const contentType = mimeTypes[fileType] || 'application/octet-stream';
      
      // Set headers for file download
      res.setHeader('Content-Disposition', `attachment; filename="${downloadFilename}"`);
      res.setHeader('Content-Type', contentType);
      
      // Stream the file
      const fileStream = fs.createReadStream(filePath);
      fileStream.pipe(res);
      
      // Log the download
      logger.info(`Certificate file downloaded: ${downloadFilename} (${fileType}) for ${certificate.name}`);
      
    } catch (error) {
      logger.error(`Error downloading certificate file: ${error.message}`, error);
      res.status(500).json({
        message: `Failed to download certificate file: ${error.message}`,
        statusCode: 500
      });
    }
  });

  // Download all certificate files as a ZIP archive
  router.get('/:fingerprint/download', async (req, res) => {
    try {
      const { fingerprint } = req.params;
      const archiver = require('archiver');
      
      // Get certificate
      const certificate = deps.certificateManager.getCertificate(fingerprint);
      if (!certificate) {
        return res.status(404).json({ 
          message: `Certificate with fingerprint ${fingerprint} not found`,
          statusCode: 404 
        });
      }
      
      // Use certificate.paths consistently and with proper path keys
      const paths = certificate.paths || {};
      
      // Create file paths map (only existing files)
      const filesToAdd = [
        { key: 'crtPath', name: 'certificate.crt' },
        { key: 'keyPath', name: 'private.key' },
        { key: 'pemPath', name: 'certificate.pem' },
        { key: 'p12Path', name: 'certificate.p12' },
        { key: 'pfxPath', name: 'certificate.pfx' },
        { key: 'csrPath', name: 'certificate.csr' },
        { key: 'chainPath', name: 'chain.pem' },
        { key: 'fullchainPath', name: 'fullchain.pem' },
        { key: 'derPath', name: 'certificate.der' },
        { key: 'p7bPath', name: 'certificate.p7b' },
        { key: 'cerPath', name: 'certificate.cer' },
        { key: 'extPath', name: 'certificate.ext' }
      ].filter(item => paths[item.key] && fs.existsSync(paths[item.key]));
      
      if (filesToAdd.length === 0) {
        return res.status(404).json({
          message: "No certificate files found to download",
          statusCode: 404
        });
      }
      
      // Generate safe certificate name for the ZIP filename
      const safeName = certificate.name.replace(/[^\w.-]/g, '_');
      const downloadFilename = `${safeName}-certificate-files.zip`;
      
      // Set headers for ZIP download
      res.setHeader('Content-Disposition', `attachment; filename="${downloadFilename}"`);
      res.setHeader('Content-Type', 'application/zip');
      
      // Create a ZIP archive
      const archive = archiver('zip', {
        zlib: { level: 9 } // Maximum compression
      });
      
      // Pipe the archive to the response
      archive.pipe(res);
      
      // Add each file to the archive
      filesToAdd.forEach(file => {
        archive.file(paths[file.key], { name: file.name });
      });
      
      // Add metadata JSON
      const metadata = {
        name: certificate.name,
        fingerprint: certificate.fingerprint,
        domains: certificate.domains,
        issuer: certificate.issuer,
        validFrom: certificate.validFrom,
        validTo: certificate.validTo,
        createdAt: certificate.createdAt,
        exportedAt: new Date()
      };
      
      archive.append(JSON.stringify(metadata, null, 2), { name: 'metadata.json' });
      
      // Log download
      logger.info(`ZIP download requested for certificate ${certificate.name}`);
      
      // Finalize the archive
      archive.finalize();
    } catch (error) {
      logger.error(`Error creating ZIP archive for ${req.params.fingerprint}:`, error);
      res.status(500).json({
        message: `Failed to create ZIP archive: ${error.message}`,
        statusCode: 500
      });
    }
  });

  // Get all available files for a certificate
  router.get('/:fingerprint/files', async (req, res) => {
    try {
        const { fingerprint } = req.params;
        
        // Get certificate
        const certificate = deps.certificateManager.getCertificate(fingerprint);
        if (!certificate) {
            return res.status(404).json({
                message: `Certificate with fingerprint ${fingerprint} not found`,
                statusCode: 404
            });
        }
        
        // Get paths from certificate and verify they exist
        certificate.verifyPaths();
        const paths = certificate.paths || {};
        
        // Check which files actually exist
        const availableFiles = [];
        
        // Check each path and add to available files if it exists
        Object.entries(paths).forEach(([key, filePath]) => {
            try {
                // Skip path suffix
                const fileType = key.replace(/Path$/, '');
                
                if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
                    availableFiles.push({
                        type: fileType,
                        path: filePath,
                        size: fs.statSync(filePath).size
                    });
                }
            } catch (error) {
                logger.debug(`Error checking file ${key}: ${error.message}`);
            }
        });
        
        res.json(availableFiles);
    } catch (error) {
        logger.error(`Error getting files for certificate ${req.params.fingerprint}:`, error);
        res.status(500).json({
            message: `Failed to get certificate files: ${error.message}`,
            statusCode: 500
        });
    }
  });

  // Renew certificate
  router.post('/:fingerprint/renew', async (req, res) => {
    try {
      const { fingerprint } = req.params;
      const { passphrase } = req.body || {};
      
      // Get the certificate
      const cert = certificateManager.getCertificate(fingerprint);
      if (!cert) {
        return res.status(404).json({ message: 'Certificate not found', statusCode: 404 });
      }
      
      // Find signing CA if needed
      let signingCA = null;
      if (cert.signWithCA && cert.caFingerprint) {
        signingCA = certificateManager.getCertificate(cert.caFingerprint);
      }
      
      // Get stored passphrase if not provided
      let certPassphrase = passphrase;
      if (!certPassphrase && cert.hasStoredPassphrase(certificateManager.passphraseManager)) {
        certPassphrase = cert.getPassphrase(certificateManager.passphraseManager);
      }
      
      // Renew the certificate
      const result = await cert.createOrRenew(openSSL, {
        certsDir: certificateManager.certsDir,
        signingCA,
        passphrase: certPassphrase
      });
      
      // Update certificate manager and save config
      certificateManager.certificates.set(cert.fingerprint, cert);
      await certificateManager.saveCertificateConfigs();
      
      res.json(cert.toApiResponse(certificateManager.passphraseManager));
    } catch (error) {
      logger.error(`Error renewing certificate ${req.params.fingerprint}:`, error);
      res.status(500).json({ message: `Failed to renew certificate: ${error.message}`, statusCode: 500 });
    }
  });
  
  // Verify key match
  router.get('/:fingerprint/verify-key-match', async (req, res) => {
    try {
      const { fingerprint } = req.params;
      
      // Get the certificate
      const cert = certificateManager.getCertificate(fingerprint);
      if (!cert) {
        return res.status(404).json({ message: 'Certificate not found', statusCode: 404 });
      }
      
      const matches = await cert.verifyKeyMatch(openSSL);
      
      res.json({ matches });
    } catch (error) {
      logger.error(`Error verifying key match for ${req.params.fingerprint}:`, error);
      res.status(500).json({ message: 'Failed to verify key match', statusCode: 500 });
    }
  });
  
  // Check if certificate has passphrase
  router.get('/:fingerprint/passphrase', (req, res) => {
    try {
      const { fingerprint } = req.params;
      
      const hasPassphrase = certificateManager.hasPassphrase(fingerprint);
      
      res.json({ hasPassphrase });
    } catch (error) {
      logger.error(`Error checking passphrase for ${req.params.fingerprint}:`, error);
      res.status(500).json({ message: 'Failed to check passphrase', statusCode: 500 });
    }
  });
  
  // Store certificate passphrase
  router.post('/:fingerprint/passphrase', (req, res) => {
    try {
      const { fingerprint } = req.params;
      const { passphrase } = req.body;
      
      if (!passphrase) {
        return res.status(400).json({ message: 'Passphrase is required', statusCode: 400 });
      }
      
      const success = certificateManager.storePassphrase(fingerprint, passphrase);
      
      if (!success) {
        return res.status(500).json({ message: 'Failed to store passphrase', statusCode: 500 });
      }
      
      res.status(201).json({ success: true });
    } catch (error) {
      logger.error(`Error storing passphrase for ${req.params.fingerprint}:`, error);
      res.status(500).json({ message: 'Failed to store passphrase', statusCode: 500 });
    }
  });
  
  // Delete certificate passphrase
  router.delete('/:fingerprint/passphrase', (req, res) => {
    try {
      const { fingerprint } = req.params;
      
      const success = certificateManager.deletePassphrase(fingerprint);
      
      if (!success) {
        return res.status(404).json({ message: 'No passphrase found for this certificate', statusCode: 404 });
      }
      
      res.json({ success: true });
    } catch (error) {
      logger.error(`Error deleting passphrase for ${req.params.fingerprint}:`, error);
      res.status(500).json({ message: 'Failed to delete passphrase', statusCode: 500 });
    }
  });

  // Get all certificate groups
  router.get('/groups', (req, res) => {
    try {
      const groups = new Set();
      
      // Extract all groups from certificates
      const certificates = deps.certificateManager.getAllCertificates();
      certificates.forEach(cert => {
        if (cert.group && cert.group.trim() !== '') {
          groups.add(cert.group.trim());
        }
      });
      
      // Sort groups alphabetically
      const sortedGroups = Array.from(groups).sort();
      
      res.json({
        groups: sortedGroups
      });
    } catch (error) {
      logger.error('Error getting certificate groups:', error);
      res.status(500).json({
        message: `Failed to get certificate groups: ${error.message}`,
        statusCode: 500
      });
    }
  });

  // Get certificate SAN entries
  router.get('/:fingerprint/san', async (req, res) => {
    try {
        const { fingerprint } = req.params;
        
        // Get the certificate
        const cert = deps.certificateManager.getCertificate(fingerprint);
        if (!cert) {
            return res.status(404).json({
                message: `Certificate with fingerprint ${fingerprint} not found`,
                statusCode: 404
            });
        }
        
        // Return all SAN entries
        res.json({
            domains: cert.domains,
            idleDomains: cert.idleDomains,
            ips: cert.ips,
            idleIps: cert.idleIps,
            needsRenewal: cert.idleDomains.length > 0 || cert.idleIps.length > 0
        });
    } catch (error) {
        logger.error(`Error getting SAN entries for certificate ${req.params.fingerprint}:`, error);
        res.status(500).json({
            message: `Failed to get SAN entries: ${error.message}`,
            statusCode: 500
        });
    }
});

// Add a new domain or IP to certificate
router.post('/:fingerprint/san', async (req, res) => {
    try {
        const { fingerprint } = req.params;
        const { value, type = 'auto', idle = true } = req.body;
        
        if (!value) {
            return res.status(400).json({
                message: 'Domain or IP address value is required',
                statusCode: 400
            });
        }
        
        // Get the certificate
        const cert = deps.certificateManager.getCertificate(fingerprint);
        if (!cert) {
            return res.status(404).json({
                message: `Certificate with fingerprint ${fingerprint} not found`,
                statusCode: 404
            });
        }
        
        // Auto-detect type if not specified or set to 'auto'
        let subjectType = type;
        if (type === 'auto' || !type) {
            const validation = DomainValidator.validate(value);
            if (!validation.isValid) {
                return res.status(400).json({
                    message: 'Invalid domain name or IP address format',
                    statusCode: 400
                });
            }
            subjectType = validation.type;
        } else {
            // Validate based on specified type
            if (type === 'ip' && !DomainValidator.isValidIPv4(value) && !DomainValidator.isValidIPv6(value)) {
                return res.status(400).json({
                    message: 'Invalid IP address format',
                    statusCode: 400
                });
            } else if (type === 'domain' && !DomainValidator.isValidDomain(value) && 
                      !DomainValidator.isValidWildcardDomain(value) && 
                      value.toLowerCase() !== 'localhost') {
                return res.status(400).json({
                    message: 'Invalid domain format',
                    statusCode: 400
                });
            }
        }
        
        let added = false;
        
        // Add domain or IP based on type
        if (subjectType === 'ip') {
            added = await deps.certificateManager.addIp(fingerprint, value, idle);
        } else {
            added = await deps.certificateManager.addDomain(fingerprint, value, idle);
        }
        
        if (!added) {
            return res.status(400).json({
                message: `Failed to add ${subjectType}: ${value}. It may already exist.`,
                statusCode: 400
            });
        }
        
        // Log activity
        try {
            const activityServicePath = '../../services/activity-service';
            let activityService;
            
            try {
                activityService = require(activityServicePath);
            } catch (moduleError) {
                logger.debug(`Activity service module not found: ${moduleError.message}`);
                activityService = null;
            }
            
            if (activityService && typeof activityService.addActivity === 'function') {
                await activityService.addActivity({
                    action: `Added ${idle ? 'idle ' : ''}${subjectType} "${value}" to certificate`,
                    type: 'update',
                    target: cert.name,
                    metadata: {
                        fingerprint,
                        value,
                        type: subjectType,
                        idle
                    }
                });
            }
        } catch (activityError) {
            logger.warn('Failed to log SAN update activity:', activityError);
        }
        
        // Return updated SAN entries
        res.status(201).json({
            message: `${subjectType === 'ip' ? 'IP address' : 'Domain'} added successfully${idle ? ' (idle until renewal)' : ''}`,
            domains: cert.domains,
            idleDomains: cert.idleDomains,
            ips: cert.ips,
            idleIps: cert.idleIps,
            needsRenewal: cert.idleDomains.length > 0 || cert.idleIps.length > 0
        });
    } catch (error) {
        logger.error(`Error adding SAN entry to certificate ${req.params.fingerprint}:`, error);
        res.status(500).json({
            message: `Failed to add SAN entry: ${error.message}`,
            statusCode: 500
        });
    }
});

// Remove a domain or IP from certificate
router.delete('/:fingerprint/san/:type/:value', async (req, res) => {
    try {
        const { fingerprint, type, value } = req.params;
        const fromIdle = req.query.idle === 'true';
        
        // Get the certificate
        const cert = deps.certificateManager.getCertificate(fingerprint);
        if (!cert) {
            return res.status(404).json({
                message: `Certificate with fingerprint ${fingerprint} not found`,
                statusCode: 404
            });
        }
        
        let removed = false;
        
        // Remove domain or IP based on type
        if (type === 'ip') {
            removed = await deps.certificateManager.removeIp(fingerprint, value, fromIdle);
        } else if (type === 'domain') {
            removed = await deps.certificateManager.removeDomain(fingerprint, value, fromIdle);
        } else {
            return res.status(400).json({
                message: `Invalid SAN type: ${type}. Must be 'domain' or 'ip'.`,
                statusCode: 400
            });
        }
        
        if (!removed) {
            return res.status(404).json({
                message: `${type} "${value}" not found in certificate${fromIdle ? ' idle list' : ''}`,
                statusCode: 404
            });
        }
        
        // Log activity
        try {
            const activityServicePath = '../../services/activity-service';
            let activityService;
            
            try {
                activityService = require(activityServicePath);
            } catch (moduleError) {
                logger.debug(`Activity service module not found: ${moduleError.message}`);
                activityService = null;
            }
            
            if (activityService && typeof activityService.addActivity === 'function') {
                await activityService.addActivity({
                    action: `Removed ${fromIdle ? 'idle ' : ''}${type} "${value}" from certificate`,
                    type: 'update',
                    target: cert.name,
                    metadata: {
                        fingerprint,
                        value,
                        type,
                        fromIdle
                    }
                });
            }
        } catch (activityError) {
            logger.warn('Failed to log SAN removal activity:', activityError);
        }
        
        // Return updated SAN entries
        res.json({
            message: `${type === 'ip' ? 'IP address' : 'Domain'} removed successfully`,
            domains: cert.domains,
            idleDomains: cert.idleDomains,
            ips: cert.ips,
            idleIps: cert.idleIps,
            needsRenewal: cert.idleDomains.length > 0 || cert.idleIps.length > 0
        });
    } catch (error) {
        logger.error(`Error removing SAN entry from certificate ${req.params.fingerprint}:`, error);
        res.status(500).json({
            message: `Failed to remove SAN entry: ${error.message}`,
            statusCode: 500
        });
    }
});

// Apply idle domains/IPs and renew certificate
router.post('/:fingerprint/san/apply', async (req, res) => {
    try {
        const { fingerprint } = req.params;
        
        // Get the certificate
        const cert = deps.certificateManager.getCertificate(fingerprint);
        if (!cert) {
            return res.status(404).json({
                message: `Certificate with fingerprint ${fingerprint} not found`,
                statusCode: 404
            });
        }
        
        // Check if there are any idle domains or IPs
        if (cert.idleDomains.length === 0 && cert.idleIps.length === 0) {
            return res.status(400).json({
                message: 'No idle domains or IPs to apply',
                statusCode: 400
            });
        }
        
        // Apply idle subjects and renew
        const result = await deps.certificateManager.applyIdleSubjectsAndRenew(fingerprint);
        
        // Log activity
        try {
            const activityServicePath = '../../services/activity-service';
            let activityService;
            
            try {
                activityService = require(activityServicePath);
            } catch (moduleError) {
                logger.debug(`Activity service module not found: ${moduleError.message}`);
                activityService = null;
            }
            
            if (activityService && typeof activityService.addActivity === 'function') {
                await activityService.addActivity({
                    action: `Applied idle domains/IPs and renewed certificate`,
                    type: 'renew',
                    target: cert.name,
                    metadata: {
                        fingerprint
                    }
                });
            }
        } catch (activityError) {
            logger.warn('Failed to log SAN apply activity:', activityError);
        }
        
        res.json({
            message: 'Idle domains and IPs applied and certificate renewed successfully',
            success: true,
            result
        });
    } catch (error) {
        logger.error(`Error applying idle subjects for certificate ${req.params.fingerprint}:`, error);
        res.status(500).json({
            message: `Failed to apply idle subjects: ${error.message}`,
            statusCode: 500
        });
    }
});

  return router;
}

module.exports = initCertificatesRouter;