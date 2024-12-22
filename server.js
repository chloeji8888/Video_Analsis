import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import multer from 'multer'; // Add this for handling file uploads
import fs from 'fs';
import fsPromises from 'fs/promises';  // Use promises version for async/await
import cors from 'cors';  // Add this import
import dotenv from 'dotenv';
dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

// Configure CORS with more permissive options
app.use(cors({
    origin: true, // Allow all origins
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true
}));

// Add this near the top with other imports
app.use(express.json({limit: '50mb'}));  // Add this line to handle JSON bodies

// Serve static files from public directory
app.use(express.static('public'));
// app.use('/uploads', express.static(uploadsDir)); // Serve uploaded files

// Add validation
if (!process.env.OPENAI_API_KEY) {
    console.error('OPENAI_API_KEY is not set in environment variables');
    process.exit(1);
}

// Endpoint to get ephemeral token
app.get('/session', async (req, res) => {
  try {
    const response = await fetch('https://api.openai.com/v1/realtime/sessions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-realtime-preview-2024-12-17',
        voice: 'verse',
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    res.json(data);
    res.send(data);
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Failed to get session token' });
  }
});


app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Add endpoint to analyze image with OpenAI
app.post('/analyze-image', async (req, res) => {
    try {
        const { image } = req.body;
        
        // More detailed validation logging
        console.log('=== Debug Info ===');
        console.log('Image data received:', !!image);
        console.log('Image length:', image ? image.length : 0);
        console.log('API Key present:', !!process.env.OPENAI_API_KEY);
        
        // Validate image data format
        if (!image || typeof image !== 'string') {
            console.error('Invalid image data format');
            return res.status(400).json({ 
                error: 'Invalid image data format',
                details: 'Image data must be a base64 string'
            });
        }

        // Try to validate base64 format
        try {
            const base64Regex = /^([A-Za-z0-9+/]{4})*([A-Za-z0-9+/]{3}=|[A-Za-z0-9+/]{2}==)?$/;
            if (!base64Regex.test(image)) {
                console.error('Invalid base64 format');
                return res.status(400).json({
                    error: 'Invalid base64 format',
                    details: 'Image data is not properly base64 encoded'
                });
            }
        } catch (e) {
            console.error('Base64 validation error:', e);
        }

        // Verify OpenAI API key
        if (!process.env.OPENAI_API_KEY) {
            console.error('OpenAI API key is not set');
            return res.status(500).json({ error: 'OpenAI API key is not configured' });
        }

        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model: "gpt-4o-mini",
                messages: [
                    {
                        role: "user",
                        content: [
                            { type: "text", text: "What's in this image?" },
                            {
                                type: "image_url",
                                image_url: {
                                    url: `data:image/jpeg;base64,${image}`
                                }
                            }
                        ]
                    }
                ],
                max_tokens: 300
            })
        });

        // Add response logging
        console.log('OpenAI API Status:', response.status);
        const responseText = await response.text();
        console.log('OpenAI API Response:', responseText);

        if (!response.ok) {
            throw new Error(`OpenAI API error: ${response.status} - ${responseText}`);
        }

        const analysis = JSON.parse(responseText);
        global.lastAnalysis = analysis;
        res.json(analysis);
    } catch (error) {
        console.error('Detailed error analyzing image:', error);
        res.status(500).json({ error: 'Failed to analyze image', details: error.message });
    }
});

// Endpoint to check image analysis status
app.get('/check-analysis', async (req, res) => {
    try {
        // Return the latest analysis result if available
        if (global.lastAnalysis) {
            res.json({ 
                status: 'complete',
                result: global.lastAnalysis 
            });
        } else {
            res.json({
                status: 'no_analysis',
                message: 'No image analysis has been performed yet'
            });
        }
    } catch (error) {
        console.error('Error checking analysis:', error);
        res.status(500).json({ 
            status: 'error',
            error: 'Failed to check analysis status'
        });
    }
});


const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});