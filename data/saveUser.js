const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');

const USERS_DIR = path.join(__dirname, 'users');
const USERS_INDEX = path.join(__dirname, 'users.txt');

// Helper functions
function hashPassword(password) {
  return bcrypt.hashSync(password, 10);
}

function getCurrentDate() {
  return new Date().toISOString().split('T')[0];
}

function sanitizeInput(input) {
  return input.replace(/:/g, '_').trim();
}

function validateEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

function validateUsername(username) {
  // Username should be 3-20 characters, alphanumeric and underscores only
  const usernameRegex = /^[a-zA-Z0-9_]{3,20}$/;
  return usernameRegex.test(username);
}

function saveUserToFile(userData) {
  return new Promise((resolve, reject) => {
    const { username } = userData;
    const userFile = path.join(USERS_DIR, `${username}.txt`);
    
    // Create user's individual file
    const userContent = `Username: ${userData.username}
Email: ${userData.email}
Full Name: ${userData.fullName}
Join Date: ${userData.joinDate}
Last Login: ${userData.lastLogin}
Progress: ${userData.progress}
Completed Lessons: ${userData.completedLessons}
Password Hash: ${userData.hashedPassword}
`;

    fs.writeFile(userFile, userContent, err => {
      if (err) {
        reject(err);
        return;
      }

      // Add to users index
      const indexEntry = `${username}:${userData.hashedPassword}:${userData.email}:${userData.fullName}:${userData.joinDate}:${userData.lastLogin}:${userData.progress}:${userData.completedLessons}\n`;
      fs.appendFile(USERS_INDEX, indexEntry, err => {
        if (err) {
          reject(err);
          return;
        }
        resolve();
      });
    });
  });
}

// Handle POST request
const http = require('http');
const server = http.createServer((req, res) => {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  if (req.method === 'POST') {
    let data = '';
    req.on('data', chunk => {
      data += chunk;
    });

    req.on('end', () => {
      try {
        // Parse the form data
        const formData = JSON.parse(data);
        const username = sanitizeInput(formData.username);
        const password = formData.password;
        const confirmPassword = formData.confirmPassword;
        const email = sanitizeInput(formData.email);
        const fullName = sanitizeInput(formData.fullName || username);

        // Validate all inputs
        if (!username || !password || !confirmPassword || !email) {
          res.writeHead(400);
          res.end(JSON.stringify({ status: 'error', message: 'All fields are required' }));
          return;
        }

        // Validate username format
        if (!validateUsername(username)) {
          res.writeHead(400);
          res.end(JSON.stringify({ 
            status: 'error', 
            message: 'Username must be 3-20 characters long and contain only letters, numbers, and underscores' 
          }));
          return;
        }

        // Validate email format
        if (!validateEmail(email)) {
          res.writeHead(400);
          res.end(JSON.stringify({ status: 'error', message: 'Invalid email format' }));
          return;
        }

        // Check if passwords match
        if (password !== confirmPassword) {
          res.writeHead(400);
          res.end(JSON.stringify({ status: 'error', message: 'Passwords do not match' }));
          return;
        }

        // Validate password strength
        if (password.length < 8) {
          res.writeHead(400);
          res.end(JSON.stringify({ status: 'error', message: 'Password must be at least 8 characters long' }));
          return;
        }

        // Check if user already exists
        const userFile = path.join(USERS_DIR, `${username}.txt`);
        fs.access(userFile, fs.constants.F_OK, (err) => {
          if (!err) {
            res.writeHead(400);
            res.end(JSON.stringify({ status: 'error', message: 'Username already exists' }));
            return;
          }

          // Create user data
          const currentDate = getCurrentDate();
          const userData = {
            username,
            email,
            fullName,
            joinDate: currentDate,
            lastLogin: currentDate,
            progress: '0',
            completedLessons: '[]',
            hashedPassword: hashPassword(password)
          };

          // Save user data
          saveUserToFile(userData)
            .then(() => {
              res.writeHead(200);
              res.end(JSON.stringify({ status: 'success', message: 'Registration successful' }));
            })
            .catch(error => {
              console.error('Error saving user:', error);
              res.writeHead(500);
              res.end(JSON.stringify({ status: 'error', message: 'Failed to save user' }));
            });
        });
      } catch (error) {
        res.writeHead(400);
        res.end(JSON.stringify({ status: 'error', message: 'Invalid data format' }));
      }
    });
  } else {
    res.writeHead(405);
    res.end(JSON.stringify({ status: 'error', message: 'Method not allowed' }));
  }
});

server.listen(3000, () => {
  console.log('Registration server running on port 3000');
}); 