var ws;
var audio;
var context;
var timing = 200 / 1000;
var bufferList = [];
var bufferStoreIndex = 0;
var bufferPlayIndex = 0;
var myName;
var bufferLength = 5;
var calibrationCount = 0;

(function(){
   console.log("function called");
   myName = performance.now().toString();
   document.getElementById("myName").innerHTML = myName;
   audio = document.getElementById('audio');
   for(let i = 0; i < bufferLength; i++){
      bufferList.push([]);
   }
})();

function startConnection(){
   console.log("Connection Starting...");
   context = new AudioContext();
   WebSocketInit();
}

function appendBuffer(pcm){
   for (let i = 0; i < 100; i++) {
      pcm[i] = pcm[i] * i / 100; //fade in
      pcm[pcm.length - i - 1] = pcm[pcm.length - i - 1] * i / 100;   //fade out
   }
   bufferList[bufferStoreIndex] = pcm;
   bufferStoreIndex = (bufferStoreIndex + 1) % bufferList.length;
   PlayAudio();
}

function clearOffset(){
   bufferList = [];
   for(let i = 0; i < bufferLength; i++){
      bufferList.push([]);
   }
   bufferStoreIndex = 0;
   bufferPlayIndex = 0;
   calibrationCount = 0;
   console.log("offset cleared");
}

function PlayAudio(){
   pcm = bufferList[bufferPlayIndex]
   bufferPlayIndex = (bufferPlayIndex + 1) % bufferList.length;

   var source = context.createBufferSource();
   var buffer = context.createBuffer(1, pcm.length, 48000);

   buffer.getChannelData(0).set(pcm);
   source.connect(context.destination);
   source.buffer = buffer;
   if(timing < context.currentTime){
      // timing = context.currentTime + 30 / 1000;
      console.log("recalibrated..." + timing.toString() + " -> " + context.currentTime.toString());
      timing = context.currentTime + 100 / 1000;
      calibrationCount += 1;
      if(calibrationCount >= bufferLength){
         clearOffset();
      }
   }else{
      source.start(timing);
      timing += buffer.duration;
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
      ws = new WebSocket("ws://127.0.0.1:9998/");
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
            appendBuffer(deserializePCM(received_data));
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
   result = new Float32Array(pcm);
   return result;
}

function deserializePCM(arrayBuffer){
   result = new Float32Array(arrayBuffer);
   return result;
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
   for(let name of nameArray){
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
         targetNames.push(checkbox.value);
      }
   }
   jsonString = JSON.stringify({"type": "update subscription", "targetNames": targetNames, "clientName": myName});
   ws.send(jsonString);
   clearOffset();
}