const socket = io();

const homeView = document.getElementById('home-view');
const chatView = document.getElementById('chat-view');
const agentsGrid = document.getElementById('agents-grid');
const backBtn = document.getElementById('back-btn');

const chatMessages = document.getElementById('chat-messages');
const chatForm = document.getElementById('chat-form');
const messageInput = document.getElementById('message-input');
const recordBtn = document.getElementById('record-btn');
const sendBtn = document.getElementById('send-btn');
const currentAgentName = document.getElementById('current-agent-name');
const currentAgentAvatar = document.getElementById('current-agent-avatar');

let mediaRecorder;
let audioChunks = [];
let isRecording = false;
let currentAgent = null;

// --- HOME VIEW LOGIC ---

// Fetch agents from API
async function loadAgents() {
    try {
        const response = await fetch('/api/agents');
        const agents = await response.json();
        renderAgents(agents);
    } catch (error) {
        console.error("Erro ao carregar agentes:", error);
        agentsGrid.innerHTML = '<div class="loading-agents" style="color: var(--danger)">Erro ao carregar a lista de agentes.</div>';
    }
}

// Render the grid
function renderAgents(agents) {
    agentsGrid.innerHTML = ''; // Clear loading

    agents.forEach(agent => {
        const card = document.createElement('article');
        card.className = 'agent-card';
        card.innerHTML = `
            <img src="${agent.avatar}" alt="Foto de ${agent.name}">
            <h2>${agent.name}</h2>
            <p>${agent.role}</p>
        `;

        card.addEventListener('click', () => openAgentChat(agent));
        agentsGrid.appendChild(card);
    });
}

// --- NAVIGATION LOGIC ---

function openAgentChat(agent) {
    currentAgent = agent;

    // Update Header
    currentAgentName.textContent = agent.name;
    currentAgentAvatar.src = agent.avatar;
    currentAgentAvatar.style.display = 'block';

    // Clear chat
    chatMessages.innerHTML = `
        <article class="message agent">
            <div class="message-content">
                Olá! Sou o <b>${agent.name}</b>. Como posso te ajudar hoje?
            </div>
        </article>
    `;

    // Enter socket room
    socket.emit('join_agent', { instanceName: agent.instanceName });

    // Switch views
    homeView.style.display = 'none';
    chatView.style.display = 'flex';
}

backBtn.addEventListener('click', () => {
    currentAgent = null;
    chatView.style.display = 'none';
    homeView.style.display = 'flex'; // It's a flex column
});

// --- CHAT LOGIC ---

function scrollToBottom() {
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

function addMessageToUI(type, content, sender = 'agent') {
    const article = document.createElement('article');
    article.className = `message ${sender}`;

    const div = document.createElement('div');
    div.className = 'message-content';

    if (type === 'text') {
        let textContent = content;
        if (typeof content === 'object') {
            textContent = JSON.stringify(content);
        }
        div.innerHTML = textContent.replace(/\n/g, '<br>');
    } else if (type === 'audio') {
        const audio = document.createElement('audio');
        audio.controls = true;
        if (content.startsWith('data:')) {
            audio.src = content;
        } else {
            audio.src = `data:audio/mp4;base64,${content}`;
        }
        div.appendChild(audio);
    }

    article.appendChild(div);
    chatMessages.appendChild(article);
    scrollToBottom();
}

chatForm.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!currentAgent) return;

    const text = messageInput.value.trim();

    if (text) {
        socket.emit('user_message', {
            agentId: currentAgent.id,
            text
        });

        addMessageToUI('text', text, 'user');
        messageInput.value = '';
    }
});

socket.on('agent_message', (data) => {
    console.log("Recebido do agente:", data);
    addMessageToUI(data.type, data.content, 'agent');
});

socket.on('message_sent', (response) => {
    if (!response.success) {
        console.error("Erro ao enviar mensagem:", response.error);
        addMessageToUI('text', `Erro interno: ${response.error}`, 'agent');
    }
});

// --- AUDIO LOGIC ---

recordBtn.addEventListener('click', async () => {
    if (!currentAgent) return;

    if (!isRecording) {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            startRecording(stream);
        } catch (err) {
            console.error('Microphone access denied:', err);
            alert('Não foi possível acessar o microfone.');
        }
    } else {
        stopRecording();
    }
});

function startRecording(stream) {
    mediaRecorder = new MediaRecorder(stream);
    audioChunks = [];

    mediaRecorder.addEventListener('dataavailable', event => {
        audioChunks.push(event.data);
    });

    mediaRecorder.addEventListener('stop', () => {
        const audioBlob = new Blob(audioChunks, { type: mediaRecorder.mimeType });
        sendAudioMessage(audioBlob);
        stream.getTracks().forEach(track => track.stop());
    });

    mediaRecorder.start();
    isRecording = true;
    recordBtn.classList.add('recording');
    messageInput.placeholder = "Gravando áudio...";
    messageInput.disabled = true;
    sendBtn.disabled = true;
}

function stopRecording() {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
        mediaRecorder.stop();
    }
    isRecording = false;
    recordBtn.classList.remove('recording');
    messageInput.placeholder = "Digite sua mensagem...";
    messageInput.disabled = false;
    sendBtn.disabled = false;
}

function sendAudioMessage(audioBlob) {
    const reader = new FileReader();
    reader.readAsDataURL(audioBlob);
    reader.onloadend = () => {
        const base64data = reader.result;
        const rawBase64 = base64data.split(',')[1];

        socket.emit('user_message', { 
            agentId: currentAgent.id,
            audioBase64: rawBase64,
            mimeType: audioBlob.type
        });

        addMessageToUI('audio', base64data, 'user');
    };
}

// Inicializa a aplicação
loadAgents();
