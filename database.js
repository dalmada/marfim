const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const path = require('path');

const dbPromise = open({
    filename: path.join(__dirname, 'database.sqlite'),
    driver: sqlite3.Database
}).then(async (db) => {
    await db.exec(`
        CREATE TABLE IF NOT EXISTS users (
            phone TEXT PRIMARY KEY,
            name TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS messages (
            id TEXT PRIMARY KEY,
            phone TEXT NOT NULL,
            agent_id TEXT NOT NULL,
            sender_type TEXT NOT NULL, -- 'user' or 'agent'
            message_type TEXT NOT NULL, -- 'text' or 'audio'
            content TEXT NOT NULL,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
        );
    `);
    console.log('✅ SQLite Database initialized.');
    return db;
}).catch(err => {
    console.error('❌ Failed to initialize SQLite Database:', err);
    throw err;
});

module.exports = dbPromise;
