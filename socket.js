const jwt = require('jsonwebtoken');
const User = require('./models/User');

// userId -> number of open sockets (a user can have several devices / reconnect overlaps)
const connections = new Map();

const setPresence = async (io, userId, isOnline) => {
  const lastSeen = new Date();
  try {
    await User.updateOne({ _id: userId }, { isOnline, lastSeen });
  } catch (error) {
    console.error('Presence update failed', error.message);
  }
  io.emit('presence', { userId, isOnline, lastSeen });
};

const initSocket = (io) => {
  // Every socket must present a valid JWT: `io(url, { auth: { token } })`
  io.use((socket, next) => {
    try {
      const token = socket.handshake.auth && socket.handshake.auth.token;
      if (!token) return next(new Error('Not authorized, no token'));
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      socket.userId = String(decoded.id);
      next();
    } catch (error) {
      next(new Error('Not authorized, token failed'));
    }
  });

  io.on('connection', (socket) => {
    const userId = socket.userId;

    // The user's personal room. Messages are delivered here by the REST route
    // (routes/messages.js), so clients never relay messages themselves.
    socket.join(userId);
    socket.emit('connected');

    const count = (connections.get(userId) || 0) + 1;
    connections.set(userId, count);
    if (count === 1) setPresence(io, userId, true);

    // Kept for older app builds; the room is already joined above.
    socket.on('setup', () => socket.emit('connected'));

    socket.on('disconnect', () => {
      const remaining = (connections.get(userId) || 1) - 1;
      if (remaining > 0) {
        connections.set(userId, remaining);
      } else {
        connections.delete(userId);
        setPresence(io, userId, false);
      }
    });
  });
};

module.exports = initSocket;
