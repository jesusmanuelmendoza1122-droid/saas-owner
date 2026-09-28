// Entrega únicamente información pública necesaria para el cliente web.
// La clave privada del proveedor nunca se devuelve ni se incluye en el build.
export default async (request) => {
  const headers={
    'Access-Control-Allow-Origin':'*',
    'Access-Control-Allow-Headers':'content-type',
    'Access-Control-Allow-Methods':'GET,OPTIONS',
  };
  if(request.method==='OPTIONS')return new Response('',{status:204,headers});
  return Response.json({
    supabaseUrl: process.env.SUPABASE_URL,
    supabaseAnonKey: process.env.SUPABASE_ANON_KEY,
  },{headers});
};
