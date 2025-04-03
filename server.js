const express = require("express");
const http = require("http");
const socketIo = require("socket.io");
const cors = require("cors");

const app = express();
const server = http.createServer(app);

// Enhanced CORS configuration
const io = socketIo(server, {
  cors: {
    origin: process.env.NODE_ENV === "production" 
      ? ["https://your-production-domain.com"] 
      : ["http://localhost:5500", "http://127.0.0.1:5500"],
    methods: ["GET", "POST"]
  },
  connectionStateRecovery: {
    maxDisconnectionDuration: 120000, // 2 minutes
    skipMiddlewares: true
  }
});

// Middleware
app.use(cors());
app.use(express.static("public"));

// Track connected users and their locations
const users = new Map(); // Using Map for better performance

// Connection handler
io.on("connection", (socket) => {
  console.log(`✅ New connection: ${socket.id}`);
  
  // Initialize user data
  users.set(socket.id, { 
    connectedAt: new Date(),
    lastUpdated: null,
    coords: null
  });

  // 1. Send initial user count to ALL clients
  broadcastUserCount();

  // Location update handler
  socket.on("updateLocation", (coords) => {
    try {
      if (!coords || typeof coords.latitude !== "number" || typeof coords.longitude !== "number") {
        throw new Error("Invalid coordinates format");
      }

      // Update user data
      const userData = users.get(socket.id);
      userData.coords = coords;
      userData.lastUpdated = new Date();
      
      // Broadcast to all OTHER clients
      socket.broadcast.emit("locationUpdate", {
        id: socket.id,
        coords,
        timestamp: Date.now()
      });

    } catch (error) {
      console.error(`❌ Error processing location from ${socket.id}:`, error.message);
      socket.emit("error", "Invalid location data");
    }
  });

  // Disconnection handler
  socket.on("disconnect", (reason) => {
    console.log(`❌ Disconnected: ${socket.id} (${reason})`);
    users.delete(socket.id);
    
    // 2. Update user count after disconnection
    broadcastUserCount();
    
    // Notify others to remove this user's marker
    socket.broadcast.emit("userDisconnected", socket.id);
  });

  // Error handler
  socket.on("error", (error) => {
    console.error(`Socket error (${socket.id}):`, error);
  });
});

// Helper function to broadcast user count
function broadcastUserCount() {
  const count = users.size;
  console.log(`🔄 Active users: ${count}`);
  io.emit("userCount", {
    count,
    timestamp: Date.now()
  });
}

// Health check endpoint
app.get("/health", (req, res) => {
  res.status(200).json({
    status: "healthy",
    users: users.size,
    uptime: process.uptime()
  });
});

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`🔵 Socket.IO ${io.engine.clientsCount} clients capacity`);
});

// Cleanup inactive users periodically
setInterval(() => {
  const now = new Date();
  let cleaned = 0;
  
  users.forEach((user, id) => {
    if (user.lastUpdated && (now - user.lastUpdated) > 300000) { // 5 minutes inactive
      users.delete(id);
      cleaned++;
      io.emit("userDisconnected", id);
    }
  });
  
  if (cleaned > 0) {
    console.log(`🧹 Cleaned ${cleaned} inactive users`);
    broadcastUserCount();
  }
}, 60000); // Run every minute