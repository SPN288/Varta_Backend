const express = require('express');
const router = express.Router();
const Message = require('../models/Message');
const Conversation = require('../models/Conversation');
const { protect } = require('../middleware/authMiddleware');

// Get all messages for a conversation
router.get('/:conversationId', protect, async (req, res) => {
  try {
    const messages = await Message.find({ conversationId: req.params.conversationId })
      .populate('senderId', 'username profilePhoto email')
      .populate('conversationId');

    res.json(messages);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error fetching messages' });
  }
});

// Send a new message
router.post('/', protect, async (req, res) => {
  const { conversationId, text, isImage, imageUri, isVoice, voiceUri, duration } = req.body;

  if (!conversationId) {
    return res.status(400).json({ message: 'Invalid data passed into request' });
  }

  var newMessage = {
    senderId: req.user._id,
    conversationId,
    text,
    isImage,
    imageUri,
    isVoice,
    voiceUri,
    duration,
  };

  try {
    let message = await Message.create(newMessage);

    message = await message.populate('senderId', 'username profilePhoto email');
    message = await message.populate({
      path: 'conversationId',
      populate: {
        path: 'participants',
        select: 'username profilePhoto email',
      },
    });

    await Conversation.findByIdAndUpdate(conversationId, {
      lastMessage: message._id,
    });

    // Server-side socket broadcast for reliable real-time delivery
    const io = req.app.get('io');
    if (io && message.conversationId && message.conversationId.participants) {
      message.conversationId.participants.forEach((participant) => {
        // Don't send back to the sender (they already have it optimistically)
        if (participant._id.toString() === req.user._id.toString()) return;
        io.in(participant._id.toString()).emit('message recieved', message);
      });
    }

    res.json(message);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error sending message' });
  }
});

module.exports = router;
