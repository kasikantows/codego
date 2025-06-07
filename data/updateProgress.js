const fs = require('fs');
const path = require('path');

const USERS_FILE = path.join(__dirname, 'users.txt');
const SESSIONS_FILE = path.join(__dirname, 'sessions.txt');

// Helper function to validate session
function validateSession(sessionToken) {
  return new Promise((resolve, reject) => {
    fs.readFile(SESSIONS_FILE, 'utf8', (err, data) => {
      if (err) {
        reject('Session validation failed');
        return;
      }

      const sessions = data.split('\n').filter(Boolean);
      const session = sessions.find(s => {
        const [token, , expiry] = s.split(':');
        return token === sessionToken && parseInt(expiry) > Date.now();
      });

      if (!session) {
        reject('Invalid or expired session');
        return;
      }

      resolve(session.split(':')[1]); // Return username
    });
  });
}

// Handle POST request
const http = require('http');
const server = http.createServer((req, res) => {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

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
        const { sessionToken, progress, completedLesson } = JSON.parse(data);

        // Validate session and update progress
        validateSession(sessionToken)
          .then(username => {
            fs.readFile(USERS_FILE, 'utf8', (err, fileData) => {
              if (err) {
                res.writeHead(500);
                res.end(JSON.stringify({ status: 'error', message: 'Server error' }));
                return;
              }

              const users = fileData.split('\n').filter(Boolean);
              const updatedUsers = users.map(user => {
                if (user.startsWith(username + ':')) {
                  const parts = user.split(':');
                  // Update progress if provided
                  if (progress !== undefined) {
                    parts[6] = Math.min(100, Math.max(0, parseInt(progress))).toString();
                  }
                  // Update completed lessons if provided
                  if (completedLesson) {
                    const lessons = parts[7].slice(1, -1).split(',').filter(Boolean);
                    if (!lessons.includes(completedLesson)) {
                      lessons.push(completedLesson);
                      parts[7] = `[${lessons.join(',')}]`;
                    }
                  }
                  return parts.join(':');
                }
                return user;
              });

              fs.writeFile(USERS_FILE, updatedUsers.join('\n') + '\n', err => {
                if (err) {
                  res.writeHead(500);
                  res.end(JSON.stringify({ status: 'error', message: 'Failed to update progress' }));
                  return;
                }
                res.writeHead(200);
                res.end(JSON.stringify({ status: 'success', message: 'Progress updated successfully' }));
              });
            });
          })
          .catch(error => {
            res.writeHead(401);
            res.end(JSON.stringify({ status: 'error', message: error }));
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

server.listen(3002, () => {
  console.log('Progress update server running on port 3002');
}); 