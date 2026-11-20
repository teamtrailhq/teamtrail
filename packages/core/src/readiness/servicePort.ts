/** The port a service listens on by default, by the name the repo profile gives it. */
const PORTS: Record<string, number> = {
  postgres: 5432,
  mysql: 3306,
  redis: 6379,
  mongo: 27017,
  kafka: 9092,
  elasticsearch: 9200,
  rabbitmq: 5672,
  memcached: 11211,
  localstack: 4566,
  minio: 9000,
};

/** The default port of a service the profile names (`postgres` → 5432); undefined for one it has none for. */
export function servicePort(name: string): number | undefined {
  return Object.hasOwn(PORTS, name) ? PORTS[name] : undefined;
}
