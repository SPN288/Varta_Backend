const express = require('express');
const router = express.Router();
const User = require('../models/User');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const rateLimit = require('../middleware/rateLimit');
const { EMAIL_RE, MIN_PASSWORD_LENGTH } = require('../middleware/validate');

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: 'Too many attempts, please try again in a few minutes',
});

const signToken = (user) =>
  jwt.sign({ id: user._id }, process.env.JWT_SECRET, {
    expiresIn: '30d',
  });

// Register User
router.post('/signup', authLimiter, async (req, res) => {
  try {
    const { password, profilePhoto } = req.body;
    const username = typeof req.body.username === 'string' ? req.body.username.trim() : '';
    const email = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : '';

    if (!username || !email || !password) {
      return res.status(400).json({ message: 'Please provide all required fields' });
    }
    if (!EMAIL_RE.test(email)) {
      return res.status(400).json({ message: 'Please provide a valid email address' });
    }
    if (typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH) {
      return res.status(400).json({ message: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` });
    }
    if (profilePhoto && (typeof profilePhoto !== 'string' || !profilePhoto.startsWith('data:image/'))) {
      return res.status(400).json({ message: 'Invalid profile photo' });
    }

    if (await User.exists({ email })) {
      return res.status(400).json({ message: 'User already exists with this email' });
    }
    if (await User.exists({ username })) {
      return res.status(400).json({ message: 'Username is already taken' });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const user = new User({
      username,
      email,
      password: hashedPassword,
      profilePhoto: profilePhoto || '',
    });

    await user.save();

    res.status(201).json({
      _id: user._id,
      username: user.username,
      email: user.email,
      profilePhoto: user.profilePhoto,
      token: signToken(user),
    });
  } catch (error) {
    // Unique index race between the checks above and save()
    if (error.code === 11000) {
      const field = Object.keys(error.keyPattern || {})[0] || 'email';
      return res.status(400).json({ message: `That ${field} is already in use` });
    }
    console.error(error);
    res.status(500).json({ message: 'Server Error in signup' });
  }
});

// Login User
router.post('/login', authLimiter, async (req, res) => {
  try {
    const { password } = req.body;
    const email = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : '';

    if (!email || typeof password !== 'string' || !password) {
      return res.status(400).json({ message: 'Please provide email and password' });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    res.json({
      _id: user._id,
      username: user.username,
      email: user.email,
      profilePhoto: user.profilePhoto,
      token: signToken(user),
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server Error in login' });
  }
});

module.exports = router;
