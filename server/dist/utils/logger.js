import winston from 'winston';
import path from 'path';
const isDevelopment = process.env.NODE_ENV !== 'production';
const logFormat = winston.format.combine(winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }), winston.format.printf(({ level, message, timestamp }) => {
    return `[${timestamp}] [${level.toUpperCase()}]: ${message}`;
}));
const transports = [
    new winston.transports.File({
        filename: path.join(process.cwd(), 'logs', 'error.log'),
        level: 'error',
        maxsize: 5242880,
        maxFiles: 5,
    }),
    new winston.transports.File({
        filename: path.join(process.cwd(), 'logs', 'app.log'),
        maxsize: 5242880,
        maxFiles: 5,
    }),
];
if (isDevelopment) {
    transports.push(new winston.transports.Console({
        format: winston.format.combine(winston.format.colorize(), logFormat),
    }));
}
export const logger = winston.createLogger({
    level: isDevelopment ? 'debug' : 'info',
    format: logFormat,
    transports,
    exitOnError: false,
});
export default logger;
//# sourceMappingURL=logger.js.map