import { Logger } from './types.js';

export const defaultLogger: Logger = {
  info(message, meta) {
    console.log(JSON.stringify({ level: 'info', message, ...(meta ? { meta } : {}) }));
  },
  warn(message, meta) {
    console.warn(JSON.stringify({ level: 'warn', message, ...(meta ? { meta } : {}) }));
  },
  error(message, meta) {
    const err = message instanceof Error ? message.message : message;
    console.error(JSON.stringify({ level: 'error', message: err, ...(meta ? { meta } : {}) }));
  }
};
