var ws;
var audio;
var context;
var clientChannelMap;

var bufferLength = 5;
var myName;
var serverIp;


(function(){
   console.log("function called");
   myName = Math.round((performance.now() * 10000)).toString();
   document.getElementById("myName").innerHTML = myName;
   audio = document.getElementById('audio');
   serverIp = document.getElementById("serverIpSelect").value;
   clientChannelMap = new Map();
})();

class ClientChannel{
   constructor(name){
      this.name = name;
      this.timing = 200 / 1000;
      this.bufferList = [];
      this.bufferStoreIndex = 0;
      this.bufferPlayIndex = 0;
      this.calibrateCount = 0;
      
      for(let i = 0; i < bufferLength; i++){
         this.bufferList.push([]);
      }
   }
}

function startConnection(){
   console.log("Connection Starting...");
   context = new AudioContext();
   document.getElementById("serverIpSelect").disabled = true;
   document.getElementById("startBtn").disabled = true;
   WebSocketInit();
}

function appendBuffer(name, pcm){
   for (let i = 0; i < 100; i++) {
      pcm[i] = pcm[i] * i / 100; //fade in
      pcm[pcm.length - i - 1] = pcm[pcm.length - i - 1] * i / 100;   //fade out
   }
   var client = clientChannelMap.get(name);
   client.bufferList[client.bufferStoreIndex] = pcm;
   client.bufferStoreIndex = (client.bufferStoreIndex + 1) % client.bufferList.length;
   PlayAudio(name);
}

function clearOffset(name){
   var client = clientChannelMap.get(name);

   client.bufferList = [];
   for(let i = 0; i < bufferLength; i++){
      client.bufferList.push([]);
   }
   client.bufferStoreIndex = 0;
   client.bufferPlayIndex = 0;
   client.calibrationCount = 0;
   console.log("offset cleared for: " + client.name.toString());
}

function PlayAudio(name){
   var client = clientChannelMap.get(name);

   var pcm = client.bufferList[client.bufferPlayIndex]
   client.bufferPlayIndex = (client.bufferPlayIndex + 1) % client.bufferList.length;

   var source = context.createBufferSource();
   var buffer = context.createBuffer(1, pcm.length, 48000);

   buffer.getChannelData(0).set(pcm);
   source.connect(context.destination);
   source.buffer = buffer;
   if(client.timing < context.currentTime){
      // timing = context.currentTime + 30 / 1000;
      console.log("recalibrated..." + client.timing.toString() + " -> " + context.currentTime.toString());
      client.timing = context.currentTime + 100 / 1000;
      client.calibrationCount += 1;
      if(client.calibrationCount >= bufferLength){
         clearOffset(name);
      }
   }else{
      source.start(client.timing);
      client.timing += buffer.duration;
   }
}

function SendAudio(){
   var audio = document.getElementById('audio');

   navigator.getMedia = navigator.getUserMedia ||
                          navigator.webkitGetUserMedia ||
                          navigator.mozGetUserMedia ||
                          navigator.msGetUserMedia;

   navigator.getMedia({
      // video: true//,
      audio: true
   }, function(stream){
      // audio.srcObject = stream;
      ws.send(JSON.stringify({"type": "register", "role": "Audio Combined", "name": myName}));
      // ws.send("Audio Combined");
      
      var source = context.createMediaStreamSource(stream);
      var processor = context.createScriptProcessor(1024, 1, 1);
  
      source.connect(processor);
      processor.connect(context.destination);

      processor.onaudioprocess = function(e) {
         ws.send(serializePCM(e.inputBuffer.getChannelData(0)));
      };

   }, function(error){
      console.error(error.code);
   })
}

function WebSocketInit() {
   if ("WebSocket" in window) {
   //   alert("WebSocket is supported by your Browser!");
     
      // Let us open a web socket
      ws = new WebSocket(serverIp);
      ws.binaryType = "arraybuffer";

      ws.onopen = function() {
         // Web Socket is connected, send data using send()
         SendAudio();
         // alert("Message is sent...");
      };

      ws.onmessage = function (evt) {
         var received_data = evt.data;
         // alert("Message is received...");
         if(typeof(received_data) == 'string' || received_data instanceof String){
            jsonObject = JSON.parse(received_data);
            if(jsonObject.type == "message"){
               console.log("Message Received: " + jsonObject.message);
            }else if(jsonObject.type == "update client changes"){
               //due to the current/suboptimal implementation of JSON in java server, the names array still a string to be parsed.
               updateTargetNames(JSON.parse(jsonObject.names));
            }
         }else{
            console.log("Audio Received");
            let [name, pcm] = deserializePCM(received_data);
            appendBuffer(name, pcm);
         }
      };

      ws.onclose = function() { 
        setTimeout(WebSocketInit, 1000);
        // websocket is closed.
        alert("Connection is closed..."); 
      };
   } else {
     // The browser doesn't support WebSocket
     alert("WebSocket NOT supported by your Browser!");
   }
}

function serializePCM(pcm){
   nameArray = new Float32Array(1);
   nameArray[0] = myName;
   result = new Float32Array(concatTypedArray(nameArray, pcm));
   return result;
}

function deserializePCM(arrayBuffer){
   result = new Float32Array(arrayBuffer);
   audioBuffer = result.slice(1);
   name = Math.round(result[0]).toString();
   return [name, audioBuffer];
}

function concatTypedArray(a, b){
   var c = new (a.constructor)(a.length + b.length);
   c.set(a, 0);
   c.set(b, a.length);
   return c;
}

function updateTargetNames(nameArray){
   let selectedNames = []
   let checkboxList = document.getElementsByClassName("targetSelection");
   for(checkbox of checkboxList){
      if(checkbox.checked){
         selectedNames.push(checkbox.value);
      }
   }

   let ul = document.getElementById("targetNameList");
   while(ul.lastChild){
      ul.removeChild(ul.lastChild);
   }
   for(let nameRaw of nameArray){
      name = Math.round(parseFloat(nameRaw));
      let li = document.createElement("li");
      let checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.className = "targetSelection";
      checkbox.value = name;
      checkbox.onclick = updateSubscription;
      let label = document.createElement("label");
      label.appendChild(document.createTextNode(name));
      li.appendChild(checkbox);
      li.appendChild(label);
      ul.appendChild(li);
   }

   checkboxList = document.getElementsByClassName("targetSelection");
   for(checkbox of checkboxList){
      if(selectedNames.includes(checkbox.value)){
         checkbox.checked = true;
      }
   }
   updateSubscription();

}

function updateSubscription(){
   let checkboxList = document.getElementsByClassName("targetSelection");
   let targetNames = []
   for(let checkbox of checkboxList){
      if(checkbox.checked){
         name = checkbox.value;
         targetNames.push(name);
         if(clientChannelMap.get(name) == undefined){
            clientChannelMap.set(name, new ClientChannel(name));
         }
      }
   }
   for(let client of clientChannelMap){
      if(targetNames.indexOf(client.name) == -1){
         clientChannelMap.delete(client.name);
      }
   }
   jsonString = JSON.stringify({"type": "update subscription", "targetNames": targetNames, "clientName": myName});
   ws.send(jsonString);
   for(let name of targetNames){
      clearOffset(name);
   }
}

function changeIp(){
   serverIp = document.getElementById("serverIpSelect").value;
}