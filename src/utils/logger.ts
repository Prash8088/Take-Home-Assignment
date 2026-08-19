import pino from 'pino';
const level = process.env.NODE_ENV === 'test' ? 'silent' : process.env.NODE_ENV === 'production' ? 'info' : 'debug';
export const logger = pino({ level, redact:['req.headers.authorization'] });
