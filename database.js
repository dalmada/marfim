require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
const nodeFetch = require('node-fetch');

let supabaseUrl = process.env.SUPABASE_URL;
let supabaseKey = process.env.SUPABASE_KEY;

// Fallback de leitura manual caso o dotenv falhe na Hostinger
if (!supabaseUrl || supabaseUrl === 'undefined') {
    try {
        const envPath = path.join(__dirname, '.env');
        const envFile = fs.readFileSync(envPath, 'utf8');
        const urlMatch = envFile.match(/SUPABASE_URL=(.*)/);
        const keyMatch = envFile.match(/SUPABASE_KEY=(.*)/);
        if (urlMatch) supabaseUrl = urlMatch[1].trim();
        if (keyMatch) supabaseKey = keyMatch[1].trim();
    } catch(e) {}
}

const supabaseUrlFinal = supabaseUrl || 'https://snwsrqggkuuxcfhskoby.supabase.co';
const supabaseKeyFinal = supabaseKey || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNud3NycWdna3V1eGNmaHNrb2J5Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MjI3MDIzNCwiZXhwIjoyMDk3ODQ2MjM0fQ.qFjgsvcdkwDrQ1jQIaVueEAWwVDBjf6wi6Yi_HY66sE';

if (supabaseUrlFinal === 'https://fallback.supabase.co') {
    console.warn("⚠️ Variáveis SUPABASE_URL ou SUPABASE_KEY não encontradas.");
}

// Instanciando com node-fetch para contornar bug de IPv6/DNS do Node 18 na Hostinger
const supabase = createClient(supabaseUrlFinal, supabaseKeyFinal, {
    global: { fetch: nodeFetch }
});

module.exports = {
    async saveUser(phone, name) {
        
        const { error } = await supabase
            .from('users')
            .upsert({ phone, name });

        if (error) {
            console.error('Erro ao salvar usuário no Supabase:', error.message);
            throw error;
        }
    },

    async getMessages(phone, agent_id) {
        const { data, error } = await supabase
            .from('messages')
            .select('*')
            .eq('phone', phone)
            .eq('agent_id', agent_id)
            .order('timestamp', { ascending: true });

        if (error) {
            console.error('Erro ao buscar histórico no Supabase:', error.message);
            throw error;
        }

        return data || [];
    },

    async saveMessage(msg) {
        const payload = {
            id: msg.id,
            phone: msg.phone,
            agent_id: msg.agent_id,
            sender_type: msg.sender_type,
            message_type: msg.message_type,
            content: msg.content
        };

        const { error } = await supabase
            .from('messages')
            .insert(payload);

        if (error) {
            console.error('Erro ao salvar mensagem no Supabase:', error.message);
            throw error;
        }
    }
};
