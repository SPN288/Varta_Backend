const express = require('express');
const router = express.Router();
const Message = require('../models/Message');
const Conversation = require('../models/Conversation');
const { protect } = require('../middleware/authMiddleware');
const { isValidId } = require('../middleware/validate');

const DEFAULT_LIMIT = 30;
const MAX_LIMIT = 100;
const MAX_TEXT_LENGTH = 5000;
// Only the fields the chat UI needs; profile photos are already on the conversation
const SENDER_FIELDS = 'username';

const parseDate = (value) => {
  if (value === undefined) return undefined;
  const date = new Date(value);
  return isNaN(date.getTime()) ? null : date;
};

// Get messages for a conversation.
//   ?limit=N            latest N messages
//   ?before=<ISO date>  N messages older than the date (scroll back through history)
//   ?after=<ISO date>   N messages newer than the date (catch up after reopening a chat)
// Always returned in chronological order.
router.get('/:conversationId', protect, async (req, res) => {
  try {
    const { conversationId } = req.params;
    if (!isValidId(conversationId)) {
      return res.status(400).json({ message: 'Invalid conversation id' });
    }

    const isMember = await Conversation.exists({ _id: conversationId, participants: req.user._id });
    if (!isMember) {
      return res.status(404).json({ message: 'Conversation not found' });
    }

    const after = parseDate(req.query.after);
    const before = parseDate(req.query.before);
    if (after === null || before === null) {
      return res.status(400).json({ message: 'Invalid date' });
    }

    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || DEFAULT_LIMIT, 1), MAX_LIMIT);

    const query = { conversationId };
    if (after || before) {
      query.createdAt = {};
      if (after) query.createdAt.$gt = after;
      if (before) query.createdAt.$lt = before;
    }

    // Catching up reads forward from `after`; everything else reads back from the newest
    const ascending = Boolean(after) && !before;
    let messages = await Message.find(query)
      .sort({ createdAt: ascending ? 1 : -1 })
      .limit(limit)
      .populate('senderId', SENDER_FIELDS);

    if (!ascending) messages = messages.reverse();

    res.json(messages);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error fetching messages' });
  }
});

// Send a new message
router.post('/', protect, async (req, res) => {
  const { conversationId, text, isImage, imageUri, isVoice, voiceUri, duration, clientId } = req.body;

  if (!isValidId(conversationId)) {
    return res.status(400).json({ message: 'Invalid data passed into request' });
  }
  if (clientId !== undefined && (typeof clientId !== 'string' || clientId.length > 100)) {
    return res.status(400).json({ message: 'Invalid clientId' });
  }

  const newMessage = { senderId: req.user._id, conversationId, clientId };

  if (isImage) {
    if (typeof imageUri !== 'string' || !imageUri.startsWith('data:image/')) {
      return res.status(400).json({ message: 'Invalid image' });
    }
    Object.assign(newMessage, { isImage: true, imageUri });
  } else if (isVoice) {
    if (typeof voiceUri !== 'string' || !voiceUri.startsWith('data:audio/')) {
      return res.status(400).json({ message: 'Invalid voice message' });
    }
    if (duration !== undefined && (typeof duration !== 'string' || !/^\d{1,2}:\d{2}$/.test(duration))) {
      return res.status(400).json({ message: 'Invalid duration' });
    }
    Object.assign(newMessage, { isVoice: true, voiceUri, duration });
  } else {
    if (typeof text !== 'string' || !text.trim()) {
      return res.status(400).json({ message: 'Message cannot be empty' });
    }
    if (text.length > MAX_TEXT_LENGTH) {
      return res.status(400).json({ message: `Message is too long (max ${MAX_TEXT_LENGTH} characters)` });
    }
    newMessage.text = text.trim();
  }

  try {
    const conversation = await Conversation.findOne({ _id: conversationId, participants: req.user._id });
    if (!conversation) {
      return res.status(404).json({ message: 'Conversation not found' });
    }

    // A retry of a message the server already stored: return it instead of creating a duplicate
    if (clientId) {
      const existing = await Message.findOne({ senderId: req.user._id, clientId }).populate('senderId', SENDER_FIELDS);
      if (existing) return res.json(existing);
    }

    let message;
    try {
      message = await Message.create(newMessage);
    } catch (error) {
      // Two concurrent retries raced past the check above
      if (error.code === 11000 && clientId) {
        const existing = await Message.findOne({ senderId: req.user._id, clientId }).populate('senderId', SENDER_FIELDS);
        return res.json(existing);
      }
      throw error;
    }

    message = await message.populate('senderId', SENDER_FIELDS);

    // Also bumps updatedAt, which orders the conversation list
    await Conversation.updateOne({ _id: conversationId }, { lastMessage: message._id });

    // Server-side socket broadcast; clients never relay messages themselves
    const io = req.app.get('io');
    if (io) {
      conversation.participants.forEach((participantId) => {
        // Don't send back to the sender (they already have it optimistically)
        if (participantId.toString() === req.user._id.toString()) return;
        io.to(participantId.toString()).emit('message recieved', message);
      });
    }

    res.status(201).json(message);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error sending message' });
  }
});

module.exports = router;
