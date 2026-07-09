const socket = io();

const chatMessages = document.getElementById('chat-messages');
const chatForm = document.getElementById('chat-form');
const messageInput = document.getElementById('message-input');
const recordBtn = document.getElementById('record-btn');
const sendBtn = document.getElementById('send-btn');

let mediaRecorder;
let audioChunks = [];
let isRecording = false;

// Scroll to bottom
function scrollToBottom() {
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

// Add message to UI
function addMessageToUI(type, content, sender = 'agent') {
    const article = document.createElement('article');
    article.className = `message ${sender}`;
    
    const div = document.createElement('div');
    div.className = 'message-content';

    if (type === 'text') {
        // Format text properly (replace \n with <br>)
        let textContent = content;
        if (typeof content === 'object') {
            textContent = JSON.stringify(content);
        }
        div.innerHTML = textContent.replace(/\n/g, '<br>');
    } else if (type === 'audio') {
        // Assume content is base64 string
        const audio = document.createElement('audio');
        audio.controls = true;
        // The mime type might be different depending on n8n output, usually mp4 or ogg
        // Evolution API uses data URI or base64. Let's build a data URI if not present.
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

// Handle Form Submit
chatForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const text = messageInput.value.trim();
    
    if (text) {
        // Send via socket
        socket.emit('user_message', { text });
        
        // Add to UI
        addMessageToUI('text', text, 'user');
        
        messageInput.value = '';
    }
});

// Socket Events
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

// Audio Recording Logic
recordBtn.addEventListener('click', async () => {
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
        const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
        sendAudioMessage(audioBlob);
        
        // Release tracks
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
        
        // Remove the data URI prefix for the payload if needed, but we can pass it all
        const rawBase64 = base64data.split(',')[1];
        
        // Send via socket
        socket.emit('user_message', { audioBase64: rawBase64 });
        
        // Add to UI as user message
        addMessageToUI('audio', base64data, 'user');
    };
}
