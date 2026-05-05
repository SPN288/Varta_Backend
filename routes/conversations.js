const express = require('express');
const router = express.Router();
const Conversation = require('../models/Conversation');
const User = require('../models/User');
const { protect } = require('../middleware/authMiddleware');

// Get all conversations for a user
router.get('/', protect, async (req, res) => {
  try {
    const conversations = await Conversation.find({
      participants: { $in: [req.user._id] }
    })
      .populate('participants', '-password')
      .populate('lastMessage')
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

  if (!userId) {
    return res.status(400).json({ message: 'UserId param not sent with request' });
  }

  try {
    let conversation = await Conversation.find({
      isGroup: false,
      $and: [
        { participants: { $elemMatch: { $eq: req.user._id } } },
        { participants: { $elemMatch: { $eq: userId } } }
      ]
    })
      .populate('participants', '-password')
      .populate('lastMessage');

    if (conversation.length > 0) {
      res.json(conversation[0]);
    } else {
      var conversationData = {
        participants: [req.user._id, userId],
        isGroup: false,
      };

      const createdConversation = await Conversation.create(conversationData);
      const fullConversation = await Conversation.findOne({ _id: createdConversation._id })
        .populate('participants', '-password');
        
      res.status(200).json(fullConversation);
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error creating conversation' });
  }
});

// Create Group Conversation
router.post('/group', protect, async (req, res) => {
  if (!req.body.users || !req.body.name) {
    return res.status(400).send({ message: "Please fill all the fields" });
  }

  var users = JSON.parse(req.body.users); // Array of user IDs

  if (users.length < 2) {
    return res.status(400).send("More than 2 users are required to form a group chat");
  }

  // Add the creator
  users.push(req.user._id);

  try {
    const groupConversation = await Conversation.create({
      groupName: req.body.name,
      participants: users,
      isGroup: true,
    });

    const fullGroupConversation = await Conversation.findOne({ _id: groupConversation._id })
      .populate("participants", "-password");

    res.status(200).json(fullGroupConversation);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error creating group conversation' });
  }
});

module.exports = router;
