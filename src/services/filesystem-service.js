/**
 * @fileoverview File System Service - Provides methods to interact with the local file system
 * @module services/filesystem-service  
 * @requires fs
 * @requires path
 * @requires os
 * @requires util
 * @requires ./logger
 * @version 0.1.0
 * @license MIT
 * @author Christian Meiners
 */

const fs = require("fs");
const path = require("path");
const os = require("os");
const { promisify } = require("util");
const logger = require("./logger");

const fsPromises = fs.promises;
const statAsync = promisify(fs.stat);

const FILENAME = 'services/filesystem-service.js';

/**
 * File System Service for interacting with the filesystem, including Docker volume handling.
 * Provides methods for file operations, directory browsing, and special location management.
 */
class FileSystemService {
  /**
   * Create a new FileSystemService instance
   * @param {Object} [dockerService=null] - Optional Docker service instance for Docker environment integration
   */
  constructor(dockerService = null) {
    // Store reference to Docker service
    this.dockerService = dockerService;

    // Define special locations
    this.specialLocations = [
      { name: "Home", path: os.homedir() },
      { name: "Temp", path: os.tmpdir() },
    ];

    // Initialize dockerVolumes as an empty array
    this.dockerVolumes = [];

    // Check if running in Docker - handle case where dockerService is null
    try {
      if (
        this.dockerService &&
        typeof this.dockerService.isRunningInDocker === "function"
      ) {
        this.isDocker = this.dockerService.isRunningInDocker();
      } else {
        // Fallback to our own detection if dockerService isn't available
        this.isDocker = this.checkIfRunningInDocker();
      }
    } catch (error) {
      logger.warn("Error checking Docker status:", error, FILENAME);
      // Fallback to our own detection
      this.isDocker = this.checkIfRunningInDocker();
    }

    this.isWindowsDocker =
      process.env.DOCKER_HOST_OS === "windows" ||
      (process.env.OS && process.env.OS.toLowerCase() === "windows_nt");

    if (this.isWindowsDocker) {
      logger.info("Running in Windows Docker Desktop environment", null, FILENAME);
    }

    // Load Docker volumes if in Docker
    if (this.isDocker) {
      // First load using filesystem methods (synchronous)
      this.dockerVolumes = this.getDockerVolumesByFilesystem();

      // Then try to get Docker volumes using DockerService (async)
      if (this.dockerService) {
        this.loadDockerVolumesFromService();
      }
    }

    // Define root locations based on platform
    if (process.platform === "win32") {
      // Windows: Include drive letters
      this.rootLocations = this.getWindowsDrives();
    } else {
      // Unix/Linux/Mac: Include root and home
      this.rootLocations = [{ name: "Root", path: "/" }];
    }
  }

  /**
   * Check if we're in Windows Docker Desktop
   * @private
   * @returns {boolean}
   */
  isWindowsDockerDesktop() {
    return (
      process.env.DOCKER_HOST_OS === "windows" ||
      (process.env.OS && process.env.OS.toLowerCase() === "windows_nt")
    );
  }

  /**
   * Internal fallback method to check if running in Docker
   * @private
   * @returns {boolean} True if running in Docker container
   */
  checkIfRunningInDocker() {
    try {
      // Method 1: Check for .dockerenv file
      if (fs.existsSync("/.dockerenv")) {
        logger.debug("Docker detected: /.dockerenv exists", null, FILENAME);
        return true;
      }

      // Method 2: Check Docker cgroup
      if (fs.existsSync("/proc/1/cgroup")) {
        const cgroupContent = fs.readFileSync("/proc/1/cgroup", "utf8");
        if (
          cgroupContent.includes("docker") ||
          cgroupContent.includes("containerd")
        ) {
          logger.debug("Docker detected: Docker found in cgroup", null, FILENAME);
          return true;
        }
      }

      // Method 3: Check hostname (often Docker sets hostname to container ID)
      const hostname = os.hostname();
      if (hostname && hostname.length === 12 && /^[0-9a-f]+$/.test(hostname)) {
        logger.debug("Docker detected: Hostname appears to be a container ID", null, FILENAME);
        return true;
      }

      // Method 4: Check environment variables
      if (process.env.DOCKER_HOST_OS || process.env.IS_DOCKER) {
        logger.debug("Docker detected: Environment variables indicate Docker", null, FILENAME);
        return true;
      }

      return false;
    } catch (error) {
      // If any error occurs, log it and assume not in Docker
      logger.debug("Error detecting Docker environment:", error.message, FILENAME);
      return false;
    }
  }

  /**
   * Load Docker volumes from the Docker service with Windows-specific handling
   */
  async loadDockerVolumesFromService() {
    try {
      // Only try if we're in Docker and have Docker service
      if (!this.isDocker || !this.dockerService) {
        return;
      }

      logger.debug("Loading Docker volumes from DockerService", null, FILENAME);

      // Windows Docker Desktop-specific handling
      if (this.isWindowsDockerDesktop()) {
        logger.debug("Detected Windows Docker Desktop environment", null, FILENAME);

        // For Windows Docker Desktop, manually add common mounted volumes
        const windowsVolumes = [
          { name: "certs", path: "/certs", isWritable: true },
          { name: "config", path: "/config", isWritable: true },
          { name: "logs", path: "/logs", isWritable: true },
        ];

        // Also check for any additional mounts by reading /proc/mounts
        if (fs.existsSync("/proc/mounts")) {
          try {
            const mounts = fs.readFileSync("/proc/mounts", "utf8");
            if (mounts.includes("dummyParent")) {
              windowsVolumes.push({
                name: "dummyParent",
                path: "/dummyParent",
                isWritable: true,
              });
            }
          } catch (err) {
            logger.debug("Error reading mounts:", err, FILENAME);
          }
        }

        // Update volumes
        this.dockerVolumes = windowsVolumes;
        return;
      }

      // Standard Docker volume loading for non-Windows environments
      if (typeof this.dockerService.getThisContainerMounts === "function") {
        // Get volumes from DockerService
        const dockerVolumes = await this.dockerService.getThisContainerMounts();

        if (dockerVolumes && dockerVolumes.length > 0) {
          logger.info(
            `Found ${dockerVolumes.length} Docker volumes from DockerService`
          );
          this.dockerVolumes = dockerVolumes;
        }
      }
    } catch (error) {
      logger.debug("Error loading Docker volumes from service:", error, FILENAME);
    }
  }

  /**
   * Get Docker volume mount points using filesystem methods
   * @private
   * @returns {Array} List of Docker volumes
   */
  getDockerVolumesByFilesystem() {
    try {
      const volumes = [];

      // Windows Docker Desktop-specific handling
      if (this.isWindowsDocker) {
        // Add known mounted volumes from docker-compose
        const composeMounts = [
          { name: "certs", path: "/certs", isWritable: true },
          { name: "config", path: "/config", isWritable: true },
          { name: "logs", path: "/logs", isWritable: true },
          // Add any others you know are mounted
        ];

        // Filter to only include those that actually exist
        return composeMounts.filter((mount) => fs.existsSync(mount.path));
      }

      // Method 1: Parse /proc/mounts to find volume mounts
      if (fs.existsSync("/proc/mounts")) {
        const mounts = fs.readFileSync("/proc/mounts", "utf8");
        const mountLines = mounts.split("\n");

        for (const line of mountLines) {
          const parts = line.split(" ");
          if (parts.length >= 2) {
            const device = parts[0];
            const mountPoint = parts[1];

            // Look for common Docker volume patterns
            if (
              (device.includes("overlay") ||
                device.includes("/dev/") ||
                device.includes("tmpfs")) &&
              mountPoint !== "/" &&
              !mountPoint.startsWith("/proc") &&
              !mountPoint.startsWith("/sys") &&
              !mountPoint.startsWith("/dev") &&
              !mountPoint.startsWith("/run")
            ) {
              try {
                // Check if it's writable by the current user
                const testFile = path.join(
                  mountPoint,
                  `.cert-manager-test-${Date.now()}`
                );
                fs.writeFileSync(testFile, "test");
                fs.unlinkSync(testFile);

                // If writable, add to volumes
                const volumeName = mountPoint.split("/").pop() || mountPoint;
                volumes.push({
                  name: volumeName,
                  path: mountPoint,
                  isWritable: true,
                });
              } catch (err) {
                // Not writable, still add but mark accordingly
                const volumeName = mountPoint.split("/").pop() || mountPoint;
                volumes.push({
                  name: volumeName,
                  path: mountPoint,
                  isWritable: false,
                });
              }
            }
          }
        }
      }

      // Method 2: Check for common Docker volume locations
      const commonVolumePaths = [
        "/var/lib/docker/volumes",
        "/var/lib/docker/overlay2",
        "/mnt",
        "/volumes",
        "/shared",
        "/app/data",
      ];

      for (const volumePath of commonVolumePaths) {
        if (fs.existsSync(volumePath)) {
          try {
            // Check if it's a directory and add it
            const stats = fs.statSync(volumePath);
            if (stats.isDirectory()) {
              // Check if it's already in volumes
              if (!volumes.some((v) => v.path === volumePath)) {
                const name = volumePath.split("/").pop() || volumePath;
                volumes.push({
                  name,
                  path: volumePath,
                  isWritable: this.isPathWritable(volumePath),
                });
              }
            }
          } catch (error) {
            logger.debug(`Error checking volume path ${volumePath}:`, error, FILENAME);
          }
        }
      }

      // Method 3: Check Docker environment variables
      // Docker often sets env vars for linked services that might reveal mount points
      for (const [key, value] of Object.entries(process.env)) {
        if (key.includes("_PORT_") && value.startsWith("tcp://")) {
          const serviceName = key.split("_PORT_")[0].toLowerCase();

          // Check for potential volume paths related to this service
          const potentialPaths = [
            `/var/lib/${serviceName}`,
            `/var/lib/docker/volumes/${serviceName}`,
            `/mnt/${serviceName}`,
            `/volumes/${serviceName}`,
            `/data/${serviceName}`,
          ];

          for (const potentialPath of potentialPaths) {
            if (
              fs.existsSync(potentialPath) &&
              !volumes.some((v) => v.path === potentialPath)
            ) {
              volumes.push({
                name: serviceName,
                path: potentialPath,
                isWritable: this.isPathWritable(potentialPath),
              });
            }
          }
        }
      }

      logger.info(
        `Found ${volumes.length} Docker volumes using filesystem methods`
      );
      return volumes;
    } catch (error) {
      logger.error("Error getting Docker volumes by filesystem:", error, FILENAME);
      return [];
    }
  }

  /**
   * Check if a path is writable
   * @private
   * @param {string} dirPath - Path to check
   * @returns {boolean} True if writable
   */
  isPathWritable(dirPath) {
    try {
      const testFile = path.join(dirPath, `.cert-manager-test-${Date.now()}`);
      fs.writeFileSync(testFile, "test");
      fs.unlinkSync(testFile);
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Get special locations (home, desktop, etc)
   * @returns {Object} Special locations
   */
  getSpecialLocations() {
    return this.specialLocations;
  }

  /**
   * Get information about Docker environment
   * @returns {Object} Docker information
   */
  getDockerInfo() {
    // Ensure isDocker is a proper boolean
    const isDockerEnv = !!this.isDocker;

    return {
      isDocker: isDockerEnv,
      volumes: this.dockerVolumes || [],
    };
  }

  /**
   * Get root locations (drives, volumes)
   * @returns {Array} Root locations
   */
  getRootLocations() {
    return this.rootLocations || [];
  }

  /**
   * Get all filesystem locations (roots, special, Docker)
   * @returns {Object} All filesystem locations
   */
  getAllLocations() {
    return {
      roots: this.getRootLocations(),
      special: this.getSpecialLocations(),
      docker: this.getDockerInfo(),
    };
  }

  /**
   * Get Windows drive letters
   * @private
   * @returns {Array} List of Windows drives
   */
  getWindowsDrives() {
    try {
      const drives = [];
      // Check common Windows drive letters
      for (const letter of "CDEFGHIJKLMNOPQRSTUVWXYZ") {
        const drivePath = `${letter}:\\`;
        try {
          if (fs.existsSync(drivePath)) {
            drives.push({
              name: `${letter}:`,
              path: drivePath,
            });
          }
        } catch (e) {
          // Ignore errors for non-existent drives
        }
      }
      return drives;
    } catch (error) {
      logger.error("Error getting Windows drives:", error, FILENAME);
      return [];
    }
  }

  /**
   * List files and directories in a path
   * @param {string} dirPath - Directory path to list
   * @param {Object} options - Options for listing
   * @returns {Promise<Object>} Directory listing result
   */
  async listDirectory(dirPath, options = {}) {
    const defaultOptions = {
      showHidden: false,
      showSystemFiles: false,
      sortBy: "name",
      sortDirection: "asc",
      filter: null,
    };

    const opts = { ...defaultOptions, ...options };

    try {
      // Normalize and resolve the path
      const normalizedPath = this.normalizePath(dirPath);

      // Ensure the path exists and is a directory
      const stats = await statAsync(normalizedPath);
      if (!stats.isDirectory()) {
        throw new Error(`Path is not a directory: ${normalizedPath}`);
      }

      // Read directory contents
      const items = await fsPromises.readdir(normalizedPath, {
        withFileTypes: true,
      });

      // Process each item
      const result = {
        path: normalizedPath,
        parent: path.dirname(normalizedPath),
        items: [],
      };

      for (const item of items) {
        // Skip hidden files if not requested
        if (!opts.showHidden && item.name.startsWith(".")) {
          continue;
        }

        // Skip system files on Windows if not requested
        if (process.platform === "win32" && !opts.showSystemFiles) {
          const systemFiles = ["desktop.ini", "thumbs.db", "$recycle.bin"];
          if (systemFiles.includes(item.name.toLowerCase())) {
            continue;
          }
        }

        // Apply filter if provided
        if (
          opts.filter &&
          !item.name.toLowerCase().includes(opts.filter.toLowerCase())
        ) {
          continue;
        }

        // Full path for the item
        const itemPath = path.join(normalizedPath, item.name);

        try {
          let itemStats;
          try {
            itemStats = await statAsync(itemPath);
          } catch (statError) {
            // Skip files we can't access
            logger.debug(`Unable to stat ${itemPath}: ${statError.message}`, null, FILENAME);
            continue;
          }

          const isDirectory = item.isDirectory();
          const isFile = item.isFile();

          // Skip if not a file or directory (symlinks, etc.)
          if (!isDirectory && !isFile) {
            continue;
          }

          result.items.push({
            name: item.name,
            path: itemPath,
            isDirectory,
            isFile,
            size: isFile ? itemStats.size : null,
            modified: itemStats.mtime,
            created: itemStats.birthtime,
          });
        } catch (itemError) {
          logger.debug(`Error processing item ${itemPath}:`, itemError, null, FILENAME);
        }
      }

      // Sort items
      result.items.sort((a, b) => {
        // Directories first
        if (a.isDirectory && !b.isDirectory) return -1;
        if (!a.isDirectory && b.isDirectory) return 1;

        // Then apply the requested sort
        let comparison;
        switch (opts.sortBy) {
          case "size":
            comparison = (a.size || 0) - (b.size || 0);
            break;
          case "modified":
            comparison = new Date(a.modified) - new Date(b.modified);
            break;
          case "created":
            comparison = new Date(a.created) - new Date(b.created);
            break;
          case "name":
          default:
            comparison = a.name.localeCompare(b.name);
            break;
        }

        return opts.sortDirection === "desc" ? -comparison : comparison;
      });

      return result;
    } catch (error) {
      logger.error(`Failed to list directory ${dirPath}:`, error, null, FILENAME);
      throw error;
    }
  }

  /**
   * Check if a path exists
   * @param {string} filePath - Path to check
   * @returns {Promise<Object>} Path information
   */
  async checkPath(filePath) {
    try {
      const normalizedPath = this.normalizePath(filePath);
      const stats = await statAsync(normalizedPath);

      return {
        exists: true,
        path: normalizedPath,
        isDirectory: stats.isDirectory(),
        isFile: stats.isFile(),
        size: stats.size,
        modified: stats.mtime,
        created: stats.birthtime,
      };
    } catch (error) {
      if (error.code === "ENOENT") {
        return {
          exists: false,
          path: this.normalizePath(filePath),
          error: "Path does not exist",
        };
      }

      logger.error(`Error checking path ${filePath}:`, error, null, FILENAME);
      throw error;
    }
  }

  /**
   * Create a directory
   * @param {string} dirPath - Directory to create
   * @returns {Promise<Object>} Creation result
   */
  async createDirectory(dirPath) {
    try {
      const normalizedPath = this.normalizePath(dirPath);
      await fsPromises.mkdir(normalizedPath, { recursive: true });

      return {
        success: true,
        path: normalizedPath,
      };
    } catch (error) {
      logger.error(`Failed to create directory ${dirPath}:`, error, null, FILENAME);
      throw error;
    }
  }

  /**
   * Normalize a path based on platform
   * @private
   * @param {string} inputPath - Path to normalize
   * @returns {string} Normalized path
   */
  normalizePath(inputPath) {
    if (!inputPath) {
      return process.platform === "win32"
        ? process.cwd().charAt(0) + ":\\"
        : "/";
    }

    // Handle special locations
    if (inputPath.startsWith("special:")) {
      const location = inputPath.split(":")[1];
      const specialPath = this.specialLocations[location];
      return specialPath || process.cwd();
    }

    // Make sure the path is absolute
    if (!path.isAbsolute(inputPath)) {
      return path.resolve(process.cwd(), inputPath);
    }

    return path.normalize(inputPath);
  }
}

// Explicitly export the class
module.exports = FileSystemService;
