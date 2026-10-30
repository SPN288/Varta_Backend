const jwt = require('jsonwebtoken');
const User = require('../models/User');

const protect = async (req, res, next) => {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : null;

  if (!token) {
    return res.status(401).json({ message: 'Not authorized, no token' });
  }

  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET);
  } catch (error) {
    return res.status(401).json({ message: 'Not authorized, token failed' });
  }

  try {
    const user = await User.findById(decoded.id).select('-password');
    // Token is valid but the account no longer exists
    if (!user) {
      return res.status(401).json({ message: 'Not authorized, user not found' });
    }
    req.user = user;
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Server Error during authorization' });
  }

  next();
};

module.exports = { protect };
