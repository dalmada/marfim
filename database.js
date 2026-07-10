const fs = require('fs').promises;
const path = require('path');

const dbPath = path.join(__dirname, 'database.json');

async function getDB() {
    try {
        const data = await fs.readFile(dbPath, 'utf8');
        return JSON.parse(data);
    } catch (err) {
        return { users: [], messages: [] };
    }
}

async function saveDB(db) {
    await fs.writeFile(dbPath, JSON.stringify(db, null, 2), 'utf8');
}

module.exports = {
    async saveUser(phone, name) {
        const db = await getDB();
        const user = db.users.find(u => u.phone === phone);
        if (user) {
            user.name = name;
        } else {
            db.users.push({ phone, name });
        }
        await saveDB(db);
    },
    async getMessages(phone, agent_id) {
        const db = await getDB();
        return db.messages
            .filter(m => m.phone === phone && m.agent_id === agent_id)
            .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
    },
    async saveMessage(msg) {
        const db = await getDB();
        msg.timestamp = msg.timestamp || new Date().toISOString();
        db.messages.push(msg);
        await saveDB(db);
    }
};
