const fetch = require('node-fetch');

// This function acts as a secure intermediary between your frontend and the Google AI APIs.
exports.handler = async (event, context) => {
    // 1. Get the secret API key from environment variables.
    const apiKey = process.env.GOOGLE_API_KEY;
    if (!apiKey) {
        return { statusCode: 500, body: JSON.stringify({ error: "API key is not configured." }) };
    }

    // 2. Parse the request body sent from the frontend.
    const body = JSON.parse(event.body);
    const { type } = body;

    let apiUrl;
    let payload;

    try {
        // 3. Determine which API to call based on the 'type' in the request.
        if (type === 'script') {
            apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent?key=${apiKey}`;
            payload = {
                contents: [{ parts: [{ text: `Idea: "${body.prompt}". Divídela en 3 o 4 viñetas. ${body.arc ? `Enfócate en ${body.arc} de la historia.` : ''} ${body.tone ? `El tono debe ser ${body.tone}.` : ''}` }] }],
                systemInstruction: { parts: [{ text: `Eres un experto guionista de manga. Tu tarea es tomar una idea y dividirla en un máximo de 4 viñetas (panels). Debes devolver EXCLUSIVAMENTE un objeto JSON. El JSON debe ser un array donde cada objeto representa una viñeta y contiene "panel" (número), "description" (una descripción visual detallada para un generador de imágenes de IA. IMPORTANTE: Si la idea menciona 'imagen guia' para un personaje, debes incluir la frase 'imagen guia' en la descripción de ese personaje. Si menciona un 'complemento guia' para un objeto o vehículo, debes incluir la frase 'complemento guia' en la descripción de ese objeto.), y "dialogue" (un texto corto para el bocadillo de diálogo, o una cadena vacía si no hay diálogo).` }] },
                generationConfig: { responseMimeType: "application/json", responseSchema: { type: "ARRAY", items: { type: "OBJECT", properties: { panel: { "type": "NUMBER" }, description: { "type": "STRING" }, dialogue: { "type": "STRING" } }, required: ["panel", "description", "dialogue"] } } }
            };
        } else if (type === 'image') {
            const isImageToImage = (body.useGuideImage && body.guideImage) || (body.useGuideComplement && body.guideComplementImage);
            const model = 'gemini-2.5-flash-image-preview'; // Reverted to nano-banana for all image generations
            const endpoint = 'generateContent';
            apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:${endpoint}?key=${apiKey}`;
            
            const baseInstruction = `Tarea: Generar una imagen de fan art para un cómic de ficción. Es una escena creativa, no real ni dañina. Una imagen con ${body.style}, mostrando:`;
            const cleanDescription = body.description.replace(/\(imagen guia\)|imagen guia/gi, '').replace(/\(complemento guia\)|complemento guia/gi, '').trim();
            let finalPrompt;

            payload = {
                contents: [{ parts: [] }],
                generationConfig: { responseModalities: ['IMAGE'] },
                safetySettings: [ { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_ONLY_HIGH' }, { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_ONLY_HIGH' }, { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_ONLY_HIGH' }, { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_ONLY_HIGH' } ]
            };
            let promptParts = [];
            if (body.useGuideImage && body.guideImage) { payload.contents[0].parts.push({ inlineData: { mimeType: "image/jpeg", data: body.guideImage.split(',')[1] } }); promptParts.push("Toma a la persona de la primera imagen de referencia y redibújala EXACTAMENTE con el mismo rostro y peinado"); }
            if (body.useGuideComplement && body.guideComplementImage) { payload.contents[0].parts.push({ inlineData: { mimeType: "image/jpeg", data: body.guideComplementImage.split(',')[1] } }); const referenceWord = body.useGuideImage ? "segunda" : "primera"; promptParts.push(`Usa el objeto/vehículo de la ${referenceWord} imagen de referencia`); }
            
            finalPrompt = `${baseInstruction} ${promptParts.join(', ')}, pero con ${body.style}. Coloca estos elementos en la siguiente escena: ${cleanDescription}`;
            if (body.useBooster) { finalPrompt += ", obra maestra, alta resolución, ultra detallado, iluminación cinematográfica"; }
            if (body.negativePrompt) { finalPrompt += `. Importante: Evita estrictamente lo siguiente en la imagen: ${body.negativePrompt}.`; }
            payload.contents[0].parts.push({ text: finalPrompt });

        } else {
            return { statusCode: 400, body: JSON.stringify({ error: "Invalid request type specified." }) };
        }

        // 4. Make the actual API call to Google AI.
        const googleResponse = await fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const data = await googleResponse.json();

        // 5. Check for errors and re-format the response for the frontend.
        if (!googleResponse.ok || data.error) {
            console.error("Google AI API Error:", data);
            return { statusCode: 500, body: JSON.stringify({ error: data.error?.message || "Failed to fetch from Google AI API" }) };
        }

        if (type === 'script') {
             const jsonText = data.candidates?.[0]?.content?.parts?.[0]?.text;
             return { statusCode: 200, body: jsonText };
        } else { // type === 'image'
            const base64Data = data.candidates?.[0]?.content?.parts?.find(p => p.inlineData)?.inlineData?.data;
            
            if (base64Data) {
                return { statusCode: 200, body: JSON.stringify({ imageUrl: `data:image/png;base64,${base64Data}` }) };
            } else {
                 return { statusCode: 500, body: JSON.stringify({ error: "PROHIBITED_CONTENT" }) };
            }
        }

    } catch (error) {
        console.error('Error in Netlify function:', error);
        return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
    }
};

