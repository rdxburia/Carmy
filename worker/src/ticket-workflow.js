import { error, json } from "./response.js";

const STATUSES = new Set(["pending","assigned","working","need_info","solved","closed"]);
const PRIORITIES = new Set(["low","normal","high","urgent"]);
const TRANSITIONS = {
  pending: new Set(["assigned"]),
  assigned: new Set(["working"]),
  working: new Set(["need_info","solved"]),
  need_info: new Set(["working"]),
  solved: new Set(["working","closed"]),
  closed: new Set(["working"]),
};
const nowSec = () => Math.floor(Date.now()/1000);
const fail = (message,status,origin,code) => error(message,status,origin,code);
async function ownedTicket(env,id,userId) {
  return env.DB.prepare("SELECT * FROM support_tickets WHERE id = ? AND user_id = ?").bind(id,userId).first();
}
async function event(env,{ticketId,actorId,actorType,type,visibility="public",message=null,metadata={}}) {
  const result = await env.DB.prepare("INSERT INTO ticket_events (ticket_id,actor_user_id,actor_type,event_type,visibility,message,metadata_json,created_at) VALUES (?,?,?,?,?,?,?,?)")
    .bind(ticketId,actorId,actorType,type,visibility,message,JSON.stringify(metadata),nowSec()).run();
  await env.DB.prepare("INSERT INTO audit_log (actor_user_id,ticket_id,action,metadata_json,created_at) VALUES (?,?,?,?,?)")
    .bind(actorId,ticketId,type,JSON.stringify({visibility,...metadata}),nowSec()).run();
  return result;
}
export async function ticketApi(request,env,origin,user,userToken,parts,url) {
  const method=request.method;
  // /api/tickets/:id and /api/admin/tickets/:id use different segment offsets.
  // Public routes are ["tickets", id, ...]; admin routes are ["admin", "tickets", id, ...].
  const ticketId = parts[0] === "admin" ? parts[2] : parts[1];
  if(parts[0]==="tickets" && method==="GET" && parts.length===1) {
    const rows=await env.DB.prepare("SELECT t.id,t.subject,t.status,t.priority,t.created_at,t.updated_at, MAX(e.id) AS last_event_id, MAX(e.created_at) AS last_event_at FROM support_tickets t LEFT JOIN public_ticket_events e ON e.ticket_id=t.id WHERE t.user_id=? GROUP BY t.id ORDER BY t.updated_at DESC").bind(user.id).all();
    const reads=await env.DB.prepare("SELECT ticket_id,last_read_event_id FROM ticket_reads WHERE user_id=?").bind(user.id).all();
    const readMap=new Map((reads.results||[]).map(r=>[r.ticket_id,Number(r.last_read_event_id)]));
    return json({ok:true,data:(rows.results||[]).map(t=>({...t,has_unread:Number(t.last_event_id||0)>Number(readMap.get(t.id)||0)}))},200,origin);
  }
  if(parts[0]==="tickets" && parts[1]==="unread-count" && method==="GET") {
    const r=await env.DB.prepare("SELECT COUNT(*) AS count FROM support_tickets t WHERE t.user_id=? AND EXISTS (SELECT 1 FROM public_ticket_events e WHERE e.ticket_id=t.id AND e.id > COALESCE((SELECT last_read_event_id FROM ticket_reads r WHERE r.user_id=t.user_id AND r.ticket_id=t.id),0))").bind(user.id).first();
    return json({ok:true,count:Number(r?.count||0)},200,origin);
  }
  if(parts[0]==="tickets" && ticketId && method==="GET" && parts.length===2) {
    const ticket=await ownedTicket(env,ticketId,user.id);
    if(!ticket)return fail("Ticket not found.",404,origin,"NOT_FOUND");
    const events=await env.DB.prepare("SELECT id,ticket_id,actor_type,event_type,message,created_at FROM public_ticket_events WHERE ticket_id=? ORDER BY id ASC").bind(ticketId).all();
    const lastId=Number(events.results?.at(-1)?.id||0);
    await env.DB.prepare("INSERT INTO ticket_reads(user_id,ticket_id,last_read_event_id,updated_at) VALUES(?,?,?,?) ON CONFLICT(user_id,ticket_id) DO UPDATE SET last_read_event_id=excluded.last_read_event_id,updated_at=excluded.updated_at").bind(user.id,ticketId,lastId,nowSec()).run();
    return json({ok:true,data:{id:ticket.id,subject:ticket.subject,status:ticket.status,priority:ticket.priority,chat_enabled:Boolean(ticket.chat_enabled)&&Number(ticket.chat_enabled_until||0)>nowSec()&&ticket.status!=="closed",show_agent_name:Boolean(ticket.show_agent_name),events:events.results||[]}},200,origin);
  }
  if(parts[0]==="tickets" && ticketId && parts[2]==="messages" && parts.length===3 && method==="POST") {
    const ticket=await ownedTicket(env,ticketId,user.id);
    if(!ticket)return fail("Ticket not found.",404,origin,"NOT_FOUND");
    if(!ticket.chat_enabled || Number(ticket.chat_enabled_until||0)<=nowSec() || ticket.status==="closed")return fail("Replies are currently disabled for this ticket.",403,origin,"CHAT_DISABLED");
    const body=await request.json().catch(()=>null), message=String(body?.message||"").trim();
    if(!message||message.length>4000)return fail("Message must contain 1–4000 characters.",400,origin,"INVALID_MESSAGE");
    await event(env,{ticketId,actorId:user.id,actorType:"user",type:"message",message});
    await env.DB.prepare("UPDATE support_tickets SET updated_at=? WHERE id=? AND user_id=?").bind(nowSec(),ticketId,user.id).run();
    return json({ok:true},201,origin);
  }
  if(parts[0]==="admin" && parts[1]==="tickets") {
    if(parts.length===2 && method==="GET") {
      const status=url.searchParams.get("status");
      const rows=status&&STATUSES.has(status)
        ? await env.DB.prepare("SELECT id,user_id,email,subject,status,priority,assignee_id,chat_enabled,chat_enabled_until,sla_due_at,closed_at,reopen_until,show_agent_name,created_at,updated_at FROM support_tickets WHERE status=? ORDER BY created_at ASC").bind(status).all()
        : await env.DB.prepare("SELECT id,user_id,email,subject,status,priority,assignee_id,chat_enabled,chat_enabled_until,sla_due_at,closed_at,reopen_until,show_agent_name,created_at,updated_at FROM support_tickets ORDER BY created_at ASC").all();
      return json({ok:true,data:rows.results||[]},200,origin);
    }
    if(ticketId && parts.length===3 && method==="GET") {
      const ticket=await env.DB.prepare("SELECT * FROM support_tickets WHERE id=?").bind(ticketId).first();
      if(!ticket)return fail("Ticket not found.",404,origin,"NOT_FOUND");
      const events=await env.DB.prepare("SELECT * FROM ticket_events WHERE ticket_id=? ORDER BY id ASC").bind(ticketId).all();
      return json({ok:true,data:{...ticket,events:events.results||[]}},200,origin);
    }
    if(ticketId && parts.length===3 && method==="PATCH") {
      const body=await request.json().catch(()=>null);
      const ticket=await env.DB.prepare("SELECT * FROM support_tickets WHERE id=?").bind(ticketId).first();
      if(!ticket)return fail("Ticket not found.",404,origin,"NOT_FOUND");
      const now=nowSec(), changes=[];
      if(body?.status!==undefined) {
        const next=String(body.status);
        if(!STATUSES.has(next)||!TRANSITIONS[ticket.status]?.has(next))return fail("Invalid ticket status transition.",409,origin,"INVALID_TRANSITION");
        if(ticket.status==="closed" && next==="working" && Number(ticket.reopen_until||0)<now)return fail("Ticket reopen window has expired.",409,origin,"INVALID_TRANSITION");
        changes.push(["status",next]);
        await event(env,{ticketId,actorId:user.id,actorType:"admin",type:"status_changed",metadata:{from:ticket.status,to:next}});
        if(next==="closed") { changes.push(["closed_at",now],["reopen_until",now+7*86400],["chat_enabled",0],["chat_enabled_until",null]); }
      }
      if(body?.priority!==undefined) {
        const priority=String(body.priority).toLowerCase();
        if(!PRIORITIES.has(priority))return fail("Invalid priority.",400,origin,"INVALID_PRIORITY");
        changes.push(["priority",priority]);
      }
      if(body?.assignee_id!==undefined) {
        const assignee=body.assignee_id?String(body.assignee_id):null;
        changes.push(["assignee_id",assignee],["status",assignee?"assigned":"pending"]);
        await event(env,{ticketId,actorId:user.id,actorType:"admin",type:"assignment_changed",metadata:{assignee_id:assignee}});
      }
      if(body?.chat_enabled!==undefined) {
        const enabled=Boolean(body.chat_enabled);
        changes.push(["chat_enabled",enabled?1:0],["chat_enabled_until",enabled?now+48*3600:null]);
        await event(env,{ticketId,actorId:user.id,actorType:"admin",type:"chat_toggled",metadata:{enabled,until:enabled?now+48*3600:null}});
      }
      if(body?.show_agent_name!==undefined)changes.push(["show_agent_name",body.show_agent_name?1:0]);
      if(body?.message!==undefined) {
        const message=String(body.message).trim();
        if(!message||message.length>4000)return fail("Message must contain 1–4000 characters.",400,origin,"INVALID_MESSAGE");
        await event(env,{ticketId,actorId:user.id,actorType:"admin",type:body.internal?"internal_note":"message",visibility:body.internal?"internal":"public",message});
      }
      const fields=[...new Set(changes.map(([k])=>k))];
      if(fields.length) {
        const values=fields.map(k=>changes.filter(([name])=>name===k).at(-1)[1]);
        const sql="UPDATE support_tickets SET "+fields.map(k=>k+"=?").join(",")+",updated_at=? WHERE id=?";
        await env.DB.prepare(sql).bind(...values,now,ticketId).run();
      }
      return json({ok:true},200,origin);
    }
  }
  return fail("Route not found.",404,origin,"NOT_FOUND");
}
