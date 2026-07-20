require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const axios = require('axios');
const path = require('path');
const database = require('./database');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: '*' }
});

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Cache temporário para áudios enviados (para a rota getBase64FromMediaMessage)
const mediaCache = new Map();

// --- Configuração dos Agentes ---
const agents = [
    {
        id: "vera-pt",
        name: "🇧🇷 Vera Anti-Golpes",
        role: "Orientador Anti-Golpes",
        avatar: "assets/vera-antigolpes.png",
        instanceName: "VERA-ANTIGOLPES-PT",
        webhookUrl: "https://n8n.dalmada.eu/webhook/vera-homolog" // Webhook no n8n
    },
    {
        id: "vera-en",
        name: "🇬🇧 Vera Anti-Scam",
        role: "Anti-Scam Advisor",
        avatar: "assets/vera-antigolpes.png",
        instanceName: "VERA-ANTIGOLPES-EN",
        webhookUrl: "https://n8n.dalmada.eu/webhook/vera-homolog" // Webhook no n8n
    },
    {
        id: "nati",
        name: "Nati - Consultora Nutricional",
        role: "Consultora Nutricional",
        avatar: "assets/nati.webp",
        instanceName: "NATI-CONSULTORA",
        webhookUrl: "https://n8n.dalmada.eu/webhook/nati-homolog" // Webhook no n8n
    },
    {
        id: "luma",
        name: "Luma - Aconselhadora emocional",
        role: "Aconselhadora emocional",
        avatar: "assets/luma.webp",
        instanceName: "LUMA-ACONSELHADORA",
        webhookUrl: "https://n8n.dalmada.eu/webhook/luma-homolog" // Webhook no n8n
    },
    {
        id: "meca",
        name: "Meca - Orientador Veicular",
        role: "Orientador Veicular",
        avatar: "assets/meca.png",
        instanceName: "MECA-ORIENTADOR",
        webhookUrl: "https://n8n.dalmada.eu/webhook/meca-homolog" // Webhook no n8n
    },
    {
        id: "bete",
        name: "Bete - Apoio pedagógico",
        role: "Apoio pedagógico",
        avatar: "assets/bete.webp",
        instanceName: "BETE-PEDAGOGA",
        webhookUrl: "https://n8n.dalmada.eu/webhook/bete-homolog"
    }
];

// --- Rota da API para Login ---
app.post('/api/login', async (req, res) => {
    try {
        const { phone, name } = req.body;
        if (!phone || !name) {
            return res.status(400).json({ error: 'Phone and name are required' });
        }

        await database.saveUser(phone, name);
        res.json({ success: true, phone, name });
    } catch (err) {
        console.error('Erro no login:', err);
        res.status(500).json({ error: err.message || JSON.stringify(err) });
    }
});

// --- Rota da API para Histórico de Mensagens ---
app.get('/api/messages/:phone/:agentId', async (req, res) => {
    try {
        const { phone, agentId } = req.params;
        const messages = await database.getMessages(phone, agentId);
        res.json(messages);
    } catch (err) {
        console.error('Erro ao buscar mensagens:', err);
        res.status(500).json({ error: 'Erro no servidor' });
    }
});

// --- Rota da API para o Frontend pegar a lista de agentes ---
app.get('/api/agents', (req, res) => {
    res.json(agents);
});

// --- Rota Mock para a Evolution API: Enviar Texto ---
app.post(['/message/sendText/:instance', '/messages-api/send-text/:instance', '/messages-api/send-text'], async (req, res) => {
    const instance = req.params.instance;
    const textMessage = req.body.text || (req.body.options && req.body.options.text) || req.body.messageText || (req.body.message && req.body.message.text);

    // Tenta descobrir o destinatário a partir do payload que o n8n envia
    let number = req.body.number || req.body.remoteJid || req.body.jid;
    if (number && number.includes('@')) {
        number = number.split('@')[0];
    }

    console.log(`[Mock Evolution] Mensagem de TEXTO recebida do n8n para a instância: ${instance}, destino: ${number}`);

    if (number) {
        try {
            const msgId = `msg_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
            const agent = agents.find(a => a.instanceName.toLowerCase() === instance.toLowerCase() || a.id.toLowerCase() === instance.toLowerCase());
            const agentId = agent ? agent.id : instance;
            const emitInstance = agent ? agent.instanceName : instance;

            await database.saveMessage({
                id: msgId,
                phone: number,
                agent_id: agentId,
                sender_type: 'agent',
                message_type: 'text',
                content: typeof textMessage === 'object' ? JSON.stringify(textMessage) : textMessage
            });
        } catch (err) {
            console.error('Erro ao salvar mensagem do agente:', err);
        }

        io.to(`${(agents.find(a => a.instanceName.toLowerCase() === instance.toLowerCase() || a.id.toLowerCase() === instance.toLowerCase()) || { instanceName: instance }).instanceName}_${number}`).emit('agent_message', { type: 'text', content: textMessage || req.body });
    } else {
        io.emit('agent_message', { type: 'text', content: textMessage || req.body });
    }

    res.json({ success: true, message: "Message sent successfully" });
});

// --- Rota Mock para a Evolution API: Enviar Áudio ---
app.post(['/message/sendWhatsAppAudio/:instance', '/messages-api/send-audio/:instance', '/messages-api/send-audio'], async (req, res) => {
    const instance = req.params.instance;
    const audioData = req.body.audio || req.body.media || req.body.base64;

    let number = req.body.number || req.body.remoteJid || req.body.jid;
    if (number && number.includes('@')) {
        number = number.split('@')[0];
    }

    console.log(`[Mock Evolution] Mensagem de ÁUDIO recebida do n8n para a instância: ${instance}, destino: ${number}`);

    if (number) {
        try {
            const msgId = `msg_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
            const agent = agents.find(a => a.instanceName.toLowerCase() === instance.toLowerCase() || a.id.toLowerCase() === instance.toLowerCase());
            const agentId = agent ? agent.id : instance;

            await database.saveMessage({
                id: msgId,
                phone: number,
                agent_id: agentId,
                sender_type: 'agent',
                message_type: 'audio',
                content: audioData
            });
        } catch (err) {
            console.error('Erro ao salvar mensagem do agente (áudio):', err);
        }

        io.to(`${(agents.find(a => a.instanceName.toLowerCase() === instance.toLowerCase() || a.id.toLowerCase() === instance.toLowerCase()) || { instanceName: instance }).instanceName}_${number}`).emit('agent_message', { type: 'audio', content: audioData, originalBody: req.body });
    } else {
        io.emit('agent_message', { type: 'audio', content: audioData, originalBody: req.body });
    }

    res.json({ success: true, message: "Audio sent successfully" });
});

// --- Rota Mock para a Evolution API: Get Media Base64 (usado para o whisper transcriber) ---
app.post(['/chat/getBase64FromMediaMessage/:instance', '/chat-api/get-media-base64/:instance', '/chat-api/get-media-base64'], (req, res) => {
    let msgId = null;

    if (req.body && req.body.message && req.body.message.key) {
        msgId = req.body.message.key.id;
    } else if (req.body && req.body.key) {
        msgId = req.body.key.id;
    }

    if (msgId && mediaCache.has(msgId)) {
        res.json({ base64: mediaCache.get(msgId) });
    } else {
        res.json({ base64: "UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YQAAAAA=" }); // base64 audio mudo mínimo
    }
});

// --- Rota para enganar a validação de credencial do n8n ---
app.get(['/instance/fetchInstances'], (req, res) => {
    const instancesList = agents.map(agent => ({
        instance: {
            instanceName: agent.instanceName,
            status: "open"
        }
    }));

    if (instancesList.length === 0) {
        instancesList.push({ instance: { instanceName: "DEFAULT", status: "open" } });
    }

    res.json(instancesList);
});

// --- Catch-all para outras chamadas ---
app.use((req, res) => {
    if (!req.url.startsWith('/socket.io')) {
        res.json({ success: true, message: "Mocked response" });
    }
});

// --- Configuração Socket.io para o Web Chat ---
io.on('connection', (socket) => {
    console.log('User connected to Web Chat:', socket.id);

    socket.on('join_agent', (data) => {
        if (data && data.instanceName && data.userPhone) {
            const roomName = `${data.instanceName}_${data.userPhone}`;
            socket.join(roomName);
            console.log(`Socket ${socket.id} entrou na sala: ${roomName}`);
        }
    });

    socket.on('user_message', async (data) => {
        const agent = agents.find(a => a.id === data.agentId);

        if (!agent) {
            return socket.emit('message_sent', { success: false, error: "Agente não encontrado." });
        }

        if (!data.userPhone || !data.userName) {
            return socket.emit('message_sent', { success: false, error: "Usuário não autenticado." });
        }

        try {
            const msgId = `msg_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

            if (data.audioBase64) {
                mediaCache.set(msgId, data.audioBase64);
                setTimeout(() => mediaCache.delete(msgId), 10 * 60 * 1000);
            }

            // Salva a mensagem
            await database.saveMessage({
                id: msgId,
                phone: data.userPhone,
                agent_id: agent.id,
                sender_type: 'user',
                message_type: data.audioBase64 ? 'audio' : 'text',
                content: data.audioBase64 || data.text
            });

            // Montar payload
            const host = socket.handshake.headers.host || 'app.marfim.org';
            const protocol = socket.handshake.headers['x-forwarded-proto'] || (host.includes('localhost') ? 'http' : 'https');
            const dynamicServerUrl = `${protocol}://${host}`;

            const webhookPayload = {
                event: "messages.upsert",
                instance: agent.instanceName,
                server_url: dynamicServerUrl,
                data: {
                    key: {
                        id: msgId,
                        remoteJid: `${data.userPhone}@s.whatsapp.net`,
                        fromMe: false
                    },
                    pushName: data.userName,
                    messageTimestamp: Math.floor(Date.now() / 1000),
                    messageType: data.audioBase64 ? "audioMessage" : "conversation",
                    message: data.audioBase64 ? {
                        audioMessage: {
                            ptt: true,
                            url: "",
                            mimetype: data.mimeType || "audio/ogg; codecs=opus",
                            base64: data.audioBase64
                        },
                        base64: data.audioBase64
                    } : {
                        conversation: data.text || ""
                    }
                }
            };

            const response = await axios.post(agent.webhookUrl, webhookPayload);
            socket.emit('message_sent', { success: true });

        } catch (error) {
            console.error('[Web Chat -> n8n] Erro ao chamar Webhook:', error.message);
            socket.emit('message_sent', { success: false, error: error.message });
        }
    });

    socket.on('disconnect', () => { });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`✅ Web Chat Server rodando em http://localhost:${PORT}`);
    console.log(`🔧 Usando JSON Database local para histórico.`);
});
