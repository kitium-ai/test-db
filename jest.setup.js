import { initializeLogger } from '@kitiumai/logger';

// Initialize logger for tests
try {
  initializeLogger();
} catch (e) {
  // Logger might already be initialized
}
