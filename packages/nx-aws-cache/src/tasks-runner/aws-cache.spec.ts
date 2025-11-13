import * as fs from 'fs';
import * as os from 'os';
import { randomUUID } from 'crypto';
import * as path from 'path';
import { mockClient } from 'aws-sdk-client-mock';
import {
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { sdkStreamMixin } from '@aws-sdk/util-stream-node';
import { AwsCache } from './aws-cache';
import { Logger } from './logger';
import { MessageReporter } from './message-reporter';
import { Encrypt, EncryptConfig } from './encryptor';

// eslint-disable-next-line max-lines-per-function
describe('Test aws put and get unencrypted file', () => {
  let awsCache: AwsCache;
  const s3Mock = mockClient(S3Client);
  const hash = randomUUID();
  const cacheDirectory = path.join(os.tmpdir(), 'aws-cache');
  const cacheDirectorySave = path.join(os.tmpdir(), 'aws-cache-decompress');
  const fileContent = 'console.log(123)';
  let filePath = '';

  const config = {
    encryptionFileKey: 'Pbfk58EpcK7IxTxWwSXNsTAKmzhJQE+99vkpGftyJg8=',
    awsAccessKeyId: 'minio',
    awsSecretAccessKey: 'minio123',
    awsBucket: 'test',
    awsEndpoint: 'http://127.0.0.1:9000',
    awsForcePathStyle: true,
    awsRegion: 'us-east-1',
  };

  beforeEach(() => {
    fs.mkdirSync(cacheDirectory, {
      recursive: true,
    });
    fs.mkdirSync(cacheDirectorySave, {
      recursive: true,
    });

    const fileDir = path.join(cacheDirectory, `${hash}/outputs`);

    fs.mkdirSync(fileDir, { recursive: true });
    filePath = path.join(fileDir, 'test.js');
    fs.writeFileSync(filePath, fileContent);
  });

  afterEach(() => {
    jest.resetAllMocks();
    s3Mock.reset();
  });

  it('Should save encrypted data in s3 file, and read an unencrypted', async () => {
    awsCache = new AwsCache(config, new MessageReporter(new Logger()));

    await awsCache.store(hash, cacheDirectory);
    await awsCache.waitForStoreRequestsToComplete();

    const tgzFilePath = path.join(cacheDirectory, `${hash}.tar.gz`);
    expect(fs.existsSync(tgzFilePath)).toBeTruthy();

    // Mock HeadObjectCommand to indicate cache exists (needed for checkIfCacheExists)
    s3Mock.on(HeadObjectCommand).resolves({});

    const tgzFileStream = fs.createReadStream(tgzFilePath);
    const sdkStream = sdkStreamMixin(
      tgzFileStream.pipe(new Encrypt(new EncryptConfig(config.encryptionFileKey))),
    );
    s3Mock.on(GetObjectCommand).resolves({ Body: sdkStream });

    const retrieved = await awsCache.retrieve(hash, cacheDirectorySave);
    expect(retrieved).toBe(true);

    const extractedFilePath = path.join(cacheDirectorySave, `${hash}/outputs/test.js`);
    expect(fs.existsSync(extractedFilePath)).toBeTruthy();
    expect(fs.readFileSync(extractedFilePath).toString()).toBe(fileContent);
  });

  it('Should save in unencrypted s3 file, and read an unencrypted', async () => {
    const configWithoutEncryption = {
      ...config,
      encryptionFileKey: '',
    };
    awsCache = new AwsCache(configWithoutEncryption, new MessageReporter(new Logger()));

    await awsCache.store(hash, cacheDirectory);
    await awsCache.waitForStoreRequestsToComplete();

    const tgzFilePath = path.join(cacheDirectory, `${hash}.tar.gz`);
    expect(fs.existsSync(tgzFilePath)).toBeTruthy();

    // Mock HeadObjectCommand to indicate cache exists (needed for checkIfCacheExists)
    s3Mock.on(HeadObjectCommand).resolves({});

    const tgzFileStream = fs.createReadStream(tgzFilePath);
    const sdkStream = sdkStreamMixin(tgzFileStream);

    s3Mock.on(GetObjectCommand).resolves({ Body: sdkStream });

    const retrieved = await awsCache.retrieve(hash, cacheDirectorySave);
    expect(retrieved).toBe(true);

    const extractedFilePath = path.join(cacheDirectorySave, `${hash}/outputs/test.js`);
    expect(fs.existsSync(extractedFilePath)).toBeTruthy();
    expect(fs.readFileSync(extractedFilePath).toString()).toBe(fileContent);
  });
});

// eslint-disable-next-line max-lines-per-function
describe('Test database file syncing', () => {
  let awsCache: AwsCache;
  const s3Mock = mockClient(S3Client);
  const workspaceRoot = path.join(os.tmpdir(), 'test-workspace');
  const workspaceId = 'test-workspace-id';
  const workspaceDataPath = path.join(workspaceRoot, '.nx', 'workspace-data');

  const config = {
    awsAccessKeyId: 'minio',
    awsSecretAccessKey: 'minio123',
    awsBucket: 'test',
    awsEndpoint: 'http://127.0.0.1:9000',
    awsForcePathStyle: true,
    awsRegion: 'us-east-1',
  };

  beforeEach(() => {
    // Create workspace data directory
    if (fs.existsSync(workspaceRoot)) {
      fs.rmSync(workspaceRoot, { recursive: true, force: true });
    }
    fs.mkdirSync(workspaceDataPath, { recursive: true });
  });

  afterEach(() => {
    jest.resetAllMocks();
    s3Mock.reset();
    if (fs.existsSync(workspaceRoot)) {
      fs.rmSync(workspaceRoot, { recursive: true, force: true });
    }
  });

  it('Should sync database files from S3', async () => {
    awsCache = new AwsCache(config, new MessageReporter(new Logger()));

    // Create a temporary test file to use as database content
    // Use a unique temp file that won't conflict
    const testDbFile = path.join(os.tmpdir(), `test-db-sync-${Date.now()}-${Math.random()}.txt`);
    fs.writeFileSync(testDbFile, 'test database content');

    try {
      const dbStream = sdkStreamMixin(fs.createReadStream(testDbFile));

      // Mock HeadObjectCommand to indicate file exists
      s3Mock.on(HeadObjectCommand).resolves({});
      // Mock GetObjectCommand to return database file
      s3Mock.on(GetObjectCommand).resolves({ Body: dbStream });

      await awsCache.syncDatabaseFiles(workspaceRoot, workspaceId);

      // Verify that database file was downloaded (or at least attempted)
      // Note: The actual file content depends on what we mock
      expect(s3Mock.calls().length).toBeGreaterThan(0);
    } finally {
      // Clean up test file
      if (fs.existsSync(testDbFile)) {
        fs.unlinkSync(testDbFile);
      }
    }
  });

  it('Should upload database files to S3', async () => {
    awsCache = new AwsCache(config, new MessageReporter(new Logger()));

    // Create a test database file
    const dbFilePath = path.join(workspaceDataPath, `${workspaceId}.db`);
    fs.writeFileSync(dbFilePath, 'test database content');

    // Mock PutObjectCommand for upload
    s3Mock.on(PutObjectCommand).resolves({});

    await awsCache.uploadDatabaseFiles(workspaceRoot, workspaceId);

    // Verify that upload was attempted by checking if PutObjectCommand was called
    const putCalls = s3Mock.calls().filter((call) => call.args[0] instanceof PutObjectCommand);
    expect(putCalls.length).toBeGreaterThan(0);
  });

  it('Should use workspace context when uploading without parameters', async () => {
    awsCache = new AwsCache(config, new MessageReporter(new Logger()));

    // Set workspace context
    awsCache.setWorkspaceContext(workspaceRoot, workspaceId);

    // Create a test database file
    const dbFilePath = path.join(workspaceDataPath, `${workspaceId}.db`);
    fs.writeFileSync(dbFilePath, 'test database content');

    // Mock PutObjectCommand for upload
    s3Mock.on(PutObjectCommand).resolves({});

    // Upload without parameters - should use context
    await awsCache.uploadDatabaseFiles();

    // Verify that upload was attempted by checking if PutObjectCommand was called
    const putCalls = s3Mock.calls().filter((call) => call.args[0] instanceof PutObjectCommand);
    expect(putCalls.length).toBeGreaterThan(0);
  });

  it('Should skip database upload if workspace context is not set', async () => {
    awsCache = new AwsCache(config, new MessageReporter(new Logger()));

    // Don't set workspace context
    // Mock PutObjectCommand for upload
    s3Mock.on(PutObjectCommand).resolves({});

    // Upload without parameters and without context
    await awsCache.uploadDatabaseFiles();

    // Verify that no upload was attempted by checking if PutObjectCommand was called
    const putCalls = s3Mock.calls().filter((call) => call.args[0] instanceof PutObjectCommand);
    expect(putCalls.length).toBe(0);
  });

  it('Should handle missing database files gracefully', async () => {
    awsCache = new AwsCache(config, new MessageReporter(new Logger()));

    // Mock HeadObjectCommand to return NotFound
    s3Mock.on(HeadObjectCommand).rejects({ name: 'NotFound' });

    // Should not throw
    await expect(awsCache.syncDatabaseFiles(workspaceRoot, workspaceId)).resolves.not.toThrow();
  });

  it('Should handle missing local database files when uploading', async () => {
    awsCache = new AwsCache(config, new MessageReporter(new Logger()));

    // Don't create any database files
    // Mock PutObjectCommand for upload
    s3Mock.on(PutObjectCommand).resolves({});

    await awsCache.uploadDatabaseFiles(workspaceRoot, workspaceId);

    // Should not throw, but also should not upload anything
    // (since no files exist)
    const putCalls = s3Mock.calls().filter((call) => call.args[0] instanceof PutObjectCommand);
    expect(putCalls.length).toBe(0);
  });
});
