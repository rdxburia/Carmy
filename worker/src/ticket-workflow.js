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
function normalizeEvent(row) {
  let metadata_json = row?.metadata_json;
  if (typeof metadata_json === "string") {
    try { metadata_json = JSON.parse(metadata_json); } catch { metadata_json = {}; }
  }
  return { ...row, metadata_json: metadata_json && typeof metadata_json === "object" ? metadata_json : {} };
}
async function ownedTicket(env,id,userId) {
  return env.DB.prepare("SELECT * FROM support_tickets WHERE id = ? AND user_id = ?").bind(id,userId).first();
}

// Assignees must be active members of the server-managed Super Admin or support roster.
async function isActiveTicketAssignee(env,userId) {
  if (!userId || !env?.SUPABASE_URL || !env?.SUPABASE_SECRET_KEY || !env?.DB) {
    return { allowed: false, unavailable: true };
  }
  try {
    const endpoint = new URL("/rest/v1/super_admins", env.SUPABASE_URL);
    endpoint.searchParams.set("user_id", `eq.${userId}`);
    endpoint.searchParams.set("active", "eq.true");
    endpoint.searchParams.set("select", "user_id");
    endpoint.searchParams.set("limit", "1");
    const response = await fetch(endpoint.toString(), {
      headers: { apikey: env.SUPABASE_SECRET_KEY, Authorization: `Bearer ${env.SUPABASE_SECRET_KEY}` },
    });
    if (!response.ok) return { allowed: false, unavailable: true };
    const rows = await response.json();
    if (!Array.isArray(rows)) return { allowed: false, unavailable: true };
    if (rows.some((row) => row?.user_id === userId)) return { allowed: true, unavailable: false };
  } catch (err) {
    console.error("Ticket assignee eligibility lookup failed", err?.message || err);
    return { allowed: false, unavailable: true };
  }
  try {
    const row = await env.DB.prepare(
      "SELECT user_id FROM team_members WHERE user_id = ? AND active = 1 AND role = 'support' LIMIT 1"
    ).bind(userId).first();
    return { allowed: row?.user_id === userId, unavailable: false };
  } catch (err) {
    console.error("Ticket assignee team lookup failed", err?.message || err);
    return { allowed: false, unavailable: true };
  }
}
function eventBatchStatements(env,{ticketId,actorId,actorType,type,visibility="public",message=null,metadata={},now}) {
  return [
    env.DB.prepare("INSERT INTO ticket_events (ticket_id,actor_user_id,actor_type,event_type,visibility,message,metadata_json,created_at) VALUES (?,?,?,?,?,?,?,?)")
      .bind(ticketId,actorId,actorType,type,visibility,message,JSON.stringify(metadata),now),
    env.DB.prepare("INSERT INTO audit_log (actor_user_id,ticket_id,action,metadata_json,created_at) VALUES (?,?,?,?,?)")
      .bind(actorId,ticketId,type,JSON.stringify({visibility,...metadata}),now),
  ];
}
export async function ticketApi(request,env,origin,user,userToken,parts,url) {
  const method=request.method;
  // /api/tickets/:id and /api/admin/tickets/:id use different segment offsets.
  // Public routes are ["tickets", id, ...]; admin routes are ["admin", "tickets", id, ...].
  const ticketId = parts[0] === "admin" ? parts[2] : parts[1];
  if(parts[0]==="tickets" && method==="POST" && parts.length===1) {
    const body=await request.json().catch(()=>null);
    if(!body || typeof body!=="object" || Array.isArray(body))return fail("A JSON object is required.",400,origin,"INVALID_REQUEST");
    const category=String(body.category||"").trim();
    const subject=String(body.subject||"").trim();
    const message=String(body.message||"").trim();
    const priority=String(body.priority||"normal").trim().toLowerCase();
    const categories=new Set(["Account & Security","Vehicle Garage & Records","Document Vault & Uploads","Ownership Transfer (Form 29/30)","Feature Request","Other Inquiry"]);
    if(!categories.has(category))return fail("Invalid ticket category.",400,origin,"INVALID_CATEGORY");
    if(!subject||subject.length>160)return fail("Subject is required and must be 1–160 characters.",400,origin,"INVALID_SUBJECT");
    if(!message||message.length>4000)return fail("Message must contain 1–4000 characters.",400,origin,"INVALID_MESSAGE");
    if(!PRIORITIES.has(priority))return fail("Invalid priority.",400,origin,"INVALID_PRIORITY");
    const now=nowSec();
    try {
      const recent=await env.DB.prepare("SELECT COUNT(*) AS count FROM support_tickets WHERE user_id=? AND created_at>?").bind(user.id,now-600).first();
      if(Number(recent?.count||0)>=5)return fail("You have submitted 5 tickets recently. Please wait before submitting another.",429,origin,"TICKET_RATE_LIMITED");
    } catch(err) {
      console.error("Ticket creation rate check failed",err?.message||err);
      return fail("Ticket service is temporarily unavailable.",503,origin,"TICKETS_UNAVAILABLE");
    }
    if(typeof env.DB.batch!=="function")return fail("Atomic ticket creation is unavailable.",503,origin,"TICKET_UPDATE_UNAVAILABLE");
    const ticketId="TD-"+crypto.randomUUID().replace(/-/g,"").slice(0,8).toUpperCase();
    const carId=body.car_id?String(body.car_id).trim():null;
    if(carId)return fail("Creating tickets linked to a vehicle is not supported on this endpoint yet. Submit without car_id.",400,origin,"UNSUPPORTED_CAR_LINK");
    try {
      await env.DB.batch([
        env.DB.prepare("INSERT INTO support_tickets (id,user_id,email,car_id,category,subject,message,priority,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)").bind(ticketId,user.id,user.email||"",null,category,subject,message,priority,"pending",now,now),
        ...eventBatchStatements(env,{ticketId,actorId:user.id,actorType:"user",type:"ticket_created",message,metadata:{category,subject,priority},now}),
      ]);
    } catch(err) {
      console.error("Atomic ticket creation failed",err?.message||err);
      return fail("Ticket could not be saved. Please retry.",503,origin,"TICKET_CREATE_UNAVAILABLE");
    }
    return json({ok:true,data:{id:ticketId,subject,status:"pending",priority,created_at:now}},201,origin);
  }
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
    if(typeof env.DB.batch!=="function")return fail("Atomic ticket replies are unavailable.",503,origin,"TICKET_UPDATE_UNAVAILABLE");
    try {
      await env.DB.batch([
        ...eventBatchStatements(env,{ticketId,actorId:user.id,actorType:"user",type:"message",message,now:nowSec()}),
        env.DB.prepare("UPDATE support_tickets SET updated_at=? WHERE id=? AND user_id=?").bind(nowSec(),ticketId,user.id),
      ]);
    } catch(err) {
      console.error("Atomic customer ticket reply failed",err?.message||err);
      return fail("Your reply could not be saved. Please retry.",503,origin,"TICKET_UPDATE_UNAVAILABLE");
    }
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
      return json({ok:true,data:{...ticket,events:(events.results||[]).map(normalizeEvent)}},200,origin);
    }
    if(ticketId && parts.length===3 && method==="PATCH") {
      const body=await request.json().catch(()=>null);
      if(!body || typeof body!=="object" || Array.isArray(body))return fail("A JSON object is required.",400,origin,"INVALID_REQUEST");
      const ticket=await env.DB.prepare("SELECT * FROM support_tickets WHERE id=?").bind(ticketId).first();
      if(!ticket)return fail("Ticket not found.",404,origin,"NOT_FOUND");
      const now=nowSec(), changes=[], events=[];
      let effectiveStatus=ticket.status;
      const hasStatus=Object.prototype.hasOwnProperty.call(body,"status");
      const hasAssignee=Object.prototype.hasOwnProperty.call(body,"assignee_id");
      if(hasStatus && hasAssignee)return fail("Update status and assignment separately.",400,origin,"CONFLICTING_CHANGES");
      if(hasStatus) {
        const next=String(body.status);
        if(!STATUSES.has(next)||!TRANSITIONS[ticket.status]?.has(next))return fail("Invalid ticket status transition.",409,origin,"INVALID_TRANSITION");
        if(ticket.status==="closed" && next==="working" && Number(ticket.reopen_until||0)<now)return fail("Ticket reopen window has expired.",409,origin,"INVALID_TRANSITION");
        changes.push(["status",next]);
        effectiveStatus=next;
        events.push({type:"status_changed",metadata:{from:ticket.status,to:next}});
        if(next==="closed")changes.push(["closed_at",now],["reopen_until",now+7*86400],["chat_enabled",0],["chat_enabled_until",null]);
      }
      if(Object.prototype.hasOwnProperty.call(body,"priority")) {
        const priority=String(body.priority).toLowerCase();
        if(!PRIORITIES.has(priority))return fail("Invalid priority.",400,origin,"INVALID_PRIORITY");
        changes.push(["priority",priority]);
      }
      if(hasAssignee) {
        const assignee=body.assignee_id ? String(body.assignee_id) : null;
        // Resolve eligibility against the server-managed roster, never client/UI claims.
        if (assignee) {
          const eligibility = await isActiveTicketAssignee(env, assignee);
          if (eligibility.unavailable) return fail("Ticket assignment authorization is temporarily unavailable.",503,origin,"ASSIGNEE_LOOKUP_UNAVAILABLE");
          if (!eligibility.allowed) return fail("Assignee must be an active Super Admin or support team member.",403,origin,"ASSIGNEE_NOT_ALLOWED");
        }
        if(!["pending","assigned"].includes(ticket.status))return fail("Assignment can only change while a ticket is pending or assigned.",409,origin,"INVALID_TRANSITION");
        changes.push(["assignee_id",assignee],["status",assignee?"assigned":"pending"]);
        effectiveStatus=assignee?"assigned":"pending";
        events.push({type:"assignment_changed",metadata:{assignee_id:assignee}});
      }
      if(Object.prototype.hasOwnProperty.call(body,"chat_enabled")) {
        if(typeof body.chat_enabled!=="boolean")return fail("chat_enabled must be a boolean.",400,origin,"INVALID_REQUEST");
        const enabled=body.chat_enabled && effectiveStatus!=="closed";
        changes.push(["chat_enabled",enabled?1:0],["chat_enabled_until",enabled?now+48*3600:null]);
        events.push({type:"chat_toggled",metadata:{enabled,until:enabled?now+48*3600:null}});
      }
      if(Object.prototype.hasOwnProperty.call(body,"show_agent_name")) {
        if(typeof body.show_agent_name!=="boolean")return fail("show_agent_name must be a boolean.",400,origin,"INVALID_REQUEST");
        changes.push(["show_agent_name",body.show_agent_name?1:0]);
      }
      if(Object.prototype.hasOwnProperty.call(body,"message")) {
        if(typeof body.message!=="string")return fail("Message must be text.",400,origin,"INVALID_MESSAGE");
        const message=body.message.trim();
        if(!message||message.length>4000)return fail("Message must contain 1–4000 characters.",400,origin,"INVALID_MESSAGE");
        if(body.internal!==undefined && typeof body.internal!=="boolean")return fail("internal must be a boolean.",400,origin,"INVALID_REQUEST");
        events.push({type:body.internal?"internal_note":"message",visibility:body.internal?"internal":"public",message});
      } else if(body.internal!==undefined) {
        return fail("internal can only be used with a message.",400,origin,"INVALID_REQUEST");
      }
      if(!changes.length && !events.length)return fail("No ticket changes were provided.",400,origin,"EMPTY_UPDATE");
      if(typeof env.DB.batch!=="function")return fail("Atomic ticket updates are unavailable.",503,origin,"TICKET_UPDATE_UNAVAILABLE");
      const statements=[];
      const fields=[...new Set(changes.map(([key])=>key))];
      if(fields.length) {
        const values=fields.map(key=>changes.filter(([name])=>name===key).at(-1)[1]);
        const sql="UPDATE support_tickets SET "+fields.map(key=>key+"=?").join(",")+",updated_at=? WHERE id=?";
        statements.push(env.DB.prepare(sql).bind(...values,now,ticketId));
      }
      for(const item of events)statements.push(...eventBatchStatements(env,{ticketId,actorId:user.id,actorType:"admin",...item,now}));
      try {
        await env.DB.batch(statements);
      } catch(err) {
        console.error("Atomic ticket update failed",err?.message||err);
        return fail("Ticket update could not be saved. No changes were confirmed.",503,origin,"TICKET_UPDATE_UNAVAILABLE");
      }
      return json({ok:true},200,origin);
    }
  }
  return fail("Route not found.",404,origin,"NOT_FOUND");
}
