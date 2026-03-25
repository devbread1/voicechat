const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" }
});

app.use(express.static(path.join(__dirname, "public")));

// Store rooms: { roomId: { users: { socketId: { name, muted } } } }
const rooms = {};

io.on("connection", (socket) => {
  console.log("User connected:", socket.id);

  // Join a room
  socket.on("join-room", ({ roomId, userName }) => {
    socket.join(roomId);
    socket.roomId = roomId;
    socket.userName = userName;

    if (!rooms[roomId]) rooms[roomId] = { users: {} };
    rooms[roomId].users[socket.id] = { name: userName, muted: false };

    // Tell existing users about new user
    socket.to(roomId).emit("user-joined", {
      socketId: socket.id,
      userName,
      users: rooms[roomId].users
    });

    // Send current room state to new user
    socket.emit("room-state", {
      users: rooms[roomId].users,
      roomId
    });

    console.log(`${userName} joined room ${roomId}`);
  });

  // WebRTC Signaling
  socket.on("offer", ({ to, offer }) => {
    socket.to(to).emit("offer", { from: socket.id, offer });
  });

  socket.on("answer", ({ to, answer }) => {
    socket.to(to).emit("answer", { from: socket.id, answer });
  });

  socket.on("ice-candidate", ({ to, candidate }) => {
    socket.to(to).emit("ice-candidate", { from: socket.id, candidate });
  });

  // Chat message
  socket.on("chat-message", ({ roomId, message }) => {
    const user = rooms[roomId]?.users[socket.id];
    if (!user) return;
    io.to(roomId).emit("chat-message", {
      from: socket.id,
      userName: user.name,
      message,
      time: new Date().toLocaleTimeString("ar", { hour: "2-digit", minute: "2-digit" })
    });
  });

  // Mute toggle
  socket.on("toggle-mute", ({ muted }) => {
    const roomId = socket.roomId;
    if (rooms[roomId]?.users[socket.id]) {
      rooms[roomId].users[socket.id].muted = muted;
      io.to(roomId).emit("user-muted", { socketId: socket.id, muted });
    }
  });

  // Disconnect
  socket.on("disconnect", () => {
    const roomId = socket.roomId;
    if (roomId && rooms[roomId]) {
      delete rooms[roomId].users[socket.id];
      if (Object.keys(rooms[roomId].users).length === 0) {
        delete rooms[roomId];
      } else {
        socket.to(roomId).emit("user-left", { socketId: socket.id });
      }
    }
    console.log("User disconnected:", socket.id);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
