const express = require('express');
const router = express.Router();
const Conversation = require('../models/Conversation');
const User = require('../models/User');
const { protect } = require('../middleware/authMiddleware');
const { isValidId } = require('../middleware/validate');

// The conversation list only needs a preview of the last message, not its media
const LAST_MESSAGE_FIELDS = 'text isImage isVoice senderId createdAt';

// Get all conversations for a user
router.get('/', protect, async (req, res) => {
  try {
    const conversations = await Conversation.find({
      participants: req.user._id
    })
      .populate('participants', '-password')
      .populate('lastMessage', LAST_MESSAGE_FIELDS)
      .sort({ updatedAt: -1 });

    res.json(conversations);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server Error fetching conversations' });
  }
});

// Create a new 1-on-1 conversation or return existing
router.post('/', protect, async (req, res) => {
  const { userId } = req.body; // ID of the user to chat with

  if (!isValidId(userId)) {
    return res.status(400).json({ message: 'Valid userId not sent with request' });
  }
  if (userId === req.user._id.toString()) {
    return res.status(400).json({ message: 'You cannot start a conversation with yourself' });
  }

  try {
    const otherUserExists = await User.exists({ _id: userId });
    if (!otherUserExists) {
      return res.status(404).json({ message: 'User not found' });
    }

    const existing = await Conversation.findOne({
      isGroup: false,
      participants: { $all: [req.user._id, userId], $size: 2 },
    })
      .populate('participants', '-password')
      .populate('lastMessage', LAST_MESSAGE_FIELDS);

    if (existing) {
      return res.json(existing);
    }

    const createdConversation = await Conversation.create({
      participants: [req.user._id, userId],
      isGroup: false,
    });
    const fullConversation = await Conversation.findById(createdConversation._id)
      .populate('participants', '-password');

    res.status(201).json(fullConversation);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error creating conversation' });
  }
});

// Create Group Conversation
router.post('/group', protect, async (req, res) => {
  const name = typeof req.body.name === 'string' ? req.body.name.trim() : '';
  let users = req.body.users;

  if (!users || !name) {
    return res.status(400).json({ message: 'Please fill all the fields' });
  }

  // Accept either an array or a JSON-encoded array of user IDs
  if (typeof users === 'string') {
    try {
      users = JSON.parse(users);
    } catch {
      return res.status(400).json({ message: 'users must be an array of user IDs' });
    }
  }
  if (!Array.isArray(users) || !users.every(isValidId)) {
    return res.status(400).json({ message: 'users must be an array of user IDs' });
  }

  const creatorId = req.user._id.toString();
  const members = [...new Set(users)].filter((id) => id !== creatorId);

  if (members.length < 2) {
    return res.status(400).json({ message: 'At least 2 other users are required to form a group chat' });
  }

  try {
    const foundCount = await User.countDocuments({ _id: { $in: members } });
    if (foundCount !== members.length) {
      return res.status(400).json({ message: 'One or more users do not exist' });
    }

    const groupConversation = await Conversation.create({
      groupName: name,
      participants: [...members, creatorId],
      isGroup: true,
    });

    const fullGroupConversation = await Conversation.findById(groupConversation._id)
      .populate("participants", "-password");

    res.status(201).json(fullGroupConversation);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error creating group conversation' });
  }
});

module.exports = router;
