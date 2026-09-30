import { createClient } from '@supabase/supabase-js';
const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization,content-type','Access-Control-Allow-Methods':'GET,PATCH,OPTIONS','Content-Type':'application/json'};
export default async request=>{
  if(request.method==='OPTIONS')return new Response('',{status:204,headers});
  try{
    const admin=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY),token=(request.headers.get('authorization')||'').replace(/^Bearer\s+/i,'');
    const {data:{user}}=await admin.auth.getUser(token);
    const {data:profile}=user?await admin.from('profiles').select('id,role,active,company_id').eq('id',user.id).maybeSingle():{data:null};
    if(!profile?.active||profile.role!=='operator')return Response.json({error:'Solo operadores activos.'},{status:403,headers});
    if(request.method==='GET'){
      const [{data:cloud,error:ce},{data:portal,error:pe}]=await Promise.all([
        admin.from('cloud_tickets').select('*').eq('company_id',profile.company_id).eq('assigned_operator_id',profile.id).neq('status','cerrado').order('updated_at',{ascending:false}).range(0,4999),
        admin.from('portal_requests').select('id,public_code,subject,description,request_type,location,status,created_at,updated_at').eq('company_id',profile.company_id).eq('assigned_operator_id',profile.id).neq('status','cerrado').order('updated_at',{ascending:false}).range(0,4999)
      ]);
      if(ce)throw ce;
      // portal_requests puede no estar creado aún en instalaciones antiguas; no bloquea las tareas normales.
      const mapped=pe?[]:(portal||[]).map(x=>({id:'portal:'+x.id,source_ticket_id:x.public_code,subject:x.subject,description:x.description+'\n\nUbicación: '+(x.location||'Sin especificar'),category:x.request_type,priority:'media',status:x.status,updated_at:x.updated_at||x.created_at}));
      return Response.json([...(cloud||[]),...mapped].sort((a,b)=>String(b.updated_at).localeCompare(String(a.updated_at))),{headers});
    }
    const b=await request.json(),status=['cerrado','resuelto'].includes(b.status)?'pendiente_confirmacion':b.status;
    if(!['abierto','en_progreso','pendiente_confirmacion'].includes(status))return Response.json({error:'Estado inválido.'},{status:400,headers});
    let error;
    if(String(b.id).startsWith('portal:')){
      const id=String(b.id).slice(7);
      ({error}=await admin.from('portal_requests').update({status,updated_at:new Date().toISOString()}).eq('id',id).eq('assigned_operator_id',profile.id).neq('status',status));
    }else{
      ({error}=await admin.from('cloud_tickets').update({status,updated_at:new Date().toISOString()}).eq('id',b.id).eq('assigned_operator_id',profile.id).neq('status',status));
    }
    if(error)throw error;
    return Response.json({ok:true,status},{headers});
  }catch(error){return Response.json({error:error.message||'Error'},{status:400,headers});}
};