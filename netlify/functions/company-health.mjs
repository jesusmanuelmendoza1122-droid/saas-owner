import { createClient } from '@supabase/supabase-js';
const headers={'Content-Type':'application/json'};
export default async request=>{try{
  const admin=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY);
  const token=(request.headers.get('authorization')||'').replace(/^Bearer\s+/i,'');
  const {data:{user}}=await admin.auth.getUser(token);
  const {data:owner}=user?await admin.from('super_admins').select('user_id').eq('user_id',user.id).maybeSingle():{data:null};
  if(!owner)return Response.json({error:'Solo Super Admin.'},{status:403,headers});
  const [{data:devices,error:de},{data:profiles,error:pe},{data:push,error:xe}]=await Promise.all([
    admin.from('tenant_devices').select('company_id,active,updated_at'),
    admin.from('profiles').select('id,company_id,role,active'),
    admin.from('operator_push_tokens').select('operator_id,updated_at')
  ]);
  if(de||pe||xe)throw(de||pe||xe);
  const pushIds=new Set((push||[]).map(x=>x.operator_id)),byCompany={};
  for(const device of devices||[]){const row=byCompany[device.company_id]||={devices:0,activeDevices:0,operators:0,pushReady:0};row.devices++;if(device.active)row.activeDevices++;byCompany[device.company_id]=row;}
  for(const profile of profiles||[]){const row=byCompany[profile.company_id]||={devices:0,activeDevices:0,operators:0,pushReady:0};if(profile.role==='operator'&&profile.active){row.operators++;if(pushIds.has(profile.id))row.pushReady++;}byCompany[profile.company_id]=row;}
  return Response.json({byCompany},{headers});
}catch(error){return Response.json({error:error.message||'Error'},{status:400,headers});}};