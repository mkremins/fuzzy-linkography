const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const app = express();

// Serve static files
app.use(express.static('.'));

// API endpoint to list files
app.get('/api/list-files', async (req, res) => {
    try {
        const files = await fs.readdir('./linkograph_data');
        const jsonFiles = files.filter(file => file.endsWith('.json'));
        res.json(jsonFiles);
    } catch (error) {
        res.status(500).json({ error: 'Error reading directory' });
    }
});

const PORT = 3000;
app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
}); 