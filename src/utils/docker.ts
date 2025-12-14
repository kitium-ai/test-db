/**
 * Docker-based hermetic database testing utilities
 */

import { execSync, spawn } from 'child_process';
import { randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import path from 'path';

import { createLogger, type ILogger } from '../utils/logging.js';
import { withSpan } from '../utils/telemetry.js';

export interface DockerContainerConfig {
  image: string;
  name?: string;
  ports?: Record<string, number>;
  environment?: Record<string, string>;
  volumes?: Record<string, string>;
  network?: string;
  healthCheck?: {
    test: string;
    interval: string;
    timeout: string;
    retries: number;
  };
}

export interface HermeticDatabaseConfig {
  container: DockerContainerConfig;
  database: string;
  waitForReady?: {
    timeout: number;
    healthCheck: () => Promise<boolean>;
  };
  schemaFiles?: string[];
  seedFiles?: string[];
}

export class DockerContainerManager {
  private readonly logger: ILogger;
  private containers: Map<string, string> = new Map();

  constructor() {
    this.logger = createLogger('DockerContainerManager');
  }

  /**
   * Check if Docker is available
   */
  public isDockerAvailable(): boolean {
    try {
      execSync('docker --version', { stdio: 'ignore' });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Start a Docker container
   */
  public async startContainer(config: DockerContainerConfig): Promise<string> {
    if (!this.isDockerAvailable()) {
      throw new Error('Docker is not available on this system');
    }

    const containerName = config.name || `test-db-${randomUUID().slice(0, 8)}`;

    try {
      await withSpan('docker.container.start', async () => {
        const args = ['run', '-d', '--name', containerName];

        // Add port mappings
        if (config.ports) {
          for (const [containerPort, hostPort] of Object.entries(config.ports)) {
            args.push('-p', `${hostPort}:${containerPort}`);
          }
        }

        // Add environment variables
        if (config.environment) {
          for (const [key, value] of Object.entries(config.environment)) {
            args.push('-e', `${key}=${value}`);
          }
        }

        // Add volumes
        if (config.volumes) {
          for (const [hostPath, containerPath] of Object.entries(config.volumes)) {
            args.push('-v', `${hostPath}:${containerPath}`);
          }
        }

        // Add network
        if (config.network) {
          args.push('--network', config.network);
        }

        // Add health check
        if (config.healthCheck) {
          args.push('--health-cmd', config.healthCheck.test);
          args.push('--health-interval', config.healthCheck.interval);
          args.push('--health-timeout', config.healthCheck.timeout);
          args.push('--health-retries', config.healthCheck.retries.toString());
        }

        args.push(config.image);

        this.logger.debug('Starting Docker container', { args, containerName });

        const result = execSync(`docker ${args.join(' ')}`, { encoding: 'utf8' });
        const containerId = result.trim();

        this.containers.set(containerName, containerId);
        this.logger.info('Docker container started', { containerName, containerId });
      });

      return containerName;
    } catch (error) {
      const error_ = error instanceof Error ? error : new Error(String(error));
      this.logger.error('Failed to start Docker container', {
        containerName,
        error: error_.message,
      });
      throw error_;
    }
  }

  /**
   * Stop a Docker container
   */
  public async stopContainer(containerName: string): Promise<void> {
    try {
      await withSpan('docker.container.stop', async () => {
        execSync(`docker stop ${containerName}`, { stdio: 'ignore' });
        execSync(`docker rm ${containerName}`, { stdio: 'ignore' });

        this.containers.delete(containerName);
        this.logger.info('Docker container stopped and removed', { containerName });
      });
    } catch (error) {
      const error_ = error instanceof Error ? error : new Error(String(error));
      this.logger.error('Failed to stop Docker container', {
        containerName,
        error: error_.message,
      });
      throw error_;
    }
  }

  /**
   * Wait for container to be healthy
   */
  public async waitForHealthy(containerName: string, timeoutMs: number = 30000): Promise<void> {
    const startTime = Date.now();

    while (Date.now() - startTime < timeoutMs) {
      try {
        const result = execSync(
          `docker inspect ${containerName} --format='{{.State.Health.Status}}'`,
          {
            encoding: 'utf8',
          }
        ).trim();

        if (result === 'healthy') {
          this.logger.info('Docker container is healthy', { containerName });
          return;
        }
      } catch {
        // Container might not have health check or is still starting
      }

      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    throw new Error(`Container ${containerName} did not become healthy within ${timeoutMs}ms`);
  }

  /**
   * Execute command in container
   */
  public async execInContainer(containerName: string, command: string): Promise<string> {
    try {
      const result = execSync(`docker exec ${containerName} ${command}`, { encoding: 'utf8' });
      return result.trim();
    } catch (error) {
      const error_ = error instanceof Error ? error : new Error(String(error));
      this.logger.error('Failed to execute command in container', {
        containerName,
        command,
        error: error_.message,
      });
      throw error_;
    }
  }

  /**
   * Copy file to container
   */
  public async copyToContainer(
    containerName: string,
    hostPath: string,
    containerPath: string
  ): Promise<void> {
    try {
      execSync(`docker cp "${hostPath}" "${containerName}:${containerPath}"`, { stdio: 'ignore' });
      this.logger.debug('File copied to container', { containerName, hostPath, containerPath });
    } catch (error) {
      const error_ = error instanceof Error ? error : new Error(String(error));
      this.logger.error('Failed to copy file to container', {
        containerName,
        hostPath,
        containerPath,
        error: error_.message,
      });
      throw error_;
    }
  }

  /**
   * Copy file from container
   */
  public async copyFromContainer(
    containerName: string,
    containerPath: string,
    hostPath: string
  ): Promise<void> {
    try {
      execSync(`docker cp "${containerName}:${containerPath}" "${hostPath}"`, { stdio: 'ignore' });
      this.logger.debug('File copied from container', { containerName, containerPath, hostPath });
    } catch (error) {
      const error_ = error instanceof Error ? error : new Error(String(error));
      this.logger.error('Failed to copy file from container', {
        containerName,
        containerPath,
        hostPath,
        error: error_.message,
      });
      throw error_;
    }
  }

  /**
   * Get container logs
   */
  public getContainerLogs(containerName: string): string {
    try {
      return execSync(`docker logs ${containerName}`, { encoding: 'utf8' });
    } catch (error) {
      const error_ = error instanceof Error ? error : new Error(String(error));
      this.logger.error('Failed to get container logs', { containerName, error: error_.message });
      return '';
    }
  }

  /**
   * Clean up all managed containers
   */
  public async cleanup(): Promise<void> {
    const promises = Array.from(this.containers.keys()).map((containerName) =>
      this.stopContainer(containerName).catch((error) => {
        this.logger.warn('Failed to cleanup container', { containerName, error: error.message });
      })
    );

    await Promise.all(promises);
    this.containers.clear();
  }
}

export class HermeticDatabaseManager {
  private readonly containerManager: DockerContainerManager;
  private readonly logger: ILogger;

  constructor() {
    this.containerManager = new DockerContainerManager();
    this.logger = createLogger('HermeticDatabaseManager');
    // spawn and path are available for future use in advanced scenarios
    void spawn; // Mark as available but not yet used
    void path; // Mark as available but not yet used
  }

  /**
   * Create a hermetic PostgreSQL database
   */
  public async createHermeticPostgres(config: HermeticDatabaseConfig): Promise<{
    containerName: string;
    connectionConfig: {
      host: string;
      port: number;
      username: string;
      password: string;
      database: string;
    };
  }> {
    this.logger.info('Creating hermetic PostgreSQL database', { database: config.database });
    const containerName = await this.containerManager.startContainer({
      ...config.container,
      image: config.container.image || 'postgres:15-alpine',
      environment: {
        /* eslint-disable @typescript-eslint/naming-convention */
        POSTGRES_DB: config.database,
        POSTGRES_USER: 'testuser',
        POSTGRES_PASSWORD: 'testpass',
        /* eslint-enable @typescript-eslint/naming-convention */
        ...config.container.environment,
      },
      ports: {
        /* eslint-disable @typescript-eslint/naming-convention */
        '5432': 5432,
        /* eslint-enable @typescript-eslint/naming-convention */
        ...config.container.ports,
      },
    });

    // Wait for database to be ready
    if (config.waitForReady) {
      await this.containerManager.waitForHealthy(containerName, config.waitForReady.timeout);
      const isReady = await config.waitForReady.healthCheck();
      if (!isReady) {
        throw new Error('Database health check failed');
      }
    } else {
      // Default PostgreSQL health check
      await this.containerManager.waitForHealthy(containerName);
    }

    // Apply schema files if provided
    if (config.schemaFiles) {
      for (const schemaFile of config.schemaFiles) {
        if (await fs.stat(schemaFile).catch(() => false)) {
          await this.containerManager.copyToContainer(containerName, schemaFile, '/tmp/schema.sql');
          await this.containerManager.execInContainer(
            containerName,
            'psql -U testuser -d ' + config.database + ' -f /tmp/schema.sql'
          );
        }
      }
    }

    // Apply seed files if provided
    if (config.seedFiles) {
      for (const seedFile of config.seedFiles) {
        if (await fs.stat(seedFile).catch(() => false)) {
          await this.containerManager.copyToContainer(containerName, seedFile, '/tmp/seed.sql');
          await this.containerManager.execInContainer(
            containerName,
            'psql -U testuser -d ' + config.database + ' -f /tmp/seed.sql'
          );
        }
      }
    }

    return {
      containerName,
      connectionConfig: {
        host: 'localhost',
        port: 5432,
        username: 'testuser',
        password: 'testpass',
        database: config.database,
      },
    };
  }

  /**
   * Create a hermetic MongoDB database
   */
  public async createHermeticMongo(config: HermeticDatabaseConfig): Promise<{
    containerName: string;
    connectionConfig: {
      uri: string;
      database: string;
    };
  }> {
    const containerName = await this.containerManager.startContainer({
      ...config.container,
      image: config.container.image || 'mongo:7-jammy',
      environment: {
        /* eslint-disable @typescript-eslint/naming-convention */
        MONGO_INITDB_DATABASE: config.database,
        /* eslint-enable @typescript-eslint/naming-convention */
        ...config.container.environment,
      },
      ports: {
        /* eslint-disable @typescript-eslint/naming-convention */
        '27017': 27017,
        /* eslint-enable @typescript-eslint/naming-convention */
        ...config.container.ports,
      },
    });

    // Wait for database to be ready
    if (config.waitForReady) {
      await this.containerManager.waitForHealthy(containerName, config.waitForReady.timeout);
      const isReady = await config.waitForReady.healthCheck();
      if (!isReady) {
        throw new Error('Database health check failed');
      }
    } else {
      // Default MongoDB health check
      await this.containerManager.waitForHealthy(containerName);
    }

    // Apply seed files if provided (assuming JavaScript files for MongoDB)
    if (config.seedFiles) {
      for (const seedFile of config.seedFiles) {
        if (await fs.stat(seedFile).catch(() => false)) {
          await this.containerManager.copyToContainer(containerName, seedFile, '/tmp/seed.js');
          await this.containerManager.execInContainer(
            containerName,
            'mongosh ' + config.database + ' /tmp/seed.js'
          );
        }
      }
    }

    return {
      containerName,
      connectionConfig: {
        uri: 'mongodb://localhost:27017',
        database: config.database,
      },
    };
  }

  /**
   * Clean up all hermetic databases
   */
  public async cleanup(): Promise<void> {
    await this.containerManager.cleanup();
  }
}

// Convenience functions
export const createHermeticPostgres = (
  config: HermeticDatabaseConfig
): Promise<{
  containerName: string;
  connectionConfig: {
    host: string;
    port: number;
    username: string;
    password: string;
    database: string;
  };
}> => {
  const manager = new HermeticDatabaseManager();
  return manager.createHermeticPostgres(config);
};

export const createHermeticMongo = (
  config: HermeticDatabaseConfig
): Promise<{
  containerName: string;
  connectionConfig: {
    uri: string;
    database: string;
  };
}> => {
  const manager = new HermeticDatabaseManager();
  return manager.createHermeticMongo(config);
};
