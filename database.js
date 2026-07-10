require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.warn("⚠️ Variáveis SUPABASE_URL ou SUPABASE_KEY não encontradas no .env. O banco não funcionará corretamente.");
}

const supabase = createClient(supabaseUrl || '', supabaseKey || '');

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
