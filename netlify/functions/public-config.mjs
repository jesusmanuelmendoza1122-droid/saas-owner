// Entrega únicamente información pública necesaria para el cliente web.
// La clave privada del proveedor nunca se devuelve ni se incluye en el build.
export default async () => Response.json({
  supabaseUrl: process.env.SUPABASE_URL,
  supabaseAnonKey: process.env.SUPABASE_ANON_KEY,
});
