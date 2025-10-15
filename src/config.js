// @ts-check

export const APP_PORT = parseInt(process.env.PORT || '', 10);
export const DB_HOST = process.env.DB_HOST;
export const DB_PORT = parseInt(process.env.DB_PORT || '', 10);
export const DB_USER = process.env.DB_USER;
export const DB_PASSWORD = process.env.DB_PASSWORD;
export const DB_NAME = process.env.DB_NAME;
export const DB_DIALECT = process.env.DB_DIALECT;
export const SOCIAL_MEDIA_API_KEY = process.env.SOCIAL_MEDIA_API_KEY;
export const SOCIAL_MEDIA_API_URL = process.env.SOCIAL_MEDIA_API_URL;
export const SOCIAL_MEDIA_API_HISTORY_LAST_DAYS = process.env.SOCIAL_MEDIA_API_HISTORY_LAST_DAYS;
export const JWT_SECRET = process.env.JWT_SECRET;
export const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN;
