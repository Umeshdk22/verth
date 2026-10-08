// Refuse to be shown inside another website's frame (stops click-jacking tricks).
if (window.top !== window.self) { document.documentElement.style.display = 'none'; try { window.top.location = window.self.location.href; } catch (e) {} }
// Clickable demo: simulated, no account or network needed.
(function(){
  var SECRET = "nirmaan-rajesh-4417";
  var FAKE_CODE = "417209";
  var S = {
    wa:{channel:"WhatsApp", from:"Rajesh Mehta (CEO)", handle:"+91 98204 5••61 · not in your contacts",
        text:"Priya, I'm in a board meeting and can't talk. Transfer ₹4,80,000 to Sharma Traders today before 3 pm. Keep this between us for now, I'll explain later.",
        flag:"New number using the CEO's photo", amount:"₹4,80,000", request:"Pay Sharma Traders · ₹4,80,000", payee:"Sharma Traders", genuine:false},
    teams:{channel:"Microsoft Teams", from:"Rajesh Mehta", handle:"rajesh.mehta@nirmaan.in",
        text:"Hi Priya, please release the Q3 payment to Kaveri Logistics, invoice INV-2291 for ₹1,25,000. Thanks.",
        flag:"", amount:"₹1,25,000", request:"Pay Kaveri Logistics · ₹1,25,000", payee:"Kaveri Logistics", genuine:true},
    call:{channel:"Zoom video call", from:"Rajesh Mehta", handle:"Joined from an outside meeting link",
        text:"“Priya, approve the new bank details for Sharma Traders right now. The auditors are waiting on me.”",
        flag:"Face and voice look right. That is no longer proof.", amount:"", request:"Change vendor bank details", payee:"Sharma Traders", genuine:false}
  };
  var st = {s:"wa", phase:"incoming", left:90, answer:null};
  var emp = document.getElementById("emp"), ex = document.getElementById("exec"), guide = document.getElementById("guide");
  var checks=14, stopped=3, protectedL=11.6;

  function code(win){
    var str = SECRET + ":" + win, h = 2166136261;
    for (var i=0;i<str.length;i++){ h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    var n = (h >>> 0) % 1000000;
    return ("000000" + n).slice(-6);
  }
  function win(){ return Math.floor(Date.now()/30000); }
  function secsLeft(){ return 30 - Math.floor((Date.now()%30000)/1000); }
  function fmt(c){ return c.slice(0,3) + " " + c.slice(3); }
  function now(){ var d=new Date(); return ("0"+d.getHours()).slice(-2)+":"+("0"+d.getMinutes()).slice(-2); }
  function esc(t){ return String(t).replace(/[&<>"]/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c];}); }

  var ICON = {
    ok:'<svg viewBox="0 0 24 24" fill="none" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
    bad:'<svg viewBox="0 0 24 24" fill="none" stroke-width="2.6" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>',
    wait:'<svg viewBox="0 0 24 24" fill="none" stroke-width="2.6" stroke-linecap="round"><path d="M12 7v5l3 2"/><circle cx="12" cy="12" r="8"/></svg>',
    fp:'<svg viewBox="0 0 24 24" fill="none" stroke-width="1.8" stroke-linecap="round"><path d="M12 11v3a6 6 0 01-1.2 3.6"/><path d="M8.5 9.5a3.5 3.5 0 017 1.5v2"/><path d="M6 12a6 6 0 0112 0v1.5"/><path d="M15.5 16.5a9 9 0 01-1 3"/></svg>'
  };

  function ring(){
    var left = secsLeft(), C = 2*Math.PI*18, off = C*(1-left/30);
    return '<svg class="ring" viewBox="0 0 44 44" aria-label="'+left+' seconds until new code"><circle class="track" cx="22" cy="22" r="18"/><circle class="prog" cx="22" cy="22" r="18" stroke-dasharray="'+C.toFixed(2)+'" stroke-dashoffset="'+off.toFixed(2)+'"/><text x="22" y="26.5" text-anchor="middle">'+left+'</text></svg>';
  }

  function msgCard(sc){
    return '<div class="msg"><div class="msg-h"><span class="msg-from">'+esc(sc.from)+'</span><span>'+esc(sc.channel)+'</span></div>'+
      '<div style="font-size:12px;color:var(--muted)">'+esc(sc.handle)+'</div>'+
      '<div class="bubble">'+esc(sc.text)+'</div>'+
      (sc.flag ? '<div class="flag">'+esc(sc.flag)+'</div>' : '')+'</div>';
  }

  function renderEmp(){
    var sc = S[st.s], p = st.phase, h = "";
    if (st.s === "call" && (p === "incoming" || p === "codebad" || p === "codeok")) {
      h += msgCard(sc);
      if (p === "incoming") {
        h += '<div style="font-weight:600;font-size:14px">Ask the caller for their Verth code</div>'+
             '<div class="said"><span>Caller reads out: <b style="font-family:var(--mono)">'+fmt(FAKE_CODE)+'</b></span><button type="button" id="usefake">Enter it</button></div>'+
             '<form class="codein" id="codeform"><input id="codeinput" inputmode="numeric" maxlength="7" placeholder="000 000" autocomplete="off" aria-label="Code the caller read out"><button class="btn btn-primary" type="submit">Check</button></form>'+
             '<p class="hint">Tip: type the code from Rajesh’s phone on the right to see a real match.</p>';
      } else if (p === "codebad") {
        h += '<div class="state bad"><div class="icon">'+ICON.bad+'</div><h3>Code doesn’t match</h3><p>The person on this call doesn’t have Rajesh’s phone. Treat it as a deepfake. Leave the call and don’t change any bank details.</p></div>'+
             '<button class="btn btn-bad" type="button" id="report">Report to security team</button>';
      } else {
        h += '<div class="state ok"><div class="icon">'+ICON.ok+'</div><h3>Code matches</h3><p>The caller has Rajesh’s registered phone. Continue with your normal approval steps.</p></div>';
      }
    } else if (p === "incoming") {
      h += msgCard(sc)+'<button class="btn btn-primary" type="button" id="verify">Verify with Verth</button><p class="hint">Asks Rajesh on his registered phone, not on this chat.</p>';
    } else if (p === "pending") {
      h += msgCard(sc)+'<div class="state wait"><h3><span class="spin"></span> Asking Rajesh…</h3><p>Sent to his registered phone ending 4417. Don’t act on the request yet.</p><p style="font-family:var(--mono);font-size:13px">Expires in '+st.left+'s</p></div>';
    } else if (p === "ok") {
      h += '<div class="state ok"><div class="icon">'+ICON.ok+'</div><h3>Confirmed by Rajesh</h3><p>He approved this at '+now()+' with his fingerprint. Go ahead with the payment through your normal approval.</p></div>'+
           '<dl class="kv"><dt>Request</dt><dd>'+esc(sc.request)+'</dd><dt>Channel</dt><dd>'+esc(sc.channel)+'</dd></dl>';
    } else if (p === "bad") {
      h += '<div class="state bad"><div class="icon">'+ICON.bad+'</div><h3>Rajesh didn’t send this</h3><p>Don’t pay and don’t reply to the sender. Someone is pretending to be him.</p></div>'+
           '<button class="btn btn-bad" type="button" id="report">Report to security team</button>';
    } else if (p === "expired") {
      h += '<div class="state wait"><div class="icon">'+ICON.wait+'</div><h3>No answer from Rajesh</h3><p>The check expired. Don’t act on the request until he confirms.</p></div>'+
           '<button class="btn btn-ghost" type="button" id="verify">Ask again</button>';
    } else if (p === "reported") {
      h += '<div class="state ok"><div class="icon">'+ICON.ok+'</div><h3>Reported</h3><p>The security team has the message, the sender’s number and this check. Thanks for stopping it.</p></div>';
    }
    emp.innerHTML = h;
    bindEmp();
  }

  function renderExec(){
    var sc = S[st.s], p = st.phase, c = code(win()), h = "";
    if (p === "pending") {
      h += '<div class="notif"><div style="font-size:12px;color:var(--accent);font-weight:600">Verth check</div>'+
           '<div class="q">Did you ask Priya to '+esc(sc.request.charAt(0).toLowerCase()+sc.request.slice(1).replace(" · "," "))+'?</div>'+
           '<dl class="kv"><dt>Asked by</dt><dd>Priya Nair, Accounts</dd><dt>Came via</dt><dd>'+esc(sc.channel)+'</dd><dt>Sender</dt><dd>'+esc(sc.handle)+'</dd></dl>'+
           '<div class="row2"><button class="btn btn-bad" type="button" id="no">No, not me</button><button class="btn btn-ok" type="button" id="yes">Yes, I sent it</button></div>'+
           '<div class="fp">'+ICON.fp+'Confirm with fingerprint</div></div>';
    } else {
      if (p === "bad" || p === "reported" && st.answer === "no") {
        h += '<div class="state bad" style="padding:12px"><p style="color:var(--bad);font-weight:600">You denied a request made in your name.</p><p>Priya has been told to stop. The security team gets the details.</p></div>';
      } else if (p === "ok") {
        h += '<div class="state ok" style="padding:12px"><p style="color:var(--ok);font-weight:600">You confirmed Priya’s request.</p></div>';
      } else {
        h += '<div class="idle"><b style="color:var(--ink)">No checks waiting</b><span>You’ll get a notification when someone verifies a request in your name.</span></div>';
      }
      h += '<div class="codecard">'+ring()+'<div><div class="lbl">Your Verth code</div><div class="code'+(st.s==="call"?" big":"")+'">'+fmt(c)+'</div></div></div>'+
           (st.s==="call" ? '<p class="hint">If Priya asks on a call, read this out. It changes every 30 seconds.</p>' : '');
    }
    ex.innerHTML = h;
    var y = document.getElementById("yes"), n = document.getElementById("no");
    if (y) y.onclick = function(){ answer("yes"); };
    if (n) n.onclick = function(){ answer("no"); };
  }

  var STEPS = {
    push:["A request arrives in Rajesh’s name","Priya taps Verify","Rajesh’s own phone asks him","Priya gets a clear answer"],
    code:["A video call arrives from “Rajesh”","Priya asks for his Verth code","She checks the code","Priya gets a clear answer"]
  };
  function stepIndex(){
    var p = st.phase;
    if (st.s === "call") return p === "incoming" ? 1 : 4;
    if (p === "incoming") return 1;
    if (p === "pending") return 2;
    return 4;
  }
  function renderGuide(){
    var sc = S[st.s], p = st.phase, e = "", t = "", d = "";
    if (st.s === "wa") {
      e = "Scenario 1 · the classic Indian office scam";
      if (p==="incoming"){t="A “CEO” messages from a new number";d="The photo and name look right, and the message pushes urgency and secrecy. On Priya’s phone, tap Verify with Verth.";}
      else if (p==="pending"){t="Now play the real Rajesh";d="The real Rajesh never sent this. On his phone, tap “No, not me”.";}
      else if (p==="bad"||p==="reported"){t="Scam stopped before any money moved";d="One tap from Rajesh was enough. Priya didn’t have to question her boss herself. The app did it for her.";}
      else if (p==="ok"){t="You approved a scam";d="In this scenario the message was fake, so the real Rajesh would tap “No”. Try again and deny it.";}
      else {t="The check expired";d="With no confirmation, Priya is told not to act. Silence is never a yes.";}
    } else if (st.s === "teams") {
      e = "Scenario 2 · a genuine request";
      if (p==="incoming"){t="Rajesh really does need this paid";d="Verification should be quick for real requests too. Tap Verify with Verth on Priya’s phone.";}
      else if (p==="pending"){t="Confirm it as Rajesh";d="He did send this one. Tap “Yes, I sent it” on his phone.";}
      else if (p==="ok"){t="Verified in seconds";d="Priya pays with confidence, and the log shows exactly who approved what. Auditors love that trail.";}
      else if (p==="bad"||p==="reported"){t="Rajesh denied it";d="In this scenario the request was real. When the boss says no, Priya stops, so the system fails safe either way.";}
      else {t="The check expired";d="No answer means no payment. Priya can ask again.";}
    } else {
      e = "Scenario 3 · live deepfake call";
      if (p==="incoming"){t="The face and voice are perfect";d="A cloned voice needs only a few seconds of audio. So Priya asks for the rolling code, which only Rajesh’s real phone shows. Enter what the caller read out.";}
      else if (p==="codebad"||p==="reported"){t="The deepfake can’t know the code";d="It copied his face, not his phone. The code changes every 30 seconds, so a guess or an old code fails.";}
      else {t="Real Rajesh, real code";d="The code on the call matched his phone. That’s what a genuine check looks like.";}
    }
    var steps = STEPS[st.s==="call"?"code":"push"], idx = stepIndex(), path = "";
    for (var i=0;i<steps.length;i++){
      var cls = i < idx ? "done" : (i === idx ? "now" : "");
      if (idx >= steps.length && i === steps.length-1) cls = "done";
      path += '<div class="step '+cls+'"><span class="dot"></span><span>'+steps[i]+'</span></div>';
    }
    guide.innerHTML = '<div class="eyebrow">'+e+'</div><h2>'+t+'</h2><p>'+d+'</p><div class="path">'+path+'</div>'+
      (p!=="incoming" && p!=="pending" ? '<button class="reset" type="button" id="again">Run this scenario again</button>' : '');
    var a = document.getElementById("again"); if (a) a.onclick = function(){ go(st.s); };
  }

  function addLog(result, cls){
    var sc = S[st.s], tb = document.getElementById("log"), tr = document.createElement("tr");
    tr.className = "new";
    tr.innerHTML = '<td>Today '+now()+'</td><td>Priya N. (Accounts)</td><td>Rajesh Mehta, CEO</td><td>'+esc(sc.channel)+'</td><td>'+esc(sc.request)+'</td><td><span class="pill '+cls+'">'+result+'</span></td>';
    tb.insertBefore(tr, tb.firstChild);
    checks++; document.getElementById("st-checks").textContent = checks;
    if (cls === "bad") { stopped++; document.getElementById("st-stopped").textContent = stopped; }
    var amt = sc.amount ? parseInt(sc.amount.replace(/[^\d]/g,""),10) : 0;
    if (amt) { protectedL = Math.round((protectedL + amt/100000)*10)/10; document.getElementById("st-saved").textContent = "₹" + protectedL + " L"; }
  }

  function bindEmp(){
    var v = document.getElementById("verify");
    if (v) v.onclick = function(){ st.phase="pending"; st.left=90; render(); };
    var r = document.getElementById("report");
    if (r) r.onclick = function(){ st.phase="reported"; render(); };
    var f = document.getElementById("codeform");
    if (f) f.onsubmit = function(ev){
      ev.preventDefault();
      var val = document.getElementById("codeinput").value.replace(/\D/g,"");
      if (val.length !== 6) { document.getElementById("codeinput").focus(); return; }
      var w = win(), okc = (val === code(w) || val === code(w-1));
      st.phase = okc ? "codeok" : "codebad";
      addLog(okc ? "Code matched" : "Code mismatch · stopped", okc ? "ok" : "bad");
      render();
    };
    var uf = document.getElementById("usefake");
    if (uf) uf.onclick = function(){ var i=document.getElementById("codeinput"); i.value = fmt(FAKE_CODE); i.focus(); };
  }

  function answer(a){
    st.answer = a;
    if (a === "yes") { st.phase = "ok"; addLog("Confirmed", "ok"); }
    else { st.phase = "bad"; addLog("Denied by Rajesh", "bad"); }
    render();
  }

  function render(){ renderEmp(); renderExec(); renderGuide(); }

  function go(s){
    st.s = s; st.phase = "incoming"; st.left = 90; st.answer = null;
    var tabs = document.querySelectorAll(".tab");
    for (var i=0;i<tabs.length;i++) tabs[i].setAttribute("aria-selected", tabs[i].getAttribute("data-s")===s ? "true" : "false");
    render();
  }
  var tabs = document.querySelectorAll(".tab");
  for (var i=0;i<tabs.length;i++) tabs[i].onclick = function(){ go(this.getAttribute("data-s")); };

  setInterval(function(){
    var clocks = document.querySelectorAll(".clock");
    for (var i=0;i<clocks.length;i++) clocks[i].textContent = now();
    if (st.phase === "pending") {
      st.left--;
      if (st.left <= 0) { st.phase = "expired"; addLog("No answer · not done", "wait"); render(); return; }
      var w = emp.querySelector(".state.wait p:last-child"); if (w) w.textContent = "Expires in " + st.left + "s";
    } else {
      var cc = ex.querySelector(".codecard");
      if (cc) cc.outerHTML = '<div class="codecard">'+ring()+'<div><div class="lbl">Your Verth code</div><div class="code'+(st.s==="call"?" big":"")+'">'+fmt(code(win()))+'</div></div></div>';
    }
  }, 1000);

  go("wa");
})();
