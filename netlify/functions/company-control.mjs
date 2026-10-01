import { createClient } from '@supabase/supabase-js';
const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization,content-type','Access-Control-Allow-Methods':'PATCH,DELETE,OPTIONS','Content-Type':'application/json'};
export default async request=>{
  if(request.method==='OPTIONS')return new Response('',{status:204,headers});
  if(!['PATCH','DELETE'].includes(request.method))return new Response(JSON.stringify({error:'Método no permitido.'}),{status:405,headers});
  try{
    const admin=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY);
    const token=(request.headers.get('authorization')||'').replace(/^Bearer\s+/i,'');
    const {data:{user}}=await admin.auth.getUser(token);
    const {data:owner}=user?await admin.from('super_admins').select('user_id').eq('user_id',user.id).maybeSingle():{data:null};
    if(!owner)return new Response(JSON.stringify({error:'Solo el Super Admin puede cambiar una empresa.'}),{status:403,headers});
    const body=await request.json(); if(!body.id)return new Response(JSON.stringify({error:'Empresa inválida.'}),{status:400,headers});
    if(request.method==='DELETE'){
      const {data:company,error:companyError}=await admin.from('companies').select('id,name').eq('id',body.id).single();if(companyError)throw companyError;
      if(body.confirmName!==company.name)return new Response(JSON.stringify({error:'Escribe el nombre exacto de la empresa para confirmar.'}),{status:400,headers});
      const {data:members,error:membersError}=await admin.from('profiles').select('id').eq('company_id',body.id);if(membersError)throw membersError;
      const {error:profilesError}=await admin.from('profiles').delete().eq('company_id',body.id);if(profilesError)throw profilesError;
      const {error:deleteError}=await admin.from('companies').delete().eq('id',body.id);if(deleteError)throw deleteError;
      for(const member of members||[])await admin.auth.admin.deleteUser(member.id);
      return new Response(JSON.stringify({deleted:true}),{headers});
    }
    const update={};if(['activa','suspendida','vencida'].includes(body.status))update.status=body.status;if(Number(body.userLimit)>0)update.user_limit=Number(body.userLimit);if(['basico','profesional'].includes(body.plan))update.plan=body.plan;
    const {data,error}=await admin.from('companies').update(update).eq('id',body.id).select().single();if(error)throw error;
    return new Response(JSON.stringify({company:data}),{headers});
  }catch(error){return new Response(JSON.stringify({error:error.message||'Error de servicio.'}),{status:400,headers});}
};
