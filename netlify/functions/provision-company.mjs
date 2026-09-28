import { createClient } from '@supabase/supabase-js';
export default async (request) => {
  if(request.method!=='POST')return new Response('Method not allowed',{status:405});
  const auth=request.headers.get('authorization')||'';
  const url=process.env.SUPABASE_URL, service=process.env.SUPABASE_SERVICE_ROLE_KEY;
  const admin=createClient(url,service); const token=auth.replace('Bearer ','');
  const {data:{user}}=await admin.auth.getUser(token); if(!user)return Response.json({error:'No autorizado'},{status:401});
  const {data:owner}=await admin.from('super_admins').select('user_id').eq('user_id',user.id).maybeSingle(); if(!owner)return Response.json({error:'Solo el Super Admin puede crear empresas.'},{status:403});
  const body=await request.json(); if(!body.companyName||!body.adminEmail||!body.adminPassword||body.adminPassword.length<10)return Response.json({error:'Empresa, correo y contraseña de administrador son obligatorios.'},{status:400});
  const {data:company,error}=await admin.from('companies').insert({name:body.companyName,contact_name:body.contactName||'',contact_email:body.adminEmail,plan:body.plan||'basico',user_limit:Number(body.userLimit)||3}).select().single(); if(error)return Response.json({error:error.message},{status:400});
  const {data:created,error:createError}=await admin.auth.admin.createUser({email:body.adminEmail,password:body.adminPassword,email_confirm:true}); if(createError)return Response.json({error:createError.message},{status:400});
  const {error:profileError}=await admin.from('profiles').insert({id:created.user.id,company_id:company.id,full_name:body.adminName||body.contactName||'Administrador',role:'company_admin'}); if(profileError)return Response.json({error:profileError.message},{status:400});
  return Response.json({company,adminEmail:body.adminEmail});
};
