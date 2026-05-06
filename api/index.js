const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const { createServer } = require('http');
const { Server } = require('socket.io');

// Load env vars
dotenv.config();

// Connect to DB
const connectDB = require('../config/db');
if (process.env.MONGO_URI) {
  connectDB();
} else {
  console.log("No MONGO_URI provided in environment variables, skipping DB connection temporarily for build checks.");
}

const app = express();

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: "*", 
    methods: ["GET", "POST", "PATCH", "DELETE"]
  }
});

// Make io accessible from routes for server-side message broadcasting
app.set('io', io);

// Middleware
app.use(cors());
// Increase limit for base64 strings
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Routes
const authRoutes = require('../routes/auth');
const userRoutes = require('../routes/users');
const conversationRoutes = require('../routes/conversations');
const messageRoutes = require('../routes/messages');

app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/conversations', conversationRoutes);
app.use('/api/messages', messageRoutes);

// Root Endpoint
app.get('/', (req, res) => {
  res.send('Varta Backend API is running');
});

// Socket.io Implementation
io.on('connection', (socket) => {
  console.log('Connected to socket.io');

  socket.on('setup', (userData) => {
    socket.join(userData._id);
    socket.emit('connected');
  });

  socket.on('join chat', (room) => {
    socket.join(room);
    console.log('User Joined Room: ' + room);
  });

  socket.on('new message', (newMessageRecieved) => {
    var chat = newMessageRecieved.conversationId;

    if (!chat.participants) return console.log('chat.participants not defined');

    chat.participants.forEach((user) => {
      if (user._id == newMessageRecieved.senderId._id) return;
      socket.in(user._id).emit('message recieved', newMessageRecieved);
    });
  });

  socket.on('disconnect', () => {
    console.log('USER DISCONNECTED');
  });
});

const PORT = process.env.PORT || 5000;

// Start server if not in a serverless environment (like vercel requiring export app)
if (process.env.NODE_ENV !== 'production' || process.env.RENDER) {
  httpServer.listen(PORT, () => {
    console.log(`Server started on port ${PORT}`);
  });
}

// Export for Vercel
module.exports = app;
