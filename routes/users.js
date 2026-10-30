const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const { protect } = require('../middleware/authMiddleware');
const { escapeRegex, MIN_PASSWORD_LENGTH } = require('../middleware/validate');

const MAX_SEARCH_RESULTS = 50;
const MAX_SEARCH_LENGTH = 50;

// Get all users (except current user)
router.get('/', protect, async (req, res) => {
  try {
    // Search query if provided; escaped so it is matched literally
    const search = typeof req.query.search === 'string' ? req.query.search.trim().slice(0, MAX_SEARCH_LENGTH) : '';
    const keyword = search
      ? {
          $or: [
            { username: { $regex: escapeRegex(search), $options: 'i' } },
            { email: { $regex: escapeRegex(search), $options: 'i' } },
          ],
        }
      : {};

    const users = await User.find({ ...keyword, _id: { $ne: req.user._id } })
      .select('-password')
      .sort({ username: 1 })
      .limit(MAX_SEARCH_RESULTS);
    res.json(users);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server Error fetching users' });
  }
});

// Get user profile
router.get('/profile', protect, async (req, res) => {
  // protect already loaded the user (without password)
  res.json(req.user);
});

// Update profile details
router.patch('/profile', protect, async (req, res) => {
  try {
    const { profilePhoto, username, password } = req.body;
    const user = await User.findById(req.user._id);

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    if (profilePhoto !== undefined) {
      if (typeof profilePhoto !== 'string' || (profilePhoto && !profilePhoto.startsWith('data:image/'))) {
        return res.status(400).json({ message: 'Invalid profile photo' });
      }
      user.profilePhoto = profilePhoto;
    }

    if (username !== undefined) {
      const trimmed = typeof username === 'string' ? username.trim() : '';
      if (!trimmed) {
        return res.status(400).json({ message: 'Username cannot be empty' });
      }
      if (trimmed !== user.username && (await User.exists({ username: trimmed, _id: { $ne: user._id } }))) {
        return res.status(400).json({ message: 'Username is already taken' });
      }
      user.username = trimmed;
    }

    if (password) {
      if (typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH) {
        return res.status(400).json({ message: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` });
      }
      const salt = await bcrypt.genSalt(10);
      user.password = await bcrypt.hash(password, salt);
    }

    await user.save();
    res.json({
      _id: user._id,
      username: user.username,
      email: user.email,
      profilePhoto: user.profilePhoto,
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ message: 'Username is already taken' });
    }
    console.error(error);
    res.status(500).json({ message: 'Server Error updating profile' });
  }
});

module.exports = router;
