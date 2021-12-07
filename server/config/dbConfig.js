let pe = process.env;

module.exports = {
    dbName: pe.MONGODB_NAME || 'admin',
    host: pe.MONGODB_HOST || '127.0.0.1',
    port: pe.MONGODB_PORT || 27017,
    username: pe.MONGODB_USERNAME || 'root',
    password: pe.MONGODB_PASSWORD || '123456'
};
