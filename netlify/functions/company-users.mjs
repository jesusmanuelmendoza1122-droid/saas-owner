import { createClient } from '@supabase/supabase-js';

const headers={ 'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization,content-type','Access-Control-Allow-Methods':'GET,POST,PATCH,OPTIONS','Content-Type':'application/json' };
const reply=(data,status=200)=>new Response(JSON.stringify(data),{status,headers});

async function caller(admin, request){
  const token=(request.headers.get('authorization')||'').replace(/^Bearer\s+/i,'');
  const {data:{user}}=await admin.auth.getUser(token);
  if(!user) throw new Error('No autorizado.');
  const {data:owner}=await admin.from('super_admins').select('user_id').eq('user_id',user.id).maybeSingle();
  if(owner) return {id:user.id,owner:true,role:'super_admin'};
  const {data:profile}=await admin.from('profiles').select('id,company_id,role,active').eq('id',user.id).maybeSingle();
  if(!profile?.active || profile.role!=='company_admin') throw new Error('No tienes permiso para administrar usuarios.');
  return {...profile,owner:false};
}
function allowed(actor, role, companyId){
  if(actor.owner) return ['company_admin','operator'].includes(role);
  return actor.company_id===companyId && role==='operator';
}
export default async request=>{
  if(request.method==='OPTIONS') return new Response('',{status:204,headers});
  if(!['GET','POST','PATCH'].includes(request.method))return reply({error:'Método no permitido.'},405);
  try{
    const admin=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY);
    const actor=await caller(admin,request);
    if(request.method==='GET'){
      let query=admin.from('profiles').select('id,company_id,full_name,role,active,created_at,companies(name)').order('created_at',{ascending:false});
      if(!actor.owner) query=query.eq('company_id',actor.company_id);
      const {data:profiles,error}=await query; if(error) throw error;
      const {data:{users}}=await admin.auth.admin.listUsers({perPage:1000});
      return reply((profiles||[]).map(p=>{const u=users.find(x=>x.id===p.id);return {id:p.id,name:p.full_name,email:u?.email||'',role:p.role,active:p.active,companyId:p.company_id,companyName:p.companies?.name||'',last_login_at:u?.last_sign_in_at||null};}));
    }
    const body=await request.json();
    if(request.method==='POST'){
      const role=String(body.role||''); const companyId=actor.owner?body.companyId:actor.company_id;
      if(!companyId||!allowed(actor,role,companyId))return reply({error:'No puedes crear ese rol.'},403);
      if(!body.name||!body.email||String(body.password||'').length<10)return reply({error:'Nombre, correo y contraseña temporal de al menos 10 caracteres son obligatorios.'},400);
      const {data:created,error:createError}=await admin.auth.admin.createUser({email:body.email,password:body.password,email_confirm:true}); if(createError)throw createError;
      const {error}=await admin.from('profiles').insert({id:created.user.id,company_id:companyId,full_name:body.name,role,active:true});
      if(error){await admin.auth.admin.deleteUser(created.user.id);throw error;}
      return reply({id:created.user.id},201);
    }
    const {data:target,error:targetError}=await admin.from('profiles').select('id,company_id,role').eq('id',body.id).single(); if(targetError)throw targetError;
    const desiredRole=body.role||target.role; if(!allowed(actor,desiredRole,target.company_id))return reply({error:'No puedes modificar este usuario o rol.'},403);
    const profileUpdate={}; if(body.role)profileUpdate.role=body.role;if(typeof body.active==='boolean')profileUpdate.active=body.active;if(body.name)profileUpdate.full_name=body.name;
    if(Object.keys(profileUpdate).length){const {error}=await admin.from('profiles').update(profileUpdate).eq('id',target.id);if(error)throw error;}
    if(body.password){if(String(body.password).length<10)return reply({error:'La contraseña debe tener al menos 10 caracteres.'},400);const {error}=await admin.auth.admin.updateUserById(target.id,{password:body.password});if(error)throw error;}
    return reply({ok:true});
  }catch(error){return reply({error:error.message||'Error de servicio.'},error.message==='No autorizado.'?401:400);}
};
