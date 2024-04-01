const express = require('express');
const cors = require('cors');
const app = express();
const PORT = process.env.PORT || 3000;
const amplifyUrl = process.env.AMPLIFY_URL

app.use(cors({
  origin: ['http://localhost:8080', amplifyUrl]
}));

app.get('/generate-string', (req, res) => {
  // Generate a random string
  const randomString = Math.random().toString(36).substring(2, 15);
  res.json({ randomString });
});

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});