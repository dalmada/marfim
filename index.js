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

// URL do Webhook do n8n (pode ser ajustada via variável de ambiente)
// Substitua pelo IP/URL correto se o n8n não estiver rodando no mesmo localhost ou na mesma porta
const N8N_WEBHOOK_URL = process.env.N8N_WEBHOOK_URL || 'https://n8n.dalmada.eu/webhook/d56367ef-6196-4b87-8c29-d469a9988d6c';
const INSTANCE_NAME = 'TEST_INSTANCE';
const PHONE_NUMBER = '5511999999999'; // Número fictício simulado

// --- Rota Mock para a Evolution API: Enviar Texto ---
app.post(['/message/sendText/:instance', '/messages-api/send-text/:instance', '/messages-api/send-text'], (req, res) => {
    // A Evolution API geralmente recebe no body: { number: "...", text: "..." } ou { remoteJid: "...", messageText: "..." }
    const textMessage = req.body.text || (req.body.options && req.body.options.text) || req.body.messageText || (req.body.message && req.body.message.text);

    console.log(`[Mock Evolution] Mensagem de TEXTO recebida do n8n:`, textMessage || req.body);

    // Enviar para o Frontend via Socket.io
    io.emit('agent_message', {
        type: 'text',
        content: textMessage || req.body
    });

    res.json({ success: true, message: "Message sent successfully" });
});

// --- Rota Mock para a Evolution API: Enviar Áudio ---
app.post(['/message/sendWhatsAppAudio/:instance', '/messages-api/send-audio/:instance', '/messages-api/send-audio'], (req, res) => {
    // O n8n vai mandar a mídia base64 (geralmente num campo media, audio, base64)
    const audioData = req.body.audio || req.body.media || req.body.base64;

    console.log(`[Mock Evolution] Mensagem de ÁUDIO recebida do n8n.`);

    io.emit('agent_message', {
        type: 'audio',
        content: audioData, // base64
        originalBody: req.body
    });

    res.json({ success: true, message: "Audio sent successfully" });
});

// --- Rota Mock para a Evolution API: Get Media Base64 (usado para o whisper transcriber) ---
app.post(['/chat/getBase64FromMediaMessage/:instance', '/chat-api/get-media-base64/:instance', '/chat-api/get-media-base64'], (req, res) => {
    console.log(`[Mock Evolution] Requisição para converter mídia em base64.`);

    // Simulação: devolveremos uma base64 fictícia ou a base64 real armazenada temporariamente na memória, 
    // mas se for gravação do navegador, o webhook do n8n não enviou áudio na chave url, 
    // teríamos que interceptar melhor. Por hora, simulamos.

    res.json({ base64: "UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YQAAAAA=" }); // base64 audio mudo mínimo
});

// --- Rota para enganar a validação de credencial do n8n ---
app.get(['/instance/fetchInstances'], (req, res) => {
    console.log(`[Mock Evolution] Validação de credencial recebida.`);
    res.json([
        {
            instance: {
                instanceName: INSTANCE_NAME,
                status: "open"
            }
        }
    ]);
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

    // Quando o usuário enviar uma mensagem do frontend
    socket.on('user_message', async (data) => {
        console.log('Mensagem do usuário recebida via web:', data);

        try {
            // Montar payload simulando o evento 'messages.upsert' da Evolution API
            const webhookPayload = {
                instance: INSTANCE_NAME,
                server_url: `http://localhost:${PORT}`, // URL do nosso mock
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

            // Enviar para o n8n
            console.log(`[Web Chat -> n8n] Enviando para: ${N8N_WEBHOOK_URL}`);
            const response = await axios.post(N8N_WEBHOOK_URL, webhookPayload);
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
    console.log(`🔧 Apontar a Credencial da Evolution API no n8n para: http://localhost:${PORT}`);
});
