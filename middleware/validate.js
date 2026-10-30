const mongoose = require('mongoose');

const isValidId = (id) => typeof id === 'string' && mongoose.Types.ObjectId.isValid(id);

// Escape user input before using it inside a RegExp
const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 6;

module.exports = { isValidId, escapeRegex, EMAIL_RE, MIN_PASSWORD_LENGTH };
