import { createService } from './createService';
import { loadConfig } from './loadConfig';
import { log } from './log';
import { MemoryStore } from './store/MemoryStore';
import { PostgresStore } from './store/PostgresStore';

/** Starts the Scout service from its environment (see README.md). */
async function main() {
  const config = loadConfig(process.env);
  const store = config.databaseUrl ? await PostgresStore.open(config.databaseUrl) : new MemoryStore();
  const service = createService({ config, store });
  service.server.listen(config.port, () => log('listening', { port: config.port, memory: !config.databaseUrl }));
  const stop = () => {
    log('stopping');
    void service.close().then(() => process.exit(0));
  };
  process.on('SIGTERM', stop);
  process.on('SIGINT', stop);
}

main().catch((e: unknown) => {
  log('start.failed', { error: e instanceof Error ? e.message : 'unknown' });
  process.exit(1);
});
