const { io } = require("socket.io-client");
console.log("Connecting to app.marfim.org...");
const socket = io("https://app.marfim.org");

socket.on("connect", () => {
  console.log("Connected with id:", socket.id);
  console.log("Emitting test message...");
  socket.emit("user_message", { text: "Mensagem do script de teste via socket" });
});

socket.on("message_sent", (data) => {
  console.log("Server confirmed message sent:", data);
  process.exit(0);
});

socket.on("connect_error", (err) => {
  console.log("Connection error:", err.message);
  process.exit(1);
});

setTimeout(() => {
  console.log("Timeout waiting for response");
  process.exit(1);
}, 10000);
