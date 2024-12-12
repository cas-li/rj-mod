const chat = document.getElementById('chat');
const messageInput = document.getElementById('message');
const sendButton = document.getElementById('send');
const roleSelector = document.getElementById('roleSelector');

const userId = Math.random().toString(36).substr(2, 9);
console.log("Client userId generated:", userId);

let role = 'user';

roleSelector.onchange = (event) => {
  role = event.target.value;
  console.log("Role changed to:", role);
  socket.send(JSON.stringify({ type: 'role', role }));
};

const socket = new WebSocket(Deno.env.get("WEBSOCKET_URL")!);

socket.onopen = () => {
  console.log("WebSocket connection established.");
  socket.send(JSON.stringify({ type: 'register', userId }));
};

socket.onerror = (error) => {
  console.error("WebSocket error:", error);
};

socket.onclose = () => {
  console.log("WebSocket connection closed.");
};

socket.onmessage = (event) => {
  const data = JSON.parse(event.data);
  console.log("Message received:", data);

  const message = document.createElement('div');
  
  if (data.type === "suggested_response") {
    message.textContent = `Suggested Response: ${data.message}`;
    message.className = 'message suggestion';
  } else if (data.senderId === userId) {
    message.textContent = data.message;
    message.className = 'message sent';
  } else {
    message.textContent = data.message;
    message.className = 'message received';
  }

  chat.appendChild(message);
  chat.scrollTop = chat.scrollHeight;
};

sendButton.onclick = () => {
  const message = messageInput.value;
  if (message) {
    socket.send(JSON.stringify({ senderId: userId, message }));
    messageInput.value = '';
  }
};
