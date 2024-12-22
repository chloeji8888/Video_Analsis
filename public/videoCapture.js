class VideoCapture {
    constructor() {
        this.videoElement = document.createElement('video');
        this.videoElement.autoplay = true;
        this.videoElement.playsInline = true;
        this.canvas = document.createElement('canvas');
        this.captureInterval = null;
        
        // Add some styling to position the video
        this.videoElement.style.width = '320px';
        this.videoElement.style.position = 'fixed';
        this.videoElement.style.bottom = '20px';
        this.videoElement.style.right = '20px';
    }

    async start() {
        try {
            console.log('Starting video capture...');
            const stream = await navigator.mediaDevices.getUserMedia({ 
                video: true,
                audio: false 
            });
            this.videoElement.srcObject = stream;
            document.body.appendChild(this.videoElement);
            
            // Wait for video to be ready
            await new Promise(resolve => {
                this.videoElement.onloadedmetadata = resolve;
            });
            
            console.log('Video stream started successfully');
            
            // Start capturing frames every 5 seconds
            this.captureInterval = setInterval(() => this.captureFrame(), 5000);
        } catch (error) {
            console.error('Error accessing camera:', error);
        }
    }

    async captureFrame() {
        try {
            console.log('Capturing frame...');
            
            // Make sure video is playing and has valid dimensions
            if (this.videoElement.videoWidth === 0 || this.videoElement.videoHeight === 0) {
                console.error('Video dimensions not ready');
                return;
            }

            // Set canvas size to match video dimensions
            this.canvas.width = this.videoElement.videoWidth;
            this.canvas.height = this.videoElement.videoHeight;
            
            // Draw current video frame to canvas
            const ctx = this.canvas.getContext('2d');
            ctx.drawImage(this.videoElement, 0, 0);
            //check if canvas is empty
            if (this.canvas.toDataURL('image/jpeg', 0.8).split(',')[1] === 'data:image/jpeg;base64,') {
                console.log('Canvas is empty');
                return;
            }

            // Get base64 image data directly
            const base64Image = this.canvas.toDataURL('image/jpeg', 0.8).split(',')[1];

            // Debug logging for base64 image
            console.log('Base64 image length:', base64Image.length);

            //check if base64Image is empty
            if (base64Image === 'data:image/jpeg;base64,') {
                console.log('Base64 image is empty');
                return;
            }


            // Send base64 image directly for analysis
            const analysisResponse = await fetch('/analyze-image', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    image: base64Image
                })
            });

            console.log('Response status:', analysisResponse.status);
            const responseData = await analysisResponse.json();
            
            if (!analysisResponse.ok) {
                console.error('Error response:', responseData);
                throw new Error(`Failed to analyze image: ${responseData.error} ${responseData.details || ''}`);
            }

            console.log('Image analysis:', responseData.choices[0].message.content);
            this.displayAnalysis(responseData.choices[0].message.content);

        } catch (error) {
            console.error('Detailed error capturing/analyzing frame:', error);
            // Optionally display error to user
            this.displayAnalysis(`Error: ${error.message}`);
        }
    }

    displayAnalysis(analysisText) {
        // Create or update analysis display
        let analysisDiv = document.getElementById('analysis-result');
        if (!analysisDiv) {
            analysisDiv = document.createElement('div');
            analysisDiv.id = 'analysis-result';
            document.body.appendChild(analysisDiv);
        }
        analysisDiv.textContent = `Analysis: ${analysisText}`;
    }

    stop() {
        console.log('Stopping video capture...');
        if (this.captureInterval) {
            clearInterval(this.captureInterval);
            this.captureInterval = null;
        }
        if (this.videoElement.srcObject) {
            this.videoElement.srcObject.getTracks().forEach(track => track.stop());
        }
        this.videoElement.remove();
        console.log('Video capture stopped');
    }
}