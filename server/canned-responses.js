// Canned responses storage (in-memory with file persistence)
const fs = require('fs');
const path = require('path');

const STORAGE_FILE = path.join(__dirname, '..', 'data', 'canned-responses.json');

let responses = [];

// Load from file on startup
function loadResponses() {
  try {
    const dir = path.dirname(STORAGE_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    if (fs.existsSync(STORAGE_FILE)) {
      const data = fs.readFileSync(STORAGE_FILE, 'utf-8');
      responses = JSON.parse(data);
    }
  } catch (err) {
    console.error('Failed to load canned responses:', err.message);
    responses = [];
  }
}

function saveResponses() {
  try {
    const dir = path.dirname(STORAGE_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(STORAGE_FILE, JSON.stringify(responses, null, 2));
  } catch (err) {
    console.error('Failed to save canned responses:', err.message);
  }
}

function getResponses() {
  return responses;
}

function addResponse(text, category = 'general') {
  if (!text || typeof text !== 'string') return null;

  const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const response = {
    id,
    text: text.slice(0, 500),
    category: (category || 'general').slice(0, 20),
    createdAt: Date.now()
  };

  responses.push(response);
  saveResponses();
  return response;
}

function updateResponse(id, text, category) {
  const response = responses.find(r => r.id === id);
  if (!response) return null;

  if (text) response.text = text.slice(0, 500);
  if (category) response.category = category.slice(0, 20);
  response.updatedAt = Date.now();

  saveResponses();
  return response;
}

function deleteResponse(id) {
  const index = responses.findIndex(r => r.id === id);
  if (index === -1) return false;

  responses.splice(index, 1);
  saveResponses();
  return true;
}

// Load on module init
loadResponses();

module.exports = {
  getResponses,
  addResponse,
  updateResponse,
  deleteResponse
};
