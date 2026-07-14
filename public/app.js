const socket = io();

const loginView = document.getElementById('login-view');
const homeView = document.getElementById('home-view');
const chatView = document.getElementById('chat-view');
const agentsGrid = document.getElementById('agents-grid');
const backBtn = document.getElementById('back-btn');

const loginForm = document.getElementById('login-form');
const userNameInput = document.getElementById('user-name');
const userPhoneInput = document.getElementById('user-phone');

const chatMessages = document.getElementById('chat-messages');
const chatForm = document.getElementById('chat-form');
const messageInput = document.getElementById('message-input');
const recordBtn = document.getElementById('record-btn');
const sendBtn = document.getElementById('send-btn');
const currentAgentName = document.getElementById('current-agent-name');
const currentAgentAvatar = document.getElementById('current-agent-avatar');

const displayUserName = document.getElementById('display-user-name');
const displayUserPhone = document.getElementById('display-user-phone');
const logoutBtn = document.getElementById('logout-btn');

let mediaRecorder;
let audioChunks = [];
let isRecording = false;
let currentAgent = null;

// User Session
let userSession = JSON.parse(localStorage.getItem('userSession'));

function updateProfileBar() {
    if (userSession) {
        displayUserName.textContent = userSession.name;
        // Opcional: formatar telefone ex: (11) 99999-9999
        let p = userSession.phone;
        if (p.length === 13 && p.startsWith('55')) {
            p = `+55 (${p.slice(2,4)}) ${p.slice(4,9)}-${p.slice(9)}`;
        }
        displayUserPhone.textContent = p;
    }
}

// --- INIT APP ---
function initApp() {
    if (userSession && userSession.phone && userSession.name) {
        loginView.style.display = 'none';
        homeView.style.display = 'flex';
        updateProfileBar();
        loadAgents();
    } else {
        loginView.style.display = 'flex';
        homeView.style.display = 'none';
        chatView.style.display = 'none';
    }
}

if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
        localStorage.removeItem('userSession');
        userSession = null;
        initApp();
    });
}

// --- LOGIN LOGIC ---
loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = userNameInput.value.trim();
    let phone = userPhoneInput.value.trim();

    // Clean non-digits
    phone = phone.replace(/\D/g, '');

    if (name && phone) {
        try {
            const btn = document.getElementById('btn-login');
            btn.textContent = 'Entrando...';
            btn.disabled = true;

            const res = await fetch('/api/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ phone, name })
            });
            const data = await res.json();

            if (data.success) {
                userSession = { phone: data.phone, name: data.name };
                localStorage.setItem('userSession', JSON.stringify(userSession));
                loginView.style.display = 'none';
                homeView.style.display = 'flex';
                updateProfileBar();
                loadAgents();
            } else {
                alert('Erro ao fazer login: ' + (data.error || 'Erro desconhecido'));
                const btn = document.getElementById('btn-login');
                btn.textContent = 'Entrar';
                btn.disabled = false;
            }
        } catch (err) {
            console.error(err);
            alert('Erro de conexão ao fazer login.');
        } finally {
            const btn = document.getElementById('btn-login');
            btn.textContent = 'Entrar';
            btn.disabled = false;
        }
    }
});


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

async function openAgentChat(agent) {
    currentAgent = agent;

    // Update Header
    currentAgentName.textContent = agent.name;
    currentAgentAvatar.src = agent.avatar;
    currentAgentAvatar.style.display = 'block';

    // Switch views
    homeView.style.display = 'none';
    chatView.style.display = 'flex';

    // Show loading
    chatMessages.innerHTML = '<div class="loading-agents">Carregando histórico...</div>';

    // Enter socket room specific for this user and agent
    socket.emit('join_agent', { 
        instanceName: agent.instanceName, 
        userPhone: userSession.phone 
    });

    // Fetch history
    try {
        const res = await fetch(`/api/messages/${userSession.phone}/${agent.id}`);
        const history = await res.json();
        
        chatMessages.innerHTML = ''; // Clear loading

        if (history.length === 0) {
            chatMessages.innerHTML = `
                <article class="message agent">
                    <div class="message-content">
                        Olá, <b>${userSession.name.split(' ')[0]}</b>! Sou o <b>${agent.name}</b>. Como posso te ajudar hoje?
                    </div>
                </article>
            `;
        } else {
            history.forEach(msg => {
                const type = msg.message_type;
                let content = msg.content;
                if (type === 'text') {
                    try {
                        const parsed = JSON.parse(msg.content);
                        if (typeof parsed === 'object') {
                            content = JSON.stringify(parsed);
                        } else {
                            content = msg.content;
                        }
                    } catch(e) { }
                }
                addMessageToUI(type, content, msg.sender_type, false);
            });
            scrollToBottom();
        }

    } catch (err) {
        console.error("Erro ao carregar histórico:", err);
        chatMessages.innerHTML = '<div class="loading-agents" style="color: var(--danger)">Erro ao carregar o histórico de mensagens.</div>';
    }
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

function addMessageToUI(type, content, sender = 'agent', scroll = true) {
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
    if (sender === 'user') {
        const meta = document.createElement('div');
        meta.className = 'message-meta';
        meta.innerHTML = `<svg viewBox="0 0 16 11" height="11" width="16" preserveAspectRatio="xMidYMid meet" class="read-ticks"><path d="M11.804 1.341a.5.5 0 0 1 .15.358.5.5 0 0 1-.15.358L5.59 8.27l-2.85-2.85a.5.5 0 1 1 .708-.707l2.142 2.142 5.506-5.506a.5.5 0 0 1 .708 0zm3.456 0a.5.5 0 0 1 .15.358.5.5 0 0 1-.15.358L9.046 8.27 7.74 6.963l1.815-1.815 5.505-5.506a.5.5 0 0 1 .708 0z" fill="#53bdeb"></path></svg>`;
        div.appendChild(meta);
    }

    article.appendChild(div);
    chatMessages.appendChild(article);
    if (scroll) scrollToBottom();
}

chatForm.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!currentAgent || !userSession) return;

    const text = messageInput.value.trim();

    if (text) {
        socket.emit('user_message', {
            agentId: currentAgent.id,
            text,
            userPhone: userSession.phone,
            userName: userSession.name
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
            mimeType: audioBlob.type,
            userPhone: userSession.phone,
            userName: userSession.name
        });

        addMessageToUI('audio', base64data, 'user');
    };
}

// Inicializa a aplicação
initApp();
