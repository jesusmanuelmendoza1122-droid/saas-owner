import fs from 'node:fs';
const url=process.env.SUPABASE_URL, key=process.env.SUPABASE_ANON_KEY;
if(!url||!key)throw new Error('Configura SUPABASE_URL y SUPABASE_ANON_KEY en Netlify antes de publicar.');
fs.writeFileSync('config.js',`window.APP_CONFIG=${JSON.stringify({supabaseUrl:url,supabaseAnonKey:key})};\n`);
