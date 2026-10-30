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
    clientId: {
      type: String, // Client-generated id, makes send retries idempotent
    },
  },
  { timestamps: true }
);

// Chat history is always read per conversation, ordered by time
messageSchema.index({ conversationId: 1, createdAt: -1 });
messageSchema.index(
  { senderId: 1, clientId: 1 },
  { unique: true, partialFilterExpression: { clientId: { $type: 'string' } } }
);

module.exports = mongoose.model('Message', messageSchema);
