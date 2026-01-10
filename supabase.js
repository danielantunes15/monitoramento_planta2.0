// supabase.js
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://tbmqzjuhkuvrywkmbihm.supabase.co';
const SUPABASE_KEY = 'sb_publishable_W8ucXtvGPCcreacZCPk26Q_uOCUFaVN';

// Cria a conexão
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

module.exports = supabase;