const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const axios = require('axios');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: '*' }
});

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// --- Configuração dos Agentes ---
// Você pode adicionar quantos agentes quiser aqui.
// O "instanceName" é o que o n8n vai receber para saber com qual agente você está falando.
const agents = [
    {
        id: "vera",
        name: "Vera Antigolpes",
        role: "Orientador Anti-Golpes",
        avatar: "assets/vera-antigolpes.png",
        instanceName: "VERA-ANTIGOLPES",
        webhookUrl: "https://n8n.dalmada.eu/webhook/vera-homolog" // Webhook no n8n
    },
    {
        id: "suporte",
        name: "Suporte Técnico",
        role: "Atendimento ao cliente",
        avatar: "https://ui-avatars.com/api/?name=Suporte&background=E53E3E&color=fff",
        instanceName: "SUPORTE_INSTANCE",
        webhookUrl: "https://n8n.dalmada.eu/webhook/chatway-testando" // Pode ser o mesmo ou diferente
    },
    {
        id: "marfim",
        name: "ChatWay Bot",
        role: "Assistente de Demonstração",
        avatar: "https://ui-avatars.com/api/?name=ChatWay&background=10b981&color=fff",
        instanceName: "TEST_INSTANCE",
        webhookUrl: "https://n8n.dalmada.eu/webhook/chatway-testando"
    }
];

const PHONE_NUMBER = '5511999999999'; // Número fictício simulado

// --- Rota da API para o Frontend pegar a lista de agentes ---
app.get('/api/agents', (req, res) => {
    res.json(agents);
});

// --- Rota Mock para a Evolution API: Enviar Texto ---
app.post(['/message/sendText/:instance', '/messages-api/send-text/:instance', '/messages-api/send-text'], (req, res) => {
    const instance = req.params.instance;
    const textMessage = req.body.text || (req.body.options && req.body.options.text) || req.body.messageText || (req.body.message && req.body.message.text);

    console.log(`[Mock Evolution] Mensagem de TEXTO recebida do n8n para a instância: ${instance}`);

    if (instance) {
        // Envia apenas para o usuário que está na sala dessa instância
        io.to(instance).emit('agent_message', { type: 'text', content: textMessage || req.body });
    } else {
        io.emit('agent_message', { type: 'text', content: textMessage || req.body });
    }

    res.json({ success: true, message: "Message sent successfully" });
});

// --- Rota Mock para a Evolution API: Enviar Áudio ---
app.post(['/message/sendWhatsAppAudio/:instance', '/messages-api/send-audio/:instance', '/messages-api/send-audio'], (req, res) => {
    const instance = req.params.instance;
    const audioData = req.body.audio || req.body.media || req.body.base64;

    console.log(`[Mock Evolution] Mensagem de ÁUDIO recebida do n8n para a instância: ${instance}`);

    if (instance) {
        io.to(instance).emit('agent_message', { type: 'audio', content: audioData, originalBody: req.body });
    } else {
        io.emit('agent_message', { type: 'audio', content: audioData, originalBody: req.body });
    }

    res.json({ success: true, message: "Audio sent successfully" });
});

// --- Rota Mock para a Evolution API: Get Media Base64 (usado para o whisper transcriber) ---
app.post(['/chat/getBase64FromMediaMessage/:instance', '/chat-api/get-media-base64/:instance', '/chat-api/get-media-base64'], (req, res) => {
    res.json({ base64: "UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YQAAAAA=" }); // base64 audio mudo mínimo
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

    // Se a array estiver vazia por algum motivo
    if (instancesList.length === 0) {
        instancesList.push({ instance: { instanceName: "DEFAULT", status: "open" } });
    }

    res.json(instancesList);
});

// --- Catch-all para outras chamadas (presence, read-messages, etc) ---
app.use((req, res) => {
    if (!req.url.startsWith('/socket.io')) {
        console.log(`[Mock Evolution] Rota acessada: ${req.method} ${req.url}`);
        res.json({ success: true, message: "Mocked response" });
    }
});


// --- Configuração Socket.io para o Web Chat ---
io.on('connection', (socket) => {
    console.log('User connected to Web Chat:', socket.id);

    // Quando o usuário abrir o chat de um agente específico, ele entra na "sala" daquela instância
    socket.on('join_agent', (data) => {
        if (data && data.instanceName) {
            socket.join(data.instanceName);
            console.log(`Socket ${socket.id} entrou na sala da instância: ${data.instanceName}`);
        }
    });

    // Quando o usuário enviar uma mensagem do frontend
    socket.on('user_message', async (data) => {
        // Precisamos encontrar qual agente o usuário está falando
        const agent = agents.find(a => a.id === data.agentId);

        if (!agent) {
            console.error('Agente não encontrado ou ID não fornecido:', data.agentId);
            return socket.emit('message_sent', { success: false, error: "Agente não encontrado." });
        }

        console.log(`Mensagem recebida para o agente ${agent.name} (${agent.instanceName}):`, data);

        try {
            // Montar payload simulando o evento 'messages.upsert' da Evolution API
            const webhookPayload = {
                instance: agent.instanceName,
                server_url: `https://app.marfim.org`, // URL fixa da hostinger para os retornos no n8n
                data: {
                    key: {
                        id: `msg_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
                        remoteJid: `${PHONE_NUMBER}@s.whatsapp.net`,
                        fromMe: false
                    },
                    pushName: "Test User Web",
                    messageTimestamp: Math.floor(Date.now() / 1000),
                    message: {
                        conversation: data.text || "",
                        // Se for áudio:
                        ...(data.audioBase64 ? {
                            audioMessage: {
                                ptt: true, // Indica que é áudio gravado (voice note)
                                url: "",
                                mimetype: "audio/ogg; codecs=opus"
                            }
                        } : {})
                    }
                }
            };

            // Enviar para o Webhook específico deste Agente no n8n
            console.log(`[Web Chat -> n8n] Enviando para: ${agent.webhookUrl}`);
            const response = await axios.post(agent.webhookUrl, webhookPayload);
            console.log('[Web Chat -> n8n] Resposta do Webhook:', response.status);

            // Confirmação para o frontend
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
