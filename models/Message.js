const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema(
  {
    conversationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Conversation',
      required: true,
    },
    senderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    text: {
      type: String,
    },
    isImage: {
      type: Boolean,
      default: false,
    },
    imageUri: {
      type: String, // Base64 string
    },
    isVoice: {
      type: Boolean,
      default: false,
    },
    voiceUri: {
      type: String, // Base64 string
    },
    duration: {
      type: String, // e.g., "1:00" for voice messages
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Message', messageSchema);
