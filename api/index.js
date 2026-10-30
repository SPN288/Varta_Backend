const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const { createServer } = require('http');
const { Server } = require('socket.io');

// Load env vars
dotenv.config();

if (!process.env.JWT_SECRET) {
  console.error('ERROR: JWT_SECRET is not set. Login, signup and sockets will fail.');
} else if (process.env.JWT_SECRET.length < 32 || /^your[_-]/i.test(process.env.JWT_SECRET)) {
  console.warn('WARNING: JWT_SECRET looks weak. Use a long random value (32+ chars) in production.');
}

// Connect to DB
const connectDB = require('../config/db');
if (process.env.MONGO_URI) {
  // Nobody is connected to a freshly started server; clear presence left over from a restart
  connectDB().then(() =>
    require('../models/User').updateMany({ isOnline: true }, { isOnline: false })
  ).catch((error) => console.error('Failed to reset presence', error.message));
} else {
  console.log("No MONGO_URI provided in environment variables, skipping DB connection temporarily for build checks.");
}

// Log instead of crashing the whole server (and every user's connection) on a stray rejection
process.on('unhandledRejection', (reason) => {
  console.error('Unhandled promise rejection:', reason);
});

const app = express();

// Render and similar hosts sit behind a proxy; needed for correct req.ip in rate limiting
app.set('trust proxy', 1);

// The mobile app doesn't send an Origin header, so CORS only affects browsers.
// Set CORS_ORIGIN (comma-separated) to allow specific web origins.
const corsOrigin = process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',').map((o) => o.trim()) : false;

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: corsOrigin,
    methods: ["GET", "POST", "PATCH", "DELETE"]
  }
});

// Make io accessible from routes for server-side message broadcasting
app.set('io', io);

// Middleware
app.use(cors({ origin: corsOrigin }));
// Media is sent as base64; images are capped at 5 MB on the client (~6.7 MB as base64)
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

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

// JSON error responses (malformed JSON, oversized bodies, unexpected errors)
app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  const status = err.status || err.statusCode || 500;
  if (status >= 500) console.error(err);
  const message =
    err.type === 'entity.too.large' ? 'Request is too large'
    : err.type === 'entity.parse.failed' ? 'Malformed JSON'
    : status >= 500 ? 'Server Error'
    : err.message;
  res.status(status).json({ message });
});

// Socket.io Implementation
require('../socket')(io);

const PORT = process.env.PORT || 5000;

// Start server if not in a serverless environment (like vercel requiring export app)
if (process.env.NODE_ENV !== 'production' || process.env.RENDER) {
  httpServer.listen(PORT, () => {
    console.log(`Server started on port ${PORT}`);
  });
}

// Export for Vercel
module.exports = app;
