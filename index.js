const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const axios = require('axios');
const path = require('path');
const dbPromise = require('./database');

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
        id: "vera",
        name: "Vera Anti-Golpes",
        role: "Orientador Anti-Golpes",
        avatar: "assets/vera-antigolpes.png",
        instanceName: "VERA-ANTIGOLPES",
        webhookUrl: "https://n8n.dalmada.eu/webhook/vera-homolog" // Webhook no n8n
    },
    {
        id: "vera",
        name: "Vera Anti-Golpes",
        role: "Orientador Anti-Golpes",
        avatar: "assets/vera-antigolpes.png",
        instanceName: "VERA-ANTIGOLPES",
        webhookUrl: "https://n8n.dalmada.eu/webhook/vera-homolog" // Pode ser o mesmo ou diferente
    },
    {
        id: "vera",
        name: "Vera Anti-Golpes",
        role: "Orientador Anti-Golpes",
        avatar: "assets/vera-antigolpes.png",
        instanceName: "VERA-ANTIGOLPES",
        webhookUrl: "https://n8n.dalmada.eu/webhook/vera-homolog"
    }
];

// --- Rota da API para Login ---
app.post('/api/login', async (req, res) => {
    try {
        const { phone, name } = req.body;
        if (!phone || !name) {
            return res.status(400).json({ error: 'Phone and name are required' });
        }
        
        const db = await dbPromise;
        await db.run(
            `INSERT INTO users (phone, name) VALUES (?, ?)
             ON CONFLICT(phone) DO UPDATE SET name=excluded.name`,
            [phone, name]
        );
        res.json({ success: true, phone, name });
    } catch (err) {
        console.error('Erro no login:', err);
        res.status(500).json({ error: 'Erro no servidor' });
    }
});

// --- Rota da API para Histórico de Mensagens ---
app.get('/api/messages/:phone/:agentId', async (req, res) => {
    try {
        const { phone, agentId } = req.params;
        const db = await dbPromise;
        const messages = await db.all(
            `SELECT * FROM messages WHERE phone = ? AND agent_id = ? ORDER BY timestamp ASC`,
            [phone, agentId]
        );
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
            const db = await dbPromise;
            const msgId = `msg_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
            const agent = agents.find(a => a.instanceName === instance);
            const agentId = agent ? agent.id : instance;

            await db.run(
                `INSERT INTO messages (id, phone, agent_id, sender_type, message_type, content) VALUES (?, ?, ?, ?, ?, ?)`,
                [msgId, number, agentId, 'agent', 'text', typeof textMessage === 'object' ? JSON.stringify(textMessage) : textMessage]
            );
        } catch (err) {
            console.error('Erro ao salvar mensagem do agente:', err);
        }

        io.to(`${instance}_${number}`).emit('agent_message', { type: 'text', content: textMessage || req.body });
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
            const db = await dbPromise;
            const msgId = `msg_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
            const agent = agents.find(a => a.instanceName === instance);
            const agentId = agent ? agent.id : instance;

            await db.run(
                `INSERT INTO messages (id, phone, agent_id, sender_type, message_type, content) VALUES (?, ?, ?, ?, ?, ?)`,
                [msgId, number, agentId, 'agent', 'audio', audioData]
            );
        } catch (err) {
            console.error('Erro ao salvar mensagem do agente (áudio):', err);
        }

        io.to(`${instance}_${number}`).emit('agent_message', { type: 'audio', content: audioData, originalBody: req.body });
    } else {
        io.emit('agent_message', { type: 'audio', content: audioData, originalBody: req.body });
    }

    res.json({ success: true, message: "Audio sent successfully" });
});

// --- Rota Mock para a Evolution API: Get Media Base64 (usado para o whisper transcriber) ---
app.post(['/chat/getBase64FromMediaMessage/:instance', '/chat-api/get-media-base64/:instance', '/chat-api/get-media-base64'], (req, res) => {
    let msgId = null;
    
    // Tenta extrair o ID da mensagem do body enviado pelo n8n
    if (req.body && req.body.message && req.body.message.key) {
        msgId = req.body.message.key.id;
    } else if (req.body && req.body.key) {
        msgId = req.body.key.id;
    }

    if (msgId && mediaCache.has(msgId)) {
        console.log(`[Mock Evolution] Retornando áudio real para a mensagem ${msgId}`);
        res.json({ base64: mediaCache.get(msgId) });
    } else {
        console.log(`[Mock Evolution] Áudio não encontrado no cache. Retornando áudio mudo fallback.`);
        res.json({ base64: "UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YQAAAAA=" }); // base64 audio mudo mínimo
    }
});

// --- Rota para enganar a validação de credencial do n8n ---
app.get(['/instance/fetchInstances'], (req, res) => {
    console.log(`[Mock Evolution] Validação de credencial recebida.`);
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
        console.log(`[Mock Evolution] Rota acessada: ${req.method} ${req.url}`);
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
            console.error('Agente não encontrado ou ID não fornecido:', data.agentId);
            return socket.emit('message_sent', { success: false, error: "Agente não encontrado." });
        }

        if (!data.userPhone || !data.userName) {
            return socket.emit('message_sent', { success: false, error: "Usuário não autenticado." });
        }

        console.log(`Mensagem recebida para o agente ${agent.name} (${agent.instanceName}) de ${data.userPhone}:`, data);

        try {
            const msgId = `msg_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

            if (data.audioBase64) {
                mediaCache.set(msgId, data.audioBase64);
                setTimeout(() => mediaCache.delete(msgId), 10 * 60 * 1000);
            }

            // Salva a mensagem no banco de dados
            const db = await dbPromise;
            await db.run(
                `INSERT INTO messages (id, phone, agent_id, sender_type, message_type, content) VALUES (?, ?, ?, ?, ?, ?)`,
                [msgId, data.userPhone, agent.id, 'user', data.audioBase64 ? 'audio' : 'text', data.audioBase64 || data.text]
            );

            // Montar payload simulando o evento 'messages.upsert' da Evolution API
            const webhookPayload = {
                event: "messages.upsert", 
                instance: agent.instanceName,
                server_url: `https://app.marfim.org`, 
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

            // Enviar para o Webhook específico deste Agente no n8n
            console.log(`[Web Chat -> n8n] Enviando para: ${agent.webhookUrl}`);
            const response = await axios.post(agent.webhookUrl, webhookPayload);
            console.log('[Web Chat -> n8n] Resposta do Webhook:', response.status);

            socket.emit('message_sent', { success: true });

        } catch (error) {
            console.error('[Web Chat -> n8n] Erro ao chamar Webhook do n8n:', error.message);
            socket.emit('message_sent', { success: false, error: error.message });
        }
    });

    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`✅ Web Chat Server rodando em http://localhost:${PORT}`);
    console.log(`🔧 Servindo interface Multi-Agentes na porta ${PORT}`);
});
