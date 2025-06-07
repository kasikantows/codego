const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const USERS_DIR = path.join(__dirname, 'users');
const SESSIONS_FILE = path.join(__dirname, 'sessions.txt');

// Helper functions
function generateSessionToken() {
  return crypto.randomBytes(32).toString('hex');
}

function getCurrentDate() {
  return new Date().toISOString().split('T')[0];
}

function getExpiryTimestamp() {
  // Session expires in 24 hours
  return Date.now() + (24 * 60 * 60 * 1000);
}

function cleanupExpiredSessions() {
  fs.readFile(SESSIONS_FILE, 'utf8', (err, data) => {
    if (err && err.code !== 'ENOENT') return;
    
    const sessions = data ? data.split('\n').filter(Boolean) : [];
    const currentTime = Date.now();
    const validSessions = sessions.filter(session => {
      const [, , expiry] = session.split(':');
      return parseInt(expiry) > currentTime;
    });

    fs.writeFile(SESSIONS_FILE, validSessions.join('\n') + '\n', err => {
      if (err) console.error('Failed to cleanup sessions:', err);
    });
  });
}

function readUserFile(username) {
  return new Promise((resolve, reject) => {
    const userFile = path.join(USERS_DIR, `${username}.txt`);
    fs.readFile(userFile, 'utf8', (err, data) => {
      if (err) {
        reject(err);
        return;
      }

      // Parse user file content
      const userData = {};
      data.split('\n').forEach(line => {
        const [key, value] = line.split(': ');
        if (key && value) {
          userData[key.trim()] = value.trim();
        }
      });
      resolve(userData);
    });
  });
}

function updateLastLogin(username) {
  return new Promise((resolve, reject) => {
    const userFile = path.join(USERS_DIR, `${username}.txt`);
    readUserFile(username)
      .then(userData => {
        userData['Last Login'] = getCurrentDate();
        const content = Object.entries(userData)
          .map(([key, value]) => `${key}: ${value}`)
          .join('\n');
        
        fs.writeFile(userFile, content, err => {
          if (err) {
            reject(err);
            return;
          }
          resolve();
        });
      })
      .catch(reject);
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
        const { username, password } = JSON.parse(data);
        const userFile = path.join(USERS_DIR, `${username}.txt`);

        // Check if user exists
        fs.access(userFile, fs.constants.F_OK, (err) => {
          if (err) {
            res.writeHead(401);
            res.end(JSON.stringify({ status: 'error', message: 'Invalid username or password' }));
            return;
          }

          // Read user file and verify password
          readUserFile(username)
            .then(userData => {
              const passwordHash = userData['Password Hash'];
              if (bcrypt.compareSync(password, passwordHash)) {
                // Create session
                const sessionToken = generateSessionToken();
                const sessionData = `${sessionToken}:${username}:${getExpiryTimestamp()}\n`;

                // Update last login
                updateLastLogin(username)
                  .then(() => {
                    // Save session
                    fs.appendFile(SESSIONS_FILE, sessionData, err => {
                      if (err) {
                        res.writeHead(500);
                        res.end(JSON.stringify({ status: 'error', message: 'Session creation failed' }));
                        return;
                      }

                      // Clean up expired sessions
                      cleanupExpiredSessions();

                      // Send success response
                      res.writeHead(200);
                      res.end(JSON.stringify({
                        status: 'success',
                        message: 'Login successful',
                        data: {
                          sessionToken,
                          username,
                          email: userData['Email'],
                          fullName: userData['Full Name'],
                          progress: userData['Progress'],
                          completedLessons: userData['Completed Lessons']
                        }
                      }));
                    });
                  })
                  .catch(error => {
                    console.error('Error updating last login:', error);
                    res.writeHead(500);
                    res.end(JSON.stringify({ status: 'error', message: 'Failed to update login time' }));
                  });
              } else {
                res.writeHead(401);
                res.end(JSON.stringify({ status: 'error', message: 'Invalid username or password' }));
              }
            })
            .catch(error => {
              console.error('Error reading user file:', error);
              res.writeHead(500);
              res.end(JSON.stringify({ status: 'error', message: 'Server error' }));
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

server.listen(3001, () => {
  console.log('Login server running on port 3001');
  // Initial cleanup of expired sessions
  cleanupExpiredSessions();
}); 