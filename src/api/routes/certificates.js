/**
 * @fileoverview Certificates API Router - Manages certificate CRUD operations and conversions
 * @module api/routes/certificates
 * @requires express
 * @requires fs
 * @requires path
 * @requires ../../services/logger
 * @requires ./deployment-actions
 * @requires ../../utils/DomainValidator
 * @version 0.0.3
 * @author Christian Meiners
 * @license MIT
 */

const express = require('express');
const logger = require('../../services/logger');
const initDeploymentActionsRouter = require('./deployment-actions');
const fs = require('fs');
const path = require('path');
const DomainValidator = require('../../utils/DomainValidator');

const FILENAME = 'api/routes/certificates.js';

/**
 * Initialize the certificates router with required dependencies.
 * Provides endpoints for certificate CRUD operations, format conversions, and passphrase management.
 * @param {Object} deps - Dependencies object containing required services
 * @param {Object} deps.certificateManager - Certificate manager instance for certificate operations
 * @param {Object} deps.cryptoService - Crypto service wrapper instance for cryptographic operations
 * @param {Object} deps.activityService - Activity service for logging certificate operations
 * @returns {express.Router} Configured Express router with certificate management endpoints
 */
function initCertificatesRouter(deps) {
  const router = express.Router();
  const { certificateManager, cryptoService, activityService } = deps;

  // Get all certificates
  router.get('/', async (req, res) => {
    try {
      // Check if certificateManager is initialized
      if (!certificateManager.isInitialized) {
        return res.json({
          certificates: [],
          message: "Certificate manager is still initializing, please wait...",
          initializing: true
        });
      }

      // Check if this is a refresh request from the frontend
      const force = req.query.force === 'true';
      logger.debug(`Force refresh: ${force}`, null, FILENAME);

      // Use optimized frontend refresh handler
      const certificates = deps.certificateManager.handleFrontendRefresh({ force });
      res.json(certificates);
    } catch (error) {
      logger.error('Error getting certificates:', error, FILENAME);
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
        sans: {
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
      const result = await certificateManager.createOrRenewCertificate(null, {
        certificate: cert,
        signingCA,
        passphrase,
        days: req.body.days || 365
      });

      // Store passphrase if requested
      if (passphrase && storePassphrase && cert.fingerprint) {
        certificateManager.storePassphrase(cert.fingerprint, passphrase);
      }

      // Add to certificate manager and save config
      certificateManager.certificates.set(cert.fingerprint, cert);
      await certificateManager.saveCertificateConfigs();

      const response = await deps.certificateManager.getCertificateApiResponse(cert.fingerprint);
      res.json(response);
    } catch (error) {
      logger.error('Error creating certificate', error, FILENAME);
      res.status(500).json({ message: `Failed to create certificate: ${error.message}`, statusCode: 500 });
    }
  });

  // Get certificate by fingerprint
  router.get('/:fingerprint', async (req, res) => {
    try {
      // Check if certificateManager is initialized
      if (!certificateManager.isInitialized) {
        return res.json({
          certificates: [],
          message: "Certificate manager is still initializing, please wait...",
          initializing: true
        });
      }

      // Use getCertificate which handles cache efficiently
      const cert = deps.certificateManager.getCertificate(req.params.fingerprint);
      if (!cert) {
        return res.status(404).json({ message: 'Certificate not found', statusCode: 404 });
      }

      const response = await deps.certificateManager.getCertificateApiResponse(req.params.fingerprint);
      res.json(response);
    } catch (error) {
      logger.error(`Error getting certificate ${req.params.fingerprint}`, error, FILENAME);
      res.status(500).json({ message: 'Failed to retrieve certificate', statusCode: 500 });
    }
  });

  // Update certificate
  router.put('/:fingerprint', async (req, res) => {
    try {
      // Check if certificateManager is initialized
      if (!certificateManager.isInitialized) {
        return res.json({
          certificates: [],
          message: "Certificate manager is still initializing, please wait...",
          initializing: true
        });
      }

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
      const response = await deps.certificateManager.getCertificateApiResponse(fingerprint);
      res.json(response);
    } catch (error) {
      logger.error(`Error updating certificate ${req.params.fingerprint}`, error, FILENAME);
      res.status(500).json({ message: 'Failed to update certificate', statusCode: 500 });
    }
  });

  // Update certificate metadata (PATCH)
  router.patch('/:fingerprint', async (req, res) => {
    try {
      // Check if certificateManager is initialized
      if (!certificateManager.isInitialized) {
        return res.json({
          certificates: [],
          message: "Certificate manager is still initializing, please wait...",
          initializing: true
        });
      }

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

      // Add entry to activity log using the passed instance
      try {
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
          logger.debug(`Logged activity for certificate update: ${updatedCert.name}`, null, FILENAME);
        } else {
          logger.debug('Activity logging skipped: service not available or missing addActivity function', null, FILENAME);
        }
      } catch (error) {
        logger.warn('Failed to log certificate update activity:', error, FILENAME);
      }

      // Return the updated certificate    
      const response = await deps.certificateManager.getCertificateApiResponse(updatedCert.fingerprint);
      res.json(response);
    } catch (error) {
      logger.error(`Error updating certificate metadata for ${req.params.fingerprint}:`, error, FILENAME);
      res.status(500).json({
        message: `Failed to update certificate: ${error.message}`,
        statusCode: 500
      });
    }
  });

  // Delete certificate
  router.delete('/:fingerprint', async (req, res) => {
    try {
      // Check if certificateManager is initialized
      if (!certificateManager.isInitialized) {
        return res.json({
          certificates: [],
          message: "Certificate manager is still initializing, please wait...",
          initializing: true
        });
      }

      const { fingerprint } = req.params;

      const result = await certificateManager.deleteCertificate(fingerprint);

      if (!result.success) {
        return res.status(404).json({ message: result.error || 'Certificate not found', statusCode: 404 });
      }

      res.json({ success: true });
    } catch (error) {
      logger.error(`Error deleting certificate ${req.params.fingerprint}`, error, FILENAME);
      res.status(500).json({ message: 'Failed to delete certificate', statusCode: 500 });
    }
  });

  // Get all backups for a certificate
  router.get('/:fingerprint/backups', async (req, res) => {
    try {
      // Check if certificateManager is initialized
      if (!certificateManager.isInitialized) {
        return res.json({
          certificates: [],
          message: "Certificate manager is still initializing, please wait...",
          initializing: true
        });
      }

      const { fingerprint } = req.params;

      // Get certificate
      const certificate = deps.certificateManager.getCertificate(fingerprint);
      if (!certificate) {
        return res.status(404).json({
          message: `Certificate with fingerprint ${fingerprint} not found`,
          statusCode: 404
        });
      }

      // Get backups using the new method
      const result = await deps.certificateManager.getCertificateSnapshots(fingerprint, 'backup');

      if (!result.success) {
        // Use the error message from the result if available
        const errorMessage = result.error || 'Failed to retrieve backup snapshots';
        logger.error(`Error getting backups for certificate ${fingerprint}: ${errorMessage}`, null, FILENAME);
        return res.status(500).json({
          message: errorMessage,
          statusCode: 500
        });
      }

      // Format response - result.snapshots is an array of SnapshotEntry objects
      // Ensure the properties match what BackupSnapshot schema expects (id, date, size, filename, description, etc.)
      const formattedBackups = result.snapshots.map(backup => ({
        id: backup.id,
        date: backup.createdAt, // Assuming SnapshotEntry has createdAt
        size: backup.size,      // Assuming SnapshotEntry has size
        filename: backup.filename, // Assuming SnapshotEntry has filename
        description: backup.description, // Assuming SnapshotEntry has description
        sourceFingerprint: backup.sourceFingerprint, // Important for linking to versions
        type: backup.type,
        versionNumber: backup.versionNumber // If applicable to backups
      }));

      res.json(formattedBackups);
    } catch (error) {
      logger.error(`Error getting backups for certificate ${req.params.fingerprint}:`, error, FILENAME);
      res.status(500).json({
        message: `Failed to get backups: ${error.message}`,
        statusCode: 500
      });
    }
  });

  // Create a backup of a certificate
  router.post('/:fingerprint/backups', async (req, res) => {
    try {
      // Check if certificateManager is initialized
      if (!certificateManager.isInitialized) {
        return res.json({
          certificates: [],
          message: "Certificate manager is still initializing, please wait...",
          initializing: true
        });
      }

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
      const backup = await deps.certificateManager.createManualBackup(fingerprint);

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
      logger.error(`Error creating backup for certificate ${req.params.fingerprint}:`, error, FILENAME);
      res.status(500).json({
        message: `Failed to create backup: ${error.message}`,
        statusCode: 500
      });
    }
  });

  // Delete a backup
  router.delete('/:fingerprint/backups/:backupId', async (req, res) => {
    try {
      // Check if certificateManager is initialized
      if (!certificateManager.isInitialized) {
        return res.json({
          certificates: [],
          message: "Certificate manager is still initializing, please wait...",
          initializing: true
        });
      }

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
      logger.error(`Error deleting backup ${req.params.backupId} for certificate ${req.params.fingerprint}:`, error, FILENAME);
      res.status(500).json({
        message: `Failed to delete backup: ${error.message}`,
        statusCode: 500
      });
    }
  });

  // Download a backup
  router.get('/:fingerprint/backups/:backupId/download', async (req, res) => {
    try {
      // Check if certificateManager is initialized
      if (!certificateManager.isInitialized) {
        return res.json({
          certificates: [],
          message: "Certificate manager is still initializing, please wait...",
          initializing: true
        });
      }

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
      logger.error(`Error downloading backup ${req.params.backupId} for certificate ${req.params.fingerprint}:`, error, FILENAME);
      res.status(500).json({
        message: `Failed to download backup: ${error.message}`,
        statusCode: 500
      });
    }
  });

  // Restore a backup
  router.post('/:fingerprint/backups/:backupId/restore', async (req, res) => {
    try {
      // Check if certificateManager is initialized
      if (!certificateManager.isInitialized) {
        return res.json({
          certificates: [],
          message: "Certificate manager is still initializing, please wait...",
          initializing: true
        });
      }

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
      logger.error(`Error restoring backup ${req.params.backupId} for certificate ${req.params.fingerprint}:`, error, FILENAME);
      res.status(500).json({
        message: `Failed to restore backup: ${error.message}`,
        statusCode: 500
      });
    }
  });

  // Get certificate previous versions
  router.get('/:fingerprint/history', async (req, res) => {
    try {
      // Check if certificateManager is initialized
      if (!certificateManager.isInitialized) {
        return res.json({
          certificates: [],
          message: "Certificate manager is still initializing, please wait...",
          initializing: true
        });
      }

      const { fingerprint } = req.params;

      // Get certificate
      const certificate = deps.certificateManager.getCertificate(fingerprint);
      if (!certificate) {
        return res.status(404).json({
          success: false,
          message: `Certificate with fingerprint ${fingerprint} not found`,
          statusCode: 404
        });
      }

      // Get version snapshots using the new method
      const result = await deps.certificateManager.getCertificateSnapshots(fingerprint, 'version');

      if (!result.success) {
        // Use the error message from the result if available
        const errorMessage = result.error || 'Failed to retrieve version history';
        logger.error(`Error getting certificate history for ${fingerprint}: ${errorMessage}`, null, FILENAME);
        return res.status(500).json({
          success: false,
          message: errorMessage,
          statusCode: 500
        });
      }

      // Transform the array of version snapshots into an object keyed by snapshot ID,
      // as expected by the frontend and OpenAPI spec for /history
      const previousVersionsObject = {};
      result.snapshots.forEach(snapshot => {
        // Ensure the snapshot object matches the VersionSnapshot schema
        previousVersionsObject[snapshot.id] = {
          id: snapshot.id,
          date: snapshot.createdAt, // Assuming SnapshotEntry has createdAt
          description: snapshot.description,
          type: snapshot.type,
          source: snapshot.source,
          versionNumber: snapshot.versionNumber, // Important for versions
          sourceFingerprint: snapshot.sourceFingerprint, // Original fingerprint if different
          // Add any other fields expected by VersionSnapshot schema
        };
      });

      res.json({
        success: true,
        fingerprint,
        certificate: certificate.name,
        previousVersions: previousVersionsObject
      });
    } catch (error) {
      logger.error(`Error getting certificate history for ${req.params.fingerprint}:`, error, FILENAME);
      res.status(500).json({
        success: false,
        message: `Failed to get certificate history: ${error.message}`,
        statusCode: 500
      });
    }
  });

  // Download a previous version file
  router.get('/:fingerprint/history/:previousFingerprint/files/:fileType', async (req, res) => {
    try {
      // Check if certificateManager is initialized
      if (!certificateManager.isInitialized) {
        return res.json({
          certificates: [],
          message: "Certificate manager is still initializing, please wait...",
          initializing: true
        });
      }

      const { fingerprint, previousFingerprint, fileType } = req.params;

      // Get certificate
      const certificate = deps.certificateManager.getCertificate(fingerprint);
      if (!certificate) {
        return res.status(404).json({
          success: false,
          message: `Certificate with fingerprint ${fingerprint} not found`,
          statusCode: 404
        });
      }

      // Get the previous versions
      const versions = certificate._previousVersions || {};
      const previousVersion = versions[previousFingerprint];

      if (!previousVersion) {
        return res.status(404).json({
          success: false,
          message: `Previous version with fingerprint ${previousFingerprint} not found`,
          statusCode: 404
        });
      }

      // Find the requested file
      const archivedFiles = previousVersion.archivedFiles || [];
      const requestedFile = archivedFiles.find(file => file.type === fileType);

      if (!requestedFile || !requestedFile.path || !fs.existsSync(requestedFile.path)) {
        return res.status(404).json({
          success: false,
          message: `File ${fileType} not found in archived version ${previousVersion.version}`,
          statusCode: 404
        });
      }

      // Generate a safe filename
      const safeName = certificate.name.replace(/[^\w.-]/g, '_');
      const versionString = previousVersion.version ? `v${previousVersion.version}` : 'old';
      const dateString = previousVersion.validFrom ?
        new Date(previousVersion.validFrom).toISOString().split('T')[0] :
        'unknown-date';

      const downloadFilename = `${safeName}-${versionString}-${dateString}.${fileType}`;

      // Set content type based on file type
      const contentTypes = {
        'crt': 'application/x-x509-ca-cert',
        'key': 'application/pkcs8',
        'pem': 'application/x-pem-file',
        'p12': 'application/x-pkcs12',
        'pfx': 'application/x-pkcs12',
        'p7b': 'application/x-pkcs7-certificates',
        'csr': 'application/pkcs10',
        'chain': 'application/x-pem-file',
        'fullchain': 'application/x-pem-file',
        'default': 'application/octet-stream'
      };

      // Set response headers
      res.setHeader('Content-Disposition', `attachment; filename="${downloadFilename}"`);
      res.setHeader('Content-Type', contentTypes[fileType] || contentTypes.default);

      // Stream the file
      fs.createReadStream(requestedFile.path).pipe(res);
    } catch (error) {
      logger.error(`Error downloading previous version file for certificate ${req.params.fingerprint}:`, error, FILENAME);
      res.status(500).json({
        success: false,
        message: `Failed to download file: ${error.message}`,
        statusCode: 500
      });
    }
  });

  // Download all files from a previous version as zip
  router.get('/:fingerprint/history/:previousFingerprint/download', async (req, res) => {
    try {
      // Check if certificateManager is initialized
      if (!certificateManager.isInitialized) {
        return res.json({
          certificates: [],
          message: "Certificate manager is still initializing, please wait...",
          initializing: true
        });
      }

      const { fingerprint, previousFingerprint } = req.params;
      const archiver = require('archiver');

      // Get certificate
      const certificate = deps.certificateManager.getCertificate(fingerprint);
      if (!certificate) {
        return res.status(404).json({
          success: false,
          message: `Certificate with fingerprint ${fingerprint} not found`,
          statusCode: 404
        });
      }

      // Get the previous versions
      const versions = certificate._previousVersions || {};
      const previousVersion = versions[previousFingerprint];

      if (!previousVersion) {
        return res.status(404).json({
          success: false,
          message: `Previous version with fingerprint ${previousFingerprint} not found`,
          statusCode: 404
        });
      }

      // Check if there are any archived files
      const archivedFiles = previousVersion.archivedFiles || [];
      if (archivedFiles.length === 0) {
        return res.status(404).json({
          success: false,
          message: `No archived files found for previous version ${previousVersion.version}`,
          statusCode: 404
        });
      }

      // Generate a safe filename
      const safeName = certificate.name.replace(/[^\w.-]/g, '_');
      const versionString = previousVersion.version ? `v${previousVersion.version}` : 'old';
      const dateString = previousVersion.validFrom ?
        new Date(previousVersion.validFrom).toISOString().split('T')[0] :
        'unknown-date';

      const downloadFilename = `${safeName}-${versionString}-${dateString}-archived.zip`;

      // Set headers for ZIP download
      res.setHeader('Content-Disposition', `attachment; filename="${downloadFilename}"`);
      res.setHeader('Content-Type', 'application/zip');

      // Create a ZIP archive
      const archive = archiver('zip', {
        zlib: { level: 9 } // Maximum compression
      });

      // Pipe the archive to the response
      archive.pipe(res);

      // Add each file to the archive with normalized names
      for (const file of archivedFiles) {
        if (file.path && fs.existsSync(file.path)) {
          // Create a standardized name for the file in the zip
          const archiveFileName = `${file.type}.${path.extname(file.path).substring(1)}`;
          archive.file(file.path, { name: archiveFileName });
        }
      }

      // Add metadata JSON
      const metadata = {
        name: certificate.name,
        originalFingerprint: previousFingerprint,
        subject: previousVersion.subject,
        issuer: previousVersion.issuer,
        validFrom: previousVersion.validFrom,
        validTo: previousVersion.validTo,
        version: previousVersion.version,
        archivedAt: previousVersion.archivedAt,
        exportedAt: new Date().toISOString()
      };

      archive.append(JSON.stringify(metadata, null, 2), { name: 'metadata.json' });

      // Finalize the archive
      archive.finalize();
    } catch (error) {
      logger.error(`Error creating ZIP archive for previous version of certificate ${req.params.fingerprint}:`, error, FILENAME);
      res.status(500).json({
        success: false,
        message: `Failed to create ZIP archive: ${error.message}`,
        statusCode: 500
      });
    }
  });

  // Convert certificate to different format
  router.post('/:fingerprint/convert', async (req, res) => {
    try {
      // Check if certificateManager is initialized
      if (!certificateManager.isInitialized) {
        return res.json({
          certificates: [],
          message: "Certificate manager is still initializing, please wait...",
          initializing: true
        });
      }

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

      // Use new Certificate structure - without Path suffixes
      const paths = certificate._paths || {};
      
      // Use cryptoServiceWrapper to convert certificate
      let result;
      
      switch(format) {
        case 'p12':
        case 'pfx':
          result = await deps.cryptoService.convertToP12(certificate, {
            passphrase: password,
            outputPath: path.join(path.dirname(paths.crt || ''), `${certificate.name}.${format}`)
          });
          break;
          
        case 'pem':
          result = await deps.cryptoService.convertToPEM(certificate, {
            outputPath: path.join(path.dirname(paths.crt || ''), `${certificate.name}.pem`)
          });
          break;
          
        default:
          result = await deps.cryptoService.convertCertificate(certificate, format, { 
            password,
            outputPath: path.join(path.dirname(paths.crt || ''), `${certificate.name}.${format}`)
          });
      }

      // Update certificate with new file paths
      if (result.outputPath || result.p12Path || result.pemPath) {
        // Get the output path from any of the possible properties
        const outputPath = result.outputPath || result.p12Path || result.pemPath;

        // Update paths in the certificate using the proper method
        certificate.addPath(format, outputPath);

        // Save certificate config to persist the new path
        await deps.certificateManager.saveCertificateConfigs();
        
        logger.info(`Added ${format} path to certificate ${certificate.name}: ${outputPath}`, null, FILENAME);
      }

      res.json({
        success: true,
        message: `Certificate converted to ${format.toUpperCase()} format successfully`,
        filePath: result.outputPath || result.p12Path || result.pemPath
      });
    } catch (error) {
      logger.error(`Error converting certificate ${req.params.fingerprint}:`, error, FILENAME);
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
    activityService: deps.activityService,
    deployService: require('../../services/deploy-service')
  });

  // Mount deployment actions routes
  router.use('/:fingerprint/deploy-actions', deploymentRouter);

  // Add direct deploy endpoint
  router.post('/:fingerprint/deploy', async (req, res) => {
    try {
      // Check if certificateManager is initialized
      if (!certificateManager.isInitialized) {
        return res.json({
          certificates: [],
          message: "Certificate manager is still initializing, please wait...",
          initializing: true
        });
      }

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
      logger.error(`Error deploying certificate ${req.params.fingerprint}:`, error, FILENAME);
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
      // Check if certificateManager is initialized
      if (!certificateManager.isInitialized) {
        return res.json({
          certificates: [],
          message: "Certificate manager is still initializing, please wait...",
          initializing: true
        });
      }

      const { fingerprint, fileType } = req.params;

      // Get certificate
      const certificate = deps.certificateManager.getCertificate(fingerprint);
      if (!certificate) {
        return res.status(404).json({
          message: `Certificate with fingerprint ${fingerprint} not found`,
          statusCode: 404
        });
      }

      // Get the file path from certificate using new getPath method
      const filePath = certificate._paths?.[fileType];

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
      logger.info(`Certificate file downloaded: ${downloadFilename} (${fileType}) for ${certificate.name}`, null, FILENAME);

    } catch (error) {
      logger.error(`Error downloading certificate file: ${error.message}`, error, FILENAME);
      res.status(500).json({
        message: `Failed to download certificate file: ${error.message}`,
        statusCode: 500
      });
    }
  });

  // Download all certificate files as a ZIP archive
  router.get('/:fingerprint/download', async (req, res) => {
    try {
      // Check if certificateManager is initialized
      if (!certificateManager.isInitialized) {
        return res.json({
          certificates: [],
          message: "Certificate manager is still initializing, please wait...",
          initializing: true
        });
      }

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

      // Use certificate._paths directly to avoid Path suffix issues
      const paths = certificate._paths || {};

      // Create file paths map (only existing files)
      const filesToAdd = [
        { key: 'crt', name: 'certificate.crt' },
        { key: 'key', name: 'private.key' },
        { key: 'pem', name: 'certificate.pem' },
        { key: 'p12', name: 'certificate.p12' },
        { key: 'pfx', name: 'certificate.pfx' },
        { key: 'csr', name: 'certificate.csr' },
        { key: 'chain', name: 'chain.pem' },
        { key: 'fullchain', name: 'fullchain.pem' },
        { key: 'der', name: 'certificate.der' },
        { key: 'p7b', name: 'certificate.p7b' },
        { key: 'cer', name: 'certificate.cer' },
        { key: 'ext', name: 'certificate.ext' }
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
        domains: certificate._sans?.domains || [],
        ips: certificate._sans?.ips || [],
        issuer: certificate.issuer,
        validFrom: certificate.validFrom,
        validTo: certificate.validTo,
        exportedAt: new Date()
      };

      archive.append(JSON.stringify(metadata, null, 2), { name: 'metadata.json' });

      // Log download
      logger.info(`ZIP download requested for certificate ${certificate.name}`, null, FILENAME);

      // Finalize the archive
      archive.finalize();
    } catch (error) {
      logger.error(`Error creating ZIP archive for ${req.params.fingerprint}:`, error, FILENAME);
      res.status(500).json({
        message: `Failed to create ZIP archive: ${error.message}`,
        statusCode: 500
      });
    }
  });

  // Get all available files for a certificate
  router.get('/:fingerprint/files', async (req, res) => {
    try {
      // Check if certificateManager is initialized
      if (!certificateManager.isInitialized) {
        return res.json({
          certificates: [],
          message: "Certificate manager is still initializing, please wait...",
          initializing: true
        });
      }

      const { fingerprint } = req.params;

      // Get certificate
      const certificate = deps.certificateManager.getCertificate(fingerprint);
      if (!certificate) {
        return res.status(404).json({
          message: `Certificate with fingerprint ${fingerprint} not found`,
          statusCode: 404
        });
      }

      // Verify paths exist before checking them
      certificate.verifyPaths();
      
      // Use direct _paths property without Path suffixes
      const paths = certificate._paths || {};

      // Check which files actually exist
      const availableFiles = [];

      // Check each path and add to available files if it exists
      Object.entries(paths).forEach(([key, filePath]) => {
        try {
          if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
            availableFiles.push({
              type: key,
              path: filePath,
              size: fs.statSync(filePath).size
            });
          }
        } catch (error) {
          logger.debug(`Error checking file ${key}: ${error.message}`, null, FILENAME);
        }
      });

      res.json(availableFiles);
    } catch (error) {
      logger.error(`Error getting files for certificate ${req.params.fingerprint}:`, error, FILENAME);
      res.status(500).json({
        message: `Failed to get certificate files: ${error.message}`,
        statusCode: 500
      });
    }
  });

  // Renew certificate
  router.post('/:fingerprint/renew', async (req, res) => {
    try {
      // Check if certificateManager is initialized
      if (!certificateManager.isInitialized) {
        return res.json({
          certificates: [],
          message: "Certificate manager is still initializing, please wait...",
          initializing: true
        });
      }

      const { fingerprint } = req.params;
      const {
        days,
        passphrase, // Certificate passphrase
        signingCAPassphrase, // For signing CA
        storePassphrases = false // Whether to store the passphrases
      } = req.body;

      logger.debug(`Request to renew certificate: ${fingerprint}`, null, FILENAME);

      // Find certificate
      const certificate = deps.certificateManager.getCertificate(fingerprint);
      if (!certificate) {
        logger.warn(`Certificate not found for renewal: ${fingerprint}`, null, FILENAME);
        return res.status(404).json({
          success: false,
          message: 'Certificate not found'
        });
      }

      // Determine if we need to sign with CA and get the signing CA
      let signingCA = null;
      if (certificate.signWithCA && certificate.caFingerprint) {
        signingCA = deps.certificateManager.getCertificate(certificate.caFingerprint);

        if (!signingCA) {
          logger.warn(`Signing CA not found: ${certificate.caFingerprint}`, null, FILENAME);
          return res.status(400).json({
            success: false,
            message: `Signing CA not found: ${certificate.caFingerprint}`
          });
        } else if (!signingCA.isCA) {
          logger.warn(`Certificate is not a CA, cannot use for signing: ${signingCA.name}`, null, FILENAME);
          return res.status(400).json({
            success: false,
            message: `Certificate ${signingCA.name} is not a CA and cannot be used for signing`
          });
        } else {
          logger.debug(`Using CA for renewal: ${signingCA.name}`, null, FILENAME);
          
          // Check CA passphrase if needed
          if (signingCA.needsPassphrase && !signingCAPassphrase && 
              !signingCA._hasPassphrase) {
            logger.warn(`CA certificate requires passphrase but none provided: ${signingCA.name}`, null, FILENAME);
            return res.status(400).json({
              success: false,
              message: `CA certificate ${signingCA.name} requires a passphrase`
            });
          }
        }
      }

      // Get passphrase for certificate if needed
      let certPassphrase = passphrase;
      if (!certPassphrase && deps.passphraseManager &&
        certificate.hasStoredPassphrase(deps.passphraseManager)) {
        certPassphrase = certificate.getPassphrase(deps.passphraseManager);
      }

      // Check if certificate needs passphrase
      if (certificate.needsPassphrase && !certPassphrase) {
        logger.warn(`Certificate requires passphrase but none provided: ${certificate.name}`, null, FILENAME);
        return res.status(400).json({
          success: false,
          message: `Certificate ${certificate.name} requires a passphrase`
        });
      }

      // Store passphrases if requested
      if (storePassphrases && deps.passphraseManager) {
        // Store certificate passphrase if provided
        if (passphrase && certificate.fingerprint) {
          deps.passphraseManager.storePassphrase(certificate.fingerprint, passphrase);
          logger.debug(`Stored passphrase for certificate: ${certificate.name}`, null, FILENAME);
        }

        // Store signing CA passphrase if provided
        if (signingCAPassphrase && signingCA && signingCA.fingerprint) {
          deps.passphraseManager.storePassphrase(signingCA.fingerprint, signingCAPassphrase);
          logger.debug(`Stored passphrase for signing CA: ${signingCA.name}`, null, FILENAME);
        }
      }

      // Renew the certificate with appropriate passphrases
      const result = await deps.certificateManager.createOrRenewCertificate(fingerprint, {
        days: days || 365,
        passphrase: certPassphrase,
        signingCA,
        signingCAPassphrase
      });

      if (result.success) {
        // Save the updated certificate
        await deps.certificateManager.saveCertificateConfigs();

        // Return success with the API response that includes CA name
        res.json({
          success: true,
          message: 'Certificate renewed successfully',
          certificate: await deps.certificateManager.getCertificateApiResponse(certificate.fingerprint)
        });
      } else {
        throw new Error(result.error || 'Certificate renewal failed');
      }
    } catch (error) {
      logger.error(`Error renewing certificate ${req.params.fingerprint}:`, error, FILENAME);
      res.status(500).json({
        success: false,
        message: `Failed to renew certificate: ${error.message}`,
        error: error.message
      });
    }
  });

  // Verify key match
  router.get('/:fingerprint/verify-key-match', async (req, res) => {
    try {
      // Check if certificateManager is initialized
      if (!certificateManager.isInitialized) {
        return res.json({
          certificates: [],
          message: "Certificate manager is still initializing, please wait...",
          initializing: true
        });
      }

      const { fingerprint } = req.params;

      // Get the certificate
      const cert = certificateManager.getCertificate(fingerprint);
      if (!cert) {
        return res.status(404).json({ message: 'Certificate not found', statusCode: 404 });
      }

      // Get the key and certificate paths
      const certPath = cert._paths?.crt;
      const keyPath = cert._paths?.key;

      if (!certPath || !keyPath) {
        return res.status(400).json({ 
          message: 'Certificate is missing required files', 
          statusCode: 400 
        });
      }

      const matches = await cryptoService.validateKeyPair(certPath, keyPath);

      res.json({ matches });
    } catch (error) {
      logger.error(`Error verifying key match for ${req.params.fingerprint}:`, error, FILENAME);
      res.status(500).json({ message: 'Failed to verify key match', statusCode: 500 });
    }
  });

  // Check if certificate has passphrase
  router.get('/:fingerprint/passphrase', (req, res) => {
    try {
      // Check if certificateManager is initialized
      if (!certificateManager.isInitialized) {
        return res.json({
          certificates: [],
          message: "Certificate manager is still initializing, please wait...",
          initializing: true
        });
      }

      const { fingerprint } = req.params;

      const hasPassphrase = certificateManager.hasPassphrase(fingerprint);

      res.json({ hasPassphrase });
    } catch (error) {
      logger.error(`Error checking passphrase for ${req.params.fingerprint}:`, error, FILENAME);
      res.status(500).json({ message: 'Failed to check passphrase', statusCode: 500 });
    }
  });

  // Store certificate passphrase
  router.post('/:fingerprint/passphrase', (req, res) => {
    try {
      // Check if certificateManager is initialized
      if (!certificateManager.isInitialized) {
        return res.json({
          certificates: [],
          message: "Certificate manager is still initializing, please wait...",
          initializing: true
        });
      }

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
      logger.error(`Error storing passphrase for ${req.params.fingerprint}:`, error, FILENAME);
      res.status(500).json({ message: 'Failed to store passphrase', statusCode: 500 });
    }
  });

  // Delete certificate passphrase
  router.delete('/:fingerprint/passphrase', (req, res) => {
    try {
      // Check if certificateManager is initialized
      if (!certificateManager.isInitialized) {
        return res.json({
          certificates: [],
          message: "Certificate manager is still initializing, please wait...",
          initializing: true
        });
      }

      const { fingerprint } = req.params;

      const success = certificateManager.deletePassphrase(fingerprint);

      if (!success) {
        return res.status(404).json({ message: 'No passphrase found for this certificate', statusCode: 404 });
      }

      res.json({ success: true });
    } catch (error) {
      logger.error(`Error deleting passphrase for ${req.params.fingerprint}:`, error, FILENAME);
      res.status(500).json({ message: 'Failed to delete passphrase', statusCode: 500 });
    }
  });

  // Get all certificate groups
  router.get('/groups', (req, res) => {
    try {
      // Check if certificateManager is initialized
      if (!certificateManager.isInitialized) {
        return res.json({
          certificates: [],
          message: "Certificate manager is still initializing, please wait...",
          initializing: true
        });
      }

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
      logger.error('Error getting certificate groups:', error, FILENAME);
      res.status(500).json({
        message: `Failed to get certificate groups: ${error.message}`,
        statusCode: 500
      });
    }
  });

  // Get certificate SAN entries
  router.get('/:fingerprint/san', async (req, res) => {
    try {
      // Check if certificateManager is initialized
      if (!certificateManager.isInitialized) {
        return res.json({
          certificates: [],
          message: "Certificate manager is still initializing, please wait...",
          initializing: true
        });
      }

      const { fingerprint } = req.params;

      // Get the certificate
      const cert = deps.certificateManager.getCertificate(fingerprint);
      if (!cert) {
        return res.status(404).json({
          message: `Certificate with fingerprint ${fingerprint} not found`,
          statusCode: 404
        });
      }

      // Get SAN entries from the new sans structure
      const domains = cert._sans?.domains || [];
      const idleDomains = cert._sans?.idleDomains || [];
      const ips = cert._sans?.ips || [];
      const idleIps = cert._sans?.idleIps || [];

      // Return all SAN entries
      res.json({
        domains,
        idleDomains,
        ips,
        idleIps,
        needsRenewal: idleDomains.length > 0 || idleIps.length > 0
      });
    } catch (error) {
      logger.error(`Error getting SAN entries for certificate ${req.params.fingerprint}:`, error, FILENAME);
      res.status(500).json({
        message: `Failed to get SAN entries: ${error.message}`,
        statusCode: 500
      });
    }
  });

  // Add a new domain or IP to certificate
  router.post('/:fingerprint/san', async (req, res) => {
    try {
      // Check if certificateManager is initialized
      if (!certificateManager.isInitialized) {
        return res.json({
          certificates: [],
          message: "Certificate manager is still initializing, please wait...",
          initializing: true
        });
      }

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
      let result = null;

      // Add domain or IP directly to certificate using the certificate's methods
      if (subjectType === 'ip') {
        result = cert.addIp(value, idle);
      } else {
        result = cert.addDomain(value, idle);
      }
      
      added = result.success;

      if (!added) {
        return res.status(400).json({
          message: `Failed to add ${subjectType}: ${value}. ${result.message}`,
          statusCode: 400
        });
      }

      // Save certificate changes
      await deps.certificateManager.saveCertificateConfigs();

      // Log activity using the passed instance
      try {
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
        logger.warn('Failed to log SAN update activity:', activityError, FILENAME);
      }

      // Return updated SAN entries
      res.status(201).json({
        message: `${subjectType === 'ip' ? 'IP address' : 'Domain'} added successfully${idle ? ' (idle until renewal)' : ''}`,
        domains: cert._sans?.domains || [],
        idleDomains: cert._sans?.idleDomains || [],
        ips: cert._sans?.ips || [],
        idleIps: cert._sans?.idleIps || [],
        needsRenewal: (cert._sans?.idleDomains?.length > 0) || (cert._sans?.idleIps?.length > 0)
      });
    } catch (error) {
      logger.error(`Error adding SAN entry to certificate ${req.params.fingerprint}:`, error, FILENAME);
      res.status(500).json({
        message: `Failed to add SAN entry: ${error.message}`,
        statusCode: 500
      });
    }
  });

  // Remove a domain or IP from certificate
  router.delete('/:fingerprint/san/:type/:value', async (req, res) => {
    try {
      // Check if certificateManager is initialized
      if (!certificateManager.isInitialized) {
        return res.json({
          certificates: [],
          message: "Certificate manager is still initializing, please wait...",
          initializing: true
        });
      }

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

      // Remove domain or IP directly using certificate methods
      if (type === 'ip') {
        removed = cert.removeIp(value, fromIdle);
      } else if (type === 'domain') {
        removed = cert.removeDomain(value, fromIdle);
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

      // Save certificate changes
      await deps.certificateManager.saveCertificateConfigs();

      // Log activity using the passed instance
      try {
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
        logger.warn('Failed to log SAN removal activity:', activityError, FILENAME);
      }

      // Return updated SAN entries
      res.json({
        message: `${type === 'ip' ? 'IP address' : 'Domain'} removed successfully`,
        domains: cert._sans?.domains || [],
        idleDomains: cert._sans?.idleDomains || [],
        ips: cert._sans?.ips || [],
        idleIps: cert._sans?.idleIps || [],
        needsRenewal: (cert._sans?.idleDomains?.length > 0) || (cert._sans?.idleIps?.length > 0)
      });
    } catch (error) {
      logger.error(`Error removing SAN entry from certificate ${req.params.fingerprint}:`, error, FILENAME);
      res.status(500).json({
        message: `Failed to remove SAN entry: ${error.message}`,
        statusCode: 500
      });
    }
  });

  // Apply idle domains/IPs and renew certificate
  router.post('/:fingerprint/san/apply', async (req, res) => {
    try {
      // Check if certificateManager is initialized
      if (!certificateManager.isInitialized) {
        return res.json({
          certificates: [],
          message: "Certificate manager is still initializing, please wait...",
          initializing: true
        });
      }

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
      if (!cert._sans?.idleDomains?.length && !cert._sans?.idleIps?.length) {
        return res.status(400).json({
          message: 'No idle domains or IPs to apply',
          statusCode: 400
        });
      }

      // Apply idle subjects and renew
      const hadChanges = cert.applyIdleSubjects();
      if (!hadChanges) {
        return res.status(400).json({
          message: 'No idle subjects were found to apply',
          statusCode: 400
        });
      }

      // Renew the certificate with the now-active subjects
      const renewResult = await deps.certificateManager.createOrRenewCertificate(fingerprint, {});

      // Save certificate changes
      if (renewResult.success) {
        await deps.certificateManager.saveCertificateConfigs();
      }

      // Log activity using the passed instance
      try {
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
        logger.warn('Failed to log SAN apply activity:', activityError, FILENAME);
      }

      res.json({
        message: 'Idle domains and IPs applied and certificate renewed successfully',
        success: true,
        certificate: await deps.certificateManager.getCertificateApiResponse(cert.fingerprint)
      });
    } catch (error) {
      logger.error(`Error applying idle subjects for certificate ${req.params.fingerprint}:`, error, FILENAME);
      res.status(500).json({
        message: `Failed to apply idle subjects: ${error.message}`,
        statusCode: 500
      });
    }
  });

  // Pre-renewal passphrase check endpoint
  router.get('/:fingerprint/check-renewal-passphrases', async (req, res) => {
    try {
      // Check if certificateManager is initialized
      if (!certificateManager.isInitialized) {
        return res.json({
          certificates: [],
          message: "Certificate manager is still initializing, please wait...",
          initializing: true
        });
      }

      const { fingerprint } = req.params;

      // Get certificate
      const certificate = deps.certificateManager.getCertificate(fingerprint);
      if (!certificate) {
        return res.status(404).json({
          success: false,
          message: 'Certificate not found',
          statusCode: 404
        });
      }

      const response = {
        success: true,
        certificate: {
          fingerprint,
          name: certificate.name,
          // Use new certificate property structure
          needsPassphrase: certificate._needsPassphrase || false,
          hasPassphrase: certificate._hasPassphrase || false
        },
        signingCA: null,
        passphraseNeeded: false
      };

      // Check signing CA info if needed
      if (certificate.signWithCA && certificate.caFingerprint) {
        const signingCA = deps.certificateManager.getCertificate(certificate.caFingerprint);

        if (signingCA) {
          const signingCANeedsPassphrase = signingCA._needsPassphrase || false;
          const signingCAHasPassphrase = signingCA._hasPassphrase || false

          response.signingCA = {
            fingerprint: signingCA.fingerprint,
            name: signingCA.name,
            needsPassphrase: signingCANeedsPassphrase,
            hasPassphrase: signingCAHasPassphrase
          };
        }
      }

      // Determine if we need to prompt for any passphrase
      response.passphraseNeeded =
        (response.certificate.needsPassphrase && !response.certificate.hasPassphrase) ||
        (response.signingCA && response.signingCA.needsPassphrase && !response.signingCA.hasPassphrase);

      res.json(response);
    } catch (error) {
      logger.error(`Error checking renewal passphrases for ${req.params.fingerprint}:`, error, FILENAME);
      res.status(500).json({
        success: false,
        message: `Failed to check passphrases: ${error.message}`,
        statusCode: 500
      });
    }
  });

  return router;
}

module.exports = initCertificatesRouter;