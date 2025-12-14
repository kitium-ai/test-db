/**
 * Docker-based hermetic database testing utilities
 */

import { execSync, spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';

import { createLogger, type ILogger } from '../utils/logging.js';
import { withSpan } from '../utils/telemetry.js';

const fileExists = async (filePath: string): Promise<boolean> => {
  // File paths are provided by the test harness configuration.
  // eslint-disable-next-line security/detect-non-literal-fs-filename
  const stat = await fs.stat(filePath).catch(() => null);
  return stat !== null;
};

const buildDockerRunArguments = (
  config: DockerContainerConfig,
  containerName: string
): string[] => {
  const args = ['run', '-d', '--name', containerName];

  if (config.ports) {
    for (const [containerPort, hostPort] of Object.entries(config.ports)) {
      args.push('-p', `${hostPort}:${containerPort}`);
    }
  }

  if (config.environment) {
    for (const [key, value] of Object.entries(config.environment)) {
      args.push('-e', `${key}=${value}`);
    }
  }

  if (config.volumes) {
    for (const [hostPath, containerPath] of Object.entries(config.volumes)) {
      args.push('-v', `${hostPath}:${containerPath}`);
    }
  }

  if (config.network) {
    args.push('--network', config.network);
  }

  if (config.healthCheck) {
    args.push('--health-cmd', config.healthCheck.test);
    args.push('--health-interval', config.healthCheck.interval);
    args.push('--health-timeout', config.healthCheck.timeout);
    args.push('--health-retries', config.healthCheck.retries.toString());
  }

  args.push(config.image);
  return args;
};

export type DockerContainerConfig = {
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
};

export type HermeticDatabaseConfig = {
  container: DockerContainerConfig;
  database: string;
  waitForReady?: {
    timeout: number;
    healthCheck: () => Promise<boolean>;
  };
  schemaFiles?: string[];
  seedFiles?: string[];
};

export class DockerContainerManager {
  private readonly logger: ILogger;
  private readonly containers: Map<string, string> = new Map();

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

    const containerName = config.name ?? `test-db-${randomUUID().slice(0, 8)}`;
    const args = buildDockerRunArguments(config, containerName);

    try {
      await withSpan('docker.container.start', () => {
        this.logger.debug('Starting Docker container', { args, containerName });

        const result = execSync(`docker ${args.join(' ')}`, { encoding: 'utf8' });
        const containerId = result.trim();

        this.containers.set(containerName, containerId);
        this.logger.info('Docker container started', { containerName, containerId });
        return Promise.resolve();
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
      await withSpan('docker.container.stop', () => {
        execSync(`docker stop ${containerName}`, { stdio: 'ignore' });
        execSync(`docker rm ${containerName}`, { stdio: 'ignore' });

        this.containers.delete(containerName);
        this.logger.info('Docker container stopped and removed', { containerName });
        return Promise.resolve();
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
  public async waitForHealthy(containerName: string, timeoutMs = 30000): Promise<void> {
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

      await new Promise<void>((resolve) => {
        setTimeout(resolve, 1000);
      });
    }

    throw new Error(`Container ${containerName} did not become healthy within ${timeoutMs}ms`);
  }

  /**
   * Execute command in container
   */
  public execInContainer(containerName: string, command: string): Promise<string> {
    try {
      const result = execSync(`docker exec ${containerName} ${command}`, { encoding: 'utf8' });
      return Promise.resolve(result.trim());
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
  public copyToContainer(
    containerName: string,
    hostPath: string,
    containerPath: string
  ): Promise<void> {
    try {
      execSync(`docker cp "${hostPath}" "${containerName}:${containerPath}"`, { stdio: 'ignore' });
      this.logger.debug('File copied to container', { containerName, hostPath, containerPath });
      return Promise.resolve();
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
  public copyFromContainer(
    containerName: string,
    containerPath: string,
    hostPath: string
  ): Promise<void> {
    try {
      execSync(`docker cp "${containerName}:${containerPath}" "${hostPath}"`, { stdio: 'ignore' });
      this.logger.debug('File copied from container', { containerName, containerPath, hostPath });
      return Promise.resolve();
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
    const containerNames = Array.from(this.containers.keys());
    const results = await Promise.allSettled(
      containerNames.map((containerName) => this.stopContainer(containerName))
    );
    for (const [index, result] of results.entries()) {
      if (result.status === 'rejected') {
        this.logger.warn('Failed to cleanup container', {
          containerName: containerNames[index],
          error: result.reason instanceof Error ? result.reason.message : String(result.reason),
        });
      }
    }
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

  private async waitForDatabaseReady(
    config: HermeticDatabaseConfig,
    containerName: string
  ): Promise<void> {
    if (config.waitForReady) {
      await this.containerManager.waitForHealthy(containerName, config.waitForReady.timeout);
      const isReady = await config.waitForReady.healthCheck();
      if (!isReady) {
        throw new Error('Database health check failed');
      }
      return;
    }

    await this.containerManager.waitForHealthy(containerName);
  }

  private buildPostgresContainerConfig(config: HermeticDatabaseConfig): DockerContainerConfig {
    return {
      ...config.container,
      image: config.container.image ?? 'postgres:15-alpine',
      environment: {
        POSTGRES_DB: config.database,
        POSTGRES_USER: 'testuser',
        POSTGRES_PASSWORD: 'testpass',
        ...config.container.environment,
      },
      ports: {
        /* eslint-disable @typescript-eslint/naming-convention */
        '5432': 5432,
        /* eslint-enable @typescript-eslint/naming-convention */
        ...config.container.ports,
      },
    };
  }

  private buildMongoContainerConfig(config: HermeticDatabaseConfig): DockerContainerConfig {
    return {
      ...config.container,
      image: config.container.image ?? 'mongo:7-jammy',
      environment: {
        MONGO_INITDB_DATABASE: config.database,
        ...config.container.environment,
      },
      ports: {
        /* eslint-disable @typescript-eslint/naming-convention */
        '27017': 27017,
        /* eslint-enable @typescript-eslint/naming-convention */
        ...config.container.ports,
      },
    };
  }

  private async applyPostgresSqlFiles(
    containerName: string,
    database: string,
    files: string[] | undefined,
    destination: string
  ): Promise<void> {
    if (!files) {
      return;
    }

    for (const file of files) {
      if (!(await fileExists(file))) {
        continue;
      }
      await this.containerManager.copyToContainer(containerName, file, destination);
      await this.containerManager.execInContainer(
        containerName,
        `psql -U testuser -d ${database} -f ${destination}`
      );
    }
  }

  private async applyMongoSeedFiles(
    containerName: string,
    database: string,
    files: string[] | undefined
  ): Promise<void> {
    if (!files) {
      return;
    }

    for (const file of files) {
      if (!(await fileExists(file))) {
        continue;
      }
      await this.containerManager.copyToContainer(containerName, file, '/tmp/seed.js');
      await this.containerManager.execInContainer(
        containerName,
        `mongosh ${database} /tmp/seed.js`
      );
    }
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
    const containerName = await this.containerManager.startContainer(
      this.buildPostgresContainerConfig(config)
    );
    await this.waitForDatabaseReady(config, containerName);
    await this.applyPostgresSqlFiles(
      containerName,
      config.database,
      config.schemaFiles,
      '/tmp/schema.sql'
    );
    await this.applyPostgresSqlFiles(
      containerName,
      config.database,
      config.seedFiles,
      '/tmp/seed.sql'
    );

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
    const containerName = await this.containerManager.startContainer(
      this.buildMongoContainerConfig(config)
    );
    await this.waitForDatabaseReady(config, containerName);
    await this.applyMongoSeedFiles(containerName, config.database, config.seedFiles);

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
