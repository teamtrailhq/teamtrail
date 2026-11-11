/**
 * The address the Lookout prints and opens: always `http://127.0.0.1:<port>/`, never `localhost`. A browser may
 * resolve `localhost` to `::1` first, so a name could lead it to another address than the one handed out; an IP
 * address is exactly one socket, which the Lookout holds (listen.ts). Whatever `--host` it also listens on, this
 * machine's own browser comes from loopback and is treated as this machine.
 */
export const lookoutUrl = (port: number) => `http://127.0.0.1:${port}/`;
