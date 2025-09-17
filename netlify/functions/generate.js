/**
 * Netlify Serverless Function - Secure API Proxy
 * This function acts as a secure intermediary between your app and the Google AI API.
 * It receives requests from your app, adds the secret API key from environment variables,
 * and forwards the request to Google. The API key is never exposed to the user's browser.
 */
exports.handler = async function(event) {
    // Only allow POST requests, as that's what our app uses.
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    try {
        // Parse the request from the browser
        const { target, payload } = JSON.parse(event.body);
        
        // Securely get the API key from Netlify's environment variables
        const apiKey = process.env.GOOGLE_API_KEY;

        if (!apiKey) {
            console.error('API Key is missing from environment variables.');
            throw new Error('API key is not configured on the server.');
        }
        
        // Determine which Google API endpoint to call based on the 'target'
        let apiUrl = '';
        if (target === 'script') {
            apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent?key=${apiKey}`;
        } else if (target === 'image') {
             apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image-preview:generateContent?key=${apiKey}`;
        } else {
            return { statusCode: 400, body: 'Invalid API target specified.' };
        }

        // Forward the request to the actual Google API
        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        // Handle errors from the Google API
        if (!response.ok) {
            const errorBody = await response.text();
            console.error('Google API Error:', errorBody);
            return { statusCode: response.status, body: `Google API Error: ${errorBody}` };
        }

        // Send the successful response from Google back to the browser
        const data = await response.json();
        return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        };

    } catch (error) {
        console.error('Serverless function error:', error.message);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: error.message })
        };
    }
};

