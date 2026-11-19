/** Container images by the service the profile names for them. */
const SERVICES: [RegExp, string][] = [
  [/(^|\/)(postgres|postgis)/, 'postgres'],
  [/(^|\/)(mysql|mariadb)/, 'mysql'],
  [/(^|\/)(redis|valkey)/, 'redis'],
  [/(^|\/)mongo/, 'mongo'],
  [/kafka|redpanda/, 'kafka'],
  [/elasticsearch|opensearch/, 'elasticsearch'],
  [/(^|\/)rabbitmq/, 'rabbitmq'],
  [/(^|\/)memcached/, 'memcached'],
  [/localstack/, 'localstack'],
  [/(^|\/)minio/, 'minio'],
];

/** The service a container image runs (`postgres:16-alpine` → `postgres`), or undefined for any other image. */
export function imageService(image: string): string | undefined {
  const name = image.toLowerCase();
  return SERVICES.find(([re]) => re.test(name))?.[1];
}
