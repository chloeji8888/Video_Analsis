class RealtimeClient {
    constructor() {
        this.peerConnection = null;
        this.dataChannel = null;
        this.audioElement = null;
        this.currentResponse = '';
        this.isAssistantSpeaking = false;
        this.mediaStream = null;  // Add this to track the media stream
        this.hasSetupInputHandlers = false;  // Add this to track if input handlers are set up
    }
    static instance = null;

    static async initialize() {
        // If there's already an active instance, clean it up first
        if (RealtimeClient.instance) {
            await RealtimeClient.instance.cleanup();
        }
        RealtimeClient.instance = new RealtimeClient();
        await RealtimeClient.instance.connect();
        return RealtimeClient.instance;
    }

    async cleanup() {
        try {
            if (this.dataChannel) {
                this.dataChannel.close();
                this.dataChannel = null;
            }

            if (this.peerConnection) {
                this.peerConnection.close();
                this.peerConnection = null;
            }

            if (this.audioElement) {
                this.audioElement.remove();
                this.audioElement = null;
            }

            this.updateStatus('Connection closed');
            this.disableInputs();
        } catch (error) {
            console.error('Cleanup error:', error);
        }
    }

    async connect() {
        try {
        // Get ephemeral token
        const tokenResponse = await fetch('/session');
        if (!tokenResponse.ok) {
            throw new Error('Failed to get session token');
        }
        const data = await tokenResponse.json();
        const ephemeralKey = data.client_secret.value;

        // Create and configure peer connection
        this.peerConnection = new RTCPeerConnection();
        
        // Set up audio element
        this.audioElement = document.createElement('audio');
        this.audioElement.autoplay = true;
        document.body.appendChild(this.audioElement);

        // Handle incoming audio tracks
        this.peerConnection.ontrack = (event) => {
            this.audioElement.srcObject = event.streams[0];
            this.updateStatus('Received audio track');
        };

        // Set up local audio
        const mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaStream.getTracks().forEach(track => {
            this.peerConnection.addTrack(track, mediaStream);
        });

        // Create data channel
        this.dataChannel = this.peerConnection.createDataChannel('oai-events');
        this.setupDataChannelHandlers();

        // Create and set local description
        const offer = await this.peerConnection.createOffer();
        await this.peerConnection.setLocalDescription(offer);

        // Send offer to OpenAI
        const baseUrl = 'https://api.openai.com/v1/realtime';
        const model = 'gpt-4o-realtime-preview-2024-12-17';
        const sdpResponse = await fetch(`${baseUrl}?model=${model}`, {
            method: 'POST',
            body: offer.sdp,
            headers: {
            'Authorization': `Bearer ${ephemeralKey}`,
            'Content-Type': 'application/sdp'
            },
        });

        if (!sdpResponse.ok) {
            throw new Error('Failed to get SDP answer');
        }

        // Set remote description
        const answer = {
            type: 'answer',
            sdp: await sdpResponse.text(),
        };
        await this.peerConnection.setRemoteDescription(answer);
        
        this.updateStatus('Connection established');
        } catch (error) {
        this.updateStatus(`Error: ${error.message}`);
        console.error('Initialization error:', error);
        }
    }


    setupDataChannelHandlers() {
        this.dataChannel.onopen = () => {
        this.updateStatus('Data channel opened');
        this.enableInputs();  // Enable inputs when channel opens
        this.setupInputHandlers();  // Setup input handlers when channel opens
        };

        this.dataChannel.onclose = () => {
        this.updateStatus('Data channel closed');
        this.disableInputs();
        };

        this.dataChannel.onmessage = (event) => {
        try {
            const message = JSON.parse(event.data);
            this.handleRealtimeEvent(message);
            console.log('Received message:', message);
        } catch (error) {
            console.error('Error parsing message:', error);
        }
        };
    }

    handleRealtimeEvent(event) {
    console.log('Received event:', event);
    
    switch (event.type) {
        case 'text.delta':
            if (event.delta?.text) {
                console.log('Received text delta:', event.delta.text);
                this.handleAssistantMessage(event.delta.text);
            }
            break;
        case 'text.end':
            this.finishAssistantMessage();
            break;
        case 'speech.start':
            this.isAssistantSpeaking = true;
            break;
        case 'speech.end':
            this.isAssistantSpeaking = false;
            break;
        case 'transcript.partial':
            if (event.transcript) {
                console.log('Partial transcript:', event.transcript);
                this.updateUserTranscript(event.transcript, true);
            }
            break;
        case 'transcript.final':
            if (event.transcript) {
                console.log('Final transcript:', event.transcript);
                this.updateUserTranscript(event.transcript, false);
            }
            break;
        case 'error':
            this.updateStatus(`Error: ${event.error?.message || 'Unknown error'}`);
            break;
    }
}
    handleAssistantMessage(text) {
        console.log('Handling assistant message:', text);
        if (!this.currentResponse) {
            // Start a new assistant message
            this.currentResponse = text;
            const messageDiv = document.createElement('div');
            messageDiv.className = 'message assistant-message';
            messageDiv.innerHTML = `
                <div class="message-label">Assistant${this.isAssistantSpeaking ? ' (Speaking)' : ''}:</div>
                <div class="message-content">${text}</div>
            `;
            messageDiv.id = 'current-response';
            document.getElementById('outputArea').appendChild(messageDiv);
        } else {
            // Update existing message
            this.currentResponse += text;
            const currentMessage = document.getElementById('current-response');
            if (currentMessage) {
                currentMessage.querySelector('.message-label').textContent = 
                    `Assistant${this.isAssistantSpeaking ? ' (Speaking)' : ''}:`;
                currentMessage.querySelector('.message-content').textContent = this.currentResponse;
            }
        }
        this.scrollToBottom();
    }

    finishAssistantMessage() {
        const currentMessage = document.getElementById('current-response');
        if (currentMessage) {
            currentMessage.id = '';
        }
        this.currentResponse = '';
        this.scrollToBottom();
    }

    updateUserTranscript(text, isPartial) {
    console.log('Updating user transcript:', text, isPartial);
    let transcriptDiv = document.getElementById('current-transcript');
    
    if (!transcriptDiv && text) {
        // Create new transcript div
        transcriptDiv = document.createElement('div');
        transcriptDiv.className = 'message user-message';
        transcriptDiv.innerHTML = `
            <div class="message-label">You (Speaking${isPartial ? '...' : ''}):</div>
            <div class="message-content">${text}</div>
        `;
        transcriptDiv.id = isPartial ? 'current-transcript' : '';
        document.getElementById('outputArea').appendChild(transcriptDiv);
    } else if (transcriptDiv) {
        // Update existing transcript
        transcriptDiv.querySelector('.message-label').textContent = 
            `You (Speaking${isPartial ? '...' : ''}):`;
        transcriptDiv.querySelector('.message-content').textContent = text;
        if (!isPartial) {
            transcriptDiv.id = '';
        }
    }
    this.scrollToBottom();
}

    addUserMessage(text) {
        const messageDiv = document.createElement('div');
        messageDiv.className = 'message user-message';
        messageDiv.innerHTML = `<div class="message-label">You:</div><div class="message-content">${text}</div>`;
        document.getElementById('outputArea').appendChild(messageDiv);
        this.scrollToBottom();
    }

    scrollToBottom() {
        const outputArea = document.getElementById('outputArea');
        outputArea.scrollTop = outputArea.scrollHeight;
    }

    setupInputHandlers() {
        const sendButton = document.getElementById('sendButton');
        const textInput = document.getElementById('textInput');

        const sendMessage = () => {
            const text = textInput.value.trim();
            if (text && this.dataChannel?.readyState === 'open') {
                this.addUserMessage(text);
                const message = {
                    type: 'response.create',
                    response: {
                        modalities: ['text', 'audio'],
                        instructions: text
                    }
                };
                console.log('Sending message:', message);  // Add logging
                this.dataChannel.send(JSON.stringify(message));
                textInput.value = '';
            }
        };

        sendButton.addEventListener('click', sendMessage);
        textInput.addEventListener('keypress', (event) => {
            if (event.key === 'Enter') {
                sendMessage();
            }
        });
    }

    enableInputs() {
        const sendButton = document.getElementById('sendButton');
        const textInput = document.getElementById('textInput');
        sendButton.disabled = false;
        textInput.disabled = false;
    }

    disableInputs() {
        const sendButton = document.getElementById('sendButton');
        const textInput = document.getElementById('textInput');
        sendButton.disabled = true;
        textInput.disabled = true;
    }

    updateStatus(message) {
        const statusElement = document.getElementById('status');
        if (statusElement) {
        statusElement.textContent = message;
        }
        console.log(message);
    }
    }

    // Initialize on button click
document.getElementById('startButton').addEventListener('click', async () => {
    try {
        const startButton = document.getElementById('startButton');
        startButton.disabled = true;
        startButton.textContent = 'Connecting...';
        
        // Use the static initialize method
        await RealtimeClient.initialize();
        
        startButton.textContent = 'Connected';
    } catch (error) {
        console.error('Failed to initialize client:', error);
        const startButton = document.getElementById('startButton');
        startButton.disabled = false;
        startButton.textContent = 'Start Connection';
    }
});
